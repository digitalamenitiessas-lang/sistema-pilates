-- ============================================================
-- 0029 — La clase se descuenta al reservar
--
-- Hasta hoy el descuento lo hace el navegador al marcar asistencia, y no
-- hay nada que impida reservar de más: una clienta con plan de cuatro
-- clases puede anotarse en ocho. El estudio se entera cuando llega.
--
-- La clienta definió las reglas: la clase se descuenta AL RESERVAR,
-- cancelar con 3 horas la devuelve, cancelar más tarde o faltar sin
-- avisar la pierde, y si suspende Casa Fé no se pierde nada.
--
-- CÓMO CUENTA — esto es lo que hace que el doble cobro sea imposible
--
-- classes_used NO se suma ni se resta. Se RECALCULA: es un ancla más la
-- cantidad de reservas que ocupan un lugar. Aplicar dos veces la misma
-- operación da el mismo número, así que no hay forma de cobrar dos veces
-- ni de perder un descuento a mitad de camino. Es el mismo criterio del
-- libro de caja de la 0020: lo derivado no se desincroniza.
--
-- El ancla (classes_used_base) congela lo que el código viejo ya había
-- cobrado. Las reservas anteriores a esta migración no tienen membresía
-- atribuida, así que no entran en la cuenta nueva y nadie paga dos veces
-- por lo mismo.
--
-- QUÉ NO HACE, A PROPÓSITO
--
-- No lleva el tope de dos recuperos por mes ni devuelve la clase sola
-- cuando el estudio suspende un día con reservas ya canceladas. Eso lo
-- sigue haciendo recepción a mano, como hasta hoy. Se sacó del alcance
-- después de una revisión que le encontró diez agujeros a la versión
-- completa, a catorce días de que el estudio abra: cada automatismo de
-- más es una forma nueva de descontarle mal a una clienta real.
--
-- NACE APAGADA. No cambia absolutamente nada hasta que se corra el
-- bloque de ENCENDIDO del final, que va después de desplegar el código.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. El ancla
--
-- Lo que el código viejo ya cobró y no hay que volver a cobrar. Arranca
-- igual a classes_used, así que el día de la migración la cuenta da
-- exactamente lo mismo que antes.
-- ------------------------------------------------------------

alter table public.memberships
  add column if not exists classes_used_base int not null default 0;

update public.memberships set classes_used_base = classes_used;

comment on column public.memberships.classes_used_base is
  'Lo que se consumió antes de que el motor de la 0029 existiera. classes_used = este ancla + las reservas que ocupan lugar.';

-- ------------------------------------------------------------
-- 2. El interruptor
--
-- El motor mira `rige` de class_consumption (0024), no solo su valor.
-- Mientras esté apagado no valida ni descuenta: la migración se puede
-- correr tranquila y encender después, cuando el código ya esté arriba.
--
-- Y es el freno de mano: un update a esa fila detiene el motor entero
-- sin desplegar nada.
-- ------------------------------------------------------------

create or replace function public.consumo_rige()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select s.rige and s.value = 'reserva'
     from public.studio_settings s where s.key = 'class_consumption'),
    false)
$$;

-- ------------------------------------------------------------
-- 3. Qué membresía paga esta clase
--
-- La del día de la CLASE, no la de hoy: una reserva para el mes que
-- viene la paga la membresía que va a estar vigente ese día. Si hay más
-- de una, la que vence antes — se usa primero la que primero se pierde.
-- ------------------------------------------------------------

create or replace function public.membresia_para(p_student uuid, p_fecha date)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select m.id
  from public.memberships m
  where m.student_id = p_student
    and m.status = 'activa'
    and p_fecha between m.start_date and m.end_date
  order by m.end_date
  limit 1
$$;

-- ------------------------------------------------------------
-- 4. Cuántas clases ocupan lugar
--
-- Una reserva ocupa si la clienta se quedó con esa clase:
--   · confirmada y asistió, obvio
--   · ausente, si el estudio decidió que faltar sin avisar la consume
--   · cancelada FUERA de plazo: la perdió
-- No ocupa si:
--   · canceló en plazo, o sin clasificar (canceló antes de que la regla
--     existiera, o se la anuló a mano: en la duda, a favor de la clienta)
--   · está en lista de espera o con el lugar ofrecido: todavía no es suya
--   · ESE DÍA EL ESTUDIO SUSPENDIÓ LA CLASE
--
-- Lo último se deriva de class_occurrences en vez de guardarse, y por eso
-- la promesa "si suspende Casa Fé no perdés la clase" se cumple sola,
-- aunque nadie se acuerde de cancelar nada.
-- ------------------------------------------------------------

