-- ============================================================
-- 0073 — Cinco funciones que contestaban sin sesión, y dos reportes que
--        le contestaban a cualquiera
--
-- Salió de la misma revisión de seguridad del 18/09 que encontró lo de
-- `cancel_kind`. Es el segundo barrido de la familia que empezó la 0057:
-- funciones `security definer` que quedaron sin candado.
--
-- LAS QUE CONTESTAN SIN SESIÓN
--
-- Una `security definer` corre con los permisos del dueño. Si además
-- nadie le revocó el EXECUTE, la puede llamar cualquiera con la llave
-- pública — que viaja en el bundle del navegador y es pública por
-- diseño. Verificado contra producción: `class_occupancy` devolvía filas
-- sin sesión, mientras `students`, `reservations` y `memberships` están
-- cerradas como corresponde.
--
--   · `consumo_recalcular(uuid)` es la peor de las cinco porque
--     **ESCRIBE**: hace un update en `memberships`. Hoy el daño está
--     acotado y por accidente, no por diseño: recalcula el valor
--     derivado correcto, así que es idempotente. Pero es una escritura
--     en la tabla de las membresías disponible desde internet.
--   · `membresia_para(uuid, date)` confirma que un uuid es clienta del
--     estudio y devuelve el uuid de la membresía que le paga las clases.
--   · `consumo_contadas(uuid)` devuelve el consumo de cualquier período.
--   · `consumo_rige()` y `perm_diff()` no exponen datos de personas,
--     pero no las llama nadie desde el navegador y no tienen por qué
--     estar abiertas.
--
-- Ninguna de las cinco se usa dentro de una política —se verificó una
-- por una— y las únicas que las llaman son otras funciones `definer`,
-- que corren con los permisos del dueño. Por eso se les puede revocar el
-- EXECUTE a todos sin romper nada: un trigger no chequea EXECUTE sobre
-- su propia función.
--
-- LOS DOS REPORTES
--
-- `reporte_ocupacion` y `sesiones_dictadas` sí tenían `revoke` de anon,
-- pero no chequeaban permiso adentro: le contestaban a **cualquier**
-- cuenta logueada, incluida una clienta del portal. Le daban el reporte
-- de ocupación completo del estudio para cualquier rango: sesiones
-- dictadas, lugares, reservas, asistencias, ausencias y porcentajes. No
-- hay nombres de personas, pero es el negocio del estudio.
--
-- Ahora exigen `reportes.ver`, que está en un grupo ACTIVO —o sea que
-- rige de verdad— y cuyo legado es sólo `admin`.
--
-- El cuerpo de las dos es el de la 0051 sin una coma de diferencia: se
-- generó envolviendo el texto de esa migración, no transcribiéndolo.
--
-- LA VISTA
--
-- `class_occupancy` (0005) es una vista sin `security_invoker` a
-- propósito, para que el cupo no mienta, y eso se mantiene. Lo que no
-- corresponde es que la lea alguien sin sesión: expone qué clases se
-- llenan y cuáles no, día por día. Se verificó que la web pública NO la
-- usa —la landing lee sólo las vistas `public_*`— y que los dos caminos
-- que la consultan son autenticados.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- ── 1. Las cinco que contestaban sin sesión ─────────────────────────
revoke all on function public.consumo_recalcular(uuid) from public, anon, authenticated;
revoke all on function public.membresia_para(uuid, date) from public, anon, authenticated;
revoke all on function public.consumo_contadas(uuid) from public, anon, authenticated;
revoke all on function public.consumo_rige() from public, anon, authenticated;
revoke all on function public.perm_diff() from public, anon, authenticated;

-- ── 2. La vista de ocupación, cerrada a quien no tiene sesión ───────
revoke all on public.class_occupancy from anon;
grant select on public.class_occupancy to authenticated;

