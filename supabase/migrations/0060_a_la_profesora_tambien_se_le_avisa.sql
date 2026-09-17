-- ============================================================
-- 0060 — A la profesora también se le avisa
--
-- Hoy su campana no suena nunca, y el camino corto era darle
-- `avisos.ver`. Verificado por qué no sirve: de los avisos de staff que
-- hay cargados, dos son plata —`pago_acreditado` y `deuda_vencida`—, y
-- esa clave es todo o nada. Le abriríamos los cobros del estudio a quien
-- deliberadamente no ve un peso en ninguna pantalla.
--
-- Y lo peor: igual no resolvía el problema. Los avisos de la 0052 que le
-- importan a ella —clase suspendida, cambio de profesora— **no existen
-- para el staff**: `avisar_instancia` inserta una fila por ALUMNA
-- reservada, con `audience = 'alumno'`. Nadie le avisa nunca a la
-- profesora que no tiene que venir.
--
-- O sea que no era un permiso que faltaba: era un aviso que no existía.
--
-- CÓMO SE LE HABLA A UNA PROFESORA
--
-- La tabla sólo sabe dirigirse a una alumna: tiene `student_id` y un
-- `audience` que admite 'staff' o 'alumno'. Se agrega `teacher_id` y la
-- audiencia 'profesor', y la lee con el mismo criterio con el que la
-- alumna lee los suyos: los que están dirigidos a ella.
--
-- Sin clave de permiso, a propósito. Que cada uno vea lo suyo es
-- aislamiento, no configuración — es la misma razón por la que
-- `my_student_ids` nunca fue configurable. Una clave acá permitiría
-- apagarle a la profesora el aviso de que su clase se suspendió, y eso no
-- es una preferencia del estudio: es información de su trabajo.
--
-- La política nueva se SUMA a las dos que ya están (las permisivas se
-- unen con OR), así que ni los avisos de staff ni los de la alumna se
-- tocan.
--
-- QUÉ SE LE AVISA
--
--   Clase suspendida     → a quien la iba a dar. Y NO cuelga de que
--                          alguien haya reservado: que el estudio no
--                          dicte su clase le importa igual con la sala
--                          vacía, porque es la diferencia entre ir y no
--                          ir. El aviso a las alumnas sí cuelga de la
--                          reserva, y así queda.
--   Te asignaron         → a la que entra a cubrir.
--   Te reemplazan        → a la que salió, si es otra.
--
-- La titular sale de `class_sessions`, y quien la iba a dar es la
-- excepción del día si hay una: `coalesce(occurrence.teacher_id,
-- titular)`. Es la misma cuenta que hace la agenda para mostrar quién da
-- cada clase.
--
-- CERO CÓDIGO
--
-- `fetchNotifications` hace `select('*')` sin filtrar por audiencia, y la
-- campana muestra lo que vuelve. `notification_reads` ya se gobierna con
-- `user_id = auth.uid()`, así que marcar leído le funciona igual. Lo único
-- que hacía falta era que hubiera filas dirigidas a ella.
--
-- LO QUE NO HACE
--
-- El push. El teléfono no le va a vibrar: el reparto de push del cron
-- tiene los roles escritos a mano en el código y `avisos.recibir_push` no
-- gobierna nada —está anotado desde la 0012 y sigue igual—. Esto es la
-- campana de adentro del sistema.
--
-- Tampoco le avisa cuando alguien reserva o cancela en su clase. Es una
-- decisión de producto y no la tomo acá: con seis clases por día puede ser
-- útil o puede ser ruido, y el ruido hace que dejen de leerse.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. La tabla aprende a dirigirse a una profesora
-- ------------------------------------------------------------

alter table public.notifications
  add column if not exists teacher_id uuid references public.teachers (id) on delete cascade;

comment on column public.notifications.teacher_id is
  'A qué profesora está dirigido. Con audience = ''profesor'', es lo que la deja leerlo.';

alter table public.notifications drop constraint if exists notifications_audience_check;
alter table public.notifications
  add constraint notifications_audience_check
  check (audience in ('staff', 'alumno', 'profesor'));

create index if not exists notifications_teacher_idx
  on public.notifications (teacher_id) where teacher_id is not null;

-- ------------------------------------------------------------
-- 2. Cada una lee lo suyo
-- ------------------------------------------------------------

drop policy if exists "profesora ve sus avisos" on public.notifications;
create policy "profesora ve sus avisos"
  on public.notifications for select
  using (
    audience = 'profesor'
    and teacher_id in (select public.my_teacher_ids())
  );

-- ------------------------------------------------------------
-- 3. Los avisos
--
-- Mismo cuerpo que la 0052 para las alumnas —no se cambió una palabra— y
-- tres inserts nuevos para la profesora.
-- ------------------------------------------------------------

create or replace function public.avisar_instancia()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_clase   text;
  v_prof    text;
  v_titular uuid;
  v_antes   uuid;
  v_ahora   uuid;
