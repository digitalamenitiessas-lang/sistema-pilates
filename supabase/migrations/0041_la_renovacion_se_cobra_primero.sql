-- ============================================================
-- 0041 — La renovación se cobra primero
--
-- Lo que el estudio pidió, y el sistema hace lo contrario:
--
--   "Debe renovarla, como maximo, el 20 de octubre. Si no paga ese dia, el
--    21 de octubre pierde la prioridad sobre sus dias y horarios fijos."
--
-- Hoy `auto_renew` nace en true y el proceso diario, al vencer una
-- membresía, INSERTA LA NUEVA y recién después genera la cuota como
-- pendiente con cinco días de plazo. O sea que quien no pagó queda con
-- membresía vigente — y desde que el motor de consumo de la 0029 está
-- encendido, gastando clases de un mes que no compró.
--
-- LA IDEA, EN UNA LÍNEA: se invierte el orden. La renovación deja de
-- crear la membresía y pasa a crear la CUOTA; la membresía la crea el
-- pago acreditado.
--
-- Eso sale bien por algo que ya está construido y no hay que repetir: el
-- trigger `memberships_fechas` (0036/0037) ya sabe desde cuándo arranca
-- una membresía nueva. Si el pago entra ANTES del vencimiento, la encola
-- detrás del período en curso — "puede pagar anticipadamente, pero el
-- nuevo período comienza cuando finaliza el anterior". Si entra DESPUÉS,
-- no hay nada vivo detrás de qué ponerse y arranca el día del pago — "si
-- paga después del vencimiento puede renovar, pero deberá elegir entre
-- los horarios que continúen disponibles". Las dos reglas del estudio,
-- sin escribir una línea de fecha acá.
--
-- LO QUE ESTA MIGRACIÓN CUIDA MÁS QUE NADA: LA CUOTA FANTASMA
--
-- Emitir la cuota antes del vencimiento abre un problema que no es obvio
-- y que cuesta plata todos los días. Una cuota `pendiente` que nadie paga
-- se convierte en deuda falsa, permanente y visible: `derivePaymentStatus`
-- la muestra "vencida" en cuanto pasa su fecha, el bloque 4 del proceso
-- diario le manda a la clienta "Tenés un pago pendiente" con el link de
-- Mercado Pago durante un mes, el tablero arma una alerta por cada una, y
-- el total de pendientes de Pagos la suma como plata a cobrar.
--
-- Dicho de otro modo: el bloque que viene a matar dos mails que se
-- contradicen crearía un par nuevo — "tu membresía venció" y "tenés un
-- pago pendiente", el mismo día, sobre la misma plata, uno diciéndole que
-- perdió el período y el otro cobrándoselo.
--
-- Por eso la columna nueva no es un detalle de implementación: es lo que
-- distingue **"debe"** de **"le ofrecimos"**. Una cuota de renovación sin
-- pagar es una oferta, no una deuda: no entra en el conteo de deuda, no
-- dispara el aviso de deuda vencida, y CADUCA — se anula sola cuando pasa
-- su fecha límite, que es el mismo momento en que el sistema ya decidió
-- que ese período no existió.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. LA COLUMNA QUE FALTABA
--
-- Hoy no existe ningún dato que diga "esta cuota es la renovación del
-- período que viene". `payments.membership_id` apunta a la membresía que
-- la cuota cobra, y en una renovación esa membresía TODAVÍA NO EXISTE:
-- nace cuando el pago entra. Son dos preguntas distintas y necesitan dos
-- columnas.
--
-- `on delete set null` igual que `membership_id`, y con una consecuencia
-- que conviene tener escrita: si alguna vez se borra físicamente una
-- membresía, su oferta queda huérfana como una pendiente cualquiera. No
-- se pierde nada, porque la caducidad del punto 4 la anula igual cuando
-- pasa su fecha — pero deja de saberse que era una oferta. En este
-- sistema las bajas son lógicas y las membresías no se borran, así que el
-- caso solo llega por el cascade de borrar un cliente, y ahí la cuota se
-- va con él.
-- ------------------------------------------------------------

