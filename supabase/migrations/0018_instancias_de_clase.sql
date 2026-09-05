-- ============================================================
-- 0018 — Una clase en una fecha concreta
--
-- Hasta ahora una clase regular es una plantilla que se repite igual para
-- siempre. No hay forma de decir "el jueves 12 no hay por el feriado" ni
-- "ese día la da Lucía en lugar de Valentina": habría que editar la clase
-- entera, y eso cambiaría todas las semanas, también las pasadas.
--
-- Esta tabla guarda las EXCEPCIONES. Una fila existe solo cuando ese día
-- se aparta de la norma; si no hay fila, la clase corre como siempre. Así
-- no se generan miles de filas para decir que todo salió normal.
--
-- Además de resolver feriados y reemplazos, es la pieza que después
-- permite contar clases efectivamente dictadas, que es la base para
-- liquidarle a las profesoras (sección 12 del documento).
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

create table public.class_occurrences (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.class_sessions (id) on delete cascade,
  date date not null,

  status text not null default 'normal'
    check (status in ('normal', 'suspendida')),

  -- Quién la da ese día. Nulo = la de siempre.
  teacher_id uuid references public.teachers (id),
  -- Cambios puntuales de ese día; nulos = los de la clase.
  start_time time,
  capacity int,

  -- Por qué se suspendió o quién reemplaza a quién. Se muestra a la
  -- alumna cuando la clase está suspendida, así que se escribe pensando
  -- en que lo va a leer ella.
  reason text not null default '',

  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),

  unique (class_id, date)
);

create index class_occurrences_date_idx on public.class_occurrences (date);

alter table public.class_occurrences enable row level security;

-- La lee cualquiera con sesión: el portal necesita saber que una clase
-- está suspendida antes de ofrecerla.
create policy "lectura autenticados"
  on public.class_occurrences for select
  using (auth.uid() is not null);

create policy "agenda: crear"
  on public.class_occurrences for insert
  with check ((select public.can('agenda.editar')));
create policy "agenda: editar"
  on public.class_occurrences for update
  using ((select public.can('agenda.editar')));
create policy "agenda: borrar"
  on public.class_occurrences for delete
  using ((select public.can('agenda.eliminar')));

-- Quién tocó qué, sin que lo tenga que mandar el navegador.
create or replace function public.stamp_class_occurrence()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

create trigger class_occurrences_stamp
  before insert or update on public.class_occurrences
  for each row execute function public.stamp_class_occurrence();

-- ------------------------------------------------------------
-- El cupo ahora también mira la instancia
--
-- Dos cosas: no se puede reservar en una fecha suspendida, y si ese día
-- el cupo es distinto, manda el de la instancia. La regla vive en la base
-- y no en la pantalla, así vale igual desde el portal, desde recepción y
-- desde cualquier proceso automático.
-- ------------------------------------------------------------
create or replace function public.enforce_class_capacity()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  cap int;
  taken int;
  occ record;
begin
  if new.status = 'confirmada' then
    select * into occ
    from public.class_occurrences
    where class_id = new.class_id and date = new.date;

    if occ.status = 'suspendida' then
      raise exception 'Esa clase está suspendida ese día';
    end if;

    select capacity into cap from public.class_sessions where id = new.class_id;
    cap := coalesce(occ.capacity, cap);

    select count(*) into taken
    from public.reservations
    where class_id = new.class_id
      and date = new.date
      and status in ('confirmada', 'asistió')
      and id is distinct from new.id;

    if taken >= cap then
      raise exception 'La clase ya está completa';
    end if;
  end if;
  return new;
end;
$$;

commit;

-- ============================================================
-- Nota
--
-- Suspender una fecha NO cancela sola las reservas que ya estaban: eso
-- es una decisión con consecuencias (¿se les devuelve la clase?, ¿se les
-- avisa?) y la toma quien suspende, desde la pantalla. La base solo
-- impide reservas nuevas.
-- ============================================================
