-- ============================================================
-- 0085 — La lista se abre cuando llega la clase
--
-- Lo encontró la prueba del 27/09 en producción, con la sesión de Ivana:
-- en Reservas → "Más adelante" tocó "Marcar ausente" en una reserva del
-- 22/10, veinticinco días adelante, y la base lo aceptó. Quedó
-- status = 'ausente' con su firma en marked_by. Un toque, sin
-- confirmación, y con consecuencias de verdad:
--
--   · la ausencia sin aviso consume la clase (`absence_consumes_class`),
--     así que esa persona perdió una clase de su plan por algo que
--     todavía no pasó;
--   · 'ausente' no ocupa lugar, así que el lugar quedó libre para otra
--     persona;
--   · y la profesora no lo puede deshacer: volver a 'confirmada' es
--     `reservas.editar`, y la restrictiva de la 0013 se lo rechazó con
--     403. Eso está bien y no se toca.
--
-- NADIE MARCA LO QUE NO PASÓ, TAMPOCO EL MOSTRADOR
--
-- La regla vale para todos los roles, admin incluido. No es un permiso
-- que le falte a la profesora sino un dato que no puede ser cierto:
-- nadie vino ni faltó a una clase que no empezó. Para "avisó que no
-- viene" está cancelar, que además es lo que decide si la clase vuelve o
-- se pierde según el plazo. Marcarla ausente por adelantado se saltea
-- esa cuenta.
--
-- Por eso va en un trigger y no en las políticas: una rama más en
-- "anular y asistencia exigen permiso" dependería de la clave de cada
-- rol, y esto no depende de quién lo pide. Y en un trigger propio, no
-- adentro de `reserva_en_hora` (0038): ése decide si una reserva puede
-- entrar o volver a tomar un lugar, y a quien tiene las claves del
-- mostrador lo deja pasar. Esta regla no tiene salida por permiso.
--
-- Deshacer una marca —volver a 'confirmada'— queda afuera a propósito:
-- es la salida para arreglar lo que ya se marcó mal, y sigue pidiendo
-- `reservas.editar` como hasta hoy. No es una salida garantizada, igual:
-- volver a 'confirmada' pasa por el cupo (`enforce_class_capacity`), y si
-- otra persona tomó el lugar que liberó el ausente, rebota con "La clase
-- ya está completa". Qué hacer ahí está en CÓMO VERIFICAR, al final.
--
-- También queda afuera lo que entra sin sesión (el SQL Editor, el
-- service role), por el mismo motivo que en la 0038: es la única puerta
-- para una corrección de datos. Y no abre nada: se revisó todo lo que
-- escribe en `reservations` y ninguna función del servidor pone
-- 'asistió' ni 'ausente' —`reactivar_reserva` sólo pone 'confirmada' o
-- 'lista de espera'; el cron, el webhook de Mercado Pago y los recálculos
-- de consumo no cambian estados—. La única que escribe esos estados es
-- `updateReservationStatus`, desde la pantalla, y siempre trae sesión.
--
-- EL NÚMERO LO ELIGE EL ESTUDIO
--
-- La lista se abre `attendance_open_minutes` antes del inicio, 30 por
-- defecto: la profesora llega antes y pasa lista a medida que entran. El
-- inicio es el de ESE día (`inicio_de_clase`, 0038), así que si el estudio
-- corrió la clase de horario, la lista se corre con ella.
--
-- LA EXCEPCIÓN QUE SE REVALIDABA AL MARCAR
--
-- Del mismo seguimiento: la profesora no podía marcar presente una
-- reserva que entró por excepción (0046). `consumir_clase` valida la
-- excepción cada vez que la reserva toma un lugar sin membresía
-- atribuida, y una excepción es justamente eso —membership_id en null—,
-- así que al pasar de 'confirmada' a 'asistió' la validaba otra vez como
-- si fuera nueva y le pedía `reservas.excepcion`, que la profesora no
-- tiene.
--
-- Y para quien sí la tiene era peor: si esa persona había comprado un
-- plan en el medio, la revalidación encontraba lugar, descartaba la
-- excepción y le cobraba la clase al plan nuevo. Marcar presente no puede
-- cambiar quién paga una clase.
--
-- Ahora no se revalida cuando lo único que pasa es que se marca presente
-- una excepción que YA SE VALIDÓ y ya tenía su lugar ('confirmada', o
-- 'ausente' que se corrige). Sigue validándose en lo que sí la hace
-- nueva: el alta, y volver a tomar el lugar después de cancelada o desde
-- la espera. Clase, fecha y excepción no pueden cambiar en un update:
-- `consumir_clase` las clava desde la 0046.
--
-- "Ya se validó" tiene que ser un hecho y no una suposición, y hasta hoy
-- no lo era: `override_by` y `override_reason` quedaban como los mandaba
-- el navegador en toda alta que no pasaba por la validación —la que entra
-- en 'lista de espera' o ya marcada 'ausente', y cualquiera con el motor
-- de consumo apagado—. Saltearse la revalidación sobre esas filas habría
-- sido regalar una clase con una firma inventada. Por eso, además:
--
--   · en el alta, `override_by` lo borra la base siempre, y sólo lo
--     vuelve a poner la validación cuando se queda con la excepción. Así
--     una firma quiere decir que alguien con `reservas.excepcion` la
--     autorizó con el plan sin lugar, y eso es lo único que mira el
--     atajo. La 0046 ya lo decía —"nunca lo que mande el cliente"—, pero
--     sólo lo cumplía en el alta que toma un lugar;
--   · y un motivo de excepción en el alta pide `reservas.excepcion` en
--     cualquier estado y con el motor como esté. Antes, anotarse en la
--     espera con un motivo inventado lo dejaba guardado, y quien después
--     le daba el lugar desde el mostrador lo autorizaba sin saberlo.
--
-- Las reservas sin excepción y sin membresía —las anteriores a la 0029—
-- siguen como estaban: marcarlas presente es lo que les atribuye el plan,
-- porque el código viejo cobraba al marcar y esas todavía no se cobraron.
--
-- LO QUE NO SE CAMBIA, A PROPÓSITO: DE AUSENTE A PRESENTE NO MIRA EL CUPO
--
-- El ausente libera el lugar, y volverlo a 'asistió' no pasa por
-- `enforce_class_capacity`, que sólo cuenta al confirmar. En una clase que
-- se llenó en el medio eso puede dejar nueve presentes en ocho lugares.
-- Se deja así: si la persona estuvo en la clase, estuvo, y negarle el
-- presente para que cierre un número sería falsear la asistencia. El cupo
-- existe para no ofrecer lugares que no hay, no para corregir lo que ya
-- pasó en la sala.
--
-- `consumir_clase` SE REDEFINE ENTERA
--
-- Es la copia de la 0084, que corrió el 27/09 y es la última que la
-- definió, con dos cambios marcados "0085" y nada más. Entera y no
-- parcheada, como las seis veces anteriores: la próxima migración que la
-- toque va a copiar la última definición completa del repo, y tiene que
-- encontrar el arreglo adentro. El chequeo del punto 0 mira que la
-- versión viva sea la de la 0084 antes de pisarla.
--
-- Por lo mismo, esta va DESPUÉS de la 0084: corrida al revés, la copia
-- entera de la 0084 deshace el arreglo de la excepción sin avisar (el
-- corte por horario no, que vive aparte). Si pasara, se vuelve a correr
-- esta, que es idempotente.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 0. LO QUE ESTA MIGRACIÓN NECESITA QUE YA ESTÉ
--
-- Cortar acá con el nombre de lo que falta es mejor que cortar en el
-- medio con un error de columna que no dice qué migración correr.
-- ------------------------------------------------------------

