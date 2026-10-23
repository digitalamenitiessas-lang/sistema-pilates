-- ============================================================
-- 0095 — Cambiar de plan desde hoy
--
-- EL PEDIDO (el estudio, vía Matías, 23/10)
--
-- Una clienta con FE START (4 clases) las usó todas antes de fin de mes y
-- quiso pasar a FE FLOW. El sistema sólo sabía ENCOLAR el cambio: el plan
-- nuevo arrancaba cuando terminaba el viejo (0036/0037), y mientras tanto
-- se quedaba sin clases. El estudio eligió, entre subir en el mismo mes
-- pagando la diferencia o empezar un plan nuevo, la segunda: "plan nuevo
-- desde hoy".
--
-- QUÉ HACE `cambiar_plan_desde_hoy`
--
-- En una sola transacción, para que nunca quede a medias:
--   1. El período vigente termina AYER (end_date con su motivo, como el
--      "Vencimiento" de la 0047). Las clases que no usó se pierden: la
--      pantalla las cuenta y lo dice antes de confirmar.
--   2. Si el estudio le había emitido la oferta de renovación de ese
--      período (0041), se anula: ese período ya no se renueva, lo
--      reemplaza el nuevo.
--   3. Se crea el período del plan nuevo DESDE HOY. Como el viejo ya no
--      llega a hoy, membresia_fechas no lo encola.
--   4. Se genera su cuota, igual que "Asignar plan": precio de lista,
--      vence a los payment_grace_days. Se cobra con "Cobrar" y ahí se
--      aplican las promos.
--
-- Las reservas que ya tenía de hoy en adelante quedan como están, con el
-- período viejo: ya estaban contadas ahí, así que no le cuestan una clase
-- del nuevo.
--
-- LO QUE NO HACE, Y CORTA CON UN MENSAJE
--
--   · Si ya tiene el período SIGUIENTE asignado (pagó por adelantado): el
--     cambio correría ese también, y eso es plata ya cobrada. Se resuelve
--     a mano.
--   · Si la cuota del período actual está sin cobrar: quedaría una deuda
--     de un período que se cierra. Primero se cobra o se anula.
--   · Si el período empezó hoy: no hay "ayer" adentro del período; para
--     eso está "Deshacer" (0071) o cancelar.
--   · Un pase de prueba: los pases no encolan (0037), así que asignar el
--     plan desde la ficha ya arranca hoy.
--
-- QUIÉN: pide membresias.asignar y membresias.editar (admin y recepción,
-- las dos en sombra): crea un período y modifica otro.
--
-- Ejecutar completo en el SQL Editor.
-- ============================================================

begin;

set local lock_timeout = '5s';

-- ------------------------------------------------------------
-- Guardias: la función se apoya en el encolado de la 0037 y en el sello
-- del vencimiento de la 0047. Si alguna cambió, lo que acá se da por
-- hecho puede no ser cierto.
-- ------------------------------------------------------------
create temp table huellas_0095 (firma text primary key, esperada text) on commit drop;
insert into huellas_0095 values
  ('public.membresia_fechas()',  '118917adf27fa371818f68f629d4bce8'),
  ('public.stamp_membership()',  '70968d9bcebd0cc2485e088e7ba7563e');

