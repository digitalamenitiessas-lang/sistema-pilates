-- ============================================================
-- 0017 — Clases especiales y los campos que le faltaban a una clase
--
-- Sección 1 del documento de Casa Fé. Pide poder crear, además de las
-- clases regulares, "clases especiales: Pilates para personas mayores,
-- Pilates para embarazadas, talleres, clases temáticas o eventos", y que
-- cada clase configure nombre, descripción, disciplina, fecha y horario,
-- duración, profesora, cupo, nivel o público, precio, requisitos, y si se
-- puede reservar desde la agenda.
--
-- Hoy una clase es solo una plantilla semanal: día de la semana + hora, y
-- se repite para siempre. Un taller del sábado 12 no se puede modelar.
--
-- Lo que cambia:
--   · `kind` distingue la clase regular (se repite cada semana) del
--     evento con fecha propia.
--   · `date` es la fecha del evento. Para las regulares queda en nulo y
--     sigue mandando day_of_week, como hasta ahora.
--   · cinco campos que el documento pide y no existían.
--
-- Todo aditivo: las clases que ya están siguen funcionando igual.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

alter table public.class_sessions
  add column kind text not null default 'regular'
    check (kind in ('regular', 'especial')),
  -- Fecha del evento. Nulo en las regulares, que se repiten por día de
  -- la semana. El día de la semana se guarda igual en las dos, derivado
  -- de la fecha en las especiales, así la grilla las ubica sin cuentas.
  add column date date,
  add column description text not null default '',
  -- Nivel o público al que apunta: "Inicial", "Embarazadas 2do
  -- trimestre", "Mayores de 60". Texto libre a propósito: es lenguaje
  -- del estudio, no una lista que podamos adivinar.
  add column level text not null default '',
  -- Nulo = incluida en la membresía. Con precio = se cobra aparte.
  add column price numeric(12, 2),
  add column requirements text not null default '',
  -- Se muestra en la agenda pero la alumna no la puede reservar sola:
  -- para talleres que pasan por recepción.
  add column bookable boolean not null default true;

-- Una clase especial sin fecha no tiene dónde ubicarse en la agenda.
alter table public.class_sessions
  add constraint class_sessions_fecha_especial
  check (kind = 'regular' or date is not null);

create index class_sessions_date_idx on public.class_sessions (date)
  where date is not null;

-- La web pública muestra las regulares (la grilla de siempre) y también
-- los eventos que todavía no pasaron, para que un taller se difunda solo.
create or replace view public.public_schedule as
select cs.id, cs.title, cs.discipline, cs.day_of_week, cs.start_time,
       cs.duration_minutes, cs.room, t.name as teacher_name,
       cs.kind, cs.date, cs.description, cs.level, cs.price,
       cs.requirements, cs.capacity
from public.class_sessions cs
join public.teachers t on t.id = cs.teacher_id
where cs.active = true
  and (cs.kind = 'regular' or cs.date >= current_date);

commit;

-- ============================================================
-- Nota sobre lo que NO trae esta migración
--
-- Suspender una fecha puntual de una clase regular (un feriado) y
-- registrar que ese día la dio otra profesora necesitan una instancia por
-- fecha, que es una tabla aparte. Va en su propio paso, porque además es
-- lo que después permite contar clases efectivamente dictadas para las
-- liquidaciones del personal.
-- ============================================================