begin
  v_clase := public.texto_de_la_clase(new.class_id, new.date);

  select cs.teacher_id into v_titular
  from public.class_sessions cs where cs.id = new.class_id;

  -- Quién la iba a dar y quién la da: la excepción del día gana sobre la
  -- titular.
  --
  -- El `if` va explícito y no como un CASE adentro de un coalesce. En
  -- INSERT `old` es un registro nulo y leerle un campo devuelve nulo sin
  -- error —probado el 17/09 suspendiendo por INSERT con el trigger de la
  -- 0052, que usa el mismo idioma en la línea de abajo: HTTP 201—, así que
  -- las dos formas funcionan. Se elige la explícita porque acá `v_antes`
  -- alimenta una decisión de a quién avisarle, y en esa posición conviene
  -- que se lea de una que en un INSERT no hay "antes".
  if tg_op = 'UPDATE' then
    v_antes := coalesce(old.teacher_id, v_titular);
  else
    v_antes := v_titular;
  end if;
  v_ahora := coalesce(new.teacher_id, v_titular);

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

    -- Y a quien la iba a dar. Una fila sola, y sin mirar si alguien
    -- reservó: es la diferencia entre ir al estudio y no ir.
    if v_ahora is not null then
      insert into public.notifications (type, title, body, teacher_id, audience, dedupe_key)
      values (
        'clase_suspendida',
        'Se suspendió una clase tuya',
        'No se dicta ' || v_clase
          || coalesce(': ' || nullif(btrim(new.reason), '') || '.', '.'),
        v_ahora,
        'profesor',
        'clase-susp-prof-' || v_ahora || '-' || new.class_id || '-' || new.date
      )
      on conflict (dedupe_key) do nothing;
    end if;
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

    -- A la que entra. El `is distinct from` de arriba no alcanza para
    -- saber que cambió para ELLA: en un INSERT que fija a la titular,
    -- `old` no existe y la que "entra" ya la daba.
    if v_ahora is distinct from v_antes then
      insert into public.notifications (type, title, body, teacher_id, audience, dedupe_key)
      values (
        'clase_cambio_profesora',
        'Te asignaron una clase',
        'Pasás a dar ' || v_clase || '.',
        v_ahora,
        'profesor',
        'clase-prof-alta-' || v_ahora || '-' || new.class_id || '-' || new.date
      )
      on conflict (dedupe_key) do nothing;

      -- Y a la que sale, si había otra.
      if v_antes is not null then
        insert into public.notifications (type, title, body, teacher_id, audience, dedupe_key)
        values (
          'clase_cambio_profesora',
          'Te reemplazan en una clase',
          v_clase || ' la da ' || coalesce(v_prof, 'otra profesora') || '.',
          v_antes,
          'profesor',
          'clase-prof-baja-' || v_antes || '-' || new.class_id || '-' || new.date
            || '-' || new.teacher_id
        )
        on conflict (dedupe_key) do nothing;
      end if;
    end if;
  end if;

  return null;
end;
$$;

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
-- Con una PROFESORA logueada al lado, y suspendiendo desde la agenda del
-- admin (o a mano acá). Ojo: hay que suspender una clase de ELLA.
--
--   -- 1. Suspender. Poné el uuid de una clase suya y una fecha futura.
--   insert into public.class_occurrences (class_id, date, status, reason)
--   values ('<clase de ella>', '<fecha>', 'suspendida', 'Prueba 0060')
--   on conflict (class_id, date) do update
--     set status = 'suspendida', reason = 'Prueba 0060';
--
--   -- 2. Qué se escribió, y para quién
--   select type, audience, title, student_id, teacher_id
--     from public.notifications
--    where dedupe_key like '%' || '<clase de ella>' || '%'
--    order by audience;
--   → una fila 'profesor' con SU teacher_id, más una por alumna reservada
--
--   -- 3. En la campana de la profesora tiene que aparecer, y el contador
--   --    de no leídos subir. Es realtime: no hace falta recargar.
--
--   -- 4. Y que NO se le abrió nada más: sigue sin ver los avisos de staff
--   --    (pago_acreditado, deuda_vencida, nuevo_alumno). Con su sesión:
--   --    select count(*) from notifications where audience = 'staff';
--   →  0
--
--   -- 5. Limpiar la prueba
--   delete from public.notifications where dedupe_key like '%<clase>%';
--   delete from public.class_occurrences where class_id = '<clase>' and date = '<fecha>';
--
-- PARA VOLVER ATRÁS
--
--   drop policy if exists "profesora ve sus avisos" on public.notifications;
--   delete from public.notifications where audience = 'profesor';
--   alter table public.notifications drop constraint if exists notifications_audience_check;
--   alter table public.notifications add constraint notifications_audience_check
--     check (audience in ('staff', 'alumno'));
--   alter table public.notifications drop column if exists teacher_id;
--   -- y volver a correr el bloque 4 de la 0052 para restaurar la función.
-- ============================================================