do $$
declare
  v_src text;
begin
  if to_regprocedure('public.inicio_de_clase(uuid, date)') is null then
    raise exception 'Falta correr la 0038 antes que esta: no existe public.inicio_de_clase(uuid, date).';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'studio_settings'
       and column_name = 'encendible'
  ) then
    raise exception 'Falta correr la 0081 antes que esta: public.studio_settings no tiene la columna encendible.';
  end if;

  select p.prosrc into v_src from pg_proc p
   where p.oid = to_regprocedure('public.consumir_clase()');

  if v_src is null then
    raise exception 'Falta correr la 0029 antes que esta: no existe public.consumir_clase().';
  end if;

  -- La copia del punto 4 sale de la 0084. Si la versión viva no dice lo
  -- que agregó la 0084, o falta correrla o alguien la redefinió después,
  -- y pegar esta copia desharía ese cambio sin avisar. Esta copia también
  -- lo dice, así que volver a correr la migración pasa.
  if position('Esa clase perdida es de otra ficha.' in v_src) = 0
     or position('devoluciones_tope()' in v_src) = 0 then
    raise exception
      'public.consumir_clase no es la versión de la 0084 (no dice "Esa clase perdida es de otra ficha."). Falta correr la 0084, o la redefinió otra migración después: copiá esa versión acá antes de correr esta.';
  end if;
