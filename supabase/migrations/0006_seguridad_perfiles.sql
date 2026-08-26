-- 0006 — Seguridad de perfiles: el rol nunca sale de la metadata del registro.
--
-- Problema: handle_new_user tomaba el rol de raw_user_meta_data, que controla
-- quien se registra. Con los signups públicos habilitados en Supabase (es el
-- default), cualquiera con la anon key —pública, viaja en el bundle del sitio—
-- podía llamar supabase.auth.signUp({ options: { data: { role: 'admin' } } })
-- y nacer con perfil admin, sin pasar por ninguna pantalla de la app.
--
-- Ahora todo usuario nuevo nace 'alumno'. Los roles de staff los asigna
-- /api/admin/users con el service role, actualizando profiles DESPUÉS de
-- crear la cuenta (esa ruta ya valida que el caller sea admin).
--
-- Complemento manual (no se puede hacer por SQL): en el dashboard de Supabase,
-- Authentication → Sign In / Up → deshabilitar "Allow new users to sign up"
-- mientras el alta sea solo por staff. Cuando se haga el auto-registro del
-- portal, se rehabilita: con este trigger ya no hay riesgo de elevación.

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
    'alumno',
    coalesce(new.email, '')
  );
  return new;
end;
$$;
