-- ============================================================
-- 0065 — Ajustes manuales con motivo
--
-- Requerimiento 12.6 del documento del estudio, textual: "al cierre de
-- cada período el sistema debe sumar horas, clases, servicios y
-- comisiones para calcular la remuneración; la ficha muestra total
-- calculado, **ajustes manuales con motivo**, estado pendiente o pagado e
-- historial de liquidaciones".
--
-- De esa frase estaba todo menos los ajustes. Y la pantalla ya los
-- prometía: cuando el total congelado no coincide con el de hoy, dice "si
-- corresponde, cerrale un ajuste aparte" — y no había ni columna ni
-- función de ajuste en ninguna parte. Es el mismo tipo de instrucción
-- imposible que el "cargalo en Gastos" que se corrigió hoy.
--
-- Sin esto, cualquier cosa que la fórmula no capture —un premio, un
-- descuento, una devolución, la corrección de un mes anterior— no tiene
-- dónde ir, y la única salida es tocarle la tarifa, que es peor: cambia
-- el pasado de todas las clases de ese día.
--
-- EL MOTIVO LO EXIGE LA BASE, NO LA PANTALLA
--
-- `check (btrim(motivo) <> '')`. El estudio ya tiene dos candados que
-- viven sólo en el navegador —el comprobante obligatorio del gasto y el
-- motivo al anular— y los dos se esquivan. Un ajuste de sueldo sin
-- explicación es exactamente lo que nadie va a poder reconstruir seis
-- meses después, así que el motivo se exige donde no se puede saltear.
--
-- SE DERIVA, NO SE COPIA
--
-- Los ajustes son filas con fecha, y `liquidacion()` suma los que caen en
-- el período, igual que hace con las clases y las horas. No hay un campo
-- "ajuste" en la liquidación que alguien tenga que mantener al día: el
-- número sale de las filas. Y al cerrar, el total congelado ya los
-- incluye, con su desglose guardado aparte para que la foto explique de
-- dónde salió.
--
-- UN AJUSTE NO SE TOCA SI EL PERÍODO YA SE CERRÓ
--
-- Es la protección que el módulo no tiene en ningún otro lado: hoy las
-- horas se pueden borrar de un período ya cerrado y pagado, sin
-- confirmación y sin rastro. No se arregla eso acá —toca una pantalla que
-- el estudio está por usar— pero lo nuevo nace con el candado: si la
-- fecha del ajuste cae dentro de una liquidación cerrada o pagada de esa
-- persona, la base rechaza con el motivo escrito. Para corregir hay que
-- anular la liquidación primero, que es el camino que ya existe.
--
-- EL TOTAL NO PUEDE QUEDAR NEGATIVO
--
-- `teacher_settlements.total` tiene `check (total >= 0)` desde la 0054.
-- Con un ajuste negativo grande el cierre fallaría con el texto crudo de
-- Postgres, así que `cerrar_liquidacion` ahora corta antes con una frase
-- que dice qué pasó.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. La tabla
-- ------------------------------------------------------------

create table if not exists public.teacher_adjustments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,

  -- Con qué período se liquida. Es una fecha y no un rango a propósito:
  -- así el ajuste entra en el período que la contiene, sin que nadie
  -- tenga que elegir a mano a qué liquidación pertenece.
  fecha date not null,

  -- Positivo suma, negativo resta. Cero no es un ajuste.
  monto numeric(14,2) not null check (monto <> 0),

  -- Obligatorio en la base. Ver el encabezado.
  motivo text not null check (btrim(motivo) <> ''),

  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.teacher_adjustments is
  'Premios, descuentos y correcciones que la fórmula no captura (12.6). El motivo es obligatorio y lo exige la base.';

create index if not exists teacher_adjustments_idx
  on public.teacher_adjustments (teacher_id, fecha);

alter table public.teacher_adjustments enable row level security;

drop policy if exists "ajustes: ver"      on public.teacher_adjustments;
drop policy if exists "ajustes: escribir" on public.teacher_adjustments;

-- Es plata: la misma clave que gobierna las tarifas y la liquidación.
create policy "ajustes: ver"
  on public.teacher_adjustments for select
  using ((select public.can('personal.remuneracion')));
create policy "ajustes: escribir"
  on public.teacher_adjustments for all
  using ((select public.can('personal.remuneracion')))
  with check ((select public.can('personal.remuneracion')));

create or replace function public.stamp_ajuste()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

drop trigger if exists teacher_adjustments_stamp on public.teacher_adjustments;
create trigger teacher_adjustments_stamp
  before insert on public.teacher_adjustments
  for each row execute function public.stamp_ajuste();

-- ------------------------------------------------------------
-- 2. No se toca lo que ya se liquidó
-- ------------------------------------------------------------

create or replace function public.guard_ajuste_cerrado()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_teacher uuid;
  v_fecha   date;
  v_s       record;
