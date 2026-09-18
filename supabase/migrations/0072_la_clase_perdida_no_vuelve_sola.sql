-- ============================================================
-- 0072 — La clienta podía devolverse las clases que ya había perdido
--
-- Encontrado el 18/09 en una revisión de seguridad del sistema ya en
-- producción, con datos reales de cuatro clientas.
--
-- EL AGUJERO
--
-- La política del portal `alumno cancela` (0005:75-78) es:
--
--     using (student_id in (select public.my_student_ids()))
--     with check (status = 'cancelada')
--
-- El `with check` mira UNA columna. RLS no filtra por columna, así que
-- una clienta con su sesión puede escribir CUALQUIER columna de su propia
-- reserva mientras la fila quede en 'cancelada'.
--
-- La 0046 ya sabía esto: clava ocho columnas en el update y su comentario
-- dice, textual, que sin eso "puede mandar start_time = '23:59' junto con
-- la cancelación y convertir un aviso tardío en uno en plazo". Blindó el
-- camino indirecto y dejó afuera **`cancel_kind`**, que es la columna que
-- decide el asunto de frente: `consumo_contadas` (0046) cuenta una
-- cancelada sólo cuando vale 'fuera de plazo'.
--
-- Y la clasificación que la calcula corre sólo en la transición
-- (`old.status is distinct from 'cancelada'`). O sea que un update de
-- cancelada a cancelada no recalcula nada y sobrevive lo que mandó el
-- navegador.
--
-- El ataque es un pedido HTTP con su propio token, sobre una reserva que
-- ya perdió por avisar tarde:
--
--     PATCH /rest/v1/reservations?id=eq.<la suya>
--     {"status":"cancelada","cancel_kind":"en plazo"}
--
-- Después de eso `consumo_contadas` deja de contarla, el trigger baja
-- `classes_used` y puede volver a reservar. Repetible en cada reserva que
-- tenga, y silencioso: el aviso de la 0052 sólo suena en la transición
-- 'confirmada' → 'cancelada', así que no queda ni un rastro visible.
--
-- EL OTRO ARREGLO, QUE ES MÁS DE FONDO
--
-- Todo ese blindaje de columnas estaba DEBAJO de
-- `if not public.consumo_rige() then return new; end if;`. `consumo_rige`
-- es el interruptor de Configuración para apagar el descuento de clases
-- —un freno de mano— y apagaba también el blindaje. Con el motor
-- apagado, la misma política deja reescribir `student_id`, `class_id`,
-- `date` y `membership_id` de la propia reserva. Un freno de mano no
-- puede abrir una puerta, así que el blindaje sube y queda incondicional.
--
-- LO QUE NO CAMBIA
--
-- El cuerpo es el de la 0046 con esos dos cambios y nada más: se generó
-- transformando el texto de esa migración, no transcribiéndolo.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

create or replace function public.consumir_clase()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_toma     boolean;   -- ¿esta escritura toma un lugar?
  v_marca    boolean;   -- ¿se está marcando asistencia?
  v_exc      boolean;   -- ¿viene con una excepción autorizada?
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

      new.cancel_kind := case
        when now() <= v_inicio - make_interval(mins => (v_horas * 60)::int)
        then 'en plazo' else 'fuera de plazo' end;
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
      raise exception 'Esa clase perdida no es de este cliente.';
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
  if v_toma and new.recovers_reservation_id is null
     and (tg_op = 'INSERT' or new.membership_id is null) then

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
          'Ya usó las % clases de su plan. Para anotarla igual, renovale la membresía o cambiale el plan',
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
-- El único eslabón que no se pudo ejercer es el PATCH, porque hace falta
-- la sesión de una clienta. Con ella:
--
--   -- 1. Antes: elegir una reserva suya cancelada fuera de plazo.
--   select id, status, cancel_kind from public.reservations
--    where student_id = '<la clienta>' and status = 'cancelada';
--   select classes_used from public.memberships where id = '<su periodo>';
--
--   -- 2. El ataque, con SU token (no con el service role, que se saltea
--   --    RLS y no prueba nada):
--   --    PATCH /rest/v1/reservations?id=eq.<la reserva>
--   --    {"status":"cancelada","cancel_kind":"en plazo"}
--
--   -- 3. Después: las dos consultas del punto 1 tienen que dar LO MISMO.
--   --    Antes de esta migración, `cancel_kind` quedaba en 'en plazo' y
--   --    `classes_used` bajaba en uno.
--
-- Y que lo legítimo siga andando, que es lo que un arreglo así puede
-- romper:
--
--   -- 4. Cancelar desde el portal con más de 3 horas: la clase tiene que
--   --    volver al plan ('en plazo').
--   -- 5. Cancelar con menos de 3 horas: se tiene que perder ('fuera de
--   --    plazo').
--   -- 6. Suspender la clase desde la Agenda: la cancelación de esa fecha
--   --    tiene que quedar con `cancel_kind` nulo y no descontar.
--   -- 7. Marcar asistencia y desmarcar desde el mostrador.
--   -- 8. Reabrir una cancelada: ahora su `cancel_kind` queda en nulo.
--
-- PARA VOLVER ATRÁS
--
--   Volver a correr el bloque de `consumir_clase` de la 0046. Ojo: eso
--   reabre el agujero.
-- ============================================================
