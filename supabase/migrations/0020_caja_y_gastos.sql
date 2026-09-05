-- ============================================================
-- 0020 — Caja diaria, cuentas y gastos (secciones 8 y 9)
--
-- LA IDEA QUE ORDENA TODO: el libro de caja no se guarda, se DERIVA.
-- Los cobros ya viven en public.payments con su instante (paid_at) y su
-- día del estudio (paid_date, migración 0016). Copiarlos a un libro
-- paralelo sería tener dos verdades para la misma plata y un problema de
-- conciliación desde el primer día. Entonces el "historial de
-- movimientos" de la sección 8 es una VISTA que une tres patas: cobros,
-- gastos pagados y los movimientos que payments no sabe expresar
-- (apertura de cuenta, transferencias internas, retiros, aportes,
-- devoluciones y el ajuste del arqueo).
--
-- Cuatro consecuencias de esa decisión:
--
--  1. El saldo se SUMA, no se cachea. Un estudio chico hace unos pocos
--     miles de movimientos por año: sumarlos es milisegundos y el número
--     no puede desincronizarse nunca. Un caché de saldo es exactamente el
--     modo de falla que ya tuvimos con can() en la 0014, y acá el síntoma
--     aparecería recién cuando alguien arquea y no cierra.
--  2. El arqueo es lo único que se guarda pudiendo derivarse, y es a
--     propósito: dice lo que se CONTÓ ese turno, no lo que la base opina
--     hoy.
--  3. La diferencia del arqueo se asienta como movimiento. Por eso el
--     saldo del sistema queda igual a la plata contada sin ningún ancla
--     mágica, y sin ningún campo "saldo" editable a mano.
--  4. Un cobro nunca puede fallar por culpa de la caja: si no se resuelve
--     la cuenta, cae en la cuenta de sistema "A imputar", que es una
--     cuenta real y visible. El libro nunca tiene un agujero y el
--     mostrador nunca se traba.
--
-- Mercado Pago y la tarjeta NO son plata en un cajón: cada medio de pago
-- apunta a su cuenta y solo las de kind='caja' se arquean contando.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- Prerrequisitos verificados antes de pegar (los tres son una consulta):
--   select * from public.perm_diff();                     -- cero filas
--   select count(*) from public.payments
--    where status = 'pagado' and paid_at is null;          -- cero
--   select distinct method from public.payments;           -- los 4 del catálogo
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. PARÁMETROS: dos clases, no una
--
-- studio_settings lo escribe recepción (0011), y recepción es
-- justamente la persona a la que el arqueo controla. Los parámetros que
-- AFLOJAN un control (tolerancia de diferencia, exigir motivo, bloquear
-- el día cerrado) no pueden vivir con la misma llave que el horario de
-- atención. Es la misma decisión que llevó permission_config a ser una
-- tabla aparte en la 0012.
--
-- En vez de una tabla nueva: una columna que marca el parámetro como de
-- control, y una restrictiva que se la reserva al admin.
-- ------------------------------------------------------------
alter table public.studio_settings
  add column if not exists solo_admin boolean not null default false;

alter table public.studio_settings
  drop constraint if exists studio_settings_group_key_check;
alter table public.studio_settings
  add constraint studio_settings_group_key_check
  check (group_key in ('estudio', 'reservas', 'membresias', 'cobros',
                       'avisos', 'caja', 'gastos', 'general'));

-- Restrictiva: se suma con Y a "config: editar" (0013). Sin el USING,
-- recepción podría convertir un parámetro de control en uno común.
create policy "parametros de control: solo admin"
  on public.studio_settings as restrictive for update
  using (not solo_admin or public.app_role() = 'admin')
  with check (not solo_admin or public.app_role() = 'admin');

insert into public.studio_settings
  (key, value, kind, options, label, help, group_key, sort_order, is_public, solo_admin) values
  ('caja_bloquea_dia_cerrado', 'true', 'boolean', '{}',
   'Una vez cerrada, la caja de ese turno no se modifica',
   'Impide cambiar el monto, el medio o la cuenta de un cobro o un gasto que ya entró en un arqueo firmado. Anular sí se puede: la anulación se ve en el control de caja y lo que haya que devolver se registra hoy. Es además el interruptor de emergencia del control que toca el camino de cobro.',
   'caja', 10, false, true),

  ('caja_diferencia_tolerada', '0', 'number', '{}',
   'Diferencia de arqueo que no pide explicación',
   'Hasta cuántos pesos de diferencia se aceptan sin escribir un motivo. En 0, cualquier diferencia pide una nota.',
   'caja', 20, false, true),

  ('caja_exige_motivo_diferencia', 'true', 'boolean', '{}',
   'Pedir un motivo cuando la caja no cierra',
   'Anotar el motivo en el momento cuesta diez segundos; reconstruirlo tres semanas después es imposible.',
   'caja', 30, false, true),

  ('caja_cuentas_en_tablero', 'true', 'boolean', '{}',
   'Mostrar los saldos de cuentas en el inicio',
   'La sección 7 los pide, pero un tablero con nueve tarjetas no lo mira nadie. Si sobra información, se apaga.',
   'caja', 40, false, false),

  ('tablero_resultado_base', 'cobrado', 'choice',
   '{"Lo cobrado menos lo pagado|cobrado","Lo facturado menos lo devengado|devengado"}',
   'Cómo se calcula el resultado neto',
   'Un estudio chico piensa en caja: lo que entró menos lo que salió. La otra lectura suma lo facturado y los gastos cargados aunque todavía no se hayan pagado. Las dos salen de las mismas columnas: cambiar esto no migra ningún dato.',
   'caja', 50, false, false),

  ('gastos_estado_default', 'pagado', 'choice',
   '{"Pagado|pagado","Pendiente de pago|pendiente"}',
   'Estado con el que se carga un gasto nuevo',
   'La encargada carga el gasto DESPUÉS de pagarlo: ese es el flujo del cuaderno. Un estudio que quiera cargar facturas por vencer y pagarlas después lo cambia acá.',
   'gastos', 10, false, false),

  ('gastos_comprobante_obligatorio', 'false', 'boolean', '{}',
   'Exigir tipo y número de comprobante',
   'Exigirle número de factura al café del lunes es la forma más rápida de que dejen de cargar gastos. El día que el contador lo pida, se enciende.',
   'gastos', 20, false, false),

  ('gastos_adjunto_habilitado', 'false', 'boolean', '{}',
   'Permitir adjuntar la foto del comprobante',
   'Guardar archivos es el primer uso de Supabase Storage en el sistema y va en su propia migración. Mientras esto esté apagado, el botón de adjuntar no aparece y el módulo de gastos funciona completo igual.',
   'gastos', 30, false, false),

  ('gastos_adjunto_max_mb', '10', 'number', '{}',
   'Tamaño máximo del comprobante (MB)',
   'Una foto de factura sacada con el celular pesa entre 2 y 8 MB. El límite se valida antes de subir.',
   'gastos', 40, false, false)
on conflict (key) do nothing;

-- Lectura de parámetros desde los disparadores. SECURITY DEFINER porque
-- el webhook y el proceso diario escriben sin sesión (auth.uid() nulo) y
-- "lectura autenticados" (0011) no les devolvería ninguna fila: sin esto,
-- un control quedaría apagado justo para el camino automático.
create or replace function public.param(p_key text, p_default text)
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(nullif((select s.value from public.studio_settings s
                           where s.key = p_key), ''), p_default);
$$;

revoke all on function public.param(text, text) from public, anon;
grant execute on function public.param(text, text) to authenticated;

