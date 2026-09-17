-- ============================================================
-- 0068 — La dirección del portal no se adivina del pedido
--
-- Encontrado el 17/09 mirando el HTML que Resend guardó de los cuatro
-- mails de acceso que se mandaron: los CUATRO llevan el botón "Entrar al
-- portal" apuntando a `http://localhost:3000/sistema`. Uno de ellos fue a
-- una clienta real.
--
-- POR QUÉ
--
-- `app/api/admin/users/route.ts` armaba el link con
-- `new URL(request.url).origin`, o sea con la dirección por la que entró
-- el pedido. Eso es correcto sólo por casualidad: el link del mail es la
-- dirección PÚBLICA del estudio, y no tiene nada que ver con qué servidor
-- atendió el pedido que lo disparó. Si el alta se hace desde el servidor
-- de desarrollo, el mail sale con un link a la máquina de quien programa
-- — que en el teléfono de la clienta no es nada.
--
-- Y hay un segundo motivo, menos obvio: detrás de un proxy la dirección
-- del pedido no siempre es la que el navegador escribió. O sea que ni
-- siquiera en producción se puede confiar en que ese origen sea el
-- dominio que la clienta conoce.
--
-- EL ARREGLO
--
-- La dirección pasa a ser un dato del estudio, como su nombre y su
-- teléfono. Se resuelve en este orden:
--
--   1. `portal_url` de acá, si el estudio la cargó.
--   2. La dirección de producción que publica Vercel, que no hay que
--      cargar en ningún lado.
--   3. El origen del pedido, que es lo que había antes — así en
--      desarrollo el link sigue apuntando a la máquina local, que es lo
--      correcto cuando uno está probando.
--
-- Va marcada como pública (`is_public`) por la misma razón que el nombre
-- del estudio: la lee el servidor con la llave anónima, sin sesión, desde
-- la vista `public_studio_settings`. No hay nada que proteger en la
-- dirección de una web.
--
-- Queda VACÍA a propósito. Con el valor vacío manda el paso 2 y el link
-- sale bien sin que nadie configure nada; cargarla sirve para fijar el
-- dominio propio el día que el estudio lo tenga, sin depender de Vercel.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

insert into public.studio_settings
  (key, value, kind, label, help, group_key, sort_order, is_public)
values
  ('portal_url', '', 'text',
   'Dirección del portal (para los links de los mails)',
   'La dirección con la que las clientas entran, por ejemplo https://casafepilates.com.ar. Dejala vacía y el sistema usa sola la dirección de producción. Cargala si querés fijar el dominio propio.',
   'estudio', 73, true)
on conflict (key) do update
  set label = excluded.label,
      help = excluded.help,
      is_public = excluded.is_public;

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
--   -- 1. Que la clave exista y sea pública:
--   select key, value, is_public from public.studio_settings
--    where key = 'portal_url';
--
--   -- 2. Que la vista sin sesión la exponga (es la que lee el servidor
--   --    para armar el mail):
--   select * from public.public_studio_settings where key = 'portal_url';
--
--   -- 3. Lo que importa de verdad: mandar un mail de acceso y mirar el
--   --    link. Desde la ficha de alguien que todavía no entró,
--   --    "Reenviar el mail de acceso", y en el mail el botón tiene que
--   --    apuntar al dominio de producción y no a localhost.
--
-- PARA VOLVER ATRÁS
--
--   delete from public.studio_settings where key = 'portal_url';
--
--   El código tolera que no exista: cae al paso 2 y después al 3.
-- ============================================================
