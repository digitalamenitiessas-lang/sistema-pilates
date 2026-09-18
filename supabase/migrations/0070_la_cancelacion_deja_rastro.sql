-- ============================================================
-- 0070 — La cancelación de una membresía no dejaba rastro
--
-- Lo encontró Matías el 18/09, usando la cancelación que la 0069 había
-- agregado el día anterior: canceló un período, después pidió ver en
-- Reportes qué había pasado y no había nada. Tenía razón, y es peor de lo
-- que parecía.
--
-- QUÉ FALTABA
--
-- La 0069 guardaba el motivo en la NOTA DE LA CUOTA que anulaba. Eso
-- parecía suficiente y no lo es, por dos razones:
--
--   1. Si el período no tiene cuota pendiente, no hay nota donde escribir
--      y **el motivo se pierde**. Es exactamente lo que le pasó: su cuota
--      ya había sido anulada desde Pagos —porque estaba cobrada, y la
--      0069 se niega a cancelar sobre un cobro para no tocar la caja de
--      refilón—, así que al cancelar la membresía el motivo que escribió
--      no quedó en ningún lado.
--
--   2. Aun cuando la nota existe, el motivo queda colgado de la cuota y
--      no de la membresía. Quien mira la ficha de la clienta no lo ve, y
--      ningún reporte puede listar "las canceladas y por qué".
--
-- Tampoco quedaba CUÁNDO ni QUIÉN: las columnas `updated_at` y
-- `updated_by` existen desde la 0047 y la función no las escribía, así
-- que las tres canceladas que hay hoy tienen las tres columnas en nulo.
--
-- QUÉ CAMBIA
--
-- El motivo pasa a vivir en la membresía, en su propia columna, y la
-- función sella quién y cuándo. La nota de la cuota se sigue escribiendo
-- —es útil en Pagos, donde alguien se pregunta por qué falta ese mes—,
-- pero ya no es el único lugar.
--
-- LO QUE NO SE PUEDE ARREGLAR
--
-- Los motivos de las cancelaciones que ya pasaron. El de una está en la
-- nota de su cuota; el de la otra se perdió. No se inventa: quedan en
-- nulo y el reporte los muestra como "sin motivo registrado".
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

alter table public.memberships
  add column if not exists cancel_motivo text;

comment on column public.memberships.cancel_motivo is
  'Por qué se canceló el período (0070). Lo exige `cancelar_membresia`. Vive acá y no sólo en la nota de la cuota anulada porque un período sin cuota pendiente no tiene nota donde escribir, y ahí el motivo se perdía.';

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
    raise exception 'La cancelación necesita un motivo: queda escrito en la ficha de la clienta';
  end if;

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
         auto_renew = false,
         -- El motivo, el momento y la persona. Sin esto la cancelación era
         -- un cambio de estado anónimo y sin fecha (0070).
         cancel_motivo = btrim(p_motivo),
         updated_at = now(),
         updated_by = auth.uid()
   where id = p_id;

  -- La nota de la cuota se sigue escribiendo: es donde alguien la busca
  -- cuando mira Pagos y ve un mes anulado. Ya no es el único lugar.
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
--   -- 1. La columna existe y las canceladas viejas quedan en nulo, que es
--   --    la verdad: su motivo no se guardó nunca.
--   select start_date, status, cancel_motivo, updated_at, updated_by
--     from public.memberships where status = 'cancelada';
--
--   -- 2. Desde el SQL Editor la función sigue rechazando (no hay sesión).
--   select * from public.cancelar_membresia(
--     (select id from public.memberships where status = 'activa' limit 1), 'prueba');
--   -- tiene que decir: No tenés permiso para cancelar una membresía
--
--   -- 3. Con la sesión de un admin, cancelar un período desde la ficha y
--   --    después mirar que las tres columnas quedaron escritas:
--   select start_date, cancel_motivo, updated_at, updated_by
--     from public.memberships where id = '<la que se canceló>';
--
--   -- 4. Y que el motivo queda aunque NO haya cuota pendiente: anular la
--   --    cuota primero desde Pagos y después cancelar la membresía. Antes
--   --    de la 0070 ese motivo se perdía; ahora tiene que estar en
--   --    `cancel_motivo` igual, con `cuota_anulada` devolviendo 0.
--
-- PARA VOLVER ATRÁS
--
--   Volver a correr el cuerpo de la función tal como está en la 0069, y:
--   alter table public.memberships drop column if exists cancel_motivo;
--
--   Ojo: eso borra los motivos que se hayan registrado desde entonces.
-- ============================================================
