-- ============================================================
-- 0052 — Los avisos que le faltaban a la clienta
--
-- Los cinco de la sección 14 que el estudio volvió a marcar: confirmación
-- de reserva, recordatorio de clase, clase suspendida, cambio de
-- profesora y lugar liberado.
--
-- POR QUÉ LOS ESCRIBE LA BASE Y NO EL NAVEGADOR
--
-- Porque el mismo hecho pasa desde cuatro lados. Una reserva nace desde
-- la agenda, desde el portal, desde la pantalla de asistencia y desde
-- cualquier proceso que venga después; una suspensión, desde la agenda y
-- mañana desde una carga masiva de feriados. Escrito en cada pantalla,
-- el aviso sale cuatro veces —y falta la quinta vez que alguien agregue
-- un camino nuevo y no se acuerde—. Es el mismo motivo por el que la
-- 0022 puso el sellado de la reserva en la base.
--
-- Y POR QUÉ NO HACE FALTA CAÑERÍA NUEVA
--
-- La 0007 ya deja que la clienta lea sus propios avisos
-- (`audience = 'alumno'` y `student_id in my_student_ids()`), y el portal
-- monta la misma campana que el mostrador, con realtime. O sea que una
-- fila insertada acá **le aparece en el momento**, sin que nadie la
-- mande a buscar.
--
-- El push al celular y el mail son otra cosa: necesitan salir del
-- servidor, no de un trigger. Lo que esta migración garantiza es que el
-- aviso EXISTE y le llega al portal; el push de estos cinco queda para
-- cuando se decida cuáles merecen vibrarle el teléfono. Se escribe
-- porque la diferencia importa: "le avisamos" y "le sonó el teléfono" no
-- son lo mismo, y prometer lo segundo sin hacerlo es lo peor de los dos.
--
-- CUÁNDO NO SE AVISA
--
-- Un aviso que llega por algo que la clienta acaba de hacer ella misma es
-- ruido. Pero el que le interesa —"te anotaron", "te suspendieron la
-- clase"— nunca lo hace ella. La regla queda escrita en cada trigger.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Los cinco tipos
--
-- La lista entera porque un CHECK se reemplaza, no se extiende. Los once
-- de antes van tal cual.
-- ------------------------------------------------------------

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'pago_acreditado', 'nuevo_alumno',
  'membresia_por_vencer', 'membresia_vencida', 'deuda_vencida',
  'membresia_renovada',
  'caja_sin_cerrar', 'caja_diferencia', 'saldo_sin_imputar',
  'renovacion_omitida',
  'turno_liberado',
  'reserva_confirmada', 'clase_recordatorio', 'clase_suspendida',
  'clase_cambio_profesora', 'lugar_liberado'
));

-- ------------------------------------------------------------
-- 2. Cómo se dice una clase
--
-- Una sola vez: los cinco avisos la nombran igual, y si cada uno armara
-- su frase, el día que el estudio pida "no digas la sala" habría que
-- acordarse de cinco lugares.
-- ------------------------------------------------------------

create or replace function public.texto_de_la_clase(p_class uuid, p_fecha date)
returns text
language sql stable security definer set search_path = ''
as $$
  select cs.title || ' del '
      || to_char(p_fecha, 'DD/MM')
      || ' a las ' || to_char(coalesce(o.start_time, cs.start_time), 'HH24:MI')
  from public.class_sessions cs
  left join public.class_occurrences o on o.class_id = cs.id and o.date = p_fecha
  where cs.id = p_class
$$;

revoke all on function public.texto_de_la_clase(uuid, date) from public, anon;
grant execute on function public.texto_de_la_clase(uuid, date) to authenticated;

-- ------------------------------------------------------------
-- 3. Confirmación de reserva, y el lugar liberado
--
-- Los dos cuelgan de `reservations`, así que van en un trigger solo: son
-- dos caras del mismo hecho —alguien entra, alguien sale— y separarlos
-- serían dos triggers recorriendo la misma fila.
-- ------------------------------------------------------------

