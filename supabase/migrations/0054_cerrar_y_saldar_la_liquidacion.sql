-- ============================================================
-- 0054 — Cerrar y saldar la liquidación
--
-- Lo que le faltaba a la 0053, y lo marcó Matías: el cálculo está, pero
-- **cerrar un período y saldarlo es otra cosa**. Es un hecho que pasó y
-- tiene que quedar registrado — cuánto se le liquidó, cuándo, y si ya se
-- le pagó o todavía no.
--
-- POR QUÉ EL CÁLCULO SE DERIVA Y EL CIERRE SE GUARDA
--
-- No se contradicen: son dos cosas distintas.
--
-- Mientras el período está abierto, el total tiene que moverse solo. Si
-- el lunes se carga una clase que faltaba, la liquidación de ese mes
-- tiene que reflejarla sin que nadie recalcule nada. Por eso
-- `liquidacion()` deriva.
--
-- Pero el día que se cierra, **el número se congela**. Si después alguien
-- carga una clase atrasada o corrige una tarifa, la liquidación que ya se
-- pagó no puede cambiar sola: esa plata ya salió. Un total que se
-- recalcula para atrás no es un registro, es una opinión.
--
-- Y COMO SE CONGELA, HAY QUE AVISAR CUANDO SE SEPARAN
--
-- El riesgo del congelado es el opuesto: que se cargue algo después de
-- cerrar y nadie se entere. Por eso la vista devuelve **las dos cifras**
-- —la congelada y la que daría hoy— y la pantalla avisa cuando difieren.
-- El sistema no elige por el estudio: le muestra las dos y la diferencia.
--
-- PAGAR ES UN GASTO, Y ENTRA POR LA MISMA PUERTA
--
-- Saldar una liquidación no inventa un circuito de plata nuevo: crea un
-- gasto en "Sueldos y honorarios", que ya existe desde la 0020. Así el
-- sueldo baja del saldo de la cuenta, entra al libro y aparece en el
-- resultado del mes como cualquier otro egreso. Un módulo de personal
-- con su propia caja sería una segunda verdad sobre la misma plata.
--
-- Por eso el pago y el cambio de estado van en **una sola función**: una
-- liquidación marcada "pagada" sin su gasto es plata que salió del
-- estudio y no está en ningún lado.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- REQUIERE la 0053.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. La tabla
--
-- Guarda la foto: no un puntero al cálculo, sino los números que dio el
-- día que se cerró. Es lo mismo que hace `cash_sessions` con el arqueo
-- (0020) — un cierre firmado no se recalcula.
-- ------------------------------------------------------------

create table if not exists public.teacher_settlements (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete restrict,

  desde date not null,
  hasta date not null check (hasta >= desde),

  -- La foto del cálculo al cerrar. Desglosada y no solo el total, porque
  -- la pregunta que viene después de "¿cuánto le pagué?" es siempre
  -- "¿por qué tanto?".
  clases       int           not null default 0,
  monto_clases numeric(14,2) not null default 0,
  horas        numeric(10,2) not null default 0,
  monto_horas  numeric(14,2) not null default 0,
  mensual      numeric(14,2) not null default 0,
  total        numeric(14,2) not null check (total >= 0),

  -- 'cerrada' → el número quedó fijo, todavía no se pagó
  -- 'pagada'  → tiene su gasto en el libro
  -- 'anulada' → se cerró por error
  estado text not null default 'cerrada'
    check (estado in ('cerrada', 'pagada', 'anulada')),

  -- El gasto que la saldó. Es el vínculo con el libro de la 0020: sin
  -- esto, "pagada" sería una palabra que no mueve un peso.
  expense_id uuid references public.expenses (id) on delete set null,

  notas       text not null default '',
  void_reason text,

  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  updated_at timestamptz
);

-- Un período se cierra una sola vez por profesora. Parcial: las anuladas
-- se repiten, porque son justamente el registro de que se cerró mal.
create unique index if not exists teacher_settlements_periodo_idx
  on public.teacher_settlements (teacher_id, desde, hasta)
  where estado <> 'anulada';

create index if not exists teacher_settlements_estado_idx
  on public.teacher_settlements (estado, hasta desc);

-- ------------------------------------------------------------
-- 2. El sello
-- ------------------------------------------------------------

create or replace function public.stamp_settlement()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists teacher_settlements_stamp on public.teacher_settlements;
create trigger teacher_settlements_stamp
  before insert or update on public.teacher_settlements
  for each row execute function public.stamp_settlement();

-- ------------------------------------------------------------
-- 3. Cerrar
--
-- El total no lo manda el navegador: lo calcula la base con la misma
-- función que muestra la pantalla. Si lo mandara el cliente, cerrar una
-- liquidación sería escribir el número que uno quiera.
-- ------------------------------------------------------------

