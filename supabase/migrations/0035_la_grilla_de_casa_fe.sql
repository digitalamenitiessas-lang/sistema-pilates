-- ============================================================
-- 0035 — La grilla de Casa Fe
--
-- La semana como el estudio la dicta, según lo que pasó el 09/09:
--
--   Lunes a viernes   8:00 a 13:00   Ivana                   6 clases
--                    14:00 a 19:00   Profesora turno tarde   6 clases
--   Sábados           9:00 a 12:00   Leandro                 4 clases
--
-- Todas de 50 minutos, 8 lugares, Pilates Reformer, Sala Reformer. En
-- total 64 clases: 12 por día de lunes a viernes y 4 el sábado.
--
-- Las de embarazadas NO van acá: el estudio dijo que se incorporan
-- después, con días, horarios y membresías propios. Cuando existan van en
-- su propia migración, y hay algo que resolver antes (ver al final).
--
-- POR QUÉ POR MIGRACIÓN Y NO POR PANTALLA: son 64 formularios. Y sobre
-- todo, `class_sessions` no tiene ningún índice único, así que cargarla
-- dos veces —a mano o corriendo esto de nuevo— duplicaría la grilla
-- entera sin que nada avise. Con ids fijos y `on conflict do nothing`,
-- correrla otra vez no hace nada.
--
-- Los ids se derivan del día y la hora: 'ca5afe01-...-<día><hora>...', así
-- que la clase del martes a las 10 tiene siempre el mismo id, en
-- cualquier base donde se corra esto.
--
-- VA DESPUÉS DE LA 0034: `teacher_id` es NOT NULL con clave foránea y
-- apunta a las tres profesoras que esa migración creó.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- Que las tres profesoras existan no es un supuesto: si la 0034 no corrió,
-- los 64 inserts fallarían de a uno con un error de clave foránea que no
-- dice qué pasó. Mejor plantarse acá con el motivo.
do $$
begin
  if (select count(*) from public.teachers where id::text like 'fe000001%') <> 3 then
    raise exception
      'Faltan las profesoras de la 0034. Corré esa migración antes de cargar la grilla.';
  end if;

  if not exists (select 1 from public.disciplines where name = 'Pilates Reformer' and active) then
    raise exception
      'La disciplina Pilates Reformer no está activa. Revisá la 0033 antes de seguir.';
  end if;

  if not exists (select 1 from public.rooms where name = 'Sala Reformer' and active) then
    raise exception
      'La sala Sala Reformer no está activa. Revisá la 0033 antes de seguir.';
  end if;

  -- La duración y el cupo salen de dos parámetros. Si faltan, el subselect
  -- da NULL contra dos columnas NOT NULL y el insert falla — o sea que el
  -- error se ve, no se cuela. Pero falla con un mensaje sobre una columna
  -- nula, que no dice que el problema es que la 0033 no corrió.
  if (select count(*) from public.studio_settings
      where key in ('class_default_minutes', 'class_default_capacity')
        and value ~ '^[0-9]+$') <> 2 then
    raise exception
      'Faltan class_default_minutes y class_default_capacity, o no son números. Corré la 0033 antes de cargar la grilla.';
  end if;
end $$;

-- Un solo insert, y los tres turnos escritos como los mandó el estudio:
-- profesora, desde qué día hasta qué día, y desde qué hora hasta qué hora
-- de INICIO. day_of_week va 0 = lunes (así lo declara el CHECK de la
-- 0001), o sea que lunes a viernes es 0..4 y el sábado es 5.
--
-- La última de la mañana arranca 13:00 y termina 13:50, adentro del turno
-- de Ivana que va hasta las 14:00. La última de la tarde arranca 19:00 y
-- termina 19:50, y el turno tarde va hasta las 20:00.
--
-- La duración, el cupo y el color NO se escriben acá: salen de los
-- parámetros y del catálogo, que es de donde los toma la pantalla al
-- crear una clase. Escritos a mano, recolorear la disciplina o cambiar la
-- duración por defecto dejaría 64 clases desalineadas del resto.
insert into public.class_sessions
  (id, title, discipline, teacher_id, day_of_week, start_time,
   duration_minutes, capacity, room, color, kind, bookable, active)