-- ── 3. Los dos reportes, con su permiso adentro ─────────────────────
-- Le contestaba a cualquier cuenta logueada, clienta incluida.
create or replace function public.sesiones_dictadas(p_desde date, p_hasta date)
returns table (
  class_id   uuid,
  fecha      date,
  titulo     text,
  hora       time,
  cupo       int,
  teacher_id uuid,
  profesora  text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.can('reportes.ver') then
    raise exception 'No tenés permiso para ver los reportes del estudio';
  end if;

  return query
  with dias as (
      select d::date as fecha
      from generate_series(p_desde, p_hasta, interval '1 day') d
    )
    select
      cs.id,
      d.fecha,
      cs.title,
      coalesce(o.start_time, cs.start_time),
      coalesce(o.capacity, cs.capacity),
      coalesce(o.teacher_id, cs.teacher_id),
      coalesce(t.name, '—')
    from public.class_sessions cs
    join dias d on (
      case
        -- La grilla semanal: day_of_week arranca en lunes = 0 desde la
        -- 0001, y isodow de Postgres arranca en lunes = 1.
        when cs.kind = 'especial' then cs.date = d.fecha
        else cs.day_of_week = (extract(isodow from d.fecha)::int - 1)
      end
    )
    left join public.class_occurrences o
      on o.class_id = cs.id and o.date = d.fecha
    left join public.teachers t
      on t.id = coalesce(o.teacher_id, cs.teacher_id)
    where cs.active
      -- El cuidado número uno: el día que el estudio no dictó no es un día
      -- con la clase vacía.
      and coalesce(o.status, 'normal') <> 'suspendida';
end;
$$;

revoke all on function public.sesiones_dictadas(date, date) from public, anon;
grant execute on function public.sesiones_dictadas(date, date) to authenticated;

-- Idem: el reporte completo del estudio con cualquier sesión.
create or replace function public.reporte_ocupacion(
  p_desde date,
  p_hasta date,
  p_corte text default 'clase'
)
returns table (
  etiqueta    text,
  orden       text,
  sesiones    bigint,
  lugares     bigint,
  reservas    bigint,
  asistencias bigint,
  ausencias   bigint,
  ocupacion   numeric
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.can('reportes.ver') then
    raise exception 'No tenés permiso para ver los reportes del estudio';
  end if;

  return query
  with s as (
      select * from public.sesiones_dictadas(p_desde, p_hasta)
    ),
    r as (
      select class_id, date, status
      from public.reservations
      where date between p_desde and p_hasta
    ),
    base as (
      select
        -- Los nombres van escritos y no con `to_char(..., 'TMDay')`: el
        -- `TM` usa el locale de la BASE, que acá es inglés, así que salía
        -- "Monday" y " September 2026" con el relleno de Postgres adentro.
        -- El estudio es de Tucumán y el rótulo lo lee una persona.
        case p_corte
          when 'mes' then
            (array['enero','febrero','marzo','abril','mayo','junio','julio',
                   'agosto','septiembre','octubre','noviembre','diciembre']
            )[extract(month from s.fecha)::int] || ' ' || to_char(s.fecha, 'YYYY')
          when 'dia' then
            (array['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']
            )[extract(isodow from s.fecha)::int]
          when 'franja'    then public.franja_de(s.hora)
          when 'profesora' then s.profesora
          -- Con el día adelante, y no es cosmético: las 64 clases de la
          -- grilla se llaman todas "Pilates Reformer", así que agrupar por
          -- título y hora juntaba el lunes a las 8 con el martes a las 8 y
          -- con todos los demás. El reporte decía "22 veces" de una clase
          -- que en el mes se dictó cuatro. Una clase de la grilla es un
          -- día Y una hora: sin el día no hay clase que mirar.
          else (array['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']
                )[extract(isodow from s.fecha)::int]
               || ' ' || to_char(s.hora, 'HH24:MI') || ' · ' || s.titulo
        end as etiqueta,
        -- Para que el mes ordene por fecha y no alfabéticamente, y el día
        -- por su lugar en la semana y no por la letra inicial. Sin esto
        -- "Abril" sale antes que "Enero" y el reporte se lee mal.
        case p_corte
          when 'mes'       then to_char(s.fecha, 'YYYY-MM')
          when 'dia'       then to_char(s.fecha, 'ID')
          when 'franja'    then to_char(s.hora, 'HH24:MI')
          when 'profesora' then s.profesora
          else to_char(extract(isodow from s.fecha), 'FM0')
               || to_char(s.hora, 'HH24:MI') || s.titulo
        end as orden,
        s.cupo,
        (select count(*) from r where r.class_id = s.class_id and r.date = s.fecha
           and r.status <> 'cancelada' and r.status <> 'lista de espera')      as reservas,
        (select count(*) from r where r.class_id = s.class_id and r.date = s.fecha
           and r.status = 'asistió')                                           as asistencias,
        (select count(*) from r where r.class_id = s.class_id and r.date = s.fecha
           and r.status = 'ausente')                                           as ausencias
      from s
    )
    select
      b.etiqueta,
      min(b.orden)                 as orden,
      count(*)::bigint             as sesiones,
      sum(b.cupo)::bigint          as lugares,
      sum(b.reservas)::bigint      as reservas,
      sum(b.asistencias)::bigint   as asistencias,
      sum(b.ausencias)::bigint     as ausencias,
      -- El divisor correcto: los lugares de TODAS las veces que se dictó.
      case when sum(b.cupo) > 0
        then round(sum(b.reservas)::numeric * 100 / sum(b.cupo), 1)
        else 0 end                 as ocupacion
    from base b
    group by b.etiqueta
    order by min(b.orden);
end;
$$;

revoke all on function public.reporte_ocupacion(date, date, text) from public, anon;
grant execute on function public.reporte_ocupacion(date, date, text) to authenticated;

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
-- 1. SIN SESIÓN, con la publishable key. Las seis tienen que cerrarse:
--
--    curl -s -X POST "$URL/rest/v1/rpc/consumo_rige" -H "apikey: $PUB" -d '{}'
--    curl -s "$URL/rest/v1/class_occupancy?select=*&limit=1" -H "apikey: $PUB"
--    -- Antes: `true` y filas. Ahora: permiso denegado.
--
-- 2. CON SESIÓN DE CLIENTA, el reporte tiene que rechazar:
--    POST /rest/v1/rpc/reporte_ocupacion {"p_desde":"2026-09-01","p_hasta":"2026-09-30"}
--    -- tiene que decir: No tenés permiso para ver los reportes del estudio
--
-- 3. CON SESIÓN DE ADMIN, lo que no puede romperse:
--
--    · Reportes → las cinco de Ocupación tienen que dar los MISMOS
--      números que antes de esta migración. Es el control de que envolver
--      el cuerpo no lo cambió.
--    · Reservar una clase desde el portal y cancelarla. El descuento de
--      clases pasa por `consumo_rige`, `membresia_para`,
--      `consumo_contadas` y `consumo_recalcular`, las cuatro revocadas:
--      si algo se rompió, se rompe acá. No debería, porque quien las
--      llama son funciones `definer`.
--    · La Agenda y el portal tienen que seguir mostrando el cupo
--      ("8 lugares libres", "2/8"): sale de `class_occupancy`, que sigue
--      abierta para `authenticated`.
--
-- PARA VOLVER ATRÁS
--
--   grant execute on function public.consumo_recalcular(uuid) to authenticated;
--   grant execute on function public.membresia_para(uuid, date) to authenticated;
--   grant execute on function public.consumo_contadas(uuid) to authenticated;
--   grant execute on function public.consumo_rige() to authenticated;
--   grant execute on function public.perm_diff() to authenticated;
--   grant select on public.class_occupancy to anon;
--   -- y volver a correr las dos funciones tal como están en la 0051.
--
--   Ojo: eso reabre las seis puertas.
-- ============================================================
