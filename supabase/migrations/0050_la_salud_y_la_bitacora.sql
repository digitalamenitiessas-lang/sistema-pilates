-- ============================================================
-- 0050 — La salud en campos propios, y la bitácora
--
-- Lo que falta de la ficha integral: la sección 5 del documento original
-- (5.4 y 5.6) y la pestaña "Salud" y "Notas" que el estudio volvió a
-- pedir el 15/09.
--
-- LA SALUD
--
-- Hoy es **un solo texto libre**. Sirve para escribir y no sirve para
-- nada más: no se puede filtrar, no se puede preguntar "¿quiénes están
-- embarazadas?" antes de armar la grilla de embarazadas, y en una clase
-- nadie encuentra rápido la lesión de alguien en un párrafo.
--
-- Las cuatro columnas nuevas viven en `student_private` y no en
-- `students` porque **RLS filtra filas, no columnas**: puestas en
-- `students` las vería cualquiera que pueda leer un cliente. En
-- `student_private` las gobiernan `salud.ver` y `salud.editar`, que ya
-- existen desde la 0013, así que esta migración no toca una sola
-- política.
--
-- **El texto viejo NO se reparte solo.** `medical_notes` queda como está
-- y pasa a ser "otras observaciones". Separar "Embarazo - 6 MESES" en
-- sus campos es una lectura, no una transformación: un `split` por
-- palabras clave acierta en los casos fáciles y escribe datos falsos en
-- los difíciles, justo en el campo donde un dato falso importa. Lo pasa
-- el mostrador, mirando cada ficha.
--
-- Nota de privacidad, la misma de siempre: la clienta lee su propia fila
-- de `student_private` desde el portal (0008), así que **va a ver estos
-- cuatro campos**. Se escriben pensando en eso.
--
-- LA BITÁCORA
--
-- `students.observations` es un texto que se pisa: quien escribe segundo
-- borra al primero, y no queda quién lo dijo ni cuándo. Una bitácora es
-- otra cosa — filas, con autor y fecha.
--
-- Y es lo único que la profesora va a poder escribir en todo el sistema.
-- Hoy no puede escribir nada: ni `canWrite` ni ninguna política se lo
-- permiten. Por eso la clave es propia y no `alumnos.editar` — se le
-- puede dar la bitácora sin darle la ficha.
--
-- Las notas internas del staff no las ve la profesora, y eso lo decide
-- `alumnos.editar` en vez de una clave nueva: es exactamente la línea
-- que separa a quien administra al cliente de quien lo atiende.
--
-- **La clienta no lee la bitácora.** No hay política que se lo permita,
-- a diferencia de `student_private`. Es la nota interna sobre ella.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Los cuatro campos de salud
--
-- `not null default ''` como las dos que ya estaban: así una fila vieja
-- no queda con nulos y el código no tiene que distinguir "vacío" de "no
-- cargado" en cada lectura.
-- ------------------------------------------------------------

alter table public.student_private
  add column if not exists lesiones   text not null default '',
  add column if not exists embarazo   text not null default '',
  add column if not exists cirugias   text not null default '',
  add column if not exists medicacion text not null default '';

comment on column public.student_private.medical_notes is
  'Otras observaciones de salud. Desde la 0050 lo puntual va en sus columnas; esto es lo que no entra en ninguna.';

-- ------------------------------------------------------------
-- 2. La bitácora
-- ------------------------------------------------------------

create table if not exists public.student_notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,

  -- 'profesora' → lo que se observó dando clase. La ve todo el equipo.
  -- 'interna'   → nota del mostrador sobre el cliente. La profesora no.
  kind text not null default 'profesora'
    check (kind in ('profesora', 'interna')),

  body text not null check (btrim(body) <> ''),

  -- Apunta a `profiles` y NO a `auth.users`, aunque el id sea el mismo.
  -- El motivo es práctico y costó una prueba: PostgREST resuelve el
  -- nombre del autor por la clave foránea, y contra `auth.users` no
  -- puede —ese esquema no está expuesto—, así que la consulta falla y la
  -- bitácora se ve vacía aunque las filas estén.
  --
  -- Sin `on delete set null`: si se da de baja el acceso de quien la
  -- escribió, la nota tiene que seguir diciendo quién fue. Las bajas de
  -- perfil son lógicas desde la 0015, así que la fila sigue existiendo.
  author_id uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- Para que una base donde la 0050 ya corrió con la referencia vieja
