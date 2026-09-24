-- ============================================================
-- 0077 — La clienta se da su propio turno fijo
--
-- Lo pidió el estudio el 23/09, por Matías:
--
--   "me gustaría que el alumno pueda crear su turno fijo. Cuando saca el
--    primer turno ahí, que le pregunte si es solo por ahora o si quiere
--    hacerlo fijo a ese horario, que completaría el mes que tiene."
--
-- Y una decisión que vino con el pedido: al renovar el mes VUELVE A
-- ELEGIR. El turno fijo vale para el período en curso y nada se crea
-- solo el mes siguiente. Eso saca de encima todo el proceso semanal —el
-- último pendiente de la §2— y deja el alcance en dos cosas: que pueda
-- escribir su turno, y que pueda soltarlo.
--
-- POR QUÉ UNA FUNCIÓN Y NO ABRIRLE LA POLÍTICA
--
-- El precedente está escrito en la 0031 y repetido en la 0046: para el
-- staff una política alcanza, para la clienta no. Tres razones concretas:
--
--   · Una política sólo sabe decir sí o no. Un rechazo de RLS sale como
--     'new row violates row-level security policy', y acá los rechazos
--     tienen que explicarse —"esa clase ya tiene sus 8 lugares fijos
--     tomados"— porque los lee ella, sola, en el teléfono.
--   · Las reglas no se pueden escribir como condición de fila: "sólo
--     sobre una clase que se repite", "sólo si tiene una membresía que la
--     cubra", "sólo sobre su propia ficha".
--   · `stamp_fixed_slot` sella `created_by = auth.uid()`. Con una política
--     abierta, el turno que se da la clienta quedaría indistinguible del
--     que le asignó recepción. Acá se marca en el motivo, que es el campo
--     que ella misma lee.
--
-- LO QUE ESTA MIGRACIÓN NO HACE
--
-- No crea las reservas. Eso lo hace el portal, una por una, con la sesión
-- de la clienta y por el mismo camino que usa para reservar a mano — así
-- cada fecha pasa por `consumir_clase` y hereda sus rechazos con su texto,
-- y una fecha que no entra no arrastra a las demás. Hacerlo acá adentro
-- sería inventar un segundo camino de reserva, con su propia copia de las
-- reglas.
--
-- Y no toca el cupo. `guard_cupo_fijo` (0048) ya limita cuántos turnos
-- fijos entran en una clase; el lugar del día lo sigue cuidando
-- `enforce_class_capacity` sobre las reservas, que son las que se crean.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Tomar el turno
-- ------------------------------------------------------------

