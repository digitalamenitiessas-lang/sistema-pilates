-- ============================================================
-- 0083 — Anular un cobro no borra la deuda
--
-- EL SÍNTOMA
--
-- Anular desde Pagos pasaba el cobro a 'anulado' y ahí terminaba. Nada
-- volvía a abrir la cuota: la membresía seguía activa y sin deuda en
-- todas las pantallas, y el proceso diario —que reclama sólo lo que está
-- 'pendiente'— no se enteraba nunca. El caso que va a pasar la primera
-- semana: el mostrador cobra con el medio equivocado, anula para
-- corregir, y esa plata ya no la reclama nadie. Para el sistema, la
-- clienta pagó.
--
-- Con una renovación es peor. La cuota con `renueva_membresia_id` (0041)
-- creó el período nuevo al cobrarse; anularla deja ese período vivo, con
-- sus clases disponibles, y sin nada que lo cobre.
--
-- LO QUE HACE ESTA MIGRACIÓN
--
-- `anular_cobro()` anula el cobro como hasta hoy —misma nota, mismo
-- permiso— y quien anula dice qué queda en su lugar (`p_queda`):
--
--   · 'debe'       → la cuota vuelve a quedar pendiente: una GEMELA del
--                    mismo período, al precio de lista y con la promo con
--                    la que se había cobrado. Es el medio equivocado, la
--                    transferencia que no entró.
--   · 'nada'       → se tacha y no queda nada pendiente. Es el plan mal
--                    cargado, la cuota que no correspondía.
--   · 'renovacion' → sólo para el cobro de una oferta de renovación: se
--                    borra el período que ese cobro creó y la clienta
--                    vuelve a tener la oferta. Es la oferta cobrada a
--                    otra clienta, o la que decidió no renovar.
--
-- Y `anular_cuota()` anula una cuota pendiente, que hasta hoy sólo se
-- podía sacar cancelando el período entero.
--
-- La base decide cuándo no corresponde lo que se pidió, y lo dice: la
-- función devuelve qué hizo, y si no reabrió, por qué.
--
-- LO QUE DISTINGUE UNA CUOTA DE UN COBRO SUELTO
--
-- "Otro cobro" (`registerPayment`) inserta un cobro que no salda ninguna
-- cuota: una remera, una clase suelta. Anularlo no tiene deuda que
-- reabrir, porque nunca la saldó; reabrirla inventaría una deuda con
-- mail de cobranza y, al cobrarla, la promo automática del plan. Hasta
-- hoy ningún dato de la fila decía cuál era cuál, así que nace `origen`.
--
-- Nace 'cuota' por defecto porque todo lo demás que inserta en payments
-- es una cuota: el alta, la renovación, el proceso diario. Lo único que
-- escribe 'suelto' es "Otro cobro". Para los que ya existen se deduce:
-- un cobro sin período es suelto por fuerza, y uno que nació pagado con
-- una sesión —su sello de quién cobró (0020) tiene el mismo instante que
-- la fila, porque los dos salen del `now()` de la misma transacción— sólo
-- pudo entrar por "Otro cobro": las cuotas nacen pendientes y se cobran
-- después.
--
-- Con `origen` el control de duplicados deja de adivinar por el concepto:
-- un período está pago si tiene otra CUOTA cobrada, y un cobro suelto con
-- el mismo nombre no lo salda — que es lo que la pantalla del "Otro
-- cobro" le promete a quien lo carga.
--
-- POR QUÉ UNA GEMELA Y NO REABRIR LA MISMA FILA
--
-- Porque el cobro existió. Tiene un comprobante emitido, entró en una
-- cuenta, y quizás en un arqueo ya firmado: la caja se explica con esa
-- fila tachada, y volverla a 'pendiente' borraría el rastro de que hubo
-- plata que entró y se devolvió. Además `guard_dia_cerrado` (0020) no
-- dejaría: sobre un día arqueado sólo acepta pasar a 'anulado'. La
-- gemela apunta al cobro que reemplaza (`reabre_pago_id`), para que se
-- pueda seguir el hilo sin leer notas.
--
-- EL MONTO ES EL DE LISTA. Lo cobrado ya trae el ajuste del medio —el −5%
-- del efectivo, el +25% de la tarjeta— y volver a cobrarlo le aplicaría
-- el ajuste otra vez. `precio_lista` si está (0079). Si no está —un
-- cobro anterior a la 0079, o uno de Mercado Pago—, el precio del
-- período, que es de donde salió la cuota; salvo que el período lo haya
-- creado una renovación, porque ahí `price` guarda lo cobrado (0041).
--
-- LA PROMO SE CONSERVA. Quien pagó el 08/10 con "los primeros diez días"
-- no tiene por qué perderla porque el estudio anuló el 11/10 un cobro mal
-- cargado. La gemela nace con el `promocion_id` del cobro, y
-- `promociones_para` se la ofrece aunque ya no esté en su ventana ni le
-- queden usos: el uso era de ella, lo liberó la anulación y lo vuelve a
-- tomar al cobrarla. Compite con las vigentes como una automática más, y
-- gana la que más le descuenta.
--
-- EL VENCIMIENTO, el de `assignMembership`: `payment_grace_days` desde que
-- arranca el período, y nunca antes de hoy. Con un vencimiento pasado la
-- gemela nacería vencida y el proceso diario le mandaría "Tenés un pago
-- pendiente" a la mañana siguiente a alguien que, en el caso más común,
-- ya pagó y está esperando que el mostrador le cobre bien.
--
-- NO SE REABRE, AUNQUE SE PIDA, cuando:
--
--   · el cobro es suelto, o no está colgado de ningún período;
--   · el período está cancelado;
--   · el período sigue pago con otra cuota cobrada;
--   · ya tiene una cuota pendiente — la deuda ya figura, y duplicarla la
--     cobraría dos veces;
--   · es una renovación que no llegó a crear período.
--
-- LA RENOVACIÓN
--
-- La gemela de una renovación no puede ser una oferta. Si llevara
-- `renueva_membresia_id`, `renovacion_caducar()` la anularía a la mañana
-- siguiente —la membresía que renueva ya tiene un período posterior, el
-- que creó el cobro— y si alguien llegara a cobrarla antes, sería la
-- fila pagada y sin período que `renovacion_control()` denuncia. Así que
-- con 'debe' es una deuda común del período que ese cobro creó.
--
-- Pero una oferta no cobrada no es deuda (0041), y 'debe' la convierte en
-- una deuda más un período que la clienta quizás nunca aceptó. Por eso
-- existe 'renovacion': deshace lo que hizo el cobro. Borra el período
-- nuevo —sólo si no dejó huella, con las mismas condiciones que
-- `eliminar_membresia` (0071), y por eso pide su permiso— y le vuelve a
-- emitir la oferta sobre el período que renovaba, con el vencimiento de
-- siempre: el día siguiente a su fin. Si ese día ya pasó, la oferta no
-- se emite: habría vencido, y la renovación se arma a mano.
--
-- A diferencia de `eliminar_membresia`, el cobro anulado NO se borra:
-- tiene comprobante. Queda tachado, con la nota de qué período se deshizo.
--
-- QUIÉN ANULÓ
--
-- `payment_staff` (0020) sellaba sólo quién cobró. Anular saca plata de
-- la caja, así que se sella también quién y cuándo. Va en la tabla
-- satélite y no en payments por lo mismo que quién cobró: la clienta lee
-- sus propios pagos. `cobrado_at` deja de ser obligatorio porque una
-- cuota anulada sin cobrar tiene quién la anuló y no cuándo se cobró.
--
-- LO QUE NO ARREGLA
--
-- El link de Mercado Pago de un cobro anulado sigue vivo en el mail que
-- ya salió, y la gemela nace sin link. Si la clienta paga por el viejo,
-- la plata no se asienta (huecos C y E de docs/MERCADO-PAGO.md). Mercado
-- Pago no está conectado y se decidió prenderlo de una vez; queda anotado
-- ahí, con `reabre_pago_id` como el dato para acreditarle la gemela.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- REQUIERE la 0041 y la 0079.
-- ============================================================

