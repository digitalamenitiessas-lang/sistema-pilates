-- ============================================================
-- 0026 — El catálogo real de Casa Fé
--
-- Hasta hoy el sistema muestra el catálogo de demo: seis disciplinas
-- inventadas y seis planes con precios inventados. Una clienta que entra
-- a la web ve "Yoga & Movimiento, 10 clases, $22.000", que no existe.
--
-- Esta migración carga lo que el estudio dicta de verdad: tres
-- disciplinas y las seis membresías del documento "Casa Fé — Membresías y
-- Condiciones", con sus precios de transferencia, que son los de base.
--
-- Va primero de todo el tramo final porque el estudio va a cargar a sus
-- clientas desde la pantalla, y no se puede dar de alta a nadie sin un
-- plan al que asignarla.
--
-- NADA SE BORRA NI SE APAGA. Esta migración solo SUMA: el catálogo de
-- prueba se queda conviviendo con el de Casa Fé, porque hasta que el
-- estudio cargue sus profesoras, sus salas y su grilla, las clases de
-- demo son lo único que hay para probar el flujo de punta a punta.
--
-- Al final del archivo está el bloque para apagar la demo, que se corre
-- aparte el día que existan los datos reales.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Las tres disciplinas
--
-- Se AGREGAN las dos que faltan en vez de renombrar las de demo. Es más
-- largo pero es lo honesto: renombrar 'Pilates Mat' a 'Pilates
-- Embarazadas' convertiría veintitrés clases de prueba en clases de
-- embarazadas, y esas clases todavía se ven en la agenda.
--
-- 'Pilates Reformer' ya existe con el nombre correcto: se queda y solo
-- se le ajusta el texto que lee la clienta en la web.
-- ------------------------------------------------------------

insert into public.disciplines (name, color, bg_color, text_color, blurb, sort_order) values
  ('Pilates Embarazadas', '#C98BA8', '#FBEDF3', '#7A2F4F',
   'Acompañamiento durante el embarazo, con trabajo de piso pélvico, respiración y alivio de la zona lumbar.', 20),
  ('Pilates 3ra Edad',    '#7E93B8', '#EBF0F7', '#2C4470',
   'Movilidad, equilibrio y fuerza a un ritmo cuidado, para sostener la autonomía en el día a día.', 30)
on conflict (name) do update set
  color = excluded.color,
  bg_color = excluded.bg_color,
  text_color = excluded.text_color,
  blurb = excluded.blurb,
  sort_order = excluded.sort_order,
  active = true;

update public.disciplines set
  blurb = 'Resistencia con resortes para trabajar profundo, con precisión y sin impacto.',
  sort_order = 10,
  active = true
where name = 'Pilates Reformer';

-- Las cinco de demo se quedan ACTIVAS por ahora, a propósito: hasta que
-- el estudio cargue su grilla real, las clases de prueba son lo único que
-- hay para probar el flujo de punta a punta, y una clase cuya disciplina
-- está apagada se dibuja sin color y sin descripción.
-- Se apagan con el bloque del final, el día que se carguen los datos
-- reales.

-- ------------------------------------------------------------
-- 2. Las seis membresías
--
-- Los precios son los de TRANSFERENCIA, que el documento define como el
-- valor base. El −5% de efectivo y el +25% de tarjeta no van acá: son
-- dos porcentajes por medio de pago, y van en su propia migración. Se
-- verificó sobre las seis filas que esos dos porcentajes reproducen la
-- tabla del documento sin una sola excepción, así que guardar tres
-- precios por plan sería guardar la misma información tres veces.
--
-- weekly_frequency es la que manda para el horario fijo; class_count es
-- su consecuencia: cuatro semanas por mes, según respondió la clienta
-- (un mes con cinco lunes no suma una quinta clase).
--
-- Las tres disciplinas en todos los planes: la clienta no contestó
-- todavía si un plan combina disciplinas, y de las dos opciones esta es
-- la reversible — sacarle disciplinas a un plan es un clic en Planes,
-- devolvérselas a una clienta que ya reservó no.
-- ------------------------------------------------------------

