-- ============================================================
-- 0097 — Dar de baja a un cliente
--
-- EL PEDIDO (el estudio, vía Matías, 03/11)
--
-- "¿Qué posibilidad hay de que yo pueda eliminar clientes del sistema?
-- Hay varios que no van a venir y no quiero que se me mezclen con los
-- demás."
--
-- Lo que se construye es una BAJA, no un borrado. Cada ficha tiene atados
-- cobros, comprobantes, arqueos firmados y asistencias: borrarla haría que
-- la caja de esos días dejara de cuadrar y que los ingresos de meses
-- cerrados cambiaran para atrás. La baja es `active = false`, como todas
-- las del sistema (0013: "dar de baja es poner active en false"). Para la
-- clienta el efecto es el que pidió: la ficha sale de la lista, del
-- buscador y de los selectores, porque `fetchStudioData` sólo trae las
-- activas desde siempre. Y si vuelve, se reactiva con su historia y su
-- número de credencial.
--
-- Hasta ahora no había botón: la clave `alumnos.eliminar` existe desde la
-- 0012 ("hoy no hay botón de baja de alumna en la UI") y la restrictiva de
-- la 0013 la hace cumplir sobre `active`. Esta migración agrega lo que
-- faltaba para que la baja no deje cabos sueltos.
--
-- QUÉ HACE `dar_de_baja_cliente`, EN UNA SOLA TRANSACCIÓN
--
--   1. Cancela sus reservas de clases que todavía no empezaron (primero la
--      lista de espera, como el feriado de la 0093, para que cancelar las
--      confirmadas no le avise "se liberó un lugar" a ella misma). Las
--      confirmadas, al cancelarse, le avisan a quien espera ese lugar
--      (avisar_reserva, 0084): ese es el punto de liberarlas.
--   2. Libera sus turnos fijos, activos y pausados: un pausado le guarda
--      el lugar y nadie más lo puede tomar.
--   3. Anula las ofertas de renovación (0041): no son deuda, y el proceso
--      diario ya no le emite nuevas (saltea `active = false`).
--   4. Los períodos que todavía no empezaron y no están cobrados se
--      cancelan con su cuota: es un mes que no va a existir.
--   5. La cuota sin cobrar del período que corre SÍ es deuda: se anula
--      sólo si quien da la baja lo elige (`p_anular_deuda`). Hay clientes
--      que se van debiendo y el estudio puede querer seguir reclamándolo.
--   6. La ficha queda inactiva, con quién, cuándo y por qué.
--
-- Lo que NO toca: los cobros hechos, el período que corre (sigue con sus
-- fechas; si se reactiva antes de que termine, lo tiene igual) y un
-- período futuro ya cobrado (es plata recibida: se resuelve a mano, y la
-- función lo informa para que la pantalla lo diga).
--
-- Y UNA GUARDA: una ficha dada de baja no reserva ni toma un turno fijo.
-- La pantalla ya no la muestra, pero la base es la autoridad.
--
-- QUIÉN: `alumnos.eliminar` para las dos cosas, dar de baja y reactivar
-- (Clientes, en sombra: admin y recepción, lo que dice la matriz).
--
-- Ejecutar completo en el SQL Editor.
-- ============================================================

begin;

set local lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from public.permission_keys where clave = 'alumnos.eliminar') then
    raise exception 'Falta la clave alumnos.eliminar (0012). No se tocó nada.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'memberships'
                    and column_name = 'cancel_motivo') then
    raise exception 'Falta memberships.cancel_motivo. Revisar si corrió la 0070. No se tocó nada.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'payments'
                    and column_name = 'renueva_membresia_id') then
    raise exception 'Falta payments.renueva_membresia_id. Revisar si corrió la 0041. No se tocó nada.';
  end if;
  if to_regclass('public.fixed_slots') is null then
    raise exception 'Falta la tabla fixed_slots. Revisar si corrió la 0048. No se tocó nada.';
  end if;
end
$$;

-- ------------------------------------------------------------
-- 1. El rastro de la baja
--
-- En la ficha y no en una tabla aparte: es una sola baja viva por vez, y
-- la lista "De baja" de Clientes necesita leerla junto con el nombre.
-- Reactivar no lo borra: queda como la última baja que tuvo.
-- ------------------------------------------------------------
alter table public.students
  add column if not exists baja_at timestamptz,
  add column if not exists baja_motivo text,
  add column if not exists baja_by uuid references auth.users (id) on delete set null;

