-- ============================================================
-- 0032 — Recepción puede saber si Mercado Pago está conectado
--
-- La 0008 dejó las credenciales legibles solo para el admin, y con razón:
-- el token de Mercado Pago no tiene por qué viajar al navegador de
-- recepción. Los endpoints /api/mp/* lo leen con el service role del
-- servidor, así que recepción siempre pudo generar links y sincronizar.
--
-- Pero la pantalla decide si mostrar esos botones leyendo la tabla desde
-- el navegador (lib/api.ts, mpConfigured). Para recepción esa consulta
-- devuelve cero filas — no un error, cero filas, porque así funciona
-- RLS— así que el sistema concluye "Mercado Pago no está configurado" y
-- le esconde botones que el servidor le habría aceptado.
--
-- No se arregla con una política: RLS filtra FILAS, no columnas, y la
-- fila es justamente la que tiene el token. Lo que hace falta es
-- responder una pregunta sin mostrar el dato, y eso es una función.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

/**
 * ¿Hay un token de Mercado Pago cargado? Devuelve un booleano y nada más:
 * no expone el token ni su longitud ni cuándo se cargó.
 *
 * security definer para poder mirar la tabla que quien pregunta no puede
 * leer, y por eso el permiso se exige acá adentro: cualquiera con sesión
 * de staff puede preguntar, una alumna no.
 */
create or replace function public.mp_configurado()
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  if public.app_role() not in ('admin', 'recepcion') then
    return false;
  end if;

  return exists (
    select 1 from public.app_settings
    where key = 'mp_access_token' and coalesce(value, '') <> ''
  );
end;
$$;

revoke all on function public.mp_configurado() from public;
grant execute on function public.mp_configurado() to authenticated;

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
--   select public.mp_configurado();
--     → con sesión de admin o de recepción: true si hay token cargado
--     → con sesión de profesora o de alumna: false, siempre
--
-- Y en la pantalla: entrando como recepción, los botones de Mercado Pago
-- en Pagos aparecen igual que para el admin. El token sigue sin viajar a
-- su navegador — lo único que viaja es el sí o el no.
-- ============================================================

-- ============================================================
-- VUELTA ATRÁS (no ejecutar salvo que haga falta)
--
--   begin;
--   drop function if exists public.mp_configurado();
--   commit;
--
-- El código vuelve solo a leer la tabla, así que recepción deja de ver
-- los botones — que es lo que pasaba antes.
-- ============================================================