do $$
declare
  h record;
  v_actual text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'memberships'
                    and column_name = 'end_date_motivo') then
    raise exception 'Falta memberships.end_date_motivo. Revisar si corrió la 0047. No se tocó nada.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'payments'
                    and column_name = 'renueva_membresia_id') then
    raise exception 'Falta payments.renueva_membresia_id. Revisar si corrió la 0041. No se tocó nada.';
  end if;
  for h in select * from pg_temp.huellas_0095 loop
    select md5(btrim(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
      into v_actual from pg_proc p where p.oid = to_regprocedure(h.firma);
    if v_actual is distinct from h.esperada then
      raise exception
        '% no es la versión del repo (su huella es %). No se tocó nada. Mandá el resultado de: select pg_get_functiondef(''%''::regprocedure);',
        h.firma, v_actual, h.firma;
    end if;
  end loop;
end
$$;

create or replace function public.cambiar_plan_desde_hoy(p_membresia uuid, p_plan uuid)
returns table (membresia_nueva uuid, cuota uuid, desde date, hasta date, clases_perdidas int)
language plpgsql security definer set search_path = ''
as $$
declare
  v_hoy    date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_m      public.memberships;
  v_viejo  public.plans;
  v_nuevo  public.plans;
  v_nueva  public.memberships;
  v_cuota  uuid;
  v_gracia int;
  v_perdidas int;
begin
  if not (public.can('membresias.asignar') and public.can('membresias.editar')) then
    raise exception 'No tenés permiso para cambiar el plan de una clienta.';
  end if;

  select * into v_m from public.memberships where id = p_membresia for update;
  if not found then
    raise exception 'Esa membresía no existe.';
  end if;
  select * into v_viejo from public.plans where id = v_m.plan_id;
  select * into v_nuevo from public.plans where id = p_plan;
  if not found or not v_nuevo.active then
    raise exception 'Ese plan no existe o está dado de baja.';
  end if;

  if v_m.status <> 'activa' or v_hoy < v_m.start_date or v_hoy > v_m.end_date then
    raise exception 'Sólo se cambia el plan del período que está corriendo hoy.';
  end if;
  if v_viejo.is_trial then
    raise exception 'Es un pase de prueba: asignale el plan nuevo desde la ficha, que ya arranca hoy.';
  end if;
  if v_nuevo.is_trial then
    raise exception 'No se cambia a un pase de prueba.';
  end if;
  if v_nuevo.id = v_viejo.id then
    raise exception 'Ya tiene ese plan.';
  end if;
  if v_m.start_date = v_hoy then
    raise exception 'El período empezó hoy: deshacelo o cancelalo desde la ficha y asigná el plan nuevo.';
  end if;

  if exists (
    select 1 from public.memberships x
     where x.student_id = v_m.student_id and x.id <> v_m.id
       and x.status = 'activa' and x.start_date > v_m.end_date
  ) then
    raise exception 'Ya tiene asignado el período siguiente: cambiar el plan desde hoy correría ese también. Resolvelo a mano.';
  end if;

  if exists (
    select 1 from public.payments p
     where p.membership_id = v_m.id and p.status in ('pendiente', 'vencido')
       and p.renueva_membresia_id is null
  ) then
    raise exception 'La cuota de este período está sin cobrar: cobrala o anulala antes de cambiar el plan.';
  end if;

  v_perdidas := greatest(v_m.classes_total - v_m.classes_used, 0);

  -- 1. El período viejo termina ayer. stamp_membership sella quién y cuándo.
  update public.memberships
     set end_date = v_hoy - 1,
         end_date_motivo = 'Cambió a ' || v_nuevo.name || ' desde el ' || to_char(v_hoy, 'DD/MM/YYYY')
   where id = v_m.id;

  -- 2. La oferta de renovación de ese período ya no tiene sentido.
  update public.payments
     set status = 'anulado',
         notes = concat_ws(' · ', nullif(btrim(coalesce(notes, '')), ''),
                           'Anulada: cambió a ' || v_nuevo.name || ' desde el ' || to_char(v_hoy, 'DD/MM/YYYY'))
   where renueva_membresia_id = v_m.id
     and status in ('pendiente', 'vencido');

  -- 3. El período nuevo, desde hoy. membresia_fechas calcula el fin.
  insert into public.memberships (student_id, plan_id, start_date, end_date, classes_total, classes_used, price)
  values (v_m.student_id, v_nuevo.id, v_hoy, v_hoy, v_nuevo.class_count, 0, v_nuevo.price)
  returning * into v_nueva;

  if v_nueva.start_date <> v_hoy then
    raise exception 'El período nuevo quedó en fila (arranca el %), no desde hoy. No se cambió nada.',
      to_char(v_nueva.start_date, 'DD/MM/YYYY');
  end if;

  -- 4. Su cuota, como "Asignar plan".
  if v_nuevo.price > 0 then
    v_gracia := coalesce(nullif(btrim(public.param('payment_grace_days', '5')), '')::int, 5);
    insert into public.payments (student_id, membership_id, concept, amount, due_date, status)
    values (v_m.student_id, v_nueva.id, v_nuevo.name, v_nuevo.price, v_hoy + v_gracia, 'pendiente')
    returning id into v_cuota;
  end if;

  return query select v_nueva.id, v_cuota, v_nueva.start_date, v_nueva.end_date, v_perdidas;
end;
$$;

revoke all on function public.cambiar_plan_desde_hoy(uuid, uuid) from public, anon;
grant execute on function public.cambiar_plan_desde_hoy(uuid, uuid) to authenticated;

comment on function public.cambiar_plan_desde_hoy(uuid, uuid) is
  'Cierra el período vigente ayer y arranca el plan nuevo hoy, con su cuota (0095).';

do $$
begin
  if has_function_privilege('anon', 'public.cambiar_plan_desde_hoy(uuid, uuid)', 'execute') then
    raise exception 'La función quedó abierta para anon.';
  end if;
  if (select count(*) from public.perm_diff()) <> 0 then
    raise exception 'perm_diff no da cero. No se tocó nada.';
  end if;
end
$$;

commit;

select 'cambiar_plan_desde_hoy' as funcion, 'lista' as estado;

-- ------------------------------------------------------------
-- VUELTA ATRÁS (no toca políticas):
--   drop function if exists public.cambiar_plan_desde_hoy(uuid, uuid);
-- ------------------------------------------------------------
