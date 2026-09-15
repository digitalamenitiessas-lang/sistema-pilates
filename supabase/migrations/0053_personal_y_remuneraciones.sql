-- ============================================================
-- 0053 — Personal, horas trabajadas y remuneraciones
--
-- La sección 12 del documento, y la prioridad 6 del estudio. Es lo único
-- nuevo que entró al alcance (§7), y hasta hoy `teachers` no tenía una
-- sola columna laboral: nombre, teléfono, mail y color.
--
-- LO QUE YA ESTABA, Y ERA LO CARO
--
-- El documento marcaba como bloqueo de §12 que no se puede pagar por
-- clase "con seguridad" porque no se sabe qué clases se dictaron de
-- verdad, con qué profesora y descontando feriados.
--
-- Eso se resolvió solo: `sesiones_dictadas()` (0051) devuelve una fila
-- por clase-fecha efectivamente dictada, **con la profesora de ese día**
-- —respeta el reemplazo de `class_occurrences` (0018)— y **sin las
-- suspendidas**. Se escribió para la ocupación y sirve igual para la
-- liquidación: qué horarios potenciar y a quién pagarle cuánto salen del
-- mismo dato.
--
-- LAS TRES DECISIONES QUE ORDENAN ESTA MIGRACIÓN
--
-- 1. **El sueldo va en una tabla aparte.** RLS filtra filas, no columnas:
--    puesto en `teachers`, cualquiera que pueda leer la grilla vería
--    cuánto gana cada una. Es la misma razón por la que las notas
--    médicas viven en `student_private` desde la 0008, y está escrita
--    como criterio de la casa desde antes de que hubiera sueldos.
--
-- 2. **Las condiciones llevan historial.** Si cobra $5.000 por clase
--    desde enero y $6.000 desde julio, la liquidación de junio tiene que
--    seguir dando $5.000. Con un campo único en la ficha, subirle la
--    tarifa hoy **cambiaría la liquidación del mes pasado** — plata que
--    ya se pagó. Por eso una fila por condición, con `desde`, y la
--    liquidación busca la que regía **cada día**.
--
-- 3. **La liquidación se deriva, no se guarda.** Las clases dictadas
--    están, las horas están, las condiciones están: el total es una
--    cuenta. Copiarlo a una tabla crea dos verdades sobre la misma plata,
--    que es lo que el libro de caja de la 0020 vino a evitar.
--
-- LO QUE NO HACE, A PROPÓSITO
--
-- No hay fichaje de entrada y salida, porque **ninguna profesora tiene
-- cuenta todavía**. Las clases se derivan solas; las horas que no son
-- clase las carga el mostrador. El día que tengan cuenta, el fichaje se
-- apoya en `staff_work_logs` sin rehacer nada.
--
-- Y no toca el pago: liquidar no es pagar. Cuando se le pague, eso es un
-- gasto de la 0020 y entra al libro por donde entra todo lo demás.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- REQUIERE la 0051 (`sesiones_dictadas`).
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Las claves
--
-- Tres, y separadas a propósito: ver quién trabaja no es ver cuánto
-- gana, y cargar horas no es fijar una tarifa. `legacy_roles` solo
-- admin en las dos de plata — hasta hoy nadie podía ver un sueldo
-- porque no existía, y el que más se le parece (`finanzas.ver`) es de
-- recepción. Que el estudio decida abrirlo, no nosotros.
-- ------------------------------------------------------------

insert into public.permission_keys
  (clave, etiqueta, ayuda, grupo, orden, tipo, legacy_roles)
values
  ('personal.ver', 'Ver el personal y sus horas',
   'La ficha laboral de cada profesora y las horas cargadas. No incluye cuánto gana.',
   'Personal', 10, 'permiso', '{admin,recepcion}'),
  ('personal.cargar', 'Cargar horas trabajadas',
   'Registrar horas que no son clases: recepción, tareas, reemplazos administrativos. Las clases dictadas se cuentan solas desde la agenda.',
   'Personal', 20, 'permiso', '{admin,recepcion}'),
  ('personal.remuneracion', 'Ver y fijar las remuneraciones',
   'Cuánto cobra cada una y la liquidación del período. Es el permiso más sensible del sistema: quien lo tiene ve los sueldos de todo el equipo.',
   'Personal', 30, 'permiso', '{admin}')
on conflict (clave) do nothing;

insert into public.role_permissions (role, clave)
select unnest(k.legacy_roles), k.clave
from public.permission_keys k
where k.clave like 'personal.%'
on conflict do nothing;

-- ------------------------------------------------------------
-- 2. La ficha laboral
--
-- Lo que no es sensible va acá; la plata, en la tabla de al lado. Se
-- separan porque la ficha la mira recepción para saber quién está de
-- alta, y el sueldo no.
-- ------------------------------------------------------------

alter table public.teachers
  add column if not exists fecha_ingreso date,
  add column if not exists fecha_baja    date,
  add column if not exists dni           text not null default '',
  add column if not exists notas_laborales text not null default '';

comment on column public.teachers.fecha_baja is
  'Cuándo dejó de trabajar. Distinto de `active = false`, que es la baja del catálogo: una profesora que se fue en marzo sigue teniendo que aparecer en la liquidación de marzo.';