create or replace function public.turno_fijo_propio(p_class uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_alumna uuid;
  v_kind   text;
  v_activa boolean;
  v_titulo text;
  v_id     uuid;
begin
  -- Su propia ficha, y sólo esa. `my_student_ids()` es el aislamiento de
  -- la clienta y no es configurable (0005): acá se apoya en él en vez de
  -- recibir un student_id, que sería pedirle al navegador que diga quién
  -- es.
  select s.id into v_alumna
  from public.students s
  where s.id in (select public.my_student_ids())
  limit 1;

  if v_alumna is null then
    raise exception 'Tu cuenta no está vinculada a una ficha de cliente.';
  end if;

  select cs.kind, cs.active, cs.title into v_kind, v_activa, v_titulo
  from public.class_sessions cs where cs.id = p_class;

  if v_kind is null then
    raise exception 'Esa clase no existe.';
  end if;
  if not v_activa then
    raise exception 'Esa clase ya no se dicta.';
  end if;
  -- Un taller tiene fecha propia (0040), así que no se repite y no puede
  -- ser el horario de todas las semanas.
  if v_kind <> 'regular' then
    raise exception 'Ese es un taller con fecha propia, no un horario que se repita todas las semanas.';
  end if;

  -- Sin membresía vigente el turno no tendría con qué reservarse, y la
  -- prioridad que promete la 0048 se mide contra el vencimiento de la
  -- membresía: sin una, no hay hasta cuándo.
  if not exists (
    select 1 from public.memberships m
    where m.student_id = v_alumna
      and m.status = 'activa'
      and (now() at time zone 'America/Argentina/Buenos_Aires')::date
          between m.start_date and m.end_date
  ) then
    raise exception 'Necesitás una membresía vigente para tomar un horario fijo.';
  end if;

  -- El índice parcial de la 0048 ya lo impide, pero su error habla de un
  -- índice y esto lo lee ella.
  if exists (
    select 1 from public.fixed_slots f
    where f.student_id = v_alumna and f.class_id = p_class and f.estado <> 'liberado'
  ) then
    raise exception 'Ese horario ya es tu turno fijo.';
  end if;

  -- El cupo de turnos fijos lo cuida `guard_cupo_fijo` con su propio
  -- mensaje, que ya nombra la clase y los lugares.
  insert into public.fixed_slots (student_id, class_id, motivo)
  values (v_alumna, p_class, 'Lo eligió la clienta desde el portal')
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.turno_fijo_propio(uuid) from public, anon;
grant execute on function public.turno_fijo_propio(uuid) to authenticated;

-- ------------------------------------------------------------
-- 2. Soltarlo
--
-- Sin esto, dárselo sería una puerta de una sola dirección: liberar exige
-- `turnos.liberar` por una política restrictiva, que la clienta no tiene.
-- Suelta el suyo y nada más — el de otra no lo encuentra, porque la
-- consulta filtra por `my_student_ids()`.
--
-- Las reservas que ya se crearon NO se tocan: el turno es el derecho
-- sobre el horario, las reservas son otra cosa y cada una se cancela con
-- su propia regla de plazo. Borrarlas acá saltearía esa regla.
-- ------------------------------------------------------------

create or replace function public.soltar_turno_fijo_propio(p_slot uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_tocadas int;
begin
  update public.fixed_slots f
     set estado = 'liberado',
         motivo = 'Lo dejó la clienta desde el portal',
         liberado_at = now()
   where f.id = p_slot
     and f.student_id in (select public.my_student_ids())
     and f.estado <> 'liberado';

  get diagnostics v_tocadas = row_count;
  if v_tocadas = 0 then
    raise exception 'Ese horario fijo no es tuyo, o ya lo habías dejado.';
  end if;
end;
$$;

revoke all on function public.soltar_turno_fijo_propio(uuid) from public, anon;
grant execute on function public.soltar_turno_fijo_propio(uuid) to authenticated;

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
-- Desde el SQL Editor las DOS rechazan, y está bien: no hay sesión, así
-- que `my_student_ids()` viene vacío.
--
--   select public.turno_fijo_propio(
--     (select id from public.class_sessions where active and kind = 'regular' limit 1));
--   -- 'Tu cuenta no está vinculada a una ficha de cliente.'
--
-- Con la sesión de una clienta, desde el portal:
--
--   1. Reservar una clase de la grilla. Al confirmarse tiene que ofrecer
--      hacerlo fijo, con las fechas que le quedan y cuántas clases le
--      consume.
--   2. Aceptar. Tiene que quedar la fila en fixed_slots y las reservas de
--      esas fechas:
--
--      select f.estado, f.motivo, cs.title, cs.day_of_week, cs.start_time
--        from public.fixed_slots f join public.class_sessions cs on cs.id = f.class_id;
--      -- una fila 'activo' con el motivo del portal
--
--   3. Los cuatro rechazos, que son lo que hay que probar de verdad:
--      a) sobre la misma clase otra vez → 'Ese horario ya es tu turno fijo'
--      b) sobre un taller               → 'Ese es un taller con fecha propia...'
--      c) sin membresía vigente         → 'Necesitás una membresía vigente...'
--      d) sobre una clase con sus lugares fijos tomados → el mensaje de
--         `guard_cupo_fijo`, que nombra la clase y el cupo
--
--   4. Soltarlo desde el portal, y que el de otra clienta no se pueda:
--      select public.soltar_turno_fijo_propio('<el id de otra>');
--      -- 'Ese horario fijo no es tuyo, o ya lo habías dejado.'
--
-- PARA VOLVER ATRÁS
--
--   drop function if exists public.turno_fijo_propio(uuid);
--   drop function if exists public.soltar_turno_fijo_propio(uuid);
--
--   Los turnos que se hayan creado quedan: son filas normales de
--   fixed_slots y el mostrador los sigue administrando. Se reconocen por
--   el motivo.
-- ============================================================
