-- ============================================================
-- 0038 — No se reserva una clase que ya empezó
--
-- Se escribió como 0036 en una sesión aparte y se renumeró al traerla: el
-- 0036 se lo llevó la vigencia mensual, que ya está aplicada. El número
-- es lo único que cambió.
--
-- El portal ofrecía "Reservar" en las clases de HOY que ya habían
-- terminado, porque la comparación era por FECHA y no por fecha y hora.
-- Alguien entraba a las 20:00, se anotaba en la clase de las 8:00 de esa
-- mañana, y la reserva entraba.
--
-- POR QUÉ RECIÉN AHORA CUESTA UNA CLASE. Hasta el 09/09 esto era un
-- botón inútil: no había grilla cargada y el motor de consumo de la 0029
-- estaba apagado. Ese día se cargaron las 64 clases (0035) y se corrió el
-- ENCENDIDO de la 0029. Desde entonces `consumo_rige()` da true, y
-- anotarse en una clase de la mañana a la noche le DESCUENTA la clase a
-- la clienta. El bug no cambió; cambió lo que cuesta.
--
-- El portal ya esconde el botón (mismo commit). Esto es el freno de
-- verdad: esconder un botón no es la protección, y además el reloj que
-- mira el portal es el del teléfono de quien reserva.
--
-- POR QUÉ NO VA DENTRO DE `consumir_clase`, QUE ERA EL LUGAR OBVIO
--
-- Ahí ya se valida la membresía vigente y el saldo al reservar, así que
-- parecía el lugar. Pero esa función empieza con
-- `if not public.consumo_rige() then return new; end if;`: el freno de
-- mano de la 0029 —el que se baja cuando el descuento hace algo raro—
-- apagaría también esta regla, y quedaría el sistema en el estado exacto
-- que produjo el problema. Reservar una clase que ya pasó está mal
-- descuente o no descuente. Va en su propio trigger, sin interruptor.
--
-- El nombre arranca con 'reservations_a' a propósito: Postgres dispara
-- los BEFORE por orden alfabético, así que este corre antes que
-- reservations_capacity (0005), reservations_consumo (0029) y
-- reservations_stamp (0022). Es lo que se quiere: si la clase ya pasó, el
-- mensaje tiene que decir eso y no "la clase ya está completa".
--
-- Y DE PASO, LA FECHA CONTRA EL DÍA DE LA CLASE
--
-- Nada ataba la fecha de una reserva al día de la semana de su clase: se
-- podía anotar a alguien en la clase de los lunes para un martes. Del
-- mismo relevamiento, y se arregla acá porque es el mismo trigger y la
-- misma pregunta: ¿esta fecha y esta clase van juntas?
--
-- EL CORTE ES POR PERMISO, NO POR OVERRIDE
--
-- Recepción TIENE que poder anotar a alguien en una clase que ya pasó:
-- llega sin reserva, hace la clase, y se la cargan después. Es el flujo
-- normal del mostrador, no una excepción.
--
-- La 0022 dejó `override_by` / `override_reason` para pasar por encima de
-- una validación dejando el motivo escrito, y se evaluó usarlas acá. No
-- van, por dos razones: pedir un motivo escrito en algo que pasa todos
-- los días es fricción sin destinatario, y ese texto lo LEE la clienta
-- (RLS filtra filas, no columnas, y el portal hace select('*') sobre sus
-- reservas). Además el rastro ya existe sin agregar nada: la 0022 sella
-- `source`, `created_by` y `created_at`, y una fila con source='staff' y
-- created_at doce horas después de su date dice exactamente lo que pasó.
--
-- Esas dos columnas quedan para lo que la 0022 dijo —membresía vencida o
-- sin saldo—, que sigue sin implementarse.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. El margen, configurable
--
-- Cero cierra la reserva justo cuando la clase empieza, que es lo que
-- arregla el síntoma. Si el estudio prefiere cerrar quince minutos antes
-- —para no recibir a alguien que se anota con la clase empezando— lo
-- cambia en Configuración y no espera un desarrollo.
--
-- `on conflict do nothing` para que la migración se pueda volver a pegar
-- entera sin pisar el valor que el estudio ya haya elegido.
-- ------------------------------------------------------------
insert into public.studio_settings
  (key, value, kind, options, label, help, group_key, sort_order, is_public)