-- ------------------------------------------------------------
-- 2. Dar de baja
-- ------------------------------------------------------------
create or replace function public.dar_de_baja_cliente(
  p_student uuid,
  p_motivo text,
  p_anular_deuda boolean default true
)
returns table (
  reservas_canceladas int,
  turnos_liberados int,
  ofertas_anuladas int,
  periodos_cancelados int,
  deuda_anulada numeric,
  periodos_cobrados_futuros int
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_hoy     date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_hora    time := (now() at time zone 'America/Argentina/Buenos_Aires')::time;
  v_s       public.students;
  v_motivo  text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_nota    text;
  v_res     int := 0;
  v_n       int;
  v_turnos  int;
  v_ofertas int;
  v_per     int;
  v_deuda   numeric := 0;
  v_pagos   int;
begin
  if not public.can('alumnos.eliminar') then
    raise exception 'No tenés permiso para dar de baja a un cliente.';
  end if;

  select * into v_s from public.students where id = p_student for update;
  if not found then
    raise exception 'Esa ficha no existe.';
  end if;
  if not v_s.active then
    raise exception 'Esa ficha ya estaba dada de baja.';
  end if;

  v_nota := 'Anulado: se dio de baja' || coalesce(' — ' || v_motivo, '');

  -- 1. Reservas de clases que todavía no empezaron. La hora sale de la
  --    reserva (0029) y, si no la tiene, de la clase.
  update public.reservations r
     set status = 'cancelada'
    from public.class_sessions cs
   where cs.id = r.class_id
     and r.student_id = p_student
     and r.status in ('lista de espera', 'ofrecida')
     and (r.date > v_hoy or (r.date = v_hoy and coalesce(r.start_time, cs.start_time) > v_hora));
  get diagnostics v_n = row_count;
  v_res := v_n;

  update public.reservations r
     set status = 'cancelada'
    from public.class_sessions cs
   where cs.id = r.class_id
     and r.student_id = p_student
     and r.status = 'confirmada'
     and (r.date > v_hoy or (r.date = v_hoy and coalesce(r.start_time, cs.start_time) > v_hora));
  get diagnostics v_n = row_count;
  v_res := v_res + v_n;

  -- 2. Turnos fijos. El motivo lo lee el mostrador en el historial del
  --    horario.
  update public.fixed_slots
     set estado = 'liberado',
         motivo = 'Se dio de baja' || coalesce(' — ' || v_motivo, ''),
         liberado_at = now(),
         updated_by = auth.uid(),
         updated_at = now()
   where student_id = p_student
     and estado in ('activo', 'pausado');
  get diagnostics v_turnos = row_count;

  -- 3. Ofertas de renovación: no son deuda.
  update public.payments
     set status = 'anulado',
         notes = concat_ws(' · ', nullif(btrim(coalesce(notes, '')), ''), v_nota)
   where student_id = p_student
     and renueva_membresia_id is not null
     and status = 'pendiente';
  get diagnostics v_ofertas = row_count;

  -- 4. Períodos que no empezaron y no están cobrados: se cancelan con su
  --    cuota, como cancelar_membresia (0070).
  with canceladas as (
    update public.memberships m
       set status = 'cancelada',
           auto_renew = false,
           cancel_motivo = 'Se dio de baja' || coalesce(' — ' || v_motivo, ''),
           updated_at = now(),
           updated_by = auth.uid()
     where m.student_id = p_student
       and m.status = 'activa'
       and m.start_date > v_hoy
       and not exists (select 1 from public.payments p
                        where p.membership_id = m.id and p.status = 'pagado')
    returning m.id
  ), cuotas as (
    update public.payments p
       set status = 'anulado',
           notes = concat_ws(' · ', nullif(btrim(coalesce(p.notes, '')), ''), v_nota)
      from canceladas c
     where p.membership_id = c.id
       and p.status = 'pendiente'
    returning p.id
  )
  select (select count(*) from canceladas), (select count(*) from cuotas) into v_per, v_n;

  -- 5. La deuda que queda —la del período que corre o de uno vencido—,
  --    sólo si se eligió anularla.
  if p_anular_deuda then
    with anuladas as (
      update public.payments
         set status = 'anulado',
             notes = concat_ws(' · ', nullif(btrim(coalesce(notes, '')), ''), v_nota)
       where student_id = p_student
         and status = 'pendiente'
      returning amount
    )
    select coalesce(sum(amount), 0) into v_deuda from anuladas;
  end if;

  -- Un período futuro ya cobrado: no se toca, se informa.
  select count(*) into v_pagos
    from public.memberships m
   where m.student_id = p_student
     and m.status = 'activa'
     and m.start_date > v_hoy;

  -- 6. La ficha. La restrictiva "baja exige permiso" (0013) no corre acá
  --    (security definer), por eso el permiso se pidió arriba.
  update public.students
     set active = false,
         baja_at = now(),
         baja_motivo = v_motivo,
         baja_by = auth.uid()
   where id = p_student;

  return query select v_res, v_turnos, v_ofertas, v_per, v_deuda, v_pagos;
end;
$$;

revoke all on function public.dar_de_baja_cliente(uuid, text, boolean) from public, anon;
grant execute on function public.dar_de_baja_cliente(uuid, text, boolean) to authenticated;

comment on function public.dar_de_baja_cliente(uuid, text, boolean) is
  'Baja lógica de un cliente: libera sus reservas y turnos, anula lo que no es deuda (0097).';

-- ------------------------------------------------------------
-- 3. Reactivar
--
-- Sólo prende la ficha. Lo que la baja canceló no vuelve: las reservas y
-- los turnos ya pueden ser de otra persona, y si vuelve es para empezar
-- un plan nuevo.
-- ------------------------------------------------------------
create or replace function public.reactivar_cliente(p_student uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_s public.students;
begin
  if not public.can('alumnos.eliminar') then
    raise exception 'No tenés permiso para reactivar a un cliente.';
  end if;

  select * into v_s from public.students where id = p_student for update;
  if not found then
    raise exception 'Esa ficha no existe.';
  end if;
  if v_s.active then
    raise exception 'Esa ficha ya estaba activa.';
  end if;

  -- Una ficha duplicada que se unió a otra (pasó con Florencia) también está
  -- inactiva. Si la misma persona tiene otra ficha activa con el mismo
  -- DNI, reactivar esta volvería a partirla en dos.
  if nullif(btrim(coalesce(v_s.dni, '')), '') is not null and exists (
    select 1 from public.students x
     where x.id <> v_s.id and x.active
       and btrim(coalesce(x.dni, '')) = btrim(v_s.dni)
  ) then
    raise exception 'Ya hay una ficha activa con el DNI %: esta es un duplicado. Usá esa.', btrim(v_s.dni);
  end if;

  update public.students set active = true where id = p_student;
end;
$$;

revoke all on function public.reactivar_cliente(uuid) from public, anon;
grant execute on function public.reactivar_cliente(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. Una ficha de baja no reserva ni toma un turno fijo
--
-- Desde el portal no llega a intentarlo (no ve su ficha), y el mostrador
-- no la tiene en la lista. Pero la base es la autoridad.
-- ------------------------------------------------------------
create or replace function public.exigir_cliente_activo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.students s where s.id = new.student_id and not s.active) then
    raise exception 'Esa ficha está dada de baja: reactivala desde Clientes para anotarla.';
  end if;
  return new;
end;
$$;

revoke all on function public.exigir_cliente_activo() from public, anon, authenticated;

drop trigger if exists reservations_cliente_activo on public.reservations;
create trigger reservations_cliente_activo
  before insert on public.reservations
  for each row execute function public.exigir_cliente_activo();

drop trigger if exists fixed_slots_cliente_activo on public.fixed_slots;
create trigger fixed_slots_cliente_activo
  before insert on public.fixed_slots
  for each row execute function public.exigir_cliente_activo();

do $$
begin
  if has_function_privilege('anon', 'public.dar_de_baja_cliente(uuid, text, boolean)', 'execute')
     or has_function_privilege('anon', 'public.reactivar_cliente(uuid)', 'execute') then
    raise exception 'Una función quedó abierta para anon.';
  end if;
  if (select count(*) from public.perm_diff()) <> 0 then
    raise exception 'perm_diff no da cero. No se tocó nada.';
  end if;
end
$$;

commit;

select (select count(*) from public.students where not active) as fichas_de_baja,
       'dar_de_baja_cliente y reactivar_cliente' as funciones, 'listas' as estado;

-- ------------------------------------------------------------
-- VUELTA ATRÁS (no toca políticas):
--   drop trigger if exists reservations_cliente_activo on public.reservations;
--   drop trigger if exists fixed_slots_cliente_activo on public.fixed_slots;
--   drop function if exists public.exigir_cliente_activo();
--   drop function if exists public.dar_de_baja_cliente(uuid, text, boolean);
--   drop function if exists public.reactivar_cliente(uuid);
--   alter table public.students drop column if exists baja_at,
--     drop column if exists baja_motivo, drop column if exists baja_by;
-- ------------------------------------------------------------