-- ------------------------------------------------------------
-- 3. Las condiciones, con su historial
--
-- Una fila por período. `desde` y nada más: la condición vigente es la
-- de `desde` más alto que no pasó, y la anterior queda cerrada sola. Un
-- `hasta` guardado sería un dato que hay que mantener sincronizado con
-- el `desde` de la siguiente, y se desincroniza.
--
-- Las tres modalidades son las que el documento nombra. Se pueden
-- combinar: una profesora puede tener un básico mensual Y un monto por
-- clase, y por eso son filas y no una columna con un tipo.
-- ------------------------------------------------------------

create table if not exists public.teacher_pay (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,

  -- 'por_clase' → se multiplica por las clases dictadas
  -- 'por_hora'  → se multiplica por las horas cargadas
  -- 'mensual'   → monto fijo del período, sin multiplicar
  modalidad text not null check (modalidad in ('por_clase', 'por_hora', 'mensual')),

  monto numeric(12,2) not null check (monto >= 0),
  desde date not null,
  notas text not null default '',

  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- Una sola condición de cada modalidad por fecha de inicio: cargar dos
-- "por clase" el mismo día es un error de tipeo, y la liquidación no
-- tendría cómo elegir.
create unique index if not exists teacher_pay_unica_idx
  on public.teacher_pay (teacher_id, modalidad, desde);

create index if not exists teacher_pay_vigencia_idx
  on public.teacher_pay (teacher_id, desde desc);

-- ------------------------------------------------------------
-- 4. Las horas que no son clases
--
-- Las clases dictadas NO se cargan acá: se cuentan solas desde la
-- agenda. Cargarlas a mano sería pedirle al mostrador que copie un dato
-- que el sistema ya tiene, y abrir la puerta a que los dos números no
-- coincidan.
--
-- Esto es para lo otro: cubrir recepción, una tarea administrativa, una
-- capacitación. Y para las ausencias y tardanzas, que el documento pide
-- registrar y no son horas trabajadas pero sí son parte del legajo.
-- ------------------------------------------------------------

create table if not exists public.staff_work_logs (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  fecha date not null,

  -- 'trabajo'  → horas que se pagan
  -- 'ausencia' → no vino; horas en 0
  -- 'tardanza' → vino tarde; las horas son las que efectivamente hizo
  tipo text not null default 'trabajo'
    check (tipo in ('trabajo', 'ausencia', 'tardanza')),

  horas numeric(5,2) not null default 0 check (horas >= 0 and horas <= 24),
  detalle text not null default '',

  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists staff_work_logs_idx
  on public.staff_work_logs (teacher_id, fecha desc);

-- ------------------------------------------------------------
-- 5. El sello
-- ------------------------------------------------------------

create or replace function public.stamp_personal()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.created_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists teacher_pay_stamp on public.teacher_pay;
create trigger teacher_pay_stamp
  before insert on public.teacher_pay
  for each row execute function public.stamp_personal();

drop trigger if exists staff_work_logs_stamp on public.staff_work_logs;
create trigger staff_work_logs_stamp
  before insert on public.staff_work_logs
  for each row execute function public.stamp_personal();

-- ------------------------------------------------------------
-- 6. Qué cobraba ese día
--
-- El corazón del historial. Devuelve el monto de esa modalidad que regía
-- en esa fecha: el `desde` más alto que no la pasó. Si no había ninguna
-- condición cargada todavía, devuelve 0 — no se inventa una tarifa.
-- ------------------------------------------------------------

create or replace function public.tarifa_vigente(
  p_teacher uuid, p_modalidad text, p_fecha date
)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select p.monto
    from public.teacher_pay p
    where p.teacher_id = p_teacher
      and p.modalidad = p_modalidad
      and p.desde <= p_fecha
    order by p.desde desc
    limit 1
  ), 0)
$$;

revoke all on function public.tarifa_vigente(uuid, text, date) from public, anon;
grant execute on function public.tarifa_vigente(uuid, text, date) to authenticated;

-- ------------------------------------------------------------
-- 7. La liquidación del período
--
-- Se deriva entera. Cada clase se paga con la tarifa que regía EL DÍA
-- que se dictó, no con la de hoy: por eso la suma va por fila y no
-- clases × tarifa actual.
--
-- El mensual se cuenta una sola vez por período y se toma el que regía
-- al final: es un sueldo, no algo que se multiplique.
-- ------------------------------------------------------------

