-- 0081 — Las reglas se encienden desde el sistema
--
-- El 24/09 hubo que entrar al SQL Editor para prender el tope de
-- devoluciones por cancelar. La pantalla de Configuración mostraba
-- "Todavía no rige" y no tenía con qué prenderlo: `saveSettings` toca
-- `value` y nada más. O sea que cada regla nueva obliga a pedirle a
-- alguien que escriba SQL, que es justo lo que este proyecto viene
-- evitando.
--
-- LO QUE SE DESCUBRIÓ AL IR A HACERLO, Y POR QUÉ HACE FALTA UNA COLUMNA
--
-- Poner el botón en todos los parámetros que no rigen habría sido peor
-- que no ponerlo. De los seis apagados hoy, CINCO no los lee nadie:
-- `freeze_max_days`, `waitlist_offer_minutes`, `debt_reminder_days` y los
-- dos de adjuntos de gastos aparecen únicamente en su propio alta (0011,
-- 0020) y en la lista de la 0024. No hay código que los consulte, ni acá
-- ni en el navegador.
--
-- Entonces un botón "Encender" al lado de `freeze_max_days` le diría al
-- estudio que puede congelar membresías, y congelar membresías no existe.
-- Sería el peor tipo de error de este sistema: no falla, miente.
--
-- Porque `rige` tapa dos cosas distintas que hasta hoy no hizo falta
-- separar:
--
--   a) el código todavía no lee este parámetro   -> un hecho nuestro,
--      no una decisión del estudio, y no hay nada que prender
--   b) el código lo lee y respeta, y que se aplique o no es una
--      DECISIÓN DEL ESTUDIO                      -> esto sí se prende
--
-- `encendible` marca las del caso (b), que son las únicas que se ofrecen
-- con interruptor. Nace en false: un parámetro nuevo no es encendible
-- hasta que alguien escribió el código que lo honra y lo dice acá.
--
-- Hoy son dos, y las dos salieron del pedido del estudio sobre
-- cancelaciones:
--   · cancel_free_max — el tope de devoluciones (0076), prendido el 24/09
--   · recovery_max    — las recuperaciones (0046), apagado a propósito
--
-- CÓMO VERIFICAR
--   select key, value, rige, encendible
--     from public.studio_settings
--    where encendible or not rige
--    order by encendible desc, key;
--
--   Tienen que salir dos con encendible = true (cancel_free_max, rige;
--   recovery_max, sin regir) y cinco con encendible = false y sin regir,
--   que son las que no lee nadie todavía.

begin;

alter table public.studio_settings
  add column if not exists encendible boolean not null default false;

comment on column public.studio_settings.encendible is
  'true = el código ya honra este parámetro y que rija o no es decisión del estudio, que lo prende desde Configuración. false = todavía no lo lee nadie, así que no hay nada que prender: la pantalla lo avisa y no ofrece el botón.';

update public.studio_settings
   set encendible = true
 where key in ('cancel_free_max', 'recovery_max');

commit;

-- ------------------------------------------------------------
-- LO QUE ESTA MIGRACIÓN NO HACE, A PROPÓSITO
--
-- No toca `rige` de ninguna fila. Prender y apagar es de acá en más un
-- acto del estudio, con su fecha y su responsable, no algo que se
-- arrastre en una migración.
--
-- Y no restringe por columna: RLS filtra filas, no columnas, así que
-- quien tiene `config.editar` puede tocar `rige` igual que `value`. Es
-- la misma llave para las dos cosas y está bien que así sea — el
-- parámetro y su vigencia son la misma decisión.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- VUELTA ATRÁS
-- ------------------------------------------------------------
--
--   begin;
--   alter table public.studio_settings drop column if exists encendible;
--   commit;
--
-- Sin la columna, el tipo de TypeScript la lee como undefined y la
-- pantalla no dibuja ningún interruptor: vuelve a quedar como estaba,
-- avisando que no rige y sin ofrecer prenderlo.
