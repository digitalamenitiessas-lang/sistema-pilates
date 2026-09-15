-- ============================================================
-- 0048 — El turno fijo, que hasta hoy no existía
--
-- §2 de la devolución del estudio del 15/09, y lo primero que dice es lo
-- que importa: *"Los turnos fijos deben funcionar como una funcionalidad
-- propia y no simplemente como una reserva repetida."*
--
-- Tiene razón, y por eso hasta hoy no se podía hacer nada de lo que
-- pide. Una reserva es una fila por (cliente, clase, FECHA): existe el
-- martes 15 y el martes 22, pero no existe "los martes a las 18". No hay
-- turno fijo que cambiar, liberar ni consultar, porque no hay sujeto.
--
-- QUÉ ES UN TURNO FIJO ACÁ
--
-- Un derecho de la clienta sobre un día y hora de la grilla, mientras
-- mantenga la prioridad. Eso es todo. **No crea reservas.**
--
-- Y esa es la decisión que ordena la migración entera. La versión que
-- materializa el mes por adelantado arrastra tres problemas que esta no
-- tiene:
--
--   · el mes de cinco martes. Con 4 clases por semana y 5 martes, el
--     materializador genera una reserva que `consumir_clase` rechaza, y
--     el proceso se corta a la mitad del mes de alguien.
--   · la escala. `fetchStudioData` trae `reservations` entera, sin
--     filtro de fecha y sin límite, en cada ingreso.
--   · liberar un turno. Si liberar fuera cancelar reservas ya creadas,
--     la clienta entra al portal, toca la clase de siempre y se la lleva
--     de vuelta: `reactivar_reserva` es `security definer` y solo valida
--     que la fila esté cancelada.
--
-- Sin materializar, los tres desaparecen: no hay fila que sobre, no hay
-- fila que pese, y liberar es cambiar un estado de esta tabla, que la
-- clienta no puede escribir.
--
-- Ocho de los diez pedidos de §2 se resuelven así. Los otros dos —que
-- las reservas aparezcan solas cada semana— van después, con la
-- respuesta del estudio sobre los cinco martes, y se apoyan en esto.
--
-- LA PRIORIDAD NO SE GUARDA, SE DERIVA
--
-- El estudio la definió con un ejemplo: *"Membresía vence: 20/10. Hasta
-- el 20/10 conserva prioridad. Si no renueva, desde el 21/10 su turno
-- fijo puede liberarse."* O sea que cuelga de la fecha de vencimiento de
-- la membresía, más un día de gracia para renovar.
--
-- Guardarla sería copiar un dato que ya existe y que cambia solo cada
-- vez que renueva: al segundo mes estarían diciendo cosas distintas. Es
-- el mismo criterio del libro de caja de la 0020 y del recupero de la
-- 0046 — lo derivado no se desincroniza.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. El día de gracia, configurable
--
-- El estudio dijo uno. Va a la tabla porque es exactamente la clase de
-- número que se ajusta con la experiencia del mostrador: el día que
-- decida dar tres días para renovar antes de soltar el horario, es un
-- campo.
-- ------------------------------------------------------------

insert into public.studio_settings
  (key, value, kind, options, label, help, group_key, sort_order, is_public, rige)
values
  ('priority_grace_days',
   '1',
   'number',
   '{}',
   'Días de gracia del turno fijo',
   'Después de que vence la membresía, cuántos días conserva la prioridad sobre sus días y horarios fijos. En 1: vence el 19/10, conserva el turno hasta el 20/10, y desde el 21/10 se puede liberar.',
   'reservas',
   48,
   false,
   true)
on conflict (key) do nothing;

-- ------------------------------------------------------------
-- 2. La tabla
-- ------------------------------------------------------------

create table if not exists public.fixed_slots (
  id uuid primary key default gen_random_uuid(),

  student_id uuid not null references public.students (id) on delete cascade,

  -- Apunta a la clase de la grilla, no a un día y hora sueltos: si el
  -- estudio mueve esa clase de las 18 a las 18:30, el turno fijo se
  -- mueve con ella y no queda apuntando a un horario que ya no se dicta.
  class_id uuid not null references public.class_sessions (id) on delete cascade,

  desde date not null default current_date,

  -- 'activo'   → tiene el lugar
  -- 'liberado' → lo perdió o lo dejó; el lugar vuelve a estar disponible
  -- 'pausado'  → lo conserva sin usarlo (viaje, lesión). No lo ocupa
  --              para el cupo, pero nadie más se lo puede tomar.
  estado text not null default 'activo'
    check (estado in ('activo', 'liberado', 'pausado')),

  -- Por qué se liberó o se pausó. La clienta lo lee desde su portal, así
  -- que se escribe pensando en eso, como el motivo de la suspensión
  -- (0018) y el de la excepción (0046).
  motivo text,

  liberado_at timestamptz,

  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  updated_at timestamptz
);