begin;

do $guarda$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'payments'
       and column_name = 'renueva_membresia_id'
  ) then
    raise exception 'Falta payments.renueva_membresia_id. Revisar si corrió la 0041.';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'payments'
       and column_name = 'precio_lista'
  ) or to_regprocedure('public.promociones_para(uuid)') is null then
    raise exception 'Falta payments.precio_lista o promociones_para(). Revisar si corrió la 0079.';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'reservations'
       and column_name = 'membership_id'
  ) then
    raise exception 'Falta reservations.membership_id. Revisar si corrió la 0022.';
  end if;
  if not exists (select 1 from public.permission_keys where clave = 'pagos.anular') then
    raise exception 'Falta la clave pagos.anular. Revisar si corrió la 0012.';
  end if;
  if not exists (select 1 from public.permission_keys where clave = 'membresias.eliminar') then
    raise exception 'Falta la clave membresias.eliminar. Revisar si corrió la 0019.';
  end if;
  if to_regprocedure('public.param(text, text)') is null
     or to_regclass('public.payment_staff') is null then
    raise exception 'Falta public.param() o payment_staff. Revisar si corrió la 0020.';
  end if;
end
$guarda$;

-- ------------------------------------------------------------
-- 1. De dónde vino el cobro, y a quién reemplaza
-- ------------------------------------------------------------

