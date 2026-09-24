-- ============================================================
-- 0076 — La devolución por cancelar a tiempo tiene tope, y el recupero
--        manual se apaga
--
-- Lo pidió el estudio el 23/09, por Matías:
--
--   "las clases que puede cancelar y se le devuelve, que lo haga
--    automáticamente pero hasta 2 veces por mes, si es antes de 3 horas.
--    Si pierde la clase o no cancela a tiempo, puede cancelar pero no se
--    recupera: cancela o directamente no va, pierde esa clase."
--
-- Dos cambios, entonces: un techo a lo que hoy es ilimitado, y el fin del
-- recupero que el mostrador cargaba a mano.
--
-- POR QUÉ SE SELLA Y NO SE CUENTA
--
-- Lo natural parecía contarlo en `consumo_contadas`: "de las canceladas
-- en plazo de este período, las primeras dos no cuentan". No sirve, y el
-- motivo es de fondo: esa función mira el ESTADO ACTUAL de las filas, no
-- lleva registro de lo que pasó. Con el tope contado ahí, cancelar y
-- volver a anotarse devolvía el cupo, y la clienta reciclaba sus dos
-- devoluciones las veces que quisiera. Repetible y en silencio.
--
-- El otro candidato era ordenar por `cancelled_at` y regalar las dos
-- primeras. Peor: esa columna la escribe la clienta —`reservations_stamp`
-- hace `coalesce(new.cancelled_at, now())` y la 0072 no la clava—, así
-- que mandando la fecha que quisiera elegía cuáles de sus cancelaciones
-- se le devolvían. Es el mismo agujero que la 0072 cerró en `cancel_kind`,
-- en otra columna.
--
-- Así que la decisión se toma UNA VEZ, en el momento de cancelar, y queda
-- sellada en la fila con un tercer valor de `cancel_kind`:
--
--   'en plazo'           → avisó a tiempo y le quedaba cupo. La clase vuelve.
--   'en plazo sin cupo'  → avisó a tiempo pero ya gastó sus devoluciones.
--   'fuera de plazo'     → avisó tarde.
--   null                 → el estudio suspendió la clase. No se le cuenta.
--
-- `cancel_kind` es de las columnas que la 0072 le clava a la clienta en el
-- update, así que este sello hereda ese blindaje sin agregar nada.
--
-- Y si reactiva una que le habían devuelto, la 0072 le limpia el
-- `cancel_kind` y el cupo queda libre otra vez. Es lo correcto: volvió a
-- tomar la clase, así que la devolución se deshizo.
--
-- EL TOPE NACE APAGADO
--
-- Mismo patrón que `recovery_max` en la 0046: la fila entra con
-- `rige = false` y hasta que alguien la encienda desde Configuración el
-- sistema se comporta como hasta hoy, con devoluciones sin límite. Así la
-- migración se puede correr sin cambiarle el saldo a nadie, verificar, y
-- recién entonces encender.
--
-- OJO CON ESTO AL ENCENDERLO: el tope sólo se aplica a las cancelaciones
-- NUEVAS. Las que ya están selladas no se tocan, y está bien que así sea
-- —nadie pierde hacia atrás una clase que el sistema le había devuelto—.
--
-- EL RECUPERO SE APAGA CON DOS UPDATES, NO CON UNO
--
-- `recovery_max` en 0 no alcanza: `clasesRecuperables` mira el flag `rige`
-- y no el valor, así que la Agenda seguiría ofreciendo el selector de
-- recuperación mientras la base lo rechaza. Y `rige = false` sola deja el
-- 2 escrito, que la pantalla de cancelar del portal usa para prometerle a
-- la clienta recuperaciones que ya no existen. Van los dos: valor en 0 y
-- rige en false.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. El número, donde el estudio lo puede cambiar
--
-- `group_key` 'reservas' y `sort_order` 21 para que caiga justo debajo del
-- plazo de cancelación, que es el parámetro con el que se lee de a pares:
-- "a tiempo son 3 horas" y "a tiempo te la devuelvo 2 veces".
-- ------------------------------------------------------------

insert into public.studio_settings
  (key, value, kind, options, label, help, group_key, sort_order, is_public, solo_admin, rige)
