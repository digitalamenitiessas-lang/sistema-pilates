-- ============================================================
-- 0022 — La reserva toma la forma que le falta
--
-- Hoy una reserva tiene seis columnas: quién, qué clase, qué día, en qué
-- estado, y cuándo se creó. Alcanza para reservar y no alcanza para nada
-- más de lo que pide la sección 1 del documento:
--
--   1.9  quién la agregó
--   1.11 con qué autorización se agregó una excepción
--   1.13 si la cancelación fue dentro o fuera de plazo, y el recupero
--   1.15 la asistencia asociada a su horario, su profesora y quién la marcó
--   A1.3 la oferta del lugar liberado con tiempo límite
--
-- Todas esas piezas son triggers, y todos los triggers escriben columnas.
-- Por eso las columnas van juntas y primero: si se agregaran de a una,
-- cada migración posterior arrancaría con un `alter table`, y el CHECK de
-- estado se ampliaría tres veces — y cada ampliación obliga a tocar
-- lib/types.ts, STATUS_CONFIG y los filtros de reservas-page.tsx.
--
-- Esta migración NO cambia ningún comportamiento. Agrega columnas vacías,
-- un estado que todavía nadie escribe, y un trigger de sellado que
-- completa la autoría. Después de correrla el sistema hace exactamente lo
-- mismo que antes, con más datos guardados.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Por qué la cancelación NO es un estado nuevo
--
-- La tentación era agregar 'cancelada en plazo' y 'cancelada fuera de
-- plazo' al CHECK. Sería un error, y de los que rompen producción sin
-- que perm_diff() diga nada:
--
--   · "alumno cancela" (0005:76-78) tiene `with check (status =
--     'cancelada')`. El WITH CHECK de una política se evalúa DESPUÉS de
--     los triggers BEFORE ROW, así que un trigger que reescriba el
--     estado deja a la alumna sin poder cancelar desde el portal. El
--     problema aparece recién cuando una alumna lo intenta.
--
--   · "anular y asistencia exigen permiso" (0013:264-278) decide por el
--     estado nuevo: 'cancelada' exige reservas.anular, y CUALQUIER OTRO
--     estado cae en la rama else, que solo exige reservas.editar. Un
--     estado de cancelación con otro nombre es una cancelación que
--     dejó de pedir permiso para anular.
--
-- Entonces el estado sigue siendo 'cancelada' —lo que la política, la
-- pantalla y los filtros ya entienden— y el matiz va en su propia
-- columna. Menos ruido, cero riesgo, y la información es la misma.
-- ------------------------------------------------------------

alter table public.reservations
  -- Lo llena el trigger de clasificación (migración siguiente) comparando
  -- el momento de la cancelación contra el horario de la clase menos
  -- cancel_hours. Nulo = cancelada antes de que existiera la regla, o a
  -- mano por el estudio sin clasificar.
  add column cancel_kind text
    check (cancel_kind in ('en plazo', 'fuera de plazo')),
  add column cancelled_at timestamptz;

-- ------------------------------------------------------------
-- 2. 'ofrecida': el único estado que sí es nuevo
--
-- La lista de espera necesita un estado intermedio real. Cuando se
-- libera un lugar y se le ofrece a la primera de la lista, ese lugar no
-- está libre (otra no puede llevárselo) ni confirmado (ella todavía no
-- dijo que sí). Eso no es ninguno de los cinco estados actuales.
--
-- Cae en la rama else de la política restrictiva, que pide
-- reservas.editar o ser la propia alumna: es exactamente lo que hace
-- falta para que ella confirme su oferta desde el portal.
--
-- ⚠ ATENCIÓN para quien haga el Agregado 1.3: enforce_class_capacity
--   (0018:118-123) cuenta `status in ('confirmada','asistió')`. Una
--   'ofrecida' NO cuenta, así que hoy el lugar reservado para la primera
--   de la lista se lo puede llevar otra. Mientras nadie escriba
--   'ofrecida' eso es inofensivo; el día que se escriba, hay que sumarla
--   a ese conteo y al de la vista class_occupancy (0005:121) EN LA MISMA
--   MIGRACIÓN, o el hold no existe.
-- ------------------------------------------------------------

