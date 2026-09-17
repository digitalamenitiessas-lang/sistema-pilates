-- ============================================================
-- 0069 — Cancelar una membresía, y que su cuota se vaya con ella
--
-- Lo pidió el estudio el 17/09, con un caso propio arriba de la mesa: a
-- Lourdes le asignaron dos planes y en el portal le aparecían las dos
-- cuotas pendientes. Su pedido textual: "Cancelar membresía así no
-- aparecen las dos en simultáneo".
--
-- LO QUE PASÓ NO FUE UN ERROR DEL SISTEMA
--
-- Los dos períodos no se solapan: FE FLOW va del 15/09 al 14/10 y
-- FE STRONG arranca el 15/10, justo cuando el primero termina. Es el
-- encolado de la `0036`, que existe para que pagar antes no le corte el
-- mes a nadie. Lo que faltaba era **poder deshacer una asignación**: las
-- únicas acciones que había sobre una membresía eran asignarla y prender
-- o apagar la renovación automática. Ni cancelar, ni suspender, ni
-- borrar. Quien se equivocaba de plan no tenía salida.
--
-- POR QUÉ ALCANZA CON EL ESTADO
--
-- Todo el sistema busca la membresía vigente con `status = 'activa'`: el
-- chequeo al reservar (`0029`), el descuento de la clase, el encolado
-- (`0036`, `0037`) y la vista que alimenta la pantalla (`0030`). O sea
-- que marcarla `cancelada` la saca de todos esos caminos de una vez, sin
-- reescribir `start_date` ni `end_date` — que son historia y no se
-- tocan— y sin borrar una fila, que es la regla de la casa: las bajas
-- son lógicas.
--
-- LA CUOTA SE VA CON ELLA, SALVO QUE YA SE HAYA COBRADO
--
-- Cancelar el período y dejarle la cuota viva sería peor que no hacer
-- nada: la clienta seguiría debiendo $105.000 de un mes que no existe, y
-- el proceso diario se los seguiría reclamando por mail. Así que la
-- pendiente se anula en la misma transacción, con el motivo escrito.
--
-- Pero si la cuota **ya está cobrada**, esto se niega. Esa es plata que
-- entró y que figura en un arqueo de caja firmado: devolverla es una
-- decisión con su propio rastro y se hace desde Pagos. Una función que
-- anulara un cobro de refilón dejaría la caja sin explicación.
--
-- El motivo es obligatorio y lo exige la base, no la pantalla: queda
-- escrito en la cuota anulada, que es donde alguien va a buscar dentro
-- de tres meses por qué falta ese mes.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- ── 1. El estado nuevo ──────────────────────────────────────────────
alter table public.memberships
  drop constraint if exists memberships_status_check;
alter table public.memberships
  add constraint memberships_status_check
  check (status in ('activa', 'suspendida', 'cancelada'));

comment on column public.memberships.status is
  'Estado administrativo. ''vencida'' y ''por vencer'' se derivan de end_date al leer; ''futura'' también, cuando start_date es posterior a hoy. ''cancelada'' (0069) la saca de todo: reservar, consumir clases y encolar buscan status = ''activa''.';

-- ── 2. La cancelación, entera o nada ────────────────────────────────
create or replace function public.cancelar_membresia(p_id uuid, p_motivo text)
returns table (plan text, desde date, hasta date, clases_usadas int, cuota_anulada numeric)
language plpgsql security definer set search_path = ''
as $$
declare
  v_m record;
  v_cobrada record;
  v_anulado numeric := 0;
