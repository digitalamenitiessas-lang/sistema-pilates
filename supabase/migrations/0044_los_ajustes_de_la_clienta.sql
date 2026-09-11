-- ============================================================
-- 0044 — Los ajustes que pidió la clienta sobre el diseño
--
-- Devolución del 11/09 sobre la landing. De los once puntos, cuatro no se
-- resuelven en el código porque no son código: son datos que el estudio
-- edita desde Configuración, y escribirlos en un componente los volvería a
-- congelar. Esta migración los deja como ella los pidió.
--
--   1. La dirección, en tres renglones y en su orden.
--   2. El horario, con el día y la hora separados.
--   3. "Pilates Embarazadas" encendida, que arranca con horario propio.
--   4. Las dos bajadas de disciplina, textuales de su referencia.
--
-- El código tolera que esto no haya corrido —no se rompe nada— pero conviene
-- ser exacto sobre qué se ve mientras tanto, porque no es lo que pidió la
-- clienta: los respaldos de `landing-page.tsx` traen la dirección y el horario
-- nuevos, pero un respaldo solo entra cuando la base devuelve vacío, y acá la
-- base tiene cargados los valores VIEJOS desde la 0033. Así que hasta que esto
-- corra, Open Studio sigue mostrando la dirección en una línea y el horario
-- corrido, y Pilates Embarazadas no aparece. Lo que sí anda sin la migración es
-- todo lo que es código: las fotos verticales, el marrón, el encuadre del
-- paisaje, el pie en natural y el link de Google Maps.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 0. QUE NO PASE EN SILENCIO
--
-- Lo que sigue son cinco `update ... where clave = ...` sin guarda. Si alguna
-- de esas filas no existiera, Postgres no se queja: afecta cero filas y hace
-- commit igual. En este proyecto las migraciones se pegan a mano y no hay un
-- registro infalible de cuáles corrieron, así que "cero filas" es un final
-- posible y es el peor: la migración parece haber andado y no cambió nada.
--
-- Esto la hace fallar fuerte y temprano, antes de tocar un solo dato.
-- ------------------------------------------------------------

do $guarda$
declare
  faltan text;
begin
  select string_agg(clave, ', ')
  into faltan
  from (values ('studio_address'), ('studio_hours'), ('studio_maps_url')) as v(clave)
  where not exists (
    select 1 from public.studio_settings s where s.key = v.clave
  );
  if faltan is not null then
    raise exception 'Faltan claves en studio_settings: %. Revisar si corrió la 0011.', faltan;
  end if;

  select string_agg(nombre, ', ')
  into faltan
  from (values ('Pilates Reformer'), ('Pilates Embarazadas')) as v(nombre)
  where not exists (
    select 1 from public.disciplines d where d.name = v.nombre
  );
  if faltan is not null then
    raise exception 'Faltan disciplinas en el catálogo: %. Revisar si corrió la 0026.', faltan;
  end if;
end
$guarda$;

-- ------------------------------------------------------------
-- 1. LA DIRECCIÓN, EN TRES RENGLONES
--
-- El orden es el que pidió: primero el shopping, que es la referencia que
-- la gente de Yerba Buena conoce y por la que va a buscar; después la
-- puerta y el local; al final la ciudad. Antes era una sola frase que
-- empezaba por la calle.
--
-- Los saltos de línea son parte del dato. La web los lee y arma un renglón
-- por línea (`bloquesDeTexto`), así que el estudio decide el corte sin
-- tocar el diseño. Por eso también cambia el `kind`: con `text` el campo de
-- Configuración es un input de una línea y no deja escribir un salto —
-- quedaría un dato que la web respeta y la pantalla no puede editar.
-- ------------------------------------------------------------

update public.studio_settings
set value = 'Mercato Shopping Viejo
Mariano Moreno 107, Local 10
Yerba Buena, Tucumán',
    kind = 'textarea',
    help = 'Un renglón por línea, como se lee en la web.'
where key = 'studio_address';

-- ------------------------------------------------------------
-- 2. EL HORARIO, CON AIRE
--
-- Dos bloques separados por una línea en blanco: el día arriba, la hora
-- abajo. La web separa los bloques entre sí más que los renglones de
-- adentro, que es lo que pidió cuando dijo "separar un poco más la
-- información".
--
-- El `kind` ya era `textarea` desde la 0011, así que acá solo cambia el
-- texto.
-- ------------------------------------------------------------

update public.studio_settings
set value = 'Lunes a viernes
de 8 a 20 horas

Sábados
de 9 a 13 horas',
    help = 'Un renglón por línea. Una línea en blanco abre un bloque nuevo: el día arriba, la hora abajo.'
where key = 'studio_hours';

-- ------------------------------------------------------------
-- 3. EL LINK DEL MAPA SIGUE VACÍO, Y AHORA ESO NO DEJA NADA SIN HACER
--
-- La clienta pidió que el pie tenga la ubicación de Google Maps. El link
-- propio del estudio nunca llegó, y antes eso significaba que el botón no
-- se dibujaba. Ahora, sin link cargado, la web arma la búsqueda con el
-- nombre y la dirección — que es exactamente lo que haría a mano quien
-- quiere ubicarlo, y no se rompe ni queda viejo.
--
-- El valor se queda vacío a propósito: el día que el estudio pegue el link
-- de su ficha de Google, ese manda. Lo único que cambia acá es el texto de
-- ayuda, para que la pantalla explique qué pasa si se deja vacío en vez de
-- que parezca un campo pendiente.
-- ------------------------------------------------------------

update public.studio_settings
set help = 'Link de la ficha del estudio en Google Maps. Vacío, la web arma la búsqueda con la dirección de arriba.'
where key = 'studio_maps_url';