values (
  'cancel_free_max', '2', 'number', '{}',
  'Devoluciones por período',
  'Cuántas veces, dentro de una misma membresía, cancelar en plazo le devuelve la clase al plan. Pasado ese número puede cancelar igual —el lugar se libera para otra— pero la clase no vuelve. En 0, cancelar nunca devuelve.',
  'reservas', 21, false, false, false
)
on conflict (key) do nothing;

-- Devuelve el tope sólo si rige. NULL significa "sin tope": es lo que el
-- trigger interpreta como el comportamiento de siempre.
create or replace function public.devoluciones_tope()
returns int
language sql stable security definer set search_path = ''
as $$
  select case when s.rige
              then coalesce(nullif(s.value, '')::int, 0)
              else null end
    from public.studio_settings s
   where s.key = 'cancel_free_max'
$$;

revoke all on function public.devoluciones_tope() from public, anon;
grant execute on function public.devoluciones_tope() to authenticated;

-- ------------------------------------------------------------
-- 2. El tercer valor de cancel_kind
-- ------------------------------------------------------------

alter table public.reservations
  drop constraint if exists reservations_cancel_kind_check;

alter table public.reservations
  add constraint reservations_cancel_kind_check
  check (cancel_kind in ('en plazo', 'en plazo sin cupo', 'fuera de plazo'));

comment on column public.reservations.cancel_kind is
  'Cómo se clasificó la cancelación, sellado por consumir_clase: en plazo (vuelve), en plazo sin cupo (avisó a tiempo pero gastó sus devoluciones), fuera de plazo (no vuelve). Null = el estudio suspendió la clase.';

-- ------------------------------------------------------------
-- 3. La que cobra: una cancelada sin cupo se cobra igual
--
-- El cuerpo es el de la 0046 con una sola condición cambiada — de
-- `= 'fuera de plazo'` a `in ('fuera de plazo', 'en plazo sin cupo')`.
-- ------------------------------------------------------------

create or replace function public.consumo_contadas(p_membership uuid)
returns int
language sql stable security definer set search_path = ''
as $$
  select count(*)::int
  from public.reservations r
  where r.membership_id = p_membership
    and r.recovers_reservation_id is null
    and not exists (
      select 1 from public.class_occurrences o
      where o.class_id = r.class_id and o.date = r.date and o.status = 'suspendida'
    )
    and (
      r.status in ('confirmada', 'asistió')
      or (r.status = 'ausente' and coalesce(
            (select s.value = 'true' from public.studio_settings s
             where s.key = 'absence_consumes_class'), true))
      or (r.status = 'cancelada' and r.cancel_kind in ('fuera de plazo', 'en plazo sin cupo'))
    )
$$;

