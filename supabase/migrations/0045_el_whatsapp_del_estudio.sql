-- ============================================================
-- 0045 — El WhatsApp del estudio, que era el dato que faltaba
--
-- La `0033` dejó `studio_whatsapp` vacío a propósito, y lo dejó escrito: la
-- clave tenía cargado el número de la demo, "así que hasta hoy la web mandaba
-- a la gente a un teléfono que no es del estudio. Vacío es mejor que
-- equivocado — la pantalla esconde el botón cuando no hay número".
--
-- Vacío era lo correcto mientras no hubiera número. Ya hay, y lo que costaba
-- no tenerlo se ve mejor ahora que se enciende, porque no era un botón: era
-- la landing entera cayendo al mail.
--
--   · El botón del hero, "Reservá tu clase de prueba", NO SE DIBUJABA. No
--     estaba apagado ni gris: no existía, porque sin número no hay a dónde
--     mandar a nadie.
--   · "Reservar mi lugar" y los cinco "Consultar" de los planes abrían el
--     cliente de correo con el asunto escrito.
--   · El cierre decía "Escribinos por mail" en vez de "por WhatsApp".
--   · El pie no tenía el enlace de WhatsApp.
--
-- Todo eso cambia solo con cargar el número: el código ya armaba el link con
-- el mensaje escrito desde la `0011`, y lo único que faltaba era el dato.
--
-- El formato es el que pide `wa.me` y no el que uno escribiría en la agenda:
-- solo dígitos, 54 (país) + 9 (que WhatsApp exige para los móviles
-- argentinos) + 381 (Tucumán) + el abonado. **Sin el 9 el link abre un chat
-- que no existe, y eso no da error**: abre, la persona escribe y no llega
-- nadie. Por eso el `help` del campo lo explica: el estudio va a querer
-- cambiar este número alguna vez y no tiene por qué saber la regla.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

do $guarda$
begin
  if not exists (select 1 from public.studio_settings where key = 'studio_whatsapp') then
    raise exception 'Falta la clave studio_whatsapp. Revisar si corrió la 0011.';
  end if;
end
$guarda$;

update public.studio_settings
set value = '5493816249107',
    help = 'Solo dígitos, con código de país: 54 + 9 + característica sin el 0 + número sin el 15. Para Tucumán, 549381XXXXXXX. Vacío, la web esconde los botones de WhatsApp y ofrece el mail.'
where key = 'studio_whatsapp';

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
--   select key, value from public.studio_settings where key = 'studio_whatsapp';
--   → 5493816249107, trece dígitos.
--
-- Y en la pantalla, que es donde se ve de verdad:
--   · El hero tiene que mostrar el botón "Reservá tu clase de prueba", que
--     hasta ahora no aparecía.
--   · "Reservar mi lugar", los cinco "Consultar" y el cierre tienen que abrir
--     WhatsApp y no el correo.
--   · El pie tiene que tener el enlace de WhatsApp.
--
-- Y una cosa que no se comprueba con una consulta y hay que hacer a mano
-- UNA vez, antes de publicar: **abrir el link y confirmar que el chat es el
-- del estudio**. Un número con un dígito de más o de menos no falla, abre un
-- chat vacío — es exactamente el problema que vino a arreglar la 0033, y una
-- consulta SQL no lo distingue.
-- ============================================================

-- ============================================================
-- VUELTA ATRÁS (no ejecutar salvo que haga falta)
--
--   begin;
--   update public.studio_settings
--   set value = '',
--       help = 'Número con código de país, sin espacios ni signos. Ej: 5493815551234.'
--   where key = 'studio_whatsapp';
--   commit;
--
-- Vaciarlo devuelve la web al correo y esconde los botones. No rompe nada:
-- es el estado en el que estuvo hasta hoy.
-- ============================================================
