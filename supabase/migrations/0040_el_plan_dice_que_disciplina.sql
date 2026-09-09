-- ============================================================
-- 0040 — El plan dice qué disciplina, y ahora rige
--
-- La respuesta del estudio del 09/09, textual:
--
--   "La membresia de Pilates Reformer NO podra combinarse con clases para
--    embarazadas. Las clases para embarazadas tendran: membresia o
--    modalidad especifica, dias y horarios propios, cupos independientes,
--    profesora asignada, grilla separada de Pilates Reformer. No se
--    mezclaran ambas modalidades dentro de una misma clase."
--
-- De eso, casi todo YA FUNCIONABA sin construir nada: el día, la hora, el
-- cupo y la profesora son columnas de cada clase, y el cupo además se
-- puede pisar por fecha (0018). "Grilla separada" se resuelve cargando las
-- clases, no programando.
--
-- Lo único que faltaba era el impedimento. La 0033 dejó los seis planes FE
-- habilitando solo 'Pilates Reformer' —eso fue lo fácil, un update— pero
-- NADA lo validaba al reservar: ni el trigger de consumo de la 0029, ni el
-- de cupo de la 0018, ni las políticas de RLS. O sea que el formulario de
-- Planes rotulaba el campo "Disciplinas habilitadas *", no dejaba guardar
-- sin elegir al menos una, y detrás no había nada.
--
-- Eso es lo que este proyecto trata como defecto y no como pendiente: la
-- pantalla prometiendo una regla que la base no aplica.
--
-- POR QUÉ AHORA, SI HOY NO MUERDE. Hay una sola disciplina activa: todos
-- los planes y las 64 clases son Reformer, así que esta migración no
-- cambia ni una reserva. Muerde el día que se cargue la grilla de
-- embarazadas — y ese es exactamente el día en que nadie va a estar
-- mirando esto, porque va a estar cargando horarios.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

create or replace function public.reserva_en_hora()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  -- Bandera y no una expresión con `and`: el AND de SQL no garantiza
  -- evaluación perezosa, y en un INSERT OLD no existe —es un registro sin
  -- asignar, no una fila de nulos— así que leerle un campo levanta
  -- 'record "old" is not assigned yet' y falla toda reserva nueva. La 0022
  -- ya lo dejó escrito para stamp_reservation; acá se respeta.
  v_reabre boolean := false;
  v_kind   text;
  v_disc   text;
  v_alumna uuid;
  v_mem    uuid;
  v_plan   text;
  v_dow    int;
  v_fecha  date;
  -- La identidad de la fila que va a QUEDAR. En un UPDATE no se lee de
  -- new: quien reactiva manda esas columnas y `consumir_clase` las clava
  -- después contra las de old, así que validar new sería validar lo que
  -- llegó y no lo que se escribe.
  v_clase  uuid;
  v_dia    date;
  v_inicio timestamptz;
  v_corte  int;
  v_dias   text[] := array['lunes', 'martes', 'miércoles', 'jueves',
                           'viernes', 'sábado', 'domingo'];
