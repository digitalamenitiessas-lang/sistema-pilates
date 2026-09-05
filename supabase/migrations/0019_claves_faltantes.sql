-- ============================================================
-- 0019 — Dos claves de permiso que quedaron sin existir
--
-- La migración 0013 abre las políticas de escritura en crear / editar /
-- borrar con un bucle que arma la clave como '<modulo>.eliminar'. Para
-- cinco módulos esa clave existe en el catálogo, pero para dos no:
--
--   reservations  → pide 'reservas.eliminar'     (el catálogo tiene 'reservas.anular')
--   memberships   → pide 'membresias.eliminar'   (el catálogo tiene 'membresias.anular')
--
-- can() sobre una clave que no está en el catálogo devuelve siempre "no",
-- así que hoy NADIE puede borrar una reserva ni una membresía. Y como una
-- fila que la política rechaza simplemente no se borra, el DELETE responde
-- bien y sin error: falla en silencio.
--
-- Hoy no rompe nada porque el sistema no borra estas filas desde el
-- navegador —dar de baja es cambiar un estado—, pero es una trampa
-- esperando: el día que alguien agregue "eliminar reserva", no va a andar
-- y no va a haber ningún mensaje que explique por qué.
--
-- Descubierto al intentar borrar una reserva de prueba.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

insert into public.permission_keys
  (clave, etiqueta, ayuda, grupo, orden, tipo, legacy_roles)
values
  ('reservas.eliminar', 'Eliminar una reserva',
   'Borrarla del todo. Lo habitual es cancelarla, que conserva el registro; esto es para una cargada por error.',
   'Reservas', 70, 'permiso', '{admin,recepcion}'),
  ('membresias.eliminar', 'Eliminar una membresía',
   'Borrarla del todo. Lo habitual es suspenderla o dejarla vencer; esto es para una cargada por error.',
   'Membresías', 50, 'permiso', '{admin,recepcion}')
on conflict (clave) do nothing;

-- La matriz se completa desde legacy_roles, igual que en la 0012: así
-- estas dos arrancan siendo lo que el sistema hacía antes del motor, y
-- perm_diff() sigue dando cero.
insert into public.role_permissions (role, clave)
select unnest(k.legacy_roles), k.clave
from public.permission_keys k
where k.clave in ('reservas.eliminar', 'membresias.eliminar')
on conflict do nothing;

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
--   select * from public.perm_diff();   → sigue dando cero filas
--
-- Y en la pantalla de permisos aparecen los dos permisos nuevos, tildados
-- para Admin y Recepción.
-- ============================================================
