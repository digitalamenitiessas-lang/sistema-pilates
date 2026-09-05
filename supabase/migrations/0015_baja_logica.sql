-- ============================================================
-- 0015 — Los accesos se desactivan, no se borran
--
-- La sección 11 del documento de Casa Fé lo pide con todas las letras:
-- "Los perfiles inactivos no deben eliminarse, porque necesitamos
-- conservar las clases, asistencias, horas y movimientos anteriores."
--
-- Hoy dar de baja un usuario borra la cuenta de Auth, y el perfil se va
-- con ella en cascada. Todo lo que quedara referenciado a esa persona
-- —quién cobró, quién marcó una asistencia— queda sin dueño.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

alter table public.profiles
  add column active boolean not null default true,
  add column deactivated_at timestamptz,
  add column deactivated_by uuid references auth.users (id);

-- El listado de usuarios muestra primero a los activos.
create index profiles_active_idx on public.profiles (active);

-- El sistema no puede quedarse sin nadie que lo administre. Es la misma
-- invariante que ya protege el cambio de rol (migración 0012), ahora
-- también para la desactivación.
create or replace function public.guard_profile_active()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.active is not distinct from old.active then
    return new;
  end if;

  if not new.active then
    if auth.uid() is not null and new.id = auth.uid() then
      raise exception 'No podés desactivar tu propio acceso';
    end if;

    if old.role = 'admin'
       and (select count(*) from public.profiles
            where role = 'admin' and active) <= 1 then
      raise exception 'El sistema no puede quedarse sin ningún admin activo';
    end if;

    new.deactivated_at := now();
    new.deactivated_by := auth.uid();
  else
    new.deactivated_at := null;
    new.deactivated_by := null;
  end if;

  return new;
end;
$$;

create trigger profiles_guard_active
  before update on public.profiles
  for each row execute function public.guard_profile_active();

commit;

-- ============================================================
-- Nota sobre el bloqueo del ingreso
--
-- Marcar el perfil como inactivo no impide por sí solo iniciar sesión:
-- eso lo hace el endpoint, que además banea la cuenta en Auth. Las dos
-- cosas van juntas, y por eso la desactivación pasa por /api/admin/users
-- y no por un update suelto desde el navegador.
-- ============================================================