create or replace function public.avisar_reserva()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_clase text;
begin
  -- ---- Le confirmamos la reserva ----
  if tg_op = 'INSERT' and new.status = 'confirmada' then
    -- Salvo que se la haya hecho ella misma desde el portal: confirmarle
    -- lo que acaba de tocar es ruido. El aviso existe para cuando la
    -- anota el mostrador y ella se entera acá.
    if coalesce(new.source, '') <> 'portal' then
      insert into public.notifications (type, title, body, student_id, audience, dedupe_key)
      values (
        'reserva_confirmada',
        'Te anotamos en una clase',
        'Quedaste anotada en ' || public.texto_de_la_clase(new.class_id, new.date) || '.',
        new.student_id,
        'alumno',
        'reserva-ok-' || new.id
      )
      on conflict (dedupe_key) do nothing;
    end if;
  end if;

  -- ---- Se liberó un lugar: se le avisa a TODA la lista de espera ----
  --
  -- A todas y no a la primera, que es la política que el estudio dejó
  -- dicha cuando se relevó la lista de espera. Por eso
  -- `waitlist_offer_minutes` sigue sin regir: tal como está redactado
  -- describe una oferta por turno, que es lo contrario.
  if tg_op = 'UPDATE'
     and new.status = 'cancelada'
     and old.status = 'confirmada' then

    v_clase := public.texto_de_la_clase(new.class_id, new.date);

    insert into public.notifications (type, title, body, student_id, audience, dedupe_key)
    select
      'lugar_liberado',
      'Se liberó un lugar',
      'Se liberó un lugar en ' || v_clase || '. Entrá a reservarlo.',
      w.student_id,
      'alumno',
      -- Por (quien espera, clase, fecha): si se liberan dos lugares el
      -- mismo día no se le avisa dos veces lo mismo.
      'lugar-libre-' || w.student_id || '-' || new.class_id || '-' || new.date
    from public.reservations w
    where w.class_id = new.class_id
      and w.date = new.date
      and w.status = 'lista de espera'
    on conflict (dedupe_key) do nothing;
  end if;

  return null;
end;
$$;

drop trigger if exists reservations_avisos on public.reservations;
create trigger reservations_avisos
  after insert or update on public.reservations
  for each row execute function public.avisar_reserva();

-- ------------------------------------------------------------
-- 4. Clase suspendida y cambio de profesora
--
-- Los dos cuelgan de `class_occurrences` (0018), y los dos le avisan a
-- quien ya tenía reservado ese día: a quien no reservó no le cambió nada.
-- ------------------------------------------------------------

create or replace function public.avisar_instancia()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_clase text;
  v_prof  text;
begin
  v_clase := public.texto_de_la_clase(new.class_id, new.date);

  -- ---- El estudio no la dicta ese día ----
  if new.status = 'suspendida'
     and (tg_op = 'INSERT' or old.status is distinct from 'suspendida') then

    insert into public.notifications (type, title, body, student_id, audience, dedupe_key)
    select
      'clase_suspendida',
      'Se suspendió una clase tuya',
      'No se dicta ' || v_clase
        -- El punto va adentro del coalesce: afuera, cuando hay motivo la
        -- frase quedaba "…: Feriado No se te descuenta la clase".
        || coalesce(': ' || nullif(btrim(new.reason), '') || '.', '.')
        || ' No se te descuenta la clase.',
      r.student_id,
      'alumno',
      'clase-susp-' || r.student_id || '-' || new.class_id || '-' || new.date
    from public.reservations r
    where r.class_id = new.class_id
      and r.date = new.date
      and r.status in ('confirmada', 'lista de espera')
    on conflict (dedupe_key) do nothing;
  end if;

  -- ---- Ese día la da otra ----
  --
  -- Solo si cambió de verdad: el trigger corre también cuando se toca el
  -- cupo o el horario, y avisar "la da Ivana" cuando ya la daba Ivana es
  -- el tipo de aviso que hace que dejen de leerlos.
  if new.teacher_id is not null
     and (tg_op = 'INSERT' or old.teacher_id is distinct from new.teacher_id)
     and new.status <> 'suspendida' then

    select t.name into v_prof from public.teachers t where t.id = new.teacher_id;

    insert into public.notifications (type, title, body, student_id, audience, dedupe_key)
    select
      'clase_cambio_profesora',
      'Cambió la profesora de tu clase',
      v_clase || ' la da ' || coalesce(v_prof, 'otra profesora') || '.',
      r.student_id,
      'alumno',
      -- Con la profesora adentro: si vuelve a cambiar, es otro aviso.
      'clase-prof-' || r.student_id || '-' || new.class_id || '-' || new.date
        || '-' || new.teacher_id
    from public.reservations r
    where r.class_id = new.class_id
      and r.date = new.date
      and r.status = 'confirmada'
    on conflict (dedupe_key) do nothing;
  end if;

  return null;
end;
$$;

