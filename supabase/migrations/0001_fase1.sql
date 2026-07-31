-- ============================================================
-- PilatesStudio — Fase 1: esquema inicial + RLS + seed
-- Proyecto Supabase: pilates (ashdqcznyagocjxsdadt)
-- Ejecutar completo en el SQL Editor del dashboard.
-- ============================================================

-- ------------------------------------------------------------
-- 1. PERFILES (roles de usuario, vinculados a Supabase Auth)
-- ------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role text not null default 'alumno'
    check (role in ('admin', 'recepcion', 'profesor', 'alumno')),
  created_at timestamptz not null default now()
);

-- Rol del usuario logueado. SECURITY DEFINER para poder usarla dentro
-- de las políticas RLS sin recursión sobre profiles.
create or replace function public.app_role()
returns text
language sql stable security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Al crearse un usuario en Auth se crea su perfil automáticamente.
-- El rol puede venir en la metadata del usuario; por defecto es 'alumno'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'role', 'alumno')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 2. TABLAS DE DOMINIO
-- ------------------------------------------------------------
create table public.teachers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  disciplines text[] not null default '{}',
  phone text not null default '',
  email text not null default '',
  color text not null default '#C4735A',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(12, 2) not null,
  class_count int not null,
  duration_days int not null,
  disciplines text[] not null default '{}',
  description text not null default '',
  color text not null default '#C4735A',
  popular boolean not null default false,
  is_trial boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null default '',
  phone text not null default '',
  dni text not null default '',
  birthdate date,
  join_date date not null default current_date,
  observations text,
  medical_notes text,
  emergency_contact text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  plan_id uuid not null references public.plans (id),
  start_date date not null default current_date,
  end_date date not null,
  classes_total int not null,
  classes_used int not null default 0,
  -- 'vencida' y 'por vencer' se derivan de end_date al leer; acá solo
  -- se persiste el estado administrativo.
  status text not null default 'activa'
    check (status in ('activa', 'suspendida')),
  price numeric(12, 2) not null,
  created_at timestamptz not null default now()
);

create table public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  discipline text not null,
  teacher_id uuid not null references public.teachers (id),
  day_of_week int not null check (day_of_week between 0 and 6), -- 0 = lunes
  start_time time not null,
  duration_minutes int not null default 55,
  capacity int not null default 10,
  room text not null default '',
  color text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  class_id uuid not null references public.class_sessions (id) on delete cascade,
  date date not null,
  status text not null default 'confirmada'
    check (status in ('confirmada', 'cancelada', 'lista de espera', 'asistió', 'ausente')),
  created_at timestamptz not null default now(),
  unique (student_id, class_id, date)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  membership_id uuid references public.memberships (id) on delete set null,
  concept text not null default '',
  amount numeric(12, 2) not null,
  due_date date not null default current_date,
  paid_date date,
  -- 'vencido' se deriva de due_date al leer.
  status text not null default 'pendiente'
    check (status in ('pendiente', 'pagado', 'anulado')),
  method text check (method in ('efectivo', 'transferencia', 'tarjeta')),
  receipt_number bigint unique,
  notes text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3. COMPROBANTES: numeración automática al registrar el pago
-- ------------------------------------------------------------
create sequence public.receipt_seq start 1;

create or replace function public.assign_receipt_number()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'pagado' and new.receipt_number is null then
    new.receipt_number := nextval('public.receipt_seq');
    new.paid_date := coalesce(new.paid_date, current_date);
  end if;
  return new;
end;
$$;

create trigger payments_assign_receipt
  before insert or update on public.payments
  for each row execute function public.assign_receipt_number();

-- ------------------------------------------------------------
-- 4. VISTA: ingresos mensuales (solo pagos cobrados)
-- ------------------------------------------------------------
create view public.monthly_revenue
with (security_invoker = on) as
select
  to_char(paid_date, 'YYYY-MM') as month,
  sum(amount)::numeric(14, 2) as amount
