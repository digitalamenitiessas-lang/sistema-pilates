-- ============================================================
-- 0051 — La ocupación, bien contada
--
-- El estudio la llamó "la métrica fundamental" y dijo para qué la quiere:
-- *"definir qué horarios potenciar, reducir o promocionar"*. Y pidió
-- poder mirarla por **mes, día, franja horaria, clase y profesora**.
--
-- EL REPORTE QUE HABÍA DABA MAL
--
-- `reporteOcupacion` (lib/reportes-api.ts) divide las reservas de TODO el
-- rango por el cupo de UNA sesión:
--
--     ocupacion = reservas_del_rango / class_sessions.capacity
--
-- Una clase de 8 lugares que se dictó cuatro veces en el mes y se llenó
-- siempre da 32/8 = **400%**. Solo da bien si el rango es de una semana,
-- que es justo lo que un reporte por rango de fechas no es. Nadie lo vio
-- porque el sistema todavía no tiene un mes de historia.
--
-- El divisor correcto es **cupo × veces que se dictó**. Y para saber
-- cuántas veces se dictó hay que generar las fechas: la grilla es
-- semanal, así que una clase de los martes no tiene filas propias por
-- fecha — existe el martes que viene porque el calendario dice que hay
-- martes.
--
-- LOS TRES CUIDADOS QUE DECIDEN SI EL NÚMERO SIRVE
--
-- 1. **Una fecha suspendida no es una clase vacía.** Si el estudio no
--    dictó el lunes feriado, contarlo como 0% de ocupación hunde el
--    promedio del horario y lleva a cerrar un turno que andaba bien. Se
--    excluyen.
--
-- 2. **El cupo puede cambiar por fecha** (`class_occurrences.capacity`,
--    0018). Se usa el de esa fecha, no el de la clase.
--
-- 3. **La profesora es la de ESE día.** Si hubo reemplazo, la clase la
--    dio otra, y una ocupación "por profesora" que ignore eso le imputa
--    a la titular clases que no dio. Manda `class_occurrences.teacher_id`.
--
-- LA FRANJA HORARIA SE CONFIGURA
--
-- Es un texto y un número, así que va a `studio_settings` y no al
-- código: "mañana" no termina a la misma hora en todos los estudios, y
-- el día que quieran cuatro franjas en vez de tres no puede ser un
-- deploy. Formato: `Etiqueta|hasta, Etiqueta|hasta, …, Última` — la
-- última no lleva hora porque es "de ahí en adelante".
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Las franjas
-- ------------------------------------------------------------

insert into public.studio_settings
  (key, value, kind, options, label, help, group_key, sort_order, is_public, rige)
values
  ('franjas_horarias',
   'Mañana|13:00, Tarde|18:00, Noche',
   'text',
   '{}',
   'Franjas horarias',
   'Cómo se agrupan los horarios en el reporte de ocupación. Se escribe "Nombre|hasta qué hora", separado por comas, y la última franja va sin hora porque es de ahí en adelante. Podés poner las que quieras.',
   'reservas',
   55,
   false,
   true)
on conflict (key) do nothing;

-- ------------------------------------------------------------
-- 2. En qué franja cae una hora
--
-- Se recorre la configuración en orden y se devuelve la primera cuyo
-- "hasta" todavía no pasó. Si el texto está mal escrito, la hora cae en
-- la última franja en vez de romper el reporte: un reporte que no abre
-- es peor que uno con una fila mal agrupada, y el error se ve.
-- ------------------------------------------------------------

create or replace function public.franja_de(p_hora time)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_txt   text := public.param('franjas_horarias', 'Mañana|13:00, Tarde|18:00, Noche');
  v_parte text;
  v_nom   text;
  v_hasta text;
