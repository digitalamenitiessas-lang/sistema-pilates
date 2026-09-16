-- ============================================================
-- 0049 — El turno fijo se libera solo
--
-- El único pedido de §2 que la 0048 dejó pendiente, y el que el estudio
-- puso con esas palabras: *"Liberar automáticamente el turno cuando no
-- renueva dentro de su fecha correspondiente."*
--
-- Su regla, textual: *"Membresía vence: 20/10. Hasta el 20/10 conserva
-- prioridad. Si no renueva, desde el 21/10 su turno fijo puede
-- liberarse."* La 0048 ya calcula ese "hasta el 20/10" con
-- `prioridad_hasta()`. Falta el brazo que lo ejecute.
--
-- POR QUÉ NO LO HACE UN TRIGGER
--
-- Perder la prioridad no es un evento: es que pase un día. Nadie escribe
-- nada el 21/10, así que no hay disparador que disparar. Lo tiene que
-- mirar un proceso que corre todos los días, que es el que ya existe.
--
-- POR QUÉ LA FUNCIÓN VIVE EN LA BASE Y NO EN EL CRON
--
-- Porque la política de liberar exige `turnos.liberar` y el cron entra
-- con el service role, que no pasa por las políticas. Escrito en el cron,
-- el permiso no se verificaría nunca. Acá la función es `security
-- definer` y el permiso lo exige ella: `null` de actor —el cron— es la
-- única excepción, y está escrita, no implícita.
--
-- POR QUÉ NO LIBERA EL DÍA EXACTO Y LISTO
--
-- Porque el cron puede no correr un día. Libera todo lo que YA perdió la
-- prioridad, no lo que la perdió hoy: si el proceso se saltea el martes,
-- el miércoles se pone al día solo. Es el mismo criterio del
-- `renewal_catchup_days` de la 0041.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- REQUIERE la 0048.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. El interruptor
--
-- Nace APAGADO. Liberar turnos es sacarle a gente un lugar que venía
-- teniendo, y el estudio tiene que poder mirar primero a quiénes les
-- tocaría antes de que el proceso lo haga por su cuenta. La consulta
-- para mirarlo está al final.
-- ------------------------------------------------------------

insert into public.studio_settings
  (key, value, kind, options, label, help, group_key, sort_order, is_public, rige)
values
  ('auto_release_slots',
   'false',
   'boolean',
   '{}',
   'Liberar los turnos fijos automáticamente',
   'Cuando un cliente no renueva y se le acaban los días de gracia, el proceso diario le libera sus días y horarios fijos y avisa al equipo. Apagado, el proceso solo avisa y la recepción decide.',
   'reservas',
   49,
   false,
   true)
on conflict (key) do nothing;

-- ------------------------------------------------------------
-- 2. El tipo de aviso
--
-- Se agrega a la lista entera porque un CHECK se reemplaza, no se
-- extiende. Los diez de antes van tal cual.
-- ------------------------------------------------------------

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'pago_acreditado', 'nuevo_alumno',
  'membresia_por_vencer', 'membresia_vencida', 'deuda_vencida',
  'membresia_renovada',
  'caja_sin_cerrar', 'caja_diferencia', 'saldo_sin_imputar',
  'renovacion_omitida',
  'turno_liberado'
));

-- ------------------------------------------------------------
-- 3. Quiénes perdieron la prioridad
--
-- Lo separado de la acción a propósito: esta misma consulta es la que el
-- estudio mira antes de encender el automático, y la que el proceso usa
-- para avisar cuando está apagado. Una sola definición de "lo perdió".
-- ------------------------------------------------------------

create or replace function public.turnos_sin_prioridad()
returns table (
  slot_id uuid,
  student_id uuid,
  student_name text,
  class_id uuid,
  class_title text,
  day_of_week int,
  start_time time,
  prioridad_hasta date
)
language sql stable security definer set search_path = ''
as $$
  select f.id, f.student_id, s.name, f.class_id, cs.title,
         cs.day_of_week, cs.start_time,
         public.prioridad_hasta(f.student_id)
  from public.fixed_slots f
  join public.students s        on s.id = f.student_id
  join public.class_sessions cs on cs.id = f.class_id
  where f.estado = 'activo'
    -- Los pausados no entran: el cliente avisó que no viene un tiempo y
    -- el estudio le guardó el lugar. Liberárselo por no tener membresía
    -- vigente sería justo lo contrario de lo que se le prometió.
    and (
      public.prioridad_hasta(f.student_id) is null
      or public.prioridad_hasta(f.student_id) < (now() at time zone 'America/Argentina/Buenos_Aires')::date
    )
$$;

revoke all on function public.turnos_sin_prioridad() from public, anon;
grant execute on function public.turnos_sin_prioridad() to authenticated, service_role;

-- ------------------------------------------------------------
-- 4. La liberación
--
-- Devuelve cuántos liberó, para que el proceso diario lo pueda informar
-- y el estudio vea en el resumen si el día pasó algo.
-- ------------------------------------------------------------

create or replace function public.liberar_turnos_vencidos()
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_n     int  := 0;
begin
  -- El cron entra sin sesión: esa es la única excepción, y va escrita.
  -- Cualquier otro tiene que traer la clave, porque esta función pasa por
  -- encima de las políticas.
  if v_actor is not null and not public.can('turnos.liberar') then
    raise exception 'No tenés permiso para liberar turnos fijos.';
  end if;

  if public.param('auto_release_slots', 'false') <> 'true' then
    return 0;
  end if;

  update public.fixed_slots f
  set estado = 'liberado',
      motivo = 'No renovó: se le acabaron los días de gracia',
      liberado_at = now(),
      updated_by = v_actor,
      updated_at = now()
  where f.id in (select t.slot_id from public.turnos_sin_prioridad() t);

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.liberar_turnos_vencidos() from public, anon;
grant execute on function public.liberar_turnos_vencidos() to authenticated, service_role;

commit;

-- ============================================================
-- ANTES DE ENCENDERLO — mirar a quiénes les tocaría
--
--   select student_name, class_title, day_of_week, start_time, prioridad_hasta
--   from public.turnos_sin_prioridad()
--   order by student_name;
--
-- Con esa lista revisada:
--
--   update public.studio_settings set value = 'true' where key = 'auto_release_slots';
--
-- Y el freno de mano, que deja el aviso y saca la acción:
--
--   update public.studio_settings set value = 'false' where key = 'auto_release_slots';
--
-- ============================================================
-- CÓMO VERIFICAR
--
-- 1. Con el interruptor apagado, la función no toca nada:
--
--      select public.liberar_turnos_vencidos();    → 0
--
-- 2. Un turno de alguien sin membresía aparece en la lista, y uno de
--    alguien al día no.
--
-- 3. Un pausado NO aparece, aunque no tenga membresía.
--
-- ============================================================
-- PARA VOLVER ATRÁS
--
--   begin;
--   drop function if exists public.liberar_turnos_vencidos();
--   drop function if exists public.turnos_sin_prioridad();
--   delete from public.studio_settings where key = 'auto_release_slots';
--   alter table public.notifications drop constraint if exists notifications_type_check;
--   alter table public.notifications add constraint notifications_type_check check (type in (
--     'pago_acreditado', 'nuevo_alumno',
--     'membresia_por_vencer', 'membresia_vencida', 'deuda_vencida',
--     'membresia_renovada',
--     'caja_sin_cerrar', 'caja_diferencia', 'saldo_sin_imputar',
--     'renovacion_omitida'
--   ));
--   commit;
-- ============================================================
