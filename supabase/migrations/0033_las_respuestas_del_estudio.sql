-- ============================================================
-- 0033 — Las respuestas del estudio, del 09/09/2026
--
-- El estudio contestó el pedido de datos. Cuatro de esas respuestas son
-- configuración pura y entran acá; el resto (vigencia mensual, turnos
-- fijos, renovación) son desarrollo y van después.
--
--   1. El nombre es "Casa Fe", SIN TILDE, y llegaron dirección,
--      Instagram, email y horario de atención.
--   2. En una primera instancia se dicta ÚNICAMENTE Pilates Reformer, en
--      una sola sala de 8 reformers, con clases de 50 minutos.
--   3. En las pantallas se dice "cliente", en MASCULINO. El vocabulario
--      ya había pasado de "alumna" a "clienta" en la 0026; lo que cambia
--      ahora es el género.
--   4. NO existe el período general de pago del 1 al 9: cada membresía
--      vence en su propia fecha. Los cuatro parámetros que modelaban esa
--      ventana se van.
--
-- Nada de esto cambia una política ni un trigger de negocio: es catálogo,
-- parámetros y texto. Las dos funciones que se redefinen al final son de
-- notificación y lo único que les cambia es la palabra que se lee.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. LOS DATOS DEL ESTUDIO
--
-- Las siete claves ya existían desde la 0011 y cuatro estaban vacías. El
-- WhatsApp es el caso al revés y el más urgente: tenía cargado el número
-- de la demo, así que hasta hoy la web mandaba a la gente a un teléfono
-- que no es del estudio. Vacío es mejor que equivocado — la pantalla
-- esconde el botón cuando no hay número.
--
-- El link de Google Maps sigue vacío porque no llegó.
-- ------------------------------------------------------------

update public.studio_settings set value = 'Casa Fe'
where key = 'studio_name';

update public.studio_settings set value = 'Mariano Moreno 107, Mercato Shopping Viejo, local 10, Yerba Buena, Tucumán'
where key = 'studio_address';

update public.studio_settings set value = 'casafe.pilates'
where key = 'studio_instagram';

update public.studio_settings set value = 'casafe.pilates@gmail.com'
where key = 'studio_email';

update public.studio_settings set value = 'Lunes a viernes de 8 a 20, sábados de 9 a 13'
where key = 'studio_hours';

update public.studio_settings set value = ''
where key = 'studio_whatsapp' and value = '5493813007791';

-- ------------------------------------------------------------
-- 2. SOLO PILATES REFORMER
--
-- Esto va ANTES de cargar la grilla, y el orden no es una preferencia:
-- el formulario de clase toma como valor por defecto la primera
-- disciplina activa del catálogo y la primera sala. Con las cinco de
-- demo encendidas, cada clase que se cargue nace con la disciplina y la
-- sala equivocadas, y como `class_sessions.room` es texto libre sin
-- clave foránea, nada se queja nunca.
--
-- Es el bloque que la 0026 dejó escrito y comentado para correr aparte,
-- más las dos disciplinas de Casa Fé que todavía no se dictan y las tres
-- salas de demo.
-- ------------------------------------------------------------

-- Las cinco de demo.
update public.disciplines set active = false
where name in ('Pilates Mat', 'Pilates Clínico', 'Yoga', 'Stretching', 'Funcional');

update public.plans set active = false, popular = false
where name in ('Básico Mat', 'Reformer Premium', 'Full Flex',
               'Clínico Terapéutico', 'Yoga & Movimiento', 'Clase de Prueba');

-- Las dos disciplinas reales que todavía no tienen grilla ni profesora.
-- Se apagan, no se borran: el día que existan se vuelven a encender con
-- su color y su texto ya cargados.
update public.disciplines set active = false
where name in ('Pilates Embarazadas', 'Pilates 3ra Edad');

-- El orden explícito, para que "la primera del catálogo" sea Reformer
-- pase lo que pase. Reformer y Embarazadas compartían el 20 en el seed.
update public.disciplines set sort_order = 10 where name = 'Pilates Reformer';
update public.disciplines set sort_order = 20 where name = 'Pilates Embarazadas';
update public.disciplines set sort_order = 30 where name = 'Pilates 3ra Edad';

-- Una sola sala: 8 reformers, y las otras tres son de la demo.
update public.rooms set active = false
where name <> 'Sala Reformer';