alter table public.payments
  add column if not exists renueva_membresia_id uuid
    references public.memberships (id) on delete set null;

comment on column public.payments.renueva_membresia_id is
  'La membresía que esta cuota renueva. Con esto la cuota es una OFERTA y no una deuda: no se cuenta como deuda, no dispara el aviso de deuda vencida, y caduca si no se paga. Cuando se paga, nace la membresía del período siguiente.';

-- Una sola oferta viva por membresía. El parcial es lo que importa: una
-- oferta anulada no bloquea emitir otra, que es lo que hace falta cuando
-- el estudio decide volver a ofrecerle la renovación a alguien.
create unique index if not exists payments_una_oferta_viva_idx
  on public.payments (renueva_membresia_id)
  where renueva_membresia_id is not null and status <> 'anulado';

-- ------------------------------------------------------------
-- 2. LOS PARÁMETROS
--
-- Dos, y son dos a propósito porque contestan preguntas distintas. Vale
-- aclararlo porque `expiry_warning_days` ya existe y se parece:
--
--   · expiry_warning_days (ya existía, 5): desde cuántos días antes la
--     PANTALLA marca la membresía como "por vencer". Es un estado que se
--     muestra, y lo lee también lib/api.ts.
--   · expiry_reminder_days (nuevo, "5,2,0"): en qué días se MANDA el
--     recordatorio. Es una lista porque el estudio habló de
--     "recordatorios", en plural, y hasta hoy había uno solo.
--
-- El cero de la lista es el día del vencimiento, que es el aviso que más
-- importa: es el último en que todavía puede pagar sin perder nada.
-- ------------------------------------------------------------

insert into public.studio_settings
  (key, value, kind, options, label, help, group_key, sort_order, is_public) values
  ('renewal_invoice_days', '7', 'number', '{}',
   'Cuota de renovación (días antes de vencer)',
   'Cuántos días antes del vencimiento se le genera la cuota del período siguiente, para que tenga el link de pago mientras la membresía todavía le sirve. La membresía nueva recién nace cuando el pago entra.',
   'membresias', 15, false),
  ('expiry_reminder_days', '5,2,0', 'text', '{}',
   'Recordatorios de renovación (días antes)',
   'Los días de anticipación con los que se avisa, separados por coma. El 0 es el mismo día del vencimiento. Ej: 5,2,0 manda tres recordatorios.',
   'avisos', 15, false)
on conflict (key) do nothing;

-- ------------------------------------------------------------
-- 3. LA MEMBRESÍA NACE DEL PAGO
--
-- Un trigger sobre `payments`, y no código de aplicación, porque a
-- 'pagado' se llega por cuatro caminos: el webhook de Mercado Pago, el
-- sync manual, el cobro del mostrador, y la cuota que nace pagada. Poner
-- la regla en uno solo la deja afuera de los otros tres.
--
-- DOS COSAS QUE HAY QUE HACER BIEN, Y TIRAN PARA LADOS OPUESTOS:
--
--   · Cobrar no puede fallar nunca. Si esta función se cae, el cobro se
--     tiene que registrar igual: la plata entró. Por eso todo va dentro
--     de un `exception when others`.
--   · Pero no puede fallar EN SILENCIO, que es el peor caso de este
--     diseño: la clienta paga en efectivo el último día, la membresía no
--     nace, y nadie se entera nunca. Así que cuando falla, avisa.
--
-- El aviso reusa `renovacion_omitida`, que ya existe desde la 0023 y
-- significa exactamente esto —"no se renovó y hay que mirar"—. Reusarlo
-- evita reescribir el CHECK de `notifications.type`, que es de las cosas
-- que este proyecto ya se equivocó una vez contando los tipos.
--
-- DE QUÉ FECHA ARRANCA: del día del pago, y el resto lo decide el trigger
-- de la 0036/0037. No se calcula acá ni una fecha.
-- ------------------------------------------------------------

