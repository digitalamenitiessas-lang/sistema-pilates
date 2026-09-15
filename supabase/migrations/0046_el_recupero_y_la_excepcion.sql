-- ============================================================
-- 0046 — El recupero, con su tope, y la excepción autorizada
--
-- Dos de los cuatro puntos que el estudio marcó sobre Agenda el 15/09.
-- Los otros dos —el plazo de 3 horas y el no show— ya andaban: la 0029
-- clasifica la cancelación contra `cancel_hours` y la clase se descuenta
-- al reservar, así que la que no avisa y no viene ya la perdió.
--
-- EL RECUPERO
--
-- Textual: "Máximo: 2 recuperaciones por período de membresía", y que el
-- sistema diferencie la clase recuperada de la habitual.
--
-- La 0022 dejó `recovers_reservation_id` y explicó por qué no hay un
-- estado 'recuperada': el puntero ya dice todo. Nunca se escribió. Esto
-- la pone a andar, le agrega el tope y la hace no cobrar dos veces.
--
-- Qué es un recupero: una clase que la clienta PERDIÓ y el estudio le
-- deja reponer en otro horario. Perdió = canceló fuera de plazo, o faltó
-- sin avisar. Nada más. Y eso NO es configurable, a propósito: cancelar
-- en plazo ya le devuelve la clase al contador (0029), así que dejar
-- recuperar también esa sería regalarle una clase cada vez que avisa a
-- tiempo. El tope sí se configura; qué se puede recuperar es una
-- invariante del motor de consumo, no una preferencia del estudio.
--
-- Y el recupero NO descuenta: la clase ya se descontó cuando se perdió.
-- Por eso `consumo_contadas` lo excluye — si no, la misma clase se
-- cobraría dos veces, que es justo lo que la 0029 se propuso hacer
-- imposible.
--
-- LA EXCEPCIÓN AUTORIZADA
--
-- Textual: "Permitir una excepción autorizada si la membresía está
-- vencida". La 0022 dejó `override_by` y `override_reason` para esto y
-- tampoco se escribieron nunca. Hoy el trigger de la 0029 rechaza sin
-- apelación: sin membresía vigente, o sin clases, no hay reserva.
--
-- La excepción es la puerta: con la clave y el motivo escrito, pasa. Y
-- **no consume**, ni siquiera cuando hay membresía. Si consumiera con el
-- plan agotado, `classes_used` pasaría a `classes_total` y la ficha
-- mostraría clases restantes en negativo. Así el contador sigue diciendo
-- la verdad —usó 4 de 4— y al lado queda la clase de más, con el nombre
-- de quien la autorizó y por qué.
--
-- QUÉ NO CAMBIA HOY
--
-- Las dos son inertes por construcción: sin `recovers_reservation_id` y
-- sin `override_reason`, el trigger hace exactamente lo de ayer. Y el
-- recupero además nace con el parámetro en `rige = false`, que es el
-- freno de mano: hasta encenderlo se rechaza con un mensaje claro.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. El tope, configurable
--
-- El estudio dijo 2. Va a la tabla y no al código para que el día que
-- sean 3 no haya que desplegar nada. Nace sin regir: el código que lo
-- ejerce se despliega después, y hasta entonces la pantalla avisa que
-- todavía no rige, como todos los de la 0024.
-- ------------------------------------------------------------

insert into public.studio_settings
  (key, value, kind, options, label, help, group_key, sort_order, is_public, rige)
values
  ('recovery_max',
   '2',
   'number',
   '{}',
   'Recuperaciones por período',
   'Cuántas clases perdidas puede reponer una clienta dentro de la misma membresía. Se recupera lo que perdió por cancelar tarde o faltar sin avisar: cancelar en plazo ya le devuelve la clase. En 0, no se permite ninguna.',
   'reservas',
   45,
   false,
   false)
on conflict (key) do nothing;

-- ------------------------------------------------------------
-- 2. El interruptor del recupero
--
-- Mismo patrón que `consumo_rige()` de la 0029: mira `rige`, no el
-- valor. Un update a esa fila enciende o apaga la función entera sin
-- tocar una línea de código.
-- ------------------------------------------------------------

create or replace function public.recupero_rige()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select s.rige from public.studio_settings s where s.key = 'recovery_max'),
    false)
$$;

revoke all on function public.recupero_rige() from public, anon;
grant execute on function public.recupero_rige() to authenticated;

-- ------------------------------------------------------------
-- 3. Una clase perdida se recupera una sola vez
--
-- La 0022 dejó el índice sobre esta columna, pero no único: dos reservas
-- podían apuntar a la misma clase perdida y reponerla dos veces. El
-- índice viejo se reemplaza porque el único ya sirve para buscar.
-- ------------------------------------------------------------

drop index if exists public.reservations_recupera_idx;

create unique index if not exists reservations_recupera_idx
  on public.reservations (recovers_reservation_id)
  where recovers_reservation_id is not null;

-- ------------------------------------------------------------
-- 4. Qué clase se puede recuperar
--
-- La que consumió y no se usó. Los tres casos que la dejan afuera:
--   · cancelada en plazo o sin clasificar → la clase ya volvió al
--     contador, no hay nada que reponer
--   · ausente, si el estudio decidió que faltar no consume → ídem
--   · el estudio suspendió ese día → la 0029 no se la cobró nunca
--
-- Espeja `consumo_contadas` al revés, y a propósito: si mañana cambia
-- qué consume, las dos tienen que cambiar juntas o aparece el doble
-- cobro por la puerta de atrás.
-- ------------------------------------------------------------