begin
  if not public.can('membresias.anular') then
    raise exception 'No tenés permiso para cancelar una membresía';
  end if;

  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'La cancelación necesita un motivo: queda escrito en la cuota anulada';
  end if;

  -- `for update` porque entre leerla y cambiarla puede entrar el proceso
  -- diario a emitir la renovación de esta misma membresía.
  select m.id, m.status, m.start_date, m.end_date, m.classes_used, p.name as plan_name
    into v_m
    from public.memberships m
    join public.plans p on p.id = m.plan_id
   where m.id = p_id
     for update of m;

  if not found then
    raise exception 'Esa membresía no existe';
  end if;
  if v_m.status = 'cancelada' then
    raise exception 'Esa membresía ya estaba cancelada';
  end if;

  -- Si la cuota ya se cobró, acá no se decide nada: la plata que entró
  -- se devuelve desde Pagos, con su comprobante y su rastro en la caja.
  select pa.receipt_number, pa.amount into v_cobrada
    from public.payments pa
   where pa.membership_id = p_id and pa.status = 'pagado'
   limit 1;
  if found then
    raise exception
      'La cuota de este período ya está cobrada (comprobante %). Si corresponde devolverla, anulá el cobro desde Pagos y después cancelá la membresía.',
      coalesce(v_cobrada.receipt_number::text, 's/n');
  end if;

  update public.memberships
     set status = 'cancelada',
         -- Muerta la membresía, la renovación automática no tiene qué
         -- renovar. Se apaga explícitamente para que ninguna consulta que
         -- se olvide de filtrar por estado la reviva.
         auto_renew = false
   where id = p_id;

  -- La pendiente se anula con el motivo pegado a lo que ya decía la nota.
  -- Pisar `notes` en vez de agregar borraría, por ejemplo, el "ajustado
  -- por efectivo" que dejó el cobro.
  with anuladas as (
    update public.payments
       set status = 'anulado',
           notes = btrim(
             coalesce(notes || ' · ', '') ||
             'Anulado: se canceló la membresía — ' || btrim(p_motivo)
           )
     where membership_id = p_id
       and status in ('pendiente', 'vencido')
    returning amount
  )
  select coalesce(sum(amount), 0) into v_anulado from anuladas;

  return query
  select v_m.plan_name, v_m.start_date, v_m.end_date, v_m.classes_used, v_anulado;
end;
$$;

revoke all on function public.cancelar_membresia(uuid, text) from public, anon;
grant execute on function public.cancelar_membresia(uuid, text) to authenticated;

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
-- Desde el SQL Editor la función RECHAZA: no hay sesión, `auth.uid()` es
-- nulo, `mis_permisos()` devuelve vacío y `can()` da false. Eso es lo
-- correcto y es la primera verificación.
--
--   select * from public.cancelar_membresia(
--     (select id from public.memberships limit 1), 'prueba');
--   -- tiene que decir: No tenés permiso para cancelar una membresía
--
-- Con la sesión de un admin, desde la ficha de la clienta:
--
--   -- 1. El caso de Lourdes: cancelar el período que todavía no empezó.
--   --    Tiene que devolver el plan, las fechas y $105000 de cuota
--   --    anulada, y en el portal la clienta tiene que quedar con UNA sola
--   --    cuota pendiente.
--
--   -- 2. El motivo vacío se rechaza:
--   --    la pantalla no deja, y la base tampoco.
--
--   -- 3. Cancelar dos veces la misma: "ya estaba cancelada".
--
--   -- 4. Una con la cuota cobrada tiene que negarse nombrando el
--   --    comprobante. Para probarlo: cobrar una cuota y después intentar
--   --    cancelar su membresía.
--
--   -- 5. Y que la cancelada deje de servir para reservar:
--   select status, start_date, end_date from public.memberships
--    where id = '<la cancelada>';
--   -- status = 'cancelada', y las fechas SIN cambios.
--
-- PARA VOLVER ATRÁS
--
--   -- Ojo: si hay alguna cancelada, el check no se puede angostar hasta
--   -- que se resuelva qué hacer con esas filas.
--   drop function if exists public.cancelar_membresia(uuid, text);
--   alter table public.memberships drop constraint memberships_status_check;
--   alter table public.memberships
--     add constraint memberships_status_check
--     check (status in ('activa', 'suspendida'));
-- ============================================================