from public.payments
where status = 'pagado' and paid_date is not null
group by 1
order by 1;

-- ------------------------------------------------------------
-- 5. RLS: lectura para usuarios logueados, escritura para
--    admin/recepción.
-- ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.teachers enable row level security;
alter table public.plans enable row level security;
alter table public.students enable row level security;
alter table public.memberships enable row level security;
alter table public.class_sessions enable row level security;
alter table public.reservations enable row level security;
alter table public.payments enable row level security;

create policy "leer perfil propio o staff"
  on public.profiles for select
  using (id = auth.uid() or public.app_role() in ('admin', 'recepcion'));

create policy "admin administra perfiles"
  on public.profiles for all
  using (public.app_role() = 'admin')
  with check (public.app_role() = 'admin');

-- Macro repetida por tabla de dominio: select autenticado, escritura staff.
do $$
declare
  t text;
begin
  foreach t in array array['teachers', 'plans', 'students', 'memberships', 'class_sessions', 'reservations', 'payments']
  loop
    execute format(
      'create policy "lectura autenticados" on public.%I for select using (auth.uid() is not null)', t
    );
    execute format(
      'create policy "escritura staff" on public.%I for all using (public.app_role() in (''admin'', ''recepcion'')) with check (public.app_role() in (''admin'', ''recepcion''))', t
    );
  end loop;
end;
$$;

-- ============================================================
-- 6. SEED — datos de arranque (semana del 27/07/2026)
-- ============================================================

insert into public.teachers (id, name, disciplines, phone, email, color) values
  ('a0000000-0000-4000-8000-000000000001', 'Valentina Ortiz', '{"Pilates Mat","Pilates Reformer","Stretching"}', '+54 11 4523-8890', 'valentina@pilatestudio.com', '#C4735A'),
  ('a0000000-0000-4000-8000-000000000002', 'Lucía Fernández', '{"Pilates Clínico","Pilates Reformer"}', '+54 11 4523-1122', 'lucia@pilatestudio.com', '#7D9B76'),
  ('a0000000-0000-4000-8000-000000000003', 'Martín Calvo', '{"Yoga","Stretching","Funcional"}', '+54 11 4523-3344', 'martin@pilatestudio.com', '#D4A854'),
  ('a0000000-0000-4000-8000-000000000004', 'Sofia Blanco', '{"Pilates Mat","Funcional"}', '+54 11 4523-5566', 'sofia@pilatestudio.com', '#9B6E8E');

insert into public.plans (id, name, price, class_count, duration_days, disciplines, description, color, popular, is_trial) values
  ('b0000000-0000-4000-8000-000000000001', 'Básico Mat', 18000, 8, 30, '{"Pilates Mat"}', '8 clases de Pilates Mat por mes', '#C4735A', false, false),
  ('b0000000-0000-4000-8000-000000000002', 'Reformer Premium', 32000, 8, 30, '{"Pilates Reformer"}', '8 clases de Reformer por mes', '#7D9B76', true, false),
  ('b0000000-0000-4000-8000-000000000003', 'Full Flex', 42000, 12, 30, '{"Pilates Mat","Pilates Reformer","Stretching","Yoga"}', '12 clases libres en todas las disciplinas', '#D4A854', false, false),
  ('b0000000-0000-4000-8000-000000000004', 'Clínico Terapéutico', 55000, 8, 30, '{"Pilates Clínico"}', '8 clases de Pilates Clínico con seguimiento médico', '#9B6E8E', false, false),
  ('b0000000-0000-4000-8000-000000000005', 'Yoga & Movimiento', 22000, 10, 30, '{"Yoga","Stretching","Funcional"}', '10 clases entre Yoga, Stretching y Funcional', '#5E8FA8', false, false),
  ('b0000000-0000-4000-8000-000000000006', 'Clase de Prueba', 0, 1, 7, '{"Pilates Mat","Pilates Reformer","Yoga","Stretching","Funcional"}', 'Primera clase para nuevos alumnos. Válida por 7 días.', '#5E8FA8', false, true);

