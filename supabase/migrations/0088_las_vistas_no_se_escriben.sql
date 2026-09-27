-- ============================================================
-- 0088 — Las vistas no se escriben
--
-- Lo encontró la revisión de la 0087 el 27/09 y se confirmó en producción
-- el mismo día: con la llave pública —la que viaja en el navegador de
-- cualquiera que abra la web— y sin sesión, un PATCH sobre
-- `public_plans` o `public_studio_settings` volvía 200. Se probó con un id
-- que no existe, así que no tocó nada; con uno real habría cambiado el
-- precio de un plan o un dato del estudio.
--
-- Por qué pasaba: esas vistas son simples (una tabla, sin agregados), así
-- que Postgres las deja escribir y pasa la escritura a la tabla de abajo.
-- No tienen `security_invoker`, así que corren con los permisos de su
-- dueño y la RLS de la tabla no se mira. Y Supabase le da por defecto a
-- `anon` y `authenticated` todos los privilegios sobre lo que se crea en
-- `public`. Las tres cosas juntas: escritura sin RLS para cualquiera.
-- `public_payment_discounts` deja además mover el ajuste de cada medio de
-- pago, que es el −5% y el +25% con que se cobra toda cuota.
--
-- El sistema no escribe nunca sobre una vista —se revisó todo app/, lib/
-- y components/: cada insert, update, delete o upsert va a una tabla—,
-- así que acá se les saca la escritura a TODAS las vistas del esquema, no
-- sólo a las que se encontraron. Sólo la escritura: quién puede leer cada
-- una queda como estaba. Un "revoke all + grant select" parejo le daría
-- lectura a `anon` sobre vistas que hoy no la tienen (la 0073 cerró
-- algunas a propósito).
--
-- La 0087 hace lo mismo con las cinco `public_*` y lo verifica. Ésta va
-- aparte y antes porque el agujero está abierto hoy y no tiene por qué
-- esperar al encendido de los permisos. Correrla dos veces no cambia nada.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

do $$
declare
  v record;
begin
  for v in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'v'
  loop
    execute format(
      'revoke insert, update, delete, truncate on public.%I from public, anon, authenticated',
      v.relname
    );
  end loop;
end
$$;

-- La comprobación, adentro de la misma transacción: si alguna vista
-- sigue dejando escribir a una llave del navegador, no se confirma nada.
do $$
declare
  v_abiertas text;
begin
  select string_agg(distinct g.table_name || ' (' || g.grantee || ': ' || g.privilege_type || ')', ', ')
    into v_abiertas
    from information_schema.role_table_grants g
    join pg_class c on c.relname = g.table_name
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = g.table_schema
   where g.table_schema = 'public'
     and c.relkind = 'v'
     and g.grantee in ('PUBLIC', 'anon', 'authenticated')
     and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');

  if v_abiertas is not null then
    raise exception 'Quedaron vistas que se pueden escribir desde el navegador: %', v_abiertas;
  end if;
end
$$;

commit;

-- ------------------------------------------------------------
-- CÓMO VERIFICAR (sólo lee)
-- ------------------------------------------------------------
--
--   select g.table_name, g.grantee, string_agg(g.privilege_type, ', ' order by g.privilege_type)
--     from information_schema.role_table_grants g
--     join pg_class c on c.relname = g.table_name and c.relkind = 'v'
--    where g.table_schema = 'public' and g.grantee in ('anon', 'authenticated')
--    group by 1, 2 order by 1, 2;
--   → en ninguna fila INSERT, UPDATE, DELETE ni TRUNCATE.
--
-- Desde afuera, con la llave pública y un id que no existe (no toca nada):
-- un PATCH a /rest/v1/public_plans?id=eq.00000000-0000-0000-0000-000000000000
-- tiene que contestar "permission denied for view public_plans", no 200.
--
-- ------------------------------------------------------------
-- VUELTA ATRÁS — no conviene
-- ------------------------------------------------------------
--
-- Devolverles la escritura reabre, para cualquiera sin sesión, el precio de
-- los planes, los datos del estudio y el ajuste con que se cobra. Si algo
-- que no se previó necesitara escribir en una vista, lo correcto es que
-- escriba en la tabla. Aun así, esto la devuelve:
--
--   grant insert, update, delete on public.public_plans, public.public_studio_settings,
--     public.public_disciplines, public.public_payment_discounts
--     to anon, authenticated;