-- quede igual que una nueva: esto es lo único que la vuelve a correr.
alter table public.student_notes
  drop constraint if exists student_notes_author_id_fkey;
alter table public.student_notes
  add constraint student_notes_author_id_fkey
  foreign key (author_id) references public.profiles (id);

create index if not exists student_notes_cliente_idx
  on public.student_notes (student_id, created_at desc);

-- ------------------------------------------------------------
-- 3. El sello
--
-- El autor lo pone la base, nunca el cliente: una bitácora donde se
-- pueda elegir quién firma no es una bitácora.
-- ------------------------------------------------------------

create or replace function public.stamp_student_note()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.author_id := auth.uid();
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists student_notes_stamp on public.student_notes;
create trigger student_notes_stamp
  before insert on public.student_notes
  for each row execute function public.stamp_student_note();

-- ------------------------------------------------------------
-- 4. Las claves
-- ------------------------------------------------------------

insert into public.permission_keys
  (clave, etiqueta, ayuda, grupo, orden, tipo, legacy_roles)
values
  ('notas.ver', 'Ver la bitácora del cliente',
   'El historial de observaciones con quién las escribió y cuándo. Las notas internas del mostrador solo las ve quien además puede editar al cliente.',
   'Clientes', 60, 'permiso', '{admin,recepcion,profesor}'),
  ('notas.escribir', 'Escribir en la bitácora',
   'Dejar una observación sobre el cliente. Es lo único que la profesora puede escribir en el sistema: se le puede dar sin darle la ficha.',
   'Clientes', 70, 'permiso', '{admin,recepcion,profesor}')
on conflict (clave) do nothing;

insert into public.role_permissions (role, clave)
select unnest(k.legacy_roles), k.clave
from public.permission_keys k
where k.clave in ('notas.ver', 'notas.escribir')
on conflict do nothing;

-- ------------------------------------------------------------
-- 5. Las políticas
-- ------------------------------------------------------------

alter table public.student_notes enable row level security;

-- Las tres se sueltan antes de crearlas para que la migración se pueda
-- volver a pegar entera: `create policy` no tiene `if not exists`, y sin
-- esto un segundo pegado falla a la mitad y deja el resto sin aplicar.
drop policy if exists "notas: ver" on public.student_notes;
drop policy if exists "notas: escribir" on public.student_notes;
drop policy if exists "notas: borrar" on public.student_notes;

-- La profesora ve las de su oficio; el mostrador ve todo.
create policy "notas: ver" on public.student_notes for select
  using (
    (select public.can('notas.ver'))
    and (kind = 'profesora' or (select public.can('alumnos.editar')))
  );

create policy "notas: escribir" on public.student_notes for insert
  with check (
    (select public.can('notas.escribir'))
    -- Escribir una nota interna es del que administra al cliente.
    and (kind = 'profesora' or (select public.can('alumnos.editar')))
  );

-- Sin update: una nota no se edita, se agrega otra. Lo que se escribió
-- el martes se leyó el martes, y reescribirlo después cambia la historia.
--
-- El borrado sí, y acotado a quien administra al cliente: una nota
-- cargada en la ficha equivocada es un caso real, y dejarla ahí es peor
-- que perder el registro de que existió.
create policy "notas: borrar" on public.student_notes for delete
  using ((select public.can('alumnos.editar')));

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
-- 1. Las claves nuevas no movieron nada:
--
--      select * from public.perm_diff();       → cero filas
--
-- 2. El texto viejo sigue entero donde estaba, y los cuatro campos
--    nuevos nacen vacíos — no repartidos:
--
--      select medical_notes, lesiones, embarazo, cirugias, medicacion
--      from public.student_private;
--
-- 3. Una nota guardada trae su autor sin que nadie lo mande:
--
--      select n.body, n.kind, p.full_name, n.created_at
--      from public.student_notes n
--      left join public.profiles p on p.id = n.author_id;
--
-- 4. La clienta no lee la bitácora: no hay política que la incluya.
--
-- ============================================================
-- PARA VOLVER ATRÁS
--
--   begin;
--   drop table if exists public.student_notes;      -- se lleva sus políticas
--   drop function if exists public.stamp_student_note();
--   delete from public.role_permissions where clave like 'notas.%';
--   delete from public.permission_keys   where clave like 'notas.%';
--   alter table public.student_private
--     drop column if exists lesiones,
--     drop column if exists embarazo,
--     drop column if exists cirugias,
--     drop column if exists medicacion;
--   commit;
-- ============================================================