end $$;

-- ------------------------------------------------------------
-- 1. El número, donde el estudio lo puede cambiar
--
-- `sort_order` 35: entre "cuándo se descuenta la clase" (30) y "la
-- ausencia sin aviso consume la clase" (40), que son los dos parámetros
-- con los que éste se lee.
--
-- Nace rigiendo, a diferencia de `cancel_free_max` (0076) y
-- `recovery_max` (0046): ésas cambiaban cuánto se le cobra a alguien y se
-- encendían después de verificar. Ésta cierra algo que no tendría que
-- haber estado abierto nunca. Y no es `encendible`: la regla no se apaga,
-- el número la hace más estricta o más floja.
--
-- `on conflict do nothing` para que volver a correr la migración no pise
-- el número que el estudio ya haya elegido.
-- ------------------------------------------------------------

insert into public.studio_settings
  (key, value, kind, options, label, help, group_key, sort_order, is_public, solo_admin, rige, encendible)
values (
  'attendance_open_minutes', '30', 'number', '{}',
  'Apertura de la asistencia antes del inicio (minutos)',
  'Desde cuántos minutos antes de que empiece la clase se puede marcar presente o ausente. Antes de eso no se puede marcar a nadie, tampoco desde recepción: si alguien avisa que no va a venir, se cancela su reserva. En cero, la lista se abre justo cuando la clase empieza.',
  'reservas', 35, false, false, true, false
)
on conflict (key) do nothing;

-- ------------------------------------------------------------
-- 2. Cuántos minutos antes, leído igual que la pantalla
--
-- La pantalla lee este parámetro con `settingNum(settings, key, 30)`, y
-- las dos mitades de la misma regla tienen que leer el mismo número —es
-- lo que dijo la 0038 con booking_cutoff_minutes—. Así que esto copia lo
-- que hace `Number()` en el navegador:
--
--   · sin la fila, 30;
--   · vacío, 0 (`Number('')` es 0: el campo borrado abre al empezar);
--   · algo que no es un número, 30;
--   · negativo, 0 — el nombre dice "antes del inicio", y un negativo
--     querría decir "después", que no es lo que el estudio configura ahí.
--
-- Sin el filtro por `rige`, como booking_cutoff_minutes: `settingNum`
-- tampoco lo mira.
-- ------------------------------------------------------------

create or replace function public.asistencia_abre_minutos()
returns numeric
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_valor text;
begin
  select btrim(s.value) into v_valor
    from public.studio_settings s
   where s.key = 'attendance_open_minutes';

  if not found then
    return 30;
  end if;

  if v_valor = '' then
    return 0;
  end if;

  if v_valor !~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$' then
    return 30;
  end if;

  return greatest(v_valor::numeric, 0);
end;
$$;

-- La llama sólo el trigger de abajo, que es definer y corre como el
-- dueño. Nadie la necesita desde el navegador (0073).
revoke all on function public.asistencia_abre_minutos() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3. El corte
-- ------------------------------------------------------------