begin
  -- En DELETE manda la fila que se va; en el resto, la que queda.
  if tg_op = 'DELETE' then
    v_teacher := old.teacher_id; v_fecha := old.fecha;
  else
    v_teacher := new.teacher_id; v_fecha := new.fecha;
  end if;

  select s.desde, s.hasta, s.estado into v_s
  from public.teacher_settlements s
  where s.teacher_id = v_teacher
    and s.estado <> 'anulada'
    and v_fecha between s.desde and s.hasta
  limit 1;

  if found then
    raise exception
      'Ese día ya está liquidado (% al %, %). Anulá esa liquidación antes de tocar el ajuste.',
      to_char(v_s.desde, 'DD/MM/YYYY'), to_char(v_s.hasta, 'DD/MM/YYYY'), v_s.estado;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists teacher_adjustments_guard on public.teacher_adjustments;
create trigger teacher_adjustments_guard
  before insert or update or delete on public.teacher_adjustments
  for each row execute function public.guard_ajuste_cerrado();

-- ------------------------------------------------------------
-- 3. La liquidación los suma
--
-- `drop` y no `create or replace`: cambia lo que devuelve, y eso Postgres
-- no lo reemplaza. `liquidaciones_cerradas` la llama por dentro y las
-- llamadas dentro de un cuerpo no bloquean el drop.
-- ------------------------------------------------------------

drop function if exists public.liquidacion(date, date);

create function public.liquidacion(p_desde date, p_hasta date)
returns table (
  teacher_id    uuid,
  profesora     text,
  clases        bigint,
  monto_clases  numeric,
  horas         numeric,
  monto_horas   numeric,
  mensual       numeric,
  ajustes       numeric,
  ausencias     bigint,
  tardanzas     bigint,
  total         numeric
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.can('personal.remuneracion') then
    raise exception 'No tenés permiso para ver las remuneraciones';
  end if;

  return query
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
  ),
  -- Los ajustes del período (0065). Se suman como vienen: positivos
  -- suman, negativos restan.
  ajustes as (
    select a.teacher_id, coalesce(sum(a.monto), 0) as monto
    from public.teacher_adjustments a
    where a.fecha between p_desde and p_hasta
    group by a.teacher_id
  ),
  -- Los meses que toca el período, con cuántos de sus días entran (0064).
  meses as (
    select
      g::date as mes_inicio,
      (g + interval '1 month' - interval '1 day')::date as mes_fin,
      greatest(g::date, p_desde) as desde_cubierto,
      least((g + interval '1 month' - interval '1 day')::date, p_hasta) as hasta_cubierto
    from generate_series(
      date_trunc('month', p_desde::timestamp),
      date_trunc('month', p_hasta::timestamp),
      interval '1 month'
    ) as g
  ),
  mensual_prorrateado as (
    select t.id as teacher_id,
           round(coalesce(sum(
             -- La tarifa que regía al terminar el tramo de ESE mes.
             public.tarifa_vigente(t.id, 'mensual', m.hasta_cubierto)
               * ((m.hasta_cubierto - m.desde_cubierto + 1)::numeric
                  / (m.mes_fin - m.mes_inicio + 1))
           ), 0), 2) as monto
    from public.teachers t
    cross join meses m
    group by t.id
  )
  select
    t.id,
    t.name,
    coalesce(c.n, 0),
    coalesce(c.monto, 0),
    coalesce(h.n, 0),
    coalesce(h.monto, 0),
    coalesce(mp.monto, 0),
    coalesce(aj.monto, 0),
    coalesce(h.aus, 0),
    coalesce(h.tar, 0),
    coalesce(c.monto, 0) + coalesce(h.monto, 0) + coalesce(mp.monto, 0)
      + coalesce(aj.monto, 0)
  from public.teachers t
  left join clases c on c.teacher_id = t.id
  left join horas  h on h.teacher_id = t.id
  left join ajustes aj on aj.teacher_id = t.id
  left join mensual_prorrateado mp on mp.teacher_id = t.id
  -- Una profesora que se fue en marzo tiene que aparecer en la
  -- liquidación de marzo: se filtra por la fecha de baja y no por
  -- `active`, que es la baja del catálogo y no la laboral.
  where (t.fecha_baja is null or t.fecha_baja >= p_desde)
    and (t.active or t.fecha_baja is not null)
  order by t.name;
end;
$$;

revoke all on function public.liquidacion(date, date) from public, anon;
grant execute on function public.liquidacion(date, date) to authenticated;

-- ------------------------------------------------------------
-- 4. La foto que queda al cerrar también los guarda
-- ------------------------------------------------------------

alter table public.teacher_settlements
  add column if not exists ajustes numeric(14,2) not null default 0;