insert into public.students (id, name, email, phone, dni, birthdate, join_date, observations, medical_notes) values
  ('c0000000-0000-4000-8000-000000000001', 'Camila Torres', 'camila.torres@gmail.com', '+54 11 6789-1234', '32.456.789', '1990-03-15', '2024-02-01', 'Prefiere clases de mañana. Trabaja home office.', null),
  ('c0000000-0000-4000-8000-000000000002', 'Florencia Ríos', 'flor.rios@gmail.com', '+54 11 6789-5678', '35.123.456', '1995-07-22', '2023-09-15', null, 'Lumbalgia crónica. Evitar flexión lumbar acentuada.'),
  ('c0000000-0000-4000-8000-000000000003', 'Agustina Leal', 'agustina.leal@gmail.com', '+54 11 6789-9012', '38.987.654', '1998-11-05', '2025-01-10', null, null),
  ('c0000000-0000-4000-8000-000000000004', 'Roberto Martínez', 'roberto.mtz@gmail.com', '+54 11 6789-3456', '28.654.321', '1978-05-18', '2024-05-20', null, 'Prótesis rodilla derecha. Plan Clínico indicado por médico.'),
  ('c0000000-0000-4000-8000-000000000005', 'Daniela Suárez', 'daniela.suarez@gmail.com', '+54 11 6789-7890', '36.741.852', '1993-09-30', '2024-11-01', null, null),
  ('c0000000-0000-4000-8000-000000000006', 'Mariana Vega', 'mariana.vega@gmail.com', '+54 11 6789-2345', '37.852.963', '1996-02-14', '2025-02-20', null, null),
  ('c0000000-0000-4000-8000-000000000007', 'Tomás Herrera', 'tomas.herrera@gmail.com', '+54 11 6789-6789', '33.963.741', '1988-08-08', '2024-07-15', null, null),
  ('c0000000-0000-4000-8000-000000000008', 'Paula Acosta', 'paula.acosta@gmail.com', '+54 11 6789-0123', '34.159.753', '1991-12-25', '2024-08-01', null, null),
  ('c0000000-0000-4000-8000-000000000009', 'Ignacio Ruiz', 'ignacio.ruiz@gmail.com', '+54 11 6789-4567', '39.357.951', '2000-04-10', '2025-03-01', null, null),
  ('c0000000-0000-4000-8000-000000000010', 'Valentina Cruz', 'val.cruz@gmail.com', '+54 11 6789-8901', '40.753.159', '2001-06-28', '2025-04-15', null, null),
  ('c0000000-0000-4000-8000-000000000011', 'Gabriela Morales', 'gabi.morales@gmail.com', '+54 11 6789-1357', '31.258.147', '1985-01-20', '2023-03-10', null, null),
  ('c0000000-0000-4000-8000-000000000012', 'Sebastián Ponce', 'seba.ponce@gmail.com', '+54 11 6789-2468', '30.147.258', '1983-10-15', '2023-05-22', null, null);

insert into public.memberships (id, student_id, plan_id, start_date, end_date, classes_total, classes_used, status, price) values
  ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', '2026-07-05', '2026-08-04', 8, 5, 'activa', 32000),
  ('d0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000003', '2026-07-10', '2026-08-09', 12, 11, 'activa', 42000),
  ('d0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', '2026-07-15', '2026-08-14', 8, 3, 'activa', 18000),
  ('d0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000004', '2026-07-12', '2026-08-11', 8, 6, 'activa', 55000),
  ('d0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000002', '2026-07-03', '2026-08-02', 8, 7, 'activa', 32000),
  ('d0000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000005', '2026-07-08', '2026-08-07', 10, 2, 'activa', 22000),
  ('d0000000-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000001', '2026-06-15', '2026-07-15', 8, 8, 'activa', 18000),
  ('d0000000-0000-4000-8000-000000000008', 'c0000000-0000-4000-8000-000000000008', 'b0000000-0000-4000-8000-000000000003', '2026-07-02', '2026-08-01', 12, 9, 'activa', 42000),
  ('d0000000-0000-4000-8000-000000000009', 'c0000000-0000-4000-8000-000000000009', 'b0000000-0000-4000-8000-000000000002', '2026-07-20', '2026-08-19', 8, 4, 'activa', 32000),
  ('d0000000-0000-4000-8000-000000000010', 'c0000000-0000-4000-8000-000000000010', 'b0000000-0000-4000-8000-000000000001', '2026-07-18', '2026-08-17', 8, 6, 'activa', 18000);

