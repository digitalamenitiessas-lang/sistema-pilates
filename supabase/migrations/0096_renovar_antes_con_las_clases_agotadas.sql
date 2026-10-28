-- ============================================================
-- 0096 — Renovar antes, cuando ya usó todas las clases
--
-- EL PEDIDO (el estudio, vía Matías, 28/10)
--
-- Dos clientas usaron las 8 clases de su mes antes de que terminara (el
-- período vencía el 05/11) y querían renovar ya. "Renovar membresía"
-- pone el mes nuevo en fila detrás del actual (0036/0037), así que
-- arrancaba el 06/11; y "Cambiar plan" (0095) no aceptaba el mismo plan.
--
-- LA REGLA (la propuso Matías): con el período AGOTADO —todas sus clases
-- usadas— se puede renovar desde hoy, con el mismo mecanismo de la 0095:
-- el período actual termina ayer, el nuevo arranca hoy y queda su cuota.
-- Con clases sin usar, el mismo plan sigue encolándose como siempre: así
-- nadie pierde clases por apretar el botón equivocado. Un plan DISTINTO
-- sigue pudiéndose cambiar desde hoy aunque queden clases (la 0095 avisa
-- cuántas se pierden).
--
-- Se reemplaza cambiar_plan_desde_hoy con esa única diferencia y el texto
-- del motivo ("Renovó antes" en vez de "Cambió a…").
--
-- Ejecutar completo en el SQL Editor.
-- ============================================================

begin;

set local lock_timeout = '5s';

do $$
declare
  v_actual text;
begin
  select md5(btrim(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
    into v_actual from pg_proc p
   where p.oid = to_regprocedure('public.cambiar_plan_desde_hoy(uuid, uuid)');
  if v_actual is null then
    raise exception 'Falta cambiar_plan_desde_hoy: correr primero la 0095. No se tocó nada.';
  end if;
  if v_actual not in ('93c802069fb153cb44b7c477cec218f8', '4e1140c30e80d983bc9833e1d5736fed') then
    raise exception 'cambiar_plan_desde_hoy no es la de la 0095 (su huella es %). No se tocó nada. Mandá el resultado de: select pg_get_functiondef(''public.cambiar_plan_desde_hoy(uuid, uuid)''::regprocedure);', v_actual;
  end if;
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
  -- 0096: el mismo plan, sólo si ya usó todas las clases del período. Es
  -- "renovar antes": con clases sin usar, el mes nuevo arranca cuando
  -- termina este (Renovar membresía), para que nadie las pierda sin querer.
  if v_nuevo.id = v_viejo.id and v_m.classes_used < v_m.classes_total then
    raise exception 'Ya tiene ese plan y le quedan % clases: el mes nuevo arranca cuando termina este, el %.',
      v_m.classes_total - v_m.classes_used, to_char(v_m.end_date + 1, 'DD/MM/YYYY');
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
         end_date_motivo = case when v_nuevo.id = v_viejo.id
                                then 'Renovó antes: usó todas sus clases (' || to_char(v_hoy, 'DD/MM/YYYY') || ')'
                                else 'Cambió a ' || v_nuevo.name || ' desde el ' || to_char(v_hoy, 'DD/MM/YYYY') end
   where id = v_m.id;

  -- 2. La oferta de renovación de ese período ya no tiene sentido.
  update public.payments
     set status = 'anulado',
         notes = concat_ws(' · ', nullif(btrim(coalesce(notes, '')), ''),
                           case when v_nuevo.id = v_viejo.id
                                then 'Anulada: renovó antes, desde el ' || to_char(v_hoy, 'DD/MM/YYYY')
                                else 'Anulada: cambió a ' || v_nuevo.name || ' desde el ' || to_char(v_hoy, 'DD/MM/YYYY') end)
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

do $$
begin
  if (select count(*) from public.perm_diff()) <> 0 then
    raise exception 'perm_diff no da cero. No se tocó nada.';
  end if;
end
$$;

commit;

select 'cambiar_plan_desde_hoy' as funcion, 'renueva antes si agotó las clases' as estado;

-- VUELTA ATRÁS: volver a correr la 0095 (su función).