create or replace function public.asistencia_en_hora()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_marca   boolean := false;
  v_clase   uuid;
  v_dia     date;
  v_inicio  timestamptz;
  v_minutos numeric;
begin
  -- En una rama y no con un `and` sobre OLD, por el precedente de la 0022.
  --
  -- La clase y la fecha de la fila que va a QUEDAR, no las que llegaron:
  -- este trigger corre antes que `reservations_consumo`, que es el que
  -- clava las de old, así que validar new sería validar lo que mandó el
  -- navegador. Es lo mismo que hace `reserva_en_hora` (0040).
  if tg_op = 'UPDATE' then
    v_marca := new.status in ('asistió', 'ausente')
               and new.status is distinct from old.status;
    v_clase := old.class_id;
    v_dia   := old.date;
  else
    -- Hoy ningún alta entra marcada —la pantalla crea 'confirmada' o
    -- 'lista de espera'—, pero la política de alta del mostrador no mira
    -- el estado, y un insert marcado por adelantado es el mismo dato falso.
    v_marca := new.status in ('asistió', 'ausente');
    v_clase := new.class_id;
    v_dia   := new.date;
  end if;

  if not v_marca then
    return new;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  v_inicio := public.inicio_de_clase(v_clase, v_dia);
  if v_inicio is null then
    return new;   -- clase sin horario: no hay contra qué comparar
  end if;

  v_minutos := public.asistencia_abre_minutos();

  -- En minutos y no restando un intervalo: el número lo escribe el
  -- estudio, y uno enorme desborda `interval` y rompería el marcado
  -- entero en vez de, simplemente, abrir la lista antes.
  if extract(epoch from (v_inicio - now())) / 60 > v_minutos then
    raise exception
      'Todavía no se puede marcar asistencia en esa clase: empieza a las % del % y la lista se abre %. Si esa persona avisó que no va a venir, lo que corresponde es cancelar la reserva.',
      to_char(v_inicio at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI'),
      to_char(v_dia, 'DD/MM/YYYY'),
      case
        when v_minutos = 0 then 'cuando empieza'
        when v_minutos = 1 then '1 minuto antes'
        else trim_scale(v_minutos)::text || ' minutos antes'
      end;
  end if;

  return new;
end;
$$;

revoke all on function public.asistencia_en_hora() from public, anon, authenticated;

-- El nombre importa: los BEFORE corren por orden alfabético, y
-- `reservations_asistencia` cae antes de `reservations_capacity` y de
-- `reservations_consumo`. Así, una marca fuera de hora corta con este
-- mensaje y no con el del cupo, la excepción o el plan, que no dirían qué
-- pasó.
drop trigger if exists reservations_asistencia on public.reservations;
create trigger reservations_asistencia
  before insert or update on public.reservations
  for each row execute function public.asistencia_en_hora();

-- ------------------------------------------------------------
-- 4. EL DESCUENTO DE CLASES — el de la 0084, con la excepción arreglada
--
-- Dos cambios, marcados "0085" en su lugar:
--   · en el alta, antes del freno de mano: `override_by` se borra y un
--     motivo de excepción pide `reservas.excepcion`;
--   · en el update se calcula `v_ya_autorizada` con old, y la
--     validación de "tomar un lugar" no corre cuando es cierta.
-- El resto es la 0084 letra por letra, comentarios incluidos.
-- ------------------------------------------------------------

create or replace function public.consumir_clase()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_toma     boolean;   -- ¿esta escritura toma un lugar?
  v_marca    boolean;   -- ¿se está marcando asistencia?
  v_exc      boolean;   -- ¿viene con una excepción autorizada?
  v_ya_autorizada boolean := false;  -- ¿una excepción que ya pasó la validación? (0085)
  v_mem      uuid;
  v_total    int;
  v_usadas   int;
  v_horas    numeric;
  v_inicio   timestamptz;
  v_susp     boolean;
  v_rec      public.reservations%rowtype;
  v_topes    int;
  v_hechos   int;
  v_desde    date;
  v_hasta    date;
  v_tope     int;      -- devoluciones con cupo por período (0076); null = sin tope
  v_dev      int;      -- cuántas lleva devueltas en este período
begin
  -- ── EL BLINDAJE DE COLUMNAS VA PRIMERO (0072) ────────────────────
  --
  -- Antes estaba debajo de `if not consumo_rige() then return new`, o sea
  -- que el interruptor de pánico de Configuración —pensado para apagar el
  -- descuento de clases— apagaba también esto. Con el motor apagado, la
  -- política "alumno cancela" deja a la clienta escribir cualquier
  -- columna de su propia fila, `student_id` incluido. El freno de mano no
  -- puede abrir una puerta.
  v_marca := tg_op = 'UPDATE' and new.status in ('asistió', 'ausente')
             and old.status is distinct from new.status;

  if tg_op = 'UPDATE' then
    -- La identidad de la reserva NO se mueve en un update, y esto no es
    -- cosmético: desde la 0029 date, class_id y start_time deciden si la
    -- clase se pierde o vuelve. La política "alumno cancela" (0005:75-78)
    -- deja a la alumna escribir sus propias filas y NO restringe
    -- columnas, así que sin esto puede mandar start_time = '23:59' junto
    -- con la cancelación y convertir un aviso tardío en uno en plazo.
    -- Ningún camino legítimo del código escribe estas columnas en un
    -- update: el único que existe es .update({ status }).
    new.student_id := old.student_id;
    new.class_id   := old.class_id;
    new.date       := old.date;
    new.membership_id := old.membership_id;
    -- Las tres de la 0046, por el mismo motivo: son las que deciden si
    -- la clase se cobra o se regala, y se fijan al crear la reserva.
    new.recovers_reservation_id := old.recovers_reservation_id;
    new.override_by     := old.override_by;
    new.override_reason := old.override_reason;
    -- 0085: marcar presente una excepción que ya pasó por la validación
    -- de abajo no es tomar un lugar nuevo, y revalidarla le pedía
    -- `reservas.excepcion` a la profesora o le pasaba la clase al plan
    -- comprado en el medio. "Ya pasó" es la firma: desde la 0085 sólo la
    -- pone esa validación, cuando se queda con la excepción. Y sólo desde
    -- un estado que ya tenía su lugar: volver de cancelada o de la espera
    -- sí es tomar uno, y se valida como siempre.
    v_ya_autorizada := v_marca
                       and old.status in ('confirmada', 'ausente')
                       and old.override_by is not null
                       and coalesce(btrim(old.override_reason), '') <> '';
    -- start_time solo lo refresca reservations_stamp al marcar asistencia,
    -- que corre después de este trigger.
    if not v_marca then new.start_time := old.start_time; end if;
    -- Y la que faltaba, que es la que decide la plata de frente (0072):
    -- `cancel_kind` es lo único que `consumo_contadas` mira para saber si
    -- una cancelada se cobra. Sin clavarla, la clienta mandaba
    -- `{status:'cancelada', cancel_kind:'en plazo'}` sobre una reserva YA
    -- cancelada fuera de plazo: el status no cambia, así que la
    -- clasificación de abajo no vuelve a correr, y la clase que había
    -- perdido volvía a su plan. Repetible, y sin un solo aviso.
    --
    -- Cuando la fila deja de estar cancelada no hay plazo que contar, así
    -- que se limpia: `reactivar_reserva` (0031) no la toca y quedaba el
    -- plazo viejo pegado a una reserva confirmada.
    if new.status = 'cancelada' then
      new.cancel_kind := old.cancel_kind;
    else
      new.cancel_kind := null;
    end if;
  end if;

  -- 0085: en el alta, la firma de la excepción es de la base y no del
  -- navegador. Se borra siempre, y la validación de abajo la vuelve a
  -- poner sólo cuando se queda con la excepción; así, una firma quiere
  -- decir que la validación pasó, que es lo que mira `v_ya_autorizada`.
  -- Hasta acá sólo se limpiaba en el alta que toma un lugar, y la que
  -- entraba en la espera, ya 'ausente' o con el motor apagado la
  -- guardaba tal como llegaba.
  --
  -- Y el motivo pide la clave en cualquier estado, antes del freno de
  -- mano por lo mismo que el resto del blindaje. Sin sesión no se pide:
  -- es el SQL Editor, como en la 0038.
  if tg_op = 'INSERT' then
    new.override_by := null;
    if coalesce(btrim(new.override_reason), '') = '' then
      new.override_reason := null;
    elsif auth.uid() is not null and not public.can('reservas.excepcion') then
      raise exception 'No tenés permiso para autorizar una excepción.';
    end if;
  end if;

  -- El motor de consumo, después del blindaje.
  if not public.consumo_rige() then return new; end if;

  v_toma := new.status in ('confirmada', 'asistió');

  -- ---- Clasificar la cancelación ----
  if tg_op = 'UPDATE' and new.status = 'cancelada'
     and old.status is distinct from 'cancelada' then

    select exists (
      select 1 from public.class_occurrences o
      where o.class_id = new.class_id and o.date = new.date and o.status = 'suspendida'
    ) into v_susp;

    if v_susp then
      -- La suspensión manda sobre el reloj: si el estudio no la dictó, no
      -- importa a qué hora avisó la clienta.
      new.cancel_kind := null;
    else
      select coalesce(nullif(s.value, '')::numeric, 3) into v_horas
      from public.studio_settings s where s.key = 'cancel_hours';
      v_horas := coalesce(v_horas, 3);

      v_inicio := (new.date + coalesce(new.start_time, time '00:00'))
                    at time zone 'America/Argentina/Buenos_Aires';

      if now() > v_inicio - make_interval(mins => (v_horas * 60)::int) then
        new.cancel_kind := 'fuera de plazo';
      else
        -- EN PLAZO, PERO ¿LE QUEDA CUPO? (0076)
        --
        -- Se decide ACÁ y se sella en la fila, en vez de contarlo después
        -- en `consumo_contadas`: esa función mira el ESTADO ACTUAL de las
        -- reservas, y con el tope contado ahí, cancelar y volver a
        -- anotarse liberaba el cupo. La clienta podía reciclar sus dos
        -- devoluciones todas las veces que quisiera.
        --
        -- Sellado, no: la fila queda con lo que le tocó en el momento, y
        -- `cancel_kind` es de las columnas que la 0072 le clava a la
        -- clienta en el update, así que no puede reescribirlo.
        --
        -- Si reactiva una devuelta, su `cancel_kind` se limpia (0072) y el
        -- cupo vuelve a estar libre — que es lo correcto: volvió a tomar
        -- la clase, así que la devolución se deshizo.
        v_tope := public.devoluciones_tope();
        if v_tope is null or new.membership_id is null then
          -- Sin tope configurado —o sin período que descontar— se comporta
          -- como siempre: la clase vuelve.
          new.cancel_kind := 'en plazo';
        else
          select count(*) into v_dev
            from public.reservations r
           where r.membership_id = new.membership_id
             and r.id <> new.id
             and r.status = 'cancelada'
             and r.cancel_kind = 'en plazo';
          new.cancel_kind := case when v_dev < v_tope
            then 'en plazo' else 'en plazo sin cupo' end;
        end if;
      end if;
    end if;
  end if;

  -- ---- El recupero (0046) ----
  --
  -- Solo al crear: en un update la columna viene pineada de arriba.
  if tg_op = 'INSERT' and new.recovers_reservation_id is not null then

    if not public.recupero_rige() then
      raise exception
        'Las recuperaciones todavía no están habilitadas. Se encienden desde Configuración → Reservas.';
    end if;

    -- Lo carga una recepción, no la clienta desde el portal: el tope es
    -- una regla del estudio y quien lo aplica es quien atiende.
    if not public.can('reservas.crear') then
      raise exception 'No tenés permiso para registrar una recuperación.';
    end if;

    select * into v_rec from public.reservations
    where id = new.recovers_reservation_id;

    if not found or v_rec.student_id <> new.student_id then
      raise exception 'Esa clase perdida es de otra ficha.';
    end if;

    if not public.recupero_elegible(new.recovers_reservation_id) then
      raise exception
        'Esa clase no se puede recuperar: se recuperan las que perdió por cancelar tarde o faltar sin avisar, y solo una vez.';
    end if;

    -- El recupero vive dentro del período que pagó la clase perdida: las
    -- clases no se acumulan de un mes al otro, así que reponerla fuera
    -- de su membresía sería revivir una clase vencida.
    select m.start_date, m.end_date into v_desde, v_hasta
    from public.memberships m where m.id = v_rec.membership_id;

    if new.date < v_desde or new.date > v_hasta then
      raise exception
        'La recuperación tiene que caer dentro del período que pagó esa clase (% al %)',
        to_char(v_desde, 'DD/MM/YYYY'), to_char(v_hasta, 'DD/MM/YYYY');
    end if;

    v_topes := coalesce(nullif(public.param('recovery_max', '2'), '')::int, 2);

    select count(*)::int into v_hechos
    from public.reservations r
    where r.membership_id = v_rec.membership_id
      and r.recovers_reservation_id is not null
      and r.status <> 'cancelada';

    -- La frase se arma según el número porque el número lo elige el
    -- estudio: en 1 decía "Ya usó las 1 recuperaciones" y en 0 decía que
    -- usó las cero, cuando lo que pasa es que no permite ninguna.
    if v_hechos >= v_topes then
      raise exception '%', case
        when v_topes <= 0 then 'El estudio no permite recuperaciones. Se habilitan desde Configuración → Reservas.'
        when v_topes = 1  then 'Ya usó la recuperación de este período'
        else 'Ya usó las ' || v_topes || ' recuperaciones de este período'
      end;
    end if;

    -- Se paga con la membresía de la clase perdida, y `consumo_contadas`
    -- la excluye: la sella para poder contar el tope por período, no
    -- para volver a cobrarla.
    new.membership_id := v_rec.membership_id;
    new.override_by := null;
    new.override_reason := null;

    return new;
  end if;

  -- ---- Validar y sellar al tomar un lugar ----
  --
  -- Salvo la excepción ya autorizada que sólo se marca presente (0085).
  if v_toma and new.recovers_reservation_id is null
     and (tg_op = 'INSERT' or new.membership_id is null)
     and not v_ya_autorizada then

    -- La excepción autorizada (0046). Pide las dos cosas: la clave y el
    -- motivo escrito. `override_by` lo pone la base con quien está
    -- logueado y nunca lo que mande el cliente.
    v_exc := new.override_reason is not null and btrim(new.override_reason) <> '';

    if v_exc and not public.can('reservas.excepcion') then
      raise exception 'No tenés permiso para autorizar una excepción.';
    end if;

    if not v_exc then
      new.override_by := null;
      new.override_reason := null;
    end if;

    v_mem := public.membresia_para(new.student_id, new.date);

    if v_mem is null then
      if not v_exc then
        raise exception
          'No tiene una membresía vigente para el % — asignale un plan antes de reservarle esa clase',
          to_char(new.date, 'DD/MM/YYYY');
      end if;
      -- Autorizada sin membresía: no hay a qué cobrársela.
      new.override_by := auth.uid();
      new.membership_id := null;
      return new;
    end if;

    select m.classes_total, m.classes_used_base + public.consumo_contadas(m.id)
    into v_total, v_usadas
    from public.memberships m where m.id = v_mem;

    if v_usadas >= v_total then
      if not v_exc then
        raise exception
          'Ya usó las % clases de su plan. Para reservarle igual, renovale la membresía o cambiale el plan',
          v_total;
      end if;
      -- Autorizada con el plan agotado: la clase va de más y no se
      -- descuenta, así el contador sigue diciendo "usó % de %".
      new.override_by := auth.uid();
      new.membership_id := null;
      return new;
    end if;

    -- Había lugar: la excepción no hacía falta, y guardarla igual dejaría
    -- una reserva común diciendo "autorizada por" en la ficha y en el
    -- portal. Se descarta y la reserva sigue el camino de siempre.
    new.override_by := null;
    new.override_reason := null;

    new.membership_id := v_mem;
  end if;

  return new;
end;
$$;

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
-- 1. El parámetro y los dos cambios en la base:
--
--    select key, value, rige, encendible from public.studio_settings
--     where key = 'attendance_open_minutes';
--    -- 30 · true · false
--
--    select tgname from pg_trigger
--     where tgrelid = 'public.reservations'::regclass and tgname = 'reservations_asistencia';
--    -- una fila
--
--    select position('v_ya_autorizada' in prosrc) > 0
--      from pg_proc where proname = 'consumir_clase';
--    -- true
--
-- 2. Que no se movió ningún permiso:
--
--    select * from public.perm_diff();
--    -- cero filas
--
-- 3. Ejerciéndolo, con la sesión de una PROFESORA y no con la del admin:
--    · en Reservas → "Más adelante" no aparecen los botones de marcar;
--    · en la Agenda, una clase de la semana que viene ofrece "Ver la
--      lista" y adentro no deja marcar;
--    · en una clase que empieza en menos de 30 minutos, o que ya empezó,
--      marcar presente y ausente anda como siempre;
--    · y una reserva cargada por excepción se puede marcar presente.
--
-- 4. Las marcas que ya quedaron puestas antes de tiempo —la del 22/10,
--    y cualquier otra, también de clases que ya pasaron— esta migración
--    NO las toca. Se buscan por el momento en que se marcaron, no por
--    la fecha de la clase:
--
--    select r.id, r.date, r.status, r.marked_by, r.marked_at
--      from public.reservations r
--     where r.status in ('asistió', 'ausente')
--       and extract(epoch from (public.inicio_de_clase(r.class_id, r.date) - r.marked_at)) / 60
--           > public.asistencia_abre_minutos();
--
--    Se deshacen desde la pantalla con una sesión que tenga
--    `reservas.editar` (Agenda → esa clase → Ver la lista → deshacer),
--    que es volver a 'confirmada'. Si en el medio otra persona tomó el
--    lugar que liberó el ausente, eso rebota con "La clase ya está
--    completa", y ahí lo que queda es cancelarla. La pantalla no ofrece
--    cancelar una reserva marcada, así que va por acá, y se clasifica
--    por el plazo como cualquier cancelación:
--
--    update public.reservations set status = 'cancelada' where id = '...';
--
-- 5. Las excepciones de antes de la 0085 que pueden no haber pasado por
--    la validación: sin firma, firmadas por alguien que no es del
--    mostrador, o que entraron ya marcadas (una marca puesta desde la
--    pantalla siempre deja `marked_at`; un alta que llega marcada, no).
--    Desde la 0085 la firma sólo la pone la validación. Las de antes, si
--    aparecen, se revisan a mano: a una fila firmada el atajo le cree.
--
--    select r.id, r.date, r.status, r.override_reason, r.override_by, p.role
--      from public.reservations r
--      left join public.profiles p on p.id = r.override_by
--     where coalesce(btrim(r.override_reason), '') <> ''
--       and (r.override_by is null
--            or coalesce(p.role, '') not in ('admin', 'recepcion')
--            or (r.status in ('asistió', 'ausente') and r.marked_at is null));
--
-- ============================================================
-- PARA VOLVER ATRÁS
--
-- No cambia políticas. Lo que agrega se saca así:
--
--   begin;
--   drop trigger if exists reservations_asistencia on public.reservations;
--   drop function if exists public.asistencia_en_hora();
--   drop function if exists public.asistencia_abre_minutos();
--   delete from public.studio_settings where key = 'attendance_open_minutes';
--   -- y recrear consumir_clase tal como está en la 0084 (su punto 9).
--   commit;
--
-- Sin la migración, la pantalla sigue escondiendo los botones hasta 30
-- minutos antes —lee el parámetro con 30 por defecto—, pero la base
-- acepta la marca a cualquier hora, como antes. O sea que lo único que
-- queda es el aviso de la pantalla, que no protege nada.
-- ============================================================