select
  -- 'ca5afe01' se lee "casafe" y es hexadecimal válido — con 's' no lo
  -- sería y el cast a uuid fallaría en las 64 filas. El resto del id
  -- codifica el día y la hora: la del martes a las 10 tiene siempre el
  -- mismo id, en cualquier base donde se corra esto.
  ('ca5afe01-0000-0000-0000-' || d::text || lpad(h::text, 2, '0') || '000000000')::uuid,
  'Pilates Reformer',
  'Pilates Reformer',
  t.profesora,
  d,
  make_time(h, 0, 0),
  (select value::int from public.studio_settings where key = 'class_default_minutes'),
  (select value::int from public.studio_settings where key = 'class_default_capacity'),
  'Sala Reformer',
  (select color from public.disciplines where name = 'Pilates Reformer'),
  'regular',
  true,
  true
from (values
  -- profesora                                  día        hora de inicio
  ('fe000001-0000-0000-0000-000000000001'::uuid, 0, 4,  8, 13),  -- Ivana, mañana
  ('fe000001-0000-0000-0000-000000000002'::uuid, 0, 4, 14, 19),  -- turno tarde
  ('fe000001-0000-0000-0000-000000000003'::uuid, 5, 5,  9, 12)   -- Leandro, sábados
) as t(profesora, dia_desde, dia_hasta, hora_desde, hora_hasta),
generate_series(t.dia_desde,  t.dia_hasta)  as d,
generate_series(t.hora_desde, t.hora_hasta) as h
on conflict (id) do nothing;

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
--   -- 64 clases, todas de 50 minutos y 8 lugares, en una sola sala
--   select count(*) as clases,
--          count(distinct duration_minutes) as duraciones,
--          count(distinct capacity) as cupos,
--          count(distinct room) as salas,
--          count(distinct discipline) as disciplinas
--   from public.class_sessions where active;
--   → 64 / 1 / 1 / 1 / 1
--
--   -- La semana, como la lee el mostrador
--   select case day_of_week
--            when 0 then 'Lunes' when 1 then 'Martes' when 2 then 'Miércoles'
--            when 3 then 'Jueves' when 4 then 'Viernes' when 5 then 'Sábado' end as dia,
--          t.name as profesora,
--          string_agg(to_char(c.start_time, 'HH24:MI'), ' · ' order by c.start_time) as horarios,
--          count(*) as clases
--   from public.class_sessions c
--   join public.teachers t on t.id = c.teacher_id
--   where c.active
--   group by c.day_of_week, t.name
--   order by c.day_of_week, min(c.start_time);
--   → lunes a viernes: Ivana 8..13 (6) y turno tarde 14..19 (6); sábado: Leandro 9..12 (4)
--
--   -- Que no haya dos clases en la misma sala a la misma hora
--   select day_of_week, start_time, room, count(*)
--   from public.class_sessions where active
--   group by 1, 2, 3 having count(*) > 1;
--   → cero filas
--
-- Y en la pantalla: la Agenda dibuja la semana completa, la web pública
-- muestra la grilla y los números del estudio dejan de estar en cero.
-- ============================================================

-- ============================================================
-- LO QUE ESTO NO RESUELVE, Y CONVIENE SABERLO ANTES DE EMBARAZADAS
--
-- No existe ninguna restricción sobre (día, hora, sala). Con una sola
-- sala de 8 reformers eso deja de ser una prevención y pasa a ser una
-- regla física: dos clases el mismo día a la misma hora son 16 personas
-- para 8 aparatos, las dos se dibujan en la agenda y las dos aceptan 8
-- reservas. Hoy no muerde porque esta grilla no se solapa consigo misma,
-- pero el día que se cargue la grilla de embarazadas encima de esta, el
-- choque es invisible hasta que llegan las alumnas.
--
-- La consulta de arriba lo detecta, pero detectar no es impedir. El freno
-- real es un índice único parcial sobre (day_of_week, start_time, room)
-- para las regulares activas, y va con su propia migración porque hay que
-- decidir qué pasa con las clases especiales, que llevan fecha.
-- ============================================================

-- ============================================================
-- VUELTA ATRÁS (no ejecutar salvo que haga falta)
--
-- Solo si todavía no hay reservas: `reservations.class_id` tiene
-- `on delete cascade`, así que este delete se llevaría las reservas de
-- esas clases sin preguntar. Si el estudio ya operó, la baja es lógica
-- (`active = false`), no un delete.
--
--   begin;
--   delete from public.class_sessions where id::text like 'ca5afe01%';
--   commit;
--
-- Y la baja lógica, que es la que casi siempre corresponde:
--
--   update public.class_sessions set active = false where id::text like 'ca5afe01%';
-- ============================================================
