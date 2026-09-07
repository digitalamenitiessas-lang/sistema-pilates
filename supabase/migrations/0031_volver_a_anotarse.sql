-- ============================================================
-- 0031 — Volver a anotarse en la clase que se canceló
--
-- La reserva tiene una restricción única por (clienta, clase, fecha) que
-- no mira el estado. Entonces alcanza con haber cancelado una vez para
-- que anotarse de nuevo en esa misma clase sea imposible: sale "ya tiene
-- una reserva para esa clase", y la única salida es borrar la fila desde
-- el SQL Editor.
--
-- Pasa todo el tiempo. La clienta cancela el lunes porque le salió algo,
-- se le libera la tarde, y quiere volver. O recepción cancela por error y
-- la quiere devolver donde estaba.
--
-- POR QUÉ NO SE SACA LA RESTRICCIÓN
--
-- Es la que impide que la misma clienta ocupe dos lugares de la misma
-- clase. Sacarla arregla esto y abre algo peor.
--
-- POR QUÉ NO ALCANZA CON UN UPDATE DESDE EL NAVEGADOR
--
-- Para el staff sí alcanzaría. Para la clienta no: su única política de
-- escritura es "alumno cancela" (0005:75-78), que exige que el estado
-- resultante sea 'cancelada'. No puede pasar ninguna reserva a
-- 'confirmada' por ningún camino — ni la suya. Por eso va una función,
-- que ejerce el permiso a mano y sirve para los dos.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

create or replace function public.reactivar_reserva(
  p_reserva uuid,
  p_estado  text default 'confirmada'
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_alumna uuid;
  v_estado text;
  v_propia boolean;
begin
  if p_estado not in ('confirmada', 'lista de espera') then
    raise exception 'Estado no válido para reactivar una reserva';
  end if;

  select r.student_id, r.status into v_alumna, v_estado
  from public.reservations r
  where r.id = p_reserva
  for update;

  if v_alumna is null then
    raise exception 'Esa reserva no existe';
  end if;

  if v_estado <> 'cancelada' then
    raise exception 'Esa reserva no está cancelada';
  end if;

  -- Suya, o de alguien con permiso de crear reservas. security definer no
  -- pasa por las políticas, así que el permiso se exige acá.
  v_propia := v_alumna in (select public.my_student_ids());

  if not v_propia and not (select public.can('reservas.crear')) then
    raise exception 'No tenés permiso para reactivar esa reserva';
  end if;

  -- El update dispara los triggers de siempre: el de cupo rechaza si la
  -- clase se llenó mientras tanto, y el de consumo vuelve a descontar la
  -- clase y limpia la marca de cancelación. Por eso se reactiva en vez de
  -- borrar y crear: así la reserva conserva su historia.
  update public.reservations
  set status = p_estado
  where id = p_reserva;
end;
$$;

revoke all on function public.reactivar_reserva(uuid, text) from public;
grant execute on function public.reactivar_reserva(uuid, text) to authenticated;

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
--   -- Con una reserva cancelada a mano:
--   select public.reactivar_reserva('<id de la reserva>');
--   select status, cancel_kind, cancelled_at from public.reservations
--   where id = '<id>';
--     → 'confirmada', y las dos columnas de cancelación en nulo
--
--   -- Sobre una que NO está cancelada:
--     → "Esa reserva no está cancelada"
--
--   -- Con una clase ya llena:
--     → "La clase ya está completa", del trigger de cupo de la 0018
--
-- Y en la pantalla: cancelar una reserva desde la agenda y volver a
-- anotar a la misma clienta en esa clase y esa fecha. Antes salía "ya
-- tiene una reserva para esa clase"; ahora entra.
-- ============================================================

-- ============================================================
-- VUELTA ATRÁS (no ejecutar salvo que haga falta)
--
--   begin;
--   drop function if exists public.reactivar_reserva(uuid, text);
--   commit;
--
-- Y revertir el commit que la llama, o volver a anotarse falla con el
-- error de reserva duplicada, que es lo que pasaba antes.
-- ============================================================