-- Un cliente no puede tener dos turnos vivos en la misma clase. Parcial
-- porque los liberados sí se repiten: son el historial de ese horario, y
-- perderlo sería perder justo lo que explica por qué hoy está libre.
create unique index if not exists fixed_slots_vivo_idx
  on public.fixed_slots (class_id, student_id)
  where estado <> 'liberado';

create index if not exists fixed_slots_clase_idx
  on public.fixed_slots (class_id) where estado = 'activo';

create index if not exists fixed_slots_cliente_idx
  on public.fixed_slots (student_id) where estado <> 'liberado';

-- ------------------------------------------------------------
-- 3. Hasta cuándo conserva la prioridad
--
-- La membresía que más lejos llega, más los días de gracia. "La que más
-- lejos llega" y no "la de hoy": quien ya pagó el mes que viene tiene la
-- prioridad hasta el final de ese mes, que es el sentido de pagar antes.
--
-- Nulo = no tiene ninguna membresía, así que no tiene prioridad sobre
-- nada. El turno se le puede liberar hoy.
-- ------------------------------------------------------------

create or replace function public.prioridad_hasta(p_student uuid)
returns date
language sql stable security definer set search_path = ''
as $$
  select max(m.end_date)
         + coalesce(nullif(public.param('priority_grace_days', '1'), '')::int, 1)
  from public.memberships m
  where m.student_id = p_student
    and m.status = 'activa'
$$;