-- El CHECK se creó inline en 0001, así que Postgres le puso un nombre
-- automático. Se busca por su definición en vez de confiar en el nombre.
do $$
declare v_nombre text;
begin
  select conname into v_nombre
  from pg_constraint
  where conrelid = 'public.reservations'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%confirmada%';

  if v_nombre is null then
    raise exception 'No se encontró el CHECK de status en reservations: revisar antes de seguir';
  end if;

  execute format('alter table public.reservations drop constraint %I', v_nombre);
end $$;

alter table public.reservations
  add constraint reservations_status_check
  check (status in (
    'confirmada',
    'cancelada',
    'lista de espera',
    'ofrecida',
    'asistió',
    'ausente'
  ));

-- ------------------------------------------------------------
-- 3. Quién hizo qué (1.9 y 1.15)
--
-- Nulo en las filas viejas significa "no se sabe", que es la verdad: se
-- crearon antes de que el sistema lo registrara. Por eso ninguna de
-- estas columnas tiene default: un default las llenaría con una fecha
-- de migración que no pasó nunca.
-- ------------------------------------------------------------

alter table public.reservations
  add column created_by uuid references auth.users (id),
  -- De dónde entró. NO lo manda el navegador: lo deduce el trigger del
  -- rol de quien inserta, porque un cliente puede mentir y la base no.
  add column source text
    check (source in ('portal', 'staff', 'profesor', 'sistema')),
  add column updated_by uuid references auth.users (id),
  add column updated_at timestamptz,
  -- Quién marcó la asistencia y cuándo. Separado de updated_by porque
  -- "quién dijo que esta alumna vino" es una pregunta distinta de "quién
  -- tocó la fila por última vez", y para liquidarle a la profesora
  -- importa la primera.
  add column marked_by uuid references auth.users (id),
  add column marked_at timestamptz;

-- ------------------------------------------------------------
-- 4. La foto del día (1.15)
--
-- El requerimiento pide que la asistencia quede asociada a su horario y
-- su profesora. Hoy eso se lee de class_sessions, o sea del horario y la
-- profesora de HOY: si mañana la clase cambia de hora, todo el historial
-- cambia con ella y la liquidación de la profesora sale mal.
--
-- Se copia al reservar y se refresca al marcar asistencia, que es el
-- momento en que el dato deja de ser una previsión y pasa a ser un
-- hecho. Si ese día hubo reemplazo, manda el de la instancia (0018).
-- ------------------------------------------------------------

alter table public.reservations
  add column start_time time,
  add column teacher_id uuid references public.teachers (id);

-- ------------------------------------------------------------
-- 5. Contra qué membresía se descontó (1.8)
--
-- Sin esto, devolver una clase es adivinar: si la alumna renovó entre
-- medio, se le devuelve a la membresía equivocada. La llena el trigger
-- de consumo de la migración siguiente.
-- ------------------------------------------------------------

alter table public.reservations
  add column membership_id uuid references public.memberships (id) on delete set null;

-- ------------------------------------------------------------
-- 6. El recupero (1.13)
--
-- Esta reserva repone a aquella. El puntero vive en la que recupera, no
-- en la recuperada, para que no haya ambigüedad sobre cuál es cuál.
--
-- Deliberadamente NO hay un estado 'recuperada': el puntero ya dice todo
-- lo que hay que saber, y los recuperos pendientes se derivan (canceladas
-- en plazo sin ninguna fila que las apunte) en vez de guardarse. Es el
-- mismo criterio del libro de caja: lo derivado no se desincroniza.
-- ------------------------------------------------------------

alter table public.reservations
  add column recovers_reservation_id uuid references public.reservations (id) on delete set null;

-- ------------------------------------------------------------
-- 7. La excepción autorizada (1.11)
--
-- Agregar a una alumna con la membresía vencida o sin clases va a estar
-- prohibido por el trigger de validación. Estas dos columnas son la
-- puerta: quien tenga la clave puede pasar, dejando el motivo escrito.
--
-- Nota de privacidad: RLS filtra filas, no columnas, y la alumna lee sus
-- propias reservas con select('*') desde el portal. O sea que va a ver
-- su propio override_reason. Se escribe pensando en eso — como el motivo
-- de suspensión de 0018 — y no se usa para notas internas sobre ella.
-- ------------------------------------------------------------