-- ------------------------------------------------------------
-- 2. CUENTAS — dónde está la plata
--
-- Una cuenta es cualquier lugar donde el estudio tiene plata. Lo único
-- que las diferencia es si alguien la cuenta con la mano al cerrar.
-- Sin esto, un cobro de Mercado Pago entra al arqueo del cajón y la
-- diferencia da negativa todos los días sin que se entienda por qué.
--
-- La tabla NO tiene columna de saldo: el saldo es lo que dice el libro.
-- El saldo inicial se carga asentando un movimiento de apertura, así no
-- hay un solo peso sin su asiento.
-- ------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,

  -- 'caja'        → plata física, se cuenta al cerrar
  -- 'banco'       → cuenta bancaria
  -- 'billetera'   → billetera digital con saldo propio (Mercado Pago)
  -- 'pasarela'    → lo cobrado que todavía no acreditó (tarjetas)
  -- 'transitoria' → "A imputar": lo que entró sin cuenta resuelta
  kind text not null default 'caja'
    check (kind in ('caja', 'banco', 'billetera', 'pasarela', 'transitoria')),

  -- true = se arquea contando. Es la línea que separa el cajón del
  -- mostrador de la billetera de Mercado Pago.
  arquea boolean not null default false,

  -- Cuenta del sistema: no se desactiva ni cambia de tipo. Si "A
  -- imputar" se pudiera apagar, un cobro sin cuenta resuelta no tendría
  -- dónde caer y el libro quedaría con un agujero.
  is_system boolean not null default false,

  bank_name text not null default '',
  cbu text not null default '',
  alias text not null default '',
  holder text not null default '',
  notes text not null default '',
  sort_order int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) default auth.uid()
);

create unique index accounts_nombre_idx on public.accounts (lower(name));
-- Una sola cuenta transitoria: si hubiera dos, "lo que falta imputar"
-- dejaría de ser un número y pasaría a ser una búsqueda.
create unique index accounts_transitoria_idx
  on public.accounts (kind) where kind = 'transitoria';
create index accounts_activas_idx on public.accounts (sort_order) where active;

alter table public.accounts enable row level security;

create policy "caja: ver cuentas" on public.accounts for select
  using ((select public.can('caja.ver')));
create policy "cuentas: crear" on public.accounts for insert
  with check ((select public.can('caja.cuentas')));
create policy "cuentas: editar" on public.accounts for update
  using ((select public.can('caja.cuentas')));
-- Sin delete: una cuenta con movimientos no se borra, se desactiva.
create policy "baja exige permiso" on public.accounts as restrictive for update
  using (true)
  with check (active or (select public.can('caja.cuentas')));

create or replace function public.guard_account_sistema()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.is_system and (not new.active or new.kind is distinct from old.kind) then
    raise exception 'La cuenta "%" es del sistema: no se puede desactivar ni cambiar de tipo', old.name;
  end if;
  return new;
end;
$$;

create trigger accounts_guard_sistema
  before update on public.accounts
  for each row execute function public.guard_account_sistema();

-- Las cinco cuentas con las que arranca cualquier estudio chico. Los
-- nombres los cambia el estudio desde la pantalla; los ids son fijos para
-- que el mapeo de medios de pago de más abajo no dependa del orden.
insert into public.accounts (id, name, kind, arquea, is_system, sort_order) values
  ('a0000000-0000-4000-8000-000000000001', 'Caja del mostrador',  'caja',        true,  false, 10),
  ('a0000000-0000-4000-8000-000000000002', 'Cuenta bancaria',     'banco',       false, false, 20),
  ('a0000000-0000-4000-8000-000000000003', 'Mercado Pago',        'billetera',   false, false, 30),
  ('a0000000-0000-4000-8000-000000000004', 'Tarjetas a acreditar','pasarela',    false, false, 40),
  ('a0000000-0000-4000-8000-000000000009', 'A imputar',           'transitoria', false, true,  99);

-- ------------------------------------------------------------
-- 3. CADA MEDIO DE PAGO SABE A QUÉ CUENTA VA
--
-- Columna nueva y nulable: el código que hoy lee payment_methods con
-- select('*') no se entera. Si queda en nulo, el cobro cae en "A
-- imputar" — visible y corregible, nunca perdido.
--
-- OJO: payments.method sigue con su CHECK de cuatro valores (0002:37-39).
-- Cambiarlo por una FK al catálogo es correcto y está pendiente, pero
-- HOY rompería la pantalla de Pagos: METHOD_ICON / METHOD_LABEL /
-- METHOD_COLORS son objetos de cuatro claves escritos a mano y un código
-- desconocido deja el icono en undefined, que en React es una pantalla en
-- blanco. Primero se derivan del catálogo en el front, después la FK, en
-- su propia migración.
-- ------------------------------------------------------------
alter table public.payment_methods
  add column default_account_id uuid references public.accounts (id),
  -- 'diferida' = lo cobrado no está disponible el mismo día (MP, tarjeta):
  -- entra a su cuenta y llega al banco como transferencia interna.
  add column liquidacion text not null default 'inmediata'
    check (liquidacion in ('inmediata', 'diferida'));

update public.payment_methods set default_account_id = 'a0000000-0000-4000-8000-000000000001', liquidacion = 'inmediata' where code = 'efectivo';
update public.payment_methods set default_account_id = 'a0000000-0000-4000-8000-000000000002', liquidacion = 'inmediata' where code = 'transferencia';
update public.payment_methods set default_account_id = 'a0000000-0000-4000-8000-000000000004', liquidacion = 'diferida'  where code = 'tarjeta';
update public.payment_methods set default_account_id = 'a0000000-0000-4000-8000-000000000003', liquidacion = 'diferida'  where code = 'mercadopago';

-- El error de configuración más caro del módulo es mandar Mercado Pago al
-- cajón: la plata entra al arqueo, la diferencia da negativa todos los
-- días y nadie entiende por qué. Se rechaza en la base, no en una nota de
-- ayuda.
create or replace function public.guard_medio_cuenta()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.default_account_id is not null and not new.is_manual
     and exists (select 1 from public.accounts a
                  where a.id = new.default_account_id and a.arquea) then
    raise exception 'Un medio que acredita una integración no puede ir a una caja que se arquea: la plata no está en el cajón';
  end if;
  return new;
end;
$$;

create trigger payment_methods_guard_cuenta
  before insert or update on public.payment_methods
  for each row execute function public.guard_medio_cuenta();

-- ------------------------------------------------------------
-- 4. EL COBRO SABE A QUÉ CUENTA ENTRÓ
--
-- Es lo único del módulo que se GUARDA pudiendo derivarse del medio, y
-- la razón es fuerte: la cuenta a la que entró un cobro es un HECHO del
-- momento, no una regla. Si mañana el estudio cambia el banco al que van
-- las transferencias, derivarlo por método reescribiría la historia.
--
-- Es también la única columna que el módulo le agrega a payments. Toda
-- columna de payments viaja al navegador de la alumna por "alumno lee sus
-- pagos" (0005:54-56) sobre el select('*') de fetchStudioData: un uuid de
-- cuenta sobre su propio pago es aceptable, la comisión de Mercado Pago o
-- el uuid de quien cobró no lo serían. Eso va en tabla satélite.
-- ------------------------------------------------------------
alter table public.payments
  add column account_id uuid references public.accounts (id);

update public.payments p
   set account_id = coalesce(
         (select pm.default_account_id from public.payment_methods pm where pm.code = p.method),
         'a0000000-0000-4000-8000-000000000009')
 where p.status = 'pagado' and p.account_id is null;

create index payments_caja_idx on public.payments (account_id, paid_date)
  where status = 'pagado';

-- Resuelve la cuenta sola. NUNCA levanta una excepción: un trigger que
-- puede fallar sobre payments es un cobro que no entra, y en el webhook
-- de Mercado Pago eso además devuelve 500 y MP reintenta contra el mismo
-- error. Por eso el último recurso es la cuenta transitoria y no un raise.
--
-- El nombre importa: Postgres dispara los BEFORE por orden alfabético y
-- 'payments_assign_receipt' (0016) es quien sella paid_at. a < i.
create or replace function public.imputar_cuenta_pago()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'pagado' and new.account_id is null then
    new.account_id := coalesce(
      (select pm.default_account_id from public.payment_methods pm where pm.code = new.method),
      'a0000000-0000-4000-8000-000000000009');
  end if;
  return new;
end;
$$;