-- Los seis planes FE nacieron habilitando las tres disciplinas porque
-- cuando se cargaron todavía no estaba contestado si un plan mezclaba.
-- Ya está contestado: la membresía de Reformer no se combina con
-- embarazadas, que va a tener su propia modalidad.
--
-- OJO, y hay que decirlo porque la pantalla promete más de lo que hay:
-- esto es CONFIGURACIÓN, no una regla que rija. Hoy nada valida la
-- disciplina al reservar — ni el trigger de consumo, ni el de cupo, ni
-- las políticas. Que el plan diga "solo Reformer" no impide anotarse a
-- una clase de embarazadas: eso se construye aparte.
update public.plans set disciplines = '{"Pilates Reformer"}'
where name like 'FE %';

-- ------------------------------------------------------------
-- 3. LOS VALORES POR DEFECTO DE UNA CLASE
--
-- Todas las clases del estudio duran 50 minutos y tienen 8 lugares, y el
-- formulario venía con 55 y 10 escritos en el código. Sesenta clases por
-- cargar, dos campos que corregir a mano en cada una.
--
-- Van como parámetro y no como literal por el criterio de la casa: un
-- número que el estudio puede querer cambiar no se escribe en el código.
-- Si el estudio suma una clase de 25 minutos, el default sigue siendo el
-- de siempre y esa clase se carga distinto; el default no es un tope.
-- ------------------------------------------------------------

insert into public.studio_settings (key, value, kind, options, label, help, group_key, sort_order, is_public) values
  ('class_default_minutes',  '50', 'number', '{}', 'Duración de una clase (minutos)',
   'El valor con el que arranca el formulario al crear una clase. No es un límite: cada clase puede tener otra duración.', 'reservas', 50, false),
  ('class_default_capacity', '8',  'number', '{}', 'Lugares por clase',
   'El valor con el que arranca el formulario al crear una clase. Casa Fe tiene 8 reformers en una sola sala.', 'reservas', 60, false)
on conflict (key) do nothing;

-- ------------------------------------------------------------
-- 4. "CLIENTE", EN MASCULINO
--
-- El texto que se lee cambia; los identificadores no. Las claves siguen
-- siendo alumnos.ver, alumnos.crear, alumnos.editar: son lo que usan las
-- políticas de RLS y el código, y renombrarlas sería romper el motor de
-- permisos para ganar una palabra que nadie ve.
--
-- Las ayudas de permisos son el caso delicado, y es la razón por la que
-- la 0026 las salteó: varias citan archivos del código
-- ('ficha-alumno.tsx:328'), otra cita una clave ('alumnos.editar') y dos
-- citan el valor del rol entre comillas ('alumno'). Un replace ciego los
-- convierte en referencias que no existen. Así que acá se protegen esos
-- tokens, se cambia la prosa, y se restauran.
--
-- La función es de un solo uso y se borra al final: no queda nada en el
-- esquema.
-- ------------------------------------------------------------

-- Va como bucle sobre una lista de pares y no como replace() anidado a
-- propósito: son treinta reemplazos y el orden entre ellos es la mitad
-- del sentido. Anidados no se pueden leer ni contar; así se verifica de
-- arriba a abajo.
create or replace function public.masculinizar(t text)
returns text
language plpgsql
immutable
as $$
declare
  v     text := t;
  par   text[];
  pares text[][] := array[
    -- Los tokens de código salen de circulación mientras se toca la
    -- prosa. Son los que la 0026 no quiso arriesgar.
    array['ficha-alumno.tsx',      '«ARCHIVO_FICHA»'],
    array['alumno-form-modal.tsx', '«ARCHIVO_MODAL»'],
    array['alumnos-page.tsx',      '«ARCHIVO_LISTA»'],
    array['alumnos.',              '«CLAVE»'],
    array['''alumno''',            '«ROL»'],

    -- La prosa, de la forma larga a la corta: si "alumna" se aplicara
    -- antes, "una alumna" quedaría en "una cliente".
    --
    -- Y primero las contracciones, que es donde el femenino esconde su
    -- trampa: "de la alumna" en masculino no es "de el cliente" sino
    -- "del cliente". Lo mismo "a la alumna" → "al cliente".
    array['de la alumna',  'del cliente'],
    array['a la alumna',   'al cliente'],
    array['de la clienta', 'del cliente'],
    array['a la clienta',  'al cliente'],
    array['De la alumna',  'Del cliente'],
    array['A la alumna',   'Al cliente'],
    array['De la clienta', 'Del cliente'],
    array['A la clienta',  'Al cliente'],

    array['de alumnas',   'de clientes'],
    array['las alumnas',  'los clientes'],
    array['los alumnos',  'los clientes'],
    array['una alumna',   'un cliente'],
    array['la alumna',    'el cliente'],
    array['de alumna',    'de cliente'],
    array['un alumno',    'un cliente'],
    array['el alumno',    'el cliente'],
    array['del alumno',   'del cliente'],
    array['de clientas',  'de clientes'],
    array['las clientas', 'los clientes'],
    array['una clienta',  'un cliente'],
    array['la clienta',   'el cliente'],
    -- Las mismas con mayúscula inicial: "La alumna deja de..." no cae en
    -- la regla de arriba porque ahí el artículo va en mayúscula, y sin
    -- estas líneas terminaría en "La cliente".
    array['Las alumnas',  'Los clientes'],
    array['Los alumnos',  'Los clientes'],
    array['Una alumna',   'Un cliente'],
    array['La alumna',    'El cliente'],
    array['Un alumno',    'Un cliente'],
    array['El alumno',    'El cliente'],
    array['Las clientas', 'Los clientes'],
    array['Una clienta',  'Un cliente'],
    array['La clienta',   'El cliente'],

    array['Alumnas',      'Clientes'],
    array['Alumnos',      'Clientes'],
    array['Clientas',     'Clientes'],
    array['alumnas',      'clientes'],
    array['alumnos',      'clientes'],
    array['clientas',     'clientes'],
    array['Alumna',       'Cliente'],
    array['Alumno',       'Cliente'],
    array['Clienta',      'Cliente'],
    array['alumna',       'cliente'],
    array['alumno',       'cliente'],
    array['clienta',      'cliente'],

    -- Y vuelven los tokens.
    array['«ARCHIVO_FICHA»', 'ficha-alumno.tsx'],
    array['«ARCHIVO_MODAL»', 'alumno-form-modal.tsx'],
    array['«ARCHIVO_LISTA»', 'alumnos-page.tsx'],
    array['«CLAVE»',         'alumnos.'],
    array['«ROL»',           '''alumno''']
  ];
