-- ============================================================
-- 0061 — El DNI y las notas laborales salen de `teachers`
--
-- Deuda mía de la `0053`. Le agregué cuatro columnas laborales a
-- `teachers`, una tabla que cualquiera logueado lee desde la `0001`
-- ("lectura autenticados"), y dos de esas columnas no son de todos.
--
-- Verificado el 16/09 con la sesión real de un alumno: leyó las trece
-- columnas de `teachers`, incluidas `dni` y `notas_laborales`. No se
-- filtró nada porque están vacías — y están vacías sólo porque el estudio
-- todavía no usó la pantalla de Personal.
--
-- Y ahí está el apuro: lo primero que el estudio tiene que hacer en
-- Personal es cargar las tarifas, porque sin tarifa la liquidación da $0
-- para todas. Es la MISMA pantalla que tiene estos dos campos. O sea que
-- esto no es un pendiente para después: es lo que va antes de que usen el
-- módulo.
--
-- POR QUÉ SATÉLITE Y NO UN PERMISO POR COLUMNA
--
-- Porque admin, recepción, profesora y alumna son el MISMO rol de
-- Postgres (`authenticated`): lo que los distingue son las políticas, y
-- las políticas filtran FILAS, no columnas. Un grant por columna los
-- trataría igual a los cuatro. Es el patrón que CLAUDE.md ya tenía
-- escrito —"si mañana hay sueldos, van en `teacher_private`, no como
-- columna de `teachers`"— y que la `0053` cumplió a medias: las tarifas
-- sí fueron a `teacher_pay`, y estas dos se quedaron a la vista.
--
-- POR QUÉ `fecha_ingreso` Y `fecha_baja` SE QUEDAN
--
-- No son lo mismo. Una fecha de ingreso no identifica a nadie, y sobre
-- todo: `fecha_baja` la usan `liquidacion()` y `sesiones_dictadas()` por
-- dentro para que quien se fue en marzo siga apareciendo en la
-- liquidación de marzo. Mudarlas obliga a un join en dos funciones de
-- plata para tapar un dato que no es sensible. Quedan, y queda escrito
-- por qué.
--
-- QUIÉN LO VE
--
-- `personal.ver` para leer y `personal.cargar` para escribir: las mismas
-- claves con las que ya se gobiernan las horas trabajadas, y el mismo
-- alcance que tenían estos datos ANTES de la `0053` (cuando no existían).
-- Las dos responden {admin, recepcion}. La profesora no entra: ni a la de
-- las demás ni a la propia — ver la nota al pie.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. La tabla satélite
-- ------------------------------------------------------------

create table if not exists public.teacher_private (
  teacher_id      uuid primary key references public.teachers (id) on delete cascade,
  dni             text not null default '',
  notas_laborales text not null default '',
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles (id)
);

comment on table public.teacher_private is
  'Lo de la profesora que no lee todo el mundo. Vive acá y no en teachers porque RLS filtra filas y no columnas (0061).';

alter table public.teacher_private enable row level security;

drop policy if exists "personal: ver ficha privada"  on public.teacher_private;
drop policy if exists "personal: cargar ficha privada" on public.teacher_private;

create policy "personal: ver ficha privada"
  on public.teacher_private for select
  using ((select public.can('personal.ver')));

create policy "personal: cargar ficha privada"
  on public.teacher_private for all
  using ((select public.can('personal.cargar')))
  with check ((select public.can('personal.cargar')));

-- Quién lo tocó y cuándo, igual que en el resto de lo sensible.
create or replace function public.stamp_teacher_private()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists teacher_private_stamp on public.teacher_private;
create trigger teacher_private_stamp
  before insert or update on public.teacher_private
  for each row execute function public.stamp_teacher_private();

-- ------------------------------------------------------------
-- 2. Se muda lo que haya
--
-- Hoy no hay nada —las dos columnas están vacías en las tres filas— pero
-- el `insert ... select` va igual: si alguien carga un DNI entre que se
-- escribe esto y se corre, no se pierde.
-- ------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'teachers' and column_name = 'dni'
  ) then
    insert into public.teacher_private (teacher_id, dni, notas_laborales)
    select t.id, coalesce(t.dni, ''), coalesce(t.notas_laborales, '')
    from public.teachers t
    where coalesce(t.dni, '') <> '' or coalesce(t.notas_laborales, '') <> ''
    on conflict (teacher_id) do update
      set dni = excluded.dni,
          notas_laborales = excluded.notas_laborales;
  end if;
end $$;

-- ------------------------------------------------------------
-- 3. Y se van de `teachers`
-- ------------------------------------------------------------

alter table public.teachers drop column if exists dni;
alter table public.teachers drop column if exists notas_laborales;

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
--   -- 1. Las columnas se fueron y la tabla nueva está
--   select column_name from information_schema.columns
--    where table_name = 'teachers' order by ordinal_position;
--   → sin dni ni notas_laborales; fecha_ingreso y fecha_baja siguen
--
--   -- 2. Las funciones de plata no se rompieron (usan fecha_baja)
--   select count(*) from public.sesiones_dictadas(
--     date_trunc('month', current_date)::date, current_date);
--   → el número de siempre, sin error de columna
--
-- Y ejerciéndolo, que es lo que vale:
--
--   -- 3. Con el ADMIN: cargar un DNI en una profesora desde
--   --    Configuración → Profesores, guardar, salir y volver a entrar.
--   --    Tiene que seguir ahí.
--   -- 4. Con la sesión de una PROFESORA o de una ALUMNA:
--   --      select * from teacher_private;       → 0 filas
--   --      select * from teachers;              → sin esas dos columnas
--   --    Antes de esta migración, el alumno leía las trece columnas.
--   -- 5. Que la agenda y los horarios sigan mostrando a las profesoras:
--   --    el nombre y el color siguen en `teachers`, que todos leen.
--
-- LO QUE QUEDA ABIERTO, A PROPÓSITO
--
-- La profesora no ve su PROPIO DNI ni sus notas laborales. Es lo mismo
-- que pasaba antes de la 0053 y no es una regresión, pero tampoco está
-- bien: son sus datos. Cuando se haga la pantalla de "mi perfil" —que ya
-- está pedida— la política se amplía con una rama
-- `teacher_id in (select public.my_teacher_ids())`, y ahí hay que decidir
-- si las notas laborales las ve (son del estudio sobre ella) o sólo el
-- DNI. Esa decisión es del estudio, no nuestra.
--
-- PARA VOLVER ATRÁS
--
--   begin;
--   alter table public.teachers add column if not exists dni text not null default '';
--   alter table public.teachers add column if not exists notas_laborales text not null default '';
--   update public.teachers t set dni = p.dni, notas_laborales = p.notas_laborales
--     from public.teacher_private p where p.teacher_id = t.id;
--   drop table if exists public.teacher_private cascade;
--   drop function if exists public.stamp_teacher_private();
--   commit;
-- ============================================================