create trigger payments_imputar_cuenta
  before insert or update on public.payments
  for each row execute function public.imputar_cuenta_pago();

-- Quién cobró, en tabla satélite y no como columna de payments: RLS
-- filtra filas, no columnas, y la alumna lee sus propios pagos. Mismo
-- patrón que student_private (0008).
create table public.payment_staff (
  payment_id uuid primary key references public.payments (id) on delete cascade,
  cobrado_por uuid references auth.users (id),
  cobrado_at timestamptz not null default now()
);

alter table public.payment_staff enable row level security;

create policy "caja: ver quien cobro" on public.payment_staff for select
  using ((select public.can('caja.ver')) or (select public.can('finanzas.ver')));
-- Nadie la escribe desde el cliente: la escribe el disparador.

create or replace function public.sellar_cobrado_por()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'pagado' and auth.uid() is not null then
    begin
      insert into public.payment_staff (payment_id, cobrado_por)
      values (new.id, auth.uid())
      on conflict (payment_id) do nothing;
    exception when others then
      -- Por el mismo motivo que imputar_cuenta_pago no lanza excepciones:
      -- esto corre en el camino del cobro. Saber quién cobró es deseable;
      -- que un cobro se caiga por no poder anotarlo, no. Si falla, el pago
      -- entra igual y queda sin sellar.
      null;
    end;
  end if;
  return null;
end;
$$;

create trigger payments_sella_cobrador
  after insert or update on public.payments
  for each row execute function public.sellar_cobrado_por();

-- ------------------------------------------------------------
-- 5. CATÁLOGO DE CATEGORÍAS DE GASTO
--
-- Dos niveles con un solo self-FK: la subcategoría de la sección 9 sale
-- de una columna y no de otra tabla. Se escribe con gastos.editar y no
-- con catalogos.*: quien no puede tocar un gasto no debería poder
-- renombrar la categoría bajo la que ese gasto quedó imputado, porque eso
-- reescribe la lectura histórica de todos los totales.
-- ------------------------------------------------------------
create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references public.expense_categories (id),
  -- fijo (alquiler, sueldos) vs variable (insumos): no se puede deducir
  -- del nombre y es lo que hace útil el reporte de resultado.
  nature text not null default 'variable' check (nature in ('fijo', 'variable')),
  sort_order int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Puede haber "Otros" dentro de dos categorías distintas.
create unique index expense_categories_nombre_idx on public.expense_categories
  (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create or replace function public.guard_categoria_dos_niveles()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.parent_id = new.id then
    raise exception 'Una categoría no puede ser su propia subcategoría';
  end if;
  if new.parent_id is not null and exists (
    select 1 from public.expense_categories c
     where c.id = new.parent_id and c.parent_id is not null
  ) then
    raise exception 'Las categorías de gasto tienen dos niveles: rubro y subrubro';
  end if;
  return new;
end;
$$;

create trigger expense_categories_dos_niveles
  before insert or update on public.expense_categories
  for each row execute function public.guard_categoria_dos_niveles();

alter table public.expense_categories enable row level security;

create policy "gastos: ver categorias" on public.expense_categories for select
  using ((select public.can('gastos.ver')));
create policy "gastos: crear categoria" on public.expense_categories for insert
  with check ((select public.can('gastos.editar')));
create policy "gastos: editar categoria" on public.expense_categories for update
  using ((select public.can('gastos.editar')));
create policy "baja exige permiso" on public.expense_categories as restrictive for update
  using (true)
  with check (active or (select public.can('gastos.editar')));

-- Lo que gasta un estudio de pilates, no una taxonomía contable. Se
-- edita desde Configuración el primer día, así que no hay que acertarle.
-- "Comisiones y gastos bancarios" viene sembrada porque la usa el retiro
-- de Mercado Pago.
insert into public.expense_categories (name, nature, sort_order) values
  ('Alquiler y expensas',           'fijo',     10),
  ('Servicios',                     'fijo',     20),
  ('Sueldos y honorarios',          'fijo',     30),
  ('Impuestos y tasas',             'fijo',     40),
  ('Insumos',                       'variable', 50),
  ('Mantenimiento',                 'variable', 60),
  ('Equipamiento',                  'variable', 70),
  ('Marketing',                     'variable', 80),
  ('Comisiones y gastos bancarios', 'variable', 90),
  ('Otros',                         'variable', 99);

-- ------------------------------------------------------------
-- 6. GASTOS (sección 9)
--
-- Copia deliberadamente la forma de payments: fecha del comprobante,
-- instante del pago y día del estudio derivado de ese instante, estado
-- pendiente / pagado / anulado. Así el gasto entra a la caja con la misma
-- definición de día que el cobro (0016) y las vistas los pueden unir sin
-- traducir nada.
--
-- Devengado y percibido separados: un gasto PENDIENTE no mueve un solo
-- peso de ninguna cuenta. La plata se mueve el día que se paga.
--
-- El proveedor es texto y no una tabla: filtrar y totalizar por proveedor
-- —que es lo que pide la sección 9— funciona con autocompletado sobre el
-- historial, y un catálogo que nadie mantiene es peor que un texto. El
-- día que duela, la tabla se agrega sin migrar datos.
-- ------------------------------------------------------------
create table public.expenses (
  id uuid primary key default gen_random_uuid(),

  -- La fecha del comprobante. Distinta del día en que se pagó: una
  -- factura de marzo se paga en abril y los dos datos importan.
  fecha date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  category_id uuid references public.expense_categories (id),
  detail text not null default '',
  amount numeric(14, 2) not null check (amount > 0),
  supplier text not null default '',

  doc_type text not null default 'sin comprobante'
    check (doc_type in ('factura', 'recibo', 'ticket', 'nota de credito',
                        'orden de pago', 'sin comprobante')),
  doc_number text not null default '',

  method text references public.payment_methods (code) on update cascade,
  account_id uuid references public.accounts (id),

  paid_at timestamptz,
  paid_date date,

  status text not null default 'pagado'
    check (status in ('pendiente', 'pagado', 'anulado')),

  -- Array y no tabla puente: son pocas por gasto y el filtro por etiqueta
  -- con un índice GIN alcanza de sobra para el volumen del estudio.
  tags text[] not null default '{}',

  -- Ruta del adjunto. Queda nula mientras gastos_adjunto_habilitado esté
  -- apagado: el módulo sale completo sin depender de Storage.
  receipt_path text,

  notes text not null default '',
  void_reason text not null default '',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),

  -- Un gasto pagado sin cuenta ni fecha sería plata que salió de la nada.
  constraint gasto_pagado_tiene_cuenta_y_fecha
    check (status <> 'pagado' or (account_id is not null and paid_at is not null))
);

create index expenses_fecha_idx on public.expenses (fecha desc);
create index expenses_caja_idx on public.expenses (account_id, paid_date) where status = 'pagado';
create index expenses_categoria_idx on public.expenses (category_id);
create index expenses_proveedor_idx on public.expenses (lower(supplier));
create index expenses_tags_idx on public.expenses using gin (tags);

-- La misma factura cargada dos veces es el error más común de la carga
-- manual. Solo aplica si hay número de comprobante.
create unique index expenses_comprobante_unico
  on public.expenses (lower(supplier), doc_number)
  where doc_number <> '' and status <> 'anulado';

alter table public.expenses enable row level security;

create policy "gastos: ver" on public.expenses for select
  using ((select public.can('gastos.ver')));
create policy "gastos: cargar" on public.expenses for insert
  with check ((select public.can('gastos.cargar')));
-- Los TRES verbos que terminan en un update van en la permisiva, y la
-- restrictiva decide cuál se ejerció. Si acá fuera solo gastos.editar,
-- quien tuviera únicamente gastos.anular no anularía nada: el update no
-- encontraría ninguna permisiva, tocaría cero filas y devolvería
-- error null. Es la falla que la 0019 documenta para reservas.eliminar.
create policy "gastos: escribir" on public.expenses for update
  using (
    (select public.can('gastos.editar'))
    or (select public.can('gastos.anular'))
    or (select public.can('caja.operar'))
  );
