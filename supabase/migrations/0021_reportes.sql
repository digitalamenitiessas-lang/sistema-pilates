-- ============================================================
-- 0021 — La clave de Reportes deja de ser una promesa
--
-- `reportes.ver` existe en el catálogo desde la 0012 marcada como
-- 'futuro', que es como el motor dice "el módulo todavía no existe".
-- Mientras es 'futuro' no se puede tildar: una clave que se prende y no
-- hace nada es peor que un candado, porque promete algo que no pasa.
--
-- Ahora la pantalla existe, así que la clave pasa a configurable.
--
-- Lo que la clave gobierna es la PUERTA: entrar a Reportes. Cada número
-- de adentro lo sigue gobernando su propio permiso, porque las vistas y
-- las tablas heredan las políticas de siempre — un rol con reportes.ver
-- pero sin finanzas.ver entra y no ve un peso, y la pantalla lo dice.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

update public.permission_keys set
  tipo = 'permiso',
  etiqueta = 'Ver reportes',
  ayuda = 'Entrar a Reportes y descargarlos. Lo que se ve adentro lo decide cada permiso: sin ver información financiera, los reportes de plata aparecen vacíos y la pantalla lo avisa.',
  grupo = 'Reportes',
  orden = 10
where clave = 'reportes.ver';

-- Recepción entra también: es quien atiende y quien más necesita mirar
-- deudas y asistencias del mes. Los reportes de plata los sigue filtrando
-- finanzas.ver, que ya tiene.
insert into public.role_permissions (role, clave) values
  ('admin', 'reportes.ver'),
  ('recepcion', 'reportes.ver')
on conflict do nothing;

update public.permission_keys set enforce_mode = 'activo'
where clave = 'reportes.ver';

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
--   select * from public.perm_diff();   → sigue dando cero filas
--
-- Y en Configuración → Permisos aparece "Ver reportes" tildable, con
-- Admin y Recepción marcados.
-- ============================================================