insert into public.class_sessions (id, title, discipline, teacher_id, day_of_week, start_time, duration_minutes, capacity, room, color) values
  -- Lunes
  ('e0000000-0000-4000-8000-000000000001', 'Pilates Mat Inicial', 'Pilates Mat', 'a0000000-0000-4000-8000-000000000001', 0, '07:30', 55, 10, 'Sala 1', '#C4735A'),
  ('e0000000-0000-4000-8000-000000000002', 'Reformer Intermedio', 'Pilates Reformer', 'a0000000-0000-4000-8000-000000000002', 0, '09:00', 55, 6, 'Sala Reformer', '#7D9B76'),
  ('e0000000-0000-4000-8000-000000000003', 'Yoga Flow', 'Yoga', 'a0000000-0000-4000-8000-000000000003', 0, '10:00', 60, 12, 'Sala 2', '#D4A854'),
  ('e0000000-0000-4000-8000-000000000004', 'Pilates Mat Avanzado', 'Pilates Mat', 'a0000000-0000-4000-8000-000000000004', 0, '18:00', 55, 10, 'Sala 1', '#C4735A'),
  ('e0000000-0000-4000-8000-000000000005', 'Reformer Avanzado', 'Pilates Reformer', 'a0000000-0000-4000-8000-000000000001', 0, '19:00', 55, 6, 'Sala Reformer', '#7D9B76'),
  -- Martes
  ('e0000000-0000-4000-8000-000000000006', 'Pilates Clínico', 'Pilates Clínico', 'a0000000-0000-4000-8000-000000000002', 1, '09:00', 55, 4, 'Sala Clínica', '#9B6E8E'),
  ('e0000000-0000-4000-8000-000000000007', 'Stretching Matutino', 'Stretching', 'a0000000-0000-4000-8000-000000000003', 1, '10:00', 45, 12, 'Sala 2', '#5E8FA8'),
  ('e0000000-0000-4000-8000-000000000008', 'Reformer Inicial', 'Pilates Reformer', 'a0000000-0000-4000-8000-000000000002', 1, '18:00', 55, 6, 'Sala Reformer', '#7D9B76'),
  ('e0000000-0000-4000-8000-000000000009', 'Funcional Core', 'Funcional', 'a0000000-0000-4000-8000-000000000004', 1, '19:00', 50, 10, 'Sala 1', '#B8956A'),
  -- Miércoles
  ('e0000000-0000-4000-8000-000000000010', 'Pilates Mat Inicial', 'Pilates Mat', 'a0000000-0000-4000-8000-000000000001', 2, '07:30', 55, 10, 'Sala 1', '#C4735A'),
  ('e0000000-0000-4000-8000-000000000011', 'Reformer Intermedio', 'Pilates Reformer', 'a0000000-0000-4000-8000-000000000002', 2, '09:00', 55, 6, 'Sala Reformer', '#7D9B76'),
  ('e0000000-0000-4000-8000-000000000012', 'Yoga Restaurativo', 'Yoga', 'a0000000-0000-4000-8000-000000000003', 2, '18:30', 60, 12, 'Sala 2', '#D4A854'),
  ('e0000000-0000-4000-8000-000000000013', 'Pilates Clínico', 'Pilates Clínico', 'a0000000-0000-4000-8000-000000000002', 2, '19:30', 55, 4, 'Sala Clínica', '#9B6E8E'),
  -- Jueves
  ('e0000000-0000-4000-8000-000000000014', 'Reformer Avanzado', 'Pilates Reformer', 'a0000000-0000-4000-8000-000000000001', 3, '09:00', 55, 6, 'Sala Reformer', '#7D9B76'),
  ('e0000000-0000-4000-8000-000000000015', 'Stretching y Relajación', 'Stretching', 'a0000000-0000-4000-8000-000000000003', 3, '10:00', 45, 12, 'Sala 2', '#5E8FA8'),
  ('e0000000-0000-4000-8000-000000000016', 'Pilates Mat Avanzado', 'Pilates Mat', 'a0000000-0000-4000-8000-000000000004', 3, '18:00', 55, 10, 'Sala 1', '#C4735A'),
  ('e0000000-0000-4000-8000-000000000017', 'Funcional Total Body', 'Funcional', 'a0000000-0000-4000-8000-000000000004', 3, '19:00', 50, 10, 'Sala 1', '#B8956A'),
  -- Viernes
  ('e0000000-0000-4000-8000-000000000018', 'Pilates Mat Inicial', 'Pilates Mat', 'a0000000-0000-4000-8000-000000000001', 4, '07:30', 55, 10, 'Sala 1', '#C4735A'),
  ('e0000000-0000-4000-8000-000000000019', 'Reformer Inicial', 'Pilates Reformer', 'a0000000-0000-4000-8000-000000000002', 4, '09:00', 55, 6, 'Sala Reformer', '#7D9B76'),
  ('e0000000-0000-4000-8000-000000000020', 'Yoga & Meditación', 'Yoga', 'a0000000-0000-4000-8000-000000000003', 4, '18:00', 75, 12, 'Sala 2', '#D4A854'),
  -- Sábado
  ('e0000000-0000-4000-8000-000000000021', 'Pilates Mat Grupal', 'Pilates Mat', 'a0000000-0000-4000-8000-000000000004', 5, '09:00', 60, 12, 'Sala 1', '#C4735A'),
  ('e0000000-0000-4000-8000-000000000022', 'Reformer Weekend', 'Pilates Reformer', 'a0000000-0000-4000-8000-000000000001', 5, '10:00', 55, 6, 'Sala Reformer', '#7D9B76'),
  ('e0000000-0000-4000-8000-000000000023', 'Stretching Integrado', 'Stretching', 'a0000000-0000-4000-8000-000000000003', 5, '11:00', 45, 10, 'Sala 2', '#5E8FA8');