begin
  foreach par slice 1 in array pares loop
    v := replace(v, par[1], par[2]);
  end loop;
  return v;
end;
$$;

-- Las etiquetas y las ayudas de los permisos. Tolera las dos
-- situaciones, porque no hay registro de qué migraciones se aplicaron:
-- si la 0026 corrió, las etiquetas dicen "clienta"; si no, "alumna".
update public.permission_keys set
  etiqueta = public.masculinizar(etiqueta),
  ayuda    = public.masculinizar(ayuda)
where etiqueta like '%lumn%' or etiqueta like '%lient%'
   or ayuda    like '%lumn%' or ayuda    like '%lient%';

-- El grupo va por su TERCER nombre: 'Alumnos' → 'Clientas' → 'Clientes'.
-- Importa para quien encienda los permisos: el comando de CLAUDE.md
-- filtra por grupo, y un runbook viejo va a filtrar por uno que no
-- existe y no encender nada, sin error.
update public.permission_keys set grupo = 'Clientes'
where grupo in ('Alumnos', 'Clientas');

-- Las ayudas de Configuración que le hablan a la clienta del estudio.
update public.studio_settings set
  label = public.masculinizar(label),
  help  = public.masculinizar(help)
where label like '%lumn%' or label like '%lient%'
   or help  like '%lumn%' or help  like '%lient%';

drop function public.masculinizar(text);

-- Los dos avisos cuyo texto vive dentro de una función, no en una tabla.
-- Se redefinen enteras porque el texto es código: lo único que cambia es
-- la palabra. El tipo 'nuevo_alumno' y el dedupe_key 'alumno-' se quedan
-- como están: son identificadores, y cambiarlos duplicaría los avisos ya
-- emitidos.
--
-- Las filas de notifications YA creadas conservan el texto viejo. Eso es
-- correcto: son el registro de lo que se dijo en su momento.

create or replace function public.notify_new_student()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.notifications (type, title, body, student_id, audience, dedupe_key)
  values (
    'nuevo_alumno',
    'Nuevo cliente',
    new.name || ' se sumó al estudio',
    new.id,
    'staff',
    'alumno-' || new.id
  )
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