begin
  if tg_op = 'UPDATE' then
    -- Vuelve a tomar un lugar: 'lista de espera' entra porque anotarse en
    -- la espera de una clase que ya pasó tampoco tiene sentido, y sin ella
    -- cancelar y pasar a la espera era la puerta de atrás.
    v_reabre := new.status in ('confirmada', 'asistió', 'lista de espera')
                and old.status in ('cancelada', 'lista de espera', 'ofrecida');
  end if;

  -- En una rama y no en un `case`, por el mismo motivo que v_reabre: el
  -- manual garantiza que CASE evalúa solo el brazo elegido, pero el
  -- precedente de la casa (0022) es no depender del orden de evaluación
  -- cuando OLD está en juego, y acá no cuesta nada respetarlo.
  if tg_op = 'UPDATE' then
    v_clase  := old.class_id;
    v_dia    := old.date;
    v_alumna := old.student_id;
  else
    v_clase  := new.class_id;
    v_dia    := new.date;
    v_alumna := new.student_id;
  end if;

  if tg_op <> 'INSERT' and not v_reabre then
    return new;
  end if;

  select cs.kind, cs.day_of_week, cs.date, cs.discipline
  into v_kind, v_dow, v_fecha, v_disc
  from public.class_sessions cs where cs.id = v_clase;

  -- ---- La fecha tiene que ser un día en que esa clase se dicta ----
  --
  -- Solo en el INSERT: en una reactivación la fecha ya está escrita, y
  -- rechazarla ahí sería trabar la salida en vez de la entrada.
  --
  -- Y solo de hoy en adelante. La grilla cambia: el día que el estudio
  -- mueva una clase de los lunes a los martes, `day_of_week` pasa a decir
  -- martes y todas las fechas pasadas de esa clase dejan de cerrar. Sin
  -- este corte, cargar una reserva vieja —o volver a cargar un día entero
  -- después de un problema— se vuelve imposible, y el mensaje culparía a
  -- la fecha en vez de al cambio de grilla.
  --
  -- Hacia adelante no hay permiso que valga, y eso sí es a propósito: no
  -- es una excepción autorizada, es un dato que no cierra. Una reserva del
  -- martes contra la clase de los lunes no aparece en ninguna lista de
  -- asistentes y no la ve nadie hasta que la clienta reclama la clase que
  -- pagó.
  if tg_op = 'INSERT'
     and new.date >= (now() at time zone 'America/Argentina/Buenos_Aires')::date then
    if v_kind = 'especial' then
      if v_fecha is distinct from new.date then
        raise exception
          'Esa clase especial se dicta el %, no el %',
          to_char(v_fecha, 'DD/MM/YYYY'), to_char(new.date, 'DD/MM/YYYY');
      end if;
    elsif v_dow is not null
          and extract(isodow from new.date)::int - 1 <> v_dow then
      raise exception
        'Esa clase se dicta los %, y el % es %',
        v_dias[v_dow + 1],
        to_char(new.date, 'DD/MM/YYYY'),
        v_dias[extract(isodow from new.date)::int];
    end if;
  end if;

  -- ---- Y la clase tiene que ser de una disciplina que su plan habilita ----
  --
  -- Es la respuesta del estudio del 09/09, textual: "La membresia de Pilates
  -- Reformer NO podra combinarse con clases para embarazadas", con "cupos
  -- independientes" y "grilla separada".
  --
  -- Hasta hoy eso era una promesa de pantalla: el formulario de Planes
  -- rotula el campo "Disciplinas habilitadas *" y no deja guardar sin elegir
  -- al menos una, pero NADA lo validaba al reservar — ni el trigger de
  -- consumo, ni el de cupo, ni las políticas. El estudio iba a entrar a
  -- Planes, iba a destildar 'Pilates Embarazadas' de FE FLOW, y no iba a
  -- pasar nada.
  --
  -- POR QUÉ ACÁ Y NO EN `consumir_clase`, que era el lugar obvio porque ahí
  -- ya se resuelve la membresía: esa función arranca con
  -- `if not consumo_rige() then return new`. El freno de mano de la 0029
  -- apagaría también esta regla, y la disciplina que puede tomar una clienta
  -- no tiene nada que ver con si el descuento de clases está funcionando.
  -- Es el mismo criterio con el que la 0038 eligió este trigger.
  --
  -- Sin membresía no se dice nada: de eso se ocupa `consumir_clase`, y
  -- duplicar el mensaje acá sería contestar dos veces la misma pregunta con
  -- palabras distintas.
  --
  -- SIN SALIDA POR PERMISO, y es una decisión que conviene poder revisar:
  -- el estudio lo dijo en términos categóricos y las clases de embarazadas
  -- tienen cupo y profesora propios, así que meter a alguien de Reformer no
  -- es una excepción del mostrador, es romper la modalidad. Si mañana
  -- resulta que el mostrador necesita hacerlo, la salida es darle el plan
  -- que corresponde —que es una acción real del negocio— o agregarle acá el
  -- mismo escape por permiso que tiene el corte por horario.
  if v_disc is not null then
    v_mem := public.membresia_para(v_alumna, v_dia);
    if v_mem is not null then
      select p.name into v_plan
      from public.memberships m
      join public.plans p on p.id = m.plan_id
      where m.id = v_mem and not (v_disc = any (p.disciplines));

      if v_plan is not null then
        raise exception
          'El plan % no incluye %. Para anotarla en esta clase necesita el plan de esa modalidad',
          v_plan, v_disc;
      end if;
    end if;
  end if;

  -- ---- Recepción sí puede anotar después ----
  --
  -- El que llegó sin reserva y se la cargan cuando terminó. Las tres
  -- claves, no solo `reservas.crear`: el camino de UPDATE que este
  -- trigger frena lo ejercen acciones gobernadas por `reservas.editar`
  -- (confirmar desde la lista de espera) y `reservas.asistencia` (marcar
  -- presente), así que con el grupo Reservas en activo una profesora con
  -- asistencia y sin crear quedaría trabada.
  --
  -- `can()` en sombra responde el legado —admin y recepción— así que esto
  -- ya funciona hoy y sigue funcionando al encender el grupo. Ningún rol
  -- de clienta tiene estas claves, ni en sombra ni en la matriz sembrada;
  -- su puerta al insert es "alumno reserva" (0005:68-73). Por persona sí
  -- se le podrían dar desde la matriz de excepciones, y ahí el freno se
  -- afloja: es la misma propiedad que tiene cualquier otro permiso.
  if (select public.can('reservas.crear')
           or public.can('reservas.editar')
           or public.can('reservas.asistencia')) then
    return new;
  end if;

  -- Sin sesión es el service role, que no pasa por RLS. Hoy eso es la
  -- carga a mano desde el SQL Editor —lo que la vuelta atrás de abajo
  -- asume para poder anotar un día entero de clases viejas—, no el cron
  -- ni el webhook de Mercado Pago: ninguno de los dos escribe reservas.
  if auth.uid() is null then
    return new;
  end if;

  -- ---- Y la clase no puede haber empezado ----
  v_inicio := public.inicio_de_clase(v_clase, v_dia);
  if v_inicio is null then
    return new;   -- clase sin horario: no hay contra qué comparar
  end if;

  -- Sin el filtro por `rige`, a propósito: el portal lee este parámetro
  -- con settingNum, que tampoco lo mira, y las dos mitades de la misma
  -- regla tienen que leer el mismo número. Es lo que hace la 0029 con
  -- cancel_hours.
  select coalesce(nullif(s.value, '')::numeric, 0)::int into v_corte
  from public.studio_settings s
  where s.key = 'booking_cutoff_minutes';

  -- Con piso en cero: un margen negativo habilitaría reservar DESPUÉS de
  -- que la clase empezó, que es exactamente lo que este trigger existe
  -- para impedir. El parámetro puede endurecer la regla, no aflojarla, y
  -- se acota donde vive el dato y no en la pantalla.
  v_corte := greatest(coalesce(v_corte, 0), 0);

  if now() >= v_inicio - make_interval(mins => v_corte) then
    if v_corte > 0 then
      raise exception
        'La reserva de esa clase ya cerró: empieza a las % del % y se cierra % minutos antes. Para anotarte igual, pedilo en recepción',
        to_char(v_inicio at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI'),
        to_char(v_dia, 'DD/MM/YYYY'), v_corte;
    else
      raise exception
        'Esa clase ya empezó — era a las % del %. Para anotarte igual, pedilo en recepción',
        to_char(v_inicio at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI'),
        to_char(v_dia, 'DD/MM/YYYY');
    end if;
  end if;

  return new;
end;
$$;

-- El trigger no se toca: sigue siendo el `reservations_agenda` que creó la
-- 0038, con el mismo nombre y el mismo momento. Lo único que cambia es el
-- cuerpo de la función que llama.

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
-- Hoy no se puede ver rechazar nada, porque hay una sola disciplina y
-- todos los planes la habilitan. Para probarlo hay que fabricar el caso, y
-- conviene hacerlo con un cliente de prueba de la 0039:
--
--   -- 1. Sacarle Reformer a un plan, a mano y por un rato
--   update public.plans set disciplines = '{"Pilates Embarazadas"}'
--   where name = 'FE FLOW';
--
--   -- 2. Intentar anotar a Vale Prueba (que tiene FE FLOW) en una clase
--   --    de Reformer, desde la Agenda. Tiene que rechazarla con
--   --    "El plan FE FLOW no incluye Pilates Reformer".
--
--   -- 3. Devolverlo como estaba. ESTE PASO NO SE OLVIDA.
--   update public.plans set disciplines = '{"Pilates Reformer"}'
--   where name = 'FE FLOW';
--
-- Y que lo que ya funciona siga funcionando:
--
--   -- Anotar a alguien con su plan correcto → entra
--   -- Anotar a alguien sin membresía → sigue diciendo lo de siempre
--   --   ("No tiene una membresía vigente para el ..."), no el mensaje nuevo
--
--   select * from public.consumo_control();   → cero filas
--   select * from public.perm_diff();         → cero filas
-- ============================================================

-- ============================================================
-- LO QUE ESTO NO ARREGLA
--
-- · LA PANTALLA TODAVÍA OFRECE LO QUE LA BASE VA A RECHAZAR. El portal le
--   muestra a cada cliente todas las clases del día sin mirar su plan, y el
--   selector de clientes de la agenda tampoco filtra. Con una sola
--   disciplina eso es invisible; con dos, el cliente va a ver clases de
--   embarazadas, va a tocar reservar y la base le va a contestar que no. El
--   criterio de la casa es que la pantalla esconda lo que la base va a
--   rechazar igual — pero esconder un botón no es la protección, así que el
--   orden correcto es este: primero el freno, después el filtro.
--
-- · NO IMPIDE QUE UNA CLASE MEZCLE MODALIDADES. "No se mezclarán ambas
--   modalidades dentro de una misma clase" se cumple hoy porque cada clase
--   tiene UNA disciplina, así que la mezcla no es representable. Si alguna
--   vez `class_sessions.discipline` pasara a ser una lista, esto habría que
--   pensarlo de nuevo.
--
-- · EL CUPO COMPARTIDO DE LA SALA SIGUE SIN FRENO. Las clases de
--   embarazadas van a tener su cupo propio, pero nada impide ponerlas el
--   mismo día y a la misma hora que una de Reformer: con una sola sala de 8
--   reformers, eso son 16 personas para 8 aparatos. Está anotado en la
--   0035 y necesita un índice único parcial sobre (día, hora, sala).
-- ============================================================

-- ============================================================
-- VUELTA ATRÁS (no ejecutar salvo que haga falta)
--
-- Devuelve la función a como la dejó la 0038, sin el chequeo. El trigger no
-- se toca ni acá ni allá.
--
-- No se transcribe el cuerpo: la fuente es
-- supabase/migrations/0038_la_clase_que_ya_empezo.sql — pegar de ahí el
-- `create or replace function public.reserva_en_hora()` completo, entre
-- begin y commit. Copiarlo acá sería dejar dos versiones de la misma
-- función en el repo, y la que se desactualiza es siempre la copia.
-- ============================================================