create or replace function public.recupero_elegible(p_reserva uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.reservations r
    where r.id = p_reserva
      and r.recovers_reservation_id is null       -- un recupero no se recupera
      and r.membership_id is not null
      and not exists (
        select 1 from public.class_occurrences o
        where o.class_id = r.class_id and o.date = r.date and o.status = 'suspendida'
      )
      and (
        (r.status = 'cancelada' and r.cancel_kind = 'fuera de plazo')
        or (r.status = 'ausente' and coalesce(
              (select s.value = 'true' from public.studio_settings s
               where s.key = 'absence_consumes_class'), true))
      )
      -- y que no se la haya repuesto ya
      and not exists (
        select 1 from public.reservations x
        where x.recovers_reservation_id = r.id
      )
  )
$$;

revoke all on function public.recupero_elegible(uuid) from public, anon;
grant execute on function public.recupero_elegible(uuid) to authenticated;

-- ------------------------------------------------------------
-- 5. El recupero no vuelve a descontar
--
-- Único cambio sobre la versión de la 0029: la línea del
-- `recovers_reservation_id`. La clase que este recupero repone ya está
-- contada más arriba —sigue siendo 'cancelada fuera de plazo' o
-- 'ausente'—, así que contar también el recupero sería cobrarla dos
-- veces. El resto queda palabra por palabra.
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
      or (r.status = 'cancelada' and r.cancel_kind = 'fuera de plazo')
    )
$$;

-- ------------------------------------------------------------
-- 6. El motor, con las dos puertas nuevas
--
-- Sobre la versión de la 0029. Tres cambios:
--
--   a. El update pinea tres columnas más. La política "alumno cancela"
--      (0005:75-78) deja a la clienta escribir sus propias filas sin
--      restringir columnas: sin esto, desde el portal podría mandar un
--      `recovers_reservation_id` o un `override_reason` junto con la
--      cancelación. Es el mismo motivo por el que la 0029 pinea
--      student_id, class_id y date.
--
--   b. La rama del recupero, antes de la validación de saldo: sella la
--      membresía de la clase perdida y no valida saldo, porque no toma
--      un lugar nuevo.
--
--   c. La excepción autorizada, dentro de la validación: con la clave y
--      el motivo, en vez de rechazar deja pasar sin sellar membresía.
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
begin
  if not public.consumo_rige() then return new; end if;

  v_toma  := new.status in ('confirmada', 'asistió');
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
  end if;

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

      new.cancel_kind := case
        when now() <= v_inicio - make_interval(mins => (v_horas * 60)::int)
        then 'en plazo' else 'fuera de plazo' end;
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
-- 7. La clave de la excepción
--
-- Va al catálogo con el patrón de la 0019: `legacy_roles` con lo que el
-- sistema respondería si la clave hubiera existido, y la matriz sembrada
-- desde ahí, así `perm_diff()` sigue dando cero filas.
-- ------------------------------------------------------------

insert into public.permission_keys
  (clave, etiqueta, ayuda, grupo, orden, tipo, legacy_roles)
values
  ('reservas.excepcion', 'Autorizar una excepción',
   'Anotar a un cliente aunque su membresía esté vencida o ya haya usado todas sus clases. Pide un motivo escrito, queda el nombre de quien autorizó, y esa clase no se descuenta de ningún plan. El cliente ve el motivo desde su portal.',
   'Reservas', 65, 'permiso', '{admin,recepcion}')
on conflict (clave) do nothing;

insert into public.role_permissions (role, clave)
select unnest(k.legacy_roles), k.clave
from public.permission_keys k
where k.clave = 'reservas.excepcion'
on conflict do nothing;

commit;

-- ============================================================
-- ENCENDIDO — después de desplegar el código
--
-- Hasta acá no cambió nada: sin `recovers_reservation_id` y sin
-- `override_reason` el trigger hace lo mismo de ayer, y el recupero
-- además está frenado por `rige = false`.
--
--   update public.studio_settings set rige = true where key = 'recovery_max';
--
-- ============================================================
-- CÓMO VERIFICAR
--
-- 1. El tope aparece en Configuración → Reservas, en 2, diciendo que
--    todavía no rige. Después del encendido, deja de decirlo.
--
-- 2. La clave nueva aparece en la matriz, tildada para Admin y Recepción:
--
--      select * from public.perm_diff();        → cero filas
--
-- 3. Una clase perdida se ofrece una sola vez:
--
--      select r.id, r.date, r.status, r.cancel_kind,
--             public.recupero_elegible(r.id) as se_puede
--      from public.reservations r
--      where r.status in ('ausente', 'cancelada')
--      order by r.date desc;
--
-- 4. El recupero no cobra dos veces. Sobre una membresía con un recupero
--    cargado, los dos números tienen que dar igual:
--
--      select m.id, m.classes_used,
--             m.classes_used_base + public.consumo_contadas(m.id) as recalculado
--      from public.memberships m where m.status = 'activa';
--
-- ============================================================
-- PARA VOLVER ATRÁS
--
-- Las dos funciones vuelven a su cuerpo de la 0029 (el recupero deja de
-- excluirse del conteo y el motor pierde las dos puertas), y el tope y
-- la clave se van. Las columnas son de la 0022 y no se tocan.
--
--   begin;
--   delete from public.role_permissions where clave = 'reservas.excepcion';
--   delete from public.permission_keys   where clave = 'reservas.excepcion';
--   delete from public.studio_settings   where key   = 'recovery_max';
--   drop function if exists public.recupero_elegible(uuid);
--   drop function if exists public.recupero_rige();
--   drop index if exists public.reservations_recupera_idx;
--   create index reservations_recupera_idx
--     on public.reservations (recovers_reservation_id)
--     where recovers_reservation_id is not null;
--   -- y volver a correr los bloques 4 y 5 de la 0029 tal cual están ahí
--   commit;
-- ============================================================