values
  ('booking_cutoff_minutes', '0', 'number', '{}',
   'Cierre de reservas antes del inicio (minutos)',
   'Cuántos minutos antes de que empiece la clase se deja de poder reservar desde el portal. En cero, la reserva se cierra justo cuando la clase empieza. Recepción puede anotar a alguien igual, también después.',
   'reservas', 15, false)
on conflict (key) do nothing;

-- ------------------------------------------------------------
-- 2. Cuándo empieza esa clase, ESE día
--
-- El horario de la clase, salvo que ese día se haya corrido (0018). La
-- misma cuenta que hace `stamp_reservation` para la foto del día y que
-- hace la 0029 para clasificar una cancelación, que es lo que se quiere:
-- si la clase de las 8:00 se pasó a las 18:00 ese jueves, la reserva
-- cierra a las 18:00 y no a las 8:00.
--
-- El huso es el del estudio, fijado en la 0016: `date + time` es una
-- hora de pared, y sin el `at time zone` Postgres la leería en el huso
-- de la sesión, que es UTC. Tres horas de diferencia — justo la clase de
-- la mañana.
-- ------------------------------------------------------------
create or replace function public.inicio_de_clase(p_class uuid, p_fecha date)
returns timestamptz
language sql stable security definer set search_path = ''
as $$
  select (p_fecha + coalesce(
            (select o.start_time from public.class_occurrences o
              where o.class_id = p_class and o.date = p_fecha),
            (select c.start_time from public.class_sessions c where c.id = p_class)))
         at time zone 'America/Argentina/Buenos_Aires'
$$;

comment on function public.inicio_de_clase(uuid, date) is
  'Cuándo arranca esa clase ese día, con el cambio de horario de la instancia (0018) aplicado y en el huso del estudio (0016).';

-- El revoke que toda función definer lleva en este proyecto (0012:268,
-- 0020:137, 0025:117, 0031:78, 0032:48), y acá no es ceremonia: Supabase
-- le da EXECUTE a anon sobre las funciones nuevas de public, y esta lee
-- `class_occurrences`, cuya RLS reserva la lectura a quien tenga sesión
-- (0018:54-57). Siendo definer se saltea esa política, así que sin el
-- revoke cualquiera desde la landing podría pedir por RPC el horario
-- corrido de una clase — un dato que hoy pide estar logueado.
revoke all on function public.inicio_de_clase(uuid, date) from public, anon;
grant execute on function public.inicio_de_clase(uuid, date) to authenticated;

-- ------------------------------------------------------------
-- 3. La regla
--
-- Corre cuando esta escritura pone a alguien EN la clase:
--   · cualquier INSERT, y
--   · el UPDATE que devuelve una reserva a un lugar ocupado: reactivar
--     una cancelada (`reactivar_reserva`, 0031) o confirmar desde la
--     lista de espera. Sin esto, cancelar y reactivar sería la puerta de
--     atrás para exactamente lo mismo, y también descuenta.
--
-- NO corre al marcar asistencia por el camino normal: ahí old.status ya
-- era 'confirmada' —o 'ausente', si se está corrigiendo una marca— y nadie
-- toma un lugar nuevo, así que sale por el return de arriba. El único caso
-- en que marcar presente sí pasa por acá es sobre una reserva CANCELADA, y
-- eso no es marcar asistencia: es reactivarla y marcarla de una.
--
-- Importa igual: `reservas.asistencia` es la clave que el catálogo señala
-- para darle a UNA profesora, y una profesora con esa clave y sin
-- `reservas.crear` tiene que poder corregir un ausente después de la
-- clase. Que es, por definición, después de que la clase empezó. Por eso
-- el escape de más abajo acepta las tres claves de escritura y no una.
-- ------------------------------------------------------------
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
    v_clase := old.class_id;
    v_dia   := old.date;
  else
    v_clase := new.class_id;
    v_dia   := new.date;
  end if;

  if tg_op <> 'INSERT' and not v_reabre then
    return new;
  end if;

  select cs.kind, cs.day_of_week, cs.date
  into v_kind, v_dow, v_fecha
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