alter table public.payments
  add column if not exists origen text not null default 'cuota',
  add column if not exists reabre_pago_id uuid
    references public.payments (id) on delete set null;

alter table public.payments drop constraint if exists payments_origen_check;
alter table public.payments
  add constraint payments_origen_check check (origen in ('cuota', 'suelto'));

comment on column public.payments.origen is
  'cuota = salda un período (el alta, la renovación, la cuota reabierta). suelto = "Otro cobro": no salda ninguna, y anularlo no reabre nada (0083).';
comment on column public.payments.reabre_pago_id is
  'El cobro anulado que esta cuota reemplaza: la gemela de anular_cobro(), o la oferta que se devolvió al deshacer la renovación (0083).';

update public.payments p
   set origen = 'suelto'
 where p.origen = 'cuota'
   and p.renueva_membresia_id is null
   and (
     p.membership_id is null
     or exists (select 1 from public.payment_staff s
                 where s.payment_id = p.id and s.cobrado_at = p.created_at)
   );

-- ------------------------------------------------------------
-- 2. Quién anuló
-- ------------------------------------------------------------

alter table public.payment_staff
  add column if not exists anulado_por uuid references auth.users (id),
  add column if not exists anulado_at timestamptz;

alter table public.payment_staff alter column cobrado_at drop not null;

-- ------------------------------------------------------------
-- 3. Anular un cobro
-- ------------------------------------------------------------