-- Sin delete: los gastos se anulan.
create policy "anular exige permiso" on public.expenses as restrictive for update
  using (true)
  with check (status <> 'anulado' or (select public.can('gastos.anular')));

create or replace function public.stamp_expense()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();

  if new.status = 'pagado' then
    new.paid_at := coalesce(new.paid_at, now());
    -- Si no dijeron de qué cuenta salió, la del medio de pago; si el
    -- medio tampoco la tiene, la transitoria. Nunca falla el guardado.
    if new.account_id is null then
      new.account_id := coalesce(
        (select pm.default_account_id from public.payment_methods pm where pm.code = new.method),
        'a0000000-0000-4000-8000-000000000009');
    end if;
  end if;

  -- Misma definición de día que payments desde la 0016: derivada del
  -- instante, en el huso del estudio. No puede ser columna generada
  -- porque 'at time zone' con literal no es inmutable.
  new.paid_date := (new.paid_at at time zone 'America/Argentina/Buenos_Aires')::date;

  if tg_op = 'UPDATE' and old.status = 'anulado' and new.status <> 'anulado' then
    raise exception 'Un gasto anulado no se reactiva: cargá uno nuevo';
  end if;

  return new;
end;
$$;

create trigger expenses_stamp
  before insert or update on public.expenses
  for each row execute function public.stamp_expense();

-- ------------------------------------------------------------
-- 7. LOS MOVIMIENTOS QUE PAYMENTS NO SABE EXPRESAR
--
-- Apertura de una cuenta, transferencias internas (pasar la recaudación
-- al banco, retirar el saldo de Mercado Pago), retiros, aportes,
-- devoluciones y el ajuste que deja el arqueo.
--
-- Una sola fila con las dos puntas en vez de dos filas que hay que
-- mantener apareadas: así una transferencia no se puede desbalancear.
-- ------------------------------------------------------------
create table public.account_movements (
  id uuid primary key default gen_random_uuid(),

  at timestamptz not null default now(),
  dia date,

  kind text not null default 'transferencia'
    check (kind in ('apertura', 'transferencia', 'retiro', 'aporte',
                    'devolucion', 'ajuste')),

  -- Las dos → transferencia interna. Solo destino → entra plata.
  -- Solo origen → sale plata.
  from_account_id uuid references public.accounts (id),
  to_account_id   uuid references public.accounts (id),

  amount numeric(14, 2) not null check (amount > 0),
  concept text not null default '',

  -- Rastro de la devolución de un cobro anulado.
  payment_id uuid references public.payments (id) on delete set null,
  -- Lo escribe el cierre de caja cuando asienta la diferencia del arqueo.
  cash_session_id uuid,

  status text not null default 'vigente' check (status in ('vigente', 'anulado')),
  notes text not null default '',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),

  constraint movimiento_con_alguna_cuenta
    check (from_account_id is not null or to_account_id is not null),
  constraint movimiento_entre_cuentas_distintas
    check (from_account_id is distinct from to_account_id),
  constraint transferencia_tiene_dos_puntas
    check (kind <> 'transferencia'
           or (from_account_id is not null and to_account_id is not null)),
  constraint apertura_solo_entra
    check (kind <> 'apertura' or from_account_id is null)
);

create index account_movements_origen_idx
  on public.account_movements (from_account_id, dia) where status = 'vigente';
create index account_movements_destino_idx
  on public.account_movements (to_account_id, dia) where status = 'vigente';
create index account_movements_at_idx on public.account_movements (at);

alter table public.account_movements enable row level security;

create policy "caja: ver movimientos" on public.account_movements for select
  using ((select public.can('caja.ver')));
create policy "caja: registrar movimiento" on public.account_movements for insert
  with check ((select public.can('caja.operar')));
create policy "caja: anular movimiento" on public.account_movements for update
  using ((select public.can('caja.operar')));
-- Sin delete: RLS habilitada sin política es denegación total. Un
-- movimiento se anula, no se borra.

create or replace function public.stamp_account_movement()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  new.at  := coalesce(new.at, now());
  new.dia := (new.at at time zone 'America/Argentina/Buenos_Aires')::date;
  return new;
end;
$$;

create trigger account_movements_stamp
  before insert or update on public.account_movements
  for each row execute function public.stamp_account_movement();

-- ------------------------------------------------------------
-- 8. EL ARQUEO
--
-- La única tabla del módulo que guarda números derivables, y es a
-- propósito: un arqueo dice lo que se contó ese turno, no lo que la base
-- opina hoy.
--
-- La sesión NO es un contenedor de movimientos: cubre un RANGO DE
-- INSTANTES sobre una cuenta. Dos consecuencias que importan en el
-- mostrador: si se cerró a las 18 y a las 19 aparece una alumna a pagar,
-- el cobro entra igual y cae en el turno siguiente; y si cambia la
-- persona del mostrador se puede cerrar dos veces el mismo día, cada una
-- con su responsable.
-- ------------------------------------------------------------
create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id),

  -- El turno va de un cierre al siguiente. '-infinity' es el primer
  -- cierre de la historia de esa cuenta.
  desde timestamptz not null,
  hasta timestamptz,
  fecha date not null,

  opened_at timestamptz,
  opened_by uuid references auth.users (id),
  closed_at timestamptz,
  closed_by uuid references auth.users (id),

  -- Congelados al cerrar. Derivarlos al leerlos haría que corregir un
  -- cobro viejo reescribiera un arqueo firmado hace tres meses.
  saldo_inicial  numeric(14, 2) not null default 0,
  ingresos       numeric(14, 2) not null default 0,
  egresos        numeric(14, 2) not null default 0,
  saldo_esperado numeric(14, 2) not null default 0,
  saldo_real     numeric(14, 2),
  diferencia numeric(14, 2)
    generated always as (saldo_real - saldo_esperado) stored,

  -- Totales cobrados por medio de pago, del turno. jsonb y no cuatro
  -- columnas: payment_methods es catálogo editable (0011) y el día que el
  -- estudio agregue "Débito", cuatro columnas fijas lo dejan afuera del
  -- arqueo sin avisar.
  totales_por_medio jsonb not null default '{}'::jsonb,

  notas text not null default '',
  created_at timestamptz not null default now()
);

-- Una sola caja abierta por cuenta, garantizado por la base: dos
-- pestañas no pueden abrir dos turnos.
create unique index cash_sessions_una_abierta
  on public.cash_sessions (account_id) where closed_at is null;
create index cash_sessions_fecha_idx on public.cash_sessions (account_id, fecha desc);

alter table public.cash_sessions enable row level security;

create policy "caja: ver arqueos" on public.cash_sessions for select
  using ((select public.can('caja.ver')));
-- Sin políticas de escritura a propósito: el arqueo entra por
-- abrir_caja() / cerrar_caja(), que verifican el permiso adentro. Así
-- nadie escribe un saldo esperado a mano.

alter table public.account_movements
  add constraint account_movements_session_fk
  foreign key (cash_session_id) references public.cash_sessions (id);

-- ------------------------------------------------------------
-- 9. EL LIBRO — una vista, no una tabla
-- ------------------------------------------------------------
create view public.account_ledger
with (security_invoker = on) as
-- Los cobros NO se copian a ningún lado: se leen de payments. Una sola
-- fuente de verdad para la misma plata. Como la vista es
-- security_invoker, quien no tiene finanzas.ver no ve esta pata: el libro
-- hereda el permiso de los pagos en vez de abrir una segunda puerta a los
-- montos.
select 'cobro'::text            as origen,
       p.id                     as ref_id,
       p.account_id,
       p.paid_at                as at,
       p.paid_date              as dia,
       'ingreso'::text          as sentido,
       p.amount                 as monto,
       coalesce(nullif(p.concept, ''), 'Cobro') as concepto,
       p.method                 as medio,
       s.name                   as contraparte,
       p.receipt_number::text   as comprobante
  from public.payments p
  left join public.students s on s.id = p.student_id
 where p.status = 'pagado' and p.account_id is not null and p.paid_at is not null

