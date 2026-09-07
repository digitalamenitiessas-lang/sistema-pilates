-- ============================================================
-- 0023 — El salteo de la renovación deja rastro
--
-- El proceso diario renueva las membresías vencidas con auto_renew y
-- saltea tres casos con un mismo `continue` mudo: la clase de prueba (por
-- diseño, 0010), la alumna dada de baja (0015) y el plan desactivado.
--
-- Los dos primeros son decisiones tomadas. El tercero no: alcanza con
-- destildar un plan en la pantalla de Planes para que la renovación de
-- todas las alumnas que lo tenían se apague esa misma noche, sin que nada
-- lo diga. El estudio se entera el martes a las nueve, cuando la alumna
-- llega y el sistema no la deja reservar.
--
-- Y no es hipotético: el paso siguiente del plan es desactivar los seis
-- planes de demo de la 0001 y sembrar los seis reales de la clienta.
--
-- El aviso genérico que hoy se emite igual ("Membresía vencida") no
-- alcanza: es la misma línea que produce una alumna que decidió no
-- seguir, y lo que hay que distinguir es justamente eso. De ahí el tipo
-- propio, que además lleva a Planes en vez de a Alumnos.
--
-- La 0007 ya dejó armado el mecanismo entero —la tabla, el dedupe_key, la
-- campana del staff—, así que acá va solo lo que falta: el tipo en el
-- CHECK.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- Se reescribe la lista completa: un CHECK no se extiende, se reemplaza.
-- Los tres tipos de caja vienen de la 0020 y tienen que seguir estando
-- aunque todavía nadie los emita — si se cayeran de esta lista, la 0020
-- quedaría deshecha sin que ningún error lo dijera.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'pago_acreditado', 'nuevo_alumno',
  'membresia_por_vencer', 'membresia_vencida', 'deuda_vencida',
  'membresia_renovada',
  'caja_sin_cerrar', 'caja_diferencia', 'saldo_sin_imputar',
  'renovacion_omitida'
));

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
--   -- El tipo nuevo entra
--   insert into public.notifications (type, title, body, audience, dedupe_key)
--   values ('renovacion_omitida', 'prueba', '', 'staff', 'prueba-0023');
--   delete from public.notifications where dedupe_key = 'prueba-0023';
--
--   -- Y los de la 0020 siguen entrando
--   insert into public.notifications (type, title, body, audience, dedupe_key)
--   values ('caja_diferencia', 'prueba', '', 'staff', 'prueba-0023b');
--   delete from public.notifications where dedupe_key = 'prueba-0023b';
--
-- En la pantalla no cambia nada hasta que el cron emita el tipo nuevo. La
-- campana ya sabe dibujarlo, y si no lo conociera lo dibujaría gris en vez
-- de romperse: eso se arregló antes de esta migración, a propósito.
-- ============================================================

-- ============================================================
-- VUELTA ATRÁS (no ejecutar salvo que haga falta)
--
--   begin;
--
--   -- Las filas ya emitidas hay que resolverlas primero: con el CHECK
--   -- viejo puesto, una sola fila 'renovacion_omitida' impide recrearlo.
--   -- Se borran en vez de reetiquetarse: son avisos, no historia
--   -- contable, y cambiarles el tipo dejaría en la campana un motivo
--   -- falso.
--   delete from public.notifications where type = 'renovacion_omitida';
--
--   alter table public.notifications drop constraint notifications_type_check;
--   alter table public.notifications add constraint notifications_type_check check (type in (
--     'pago_acreditado', 'nuevo_alumno',
--     'membresia_por_vencer', 'membresia_vencida', 'deuda_vencida',
--     'membresia_renovada',
--     'caja_sin_cerrar', 'caja_diferencia', 'saldo_sin_imputar'
--   ));
--
--   commit;
-- ============================================================
