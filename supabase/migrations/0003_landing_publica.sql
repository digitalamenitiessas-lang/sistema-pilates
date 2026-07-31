-- ============================================================
-- PilatesStudio — Fase Landing: vistas públicas de solo lectura
-- Ejecutar completo en el SQL Editor del dashboard.
--
-- La landing (sin login) muestra planes y horarios reales.
-- Estas vistas corren con permisos del dueño (bypass de RLS)
-- A PROPÓSITO: exponen únicamente columnas seguras y filas
-- activas. Nada de emails, teléfonos, alumnos ni pagos.
-- ============================================================

create view public.public_plans as
select id, name, price, class_count, duration_days, disciplines,
       description, color, popular, is_trial
from public.plans
where active = true;

create view public.public_schedule as
select cs.id, cs.title, cs.discipline, cs.day_of_week, cs.start_time,
       cs.duration_minutes, cs.room, t.name as teacher_name
from public.class_sessions cs
join public.teachers t on t.id = cs.teacher_id
where cs.active = true;