union all

select 'gasto', g.id, g.account_id, g.paid_at, g.paid_date, 'egreso',
       g.amount,
       coalesce(nullif(g.detail, ''), c.name, 'Gasto'),
       g.method, nullif(g.supplier, ''), nullif(g.doc_number, '')
  from public.expenses g
  left join public.expense_categories c on c.id = g.category_id
 where g.status = 'pagado' and g.account_id is not null

union all

-- Pata de salida del movimiento manual.
select 'movimiento', m.id, m.from_account_id, m.at, m.dia, 'egreso',
       m.amount, coalesce(nullif(m.concept, ''), m.kind), null, null, null
  from public.account_movements m
 where m.status = 'vigente' and m.from_account_id is not null

union all

-- Pata de entrada. Una transferencia interna aparece en las dos y por eso
-- no mueve el saldo total del estudio: solo cambia de bolsillo.
select 'movimiento', m.id, m.to_account_id, m.at, m.dia, 'ingreso',
       m.amount, coalesce(nullif(m.concept, ''), m.kind), null, null, null
  from public.account_movements m
 where m.status = 'vigente' and m.to_account_id is not null;

-- El saldo de una cuenta: la suma del libro, sin caché.
--
-- SECURITY INVOKER a propósito. Una función SECURITY DEFINER sobre una
-- vista security_invoker pierde la RLS de abajo (adentro del DEFINER el
-- usuario es el dueño de las tablas), así que "la caja hereda
-- finanzas.ver" dejaría de ser cierto en cuanto alguien la consultara
-- desde una función del módulo.
create or replace function public.saldo_cuenta(
  p_account uuid,
  p_hasta timestamptz default null
)
returns numeric
language sql stable security invoker
as $$
  select coalesce(sum(case when l.sentido = 'ingreso' then l.monto else -l.monto end), 0)::numeric(14, 2)
    from public.account_ledger l
   where l.account_id = p_account
     and (p_hasta is null or l.at <= p_hasta);
$$;

revoke all on function public.saldo_cuenta(uuid, timestamptz) from public, anon;
grant execute on function public.saldo_cuenta(uuid, timestamptz) to authenticated;

-- Saldos actuales por cuenta: lo que pide el tablero (sección 7).
--
-- ve_cobros / ve_gastos son la defensa contra el número plausible y
-- equivocado: con security_invoker, a quien le falta gastos.ver la pata
-- de egresos le devuelve cero filas y el saldo le queda MÁS ALTO, no en
-- cero. La pantalla mira estas dos columnas y apaga la tarjeta en vez de
-- mostrar un número que miente.
create view public.account_balances
with (security_invoker = on) as
select a.id as account_id, a.name, a.kind, a.arquea, a.active, a.is_system,
       a.sort_order,
       coalesce(sum(case when l.sentido = 'ingreso' then l.monto else -l.monto end), 0)::numeric(14, 2) as saldo,
       max(l.at) as ultimo_movimiento,
       count(l.ref_id) as movimientos,
       (select public.can('finanzas.ver')) as ve_cobros,
       (select public.can('gastos.ver'))   as ve_gastos
  from public.accounts a
  left join public.account_ledger l on l.account_id = a.id
 group by a.id, a.name, a.kind, a.arquea, a.active, a.is_system, a.sort_order;

-- Ingresos, egresos y neto por cuenta y por día: lo que lee la pantalla
-- de caja. Agrupa por 'dia', que es columna de agrupación, así el filtro
-- por fecha llega hasta los índices parciales de las tres patas.
create view public.caja_dia
with (security_invoker = on) as
select l.account_id,
       l.dia,
       coalesce(sum(l.monto) filter (where l.sentido = 'ingreso'), 0)::numeric(14, 2) as ingresos,
       coalesce(sum(l.monto) filter (where l.sentido = 'egreso'),  0)::numeric(14, 2) as egresos,
       coalesce(sum(case when l.sentido = 'ingreso' then l.monto else -l.monto end), 0)::numeric(14, 2) as neto,
       count(*) as movimientos,
       (select public.can('finanzas.ver')) as ve_cobros,
       (select public.can('gastos.ver'))   as ve_gastos
  from public.account_ledger l
 group by l.account_id, l.dia;

-- Los totales por medio de pago EN MONTO, por día y por mes: lo que pide
-- la sección 8 para el cierre y la sección 7 para el tablero. Sale de
-- payments y no de la caja, porque una transferencia se cobra pero no
-- pasa por ningún cajón.
create view public.cobros_por_medio
with (security_invoker = on) as
select p.paid_date as dia,
       to_char(p.paid_date, 'YYYY-MM') as mes,
       coalesce(p.method, 'sin_medio') as medio,
       coalesce(pm.name, 'Sin medio')  as medio_nombre,
       sum(p.amount)::numeric(14, 2)   as monto,
       count(*)                        as cantidad
  from public.payments p
  left join public.payment_methods pm on pm.code = p.method
 where p.status = 'pagado' and p.paid_date is not null
 group by 1, 2, 3, 4;

-- Ingresos, egresos y resultado neto por mes: el número que le falta al
-- tablero. Hermana de monthly_revenue, con la misma definición de mes
-- (0016) para que las dos den lo mismo. Las dos lecturas de egresos
-- conviven; cuál se muestra lo decide tablero_resultado_base.
create view public.resultado_mensual
with (security_invoker = on) as
with meses as (
  select to_char(paid_date, 'YYYY-MM') as mes, sum(amount) as ingresos,
         0::numeric as egresos_pagados, 0::numeric as egresos_devengados
    from public.payments where status = 'pagado' and paid_date is not null
   group by 1
  union all
  select to_char(paid_date, 'YYYY-MM'), 0, sum(amount), 0
    from public.expenses where status = 'pagado' and paid_date is not null
   group by 1
  union all
  select to_char(fecha, 'YYYY-MM'), 0, 0, sum(amount)
    from public.expenses where status in ('pendiente', 'pagado')
   group by 1
)
select mes,
       sum(ingresos)::numeric(14, 2)           as ingresos,
       sum(egresos_pagados)::numeric(14, 2)    as egresos_pagados,
       sum(egresos_devengados)::numeric(14, 2) as egresos_devengados,
       (sum(ingresos) - sum(egresos_pagados))::numeric(14, 2) as neto,
       (select public.can('finanzas.ver')) as ve_ingresos,
       (select public.can('gastos.ver'))   as ve_egresos
  from meses
 group by mes
 order by mes;

-- ------------------------------------------------------------
-- 10. ABRIR Y CERRAR
--
-- El cierre tiene que llevar menos de un minuto: la pantalla llega con el
-- saldo inicial, los ingresos, los egresos y el esperado ya calculados, y
-- la encargada escribe UN número, cuánto contó.
--
-- SECURITY DEFINER con los permisos verificados arriba de todo, y los
-- TRES que hacen falta: cerrar la caja, ver los cobros y ver los gastos.
-- Quien no puede ver los egresos no puede calcular un esperado — le daría
-- de más y la caja "no cerraría" todos los días por un permiso.
-- ------------------------------------------------------------
create or replace function public.abrir_caja(p_account uuid)
returns public.cash_sessions
language plpgsql security definer set search_path = ''
as $$
declare
  v_ses public.cash_sessions;
  v_desde timestamptz;
begin
  if not public.can('caja.operar') then
    raise exception 'No tenés permiso para abrir la caja';
  end if;
  -- Arquear una cuenta bancaria no significa nada: nadie la cuenta con la
  -- mano. Conciliar el banco contra su resumen es otro trabajo y todavía
  -- no existe.
  if not exists (select 1 from public.accounts a
                  where a.id = p_account and a.arquea and a.active) then
    raise exception 'Esa cuenta no se arquea: la caja diaria es para la plata que se cuenta';
  end if;

  select * into v_ses from public.cash_sessions
   where account_id = p_account and closed_at is null;
  if found then
    return v_ses;
  end if;

  select coalesce(max(s.hasta), '-infinity'::timestamptz) into v_desde
    from public.cash_sessions s where s.account_id = p_account;

  insert into public.cash_sessions (account_id, desde, fecha, opened_at, opened_by)
  values (p_account, v_desde,
          (now() at time zone 'America/Argentina/Buenos_Aires')::date,
          now(), auth.uid())
  returning * into v_ses;

  return v_ses;