-- ------------------------------------------------------------
-- 4. PILATES EMBARAZADAS SE ENCIENDE
--
-- La 0033 la apagó con un motivo escrito: "las dos disciplinas reales que
-- todavía no tienen grilla ni profesora. Se apagan, no se borran: el día
-- que existan se vuelven a encender". Ese día es hoy — la clienta avisó que
-- arranca con un horario especial.
--
-- El nombre no se toca. Ella la llamó "Pilates para embarazadas" en el
-- mensaje y "Pilates Prenatal" en su referencia; la fila se llama "Pilates
-- Embarazadas" desde la 0026 y el nombre viaja como texto a class_sessions,
-- plans.disciplines y teachers.disciplines. Renombrar es una cascada que se
-- hace desde Configuración cuando ella elija cómo quiere llamarla, no una
-- decisión nuestra metida en una migración.
--
-- El `sort_order` la deja segunda, detrás de Reformer (10), que es como la
-- pidió: "al lado de Pilates Reformer". Y Reformer sigue siendo la primera
-- activa del catálogo, así que el valor por defecto del formulario de clase
-- no se mueve.
--
-- OJO, lo mismo que dejó anotado la 0033 y sigue siendo cierto: que los
-- planes FE digan "solo Pilates Reformer" es configuración, no una regla
-- que rija. Hoy nada valida la disciplina al reservar. Encender esta
-- disciplina la hace visible y reservable; que una membresía de Reformer no
-- pueda gastar una clase acá se construye aparte.
-- ------------------------------------------------------------

update public.disciplines
set active = true,
    sort_order = 20
where name = 'Pilates Embarazadas';

-- ------------------------------------------------------------
-- 5. LAS DOS BAJADAS, TEXTUALES DE LA REFERENCIA
--
-- Tres líneas cortas por disciplina, separadas por punto medio: la web
-- parte por ese carácter y dibuja un renglón por cada una, como en el
-- mockup que mandó.
--
-- Van tal cual las escribió, incluido "Movimientos consciente" en singular,
-- que pidió usar "exactamente" la descripción de su referencia. Queda
-- anotado acá porque parece un error de tipeo y no una decisión: si lo era,
-- se corrige desde Configuración en diez segundos y sin migración.
-- ------------------------------------------------------------

update public.disciplines
set blurb = 'Movimientos controlados · Resultados intensos · Sentí el trabajo desde el inicio'
where name = 'Pilates Reformer';

update public.disciplines
set blurb = 'Movimientos consciente · Fuerza controlada · Acompañá tu embarazo en movimiento'
where name = 'Pilates Embarazadas';

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
--   select key, value, kind from public.studio_settings
--   where key in ('studio_address', 'studio_hours', 'studio_maps_url');
--   → la dirección con dos saltos y kind 'textarea'; el horario con tres
--     saltos (uno de ellos doble); el maps_url sigue vacío.
--
--   select name, active, sort_order, blurb from public.disciplines
--   where name in ('Pilates Reformer', 'Pilates Embarazadas');
--   → las dos con active = true, sort_order 10 y 20, y cada una con su bajada
--     de tres tramos separados por '·'.
--   (Va contra la TABLA y no contra la vista `public_disciplines`, que no
--    expone `active` porque ya filtra por esa columna: pedírsela da
--    ERROR 42703 y quien verifica se queda sin ningún control.)
--
--   select name, sort_order from public.public_disciplines;
--   → dos filas, Reformer primero. Esto es lo que ve la web sin sesión.
--
-- Y en la pantalla:
--   · La web tiene que mostrar las dos disciplinas una al lado de la otra,
--     con la foto vertical y las tres líneas debajo.
--   · Open Studio, el horario en dos bloques y la dirección en tres
--     renglones, empezando por "Mercato Shopping Viejo".
--   · El pie, un "Ver en Google Maps" que abre la dirección del estudio.
--   · Configuración → Estudio, la dirección editable como área de texto:
--     agregar un renglón ahí tiene que agregarlo en la web.
-- ============================================================

-- ============================================================
-- VUELTA ATRÁS (no ejecutar salvo que haga falta)
--
--   begin;
--
--   update public.studio_settings
--   set value = 'Mariano Moreno 107, Mercato Shopping Viejo, local 10, Yerba Buena, Tucumán',
--       kind = 'text',
--       help = 'Dirección que se muestra en la web.'
--   where key = 'studio_address';
--
--   update public.studio_settings
--   set value = 'Lunes a viernes de 8 a 20, sábados de 9 a 13',
--       help = 'Texto libre. Ej: Lunes a viernes de 7 a 21, sábados de 9 a 13.'
--   where key = 'studio_hours';
--
--   update public.studio_settings
--   set help = 'Se abre al tocar la dirección en la web.'
--   where key = 'studio_maps_url';
--
--   update public.disciplines
--   set active = false,
--       blurb = 'Acompañamiento durante el embarazo, con trabajo de piso pélvico, respiración y alivio de la zona lumbar.'
--   where name = 'Pilates Embarazadas';
--
--   update public.disciplines
--   set blurb = 'Resistencia con resortes para trabajar profundo, con precisión y sin impacto.'
--   where name = 'Pilates Reformer';
--
--   commit;
--
-- Los dos blurbs vuelven a los textos que cargó la 0026, que es lo único que
-- hace que la vuelta atrás sea de verdad una vuelta: apagar la disciplina sin
-- restaurar el texto deja el 'Movimientos consciente' esperando a que alguien
-- la vuelva a encender desde Configuración y lo publique sin saberlo.
--
-- Ojo con la vuelta atrás de la dirección: si el estudio ya la editó con
-- varios renglones, volver el kind a 'text' deja un dato con saltos que la
-- pantalla no puede corregir.
-- ============================================================