comment on column public.teacher_settlements.ajustes is
  'Los ajustes manuales que entraron en este cierre (0065). Guardado aparte del total para que la foto explique de dónde salió.';

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

  -- Con un ajuste negativo grande el total puede dar menos que cero, y la
  -- tabla no lo admite (0054). Sin esto el cierre fallaba con el texto
  -- crudo del check, que no le dice nada a nadie.
  if v_l.total < 0 then
    raise exception
      'Con los ajustes el total da % y no puede ser negativo. Revisá los ajustes del período.',
      to_char(v_l.total, 'FM999999999.00');
  end if;

  insert into public.teacher_settlements (
    teacher_id, desde, hasta,
    clases, monto_clases, horas, monto_horas, mensual, ajustes, total, notas
  ) values (
    p_teacher, p_desde, p_hasta,
    v_l.clases, v_l.monto_clases, v_l.horas, v_l.monto_horas, v_l.mensual,
    v_l.ajustes, v_l.total, coalesce(p_notas, '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.cerrar_liquidacion(uuid, date, date, text) from public, anon;
grant execute on function public.cerrar_liquidacion(uuid, date, date, text) to authenticated;

-- ------------------------------------------------------------
-- 5. Y la lista de cerradas los muestra
-- ------------------------------------------------------------

drop function if exists public.liquidaciones_cerradas(date, date);

create function public.liquidaciones_cerradas(p_desde date, p_hasta date)
returns table (
  id          uuid,
  teacher_id  uuid,
  profesora   text,
  desde       date,
  hasta       date,
  clases      int,
  horas       numeric,
  ajustes     numeric,
  total       numeric,
  total_hoy   numeric,
  estado      text,
  expense_id  uuid,
  notas       text,
  void_reason text,
  created_at  timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.can('personal.remuneracion') then
    raise exception 'No tenés permiso para ver las remuneraciones';
  end if;

  return query
  select
    s.id, s.teacher_id, coalesce(t.name, '—'),
    s.desde, s.hasta, s.clases, s.horas, s.ajustes, s.total,
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
  order by s.hasta desc, t.name;
end;
$$;

revoke all on function public.liquidaciones_cerradas(date, date) from public, anon;
grant execute on function public.liquidaciones_cerradas(date, date) to authenticated;

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
-- Desde el SQL Editor las tres funciones rechazan (no hay sesión, can()
-- da false). Para verlas andar hay que ponerse una sesión de admin en la
-- MISMA ejecución:
--
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<uuid del perfil admin>"}';
--
--   -- 1. El motivo es obligatorio, y lo exige la base
--   insert into public.teacher_adjustments (teacher_id, fecha, monto, motivo)
--   values ('<profesora>', current_date, 5000, '   ');
--   → ERROR: viola la restricción «teacher_adjustments_motivo_check»
--
--   -- 2. Cero no es un ajuste
--   ... monto 0 → ERROR de teacher_adjustments_monto_check
--
--   -- 3. Un ajuste suma en el período que lo contiene
--   insert into public.teacher_adjustments (teacher_id, fecha, monto, motivo)
--   values ('<profesora>', current_date, 5000, 'Premio por cobertura');
--   select profesora, ajustes, total from public.liquidacion(
--     date_trunc('month', current_date)::date, current_date);
--   → ajustes 5000, y el total 5000 más que antes
--
--   -- 4. Y no entra en un período de otro mes
--   select ajustes from public.liquidacion('2026-08-01', '2026-08-31');
--   → 0
--
--   -- 5. Cerrado el período, el ajuste no se toca
--   select public.cerrar_liquidacion('<profesora>', '2026-09-01', '2026-09-30');
--   delete from public.teacher_adjustments where motivo = 'Premio por cobertura';
--   → ERROR: Ese día ya está liquidado (01/09/2026 al 30/09/2026, cerrada).
--     Anulá esa liquidación antes de tocar el ajuste.
--
--   -- 6. Un ajuste negativo que se come todo no deja cerrar
--   ... monto -999999 → al cerrar: ERROR: Con los ajustes el total da
--       -xxx y no puede ser negativo.
--
--   -- 7. Limpiar: anular la liquidación y borrar el ajuste
--   select public.anular_liquidacion('<id>', 'prueba 0065');
--   delete from public.teacher_adjustments where motivo like 'Premio%';
--
-- PARA VOLVER ATRÁS
--
--   begin;
--   drop trigger if exists teacher_adjustments_guard on public.teacher_adjustments;
--   drop trigger if exists teacher_adjustments_stamp on public.teacher_adjustments;
--   drop table if exists public.teacher_adjustments;
--   drop function if exists public.guard_ajuste_cerrado();
--   drop function if exists public.stamp_ajuste();
--   alter table public.teacher_settlements drop column if exists ajustes;
--   commit;
--   -- y volver a correr el bloque 2 de la 0064 (liquidacion sin ajustes),
--   -- el bloque 5 de la 0057 (liquidaciones_cerradas) y el bloque 3 de la
--   -- 0054 (cerrar_liquidacion).
-- ============================================================