end;
$$;

create or replace function public.cerrar_caja(
  p_account uuid,
  p_saldo_real numeric,
  p_notas text default ''
)
returns public.cash_sessions
language plpgsql security definer set search_path = ''
as $$
declare
  v_ses    public.cash_sessions;
  v_desde  timestamptz;
  v_hasta  timestamptz := now();
  v_ini    numeric(14, 2);
  v_in     numeric(14, 2);
  v_out    numeric(14, 2);
  v_esp    numeric(14, 2);
  v_med    jsonb;
  v_tol    numeric;
  v_exige  boolean;
begin
  if not public.can('caja.cerrar') then
    raise exception 'No tenés permiso para cerrar la caja';
  end if;
  -- Adentro de un SECURITY DEFINER la RLS de payments y expenses no corre:
  -- el permiso se exige acá y no se hereda de la vista.
  if not public.can('finanzas.ver') or not public.can('gastos.ver') then
    raise exception 'Para cerrar la caja hace falta ver los cobros y los gastos: el esperado se calcula con los dos';
  end if;

  if not exists (select 1 from public.accounts a
                  where a.id = p_account and a.arquea and a.active) then
    raise exception 'Esa cuenta no se arquea: la caja diaria es para la plata que se cuenta';
  end if;

  v_tol   := coalesce(nullif(public.param('caja_diferencia_tolerada', '0'), '')::numeric, 0);
  v_exige := public.param('caja_exige_motivo_diferencia', 'true') = 'true';

  -- Si nadie abrió la caja, el cierre la crea: olvidarse de abrir no
  -- puede ser un motivo para no poder cerrar.
  select * into v_ses from public.cash_sessions
   where account_id = p_account and closed_at is null
   for update;

  if not found then
    select coalesce(max(s.hasta), '-infinity'::timestamptz) into v_desde
      from public.cash_sessions s where s.account_id = p_account;
    insert into public.cash_sessions (account_id, desde, fecha, opened_at, opened_by)
    values (p_account, v_desde,
            (v_hasta at time zone 'America/Argentina/Buenos_Aires')::date,
            v_hasta, auth.uid())
    returning * into v_ses;
  end if;

  v_desde := v_ses.desde;

  select coalesce(sum(l.monto) filter (where l.sentido = 'ingreso'), 0),
         coalesce(sum(l.monto) filter (where l.sentido = 'egreso'),  0)
    into v_in, v_out
    from public.account_ledger l
   where l.account_id = p_account and l.at > v_desde and l.at <= v_hasta;

  v_ini := case when v_desde = '-infinity'::timestamptz then 0
                else public.saldo_cuenta(p_account, v_desde) end;
  v_esp := v_ini + v_in - v_out;

  if p_saldo_real is null then
    raise exception 'Falta el saldo contado: el cierre declara lo que se contó, no lo que el sistema esperaba';
  end if;
  if v_exige and abs(p_saldo_real - v_esp) > v_tol and coalesce(nullif(p_notas, ''), '') = '' then
    raise exception 'La diferencia es de % y hace falta un motivo', (p_saldo_real - v_esp);
  end if;

  -- Los totales por medio son de TODOS los cobros del turno, no solo de
  -- los de esta cuenta: lo que pide la sección 8 es cuánto se cobró en
  -- efectivo, transferencia y tarjeta, y la transferencia no pasa por el
  -- cajón.
  select coalesce(jsonb_object_agg(t.medio, t.monto), '{}'::jsonb) into v_med
    from (select coalesce(p.method, 'sin_medio') as medio, sum(p.amount) as monto
            from public.payments p
           where p.status = 'pagado'
             and p.paid_at > v_desde and p.paid_at <= v_hasta
           group by 1) t;

  update public.cash_sessions
     set hasta = v_hasta,
         fecha = (v_hasta at time zone 'America/Argentina/Buenos_Aires')::date,
         closed_at = v_hasta,
         closed_by = auth.uid(),
         saldo_inicial = v_ini,
         ingresos = v_in,
         egresos = v_out,
         saldo_esperado = v_esp,
         saldo_real = p_saldo_real,
         totales_por_medio = v_med,
         notas = p_notas
   where id = v_ses.id
  returning * into v_ses;

  -- LA LÍNEA QUE HACE QUE LOS SALDOS CIERREN SIEMPRE. La diferencia del
  -- arqueo se asienta como movimiento, así el saldo del sistema queda
  -- igual a la plata contada sin ningún ancla escondida y sin ningún
  -- campo "saldo" editable. Si mañana aparece un faltante, quedó
  -- registrado acá con su fecha, su responsable y su motivo.
  if p_saldo_real <> v_esp then
    insert into public.account_movements
      (at, kind, from_account_id, to_account_id, amount, concept,
       cash_session_id, created_by)
    values (
      v_hasta, 'ajuste',
      case when p_saldo_real < v_esp then p_account else null end,
      case when p_saldo_real > v_esp then p_account else null end,
      abs(p_saldo_real - v_esp),
      case when p_saldo_real < v_esp then 'Faltante de arqueo' else 'Sobrante de arqueo' end
        || case when p_notas = '' then '' else ': ' || p_notas end,
      v_ses.id, auth.uid());
  end if;

  return v_ses;
end;
$$;

