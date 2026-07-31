-- ============================================================
-- PilatesStudio — Autogestión: salas y usuarios
-- Ejecutar completo en el SQL Editor del dashboard.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Catálogo de salas (editable desde Configuración)
--    class_sessions.room sigue siendo texto; al renombrar una
--    sala, la app actualiza las clases en cascada.
-- ------------------------------------------------------------
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.rooms enable row level security;

create policy "lectura autenticados"
  on public.rooms for select
  using (auth.uid() is not null);

create policy "escritura staff"
  on public.rooms for all
  using (public.app_role() in ('admin', 'recepcion'))
  with check (public.app_role() in ('admin', 'recepcion'));

-- Seed con las salas ya usadas por las clases existentes
insert into public.rooms (name)
select distinct room from public.class_sessions where room <> ''
order by 1;

-- ------------------------------------------------------------
-- 2. Email en profiles (para listar usuarios sin ir a Supabase)
-- ------------------------------------------------------------
alter table public.profiles add column email text not null default '';

update public.profiles p
set email = coalesce(u.email, '')
from auth.users u
where u.id = p.id;

-- El trigger de alta ahora también guarda el email
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'role', 'alumno'),
    coalesce(new.email, '')
  );
  return new;
end;
$$;