create or replace function public.anular_cobro(
  p_payment uuid,
  p_motivo  text,
  p_queda   text
)
returns table (
  comprobante   bigint,
  anulado       numeric,
  -- Lo que quedó de verdad, que puede no ser lo que se pidió: 'debe',
  -- 'nada' o 'renovacion'.
  queda         text,
  -- La gemela, o la oferta que se devolvió.
  cuota_nueva   uuid,
  debe          numeric,
  vence         date,
  promo         text,
  -- El período que se borró al deshacer la renovación.
  periodo_desde date,
  periodo_hasta date,
  -- Por qué no se hizo lo que se pidió, o lo que conviene saber.
  aviso         text
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_pago   record;
  v_m      record;
  v_vieja  record;
  v_otro   record;
  v_hoy    date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_comp   text;
  v_gracia text;
  v_lista  numeric;
  v_n      int;
begin
  -- La misma clave que exige la restrictiva "anular exige permiso" (0013)
  -- cuando se anula con un update. La gemela no pide `pagos.registrar`:
  -- no es un cobro nuevo, es la deuda que el cobro había saldado.
  if not public.can('pagos.anular') then
    raise exception 'No tenés permiso para anular cobros.';
  end if;

  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'La anulación necesita un motivo: queda escrito en el cobro.';
  end if;

  -- Sin valor por defecto a propósito: qué queda después es una decisión
  -- de quien anula, y un default la tomaría por ella.
  if p_queda is null or p_queda not in ('debe', 'nada', 'renovacion') then
    raise exception 'Falta decir qué queda después de anular: la deuda, nada, o deshacer la renovación.';
  end if;

  select * into v_pago from public.payments where id = p_payment for update;
  if not found then
    raise exception 'Ese cobro no existe.';
  end if;
  if v_pago.status = 'anulado' then
    raise exception 'Ese cobro ya estaba anulado.';
  end if;
  if v_pago.status <> 'pagado' then
    raise exception 'Esa cuota todavía no se cobró: no hay cobro que anular. Si no corresponde, anulá la cuota.';
  end if;

  v_comp := '#' || lpad(coalesce(v_pago.receipt_number::text, '0'), 6, '0');

  -- La nota, igual que la escribía `voidPayment`: lo que ya tenía, y el
  -- motivo a continuación.
  update public.payments
     set status = 'anulado',
         notes = concat_ws(' · ',
                           nullif(btrim(coalesce(notes, '')), ''),
                           'Anulado: ' || btrim(p_motivo))
   where id = p_payment;

  -- Si no había sello —un cobro de Mercado Pago no tiene sesión, o el
  -- sello falló—, se crea con el instante del cobro y sin quién cobró,
  -- que es lo que se sabe.
  insert into public.payment_staff (payment_id, cobrado_at, anulado_por, anulado_at)
  values (p_payment, v_pago.paid_at, auth.uid(), now())
  on conflict (payment_id) do update
     set anulado_por = excluded.anulado_por,
         anulado_at  = excluded.anulado_at;

  comprobante := v_pago.receipt_number;
  anulado     := v_pago.amount;
  queda       := 'nada';

  if p_queda = 'nada' then
    return next;
    return;
  end if;

  -- ----------------------------------------------------------
  -- Deshacer la renovación
  --
  -- Acá lo que no se puede hacer frena todo, incluida la anulación: quien
  -- pidió deshacer no pidió dejar el período sin deuda, y hacer la mitad
  -- sería decidir por ella.
  -- ----------------------------------------------------------
  if p_queda = 'renovacion' then
    if v_pago.renueva_membresia_id is null then
      raise exception 'Ese cobro no es de una renovación: no hay renovación que deshacer.';
    end if;
    if v_pago.membership_id is null then
      raise exception 'Ese cobro no llegó a crear ningún período, así que no hay renovación que deshacer: anulalo sin deuda.';
    end if;
    if not public.can('membresias.eliminar') then
      raise exception 'Deshacer la renovación borra el período que creó, y eso pide el permiso de eliminar membresías. Anulalo dejando la deuda o sin deuda, y que alguien con ese permiso deshaga el período desde la ficha.';
    end if;

    select m.id, m.student_id, m.start_date, m.end_date, m.classes_used
      into v_m
      from public.memberships m
     where m.id = v_pago.membership_id
       for update;
    if not found then
      raise exception 'El período que creó ese cobro ya no existe.';
    end if;

    -- Las condiciones de `eliminar_membresia` (0071): se borra sólo lo
    -- que no dejó huella.
    if v_m.classes_used > 0 then
      raise exception
        'El período que creó ya tiene % clase(s) usada(s), así que no se puede deshacer. Anulalo dejando la deuda, o sin deuda y cancelá el período desde su ficha.',
        v_m.classes_used;
    end if;
    select count(*) into v_n from public.reservations r where r.membership_id = v_m.id;
    if v_n > 0 then
      raise exception
        'El período que creó ya tiene % reserva(s) hechas contra él, así que no se puede deshacer. Anulalo dejando la deuda, o sin deuda y cancelá el período desde su ficha.',
        v_n;
    end if;
    -- Otra cuota o cobro colgado del período, o su propia oferta de
    -- renovación: la clave ajena los dejaría vivos y sin período, o sea
    -- una deuda de algo que no existe.
    if exists (select 1 from public.payments q
                where (q.membership_id = v_m.id or q.renueva_membresia_id = v_m.id)
                  and q.id <> p_payment
                  and q.status <> 'anulado') then
      raise exception 'El período que creó ya tiene otras cuotas o cobros, así que no se puede deshacer. Anulalo dejando la deuda o sin deuda.';
    end if;
    if exists (select 1 from public.memberships d
                where d.student_id = v_m.student_id
                  and d.id <> v_m.id
                  and d.status <> 'cancelada'
                  and d.start_date > v_m.end_date) then
      raise exception 'Hay otro período encolado detrás del que creó este cobro: borrarlo dejaría un hueco. Anulalo dejando la deuda o sin deuda.';
    end if;

    update public.payments
       set notes = notes || ' · Se deshizo la renovación: se borró el período del '
                 || to_char(v_m.start_date, 'DD/MM/YYYY') || ' al '
                 || to_char(v_m.end_date, 'DD/MM/YYYY') || '.'
     where id = p_payment;

    -- La clave ajena (`on delete set null`) le saca el período al cobro
    -- anulado, que queda con su comprobante y apuntando a lo que renovaba.
    delete from public.memberships where id = v_m.id;

    queda         := 'renovacion';
    periodo_desde := v_m.start_date;
    periodo_hasta := v_m.end_date;

    select m.id, m.end_date, m.status into v_vieja
      from public.memberships m
     where m.id = v_pago.renueva_membresia_id;

    if not found then
      aviso := 'La membresía que renovaba ya no existe, así que no se le vuelve a ofrecer la renovación.';
    elsif v_vieja.status = 'cancelada' then
      aviso := 'La membresía que renovaba está cancelada, así que no se le vuelve a ofrecer la renovación.';
    elsif v_vieja.end_date + 1 < v_hoy then
      aviso := 'La oferta de renovación vencía el ' || to_char(v_vieja.end_date + 1, 'DD/MM/YYYY')
            || ', así que no se le vuelve a ofrecer. Si quiere seguir, asignale el plan desde su ficha.';
    else
      -- La oferta como la emite el proceso diario (0041): sin período, con
      -- el vencimiento en el día siguiente al fin. Sin la promo del cobro:
      -- esto vuelve las cosas a antes de que se cobrara, y la promo se
      -- mide de nuevo cuando lo pague.
      insert into public.payments
        (student_id, concept, amount, due_date, status,
         renueva_membresia_id, origen, reabre_pago_id, notes)
      values
        (v_pago.student_id, v_pago.concept, coalesce(v_pago.precio_lista, v_pago.amount),
         v_vieja.end_date + 1, 'pendiente', v_vieja.id, 'cuota', p_payment,
         'Oferta devuelta al anular el comprobante ' || v_comp || ': ' || btrim(p_motivo))
      on conflict (renueva_membresia_id)
        where renueva_membresia_id is not null and status <> 'anulado'
        do nothing
      returning id, amount, due_date into cuota_nueva, debe, vence;

      if cuota_nueva is null then
        aviso := 'Ya tenía otra oferta de renovación viva, así que no se emitió una nueva.';
      end if;
    end if;

    return next;
    return;
  end if;

  -- ----------------------------------------------------------
  -- Vuelve a deber
  -- ----------------------------------------------------------
  if v_pago.origen = 'suelto' then
    aviso := 'Ese cobro se cargó como "Otro cobro": no saldó ninguna cuota, así que no hay deuda que reabrir.';
  elsif v_pago.membership_id is null and v_pago.renueva_membresia_id is not null then
    aviso := 'Ese cobro no llegó a crear ningún período, así que no hay deuda que reabrir.';
  elsif v_pago.membership_id is null then
    aviso := 'Ese cobro no está colgado de ningún período, así que no hay cuota que reabrir.';
  else
    -- Se toma la membresía para que dos anulaciones del mismo período no
    -- corran a la par: anulando a la vez las dos cuotas cobradas de un
    -- mes, cada una vería a la otra todavía pagada y ninguna reabriría.
    -- `no key update` es el lock más liviano que choca consigo mismo. Una
    -- reserva contra este período actualiza `classes_used` y espera lo que
    -- dure la anulación, que son milisegundos.
    select m.id, m.status, m.start_date, m.price
      into v_m
      from public.memberships m
     where m.id = v_pago.membership_id
       for no key update;

    if not found then
      aviso := 'El período de ese cobro ya no existe, así que no hay cuota que reabrir.';
    elsif v_m.status = 'cancelada' then
      aviso := 'El período de ese cobro está cancelado: no se le vuelve a cobrar.';
    else
      select q.receipt_number into v_otro
        from public.payments q
       where q.membership_id = v_m.id
         and q.id <> p_payment
         and q.status = 'pagado'
         and q.origen = 'cuota'
       order by q.paid_at
       limit 1;
      if found then
        aviso := 'El período sigue pago con el comprobante #'
          || lpad(coalesce(v_otro.receipt_number::text, '0'), 6, '0')
          || ': no queda debiendo nada.';
      else
        select q.amount into v_otro
          from public.payments q
         where q.membership_id = v_m.id
           and q.id <> p_payment
           and q.status = 'pendiente'
           and q.renueva_membresia_id is null
           and q.origen = 'cuota'
         limit 1;
        if found then
          -- El separador va literal: la `G` de `to_char` usa el locale de
          -- la base, que es inglés (lo mismo que en la 0055).
          aviso := 'Ese período ya tiene una cuota pendiente de $'
            || replace(trim(to_char(v_otro.amount, 'FM999,999,999')), ',', '.')
            || ': la deuda ya figura y no se duplica.';
        end if;
      end if;
    end if;
  end if;

  if aviso is null then
    v_lista := coalesce(
      v_pago.precio_lista,
      case
        when v_pago.renueva_membresia_id is null
         and not exists (select 1 from public.payments r
                          where r.membership_id = v_m.id
                            and r.renueva_membresia_id is not null)
        then nullif(v_m.price, 0)
      end,
      v_pago.amount);
    if v_lista <= 0 then
      aviso := 'El cobro era de $0: no hay deuda que reabrir.';
    end if;
  end if;

  if aviso is null then
    -- Un número mal escrito en Configuración no puede impedir anular: cae
    -- al mismo 5 que usa la pantalla cuando el parámetro no está.
    v_gracia := btrim(public.param('payment_grace_days', '5'));
    vence := greatest(v_hoy, v_m.start_date)
             + case when v_gracia ~ '^\d{1,3}$' then v_gracia::int else 5 end;
    debe := v_lista;

    insert into public.payments
      (student_id, membership_id, concept, amount, due_date, status,
       origen, reabre_pago_id, promocion_id, notes)
    values
      (v_pago.student_id, v_m.id, v_pago.concept, debe, vence, 'pendiente',
       'cuota', p_payment, v_pago.promocion_id,
       'Reabierta al anular el comprobante ' || v_comp || ': ' || btrim(p_motivo))
    returning id into cuota_nueva;

    queda := 'debe';
    if v_pago.promocion_id is not null then
      select pr.nombre into promo from public.promociones pr where pr.id = v_pago.promocion_id;
    end if;
  end if;

  return next;
end;
$$;

comment on function public.anular_cobro(uuid, text, text) is
  'Anula un cobro y deja lo que se pida: la cuota pendiente otra vez (debe), nada, o la renovación deshecha (0083). Devuelve lo que hizo; aviso dice por qué no, si no lo hizo.';

revoke all on function public.anular_cobro(uuid, text, text) from public, anon;
grant execute on function public.anular_cobro(uuid, text, text) to authenticated;

-- ------------------------------------------------------------
-- 4. Anular una cuota que nunca se cobró
--
-- Hasta hoy una pendiente sólo salía cancelando la membresía —que le saca
-- las clases— o borrándola. Hace falta para deshacer una gemela que no
-- correspondía, y para las cuotas que el estudio decida no cobrar, como
-- las de la clase de prueba de antes del 16/09. No es más poder del que
-- ya hay: anular un cobro sin reabrir deja el mismo período sin deuda.
-- ------------------------------------------------------------

create or replace function public.anular_cuota(p_payment uuid, p_motivo text)
returns table (anulado numeric, concepto text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_pago record;
begin
  if not public.can('pagos.anular') then
    raise exception 'No tenés permiso para anular cuotas.';
  end if;

  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'La anulación necesita un motivo: queda escrito en la cuota.';
  end if;

  select * into v_pago from public.payments where id = p_payment for update;
  if not found then
    raise exception 'Esa cuota no existe.';
  end if;
  if v_pago.status = 'anulado' then
    raise exception 'Esa cuota ya estaba anulada.';
  end if;
  if v_pago.status = 'pagado' then
    raise exception 'Esa cuota ya está cobrada (comprobante #%): lo que se anula es el cobro.',
      lpad(coalesce(v_pago.receipt_number::text, '0'), 6, '0');
  end if;
  -- Una oferta no es deuda y caduca sola (0041). Anularla a mano no le
  -- saca nada a nadie y confunde "no renovó" con "se le perdonó".
  if v_pago.renueva_membresia_id is not null then
    raise exception 'Es una oferta de renovación, no una deuda: si no se cobra, se anula sola cuando pasa el %.',
      to_char(v_pago.due_date, 'DD/MM/YYYY');
  end if;

  update public.payments
     set status = 'anulado',
         notes = concat_ws(' · ',
                           nullif(btrim(coalesce(notes, '')), ''),
                           'Anulada: ' || btrim(p_motivo))
   where id = p_payment;

  insert into public.payment_staff (payment_id, cobrado_at, anulado_por, anulado_at)
  values (p_payment, null, auth.uid(), now())
  on conflict (payment_id) do update
     set anulado_por = excluded.anulado_por,
         anulado_at  = excluded.anulado_at;

  anulado  := v_pago.amount;
  concepto := v_pago.concept;
  return next;
end;
$$;

comment on function public.anular_cuota(uuid, text) is
  'Anula una cuota pendiente que no es oferta (0083). No toca el período: si tampoco va, se cancela desde la ficha.';

revoke all on function public.anular_cuota(uuid, text) from public, anon;
grant execute on function public.anular_cuota(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 5. La promo que trae la cuota reabierta
--
-- Misma firma y mismo cuerpo que en la 0079, con dos cambios:
--
--   · Una pendiente con `promocion_id` es una gemela (punto 3), y
--     su promo se ofrece siempre, como automática, sin mirar ventana,
--     vigencia ni topes. `cobrar_cuota` no cambia: toma la mejor
--     automática, que ahora incluye ésta, y un cupón escrito le gana.
--
--   · El plan de la oferta de renovación sale de la membresía que
--     renueva. Nace sin `membership_id` (0041) y con el concepto
--     "FE FLOW — renovación", así que ni el vínculo ni el nombre lo
--     encontraban, y toda promo limitada a un plan quedaba afuera de
--     justo el pago que una promo de pago temprano quiere premiar.
-- ------------------------------------------------------------

create or replace function public.promociones_para(p_payment uuid)
returns table (
  id uuid, nombre text, tipo text, valor numeric,
  codigo text, usos_restantes int
)
language sql stable security definer set search_path = ''
as $$
  with pago as (
    select p.id, p.student_id, p.amount, p.status, p.promocion_id,
           -- Va como subconsulta con `limit 1` y no como join: `plans.name`
           -- NO es único —el catálogo deja repetir nombres— y un join
           -- duplicaría la fila del pago (0079).
           coalesce(
             m.plan_id,
             (select v.plan_id from public.memberships v where v.id = p.renueva_membresia_id),
             (select pl.id from public.plans pl
               where pl.name = p.concept order by pl.active desc limit 1)
           ) as plan_id
      from public.payments p
      left join public.memberships m on m.id = p.membership_id
     where p.id = p_payment
  ),
  hoy as (select (now() at time zone 'America/Argentina/Buenos_Aires')::date as d),
  heredada as (
    -- Sin código aunque lo haya tenido: ya lo escribió una vez.
    select pr.id, pr.nombre, pr.tipo, pr.valor,
           null::text as codigo, null::int as usos_restantes
      from public.promociones pr
      join pago on pago.promocion_id = pr.id
     where pago.status = 'pendiente'
  ),
  vigentes as (
    select pr.id, pr.nombre, pr.tipo, pr.valor, pr.codigo,
           case when pr.usos_max is null then null
                else greatest(0, pr.usos_max - (
                  select count(*)::int from public.payments q
                   where q.promocion_id = pr.id and q.status = 'pagado')) end as usos_restantes
      from public.promociones pr, pago, hoy
     where pr.active and pr.rige
       and pr.id not in (select h.id from heredada h)
       -- La ventana, medida contra el día del cobro.
       and (
         pr.ventana = 'siempre'
         or (pr.ventana = 'fechas'   and hoy.d between pr.desde and pr.hasta)
         or (pr.ventana = 'dias_mes' and extract(day from hoy.d) between pr.dia_desde and pr.dia_hasta)
       )
       -- El plan, si la promo se limitó a algunos.
       and (cardinality(pr.planes) = 0 or pago.plan_id = any(pr.planes))
       -- El tope total.
       and (pr.usos_max is null or (
         select count(*) from public.payments q
          where q.promocion_id = pr.id and q.status = 'pagado') < pr.usos_max)
       -- El tope por clienta.
       and (pr.usos_por_cliente is null or (
         select count(*) from public.payments q
          where q.promocion_id = pr.id and q.status = 'pagado'
            and q.student_id = pago.student_id) < pr.usos_por_cliente)
  )
  select t.id, t.nombre, t.tipo, t.valor, t.codigo, t.usos_restantes
    from (select * from heredada union all select * from vigentes) t, pago
   -- La que más descuenta primero: si hay dos automáticas, se ofrece la
   -- mejor para la clienta.
   order by case when t.tipo = 'porcentaje' then pago.amount * t.valor / 100 else t.valor end desc
$$;

revoke all on function public.promociones_para(uuid) from public, anon;
grant execute on function public.promociones_para(uuid) to authenticated;

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
-- Desde el SQL Editor las dos RECHAZAN: no hay sesión, así que `can()`
-- da false.
--
--   select * from public.anular_cobro(
--     (select id from public.payments where status = 'pagado' limit 1), 'prueba', 'nada');
--   -- tiene que decir: No tenés permiso para anular cobros.
--   select * from public.anular_cuota(
--     (select id from public.payments where status = 'pendiente' limit 1), 'prueba');
--   -- tiene que decir: No tenés permiso para anular cuotas.
--
-- El origen que dedujo para lo que ya había:
--
--   select origen, status, count(*) from public.payments group by 1, 2 order by 1, 2;
--
-- Lo demás se ejerce desde Pagos con la sesión de recepción. El paso a
-- paso, con qué mirar en la base después de cada uno, está en PLAN.md
-- (bloque del 27/09).
--
-- PARA VOLVER ATRÁS
--
--   begin;
--   drop function if exists public.anular_cobro(uuid, text, text);
--   drop function if exists public.anular_cuota(uuid, text);
--   -- y volver a correr el punto 3 de la 0079 (promociones_para), que
--   -- es la versión sin la promo heredada.
--   alter table public.payments drop constraint if exists payments_origen_check;
--   alter table public.payments
--     drop column if exists origen,
--     drop column if exists reabre_pago_id;
--   delete from public.payment_staff where cobrado_at is null;
--   alter table public.payment_staff
--     drop column if exists anulado_por,
--     drop column if exists anulado_at,
--     alter column cobrado_at set not null;
--   commit;
--
--   La pantalla vuelve sola a anular como antes (`voidPayment`) —sólo
--   sin deuda: "vuelve a deber" avisa que falta la 0083—, y las cuotas
--   reabiertas que ya se hayan creado quedan: son deudas de verdad. Las
--   que conservaban una promo pasan a cobrarse sin ella.
-- ============================================================