-- Reabrir es una operación de excepción y por eso tiene su propia clave:
-- es para el cero de más al tipear el contado, no para retocar la
-- historia. El ajuste que había dejado el cierre se anula, no se borra.
create or replace function public.reabrir_caja(p_session uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.can('caja.reabrir') then
    raise exception 'No tenés permiso para reabrir un arqueo cerrado';
  end if;

  -- Reabrir el turno anterior cuando ya hay uno abierto dejaría dos cajas
  -- abiertas sobre la misma cuenta, que es lo único que el modelo no sabe
  -- resolver. Se avisa con palabras, no con una violación de índice.
  if exists (select 1 from public.cash_sessions s
              join public.cash_sessions o on o.account_id = s.account_id
             where s.id = p_session and o.closed_at is null) then
    raise exception 'Esa cuenta ya tiene un turno abierto: cerralo antes de reabrir el anterior';
  end if;

  update public.account_movements
     set status = 'anulado', notes = 'Anulado al reabrir el arqueo'
   where cash_session_id = p_session and kind = 'ajuste' and status = 'vigente';

  update public.cash_sessions
     set closed_at = null, closed_by = null, hasta = null,
         saldo_real = null, totales_por_medio = '{}'::jsonb
   where id = p_session;
end;
$$;

revoke all on function public.abrir_caja(uuid) from public, anon;
revoke all on function public.cerrar_caja(uuid, numeric, text) from public, anon;
revoke all on function public.reabrir_caja(uuid) from public, anon;
grant execute on function public.abrir_caja(uuid) to authenticated;
grant execute on function public.cerrar_caja(uuid, numeric, text) to authenticated;
grant execute on function public.reabrir_caja(uuid) to authenticated;

-- ------------------------------------------------------------
-- 11. EL DÍA ARQUEADO NO SE RETOCA
--
-- Sin esto, corregir el monto de un cobro de un turno ya cerrado deja el
-- arqueo firmado diciendo una cosa y la base otra, sin ningún aviso.
--
-- Lo que SÍ se deja pasar: anular. Anular un comprobante viejo es
-- legítimo; el efecto queda listado en caja_control() y lo que haya que
-- devolver se registra como movimiento de HOY, que es exactamente lo que
-- se haría con el cuaderno.
--
-- Es el único control del módulo que toca el camino caliente del cobro.
-- Por eso: es inerte mientras nadie cierre una caja, deja pasar todo lo
-- que no tenga cuenta e instante (un pago pendiente que se acredita), y
-- se apaga sin deploy con caja_bloquea_dia_cerrado.
-- ------------------------------------------------------------
create or replace function public.guard_dia_cerrado()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if public.param('caja_bloquea_dia_cerrado', 'true') <> 'true' then
    return new;
  end if;
  if old.account_id is null or old.paid_at is null then
    return new;
  end if;

  -- Anular siempre se puede, mientras no cambie el monto ni la cuenta.
  if new.status = 'anulado' and old.status <> 'anulado'
     and new.amount = old.amount
     and new.account_id is not distinct from old.account_id then
    return new;
  end if;

  if (new.amount is distinct from old.amount
      or new.method is distinct from old.method
      or new.account_id is distinct from old.account_id
      or new.paid_at is distinct from old.paid_at
      or new.status is distinct from old.status)
     and exists (select 1 from public.cash_sessions s
                  where s.account_id = old.account_id
                    and s.closed_at is not null
                    and old.paid_at > s.desde and old.paid_at <= s.hasta) then
    raise exception 'Ese movimiento entró en un arqueo ya cerrado y no se puede modificar. Registrá el ajuste en la caja de hoy.';
  end if;

  return new;
end;
$$;

create trigger payments_dia_cerrado
  before update on public.payments
  for each row execute function public.guard_dia_cerrado();

create trigger expenses_dia_cerrado
  before update on public.expenses
  for each row execute function public.guard_dia_cerrado();

-- ------------------------------------------------------------
-- 12. LA PRUEBA DE QUE LOS SALDOS CIERRAN
--
-- Gemela de perm_diff(): TIENE QUE DAR CERO FILAS. Cualquier fila es un
-- saldo que dejó de ser explicable. Se mira antes de cada release y
-- después de cualquier anulación de un día viejo.
--
-- Lo que NO es un problema y por eso no está en la lista: que la cuenta
-- "A imputar" tenga saldo. Eso no es un error del sistema, es trabajo
-- pendiente de alguien, y tiene su propia tarjeta en la pantalla.
-- ------------------------------------------------------------
create or replace function public.caja_control()
returns table (problema text, cuenta text, referencia text, monto numeric)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.can('caja.ver') then
    raise exception 'No tenés permiso para auditar la caja';
  end if;

  return query
  -- 1. Un cobro cobrado que no cayó en ninguna cuenta: no puede pasar
  --    (el disparador lo imputa), y si pasa, el libro tiene un agujero.
  select 'cobro sin cuenta'::text, '—'::text, p.id::text, p.amount
    from public.payments p
   where p.status = 'pagado' and p.account_id is null
  union all
  -- 2. Un arqueo firmado que ya no coincide con el libro: pasó cuando
  --    alguien anuló un cobro de un turno cerrado. No es un error, es lo
  --    que hay que poder explicar.
  select 'arqueo desactualizado', a.name, s.id::text,
         s.saldo_esperado - (s.saldo_inicial + coalesce((
           select sum(case when l.sentido = 'ingreso' then l.monto else -l.monto end)
             from public.account_ledger l
            where l.account_id = s.account_id
              and l.at > s.desde and l.at <= s.hasta), 0))
    from public.cash_sessions s
    join public.accounts a on a.id = s.account_id
   where s.closed_at is not null
     and s.saldo_esperado <> (s.saldo_inicial + coalesce((
           select sum(case when l.sentido = 'ingreso' then l.monto else -l.monto end)
             from public.account_ledger l
            where l.account_id = s.account_id
              and l.at > s.desde and l.at <= s.hasta), 0))
  union all
  -- 3. Un medio de pago activo sin cuenta: sus cobros van a "A imputar".
  select 'medio de pago sin cuenta', '—', pm.code, 0::numeric
    from public.payment_methods pm
   where pm.active and pm.default_account_id is null
  union all
  -- 4. Plata en una cuenta dada de baja.
  select 'cuenta inactiva con saldo', b.name, b.account_id::text, b.saldo
    from public.account_balances b
   where not b.active and b.saldo <> 0;
end;
$$;

revoke all on function public.caja_control() from public, anon;
grant execute on function public.caja_control() to authenticated;

-- ------------------------------------------------------------
-- 13. AVISOS DE CAJA — solo el CHECK, todavía no el cron
--
-- Se amplía acá porque el orden correcto es el de la 0010: primero el
-- CHECK, después quien emite. NADA emite estos tipos todavía, y hay un
-- motivo: la campana resuelve el icono con un objeto de cinco claves
-- escritas a mano (notifications-bell.tsx) y un tipo desconocido deja el
-- icono en undefined, que en React es la campana entera caída. Ese
-- fallback se arregla antes de emitir el primer aviso de caja —y de paso
-- se arregla 'membresia_renovada', que ya está en esa situación desde la
-- 0010 y todavía no se notó.
-- ------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'pago_acreditado', 'nuevo_alumno',
  'membresia_por_vencer', 'membresia_vencida', 'deuda_vencida',
  'membresia_renovada',
  'caja_sin_cerrar', 'caja_diferencia', 'saldo_sin_imputar'
));

-- ------------------------------------------------------------
-- 14. PERMISOS
--
-- Las siete claves del módulo existen desde la 0012 como 'futuro' con
-- ayuda que dice "MÓDULO FUTURO" — y ese texto es el que la pantalla
-- muestra al abrir el permiso. Se actualiza, no solo el tipo.
--
-- DECISIÓN QUE HAY QUE TOMAR EXPLÍCITAMENTE: legacy_roles queda en '{}'.
-- legacy_roles es "lo que el sistema respondía ANTES del motor", y antes
-- del motor este módulo no existía. Usarlo como preset tendría dos
-- consecuencias feas: perm_diff() se rompería para siempre en cuanto la
-- clienta destildara legítimamente un permiso desde la pantalla, y el
-- interruptor de emergencia (que responde legacy_roles) le devolvería a
-- recepción permisos de caja que alguien le sacó a propósito. El preset
-- va donde corresponde: en role_permissions.
--
-- Y como el módulo es nuevo, no hay comportamiento previo que preservar:
-- las claves van directo a 'activo' con la matriz ya cargada. En sombra
-- responderían '{}' y no entraría nadie, ni el admin.
-- ------------------------------------------------------------
update public.permission_keys set
  tipo = 'permiso',
  legacy_roles = '{}',
  ayuda = case clave
    when 'gastos.ver'    then 'Ver el listado de gastos, sus montos y los totales por período, categoría y proveedor.'
    when 'gastos.cargar' then 'Cargar un gasto nuevo. No incluye modificar ni anular los ya cargados.'
    when 'gastos.editar' then 'Modificar un gasto ya cargado y administrar el catálogo de categorías. No va con catalogos.editar a propósito: renombrar una categoría reescribe la lectura de todos los totales históricos.'
    when 'gastos.anular' then 'Anular un gasto. Es definitivo y deja el registro tachado: el sistema no borra.'
    when 'caja.ver'      then 'Ver la caja, las cuentas, los saldos y el historial de movimientos. Los montos de los COBROS los sigue gobernando finanzas.ver: sin esa clave, la caja se ve incompleta y la pantalla lo avisa en vez de mostrar un saldo equivocado.'
    when 'caja.operar'   then 'Abrir la caja y registrar movimientos: transferencias entre cuentas, retiros, aportes y devoluciones.'
    when 'caja.cerrar'   then 'Cerrar la caja declarando lo contado. Exige además ver cobros y gastos, porque el esperado se calcula con los dos.'
    else ayuda end
where clave in ('gastos.ver', 'gastos.cargar', 'gastos.editar', 'gastos.anular',
                'caja.ver', 'caja.operar', 'caja.cerrar');

-- reportes.ver se queda en 'futuro': ninguna política de este módulo la
-- consume, y una clave tildable que no hace nada es peor que un candado.