drop trigger if exists class_occurrences_avisos on public.class_occurrences;
create trigger class_occurrences_avisos
  after insert or update on public.class_occurrences
  for each row execute function public.avisar_instancia();

-- ------------------------------------------------------------
-- 5. El recordatorio de la clase
--
-- Este NO es un trigger: no lo dispara nada que alguien escriba, lo
-- dispara que llegue el día. Lo llama el proceso diario.
--
-- Con cuántas horas de anticipación es un número, así que se configura.
-- En 0, se avisa de las clases de hoy sin mirar la hora — que es lo que
-- un proceso que corre una vez por día puede prometer de verdad.
-- ------------------------------------------------------------

insert into public.studio_settings
  (key, value, kind, options, label, help, group_key, sort_order, is_public, rige)
values
  ('class_reminder_hours',
   '0',
   'number',
   '{}',
   'Recordatorio de clase (horas antes)',
   'Cuántas horas antes se le recuerda la clase al cliente. En 0 se le avisa a la mañana de todas las clases que tiene ese día. Ojo: el proceso corre una vez por día, así que un número distinto de 0 solo alcanza a las clases que caen dentro de esa ventana.',
   'avisos',
   25,
   false,
   true)
on conflict (key) do nothing;

create or replace function public.recordar_clases_de_hoy()
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_hoy   date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_horas int  := coalesce(nullif(public.param('class_reminder_hours', '0'), '')::int, 0);
  v_n     int  := 0;
begin
  insert into public.notifications (type, title, body, student_id, audience, dedupe_key)
  select
    'clase_recordatorio',
    'Te esperamos hoy',
    'Tenés ' || public.texto_de_la_clase(r.class_id, r.date) || '.',
    r.student_id,
    'alumno',
    'clase-hoy-' || r.id
  from public.reservations r
  join public.class_sessions cs on cs.id = r.class_id
  left join public.class_occurrences o on o.class_id = r.class_id and o.date = r.date
  where r.date = v_hoy
    and r.status = 'confirmada'
    -- Una clase suspendida no se recuerda: ya se avisó que no se dicta.
    and coalesce(o.status, 'normal') <> 'suspendida'
    and (
      v_horas <= 0
      or (v_hoy + coalesce(o.start_time, cs.start_time))
           at time zone 'America/Argentina/Buenos_Aires'
         <= now() + make_interval(hours => v_horas)
    )
  on conflict (dedupe_key) do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.recordar_clases_de_hoy() from public, anon;
grant execute on function public.recordar_clases_de_hoy() to authenticated, service_role;

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
-- 1. Anotar a un cliente desde la agenda le deja el aviso en el portal,
--    y anotarse ella misma desde el portal NO:
--
--      select type, title, body, student_id from public.notifications
--      where audience = 'alumno' order by created_at desc limit 5;
--
-- 2. Suspender una fecha con reservas avisa a cada una, una sola vez
--    aunque se suspenda de nuevo.
--
-- 3. Cambiar la profesora de una fecha avisa; volver a guardar sin
--    cambiarla NO vuelve a avisar.
--
-- 4. Cancelar una reserva de una clase con lista de espera le avisa a
--    TODAS las que esperan.
--
-- 5. El recordatorio:
--
--      select public.recordar_clases_de_hoy();
--
--    Correrlo dos veces devuelve 0 la segunda: el dedupe es por reserva.
--
-- ============================================================
-- PARA VOLVER ATRÁS
--
--   begin;
--   drop trigger if exists reservations_avisos on public.reservations;
--   drop trigger if exists class_occurrences_avisos on public.class_occurrences;
--   drop function if exists public.avisar_reserva();
--   drop function if exists public.avisar_instancia();
--   drop function if exists public.recordar_clases_de_hoy();
--   drop function if exists public.texto_de_la_clase(uuid, date);
--   delete from public.studio_settings where key = 'class_reminder_hours';
--   delete from public.notifications where type in (
--     'reserva_confirmada','clase_recordatorio','clase_suspendida',
--     'clase_cambio_profesora','lugar_liberado');
--   alter table public.notifications drop constraint if exists notifications_type_check;
--   alter table public.notifications add constraint notifications_type_check check (type in (
--     'pago_acreditado','nuevo_alumno','membresia_por_vencer','membresia_vencida',
--     'deuda_vencida','membresia_renovada','caja_sin_cerrar','caja_diferencia',
--     'saldo_sin_imputar','renovacion_omitida','turno_liberado'));
--   commit;
-- ============================================================