revoke all on function public.prioridad_hasta(uuid) from public, anon;
grant execute on function public.prioridad_hasta(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. El cupo, que lo hace cumplir la base
--
-- Ocho reformers son ocho lugares, y un turno fijo se los reserva todas
-- las semanas. Si se pudieran asignar nueve, el noveno descubre que no
-- tiene lugar recién la primera vez que viene.
--
-- Mismo criterio que el cupo de las reservas (0001): la pantalla puede
-- esconder el botón, pero quien dice que no es la base.
-- ------------------------------------------------------------

create or replace function public.guard_cupo_fijo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_cupo   int;
  v_tomados int;
  v_titulo text;
begin
  if new.estado <> 'activo' then return new; end if;

  select cs.capacity, cs.title into v_cupo, v_titulo
  from public.class_sessions cs where cs.id = new.class_id;

  select count(*) into v_tomados
  from public.fixed_slots f
  where f.class_id = new.class_id
    and f.estado = 'activo'
    and f.id <> new.id;

  if v_tomados >= coalesce(v_cupo, 0) then
    raise exception
      'No quedan lugares fijos en % — sus % lugares ya están tomados. Liberá uno antes de asignar este.',
      coalesce(v_titulo, 'esa clase'), v_cupo;
  end if;

  return new;
end;
$$;

drop trigger if exists fixed_slots_cupo on public.fixed_slots;
create trigger fixed_slots_cupo
  before insert or update on public.fixed_slots
  for each row execute function public.guard_cupo_fijo();

-- ------------------------------------------------------------
-- 5. El sello
--
-- Quién asignó y quién liberó cada turno. Liberar un horario es sacarle
-- a alguien un lugar que venía teniendo, y el mostrador va a preguntar
-- quién lo hizo.
-- ------------------------------------------------------------

create or replace function public.stamp_fixed_slot()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    new.updated_by := auth.uid();
    new.updated_at := now();

    -- La fecha de liberación se pone sola al entrar al estado, y se
    -- borra si el turno vuelve: si no, un turno reactivado queda
    -- diciendo que se liberó un día que ya no significa nada.
    if new.estado = 'liberado' and old.estado is distinct from 'liberado' then
      new.liberado_at := coalesce(new.liberado_at, now());
    elsif new.estado <> 'liberado' then
      new.liberado_at := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists fixed_slots_stamp on public.fixed_slots;
create trigger fixed_slots_stamp
  before insert or update on public.fixed_slots
  for each row execute function public.stamp_fixed_slot();

-- ------------------------------------------------------------
-- 6. Quién ocupa permanentemente cada horario
--
-- Es un pedido textual del estudio, y también lo que necesita la
-- pantalla para mostrar la ficha del cliente y la ocupación estructural
-- de la grilla — las dos leen de acá.
--
-- `security_invoker`: la vista no agrega permisos propios, aplica los de
-- las tablas de abajo. Sin esto, cualquiera que pudiera leer la vista
-- vería los turnos de todos, incluida una clienta desde el portal.
-- ------------------------------------------------------------

create or replace view public.turnos_fijos
with (security_invoker = on) as
select
  f.id,
  f.student_id,
  s.name              as student_name,
  f.class_id,
  cs.title            as class_title,
  cs.discipline,
  cs.day_of_week,
  cs.start_time,
  cs.capacity,
  cs.room,
  f.estado,
  f.desde,
  f.motivo,
  f.liberado_at,
  public.prioridad_hasta(f.student_id) as prioridad_hasta,
  -- Lo que el mostrador pregunta de verdad: ¿este lugar sigue siendo
  -- suyo hoy? Sin membresía, `prioridad_hasta` da nulo y esto da false.
  coalesce(public.prioridad_hasta(f.student_id) >= current_date, false) as con_prioridad
from public.fixed_slots f
join public.students s       on s.id = f.student_id
join public.class_sessions cs on cs.id = f.class_id;

comment on view public.turnos_fijos is
  'Los turnos fijos con la prioridad ya resuelta. La prioridad se deriva del vencimiento de la membresía (0048), no se guarda.';

-- ------------------------------------------------------------
-- 7. Quién puede qué
--
-- Las tres claves nacen con `legacy_roles` puesto en lo que el sistema
-- respondería si hubieran existido siempre, y la matriz se siembra desde
-- ahí: `perm_diff()` sigue dando cero. Mismo patrón que la 0019.
--
-- La profesora ve los turnos de sus clases —necesita saber quién va a
-- venir todas las semanas— y no los toca.
-- ------------------------------------------------------------

insert into public.permission_keys
  (clave, etiqueta, ayuda, grupo, orden, tipo, legacy_roles)
values
  ('turnos.ver', 'Ver los turnos fijos',
   'Quién tiene reservado cada día y horario de forma permanente, y hasta cuándo conserva la prioridad.',
   'Turnos fijos', 10, 'permiso', '{admin,recepcion,profesor}'),
  ('turnos.asignar', 'Asignar y cambiar turnos fijos',
   'Darle a un cliente un día y horario permanente, o moverlo a otro. El cupo lo controla la base: no se pueden asignar más lugares fijos que reformers tiene la sala.',
   'Turnos fijos', 20, 'permiso', '{admin,recepcion}'),
  ('turnos.liberar', 'Liberar un turno fijo',
   'Sacarle el lugar permanente a un cliente y dejarlo disponible. Pide un motivo, que el cliente ve desde su portal.',
   'Turnos fijos', 30, 'permiso', '{admin,recepcion}')
on conflict (clave) do nothing;

insert into public.role_permissions (role, clave)
select unnest(k.legacy_roles), k.clave
from public.permission_keys k
where k.clave in ('turnos.ver', 'turnos.asignar', 'turnos.liberar')
on conflict do nothing;

-- ------------------------------------------------------------
-- 8. Las políticas
--
-- La clienta lee los suyos y nada más, y eso NO es configurable: el
-- aislamiento del cliente es de las cuatro cosas que el motor de
-- permisos no gobierna.
-- ------------------------------------------------------------

alter table public.fixed_slots enable row level security;

create policy "turnos: ver" on public.fixed_slots for select
  using (
    (select public.can('turnos.ver'))
    or student_id in (select public.my_student_ids())
  );

create policy "turnos: asignar" on public.fixed_slots for insert
  with check ((select public.can('turnos.asignar')));

create policy "turnos: editar" on public.fixed_slots for update
  using ((select public.can('turnos.asignar')));

-- Liberar es un update a 'liberado', y lleva su propia clave: se puede
-- dejar que recepción asigne turnos sin poder sacárselos a nadie.
create policy "liberar exige permiso"
  on public.fixed_slots as restrictive for update
  using (true)
  with check (estado <> 'liberado' or (select public.can('turnos.liberar')));

-- Sin delete: un turno no se borra, se libera. El historial de un
-- horario es lo que explica por qué hoy está libre.

grant select on public.turnos_fijos to authenticated;

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
-- 1. Las tres claves aparecen en la matriz y no movieron nada:
--
--      select * from public.perm_diff();      → cero filas
--
-- 2. La prioridad sale de la membresía y no de esta tabla:
--
--      select s.name, m.end_date, public.prioridad_hasta(s.id) as prioridad
--      from public.students s
--      join public.memberships m on m.student_id = s.id and m.status = 'activa';
--
--    `prioridad` tiene que dar `end_date` + 1. Renovarle la membresía a
--    alguien corre su prioridad sin tocar `fixed_slots`.
--
-- 3. El cupo lo hace cumplir la base: asignar nueve turnos fijos a una
--    clase de ocho lugares falla en el noveno, con su mensaje.
--
-- 4. Una clienta desde el portal ve solo los suyos.
--
-- ============================================================
-- PARA VOLVER ATRÁS
--
--   begin;
--   drop view if exists public.turnos_fijos;
--   drop table if exists public.fixed_slots;          -- se lleva sus políticas
--   drop function if exists public.guard_cupo_fijo();
--   drop function if exists public.stamp_fixed_slot();
--   drop function if exists public.prioridad_hasta(uuid);
--   delete from public.role_permissions where clave like 'turnos.%';
--   delete from public.permission_keys   where clave like 'turnos.%';
--   delete from public.studio_settings   where key = 'priority_grace_days';
--   commit;
-- ============================================================