revoke all on function public.consumo_contadas(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4. El trigger que sella, con el cupo adentro
--
-- El cuerpo es el de la 0072 con dos variables nuevas y la clasificación
-- de la cancelación reescrita. Se generó envolviendo el texto de esa
-- migración, no transcribiéndolo.
-- ------------------------------------------------------------

create or replace function public.consumir_clase()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_toma     boolean;   -- ¿esta escritura toma un lugar?
  v_marca    boolean;   -- ¿se está marcando asistencia?
  v_exc      boolean;   -- ¿viene con una excepción autorizada?
  v_mem      uuid;
  v_total    int;
  v_usadas   int;
  v_horas    numeric;
  v_inicio   timestamptz;
  v_susp     boolean;
  v_rec      public.reservations%rowtype;
  v_topes    int;
  v_hechos   int;
  v_desde    date;
  v_hasta    date;
  v_tope     int;      -- devoluciones con cupo por período (0076); null = sin tope
  v_dev      int;      -- cuántas lleva devueltas en este período
begin
  -- ── EL BLINDAJE DE COLUMNAS VA PRIMERO (0072) ────────────────────
  --
  -- Antes estaba debajo de `if not consumo_rige() then return new`, o sea
  -- que el interruptor de pánico de Configuración —pensado para apagar el
  -- descuento de clases— apagaba también esto. Con el motor apagado, la
  -- política "alumno cancela" deja a la clienta escribir cualquier
  -- columna de su propia fila, `student_id` incluido. El freno de mano no
  -- puede abrir una puerta.
  v_marca := tg_op = 'UPDATE' and new.status in ('asistió', 'ausente')
             and old.status is distinct from new.status;

  if tg_op = 'UPDATE' then
    -- La identidad de la reserva NO se mueve en un update, y esto no es
    -- cosmético: desde la 0029 date, class_id y start_time deciden si la
    -- clase se pierde o vuelve. La política "alumno cancela" (0005:75-78)
    -- deja a la alumna escribir sus propias filas y NO restringe
    -- columnas, así que sin esto puede mandar start_time = '23:59' junto
    -- con la cancelación y convertir un aviso tardío en uno en plazo.
    -- Ningún camino legítimo del código escribe estas columnas en un
    -- update: el único que existe es .update({ status }).
    new.student_id := old.student_id;
    new.class_id   := old.class_id;
    new.date       := old.date;
    new.membership_id := old.membership_id;
    -- Las tres de la 0046, por el mismo motivo: son las que deciden si
    -- la clase se cobra o se regala, y se fijan al crear la reserva.
    new.recovers_reservation_id := old.recovers_reservation_id;
    new.override_by     := old.override_by;
    new.override_reason := old.override_reason;
    -- start_time solo lo refresca reservations_stamp al marcar asistencia,
    -- que corre después de este trigger.
    if not v_marca then new.start_time := old.start_time; end if;
    -- Y la que faltaba, que es la que decide la plata de frente (0072):
    -- `cancel_kind` es lo único que `consumo_contadas` mira para saber si
    -- una cancelada se cobra. Sin clavarla, la clienta mandaba
    -- `{status:'cancelada', cancel_kind:'en plazo'}` sobre una reserva YA
    -- cancelada fuera de plazo: el status no cambia, así que la
    -- clasificación de abajo no vuelve a correr, y la clase que había
    -- perdido volvía a su plan. Repetible, y sin un solo aviso.
    --
    -- Cuando la fila deja de estar cancelada no hay plazo que contar, así
    -- que se limpia: `reactivar_reserva` (0031) no la toca y quedaba el
    -- plazo viejo pegado a una reserva confirmada.
    if new.status = 'cancelada' then
      new.cancel_kind := old.cancel_kind;
    else
      new.cancel_kind := null;
    end if;
  end if;

  -- El motor de consumo, después del blindaje.
  if not public.consumo_rige() then return new; end if;

  v_toma := new.status in ('confirmada', 'asistió');

  -- ---- Clasificar la cancelación ----
  if tg_op = 'UPDATE' and new.status = 'cancelada'
     and old.status is distinct from 'cancelada' then

    select exists (
      select 1 from public.class_occurrences o
      where o.class_id = new.class_id and o.date = new.date and o.status = 'suspendida'
    ) into v_susp;

    if v_susp then
      -- La suspensión manda sobre el reloj: si el estudio no la dictó, no
      -- importa a qué hora avisó la clienta.
      new.cancel_kind := null;
    else
      select coalesce(nullif(s.value, '')::numeric, 3) into v_horas
      from public.studio_settings s where s.key = 'cancel_hours';
      v_horas := coalesce(v_horas, 3);

      v_inicio := (new.date + coalesce(new.start_time, time '00:00'))
                    at time zone 'America/Argentina/Buenos_Aires';

      if now() > v_inicio - make_interval(mins => (v_horas * 60)::int) then
        new.cancel_kind := 'fuera de plazo';
      else
        -- EN PLAZO, PERO ¿LE QUEDA CUPO? (0076)
        --
        -- Se decide ACÁ y se sella en la fila, en vez de contarlo después
        -- en `consumo_contadas`: esa función mira el ESTADO ACTUAL de las
        -- reservas, y con el tope contado ahí, cancelar y volver a
        -- anotarse liberaba el cupo. La clienta podía reciclar sus dos
        -- devoluciones todas las veces que quisiera.
        --
        -- Sellado, no: la fila queda con lo que le tocó en el momento, y
        -- `cancel_kind` es de las columnas que la 0072 le clava a la
        -- clienta en el update, así que no puede reescribirlo.
        --
        -- Si reactiva una devuelta, su `cancel_kind` se limpia (0072) y el
        -- cupo vuelve a estar libre — que es lo correcto: volvió a tomar
        -- la clase, así que la devolución se deshizo.
        v_tope := public.devoluciones_tope();
        if v_tope is null or new.membership_id is null then
          -- Sin tope configurado —o sin período que descontar— se comporta
          -- como siempre: la clase vuelve.
          new.cancel_kind := 'en plazo';
        else
          select count(*) into v_dev
            from public.reservations r
           where r.membership_id = new.membership_id
             and r.id <> new.id
             and r.status = 'cancelada'
             and r.cancel_kind = 'en plazo';
          new.cancel_kind := case when v_dev < v_tope
            then 'en plazo' else 'en plazo sin cupo' end;
        end if;
      end if;
    end if;
  end if;

  -- ---- El recupero (0046) ----
  --
  -- Solo al crear: en un update la columna viene pineada de arriba.
  if tg_op = 'INSERT' and new.recovers_reservation_id is not null then

    if not public.recupero_rige() then
      raise exception
        'Las recuperaciones todavía no están habilitadas. Se encienden desde Configuración → Reservas.';
    end if;

    -- Lo carga una recepción, no la clienta desde el portal: el tope es
    -- una regla del estudio y quien lo aplica es quien atiende.
    if not public.can('reservas.crear') then
      raise exception 'No tenés permiso para registrar una recuperación.';
    end if;

    select * into v_rec from public.reservations
    where id = new.recovers_reservation_id;

    if not found or v_rec.student_id <> new.student_id then
      raise exception 'Esa clase perdida no es de este cliente.';
    end if;

    if not public.recupero_elegible(new.recovers_reservation_id) then
      raise exception
        'Esa clase no se puede recuperar: se recuperan las que perdió por cancelar tarde o faltar sin avisar, y solo una vez.';
    end if;

    -- El recupero vive dentro del período que pagó la clase perdida: las
    -- clases no se acumulan de un mes al otro, así que reponerla fuera
    -- de su membresía sería revivir una clase vencida.
    select m.start_date, m.end_date into v_desde, v_hasta
    from public.memberships m where m.id = v_rec.membership_id;

    if new.date < v_desde or new.date > v_hasta then
      raise exception
        'La recuperación tiene que caer dentro del período que pagó esa clase (% al %)',
        to_char(v_desde, 'DD/MM/YYYY'), to_char(v_hasta, 'DD/MM/YYYY');
    end if;

    v_topes := coalesce(nullif(public.param('recovery_max', '2'), '')::int, 2);

    select count(*)::int into v_hechos
    from public.reservations r
    where r.membership_id = v_rec.membership_id
      and r.recovers_reservation_id is not null
      and r.status <> 'cancelada';

    -- La frase se arma según el número porque el número lo elige el
    -- estudio: en 1 decía "Ya usó las 1 recuperaciones" y en 0 decía que
    -- usó las cero, cuando lo que pasa es que no permite ninguna.
    if v_hechos >= v_topes then
      raise exception '%', case
        when v_topes <= 0 then 'El estudio no permite recuperaciones. Se habilitan desde Configuración → Reservas.'
        when v_topes = 1  then 'Ya usó la recuperación de este período'
        else 'Ya usó las ' || v_topes || ' recuperaciones de este período'
      end;
    end if;

    -- Se paga con la membresía de la clase perdida, y `consumo_contadas`
    -- la excluye: la sella para poder contar el tope por período, no
    -- para volver a cobrarla.
    new.membership_id := v_rec.membership_id;
    new.override_by := null;
    new.override_reason := null;

    return new;
  end if;

  -- ---- Validar y sellar al tomar un lugar ----
  if v_toma and new.recovers_reservation_id is null
     and (tg_op = 'INSERT' or new.membership_id is null) then

    -- La excepción autorizada (0046). Pide las dos cosas: la clave y el
    -- motivo escrito. `override_by` lo pone la base con quien está
    -- logueado y nunca lo que mande el cliente.
    v_exc := new.override_reason is not null and btrim(new.override_reason) <> '';

    if v_exc and not public.can('reservas.excepcion') then
      raise exception 'No tenés permiso para autorizar una excepción.';
    end if;

    if not v_exc then
      new.override_by := null;
      new.override_reason := null;
    end if;

    v_mem := public.membresia_para(new.student_id, new.date);

    if v_mem is null then
      if not v_exc then
        raise exception
          'No tiene una membresía vigente para el % — asignale un plan antes de reservarle esa clase',
          to_char(new.date, 'DD/MM/YYYY');
      end if;
      -- Autorizada sin membresía: no hay a qué cobrársela.
      new.override_by := auth.uid();
      new.membership_id := null;
      return new;
    end if;

    select m.classes_total, m.classes_used_base + public.consumo_contadas(m.id)
    into v_total, v_usadas
    from public.memberships m where m.id = v_mem;

    if v_usadas >= v_total then
      if not v_exc then
        raise exception
          'Ya usó las % clases de su plan. Para anotarla igual, renovale la membresía o cambiale el plan',
          v_total;
      end if;
      -- Autorizada con el plan agotado: la clase va de más y no se
      -- descuenta, así el contador sigue diciendo "usó % de %".
      new.override_by := auth.uid();
      new.membership_id := null;
      return new;
    end if;

    -- Había lugar: la excepción no hacía falta, y guardarla igual dejaría
    -- una reserva común diciendo "autorizada por" en la ficha y en el
    -- portal. Se descarta y la reserva sigue el camino de siempre.
    new.override_by := null;
    new.override_reason := null;

    new.membership_id := v_mem;
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- 5. Se apaga el recupero manual
--
-- Los dos updates, por lo que explica el encabezado: el valor para que el
-- portal deje de prometerlo, y el flag para que la Agenda deje de
-- ofrecerlo. Las recuperaciones YA cargadas no se tocan: siguen con su
-- `recovers_reservation_id`, así que siguen sin consumir clase.
-- ------------------------------------------------------------

update public.studio_settings
   set value = '0',
       rige = false,
       help = 'Desactivado el 23/09 por decisión del estudio: una clase perdida no se repone. Quedó en cero y sin regir. Para volver a habilitarlo hay que poner el número y encenderlo.'
 where key = 'recovery_max';

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
-- 1. NADA CAMBIÓ TODAVÍA. El tope nace apagado, así que recién corrida la
--    migración ningún contador se mueve:
--
--    select * from public.consumo_control();
--    -- cero filas: los classes_used guardados siguen coincidiendo
--
--    select public.devoluciones_tope();
--    -- null, o sea "sin tope"
--
-- 2. Y el recupero ya está apagado: en la Agenda, con una clienta que
--    tenga una clase perdida, el selector "Tiene una clase perdida en
--    este período" NO tiene que aparecer.
--
-- 3. ENCENDER EL TOPE, desde Configuración → Reservas → "Devoluciones por
--    período", o a mano:
--
--    update public.studio_settings set rige = true where key = 'cancel_free_max';
--
-- 4. Con el tope encendido y en 2, ejercerlo desde el portal con la
--    sesión de una clienta: reservar cuatro clases de la semana que viene
--    y cancelarlas todas con más de 3 horas de anticipación.
--
--    select date, start_time, cancel_kind from public.reservations
--     where student_id = '<la clienta>' and status = 'cancelada'
--     order by cancelled_at;
--    -- las dos primeras 'en plazo', las dos siguientes 'en plazo sin cupo'
--
--    select classes_used from public.memberships where id = '<su período>';
--    -- tiene que haber subido 2, no 4: las dos sin cupo se cobran
--
-- 5. Y que el cupo NO se recicle, que es el punto de sellarlo:
--    volver a anotarse en una de las dos que quedaron 'sin cupo' y
--    cancelarla de nuevo en plazo. Tiene que salir otra vez 'en plazo sin
--    cupo' — no 'en plazo'—, porque las dos primeras siguen contadas.
--
-- PARA VOLVER ATRÁS
--
--   begin;
--   update public.studio_settings set rige = false where key = 'cancel_free_max';
--   update public.reservations set cancel_kind = 'en plazo'
--    where cancel_kind = 'en plazo sin cupo';
--   -- y recrear consumo_contadas y consumir_clase tal como están en la
--   -- 0046 y la 0072 respectivamente.
--   commit;
--
--   El update de las filas es el que importa: sin él, las canceladas sin
--   cupo se siguen cobrando aunque la función vuelva a la versión vieja,
--   porque el sello quedó escrito.
--
--   Y para reactivar el recupero:
--   update public.studio_settings set value = '2', rige = true where key = 'recovery_max';
-- ============================================================