alter table public.reservations
  add column override_by uuid references auth.users (id),
  add column override_reason text;

-- ------------------------------------------------------------
-- 8. El vencimiento de la oferta (A1.3)
-- ------------------------------------------------------------

alter table public.reservations
  add column offer_expires_at timestamptz;

-- ------------------------------------------------------------
-- 9. Índices
--
-- Parciales los tres primeros: las columnas están casi siempre en nulo y
-- un índice completo sería casi todo aire.
-- ------------------------------------------------------------

create index reservations_oferta_idx
  on public.reservations (offer_expires_at)
  where status = 'ofrecida';

create index reservations_recupera_idx
  on public.reservations (recovers_reservation_id)
  where recovers_reservation_id is not null;

create index reservations_membresia_idx
  on public.reservations (membership_id)
  where membership_id is not null;

-- Para "las clases que di" de la profesora y para la liquidación por
-- período de la sección 12.
create index reservations_profesora_idx
  on public.reservations (teacher_id, date);

-- ------------------------------------------------------------
-- 10. El sellado
--
-- Copia el patrón de stamp_class_occurrence (0018:70-86) y le agrega la
-- foto del día y el origen. Vive en la base y no en el cliente para que
-- valga igual desde el portal, desde la agenda, desde la pantalla de
-- asistencia y desde cualquier proceso que venga después, sin que
-- ninguno tenga que acordarse de mandar los campos.
-- ------------------------------------------------------------

create or replace function public.stamp_reservation()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_rol      text;
  v_hora     time;
  v_prof     uuid;
  v_exc_hora time;
  v_exc_prof uuid;
  -- Se saca la foto al crear y al marcar asistencia. Con una bandera y
  -- no con un `or` en la condición: el OR de SQL no garantiza evaluación
  -- perezosa, y en un INSERT no existe OLD.
  v_foto     boolean := false;
begin
  if tg_op = 'INSERT' then
    new.created_by := v_uid;

    -- El origen se deduce del rol de quien inserta. Sin sesión es el
    -- service role: el cron y el webhook de Mercado Pago entran por ahí.
    if v_uid is null then
      new.source := 'sistema';
    else
      select p.role into v_rol from public.profiles p where p.id = v_uid;
      new.source := case v_rol
        when 'alumno'   then 'portal'
        when 'profesor' then 'profesor'
        else 'staff'
      end;
    end if;

    v_foto := true;

  else
    new.updated_by := v_uid;
    new.updated_at := now();

    -- Entrar a un estado de asistencia: queda quién lo dijo, y se
    -- refresca la foto del día porque recién ahora es un hecho.
    if new.status in ('asistió', 'ausente')
       and old.status is distinct from new.status then
      new.marked_by := v_uid;
      new.marked_at := now();
      v_foto := true;
    end if;

    -- Deshacer un presente (undoAttendance en lib/api.ts) tiene que
    -- borrar la firma, o queda diciendo que alguien la marcó.
    if old.status in ('asistió', 'ausente')
       and new.status not in ('asistió', 'ausente') then
      new.marked_by := null;
      new.marked_at := null;
    end if;

    if new.status = 'cancelada' and old.status is distinct from 'cancelada' then
      new.cancelled_at := coalesce(new.cancelled_at, now());
    end if;

    -- Volver atrás una cancelación limpia su rastro; si no, una reserva
    -- confirmada queda con fecha y motivo de cancelación.
    if old.status = 'cancelada' and new.status <> 'cancelada' then
      new.cancelled_at := null;
      new.cancel_kind := null;
    end if;
  end if;

  if v_foto then
    select cs.start_time, cs.teacher_id into v_hora, v_prof
    from public.class_sessions cs
    where cs.id = new.class_id;

    -- Si ese día se apartó de la norma, manda la instancia. Va a
    -- variables propias: un `select into` que no encuentra fila deja los
    -- destinos en nulo, así que leerlo sobre v_hora/v_prof borraría los
    -- valores de la clase justo cuando no hay excepción, que es siempre.
    select co.start_time, co.teacher_id into v_exc_hora, v_exc_prof
    from public.class_occurrences co
    where co.class_id = new.class_id and co.date = new.date;

    new.start_time := coalesce(v_exc_hora, v_hora);
    new.teacher_id := coalesce(v_exc_prof, v_prof);
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- 11. Las filas que ya estaban
--
-- Se completa solo la foto del día, que es reconstruible: el horario y
-- la profesora de la clase, con el reemplazo de esa fecha si lo hubo.
-- La autoría NO se inventa — quién creó cada reserva vieja no lo sabe
-- nadie, y ponerle el admin de turno sería escribir un dato falso.
--
-- Va ANTES de crear el trigger a propósito: si el trigger ya estuviera,
-- este update sellaría cada fila vieja con updated_by y updated_at de
-- ahora, que es exactamente el dato falso que se está evitando.
-- ------------------------------------------------------------

