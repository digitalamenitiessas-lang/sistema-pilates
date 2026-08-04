-- ============================================================
-- PilatesStudio — Portal del alumno
-- Ejecutar completo en el SQL Editor del dashboard.
--
-- 1. Vincula cuentas de Auth con fichas de alumnos.
-- 2. Restringe RLS: cada alumno ve SOLO sus propios datos.
-- 3. Permite al alumno reservar y cancelar sus clases.
-- 4. Hace cumplir el cupo de las clases en la base (no solo en la UI).
-- 5. Vista agregada de ocupación para mostrar cupos sin exponer nombres.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Vínculo ficha de alumno ↔ usuario de Auth
-- ------------------------------------------------------------
alter table public.students
  add column user_id uuid unique references auth.users (id) on delete set null;

-- Fichas del usuario logueado (SECURITY DEFINER para usar en políticas
-- de tablas hijas sin recursión de RLS sobre students).
create or replace function public.my_student_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select id from public.students where user_id = auth.uid()
$$;

-- ------------------------------------------------------------
-- 2. RLS por alumno: se reemplaza la lectura "cualquier logueado"
--    en las tablas con datos personales.
-- ------------------------------------------------------------
drop policy "lectura autenticados" on public.students;
drop policy "lectura autenticados" on public.memberships;
drop policy "lectura autenticados" on public.payments;
drop policy "lectura autenticados" on public.reservations;

create policy "staff y profesores leen"
  on public.students for select
  using (public.app_role() in ('admin', 'recepcion', 'profesor'));
create policy "alumno lee su ficha"
  on public.students for select
  using (user_id = auth.uid());

create policy "staff y profesores leen"
  on public.memberships for select
  using (public.app_role() in ('admin', 'recepcion', 'profesor'));
create policy "alumno lee sus membresias"
  on public.memberships for select
  using (student_id in (select public.my_student_ids()));

create policy "staff y profesores leen"
  on public.payments for select
  using (public.app_role() in ('admin', 'recepcion', 'profesor'));
create policy "alumno lee sus pagos"
  on public.payments for select
  using (student_id in (select public.my_student_ids()));

create policy "staff y profesores leen"
  on public.reservations for select
  using (public.app_role() in ('admin', 'recepcion', 'profesor'));
create policy "alumno lee sus reservas"
  on public.reservations for select
  using (student_id in (select public.my_student_ids()));

-- ------------------------------------------------------------
-- 3. El alumno puede reservar y cancelar SUS clases
-- ------------------------------------------------------------
create policy "alumno reserva"
  on public.reservations for insert
  with check (
    student_id in (select public.my_student_ids())
    and status in ('confirmada', 'lista de espera')
  );

create policy "alumno cancela"
  on public.reservations for update
  using (student_id in (select public.my_student_ids()))
  with check (status = 'cancelada');

-- ------------------------------------------------------------
-- 4. Cupo garantizado por la base: nadie confirma en clase llena
--    (la lista de espera no pasa por el control)
-- ------------------------------------------------------------
create or replace function public.enforce_class_capacity()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  cap int;
  taken int;
begin
  if new.status = 'confirmada' then
    select capacity into cap from public.class_sessions where id = new.class_id;
    select count(*) into taken
    from public.reservations
    where class_id = new.class_id
      and date = new.date
      and status in ('confirmada', 'asistió')
      and id is distinct from new.id;
    if taken >= cap then
      raise exception 'La clase ya está completa';
    end if;
  end if;
  return new;
end;
$$;

create trigger reservations_capacity
  before insert or update on public.reservations
  for each row execute function public.enforce_class_capacity();

-- ------------------------------------------------------------
-- 5. Ocupación por clase y fecha (solo números, sin datos
--    personales; corre con permisos del dueño a propósito)
-- ------------------------------------------------------------
create view public.class_occupancy as
select
  class_id,
  date,
  count(*) filter (where status in ('confirmada', 'asistió')) as confirmed,
  count(*) filter (where status = 'lista de espera') as waitlist
from public.reservations
group by class_id, date;
