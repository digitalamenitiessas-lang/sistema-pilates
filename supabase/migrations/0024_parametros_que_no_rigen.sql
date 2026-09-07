-- ============================================================
-- 0024 — Los parámetros que todavía no rigen lo dicen
--
-- Parametrizar destrabó la conversación con la clienta: en vez de frenar
-- a preguntar cada plazo, se cargó el parámetro con un valor razonable y
-- se siguió. Pero un parámetro no es solo la fila: es la fila MÁS el
-- código que la lee, y hoy hay trece filas sin su código.
--
-- El resultado es una pantalla que promete. La clienta entra a
-- Configuración, ve "Plazo de cancelación (horas)", lo pone en 3, guarda,
-- y el sistema sigue sin mirar ninguna hora. Peor que no tener el campo:
-- se va convencida de que la regla cambió.
--
-- El proyecto ya resolvió esto una vez, con los permisos en modo sombra:
-- se muestran, se pueden dejar armados, y avisan que todavía no rigen. Se
-- copia ese criterio.
--
-- La marca vive en la tabla y no en el código porque la pantalla de
-- parámetros se arma sola con lo que trae el catálogo: el día que se
-- escriba el código que lee `cancel_hours`, apagar el cartel es un
-- `update` de una fila, no un deploy.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- Por defecto rige: los que ya andan no tienen que enumerarse, y un
-- parámetro nuevo nace rigiendo salvo que se diga lo contrario.
alter table public.studio_settings
  add column if not exists rige boolean not null default true;

comment on column public.studio_settings.rige is
  'false = la fila existe y el código todavía no la lee. La pantalla lo avisa en vez de prometer.';

-- Las trece verificadas una por una: se buscó cada clave en lib/,
-- components/ y app/, y los llamadores de public.param() en las
-- migraciones. Ninguna aparece.
update public.studio_settings set rige = false where key in (
  -- Reservas: las tres las construye el trigger de consumo
  'cancel_hours',
  'class_consumption',
  'absence_consumes_class',
  -- Lista de espera: además cambia de sentido. La clienta avisa a todas a
  -- la vez, no de a una con reloj, así que este parámetro tal como está
  -- redactado contradice su política.
  'waitlist_offer_minutes',
  -- Membresías
  'freeze_max_days',
  'recovery_after_days',
  -- Horarios fijos y ciclo de cobro: todo el bloque de prioridad
  'priority_pay_from_day',
  'priority_pay_to_day',
  'slot_release_day',
  -- Avisos que todavía no se emiten
  'debt_reminder_days',
  'priority_reminder_days',
  -- Adjunto del comprobante de gasto: espera el primer uso de Storage
  'gastos_adjunto_habilitado',
  'gastos_adjunto_max_mb'
);

-- Y de paso, la etiqueta que hizo que la clienta no entendiera la
-- pregunta. "Recuperar" significa dos cosas en este proyecto: recuperar
-- una clase perdida y recuperar una alumna que dejó de venir. Queda
-- reservada para la clase; la alumna que se fue se "contacta".
update public.studio_settings set
  label = 'Días sin renovar para ponerla en la lista de contacto',
  help = 'Cuántos días después de vencer, sin renovar, una alumna aparece en la lista de las que dejaron de venir, para llamarla o escribirle.'
where key = 'recovery_after_days';

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
--   select key, label, rige from public.studio_settings order by rige, key;
--     → trece en false, el resto en true
--
-- Y en Configuración → Reglas del negocio, esos trece muestran
-- "Todavía no rige" y siguen siendo editables: la idea es que la clienta
-- pueda dejarlos armados, igual que la matriz de permisos en sombra.
--
-- CUANDO UNO EMPIECE A REGIR
--
--   update public.studio_settings set rige = true where key = 'cancel_hours';
--
-- Va en la misma migración que el código que lo lee, no antes.
-- ============================================================

-- ============================================================
-- VUELTA ATRÁS (no ejecutar salvo que haga falta)
--
--   begin;
--   update public.studio_settings set
--     label = 'Pasa a "por recuperar" (días)',
--     help  = 'Cuántos días después de vencer, sin renovar, una alumna entra en la lista de recuperación.'
--   where key = 'recovery_after_days';
--   alter table public.studio_settings drop column rige;
--   commit;
-- ============================================================