insert into public.plans
  (name, price, class_count, weekly_frequency, duration_days, disciplines, description, color, popular, is_trial)
values
  ('FE FIRST',   20000,  1, 0, 7,
   '{"Pilates Reformer","Pilates Embarazadas","Pilates 3ra Edad"}',
   'Clase de prueba o pase por un día, para conocer el estudio antes de contratar una membresía.',
   '#5E8FA8', false, true),

  ('FE START',   45000,  4, 1, 30,
   '{"Pilates Reformer","Pilates Embarazadas","Pilates 3ra Edad"}',
   '1 vez por semana · 4 clases por mes.',
   '#7D9B76', false, false),

  ('FE FLOW',    65000,  8, 2, 30,
   '{"Pilates Reformer","Pilates Embarazadas","Pilates 3ra Edad"}',
   '2 veces por semana · 8 clases por mes.',
   '#C4735A', true,  false),

  ('FE BALANCE', 80000, 12, 3, 30,
   '{"Pilates Reformer","Pilates Embarazadas","Pilates 3ra Edad"}',
   '3 veces por semana · 12 clases por mes.',
   '#D4A854', false, false),

  ('FE STRONG',  95000, 16, 4, 30,
   '{"Pilates Reformer","Pilates Embarazadas","Pilates 3ra Edad"}',
   '4 veces por semana · 16 clases por mes.',
   '#9B6E8E', false, false),

  ('FE FULL',   110000, 20, 5, 30,
   '{"Pilates Reformer","Pilates Embarazadas","Pilates 3ra Edad"}',
   '5 veces por semana · 20 clases por mes.',
   '#B8956A', false, false)
on conflict do nothing;

-- FE FIRST dura siete días y no uno, aunque el documento diga "pase por
-- 1 día": el límite real es que trae UNA clase, y siete días de vigencia
-- permiten venderlo con anticipación sin que venza antes de que la
-- persona venga. Es un número editable desde Planes.

-- Los seis de demo también se quedan activos por ahora. Apagarlos haría
-- que las once membresías de prueba dejaran de renovarse, y el proceso
-- diario emitiría un aviso de "No se renovó: plan desactivado" por cada
-- una: el mecanismo funcionando, pero ruido justo cuando hay que probar
-- otra cosa. Se apagan con el bloque del final.

-- ------------------------------------------------------------
-- 3. El estudio deja de llamarse PilatesStudio
--
-- El resto de los datos —dirección, WhatsApp, Instagram, email,
-- horarios— los carga ella desde Configuración: no los tenemos y poner
-- algo inventado es peor que dejarlos vacíos, porque van a la web.
-- ------------------------------------------------------------

update public.studio_settings set value = 'Casa Fé' where key = 'studio_name';

-- ------------------------------------------------------------
-- 4. El vocabulario de la base
--
-- La clienta pidió que en el sistema no se diga "alumnas" sino
-- "clientas". La pantalla se cambia en el código, pero hay textos que
-- viven en la base y se muestran igual: las etiquetas y las ayudas del
-- catálogo de permisos, que es lo que se lee en Configuración.
--
-- Se cambian las etiquetas y el nombre del grupo, que es lo que se lee.
-- Las CLAVES no se tocan —siguen siendo alumnos.ver, alumnos.crear—
-- porque son el identificador que usan las políticas de RLS y el código.
-- Renombrarlas sería romper el motor de permisos para ganar una palabra
-- que nadie ve.
--
-- Las AYUDAS tampoco se tocan, y es a propósito: varias citan archivos
-- del código ('ficha-alumno.tsx:328') y un reemplazo ciego las
-- convertiría en rutas que no existen. Queda algún "alumna" suelto ahí
-- adentro; es preferible a romper la referencia.
--
-- OJO para quien encienda los permisos: el comando documentado en
-- CLAUDE.md filtra por grupo, y a partir de acá ese grupo se llama
-- 'Clientas', no 'Alumnos'.
-- ------------------------------------------------------------