create or replace function public.notify_payment_paid()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_student_name text;
begin
  if new.status = 'pagado' and (tg_op = 'INSERT' or old.status is distinct from 'pagado') then
    select name into v_student_name from public.students where id = new.student_id;
    insert into public.notifications (type, title, body, student_id, payment_id, audience, dedupe_key)
    values (
      'pago_acreditado',
      'Pago acreditado',
      coalesce(v_student_name, 'Un cliente') || ' pagó $' || trim(to_char(new.amount, 'FM999G999G999'))
        || coalesce(' — ' || nullif(new.concept, ''), ''),
      new.student_id,
      new.id,
      'staff',
      'pago-' || new.id
    )
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 5. SE DEROGA LA VENTANA DE PAGO DEL 1 AL 9
--
-- El documento de condiciones decía que el cobro era del 1 al 9 y sobre
-- eso se sembraron cuatro parámetros. La respuesta del 09/09 lo dio de
-- baja con estas palabras: "No existe un período general de pago del 1
-- al 9". Cada membresía vence en su propia fecha individual.
--
-- Borrarlas no rompe nada porque nunca llegaron a regir: la 0024 ya las
-- había marcado `rige = false` después de buscar cada clave en lib/,
-- components/ y app/ sin encontrar un solo lector. La regla del 1 al 9
-- fue siempre una promesa de pantalla.
--
-- Se borran en vez de reetiquetarse porque el reloj no cambió de número:
-- cambió de naturaleza. `slot_release_day = 10` no tiene traducción a
-- "el día después del vencimiento de cada una" — el día del mes deja de
-- significar algo.
-- ------------------------------------------------------------

delete from public.studio_settings
where key in ('priority_pay_from_day', 'priority_pay_to_day',
              'slot_release_day', 'priority_reminder_days');

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
--   -- Los datos del estudio, y que no quede nada de la demo
--   select key, value from public.studio_settings where group_key = 'estudio' order by sort_order;
--
--   -- Solo Reformer activa, y una sola sala
--   select name, active, sort_order from public.disciplines order by active desc, sort_order;
--   select name, active from public.rooms order by active desc, name;
--   select name, active, disciplines from public.plans order by active desc, name;
--
--   -- Ni una palabra en femenino ni "alumn" en lo que se lee...
--   select clave, etiqueta, grupo from public.permission_keys
--   where etiqueta like '%lumn%' or etiqueta like '%lienta%' or grupo <> 'Clientes' and grupo like '%lient%';
--
--   -- ...y que las referencias de las ayudas sobrevivieron intactas
--   select clave, ayuda from public.permission_keys
--   where clave in ('usuarios.crear_alumno', 'salud.editar', 'portal.autoregistro');
--   -- tienen que seguir diciendo ficha-alumno.tsx, alumnos.editar y 'alumno'
--
--   -- La ventana del 1 al 9 ya no existe
--   select count(*) from public.studio_settings where key like 'priority%' or key = 'slot_release_day';
--   -- 0
--
--   -- Y el invariante de siempre
--   select * from public.perm_diff();
--   -- cero filas
-- ============================================================

-- ============================================================
-- VUELTA ATRÁS (no ejecutar salvo que haga falta)
--
-- El texto en femenino no se puede reconstruir con un replace inverso
-- ('cliente' no dice si venía de "alumna" o de "clienta"), así que la
-- vuelta atrás del punto 4 es volver a correr la 0012 y la 0026 sobre
-- permission_keys. Lo que sí se revierte solo:
--
--   begin;
--
--   update public.disciplines set active = true
--   where name in ('Pilates Mat','Pilates Clínico','Yoga','Stretching','Funcional',
--                  'Pilates Embarazadas','Pilates 3ra Edad');
--   update public.plans set active = true
--   where name in ('Básico Mat','Reformer Premium','Full Flex',
--                  'Clínico Terapéutico','Yoga & Movimiento','Clase de Prueba');
--   update public.plans set popular = true where name = 'Reformer Premium';
--   update public.plans set disciplines = '{"Pilates Reformer","Pilates Embarazadas","Pilates 3ra Edad"}'
--   where name like 'FE %';
--   update public.rooms set active = true;
--
--   delete from public.studio_settings
--   where key in ('class_default_minutes','class_default_capacity');
--
--   insert into public.studio_settings (key, value, kind, options, label, help, group_key, sort_order, is_public, rige) values
--     ('priority_pay_from_day', '1',  'number', '{}', 'La ventana de pago abre el día',   'Desde qué día del mes se puede pagar para conservar el horario fijo del mes siguiente.', 'cobros', 20, false, false),
--     ('priority_pay_to_day',   '9',  'number', '{}', 'La ventana de pago cierra el día', 'Hasta qué día del mes se conserva la prioridad sobre el horario fijo.',                  'cobros', 30, false, false),
--     ('slot_release_day',      '10', 'number', '{}', 'Los lugares se liberan el día',    'Desde qué día del mes se liberan los horarios fijos de quienes no pagaron.',             'cobros', 40, false, false),
--     ('priority_reminder_days','4',  'number', '{}', 'Recordatorio de la ventana de pago (días antes)', 'Cuántos días antes del cierre de la ventana se le recuerda que pague para conservar su horario.', 'avisos', 20, false, false);
--
--   commit;
-- ============================================================