drop trigger if exists reservations_agenda on public.reservations;
create trigger reservations_agenda
  before insert or update on public.reservations
  for each row execute function public.reserva_en_hora();

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
--   -- 1. Nada de permisos cambió
--   select * from public.perm_diff();               → cero filas
--
--   -- 2. La cuenta de consumo sigue cuadrando
--   select * from public.consumo_control();         → cero filas
--
--   -- 3. El horario de hoy, con el cambio de instancia aplicado
--   select cs.title, cs.start_time,
--          public.inicio_de_clase(cs.id, current_date) as arranca
--   from public.class_sessions cs
--   where cs.day_of_week = extract(isodow from current_date)::int - 1
--   order by cs.start_time;
--
-- Y en la pantalla, con la sesión de una clienta real:
--   · una clase de hoy que ya pasó   → sin botón, dice "Ya empezó"
--   · una clase de hoy que falta     → el botón sigue estando
--   · forzando el insert igual       → la base lo rechaza con el mensaje,
--                                      la fila no se crea y classes_used
--                                      no se mueve
--
-- Con la sesión de recepción, esa misma clase pasada:
--   · se puede anotar, como hasta ahora
--
-- Y el día de la semana, con cualquier sesión:
--   · reservar la clase de los lunes para un martes → rechazada
-- ============================================================

-- ============================================================
-- LO QUE ESTO NO ARREGLA
--
-- · `bookable = false` SIGUE SIN FRENO EN LA BASE. La 0017 creó esa
--   columna para los talleres que pasan por recepción —"se muestra en la
--   agenda pero la alumna no la puede reservar sola"— y hasta hoy eso lo
--   sostiene únicamente el portal, que esconde el botón. Es el mismo tipo
--   de agujero que este trigger vino a tapar: esconder un botón no es la
--   protección. No entra acá para no mezclar dos reglas en una migración
--   que ya trae dos, pero va en el mismo trigger cuando se haga, con la
--   misma salida por permiso.
--
-- · EL CHEQUEO DEL DÍA DE LA SEMANA NO MIRA SI LA CLASE ESTÁ ACTIVA. Una
--   reserva contra una clase dada de baja pasa igual: la baja es lógica y
--   la fila sigue existiendo. Hoy no muerde porque el portal no ofrece
--   clases inactivas, pero es la misma clase de hueco.
-- ============================================================

-- ============================================================
-- VUELTA ATRÁS (no ejecutar salvo que haga falta)
--
--   begin;
--   drop trigger if exists reservations_agenda on public.reservations;
--   drop function if exists public.reserva_en_hora();
--   drop function if exists public.inicio_de_clase(uuid, date);
--   delete from public.studio_settings where key = 'booking_cutoff_minutes';
--   commit;
--
-- Vuelve a poder reservarse una clase que ya empezó, que es lo que
-- pasaba antes. El código del portal tolera las dos cosas: esconde el
-- botón igual, y el parámetro que falta se lee como cero.
--
-- Para aflojar la regla SIN volver atrás la migración —por ejemplo, si
-- hay que anotar a mano un día entero de clases viejas— alcanza con
-- correr esos inserts desde el SQL Editor: sin sesión, el corte por
-- horario no aplica. El del día de la semana sí, y ahí no hay salida a
-- propósito: si choca, la fecha o la clase están mal.
-- ============================================================
