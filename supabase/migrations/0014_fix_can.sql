-- ============================================================
-- 0014 — Arreglo urgente de can()
--
-- SÍNTOMA: después de la 0013 el staff dejó de ver alumnas, membresías,
-- reservas y pagos. El tablero mostraba todo en cero.
--
-- CAUSA: el caché por transacción que traía can(). La función guardaba el
-- resultado en una variable de sesión (`pilates.perms`) y lo reusaba:
--
--     v_cache := current_setting('pilates.perms', true);
--     if v_cache is null then ... end if;
--
-- El problema es que la función declara `set search_path = ''`. Postgres
-- guarda y restaura el estado de las variables al entrar y salir de una
-- función con cláusula SET, y al restaurarlas una variable personalizada
-- no vuelve a "no existe" sino a CADENA VACÍA. Así que a partir de la
-- segunda llamada `current_setting` devolvía '' —que no es null— y la
-- función respondía que no sobre un caché vacío: todo false.
--
-- ARREGLO: sacar el caché. Era una optimización, no parte de la
-- corrección. Con la llamada envuelta en (select ...) —como quedó en
-- todas las políticas de la 0013— Postgres la resuelve igual una vez por
-- consulta y no una vez por fila, que era lo que el caché venía a evitar.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

create or replace function public.can(p_clave text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_clave = any(public.mis_permisos())
$$;

-- ============================================================
-- CÓMO VERIFICAR
--
-- Desde el sistema, con la sesión de un admin: el tablero vuelve a
-- mostrar alumnas, ingresos y pagos pendientes.
--
-- Y como antes, nada tiene que haber cambiado respecto de cómo venía
-- funcionando el sistema: todas las claves siguen en modo sombra.
-- ============================================================