create or replace function public.renovar_por_pago(p_payment uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_pago    record;
  v_plan    record;
  v_nueva   uuid;
  v_posterior boolean;
begin
  select y.id, y.student_id, y.paid_date, y.renueva_membresia_id, y.amount
  into v_pago
  from public.payments y where y.id = p_payment;

  if v_pago.renueva_membresia_id is null then
    return null;
  end if;

  -- Ya se resolvió por otro camino. Pasa de verdad: el mostrador le
  -- asignó el plan a mano, o le cambió de plan, y la oferta quedó
  -- colgada. Sin esta guarda, pagar esa oferta vieja ACUÑA UNA TERCERA
  -- membresía con el plan viejo, encolada detrás de todo — que es el peor
  -- daño que podía tener este diseño.
  select exists (
    select 1
    from public.memberships vieja
    join public.memberships nueva
      on nueva.student_id = vieja.student_id
     and nueva.start_date > vieja.end_date
    where vieja.id = v_pago.renueva_membresia_id
  ) into v_posterior;

  if v_posterior then
    update public.payments set
      notes = coalesce(notes || ' · ', '') ||
              'La renovación ya estaba resuelta cuando entró este pago: no se creó otro período.'
    where id = p_payment;
    return null;
  end if;

  select p.id, p.name, p.price, p.class_count
  into v_plan
  from public.memberships m
  join public.plans p on p.id = m.plan_id
  where m.id = v_pago.renueva_membresia_id;

  insert into public.memberships
    (student_id, plan_id, start_date, end_date, classes_total, price)
  values
    (v_pago.student_id, v_plan.id,
     coalesce(v_pago.paid_date, current_date),
     coalesce(v_pago.paid_date, current_date),
     v_plan.class_count,
     -- Lo que se cobró, no el precio de lista: si el estudio le hizo un
     -- precio, la membresía tiene que decir ese.
     coalesce(v_pago.amount, v_plan.price))
  returning id into v_nueva;

  -- El sello cierra el círculo: la cuota pasa a apuntar a la membresía
  -- que creó, y es lo que hace verificable el invariante del punto 5.
  update public.payments set membership_id = v_nueva where id = p_payment;

  return v_nueva;
end;
$$;

revoke all on function public.renovar_por_pago(uuid) from public, anon, authenticated;

create or replace function public.pago_renueva()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_paso boolean := false;
begin
  if tg_op = 'INSERT' then
    v_paso := new.status = 'pagado';
  else
    v_paso := new.status = 'pagado' and old.status is distinct from 'pagado';
  end if;

  if not v_paso or new.renueva_membresia_id is null then
    return new;
  end if;

  begin
    perform public.renovar_por_pago(new.id);
  exception when others then
    -- Cobrar no puede fallar. Pero tampoco puede fallar callado: el aviso
    -- le llega al mostrador con el motivo, y la clienta queda con el pago
    -- registrado y sin membresía, que es un estado corregible a mano.
    insert into public.notifications (type, title, body, student_id, payment_id, audience, dedupe_key)
    values (
      'renovacion_omitida',
      'No se pudo crear el período pagado',
      'El pago entró pero la membresía nueva no se creó: ' || sqlerrm ||
        '. Asignale el plan a mano desde su ficha.',
      new.student_id,
      new.id,
      'staff',
      'renovafall-' || new.id
    )
    on conflict (dedupe_key) do nothing;
  end;

  return new;
end;
$$;

drop trigger if exists payments_renueva on public.payments;
create trigger payments_renueva
  after insert or update of status on public.payments
  for each row execute function public.pago_renueva();

-- ------------------------------------------------------------
-- 4. LA OFERTA CADUCA
--
-- Sin esto, todo lo demás está mal. Una oferta sin pagar se queda
-- pendiente para siempre, se muestra vencida, se cuenta como deuda y le
-- manda mails de cobranza por un mes.
--
-- Se anulan dos cosas distintas:
--
--   · La que pasó su fecha límite sin pagarse. Ese es el momento en que
--     el sistema ya decidió que el período no existió, así que la oferta
--     dejó de tener sentido.
--   · La de una membresía que YA tiene un período posterior. La
--     renovación se resolvió por otro camino —el mostrador le asignó el
--     plan, o le cambió de plan— y la oferta quedó colgada. Esta es la
--     que, si nadie la anula, alguien paga por error y acuña un período
--     de más.
--
-- Devuelve cuántas anuló, para que el proceso diario lo pueda reportar.
-- La llama el cron; no hay nada acá que dependa de que corra un día
-- exacto: si se saltea un día, al siguiente anula las dos tandas.
-- ------------------------------------------------------------

create or replace function public.renovacion_caducar()
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_anuladas int;
begin
  with vencidas as (
    update public.payments y set
      status = 'anulado',
      notes = coalesce(y.notes || ' · ', '') || 'Oferta de renovación no tomada.'
    where y.renueva_membresia_id is not null
      and y.status = 'pendiente'
      and (
        y.due_date < current_date
        or exists (
          select 1
          from public.memberships vieja
          join public.memberships nueva
            on nueva.student_id = vieja.student_id
           and nueva.start_date > vieja.end_date
          where vieja.id = y.renueva_membresia_id
        )
      )
    returning 1
  )
  select count(*)::int into v_anuladas from vencidas;
  return v_anuladas;
end;
$$;

revoke all on function public.renovacion_caducar() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 5. EL CONTROL
--
-- Cero filas siempre, como `perm_diff()` (0012), `caja_control()` (0020) y
-- `consumo_control()` (0029). Cualquier fila acá es una oferta pagada que
-- no produjo su membresía, o sea plata cobrada sin entregar el mes — y
-- este es el único diseño en el que eso puede pasar, así que tiene que
-- ser verificable con una consulta y no con un recuerdo.
-- ------------------------------------------------------------

create or replace function public.renovacion_control()
returns table (pago uuid, cliente text, cobrado numeric, cuando date, motivo text)
language sql stable security definer set search_path = ''
as $$
  select y.id, s.name, y.amount, y.paid_date,
         case when y.membership_id is null
              then 'pagada y sin período creado'
              else 'el período que creó ya no existe' end
  from public.payments y
  join public.students s on s.id = y.student_id
  where y.renueva_membresia_id is not null
    and y.status = 'pagado'
    and (
      y.membership_id is null
      or not exists (select 1 from public.memberships m where m.id = y.membership_id)
    )
$$;

comment on function public.renovacion_control() is
  'Cero filas siempre. Una fila es una renovación cobrada que no entregó el período.';

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
-- Nada de esto se puede ver esperando un mes: hay que fabricar el caso.
-- Con un cliente de prueba de la 0039 —Vale, que tiene FE FLOW vigente—
-- y su membresía a mano:
--
--   -- 0. Los invariantes, antes de tocar nada
--   select * from public.renovacion_control();   → cero filas
--   select * from public.consumo_control();      → cero filas
--   select * from public.perm_diff();            → cero filas
--
--   -- 1. Emitirle la oferta a mano, como la va a emitir el proceso diario
--   insert into public.payments
--     (student_id, concept, amount, due_date, status, renueva_membresia_id)
--   select m.student_id, p.name || ' — renovación', m.price, m.end_date + 1,
--          'pendiente', m.id
--   from public.memberships m
--   join public.plans p on p.id = m.plan_id
--   join public.students s on s.id = m.student_id
--   where s.name = 'Vale Prueba';
--
--   -- 2. Cobrarla, que es lo que hace el mostrador
--   update public.payments set status = 'pagado', paid_date = current_date,
--          method = 'efectivo'
--   where renueva_membresia_id is not null and status = 'pendiente';
--
--   -- 3. Y mirar que nació el período, encolado detrás del que corre
--   select p.name, m.start_date, m.end_date, m.classes_used || '/' || m.classes_total
--   from public.memberships m
--   join public.plans p on p.id = m.plan_id
--   join public.students s on s.id = m.student_id
--   where s.name = 'Vale Prueba' order by m.start_date;
--   → dos filas, y la segunda arranca el día siguiente al fin de la
--     primera. Si arranca hoy, el encolado de la 0037 no está corriendo.
--
--   select * from public.renovacion_control();   → cero filas
--
--   -- 4. Que una oferta no pagada caduque
--   --    (emitirle otra a alguien, con la fecha ya pasada)
--   select public.renovacion_caducar();
--   → 1, y la cuota queda 'anulado' con la nota "Oferta de renovación no tomada"
--
--   -- 5. Que pagar una oferta ya resuelta NO acuñe un período de más:
--   --    emitir la oferta, asignarle el plan a mano desde la ficha, y
--   --    después cobrar la oferta vieja.
--   → no se crea ninguna membresía, y la cuota queda con la nota
--     "La renovación ya estaba resuelta cuando entró este pago"
--
--   -- 6. Que el cobro no se caiga aunque la creación falle: borrarle el
--   --    plan a la membresía vieja y cobrar la oferta.
--   → el pago queda 'pagado' y aparece el aviso "No se pudo crear el
--     período pagado" en la campana del mostrador
-- ============================================================

-- ============================================================
-- LO QUE ESTO NO ARREGLA
--
-- · EL TURNO FIJO SIGUE SIN EXISTIR. "Si no renueva, al día siguiente sus
--   lugares quedan disponibles" no se puede cumplir porque no hay lugares
--   reservados que liberar: una reserva es una fila por cliente, clase y
--   fecha, no un derecho recurrente. Lo que sí queda listo es el momento
--   donde eso va a colgarse: el día en que la oferta caduca es el día en
--   que el estudio decidió que el período no existió.
--
-- · LAS RESERVAS FUTURAS DE QUIEN NO RENOVÓ NO SE TOCAN. Si tenía una
--   reserva para dentro de dos semanas y no renovó, la reserva sigue ahí.
--   Hoy el motor de la 0029 no la deja usar —`membresia_para` no encuentra
--   membresía para esa fecha y la reserva ya está creada, así que ocupa un
--   lugar que nadie va a usar—. Es parte del mismo bloque del turno fijo.
--
-- · EL CAMBIO DE PLAN SIGUE ENCOLÁNDOSE. Es la decisión de negocio que la
--   0037 dejó abierta. Lo que esta migración sí hace es que deje de ser
--   peligrosa: la oferta de la membresía vieja se anula sola cuando
--   aparece el período nuevo, así que ya no queda una cuota que alguien
--   pueda pagar por error.
-- ============================================================

-- ============================================================
-- VUELTA ATRÁS (no ejecutar salvo que haga falta)
--
-- Deja el sistema renovando como antes: sola y sin cobrar. Las membresías
-- que se hayan creado por un pago se quedan — son datos legítimos.
--
--   begin;
--
--   drop trigger if exists payments_renueva on public.payments;
--   drop function if exists public.pago_renueva();
--   drop function if exists public.renovar_por_pago(uuid);
--   drop function if exists public.renovacion_caducar();
--   drop function if exists public.renovacion_control();
--
--   drop index if exists public.payments_una_oferta_viva_idx;
--
--   -- Las ofertas vivas quedarían como deuda de verdad, así que se anulan
--   -- antes de perder la marca que decía que eran ofertas.
--   update public.payments set status = 'anulado',
--          notes = coalesce(notes || ' · ', '') || 'Oferta anulada al revertir la 0041.'
--   where renueva_membresia_id is not null and status = 'pendiente';
--
--   alter table public.payments drop column renueva_membresia_id;
--
--   delete from public.studio_settings
--   where key in ('renewal_invoice_days', 'expiry_reminder_days');
--
--   commit;
--
-- Y revertir el commit del código, o el proceso diario va a seguir sin
-- crear la membresía al vencer y nadie va a renovar nunca.
-- ============================================================