-- Reservas de la semana actual (lunes 27/07 a sábado 01/08 de 2026)
insert into public.reservations (student_id, class_id, date, status) values
  ('c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', '2026-07-27', 'asistió'),
  ('c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', '2026-07-27', 'asistió'),
  ('c0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001', '2026-07-27', 'asistió'),
  ('c0000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000002', '2026-07-27', 'lista de espera'),
  ('c0000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000006', '2026-07-28', 'asistió'),
  ('c0000000-0000-4000-8000-000000000006', 'e0000000-0000-4000-8000-000000000007', '2026-07-28', 'ausente'),
  ('c0000000-0000-4000-8000-000000000008', 'e0000000-0000-4000-8000-000000000012', '2026-07-29', 'asistió'),
  ('c0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000012', '2026-07-29', 'asistió'),
  ('c0000000-0000-4000-8000-000000000010', 'e0000000-0000-4000-8000-000000000010', '2026-07-29', 'asistió'),
  ('c0000000-0000-4000-8000-000000000009', 'e0000000-0000-4000-8000-000000000014', '2026-07-30', 'asistió'),
  ('c0000000-0000-4000-8000-000000000007', 'e0000000-0000-4000-8000-000000000016', '2026-07-30', 'cancelada'),
  -- Hoy viernes 31/07
  ('c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000018', '2026-07-31', 'confirmada'),
  ('c0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000018', '2026-07-31', 'confirmada'),
  ('c0000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000019', '2026-07-31', 'confirmada'),
  ('c0000000-0000-4000-8000-000000000009', 'e0000000-0000-4000-8000-000000000019', '2026-07-31', 'confirmada'),
  ('c0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000020', '2026-07-31', 'confirmada'),
  ('c0000000-0000-4000-8000-000000000008', 'e0000000-0000-4000-8000-000000000020', '2026-07-31', 'confirmada'),
  -- Mañana sábado 01/08
  ('c0000000-0000-4000-8000-000000000010', 'e0000000-0000-4000-8000-000000000021', '2026-08-01', 'confirmada'),
  ('c0000000-0000-4000-8000-000000000006', 'e0000000-0000-4000-8000-000000000021', '2026-08-01', 'confirmada'),
  ('c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000022', '2026-08-01', 'confirmada'),
  ('c0000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000022', '2026-08-01', 'lista de espera');