insert into public.permission_keys (clave, etiqueta, ayuda, grupo, orden, tipo, legacy_roles) values
  ('caja.cuentas', 'Administrar cuentas y cajas',
   'Crear y editar cajas, cuentas bancarias y billeteras, y decidir a qué cuenta va cada medio de pago. Es configuración financiera, no operación de mostrador.',
   'Caja', 40, 'permiso', '{}'),
  ('caja.reabrir', 'Reabrir un arqueo cerrado',
   'Para el cero de más al tipear lo contado. Anula el ajuste que había dejado el cierre y deja el turno abierto otra vez; queda registrado.',
   'Caja', 50, 'permiso', '{}')
on conflict (clave) do nothing;

-- La matriz. Las dos escrituras —claves y matriz— van juntas en la misma
-- migración, siempre: tocar una sin la otra es lo que rompe perm_diff().
delete from public.role_permissions
 where clave in ('gastos.ver', 'gastos.cargar', 'gastos.editar', 'gastos.anular',
                 'caja.ver', 'caja.operar', 'caja.cerrar', 'caja.cuentas', 'caja.reabrir');

insert into public.role_permissions (role, clave) values
  ('admin', 'gastos.ver'), ('admin', 'gastos.cargar'), ('admin', 'gastos.editar'),
  ('admin', 'gastos.anular'), ('admin', 'caja.ver'), ('admin', 'caja.operar'),
  ('admin', 'caja.cerrar'), ('admin', 'caja.cuentas'), ('admin', 'caja.reabrir'),
  -- Recepción es la encargada que cobra, carga los gastos y cierra la
  -- caja. Sin esto, el módulo nace para una sola persona.
  ('recepcion', 'gastos.ver'), ('recepcion', 'gastos.cargar'), ('recepcion', 'gastos.editar'),
  ('recepcion', 'caja.ver'), ('recepcion', 'caja.operar'), ('recepcion', 'caja.cerrar')
on conflict do nothing;

update public.permission_keys set enforce_mode = 'activo'
 where clave in ('gastos.ver', 'gastos.cargar', 'gastos.editar', 'gastos.anular',
                 'caja.ver', 'caja.operar', 'caja.cerrar', 'caja.cuentas', 'caja.reabrir');

-- perm_diff() comparaba legacy_roles contra role_permissions para TODAS
-- las claves, sin mirar el modo. Eso funcionaba mientras nadie hubiera
-- tocado la matriz: el primer destildado legítimo desde la pantalla la
-- rompía para siempre y la red de seguridad del motor pasaba a dar falsos
-- positivos hasta que se dejara de mirar. La invariante que importa es la
-- otra: que una clave TODAVÍA EN SOMBRA responda exactamente el legado.
create or replace function public.perm_diff()
returns table (rol text, clave text, legado boolean, motor boolean)
language sql stable security definer set search_path = ''
as $$
  select r.rol,
         k.clave,
         r.rol = any(k.legacy_roles),
         exists (select 1 from public.role_permissions rp
                 where rp.role = r.rol and rp.clave = k.clave)
  from (values ('admin'), ('recepcion'), ('profesor'), ('alumno')) as r(rol)
  cross join public.permission_keys k
  where k.enforce_mode = 'sombra'
    and (r.rol = any(k.legacy_roles))
        is distinct from
        exists (select 1 from public.role_permissions rp
                where rp.role = r.rol and rp.clave = k.clave)
$$;

-- Trampa latente que se cierra de paso: la permisiva de UPDATE de
-- payments solo mira pagos.editar, así que quien tuviera pagos.anular sin
-- pagos.editar no anularía nada y el update devolvería error null. Hoy no
-- se nota porque las dos claves comparten preset; el día que se separen,
-- sí. Es la misma falla que la 0019 documenta para reservas.eliminar.
drop policy if exists "pagos: editar" on public.payments;
create policy "pagos: escribir" on public.payments for update
  using (
    (select public.can('pagos.editar'))
    or (select public.can('pagos.anular'))
  );

-- Cuentas y movimientos entran al paquete de datos como colecciones
-- propias: la pantalla tiene que poder decir "no tenés acceso" en vez de
-- mostrar un $0. (El mapa CLAVE_POR_COLECCION de lib/api.ts se completa
-- del lado del código.)

commit;

-- ============================================================
-- CÓMO VERIFICAR (no ejecutar acá)
--
-- 1. Los permisos no se movieron solos:
--      select * from public.perm_diff();            → cero filas
--      select * from public.caja_control();         → cero filas
--    Y con una sesión de recepción:
--      select public.mis_permisos();                → trae caja.* y gastos.*
--
-- 2. El cobro no cambió: cobrar en efectivo desde el mostrador y
--      select account_id, paid_date from public.payments order by paid_at desc limit 1;
--    tiene que traer la Caja del mostrador. Cobrar por Mercado Pago (con
--    un pago real, para que dispare el webhook) tiene que caer en la
--    cuenta Mercado Pago y NO en el cajón.
--
-- 3. El arqueo:
--      select public.abrir_caja('a0000000-0000-4000-8000-000000000001');
--      -- cobrar dos veces y cargar un gasto en efectivo
--      select * from public.cerrar_caja('a0000000-0000-4000-8000-000000000001', 12345.00, 'faltó el vuelto');
--    El saldo de la cuenta tiene que quedar EXACTAMENTE en 12345.00:
--      select saldo from public.account_balances where account_id = 'a0000000-0000-4000-8000-000000000001';
--    y la diferencia tiene que estar asentada como movimiento 'ajuste'.
--
-- 4. El día cerrado: intentar cambiarle el monto a uno de esos cobros
--    tiene que fallar con el mensaje del control; anularlo tiene que
--    dejarlo pasar y aparecer en caja_control() como arqueo
--    desactualizado.
--
-- 5. Con una sesión de profesora: la caja, las cuentas y los gastos
--    devuelven cero filas.
-- ============================================================

-- ============================================================
-- VUELTA ATRÁS
--
-- begin;
--   drop trigger if exists payments_dia_cerrado on public.payments;
--   drop trigger if exists expenses_dia_cerrado on public.expenses;
--   drop trigger if exists payments_imputar_cuenta on public.payments;
--   drop trigger if exists payments_sella_cobrador on public.payments;
--   drop trigger if exists payment_methods_guard_cuenta on public.payment_methods;
--
--   update public.permission_keys set enforce_mode = 'sombra', tipo = 'futuro'
--    where clave in ('gastos.ver','gastos.cargar','gastos.editar','gastos.anular',
--                    'caja.ver','caja.operar','caja.cerrar');
--
--   drop policy if exists "pagos: escribir" on public.payments;
--   create policy "pagos: editar" on public.payments for update
--     using ((select public.can('pagos.editar')));
--
--   drop policy if exists "parametros de control: solo admin" on public.studio_settings;
--
--   drop view if exists public.resultado_mensual;
--   drop view if exists public.cobros_por_medio;
--   drop view if exists public.caja_dia;
--   drop view if exists public.account_balances;
--   drop function if exists public.saldo_cuenta(uuid, timestamptz);
--   drop view if exists public.account_ledger;
--
--   drop function if exists public.caja_control();
--   drop function if exists public.reabrir_caja(uuid);
--   drop function if exists public.cerrar_caja(uuid, numeric, text);
--   drop function if exists public.abrir_caja(uuid);
--
--   drop table if exists public.account_movements;
--   drop table if exists public.cash_sessions;
--   drop table if exists public.expenses;
--   drop table if exists public.expense_categories;
--   drop table if exists public.payment_staff;
--
--   alter table public.payments drop column if exists account_id;
--   alter table public.payment_methods
--     drop column if exists default_account_id,
--     drop column if exists liquidacion;
--   drop table if exists public.accounts;
--
--   delete from public.studio_settings where group_key in ('caja','gastos');
--   alter table public.studio_settings drop column if exists solo_admin;
-- commit;
--
-- La vuelta atrás NO revierte perm_diff(): la definición nueva es
-- estrictamente mejor que la vieja y no depende de este módulo.
-- ============================================================