create or replace function public.consumo_contadas(p_membership uuid)
returns int
language sql stable security definer set search_path = ''
as $$
  select count(*)::int
  from public.reservations r
  where r.membership_id = p_membership
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

create or replace function public.consumo_recalcular(p_membership uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_membership is null then return; end if;
  update public.memberships m
  set classes_used = m.classes_used_base + public.consumo_contadas(p_membership)
  where m.id = p_membership;
end;
$$;

-- ------------------------------------------------------------
-- 5. Validar y sellar, al reservar
--
-- Va en un BEFORE porque tiene que poder rechazar antes de que la fila
-- exista. El nombre arranca con 'reservations_c' para que corra ANTES que
-- reservations_stamp (0022): Postgres dispara los BEFORE por orden
-- alfabético de nombre.
-- ------------------------------------------------------------

create or replace function public.consumir_clase()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_toma     boolean;   -- ¿esta escritura toma un lugar?
  v_marca    boolean;   -- ¿se está marcando asistencia?
  v_mem      uuid;
  v_total    int;
  v_usadas   int;
  v_horas    numeric;
  v_inicio   timestamptz;
  v_susp     boolean;
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

  -- ---- Validar y sellar al tomar un lugar ----
  if v_toma and (tg_op = 'INSERT' or new.membership_id is null) then
    v_mem := public.membresia_para(new.student_id, new.date);

    if v_mem is null then
      raise exception
        'No tiene una membresía vigente para el % — asignale un plan antes de reservarle esa clase',
        to_char(new.date, 'DD/MM/YYYY');
    end if;

    select m.classes_total, m.classes_used_base + public.consumo_contadas(m.id)
    into v_total, v_usadas
    from public.memberships m where m.id = v_mem;

    if v_usadas >= v_total then
      raise exception
        'Ya usó las % clases de su plan. Para anotarla igual, renovale la membresía o cambiale el plan',
        v_total;
    end if;

    new.membership_id := v_mem;
  end if;

  return new;
end;
$$;

drop trigger if exists reservations_consumo on public.reservations;
create trigger reservations_consumo
  before insert or update on public.reservations
  for each row execute function public.consumir_clase();

-- ------------------------------------------------------------
-- 6. Recalcular después de cada cambio
--
-- En un AFTER, y sobre la membresía vieja y la nueva: si una reserva
-- cambiara de membresía, las dos cuentas quedan bien.
-- ------------------------------------------------------------

create or replace function public.reservas_recalcular()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.consumo_rige() then return null; end if;
  if tg_op <> 'INSERT' then perform public.consumo_recalcular(old.membership_id); end if;
  if tg_op <> 'DELETE' then perform public.consumo_recalcular(new.membership_id); end if;
  return null;
end;
$$;

drop trigger if exists reservations_recalcular on public.reservations;
create trigger reservations_recalcular
  after insert or update or delete on public.reservations
  for each row execute function public.reservas_recalcular();

-- ------------------------------------------------------------
-- 7. Suspender y volver a dictar
--
-- Como la suspensión se deriva, suspender un día tiene que recalcular a
-- todas las que tenían reserva ese día — y volver a dictarlo también.
--
-- El DELETE importa tanto como el resto: en la aplicación, "Volver a
-- dictarla" borra la fila de la excepción (clearClassDate). Sin escuchar
-- el delete, las clases volverían a dictarse y las clientas seguirían sin
-- pagarlas.
-- ------------------------------------------------------------

create or replace function public.recalcular_fecha_de_clase()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_class uuid;
  v_fecha date;
  v_mem   uuid;
begin
  if not public.consumo_rige() then return null; end if;

  if tg_op = 'DELETE' then
    v_class := old.class_id; v_fecha := old.date;
  else
    v_class := new.class_id; v_fecha := new.date;
  end if;

  for v_mem in
    select distinct r.membership_id
    from public.reservations r
    where r.class_id = v_class and r.date = v_fecha and r.membership_id is not null
  loop
    perform public.consumo_recalcular(v_mem);
  end loop;

  return null;
end;
$$;

drop trigger if exists occurrences_recalcular on public.class_occurrences;
create trigger occurrences_recalcular
  after insert or update or delete on public.class_occurrences
  for each row execute function public.recalcular_fecha_de_clase();

-- ------------------------------------------------------------
-- 8. El control
--
-- Cero filas siempre. Cualquier fila acá es una membresía cuyo contador
-- no coincide con sus reservas, y eso no tendría que poder pasar.
-- ------------------------------------------------------------

create or replace function public.consumo_control()
returns table (membership_id uuid, alumna text, dice int, deberia int)
language sql stable security definer set search_path = ''
as $$
  select m.id, s.name, m.classes_used,
         m.classes_used_base + public.consumo_contadas(m.id)
  from public.memberships m
  join public.students s on s.id = m.student_id
  where m.classes_used <> m.classes_used_base + public.consumo_contadas(m.id)
$$;

commit;

-- ============================================================
-- CÓMO VERIFICAR — con el motor TODAVÍA APAGADO
--
--   select public.consumo_rige();                        → false
--   select * from public.perm_diff();                    → cero filas
--   select count(*) from public.memberships
--   where classes_used <> classes_used_base;             → 0
--
-- Y la pantalla haciendo exactamente lo mismo que antes: reservar, marcar
-- asistencia y deshacerla siguen funcionando como hasta ahora.
-- ============================================================

-- ============================================================
-- ORDEN DE DESPLIEGUE — importa, y el motivo es concreto
--
--   1. Correr esta migración. No cambia nada: nace apagada.
--   2. Desplegar el código que saca el descuento del navegador
--      (markAttendance y undoAttendance de lib/api.ts). Entre este paso y
--      el siguiente no descuenta nadie: el error queda a favor de la
--      clienta y se corrige solo al encender.
--   3. Correr el bloque de ENCENDIDO de abajo.
--
-- Al revés —encender antes de desplegar— el navegador y el trigger
-- descuentan los dos, y cada clase se cobra DOS VECES.
-- ============================================================

-- ============================================================
-- ENCENDIDO — correr entero, después del paso 2
--
--   begin;
--
--   -- Re-anclar: lo consumido hasta este instante queda congelado, y el
--   -- motor cuenta solo de acá en adelante.
--   update public.memberships set classes_used_base = classes_used;
--
--   update public.studio_settings set value = 'reserva',   rige = true where key = 'class_consumption';
--   update public.studio_settings set value = '3',         rige = true where key = 'cancel_hours';
--   update public.studio_settings set value = 'true',      rige = true where key = 'absence_consumes_class';
--
--   -- Tiene que dar cero. Si da algo, algo quedó mal y conviene abortar.
--   select * from public.consumo_control();
--
--   commit;
--
-- Después del encendido, probar con una clienta real:
--   · reservarle una clase        → sus disponibles bajan en una
--   · cancelarla con más de 3 hs  → vuelve
--   · cancelar otra con menos     → no vuelve
--   · reservarle de más           → la base la rechaza con el mensaje
--   · suspender esa fecha         → vuelve a todas las anotadas
--   · volver a dictarla           → se descuenta de nuevo
-- ============================================================

-- ============================================================
-- FRENO DE MANO
--
--   update public.studio_settings set rige = false where key = 'class_consumption';
--
-- El motor se detiene entero, sin desplegar nada: deja de validar y deja
-- de recalcular. Los contadores quedan como estaban.
-- ============================================================

-- ============================================================
-- LO QUE QUEDA A MANO, Y ESTÁ DECIDIDO ASÍ
--
-- · El tope de dos recuperos por mes. El sistema devuelve la clase cuando
--   se cancela en plazo; contar cuántas recuperó cada clienta lo lleva
--   recepción, como hasta hoy.
-- · Si el estudio suspende un día, las que ya habían cancelado esa clase
--   antes no recuperan solas: hay que reactivarles la reserva. Las que
--   tenían la reserva viva sí, automáticamente.
-- · Volver a anotarse en la MISMA clase que se canceló choca con
--   unique (student_id, class_id, date). Ya pasaba antes de esta
--   migración; se resuelve borrando la reserva cancelada y creándola de
--   nuevo desde recepción.
-- ============================================================

-- ============================================================
-- VUELTA ATRÁS (no ejecutar salvo que haga falta)
--
--   begin;
--   drop trigger if exists reservations_consumo on public.reservations;
--   drop trigger if exists reservations_recalcular on public.reservations;
--   drop trigger if exists occurrences_recalcular on public.class_occurrences;
--   drop function if exists public.consumir_clase();
--   drop function if exists public.reservas_recalcular();
--   drop function if exists public.recalcular_fecha_de_clase();
--   drop function if exists public.consumo_control();
--   drop function if exists public.consumo_recalcular(uuid);
--   drop function if exists public.consumo_contadas(uuid);
--   drop function if exists public.membresia_para(uuid, date);
--   drop function if exists public.consumo_rige();
--   update public.studio_settings set value = 'asistencia', rige = false where key = 'class_consumption';
--   alter table public.memberships drop column classes_used_base;
--   commit;
--
-- Y revertir el commit que saca markAttendance/undoAttendance, o nadie
-- vuelve a descontar.
-- ============================================================