create or replace function public.liquidacion(p_desde date, p_hasta date)
returns table (
  teacher_id    uuid,
  profesora     text,
  clases        bigint,
  monto_clases  numeric,
  horas         numeric,
  monto_horas   numeric,
  mensual       numeric,
  ausencias     bigint,
  tardanzas     bigint,
  total         numeric
)
language sql stable security definer set search_path = ''
as $$
  with clases as (
    select s.teacher_id,
           count(*)::bigint as n,
           -- Fila por fila, con la tarifa del día de esa clase.
           coalesce(sum(public.tarifa_vigente(s.teacher_id, 'por_clase', s.fecha)), 0) as monto
    from public.sesiones_dictadas(p_desde, p_hasta) s
    where s.teacher_id is not null
    group by s.teacher_id
  ),
  horas as (
    select w.teacher_id,
           coalesce(sum(w.horas) filter (where w.tipo <> 'ausencia'), 0) as n,
           coalesce(sum(
             w.horas * public.tarifa_vigente(w.teacher_id, 'por_hora', w.fecha)
           ) filter (where w.tipo <> 'ausencia'), 0) as monto,
           count(*) filter (where w.tipo = 'ausencia')::bigint as aus,
           count(*) filter (where w.tipo = 'tardanza')::bigint as tar
    from public.staff_work_logs w
    where w.fecha between p_desde and p_hasta
    group by w.teacher_id
  )
  select
    t.id,
    t.name,
    coalesce(c.n, 0),
    coalesce(c.monto, 0),
    coalesce(h.n, 0),
    coalesce(h.monto, 0),
    public.tarifa_vigente(t.id, 'mensual', p_hasta),
    coalesce(h.aus, 0),
    coalesce(h.tar, 0),
    coalesce(c.monto, 0) + coalesce(h.monto, 0)
      + public.tarifa_vigente(t.id, 'mensual', p_hasta)
  from public.teachers t
  left join clases c on c.teacher_id = t.id
  left join horas  h on h.teacher_id = t.id
  -- Una profesora que se fue en marzo tiene que aparecer en la
  -- liquidación de marzo: se filtra por la fecha de baja y no por
  -- `active`, que es la baja del catálogo y no la laboral.
  where (t.fecha_baja is null or t.fecha_baja >= p_desde)
    and (t.active or t.fecha_baja is not null)
  order by t.name
$$;

revoke all on function public.liquidacion(date, date) from public, anon;
grant execute on function public.liquidacion(date, date) to authenticated;

-- ------------------------------------------------------------
-- 8. Las políticas
-- ------------------------------------------------------------

alter table public.teacher_pay enable row level security;
alter table public.staff_work_logs enable row level security;

drop policy if exists "sueldos: ver" on public.teacher_pay;
drop policy if exists "sueldos: fijar" on public.teacher_pay;
drop policy if exists "horas: ver" on public.staff_work_logs;
drop policy if exists "horas: cargar" on public.staff_work_logs;
drop policy if exists "horas: corregir" on public.staff_work_logs;
drop policy if exists "horas: borrar" on public.staff_work_logs;

-- El sueldo, solo con su propia clave. Sin rama para que la profesora
-- vea el suyo: ninguna tiene cuenta todavía, y abrir esa puerta sin
-- poder probarla sería dejarla sin verificar.
create policy "sueldos: ver" on public.teacher_pay for select
  using ((select public.can('personal.remuneracion')));
create policy "sueldos: fijar" on public.teacher_pay for insert
  with check ((select public.can('personal.remuneracion')));

-- Sin update ni delete: una condición no se corrige, se carga la que
-- rige desde hoy. Cambiar una vieja cambia liquidaciones ya pagadas.

create policy "horas: ver" on public.staff_work_logs for select
  using ((select public.can('personal.ver')));
create policy "horas: cargar" on public.staff_work_logs for insert
  with check ((select public.can('personal.cargar')));
create policy "horas: corregir" on public.staff_work_logs for update
  using ((select public.can('personal.cargar')));
create policy "horas: borrar" on public.staff_work_logs for delete
  using ((select public.can('personal.cargar')));

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
-- 1. Las tres claves no movieron nada:
--
--      select * from public.perm_diff();       → cero filas
--
-- 2. Sin condiciones cargadas, la liquidación da las clases dictadas y
--    cero plata. No inventa una tarifa:
--
--      select profesora, clases, total from public.liquidacion('2026-09-01','2026-09-30');
--
-- 3. **El historial, que es lo que hay que probar de verdad.** Cargarle
--    a alguien $5.000 por clase desde el 01/09 y $6.000 desde el 20/09,
--    y liquidar septiembre: el total NO puede ser clases × 6.000. Tiene
--    que ser las de antes del 20 a 5.000 y las de después a 6.000.
--
--      select public.tarifa_vigente('<id>', 'por_clase', '2026-09-10');  → 5000
--      select public.tarifa_vigente('<id>', 'por_clase', '2026-09-25');  → 6000
--
-- 4. Una ausencia no suma horas ni plata, y aparece contada aparte.
--
-- ============================================================
-- PARA VOLVER ATRÁS
--
--   begin;
--   drop function if exists public.liquidacion(date, date);
--   drop function if exists public.tarifa_vigente(uuid, text, date);
--   drop table if exists public.teacher_pay;
--   drop table if exists public.staff_work_logs;
--   drop function if exists public.stamp_personal();
--   delete from public.role_permissions where clave like 'personal.%';
--   delete from public.permission_keys   where clave like 'personal.%';
--   alter table public.teachers
--     drop column if exists fecha_ingreso,
--     drop column if exists fecha_baja,
--     drop column if exists dni,
--     drop column if exists notas_laborales;
--   commit;
-- ============================================================
