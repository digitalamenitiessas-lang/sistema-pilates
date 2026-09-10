-- ============================================================
-- 0042 — El proceso diario puede caducar las ofertas
--
-- La 0041 le revoca `renovacion_caducar()` a `public, anon, authenticated`,
-- siguiendo el patrón de la casa para toda función `security definer`. Y
-- está bien que se lo revoque: esa función anula cuotas, no es algo que
-- deba poder llamar cualquiera con una sesión.
--
-- Pero el `revoke ... from public` es más ancho de lo que parece. En
-- Postgres, PUBLIC es "todos los roles", así que si `service_role` tenía
-- el EXECUTE por ese camino y no por un grant propio, la 0041 se lo sacó
-- también — y `service_role` es justamente con quien el proceso diario
-- llama a la función.
--
-- La consecuencia sería silenciosa, que es lo que la hace fea: el cron
-- envuelve esa llamada en try/catch, así que no se cae ni avisa en la
-- campana. Reporta el motivo en el JSON de la respuesta y sigue. Y
-- mientras eso pase, LAS OFERTAS NO CADUCAN NUNCA: cada renovación que
-- nadie paga queda pendiente para siempre, que es exactamente el problema
-- que la 0041 vino a cerrar.
--
-- No se pudo verificar desde el navegador —la clave del service role vive
-- en el servidor— y la única forma de probarlo era invocar el proceso
-- diario, que manda emails reales a las clientas. Así que se cierra con el
-- grant explícito, que es idempotente y no cuesta nada.
--
-- `renovar_por_pago()` no necesita nada: la llama el trigger
-- `payments_renueva`, que es `security definer` y corre como su dueño.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

grant execute on function public.renovacion_caducar() to service_role;

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
--   select r.rolname, has_function_privilege(r.rolname, 'public.renovacion_caducar()', 'execute')
--   from pg_roles r
--   where r.rolname in ('anon', 'authenticated', 'service_role');
--   → service_role true, los otros dos false
--
-- Y en el JSON del proceso diario ya no tiene que aparecer
-- `caducarSalteado`.
-- ============================================================

-- ============================================================
-- VUELTA ATRÁS (no ejecutar salvo que haga falta)
--
--   begin;
--   revoke execute on function public.renovacion_caducar() from service_role;
--   commit;
--
-- Con esto el proceso diario deja de poder caducar las ofertas, así que
-- solo tiene sentido si se está revirtiendo la 0041 entera.
-- ============================================================
