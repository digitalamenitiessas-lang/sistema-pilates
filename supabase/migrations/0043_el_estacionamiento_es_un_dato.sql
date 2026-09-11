-- ============================================================
-- 0043 — El estacionamiento es un dato del estudio, no una línea de código
--
-- El manual de marca que mandó la clienta cierra el bloque OPEN STUDIO con
-- "ESTACIONAMIENTO EXCLUSIVO PARA ALUMNAS", y al aplicar la identidad esa
-- línea quedó escrita en el código, como respaldo de una clave
-- `studio_parking` que NO EXISTE en studio_settings.
--
-- Eso la vuelve imposible de editar y, peor, imposible de sacar. No es una
-- exageración: `saveSettings` (lib/api.ts) hace `update ... eq('key', key)`
-- y no hay ningún insert sobre studio_settings fuera de las migraciones, y
-- la pantalla de Configuración se arma filtrando las filas que trae la
-- tabla. Sin fila no hay campo, y sin campo el estudio no puede tocar un
-- texto que su web publica en negrita.
--
-- El texto es de ella, sale de su propio diseño, así que no se borra: se
-- convierte en lo que tendría que haber sido desde el principio, una fila
-- más del grupo `estudio`, al lado de la dirección y el horario. Desde que
-- esto corre, la línea se edita y se vacía desde Configuración sin pedirnos
-- nada, y el respaldo del código deja de tener efecto.
--
-- `is_public = true` porque la lee la landing sin sesión, igual que la
-- dirección. `sort_order = 80` la deja después del horario (70).
--
-- Nota de vocabulario, para que quede la decisión y no la sorpresa: el
-- texto dice "alumnas", y la 0026 renombró el grupo de permisos a
-- "Clientas" y la 0033 fijó "cliente" en masculino para la pantalla. Se
-- respeta la palabra de la clienta porque esto es su copy publicitario, no
-- una etiqueta del sistema. Si quiere cambiarlo, ahora puede.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

insert into public.studio_settings
  (key, value, kind, options, label, help, group_key, sort_order, is_public)
values
  ('studio_parking',
   'Estacionamiento exclusivo para alumnas',
   'text',
   '{}',
   'Estacionamiento',
   'Línea que aparece debajo de la dirección en la web. Vacía, no se muestra.',
   'estudio',
   80,
   true)
on conflict (key) do nothing;

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
--   select key, value, group_key, sort_order, is_public
--   from public.studio_settings
--   where key = 'studio_parking';
--   → una fila, is_public true, group_key 'estudio'
--
-- Y en la pantalla: Configuración → Estudio tiene que mostrar el campo
-- "Estacionamiento" debajo de "Horario de atención", con el texto cargado.
-- Vaciarlo tiene que hacer desaparecer la línea de la web.
-- ============================================================

-- ============================================================
-- VUELTA ATRÁS (no ejecutar salvo que haga falta)
--
--   begin;
--   delete from public.studio_settings where key = 'studio_parking';
--   commit;
--
-- Ojo: volver a borrar la fila devuelve el problema que esta migración
-- vino a cerrar — la web sigue publicando el texto del respaldo del
-- código y el estudio no lo puede tocar.
-- ============================================================