create or replace function public.cerrar_liquidacion(
  p_teacher uuid, p_desde date, p_hasta date, p_notas text default ''
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_l record;
  v_id uuid;
begin
  if not public.can('personal.remuneracion') then
    raise exception 'No tenés permiso para cerrar liquidaciones.';
  end if;

  select * into v_l
  from public.liquidacion(p_desde, p_hasta) l
  where l.teacher_id = p_teacher;

  if not found then
    raise exception 'Esa persona no tiene nada liquidado en el período.';
  end if;

  insert into public.teacher_settlements (
    teacher_id, desde, hasta,
    clases, monto_clases, horas, monto_horas, mensual, total, notas
  ) values (
    p_teacher, p_desde, p_hasta,
    v_l.clases, v_l.monto_clases, v_l.horas, v_l.monto_horas, v_l.mensual,
    v_l.total, coalesce(p_notas, '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.cerrar_liquidacion(uuid, date, date, text) from public, anon;
grant execute on function public.cerrar_liquidacion(uuid, date, date, text) to authenticated;

-- ------------------------------------------------------------
-- 4. Pagar
--
-- Crea el gasto y marca la liquidación, las dos cosas o ninguna. Una
-- liquidación "pagada" sin su gasto es plata que salió del estudio y no
-- está en el libro; un gasto sin su liquidación es un sueldo que nadie
-- sabe de qué período era.
--
-- Pide las dos claves: la de remuneraciones porque toca un sueldo, y la
-- de gastos porque mueve el saldo de una cuenta. Quien pueda una sola de
-- las dos no puede pagar.
-- ------------------------------------------------------------

create or replace function public.pagar_liquidacion(
  p_id uuid, p_method text, p_account uuid, p_fecha date default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_s     record;
  v_prof  text;
  v_cat   uuid;
  v_exp   uuid;
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Argentina/Buenos_Aires')::date);
begin
  if not public.can('personal.remuneracion') then
    raise exception 'No tenés permiso para pagar liquidaciones.';
  end if;
  if not public.can('gastos.cargar') then
    raise exception 'Pagar una liquidación carga un gasto, y no tenés permiso para eso.';
  end if;

  select * into v_s from public.teacher_settlements where id = p_id;
  if not found then raise exception 'No existe esa liquidación.'; end if;
  if v_s.estado = 'pagada' then raise exception 'Esa liquidación ya está pagada.'; end if;
  if v_s.estado = 'anulada' then raise exception 'Esa liquidación está anulada.'; end if;

  select name into v_prof from public.teachers where id = v_s.teacher_id;

  -- La categoría por nombre y no por un id escrito acá: la siembra la
  -- 0020 y el estudio puede renombrarla. Si no la encuentra, no se
  -- inventa una — se avisa, porque un gasto sin categoría ensucia el
  -- reporte de egresos que ya existe.
  select id into v_cat from public.expense_categories
  where lower(name) like 'sueldos%' and active limit 1;

  if v_cat is null then
    raise exception 'No hay una categoría de gasto para sueldos. Creala en Configuración antes de pagar.';
  end if;

  insert into public.expenses (
    fecha, category_id, detail, amount, supplier,
    method, account_id, paid_at, paid_date, status, notes
  ) values (
    v_fecha, v_cat,
    'Liquidación ' || coalesce(v_prof, '—') || ' · '
      || to_char(v_s.desde, 'DD/MM') || ' al ' || to_char(v_s.hasta, 'DD/MM/YYYY'),
    v_s.total, coalesce(v_prof, '—'),
    p_method, p_account, now(), v_fecha, 'pagado',
    v_s.clases || ' clases · ' || v_s.horas || ' horas'
  )
  returning id into v_exp;

  update public.teacher_settlements
  set estado = 'pagada', expense_id = v_exp
  where id = p_id;

  return v_exp;
end;
$$;

revoke all on function public.pagar_liquidacion(uuid, text, uuid, date) from public, anon;
grant execute on function public.pagar_liquidacion(uuid, text, uuid, date) to authenticated;

-- ------------------------------------------------------------
-- 5. Anular
--
-- No se borra: el registro de que se cerró mal es información. Y no se
-- anula una pagada desde acá — para eso hay que anular el gasto en
-- Gastos, que es donde vive la plata y donde la 0020 ya dejó el camino
-- con su motivo.
-- ------------------------------------------------------------

create or replace function public.anular_liquidacion(p_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_estado text;
begin
  if not public.can('personal.remuneracion') then
    raise exception 'No tenés permiso para anular liquidaciones.';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Escribí por qué se anula.';
  end if;

  select estado into v_estado from public.teacher_settlements where id = p_id;
  if not found then raise exception 'No existe esa liquidación.'; end if;
  if v_estado = 'pagada' then
    raise exception 'Está pagada: anulá primero el gasto desde Gastos, que es donde salió la plata.';
  end if;

  update public.teacher_settlements
  set estado = 'anulada', void_reason = btrim(p_motivo)
  where id = p_id;
end;
$$;

revoke all on function public.anular_liquidacion(uuid, text) from public, anon;
grant execute on function public.anular_liquidacion(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 6. Las cerradas, con la diferencia a la vista
--
-- Devuelve el total congelado Y el que daría hoy. Es el antídoto del
-- congelado: si alguien carga una clase atrasada después de cerrar, la
-- diferencia aparece en vez de perderse. El sistema no elige — muestra
-- las dos y deja que el estudio decida si corresponde un ajuste.
-- ------------------------------------------------------------

create or replace function public.liquidaciones_cerradas(p_desde date, p_hasta date)
returns table (
  id          uuid,
  teacher_id  uuid,
  profesora   text,
  desde       date,
  hasta       date,
  clases      int,
  horas       numeric,
  total       numeric,
  total_hoy   numeric,
  estado      text,
  expense_id  uuid,
  notas       text,
  void_reason text,
  created_at  timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select
    s.id, s.teacher_id, coalesce(t.name, '—'),
    s.desde, s.hasta, s.clases, s.horas, s.total,
    -- Lo que daría hoy el mismo período. Se calcula al leer, no se
    -- guarda: guardarlo sería un tercer número que también envejece.
    coalesce((
      select l.total from public.liquidacion(s.desde, s.hasta) l
      where l.teacher_id = s.teacher_id
    ), 0),
    s.estado, s.expense_id, s.notas, s.void_reason, s.created_at
  from public.teacher_settlements s
  left join public.teachers t on t.id = s.teacher_id
  where s.hasta >= p_desde and s.desde <= p_hasta
  order by s.hasta desc, t.name
$$;

revoke all on function public.liquidaciones_cerradas(date, date) from public, anon;
grant execute on function public.liquidaciones_cerradas(date, date) to authenticated;

-- ------------------------------------------------------------
-- 7. Las políticas
--
-- Solo lectura desde el cliente: cerrar, pagar y anular pasan por sus
-- funciones, que exigen el permiso y hacen las dos mitades juntas. Sin
-- políticas de escritura, no hay forma de marcar una liquidación como
-- pagada sin que salga el gasto.
-- ------------------------------------------------------------

alter table public.teacher_settlements enable row level security;

drop policy if exists "liquidaciones: ver" on public.teacher_settlements;
create policy "liquidaciones: ver" on public.teacher_settlements for select
  using ((select public.can('personal.remuneracion')));

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
-- 1. Cerrar un período congela el número:
--
--      select public.cerrar_liquidacion('<profesora>', '2026-09-01', '2026-09-30');
--      select profesora, total, total_hoy, estado
--      from public.liquidaciones_cerradas('2026-09-01','2026-09-30');
--
--    Los dos totales dan igual recién cerrada.
--
-- 2. **La prueba que importa.** Cargarle una hora más DESPUÉS de cerrar:
--    `total` no se mueve y `total_hoy` sube. Esa diferencia es lo que la
--    pantalla tiene que mostrar — es plata que se trabajó y no se pagó.
--
-- 3. El mismo período no se cierra dos veces: el segundo intento falla
--    por el índice único.
--
-- 4. Pagar crea el gasto y baja el saldo de la cuenta:
--
--      select public.pagar_liquidacion('<id>', 'efectivo', '<cuenta>');
--      select detail, amount, status from public.expenses order by created_at desc limit 1;
--      select * from public.saldo_cuenta('<cuenta>');
--
-- 5. Una pagada no se anula desde acá: el mensaje manda a Gastos.
--
-- ============================================================
-- PARA VOLVER ATRÁS
--
--   begin;
--   drop function if exists public.liquidaciones_cerradas(date, date);
--   drop function if exists public.anular_liquidacion(uuid, text);
--   drop function if exists public.pagar_liquidacion(uuid, text, uuid, date);
--   drop function if exists public.cerrar_liquidacion(uuid, date, date, text);
--   drop table if exists public.teacher_settlements;
--   drop function if exists public.stamp_settlement();
--   commit;
--
--   Los gastos que las liquidaciones hayan creado NO se van con esto: son
--   plata que salió y viven en el libro por su cuenta. Se anulan desde
--   Gastos, uno por uno y con su motivo.
-- ============================================================
