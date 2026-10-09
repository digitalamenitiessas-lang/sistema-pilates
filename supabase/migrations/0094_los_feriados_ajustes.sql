-- ============================================================
-- 0094 — Los feriados: lo que encontró la revisión de la 0093
--
-- La 0093 se corrió el 08/10 antes de que terminara la revisión
-- adversarial. No rompió nada de lo que había, pero la revisión encontró
-- casos en que un feriado hacía algo distinto de lo que dice la pantalla.
-- Esta migración reemplaza las funciones de la 0093 (con su guardia de
-- huella) y una de la 0046:
--
-- 1. EL RECUPERO EN UN DÍA CERRADO SE PERDÍA PARA SIEMPRE. Si alguien
--    tenía agendado ese día el recupero de una clase perdida, el feriado
--    lo cancelaba, y dos cosas lo seguían contando como "ya repuesta": la
--    función `recupero_elegible` y el índice único de la 0046 (un solo
--    recupero por clase perdida, para siempre). La clase que había pagado
--    no se podía recuperar nunca más. Ahora un recupero cancelado por una
--    suspensión (cancel_kind nulo: consumir_clase lo sella así en una
--    fecha suspendida) no cuenta, en las dos. Un recupero cancelado por la
--    persona sigue contando, como siempre.
--
-- 2. VOLVER A CARGAR UNA FECHA QUE YA ERA FERIADO la volvía a cerrar
--    entera: una clase que el estudio había reabierto a mano ("Volver a
--    dictarla") se cerraba de nuevo y se cancelaban, sin aviso, las
--    reservas que se habían tomado después. Ahora una fecha que ya es
--    feriado sólo cambia de nombre. Las clases nuevas o movidas ya las
--    cubre el trigger de `class_sessions`.
--
-- 3. EL AVISO QUE NO SALÍA. El aviso de suspensión (avisar_instancia) no
--    se repite para la misma persona, clase y fecha. Si un feriado se
--    cargaba, se quitaba, la persona reservaba de nuevo y el feriado se
--    volvía a cargar, su reserva se cancelaba en silencio. Ahora, a quien
--    ya había recibido ese aviso, el feriado le deja uno propio.
--
-- 4. QUITAR UN FERIADO NO LE AVISABA A NADIE. La profesora seguía
--    creyendo que la clase no se daba y las personas cuyas reservas se
--    habían cancelado no se enteraban de que podían volver a reservar.
--    Ahora les queda un aviso a las dos. (Los tipos son los que ya
--    existen —'clase_recordatorio' a quien la da, 'lugar_liberado' a
--    quien tenía reserva—: así no se toca la lista de tipos de la 0080.)
--
-- 5. LA PROFESORA RECIBÍA UN AVISO POR CLASE: unas vacaciones de 62 días
--    eran cientos y tapaban todo lo demás en la campana, que muestra las
--    últimas 30. Ahora recibe uno solo por carga ("El estudio cierra del
--    20/07 al 31/07: no se dictan tus 34 clases"). Una clase nueva o
--    movida que cae en un feriado tampoco le avisa clase por clase.
--
-- 6. UNA CLASE ESPECIAL que el estudio crea a propósito un día cerrado
--    (un taller en vacaciones) nacía suspendida. El trigger ya no toca
--    las especiales: si el estudio la crea, es porque la quiere dar. Las
--    que ya existían cuando se carga el feriado se cierran igual.
--
-- 7. HOY, LA CLASE QUE YA TIENE ASISTENCIA TOMADA se suspendía igual si
--    todavía no era la hora (la lista se abre antes): se le devolvía la
--    clase a quien fue y no se le pagaba a la profesora. Ahora una clase
--    con alguna marca de asistencia cuenta como empezada.
--
-- 8. UNA RESERVA HECHA MIENTRAS SE CARGABA el feriado (un instante; un
--    segundo en un rango largo) podía quedar viva en un día cerrado.
--    cargar_feriados toma un lock de las reservas mientras trabaja: quien
--    reserva en ese momento espera y después recibe "Esa clase está
--    suspendida ese día".
--
-- 9. quitar_feriado reabría filas de OTRA fecha si alguien con permiso de
--    agenda les escribía a mano el feriado_id. Ahora mira sólo la fecha
--    del feriado.
--
-- Lo que la revisión encontró y NO se toca acá, a propósito:
--   · El tope de devoluciones (0076) cuenta una cancelación a tiempo de
--     una fecha que después se suspendió. Hoy el tope está apagado (06/10).
--     Arreglarlo es reescribir consumir_clase y su espejo en la pantalla:
--     queda anotado para si el estudio lo vuelve a prender.
--   · Una suspensión en el mismo día devuelve también una clase perdida
--     que ya se había recuperado. Pasa con cualquier suspensión del día,
--     no sólo con feriados, y es raro.
--
-- Ejecutar completo en el SQL Editor.
-- ============================================================

create temp table if not exists resumen_0094 (orden int, que text, como_quedo text);
truncate pg_temp.resumen_0094;

begin;

set local lock_timeout = '5s';

-- ------------------------------------------------------------
-- 0. Guardias: las que se reemplazan tienen que ser las de la 0093 (o
--    la 0046) o ya las de la 0094 si esto se corre dos veces; las que se
--    usan, las del repo.
-- ------------------------------------------------------------

-- `despues` es la huella de la 0094 para las que se reemplazan (correrla
-- dos veces) y nula para las que se usan tal cual.
create temp table huellas_0094 (firma text primary key, antes text, despues text)
  on commit drop;

insert into huellas_0094 values
  ('public.cargar_feriados(date, date, text)',     '77153251e45464a6c58287c0ee16aa6a', 'ffff0b847b8dfdd2ca96f2d7c0d35301'),
  ('public.quitar_feriado(date)',                  'd05a2d89dd4dd26419b0cdc4f721ba08', '835948e6eed05bb351a3030cd2b691df'),
  ('public.feriado_cerrar_clase(uuid, uuid)',      '6fd7d53bc40cd254c16d38f51bc7bcb2', '19635a3de9f2fdd7b15e9d372990f201'),
  ('public.feriado_abrir_clase(uuid, uuid, date)', 'dde22a62dcb32d304f172de66fe6fc4d', 'cb05b7c8eecb0b04913022e1686a4b3f'),
  ('public.feriados_de_la_clase()',                '60e3ac538f87a395a5187f744c73250c', '77a8efda4aee72a4a110f76d8f0b818b'),
  ('public.recupero_elegible(uuid)',               'ad90c2ce39aed3f78bd94a1918838277', 'd302d947f2297480ecd8a362e51460bc'),
  -- Las que no se tocan pero se usan tal cual son:
  ('public.clases_del_dia(date)',                  'bba2e5a7316999fd2df50b3b41b6a876', null),
  ('public.texto_de_la_clase(uuid, date)',         '619a60a8d852218f8ee42a67e57ca0c0', null),
  ('public.avisar_instancia()',                    'bd70da120ed54ae2eb2f335a26077a25', null),
  ('public.inicio_de_clase(uuid, date)',           'a3bd229615ac883243e0f57dece5c78c', null);

do $$
declare
  h record;
  v_actual text;
begin
  if to_regclass('public.feriados') is null then
    raise exception 'Falta la 0093 (no existe la tabla feriados). Correr primero la 0093. No se tocó nada.';
  end if;

  for h in select * from pg_temp.huellas_0094 loop
    select md5(btrim(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
      into v_actual
      from pg_proc p where p.oid = to_regprocedure(h.firma);
    if v_actual is null then
      raise exception '% no existe. No se tocó nada.', h.firma;
    end if;
    if v_actual <> h.antes and v_actual is distinct from h.despues then
      raise exception
        '% no es la versión del repo (su huella es %): la cambió otra migración o se tocó a mano. No se tocó nada. Mandá el resultado de esta consulta, que sólo lee: select pg_get_functiondef(''%''::regprocedure);',
        h.firma, v_actual, h.firma;
    end if;
  end loop;
end
$$;

-- ------------------------------------------------------------
-- 1. Cuándo una clase "ya empezó" para el feriado
-- ------------------------------------------------------------

-- Empezó si ya es la hora, o si ya alguien le tomó asistencia: la lista
-- se abre antes de la hora (asistencia_abre_minutos, 0085), y una clase
-- con presentes no se suspende.
create or replace function public.feriado_clase_empezo(p_clase uuid, p_fecha date)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.inicio_de_clase(p_clase, p_fecha) <= now()
      or exists (select 1 from public.reservations r
                  where r.class_id = p_clase and r.date = p_fecha
                    and r.status in ('asistió', 'ausente'));
$$;

revoke all on function public.feriado_clase_empezo(uuid, date) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 2. Cerrar una clase (cambios 3 y 7)
-- ------------------------------------------------------------

create or replace function public.feriado_cerrar_clase(p_feriado uuid, p_clase uuid)
returns table (suspendida boolean, canceladas int)
language plpgsql security definer set search_path = ''
as $$
declare
  v_f      public.feriados;
  v_motivo text;
  v_n      int;
  v_susp   boolean := false;
  v_canc   int := 0;
  v_ya     uuid[];
begin
  select * into v_f from public.feriados where id = p_feriado;
  if not found or public.feriado_clase_empezo(p_clase, v_f.fecha) then
    return query select false, 0;
    return;
  end if;
  v_motivo := coalesce(nullif(v_f.nombre, ''), 'Feriado');

  -- 0094: quienes YA recibieron el aviso de suspensión de esta clase y
  -- fecha (un feriado anterior que se quitó): avisar_instancia no se lo
  -- repite. Se miran antes de suspender, para dejarles uno propio.
  select array_agg(r.id) into v_ya
    from public.reservations r
   where r.class_id = p_clase and r.date = v_f.fecha
     and r.status in ('confirmada', 'lista de espera')
     and exists (select 1 from public.notifications n
                  where n.dedupe_key = 'clase-susp-' || r.student_id || '-' || p_clase || '-' || v_f.fecha);

  insert into public.class_occurrences as o (class_id, date, status, reason, feriado_id)
  values (p_clase, v_f.fecha, 'suspendida', v_motivo, v_f.id)
  on conflict (class_id, date) do update
     set status = 'suspendida', reason = excluded.reason, feriado_id = excluded.feriado_id
   where o.status <> 'suspendida'
      or o.feriado_id = excluded.feriado_id;
  get diagnostics v_n = row_count;
  v_susp := v_n > 0;

  -- Sólo si la suspendió el feriado: si ya estaba suspendida a mano, el
  -- aviso de esa suspensión ya dijo que no se dicta.
  if v_susp and v_ya is not null then
    insert into public.notifications (type, title, body, student_id, audience, dedupe_key)
    select 'clase_suspendida', 'Se suspendió una clase tuya',
           'No se dicta ' || public.texto_de_la_clase(p_clase, v_f.fecha) || ': ' || v_motivo
             || '. No se te descuenta la clase.',
           r.student_id, 'alumno', 'feriado-' || v_f.id || '-' || r.id
      from public.reservations r
     where r.id = any(v_ya)
    on conflict (dedupe_key) do nothing;
  end if;

  -- Primero la lista de espera, para que cancelar las confirmadas no le
  -- avise "se liberó un lugar" a nadie (avisar_reserva).
  update public.reservations
     set status = 'cancelada'
   where class_id = p_clase and date = v_f.fecha
     and status in ('lista de espera', 'ofrecida');
  get diagnostics v_n = row_count;
  v_canc := v_n;

  update public.reservations
     set status = 'cancelada'
   where class_id = p_clase and date = v_f.fecha
     and status = 'confirmada';
  get diagnostics v_n = row_count;
  v_canc := v_canc + v_n;

  return query select v_susp, v_canc;
end;
$$;

revoke all on function public.feriado_cerrar_clase(uuid, uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3. Abrir una clase (cambio 4)
-- ------------------------------------------------------------

create or replace function public.feriado_abrir_clase(p_feriado uuid, p_clase uuid, p_fecha date)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_o     public.class_occurrences;
  v_prof  uuid;
  v_texto text;
begin
  select * into v_o from public.class_occurrences
   where class_id = p_clase and date = p_fecha and feriado_id = p_feriado;
  if not found or public.feriado_clase_empezo(p_clase, p_fecha) then
    return false;
  end if;

  -- El texto antes de tocar la fila: lleva el horario del día, si lo hay.
  v_texto := public.texto_de_la_clase(p_clase, p_fecha);
  select coalesce(v_o.teacher_id, cs.teacher_id) into v_prof
    from public.class_sessions cs where cs.id = p_clase;

  if v_o.teacher_id is null and v_o.start_time is null and v_o.capacity is null then
    delete from public.class_occurrences where id = v_o.id;
  else
    update public.class_occurrences
       set status = 'normal', reason = '', feriado_id = null
     where id = v_o.id;
  end if;

  -- 0094: a quien la da, que recibió "no se dicta".
  if v_prof is not null then
    insert into public.notifications (type, title, body, teacher_id, audience, dedupe_key)
    values ('clase_recordatorio', 'Se vuelve a dictar una clase tuya',
            v_texto || ' se dicta: el estudio sacó el cierre de ese día.',
            v_prof, 'profesor',
            'feriado-vuelve-prof-' || p_feriado || '-' || p_clase)
    on conflict (dedupe_key) do nothing;
  end if;

  -- Y a quien tenía reserva y se le canceló por la suspensión
  -- (cancel_kind nulo): no vuelve sola, pero puede reservar de nuevo.
  insert into public.notifications (type, title, body, student_id, audience, dedupe_key)
  select 'lugar_liberado', 'Se vuelve a dictar una clase',
         v_texto || ' se vuelve a dictar. Si querés ir, reservala de nuevo.',
         r.student_id, 'alumno',
         'feriado-vuelve-' || p_feriado || '-' || p_clase || '-' || r.id
    from public.reservations r
   where r.class_id = p_clase and r.date = p_fecha
     and r.status = 'cancelada' and r.cancel_kind is null
     -- Si ya volvió a reservar, no hace falta.
     and not exists (select 1 from public.reservations x
                      where x.student_id = r.student_id and x.class_id = p_clase and x.date = p_fecha
                        and x.status in ('confirmada', 'lista de espera', 'asistió'))
  on conflict (dedupe_key) do nothing;

  return true;
end;
$$;

revoke all on function public.feriado_abrir_clase(uuid, uuid, date) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4. Cargar (cambios 2, 5 y 8)
-- ------------------------------------------------------------

create or replace function public.cargar_feriados(p_desde date, p_hasta date default null, p_nombre text default '')
returns table (fecha date, clases int, reservas int, ya_estaba boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  v_hoy    date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_hasta  date := coalesce(p_hasta, p_desde);
  v_nombre text := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
  v_motivo text;
  v_dia    date;
  v_id     uuid;
  v_ya     boolean;
  v_clase  uuid;
  v_r      record;
  v_cl     int;
  v_res    int;
  v_tramo  text;
begin
  if not public.can('config.editar') then
    raise exception 'No tenés permiso para cargar feriados: se cargan desde Configuración, con una cuenta de administración.';
  end if;
  if p_desde is null then
    raise exception 'Falta la fecha del feriado.';
  end if;
  if v_hasta < p_desde then
    raise exception 'La fecha "hasta" es anterior a la de inicio.';
  end if;
  if p_desde < v_hoy then
    raise exception 'El % ya pasó: los feriados se cargan de hoy en adelante.', to_char(p_desde, 'DD/MM/YYYY');
  end if;
  if v_hasta - p_desde > 61 then
    raise exception 'Son % días: se cargan hasta 62 de una vez. Para un cierre más largo, cargalo en partes.', v_hasta - p_desde + 1;
  end if;
  if v_hasta > v_hoy + 730 then
    raise exception 'Los feriados se cargan hasta dos años para adelante.';
  end if;
  if length(v_nombre) > 80 then
    raise exception 'El nombre es demasiado largo (hasta 80 letras).';
  end if;
  v_motivo := coalesce(nullif(v_nombre, ''), 'Feriado');

  -- 0094: mientras se cierra el día nadie reserva. Sin esto, una reserva
  -- hecha en el instante entre que se cancelan las del día y el commit
  -- quedaba viva en una clase suspendida. Quien reserva en ese momento
  -- espera y después recibe "Esa clase está suspendida ese día".
  lock table public.reservations in share row exclusive mode;

  v_dia := p_desde;
  while v_dia <= v_hasta loop
    select f.id into v_id from public.feriados f where f.fecha = v_dia;
    v_ya := found;
    v_cl := 0;
    v_res := 0;

    if v_ya then
      -- 0094: una fecha que ya es feriado sólo cambia de nombre. Volver a
      -- cerrarla reabría lo que el estudio reabrió a mano.
      update public.feriados f set nombre = v_nombre where f.id = v_id;
      update public.class_occurrences o
         set reason = v_motivo
       where o.feriado_id = v_id and o.date = v_dia and o.status = 'suspendida';
    else
      insert into public.feriados (fecha, nombre) values (v_dia, v_nombre) returning id into v_id;
      for v_clase in select * from public.clases_del_dia(v_dia) loop
        select * into v_r from public.feriado_cerrar_clase(v_id, v_clase);
        v_cl := v_cl + case when v_r.suspendida then 1 else 0 end;
        v_res := v_res + v_r.canceladas;
      end loop;
    end if;

    fecha := v_dia;
    clases := v_cl;
    reservas := v_res;
    ya_estaba := v_ya;
    return next;

    v_dia := v_dia + 1;
  end loop;

  -- 0094: a quien da las clases, un aviso por carga y no uno por clase.
  -- Los de avisar_instancia de esta misma carga se reconocen por su
  -- created_at (el now() de esta transacción) y su clave.
  v_tramo := case when p_desde = v_hasta then 'el ' || to_char(p_desde, 'DD/MM')
                  else 'del ' || to_char(p_desde, 'DD/MM') || ' al ' || to_char(v_hasta, 'DD/MM') end;

  with borradas as (
    delete from public.notifications n
     where n.type = 'clase_suspendida' and n.audience = 'profesor'
       and n.created_at = now()
       and n.dedupe_key like 'clase-susp-prof-%'
    returning n.teacher_id
  )
  insert into public.notifications (type, title, body, teacher_id, audience, dedupe_key)
  select 'clase_suspendida', 'El estudio cierra',
         'El estudio cierra ' || v_tramo || ' (' || v_motivo || '): '
           || case when count(*) = 1 then 'no se dicta tu clase.'
                   else 'no se dictan tus ' || count(*) || ' clases.' end,
         b.teacher_id, 'profesor',
         'feriado-prof-' || b.teacher_id || '-' || p_desde || '-' || v_hasta || '-' || extract(epoch from now())::bigint
    from borradas b
   where b.teacher_id is not null
   group by b.teacher_id
  on conflict (dedupe_key) do nothing;
end;
$$;

revoke all on function public.cargar_feriados(date, date, text) from public, anon;
grant execute on function public.cargar_feriados(date, date, text) to authenticated;

-- ------------------------------------------------------------
-- 5. Quitar (cambio 9)
-- ------------------------------------------------------------

create or replace function public.quitar_feriado(p_fecha date)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_f   public.feriados;
  v_o   record;
  v_n   int := 0;
begin
  if not public.can('config.editar') then
    raise exception 'No tenés permiso para quitar feriados: se administran desde Configuración, con una cuenta de administración.';
  end if;
  select * into v_f from public.feriados where fecha = p_fecha;
  if not found then
    raise exception 'El % no está cargado como feriado.', to_char(p_fecha, 'DD/MM/YYYY');
  end if;
  if p_fecha < v_hoy then
    raise exception 'Ese feriado ya pasó: queda como registro.';
  end if;

  -- 0094: sólo las de SU fecha, aunque alguien le haya escrito el
  -- feriado_id a otra fila a mano.
  for v_o in select o.class_id from public.class_occurrences o
              where o.feriado_id = v_f.id and o.date = v_f.fecha loop
    if public.feriado_abrir_clase(v_f.id, v_o.class_id, v_f.fecha) then
      v_n := v_n + 1;
    end if;
  end loop;

  delete from public.feriados where id = v_f.id;
  return v_n;
end;
$$;

revoke all on function public.quitar_feriado(date) from public, anon;
grant execute on function public.quitar_feriado(date) to authenticated;

-- ------------------------------------------------------------
-- 6. La clase nueva o movida (cambios 5 y 6)
-- ------------------------------------------------------------

create or replace function public.feriados_de_la_clase()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_hoy  date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_f    record;
  v_dict boolean;
begin
  -- 0094: las especiales no. Si el estudio crea un taller un día
  -- cerrado, es porque lo quiere dar.
  if new.kind = 'especial' then
    return null;
  end if;

  if tg_op = 'UPDATE'
     and old.active = new.active
     and old.day_of_week = new.day_of_week
     and old.kind = new.kind
     and old.date is not distinct from new.date then
    return null;
  end if;

  for v_f in select f.id, f.fecha from public.feriados f where f.fecha >= v_hoy loop
    v_dict := new.active and new.day_of_week = extract(isodow from v_f.fecha)::int - 1;
    if v_dict then
      perform public.feriado_cerrar_clase(v_f.id, new.id);
    else
      perform public.feriado_abrir_clase(v_f.id, new.id, v_f.fecha);
    end if;
  end loop;

  -- 0094: los avisos que esto acaba de generar no van. A quien la da no
  -- se le avisa feriado por feriado de una clase que recién se armó o se
  -- movió (ve los días cerrados en su agenda), y a una clienta no se le
  -- dice "se vuelve a dictar" una clase que en realidad se mudó de día.
  delete from public.notifications n
   where n.created_at = now()
     and (n.dedupe_key like 'clase-susp-prof-%-' || new.id || '-%'
          or n.dedupe_key like 'feriado-vuelve-%' || new.id || '%');

  return null;
end;
$$;

revoke all on function public.feriados_de_la_clase() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 7. El recupero que cayó en un día cerrado no cuenta como usado (cambio 1)
--
-- La de la 0046 con una sola diferencia, marcada: en "que no se la haya
-- repuesto ya" no cuenta un recupero que se canceló por una suspensión
-- (cancel_kind nulo, que queda así aunque después se quite el feriado).
-- Y el índice único, con la misma excepción: si no, la base aceptaría el
-- recupero nuevo en la función y lo rechazaría en el índice con un
-- "duplicate key" que no le dice nada a nadie.
-- ------------------------------------------------------------

do $$
declare
  v_def text := pg_get_indexdef(to_regclass('public.reservations_recupera_idx'));
begin
  if v_def is null then
    raise exception 'Falta el índice reservations_recupera_idx de la 0046. No se tocó nada.';
  end if;
  if v_def not like '%(recovers_reservation_id) WHERE (recovers_reservation_id IS NOT NULL)'
     and v_def not like '%cancel_kind IS NULL%' then
    raise exception 'El índice reservations_recupera_idx no es el de la 0046 (es: %). No se tocó nada.', v_def;
  end if;
end
$$;

drop index if exists public.reservations_recupera_idx;
create unique index reservations_recupera_idx
  on public.reservations (recovers_reservation_id)
  where recovers_reservation_id is not null
    and not (status = 'cancelada' and cancel_kind is null);

create or replace function public.recupero_elegible(p_reserva uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.reservations r
    where r.id = p_reserva
      and r.recovers_reservation_id is null       -- un recupero no se recupera
      and r.membership_id is not null
      and not exists (
        select 1 from public.class_occurrences o
        where o.class_id = r.class_id and o.date = r.date and o.status = 'suspendida'
      )
      and (
        (r.status = 'cancelada' and r.cancel_kind = 'fuera de plazo')
        or (r.status = 'ausente' and coalesce(
              (select s.value = 'true' from public.studio_settings s
               where s.key = 'absence_consumes_class'), true))
      )
      -- y que no se la haya repuesto ya
      and not exists (
        select 1 from public.reservations x
        where x.recovers_reservation_id = r.id
          -- 0094: un recupero cancelado por una suspensión no cuenta
          and not (x.status = 'cancelada' and x.cancel_kind is null)
      )
  )
$$;

-- ------------------------------------------------------------
-- 8. Comprobaciones
-- ------------------------------------------------------------

do $$
begin
  if has_function_privilege('authenticated', 'public.feriado_clase_empezo(uuid, date)', 'execute')
     or has_function_privilege('authenticated', 'public.feriado_cerrar_clase(uuid, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.feriado_abrir_clase(uuid, uuid, date)', 'execute')
     or has_function_privilege('anon', 'public.cargar_feriados(date, date, text)', 'execute')
     or has_function_privilege('anon', 'public.quitar_feriado(date)', 'execute') then
    raise exception 'Alguna función de feriados quedó abierta de más.';
  end if;
  if not has_function_privilege('authenticated', 'public.recupero_elegible(uuid)', 'execute') then
    raise exception 'recupero_elegible perdió su permiso para la pantalla.';
  end if;
  if (select count(*) from public.perm_diff()) <> 0 then
    raise exception 'perm_diff no da cero. No se tocó nada.';
  end if;
end
$$;

insert into pg_temp.resumen_0094 values
  (1, 'feriados cargados', (select count(*)::text from public.feriados)),
  (2, 'funciones', 'cargar_feriados, quitar_feriado y sus piezas, de la 0094'),
  (3, 'recupero_elegible', 'un recupero cancelado por un día cerrado ya no cuenta como usado'),
  (4, 'perm_diff', (select count(*)::text || ' (tiene que ser 0)' from public.perm_diff()));

commit;

select que, como_quedo from resumen_0094 order by orden;

-- ------------------------------------------------------------
-- VUELTA ATRÁS: volver a correr la 0093 (sus funciones) y, para
-- recupero_elegible, su bloque de la 0046. No toca políticas.
-- ------------------------------------------------------------