-- Historial de pagos feb–jun 2026 (para el gráfico de ingresos):
-- un pago mensual cobrado por cada membresía vigente.
insert into public.payments (student_id, concept, amount, due_date, paid_date, status, method)
select
  ms.student_id,
  pl.name,
  pl.price,
  (m + interval '4 days')::date,
  (m + interval '2 days')::date,
  'pagado',
  (array['efectivo', 'transferencia', 'tarjeta'])[1 + (row_number() over ()) % 3]
from public.memberships ms
join public.plans pl on pl.id = ms.plan_id
cross join generate_series('2026-02-01'::timestamp, '2026-06-01'::timestamp, interval '1 month') m;

-- Pagos de julio 2026: cobrados y deudas pendientes
insert into public.payments (student_id, membership_id, concept, amount, due_date, paid_date, status, method) values
  ('c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Reformer Premium', 32000, '2026-07-05', '2026-07-05', 'pagado', 'transferencia'),
  ('c0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000002', 'Full Flex', 42000, '2026-07-10', '2026-07-10', 'pagado', 'efectivo'),
  ('c0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000003', 'Básico Mat', 18000, '2026-07-15', '2026-07-14', 'pagado', 'tarjeta'),
  ('c0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000004', 'Clínico Terapéutico', 55000, '2026-07-12', null, 'pendiente', null),
  ('c0000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000005', 'Reformer Premium', 32000, '2026-07-03', '2026-07-03', 'pagado', 'transferencia'),
  ('c0000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000006', 'Yoga & Movimiento', 22000, '2026-07-08', null, 'pendiente', null),
  ('c0000000-0000-4000-8000-000000000007', 'd0000000-0000-4000-8000-000000000007', 'Básico Mat', 18000, '2026-07-01', null, 'pendiente', null),
  ('c0000000-0000-4000-8000-000000000008', 'd0000000-0000-4000-8000-000000000008', 'Full Flex', 42000, '2026-07-02', '2026-07-02', 'pagado', 'tarjeta'),
  ('c0000000-0000-4000-8000-000000000009', 'd0000000-0000-4000-8000-000000000009', 'Reformer Premium', 32000, '2026-07-20', '2026-07-20', 'pagado', 'efectivo'),
  ('c0000000-0000-4000-8000-000000000010', 'd0000000-0000-4000-8000-000000000010', 'Básico Mat', 18000, '2026-07-18', '2026-07-18', 'pagado', 'efectivo'),
  ('c0000000-0000-4000-8000-000000000011', null, 'Básico Mat', 18000, '2026-07-03', null, 'pendiente', null),
  ('c0000000-0000-4000-8000-000000000012', null, 'Full Flex', 42000, '2026-07-12', null, 'pendiente', null);
