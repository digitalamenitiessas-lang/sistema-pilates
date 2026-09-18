-- ============================================================
-- 0071 — Deshacer una asignación equivocada, que no es lo mismo que
--        cancelar una membresía
--
-- Lo preguntó Matías el 18/09: "quizás sin querer le creé una y era otra,
-- debería poder eliminar o editarla en ese momento".
--
-- Tenía razón en que faltaba, y la 0069 no lo cubre: cancelar deja el
-- período en la historia con su motivo, que es exactamente lo que se
-- quiere cuando una clienta se va — y exactamente lo que NO se quiere
-- cuando fue un dedazo de treinta segundos antes. La ficha se llena de
-- "canceladas" que no significan nada y el reporte de cancelaciones, que
-- debería listar bajas reales, se llena de typos.
--
-- LA REGLA: SE BORRA SÓLO LO QUE NO DEJÓ HUELLA
--
-- No hay ventana de tiempo. Un "dentro de los 10 minutos" es arbitrario y
-- frustra a quien se da cuenta a los veinte. Lo que importa es material:
-- si nadie usó una clase, nadie reservó contra ese período y nadie pagó,
-- borrarlo no pierde nada. Si algo de eso pasó, no es un error de carga y
-- se cancela.
--
--   · `classes_used > 0`     → no es un dedazo, es un período en uso
--   · tiene reservas         → esas clases se pagaron con ESTE período
--   · su cuota está cobrada  → hay plata en un arqueo, se anula en Pagos
--
-- POR QUÉ LA CUOTA SE BORRA A MANO Y NO POR CASCADA
--
-- `payments.membership_id` es `on delete set null` (0001). Borrar la
-- membresía y confiar en la clave ajena dejaría su cuota **huérfana**:
-- viva, pendiente, sin período, apareciendo como deuda de algo que no
-- existe. Por eso la función la borra explícitamente, y por eso el
-- borrado va acá y no como un `delete` desde el navegador.
--
-- Lo mismo explica la condición de las reservas: `reservations.
-- membership_id` también es `set null`, así que un borrado con reservas
-- las dejaría sin período y `consumo_contadas` (0046) dejaría de contar
-- esas clases para nadie. Un `delete` suelto no da error: hace eso, en
-- silencio.
--
-- LO QUE NO SE HACE: EDITAR
--
-- Cambiarle el plan a un período existente obliga a recalcular vigencia,
-- clases y precio, y si algo se usó los números dejan de cerrar. Borrar y
-- asignar de nuevo es lo mismo con menos que pueda salir mal, y con la
-- ventaja de que las condiciones de arriba lo hacen imposible cuando no
-- corresponde.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

create or replace function public.eliminar_membresia(p_id uuid)
returns table (plan text, desde date, hasta date, cuotas_borradas int, monto_borrado numeric)
language plpgsql security definer set search_path = ''
as $$
declare
  v_m record;
  v_reservas int;
  v_cobrada record;
  v_cuotas int := 0;
  v_monto numeric := 0;
begin
  if not public.can('membresias.eliminar') then
    raise exception 'No tenés permiso para eliminar una membresía';
  end if;

  select m.id, m.start_date, m.end_date, m.classes_used, p.name as plan_name
    into v_m
    from public.memberships m
    join public.plans p on p.id = m.plan_id
   where m.id = p_id
     for update of m;
  if not found then
    raise exception 'Esa membresía no existe';
  end if;

  if v_m.classes_used > 0 then
    raise exception
      'Ese período ya tiene % clase(s) usada(s), así que no es un error de carga: cancelalo en vez de borrarlo.',
      v_m.classes_used;
  end if;

  select count(*) into v_reservas
    from public.reservations r where r.membership_id = p_id;
  if v_reservas > 0 then
    raise exception
      'Ese período tiene % reserva(s) hechas contra él: borrarlo las dejaría sin plan. Cancelalo en vez de borrarlo.',
      v_reservas;
  end if;

  select pa.receipt_number into v_cobrada
    from public.payments pa
   where pa.membership_id = p_id and pa.status = 'pagado'
   limit 1;
  if found then
    raise exception
      'La cuota de ese período ya está cobrada (comprobante %). Anulá el cobro desde Pagos si corresponde devolverlo; el período se cancela, no se borra.',
      coalesce(v_cobrada.receipt_number::text, 's/n');
  end if;

  -- La cuota se borra explícitamente: la clave ajena la dejaría viva y sin
  -- período, o sea una deuda de algo que no existe.
  with borradas as (
    delete from public.payments where membership_id = p_id returning amount
  )
  select count(*)::int, coalesce(sum(amount), 0) into v_cuotas, v_monto from borradas;

  delete from public.memberships where id = p_id;

  return query
  select v_m.plan_name, v_m.start_date, v_m.end_date, v_cuotas, v_monto;
end;
$$;

revoke all on function public.eliminar_membresia(uuid) from public, anon;
grant execute on function public.eliminar_membresia(uuid) to authenticated;

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
-- Desde el SQL Editor RECHAZA: no hay sesión, así que `can()` da false.
--
--   select * from public.eliminar_membresia(
--     (select id from public.memberships limit 1));
--   -- tiene que decir: No tenés permiso para eliminar una membresía
--
-- Con la sesión de un admin, desde la ficha:
--
--   -- 1. Asignar un plan y deshacerlo enseguida. Tiene que devolver el
--   --    plan, las fechas y la cuota borrada, y la ficha tiene que quedar
--   --    como antes de asignarlo: sin la fila en el historial y sin la
--   --    cuota en Pagos.
--
--   -- 2. Los tres rechazos, que son lo que hay que probar de verdad:
--   --    a) con una clase usada  → "ya tiene N clase(s) usada(s)"
--   --    b) con una reserva      → "tiene N reserva(s) hechas contra él"
--   --    c) con la cuota cobrada → nombra el comprobante
--
--   -- 3. Y que no queden cuotas huérfanas nunca, que es el punto de que
--   --    esto sea una función y no un delete desde el navegador:
--   select count(*) from public.payments
--    where membership_id is null and concept <> 'Otro';
--   -- Lo que dé hoy es la línea de base; después de borrar un período
--   -- tiene que dar lo mismo.
--
-- PARA VOLVER ATRÁS
--
--   drop function if exists public.eliminar_membresia(uuid);
--
--   No hay datos que revertir: la función no crea nada.
-- ============================================================