begin
  foreach v_parte in array string_to_array(v_txt, ',') loop
    v_parte := btrim(v_parte);
    if v_parte = '' then continue; end if;

    v_nom   := btrim(split_part(v_parte, '|', 1));
    v_hasta := btrim(split_part(v_parte, '|', 2));

    -- Sin hora = es la última, la de "en adelante".
    if v_hasta = '' then return v_nom; end if;

    begin
      if p_hora < v_hasta::time then return v_nom; end if;
    exception when others then
      -- Hora mal escrita en la configuración: se saltea esa franja.
      continue;
    end;
  end loop;

  return 'Sin franja';
end;
$$;

revoke all on function public.franja_de(time) from public, anon;
grant execute on function public.franja_de(time) to authenticated;

-- ------------------------------------------------------------
-- 3. Las sesiones que de verdad se dictaron
--
-- Una fila por (clase, fecha) que ocurrió en el rango. Es la pieza que
-- faltaba: sin esto no hay forma de saber cuántas veces se dictó cada
-- clase, y sin eso el divisor de la ocupación es inventado.
-- ------------------------------------------------------------

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
language sql stable security definer set search_path = ''
as $$
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
    and coalesce(o.status, 'normal') <> 'suspendida'
$$;

revoke all on function public.sesiones_dictadas(date, date) from public, anon;
grant execute on function public.sesiones_dictadas(date, date) to authenticated;

-- ------------------------------------------------------------
-- 4. La ocupación, por el corte que se pida
--
-- Los cinco cortes del pedido salen de la misma consulta: lo único que
-- cambia es por qué se agrupa. Escribirlos como cinco funciones sería
-- cinco lugares donde arreglar el divisor la próxima vez.
-- ------------------------------------------------------------

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
language sql stable security definer set search_path = ''
as $$
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
  order by min(b.orden)
$$;

revoke all on function public.reporte_ocupacion(date, date, text) from public, anon;
grant execute on function public.reporte_ocupacion(date, date, text) to authenticated;

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
-- 1. Que el divisor sea el correcto. Con un rango de un mes, la
--    ocupación de cualquier fila tiene que dar entre 0 y 100:
--
--      select * from public.reporte_ocupacion('2026-09-01','2026-09-30','clase');
--
--    El reporte viejo, con los mismos datos, daba cientos por ciento.
--
-- 2. Que las suspendidas no cuenten. Suspender una fecha y volver a
--    correrlo: `sesiones` baja en uno y la ocupación SUBE, porque se dejó
--    de dividir por un cupo que nunca se ofreció.
--
-- 3. Los cinco cortes, sobre el mismo rango:
--
--      select 'mes' c, * from public.reporte_ocupacion('2026-01-01','2026-12-31','mes')
--      union all select 'dia', * from public.reporte_ocupacion('2026-01-01','2026-12-31','dia')
--      union all select 'franja', * from public.reporte_ocupacion('2026-01-01','2026-12-31','franja');
--
-- 4. Que los rótulos estén en castellano y ordenados por fecha, no por
--    letra. `to_char(..., 'TMDay')` devolvía "Monday": el TM usa el
--    locale de la base, que no es el del estudio.
--
--      select etiqueta from public.reporte_ocupacion('2026-08-01','2026-10-31','mes');
--      → agosto 2026 · septiembre 2026 · octubre 2026
--
-- 5. Que el corte por clase NO junte días distintos. Las 64 clases se
--    llaman igual, así que la etiqueta lleva el día adelante:
--
--      select etiqueta, sesiones from public.reporte_ocupacion(
--        '2026-09-01','2026-09-30','clase') order by etiqueta;
--
--    Un martes de septiembre se dictó 5 veces, no 22.
--
-- 6. Que la franja salga de la configuración:
--
--      select public.franja_de('09:00'), public.franja_de('15:00'), public.franja_de('20:00');
--      → Mañana, Tarde, Noche
--
--    Y cambiando `franjas_horarias` cambian sin tocar código.
--
-- ============================================================
-- PARA VOLVER ATRÁS
--
--   begin;
--   drop function if exists public.reporte_ocupacion(date, date, text);
--   drop function if exists public.sesiones_dictadas(date, date);
--   drop function if exists public.franja_de(time);
--   delete from public.studio_settings where key = 'franjas_horarias';
--   commit;
-- ============================================================