update public.permission_keys set
  etiqueta = replace(replace(replace(replace(replace(replace(etiqueta,
    'de alumnas', 'de clientas'),
    'una alumna', 'una clienta'),
    'la alumna', 'la clienta'),
    'de alumno', 'de clienta'),
    'un alumno', 'una clienta'),
    'Alumnos', 'Clientas'),
  grupo = case when grupo = 'Alumnos' then 'Clientas' else grupo end
where etiqueta like '%lumn%' or grupo = 'Alumnos';

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
--   select name, active, sort_order from public.disciplines order by sort_order;
--     → las tres de Casa Fé primero (Reformer, Embarazadas, 3ra Edad) y
--       las de demo abajo, todas activas todavía
--
--   select name, price, class_count, weekly_frequency, popular, is_trial
--   from public.plans where name like 'FE %' order by weekly_frequency;
--     → los seis FE, FE FLOW con popular = true, FE FIRST con is_trial = true
--
--   -- El precio de efectivo y el de tarjeta tienen que dar la tabla del
--   -- documento. Esto todavía NO lo calcula el sistema: es el control de
--   -- que los precios base están bien cargados.
--   select name, price as transferencia,
--          round(price * 0.95) as efectivo,
--          round(price * 1.25) as tarjeta
--   from public.plans where active and price > 0 order by price;
--     → 45.000 / 42.750 / 56.250 para FE START, y así con los seis
--
-- Y en la pantalla: al dar de alta una clienta aparecen los seis planes
-- FE junto a los de prueba, con FE FLOW destacado. La web muestra las
-- ocho disciplinas por ahora — las tres reales y las cinco de demo—,
-- hasta que se corra el bloque de APAGAR LA DEMO del final.
--
-- Nada del proceso diario cambia con esta migración.
-- ============================================================

-- ============================================================
-- APAGAR LA DEMO — correr ESTE BLOQUE APARTE, el día que el estudio
-- tenga cargadas sus profesoras, sus salas y su grilla real.
--
-- Hasta entonces las disciplinas y los planes de prueba conviven con los
-- de Casa Fé a propósito: son lo único que hay para probar el flujo
-- completo antes de que existan los datos verdaderos.
--
-- Después de esto la web pública muestra solo las tres disciplinas y los
-- seis planes FE, y el proceso diario va a avisar "No se renovó: plan
-- desactivado" por cada membresía de prueba que quede viva. Eso es
-- esperado: es la 0023 haciendo su trabajo.
--
--   begin;
--
--   update public.disciplines set active = false
--   where name in ('Pilates Mat', 'Pilates Clínico', 'Yoga', 'Stretching', 'Funcional');
--
--   update public.plans set active = false, popular = false
--   where name in ('Básico Mat', 'Reformer Premium', 'Full Flex',
--                  'Clínico Terapéutico', 'Yoga & Movimiento', 'Clase de Prueba');
--
--   commit;
--
-- Y para borrar del todo los datos de prueba —clientas, clases, pagos—
-- está la migración 0027, que lleva su propia guardia y pide backup.
-- ============================================================

-- ============================================================
-- VUELTA ATRÁS (no ejecutar salvo que haga falta)
--
--   begin;
--   update public.plans set active = true
--   where name in ('Básico Mat','Reformer Premium','Full Flex',
--                  'Clínico Terapéutico','Yoga & Movimiento','Clase de Prueba');
--   update public.plans set popular = true where name = 'Reformer Premium';
--   update public.plans set active = false where name like 'FE %';
--   update public.disciplines set active = true
--   where name in ('Pilates Mat','Pilates Clínico','Yoga','Stretching','Funcional');
--   update public.disciplines set active = false
--   where name in ('Pilates Embarazadas','Pilates 3ra Edad');
--   update public.studio_settings set value = 'PilatesStudio' where key = 'studio_name';
--   commit;
-- ============================================================