update public.reservations r
set start_time = coalesce(
      (select co.start_time from public.class_occurrences co
        where co.class_id = r.class_id and co.date = r.date),
      (select cs.start_time from public.class_sessions cs where cs.id = r.class_id)),
    teacher_id = coalesce(
      (select co.teacher_id from public.class_occurrences co
        where co.class_id = r.class_id and co.date = r.date),
      (select cs.teacher_id from public.class_sessions cs where cs.id = r.class_id))
where r.start_time is null;

-- Recién ahora. Y con el drop adelante para que la migración se pueda
-- volver a pegar entera sin que falle por el trigger ya creado.
drop trigger if exists reservations_stamp on public.reservations;
create trigger reservations_stamp
  before insert or update on public.reservations
  for each row execute function public.stamp_reservation();

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
--   -- 1. Nada de permisos cambió
--   select * from public.perm_diff();               → cero filas
--
--   -- 2. La foto vieja quedó completa
--   select count(*) filter (where start_time is null) as sin_hora,
--          count(*) filter (where teacher_id is null) as sin_profe,
--          count(*) as total
--   from public.reservations;                       → sin_hora y sin_profe en 0
--
--   -- 3. El sellado anda: reservar desde la agenda y mirar la fila
--   select source, created_by, start_time, teacher_id
--   from public.reservations order by created_at desc limit 1;
--                                                   → source = 'staff'
--
--   -- 4. Marcar asistencia y volver a mirarla
--   select status, marked_by, marked_at from public.reservations
--   where id = '<esa>';                             → marked_by con el uid
--
--   -- 5. Deshacer el presente
--                                                   → marked_by vuelve a null
--
-- Y en la pantalla: la agenda, el portal y tomar asistencia siguen
-- haciendo lo mismo que antes. Esta migración no cambia comportamiento.
-- ============================================================

-- ============================================================
-- VUELTA ATRÁS (no ejecutar salvo que haga falta)
--
--   begin;
--
--   drop trigger if exists reservations_stamp on public.reservations;
--   drop function if exists public.stamp_reservation();
--
--   drop index if exists public.reservations_oferta_idx;
--   drop index if exists public.reservations_recupera_idx;
--   drop index if exists public.reservations_membresia_idx;
--   drop index if exists public.reservations_profesora_idx;
--
--   alter table public.reservations drop constraint reservations_status_check;
--   -- Si alguna fila quedó en 'ofrecida' hay que resolverla antes, o el
--   -- CHECK viejo no se puede volver a poner.
--   update public.reservations set status = 'lista de espera'
--   where status = 'ofrecida';
--   alter table public.reservations add constraint reservations_status_check
--     check (status in ('confirmada','cancelada','lista de espera','asistió','ausente'));
--
--   alter table public.reservations
--     drop column cancel_kind,
--     drop column cancelled_at,
--     drop column created_by,
--     drop column source,
--     drop column updated_by,
--     drop column updated_at,
--     drop column marked_by,
--     drop column marked_at,
--     drop column start_time,
--     drop column teacher_id,
--     drop column membership_id,
--     drop column recovers_reservation_id,
--     drop column override_by,
--     drop column override_reason,
--     drop column offer_expires_at;
--
--   commit;
-- ============================================================
