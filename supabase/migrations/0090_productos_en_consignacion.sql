-- ============================================================
-- 0090 — Productos en consignación: venderlos, llevar el stock y
--        rendirle al proveedor
--
-- EL PEDIDO (el estudio, vía Matías, 04/10)
--
-- El estudio vende difusores y sprays que no compra: los deja un
-- proveedor en consignación. De cada venta el 30% es del estudio y el 70%
-- del proveedor, y hace falta saber cuánto se le debe. Al vender hay que
-- escribir el aroma. Cada producto tiene un precio por medio de pago
-- —Difusor: efectivo $30.000, transferencia $31.500, 3 cuotas $37.500;
-- Spray: $18.500, $19.500 y $23.200—, fijo por producto y NO derivado de
-- los ajustes del medio (−5% / +25%), que son para las cuotas.
--
-- Decisiones de negocio ya tomadas:
--   · El % del estudio se calcula SOBRE LO COBRADO: en 3 cuotas ($37.500)
--     el estudio se queda $11.250 y el proveedor $26.250. La comisión de
--     la tarjeta la absorbe el estudio.
--   · El % se configura por proveedor (30 por defecto): es un número, y
--     los números se configuran desde el sistema.
--   · El stock es por producto, no por aroma. El aroma es texto
--     obligatorio y queda escrito en la venta y en la rendición.
--   · Recepción vende. Cargar productos, precios, stock y proveedores,
--     anular ventas y pagarle al proveedor: sólo admin. Configurable
--     después desde Permisos.
--
-- CÓMO ENTRA LA PLATA, Y POR QUÉ ASÍ
--
-- Tabla propia (`ventas_productos`) y una quinta rama 'venta' en
-- `account_ledger`. La caja entera sale de ese libro —saldo_cuenta,
-- account_balances, caja_dia, cerrar_caja, caja_control y el turno de la
-- pantalla Caja—, así que una venta en efectivo suma en "Caja del
-- mostrador" y cuadra en el cierre sin tocar ninguna de esas funciones.
-- Además suma en `resultado_mensual` y `monthly_revenue`, las dos vistas
-- hermanas de ingresos del mes (la 0020 dice que tienen que dar lo mismo).
--
-- Se descartaron las otras dos puertas:
--   · Una fila en `payments`: `student_id` es NOT NULL (0001), la venta se
--     podría anular desde Pagos con `pagos.anular` —que recepción tiene—
--     sin devolver el stock, la clienta lee sus pagos, dispara el aviso
--     "pagó $…" y mezcla el 70% ajeno con "Cobrado".
--   · `account_movements`: no entra al resultado del mes, su CHECK de
--     `kind` obligaría a mentir, no tiene medio ni lugar para el aroma, y
--     recepción lo edita directo, sin la guarda del turno cerrado.
--
-- La venta entra entera como ingreso. Cuando se le paga al proveedor, su
-- parte sale como GASTO en "Rendiciones a proveedores" (el mismo patrón
-- que `pagar_liquidacion`, 0054). En qué mes cae ese gasto depende de la
-- base del resultado (Configuración): "devengado" mira la fecha del
-- comprobante, que es la de la última venta rendida, así que el mes de
-- las ventas queda con el 30% aunque se rinda al mes siguiente; "por lo
-- pagado" mira el día en que salió la plata, así que si se rinde en
-- octubre lo de septiembre, septiembre muestra el 100% como ingreso y
-- octubre el 70% como egreso. Entre la venta y la rendición el resultado
-- incluye lo que se le debe; Productos lo muestra como "Falta rendir".
--
-- LO QUE SE TOCA DE LO QUE YA EXISTE, Y CÓMO SE PRUEBA QUE NO SE MUEVE UN PESO
--
--   · `account_ledger` (viva = 0075), `resultado_mensual` (0020) y
--     `monthly_revenue` (0016): se recrean con la rama de las ventas al
--     final. Antes de pisarlas se compara su definición viva con la del
--     repo, deparseadas por el mismo servidor (producción no siempre
--     coincide con el repo): si no es ninguna conocida, corta y pide la
--     definición. Se saca una foto de las tres ANTES, y después de
--     recrearlas se exige que den exactamente las mismas filas (`except
--     all` en los dos sentidos). Hoy no hay ventas, así que cualquier
--     diferencia es un error y no se aplica nada.
--   · Un disparador nuevo sobre `expenses`, `expenses_rendicion_fija`:
--     un gasto que es el pago de una rendición no cambia de monto ni pasa
--     a pendiente (sólo se anula). Recepción tiene `gastos.editar` y el
--     formulario de Gastos reescribe el monto al guardar; sin esto las
--     ventas quedarían "rendidas" por una plata que no es la que salió.
--     Para cualquier otro gasto la primera línea lo deja pasar, y hoy no
--     existe ningún gasto de rendición.
--   · `guard_dia_cerrado()` NO se modifica: se le cuelga un disparador
--     sobre `ventas_productos`, que usa a propósito los mismos nombres de
--     columna que `payments`. Se comprueba la huella de su cuerpo vivo.
--
-- CAMBIO VISIBLE QUE HAY QUE AVISAR: "Ingresos {mes}" y "Evolución de
-- ingresos" de la pantalla Pagos, y "Ingresos" / "Resultado" del tablero,
-- salen de `monthly_revenue` / `resultado_mensual` y van a incluir lo
-- vendido en productos (en bruto), para quien tiene finanzas.ver (la
-- misma clave que ya gobierna esas dos vistas). La lista de Pagos,
-- "Cobrado hoy", el cierre por medio y los reportes de cobros siguen
-- siendo sólo cobros a clientes.
--
-- PERMISOS
--
-- Las claves `inventario.ver` y `inventario.gestionar` existen desde la
-- 0012 como 'futuro'; se suman `inventario.vender`, `inventario.anular`
-- e `inventario.rendir`. Las cinco nacen encendidas ('activo') con el
-- legado igual a la matriz: así el freno de mano (modo emergencia) no le
-- saca la venta al mostrador (el criterio de la 0087). `ver_costos`
-- queda como está —en consignación no hay costo— y sólo cambia su ayuda.
-- Orden: primero el tipo, después la matriz, después el encendido.
-- `perm_diff()` no puede sumar ni una fila: se saca una foto al empezar
-- y se compara al final.
--
-- PRODUCTOS DE ARRANQUE
--
-- Se siembran Difusor y Spray con los precios que dio el estudio ("3
-- cuotas" = medio Tarjeta; las dos transferencias, el mismo precio), con
-- stock 0 y SIN proveedor: no se venden hasta que el admin cargue el
-- proveedor real y la mercadería. Es a propósito: inventar un proveedor
-- sería dejar un nombre falso en cada rendición.
--
-- EL FRENO DE MANO, si algo sale mal y hay gente esperando:
--   update public.permission_config set value = 'emergencia' where key = 'modo';
-- Y para apagar sólo el módulo, ver PARA VOLVER ATRÁS al pie (NIVEL 1:
-- matriz y legado, las dos cosas, o el freno de mano lo vuelve a prender).
--
-- Ejecutar completo en el SQL Editor. REQUIERE 0012-0014, 0020, 0074,
-- 0075, 0084, 0089. Antes, ensayar con `rollback;` en lugar del
-- `commit;` final. Mirar la tabla que devuelve el último `select`: no
-- depender de los NOTICE, que el Editor puede no mostrar.
-- ============================================================

begin;

-- Recrear account_ledger pide un lock exclusivo sobre la vista que lee toda
-- la caja. Si alguien tiene una consulta larga abierta, mejor cortar en 5
-- segundos con un error claro (y reintentar en un par de minutos) que
-- dejar colgada la pantalla de Caja de todos detrás de la migración.
set local lock_timeout = '5s';

-- ------------------------------------------------------------
-- 0. GUARDAS
--
-- Cortan con un mensaje que dice qué falta, antes de crear nada.
-- ------------------------------------------------------------
do $guarda$
declare
  v_detalle text;
  v_guard   text;
begin
  if to_regclass('public.payments') is null or to_regclass('public.students') is null then
    raise exception 'Faltan payments o students: esto no es la base del estudio.';
  end if;
  if to_regprocedure('public.mis_permisos()') is null
     or to_regprocedure('public.can(text)') is null
     or to_regprocedure('public.perm_diff()') is null
     or to_regclass('public.role_permissions') is null
     or to_regclass('public.user_permissions') is null then
    raise exception 'Falta el motor de permisos. Revisar si corrieron la 0012 y la 0014.';
  end if;
  if to_regprocedure('public.param(text, text)') is null
     or to_regprocedure('public.guard_dia_cerrado()') is null
     or to_regclass('public.cash_sessions') is null
     or to_regclass('public.expenses') is null
     or to_regclass('public.expense_categories') is null
     or to_regclass('public.account_ledger') is null then
    raise exception 'Falta la caja. Revisar si corrió la 0020.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'payment_methods'
                    and column_name = 'default_account_id') then
    raise exception 'Falta payment_methods.default_account_id. Revisar si corrió la 0074.';
  end if;
  if to_regprocedure('public.pesos(numeric)') is null then
    raise exception 'Falta pesos(). Revisar si corrió la 0084.';
  end if;
  if not exists (select 1 from public.payment_methods where code = 'transferencia_bbva') then
    raise notice 'No está el medio transferencia_bbva (0089): Difusor y Spray se cargan sin ese precio.';
  end if;
  -- plpgsql no valida las columnas al crear la función: si producción no
  -- tuviera alguna, la 0090 entraría igual y la primera venta fallaría en el
  -- mostrador. Se mira acá, antes de crear nada.
  select string_agg(x.t || '.' || x.c, ', ') into v_detalle
    from (values ('payment_methods', 'is_manual'), ('payment_methods', 'active'), ('payment_methods', 'name'),
                 ('accounts', 'active'), ('accounts', 'name'),
                 ('cash_sessions', 'desde'), ('cash_sessions', 'hasta'), ('cash_sessions', 'closed_at'),
                 ('expenses', 'supplier'), ('expenses', 'notes'), ('expenses', 'void_reason'),
                 ('expense_categories', 'parent_id'), ('expense_categories', 'nature'),
                 ('students', 'name'), ('profiles', 'full_name')) x (t, c)
   where not exists (select 1 from information_schema.columns ic
                      where ic.table_schema = 'public' and ic.table_name = x.t and ic.column_name = x.c);
  if v_detalle is not null then
    raise exception 'A la base le faltan columnas que usa la 0090: %', v_detalle;
  end if;
  if not exists (select 1 from public.accounts where id = 'a0000000-0000-4000-8000-000000000009') then
    raise exception 'No está la cuenta "A imputar" (a0000000-…-0009).';
  end if;

  -- Los `create table if not exists` de abajo no miran qué hay adentro: si
  -- alguna de estas tablas ya existiera y no fuera de la 0090, se seguiría
  -- de largo con otra forma. En una segunda corrida existen las siete, y
  -- la de ventas tiene sus columnas.
  select string_agg(t, ', ') into v_detalle
    from unnest(array['proveedores', 'productos', 'producto_precios', 'ventas_productos',
                      'stock_movimientos', 'rendiciones', 'rendicion_ventas']) t
   where to_regclass('public.' || t) is not null;
  if v_detalle is not null
     and not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'ventas_productos'
                        and column_name = 'parte_proveedor') then
    raise exception 'Ya hay tablas con nombres que usa la 0090 y no son suyas: %. Revisar antes de seguir.', v_detalle;
  end if;

  select md5(btrim(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
    into v_guard from pg_proc p where p.oid = 'public.guard_dia_cerrado()'::regprocedure;
  if v_guard is distinct from 'de5f37c5f925530b62e7821d7c4e5483' then
    raise exception 'guard_dia_cerrado() no es la de la 0020 (su huella es %). Mandar  select prosrc from pg_proc where oid = ''public.guard_dia_cerrado()''::regprocedure;  antes de seguir.', v_guard;
  end if;

  -- Como las dejó la 0012, o como las deja esta misma migración (segunda
  -- corrida). Cualquier otra cosa es un cambio que nadie anotó.
  select string_agg(format('%s (%s)', e.clave, coalesce('grupo ' || k.grupo || ', ' || k.tipo || ', ' || k.enforce_mode || ', ' || k.legacy_roles::text, 'no existe')), '; ')
    into v_detalle
    from (values ('inventario.ver'), ('inventario.gestionar'), ('inventario.ver_costos')) e (clave)
    left join public.permission_keys k on k.clave = e.clave
   where k.clave is null
      or k.grupo <> 'Inventario'
      or not (   (k.tipo = 'futuro' and k.enforce_mode = 'sombra' and k.legacy_roles = '{admin}')
              or (e.clave <> 'inventario.ver_costos' and k.tipo = 'permiso' and k.enforce_mode = 'activo'));
  if v_detalle is not null then
    raise exception 'Las claves de Inventario no están como las dejó la 0012: %', v_detalle;
  end if;

  -- En sombra una excepción por persona no pesa; encendida gana en las dos
  -- direcciones. Si alguien cargó una sobre las dos claves que se encienden,
  -- encender la pondría a regir de golpe. (En una segunda corrida ya rigen y
  -- las excepciones son decisiones tomadas desde Permisos: no se miran.)
  select string_agg(format('%s → %s (%s)', up.user_id, up.clave, case when up.allow then 'le da' else 'le saca' end), '; ')
    into v_detalle
    from public.user_permissions up
    join public.permission_keys k on k.clave = up.clave
   where up.clave in ('inventario.ver', 'inventario.gestionar')
     and k.enforce_mode = 'sombra'
     and (up.expires_at is null or up.expires_at > now());
  if v_detalle is not null then
    raise exception 'Hay excepciones por persona sobre inventario.* que el encendido pondría a regir: %', v_detalle;
  end if;
end
$guarda$;

-- La red del motor ANTES de tocar nada: si producción ya trae filas en
-- perm_diff() (deriva vieja), la 0090 no las arregla ni las esconde, pero
-- tampoco puede sumar ninguna (se compara en el punto 10).
create temp table perm_diff_antes on commit drop as select * from public.perm_diff();

do $deriva$
begin
  if exists (select 1 from pg_temp.perm_diff_antes) then
    raise notice 'perm_diff() ya traía % filas antes de la 0090. No las toca: mirarlas aparte.',
      (select count(*) from pg_temp.perm_diff_antes);
  end if;
end
$deriva$;

-- ------------------------------------------------------------
-- 0b. LAS TRES VISTAS COMO ESTÁN EN EL REPO
--
-- Temporales y dentro de la transacción: si algo aborta, el rollback se
-- las lleva. Sirven para reconocer la versión viva (punto 6).
-- ------------------------------------------------------------
create or replace temp view ref_libro_0075 with (security_invoker = on) as
select 'cobro'::text            as origen,
       p.id                     as ref_id,
       p.account_id,
       p.paid_at                as at,
       p.paid_date              as dia,
       'ingreso'::text          as sentido,
       p.amount                 as monto,
       coalesce(nullif(p.concept, ''), 'Cobro') as concepto,
       coalesce(pm.name, p.method) as medio,
       s.name                   as contraparte,
       p.receipt_number::text   as comprobante
  from public.payments p
  left join public.students s on s.id = p.student_id
  left join public.payment_methods pm on pm.code = p.method
 where p.status = 'pagado' and p.account_id is not null and p.paid_at is not null
union all
select 'gasto', g.id, g.account_id, g.paid_at, g.paid_date, 'egreso',
       g.amount,
       coalesce(nullif(g.detail, ''), c.name, 'Gasto'),
       coalesce(gm.name, g.method), nullif(g.supplier, ''), nullif(g.doc_number, '')
  from public.expenses g
  left join public.expense_categories c on c.id = g.category_id
  left join public.payment_methods gm on gm.code = g.method
 where g.status = 'pagado' and g.account_id is not null
union all
select 'movimiento', m.id, m.from_account_id, m.at, m.dia, 'egreso',
       m.amount, coalesce(nullif(m.concept, ''), m.kind), null, null, null
  from public.account_movements m
 where m.status = 'vigente' and m.from_account_id is not null
union all
select 'movimiento', m.id, m.to_account_id, m.at, m.dia, 'ingreso',
       m.amount, coalesce(nullif(m.concept, ''), m.kind), null, null, null
  from public.account_movements m
 where m.status = 'vigente' and m.to_account_id is not null;

create or replace temp view ref_resultado_0020 with (security_invoker = on) as
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

create or replace temp view ref_ingresos_0016 with (security_invoker = on) as
select
  to_char(
    (paid_at at time zone 'America/Argentina/Buenos_Aires'),
    'YYYY-MM'
  ) as month,
  sum(amount)::numeric(14, 2) as amount
from public.payments
where status = 'pagado' and paid_at is not null
group by 1
order by 1;

-- ------------------------------------------------------------
-- 1. TABLAS
-- ------------------------------------------------------------
create table if not exists public.proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (btrim(nombre) <> '' and length(nombre) <= 80),
  contacto text not null default '',
  notas text not null default '',
  -- La parte del estudio, configurable por proveedor: el 30 del pedido es
  -- el de hoy, no una regla del sistema.
  pct_estudio numeric(5, 2) not null default 30 check (pct_estudio >= 0 and pct_estudio <= 100),
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
create unique index if not exists proveedores_nombre_idx on public.proveedores (lower(btrim(nombre)));

create table if not exists public.productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (btrim(nombre) <> '' and length(nombre) <= 80),
  descripcion text not null default '',
  proveedor_id uuid references public.proveedores (id),
  stock int not null default 0 check (stock >= 0),
  stock_aviso int not null default 2 check (stock_aviso >= 0),
  -- Los aromas que trae el proveedor: las sugerencias del primer día,
  -- cuando todavía no hay ventas de donde sacarlas. Sin una lista, cada
  -- persona escribe "lavanda", "Lavanda" o "lavana" y la rendición sale
  -- fragmentada. Al vender el campo sigue siendo texto libre.
  aromas text[] not null default '{}',
  active boolean not null default true,
  sort_order int not null default 100,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
create unique index if not exists productos_nombre_idx on public.productos (lower(btrim(nombre))) where active;

-- Un precio por medio de pago, el que dio el estudio, y no uno derivado
-- del ajuste del medio. Un medio sin fila acá no se ofrece al vender.
create table if not exists public.producto_precios (
  producto_id uuid not null references public.productos (id) on delete cascade,
  method text not null references public.payment_methods (code) on update cascade on delete cascade,
  precio numeric(14, 2) not null check (precio > 0),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (producto_id, method)
);

-- Mismos nombres que payments (amount, method, account_id, paid_at,
-- paid_date, status) a propósito: así le sirve guard_dia_cerrado() sin
-- modificarlo. Precio, % y reparto se guardan como FOTO: cambiar la
-- lista o el % del proveedor mañana no cambia lo que ya se vendió.
create table if not exists public.ventas_productos (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  producto_id uuid not null references public.productos (id),
  producto_nombre text not null,
  proveedor_id uuid not null references public.proveedores (id),
  proveedor_nombre text not null,
  aroma text not null check (btrim(aroma) <> '' and length(aroma) <= 60),
  cantidad int not null check (cantidad > 0),
  precio_unitario numeric(14, 2) not null check (precio_unitario > 0),
  amount numeric(14, 2) not null,
  pct_estudio numeric(5, 2) not null check (pct_estudio >= 0 and pct_estudio <= 100),
  parte_estudio numeric(14, 2) not null check (parte_estudio >= 0),
  parte_proveedor numeric(14, 2) not null check (parte_proveedor >= 0),
  method text not null references public.payment_methods (code) on update cascade,
  account_id uuid not null references public.accounts (id),
  paid_at timestamptz not null,
  paid_date date not null,
  status text not null default 'pagado' check (status in ('pagado', 'anulado')),
  student_id uuid references public.students (id) on delete set null,
  comprador_nombre text not null default '',
  notas text not null default '',
  -- La llave del navegador: un doble toque o un reintento por mala señal
  -- devuelve la misma venta en vez de cobrar dos veces.
  idem uuid unique,
  vendido_por uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  void_reason text not null default '',
  anulado_por uuid references auth.users (id) on delete set null,
  anulado_at timestamptz,
  constraint venta_total_cuadra check (amount = precio_unitario * cantidad),
  constraint venta_reparto_cuadra check (parte_estudio + parte_proveedor = amount),
  constraint venta_anulada_con_motivo
    check (status <> 'anulado' or (btrim(void_reason) <> '' and anulado_at is not null))
);
create index if not exists ventas_productos_caja_idx on public.ventas_productos (account_id, paid_date) where status = 'pagado';
-- fetchTurno, cerrar_caja y caja_control filtran el libro por cuenta e INSTANTE, no por día.
create index if not exists ventas_productos_turno_idx on public.ventas_productos (account_id, paid_at) where status = 'pagado';
create index if not exists ventas_productos_dia_idx on public.ventas_productos (paid_date desc);
create index if not exists ventas_productos_proveedor_idx on public.ventas_productos (proveedor_id) where status = 'pagado';
create index if not exists ventas_productos_cliente_idx on public.ventas_productos (student_id) where student_id is not null;
create index if not exists ventas_productos_producto_idx on public.ventas_productos (producto_id);

create table if not exists public.stock_movimientos (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos (id),
  at timestamptz not null default now(),
  tipo text not null check (tipo in ('ingreso', 'devolucion', 'ajuste', 'venta', 'anulacion')),
  cantidad int not null check (cantidad <> 0),            -- con signo
  stock_resultante int not null check (stock_resultante >= 0),
  motivo text not null default '',
  venta_id uuid references public.ventas_productos (id),
  proveedor_id uuid references public.proveedores (id),
  created_by uuid references auth.users (id) on delete set null,
  constraint ingreso_suma check (tipo <> 'ingreso' or cantidad > 0),
  -- En consignación lo que no se vende vuelve al proveedor: es un hecho con
  -- nombre propio, no un "ajuste" que se confunde con una rotura.
  constraint devolucion_resta check (tipo <> 'devolucion' or cantidad < 0),
  constraint venta_resta check (tipo <> 'venta' or (cantidad < 0 and venta_id is not null)),
  constraint anulacion_suma check (tipo <> 'anulacion' or (cantidad > 0 and venta_id is not null)),
  constraint ajuste_con_motivo check (tipo <> 'ajuste' or btrim(motivo) <> '')
);
create index if not exists stock_movimientos_producto_idx on public.stock_movimientos (producto_id, at desc);

create table if not exists public.rendiciones (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references public.proveedores (id),
  proveedor_nombre text not null,
  expense_id uuid not null unique references public.expenses (id),
  ventas int not null check (ventas > 0),
  cobrado numeric(14, 2) not null,
  total numeric(14, 2) not null check (total > 0),
  desde date not null,
  hasta date not null,
  method text references public.payment_methods (code) on update cascade,
  account_id uuid references public.accounts (id),
  notas text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists rendiciones_proveedor_idx on public.rendiciones (proveedor_id, created_at desc);

-- Tabla puente y no columna en la venta: si se anula el gasto y se vuelve a
-- rendir, la primera rendición conserva qué ventas cubría.
create table if not exists public.rendicion_ventas (
  rendicion_id uuid not null references public.rendiciones (id),
  venta_id uuid not null references public.ventas_productos (id),
  parte_proveedor numeric(14, 2) not null,
  primary key (rendicion_id, venta_id)
);
create index if not exists rendicion_ventas_venta_idx on public.rendicion_ventas (venta_id);

-- ------------------------------------------------------------
-- 2. RLS, PRIVILEGIOS Y POLÍTICAS
--
-- Ninguna política de insert, update ni delete: todo se escribe desde las
-- funciones de abajo (security definer), que exigen la clave, y el
-- historial no se borra.
--
-- El `grant select` a authenticated NO es opcional: las tres vistas de la
-- caja son security_invoker y ahora leen ventas_productos. Sin el grant,
-- le darían "permission denied" a todo el que no sea dueño —incluido el
-- portal de la clienta, que lee monthly_revenue—. Con el grant y sin
-- política que la abra, la clienta y la profesora leen cero filas.
-- ------------------------------------------------------------
do $rls$
declare t text;
begin
  foreach t in array array['proveedores', 'productos', 'producto_precios', 'ventas_productos',
                           'stock_movimientos', 'rendiciones', 'rendicion_ventas']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
  end loop;
  -- La numeración de ventas (V-1, V-2…) es una secuencia, y Supabase también
  -- les da todo sobre las secuencias nuevas a anon y authenticated. Sólo la
  -- usan las funciones, que corren como dueño.
  execute format('revoke all on sequence %s from public, anon, authenticated',
                 pg_get_serial_sequence('public.ventas_productos', 'numero'));
end
$rls$;

drop policy if exists "productos: ver" on public.productos;
create policy "productos: ver" on public.productos for select
  using ((select public.can('inventario.ver')) or (select public.can('inventario.vender'))
         or (select public.can('inventario.gestionar')));
drop policy if exists "precios: ver" on public.producto_precios;
create policy "precios: ver" on public.producto_precios for select
  using ((select public.can('inventario.ver')) or (select public.can('inventario.vender'))
         or (select public.can('inventario.gestionar')));
drop policy if exists "proveedores: ver" on public.proveedores;
create policy "proveedores: ver" on public.proveedores for select
  using ((select public.can('inventario.ver')) or (select public.can('inventario.gestionar'))
         or (select public.can('inventario.rendir')));
-- caja.ver y finanzas.ver también: la caja (fetchTurno, con RLS) y el
-- cierre (cerrar_caja, definer) tienen que ver las mismas ventas.
drop policy if exists "ventas: ver" on public.ventas_productos;
create policy "ventas: ver" on public.ventas_productos for select
  using ((select public.can('inventario.ver')) or (select public.can('inventario.vender'))
         or (select public.can('caja.ver')) or (select public.can('finanzas.ver')));
drop policy if exists "stock: ver movimientos" on public.stock_movimientos;
create policy "stock: ver movimientos" on public.stock_movimientos for select
  using ((select public.can('inventario.ver')) or (select public.can('inventario.gestionar')));
drop policy if exists "rendiciones: ver" on public.rendiciones;
create policy "rendiciones: ver" on public.rendiciones for select
  using ((select public.can('inventario.ver')) or (select public.can('inventario.rendir')));
drop policy if exists "rendiciones: ver ventas" on public.rendicion_ventas;
create policy "rendiciones: ver ventas" on public.rendicion_ventas for select
  using ((select public.can('inventario.ver')) or (select public.can('inventario.rendir')));

-- Las mismas reglas que un cobro: con el día o el turno cerrado no cambia
-- el monto, el medio, la cuenta ni el momento. Anular (sólo `status`) pasa.
drop trigger if exists ventas_productos_dia_cerrado on public.ventas_productos;
create trigger ventas_productos_dia_cerrado
  before update on public.ventas_productos
  for each row execute function public.guard_dia_cerrado();

-- ------------------------------------------------------------
-- 3. AYUDANTES Y LA GUARDA DEL GASTO DE UNA RENDICIÓN
--
-- "Rendida" se calcula, no se guarda: una venta está rendida si tiene una
-- rendición cuyo gasto no está anulado. Anular ese gasto devuelve sola la
-- venta a pendiente, y un gasto anulado no se reactiva (stamp_expense,
-- 0020), así que nunca hay dos rendiciones vivas para la misma venta.
--
-- Los ayudantes no piden permiso: devuelven un uuid o un booleano, y para
-- usarlos hace falta un id que sólo conoce quien puede leer las ventas.
-- Una compuerta los rompería adentro de anular_venta y rendir_proveedor: a
-- quien tuviera anular sin ver, una venta rendida le parecería sin rendir.
-- ------------------------------------------------------------
create or replace function public.rendicion_vigente(p_rendicion uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select e.status <> 'anulado'
                     from public.rendiciones r
                     join public.expenses e on e.id = r.expense_id
                    where r.id = p_rendicion), false)
$$;

create or replace function public.venta_rendida(p_venta uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select r.id
    from public.rendicion_ventas rv
    join public.rendiciones r on r.id = rv.rendicion_id
    join public.expenses e on e.id = r.expense_id
   where rv.venta_id = p_venta and e.status <> 'anulado'
   order by r.created_at desc
   limit 1
$$;

-- El gasto de una rendición es la plata que se le pagó al proveedor por
-- ESAS ventas. Recepción tiene gastos.editar, y el formulario de Gastos
-- reescribe el monto al guardar: si alguien lo cambia, las ventas quedan
-- "rendidas" por una plata que no es la que salió. Se puede anular (y las
-- ventas vuelven solas a pendientes), no cambiar el monto ni pasarlo a
-- pendiente. Para cualquier otro gasto no hace nada: la primera línea sale.
create or replace function public.guard_gasto_de_rendicion()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.rendiciones r where r.expense_id = old.id) then
    return new;
  end if;
  if new.amount is distinct from old.amount then
    raise exception 'Este gasto es el pago a un proveedor por ventas de productos: el monto no se cambia. Si estuvo mal, anulá el pago desde Productos y volvé a registrarlo.';
  end if;
  if new.status is distinct from old.status and new.status <> 'anulado' then
    raise exception 'Este gasto es el pago a un proveedor por ventas de productos: sólo se puede anular.';
  end if;
  return new;
end;
$$;

drop trigger if exists expenses_rendicion_fija on public.expenses;
create trigger expenses_rendicion_fija
  before update on public.expenses
  for each row execute function public.guard_gasto_de_rendicion();

-- ------------------------------------------------------------
-- 4. FUNCIONES
--
-- Cada una pide su clave a mano: adentro de un SECURITY DEFINER las
-- políticas no corren. Los mensajes son los que ve la pantalla.
-- ------------------------------------------------------------
create or replace function public.guardar_proveedor(
  p_id uuid, p_nombre text, p_contacto text, p_notas text, p_pct_estudio numeric, p_activo boolean
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_nombre text := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
  v_id uuid;
begin
  if not public.can('inventario.gestionar') then
    raise exception 'No tenés permiso para cargar proveedores.';
  end if;
  if v_nombre = '' then
    raise exception 'Falta el nombre del proveedor.';
  end if;
  if p_pct_estudio is null or p_pct_estudio < 0 or p_pct_estudio > 100 then
    raise exception 'La parte del estudio tiene que ser un porcentaje entre 0 y 100.';
  end if;

  begin
    if p_id is null then
      insert into public.proveedores (nombre, contacto, notas, pct_estudio, active, created_by, updated_by)
      values (v_nombre, btrim(coalesce(p_contacto, '')), btrim(coalesce(p_notas, '')),
              p_pct_estudio, coalesce(p_activo, true), auth.uid(), auth.uid())
      returning id into v_id;
    else
      update public.proveedores
         set nombre = v_nombre, contacto = btrim(coalesce(p_contacto, '')),
             notas = btrim(coalesce(p_notas, '')), pct_estudio = p_pct_estudio,
             active = coalesce(p_activo, active), updated_by = auth.uid(), updated_at = now()
       where id = p_id
      returning id into v_id;
      if v_id is null then
        raise exception 'Ese proveedor no existe.';
      end if;
    end if;
  exception when unique_violation then
    raise exception 'Ya hay un proveedor que se llama % (si no lo ves, puede estar dado de baja: reactivalo desde Proveedores).', v_nombre;
  end;
  return v_id;
end;
$$;

-- p_precios es un objeto {código del medio: número | null}: un número crea
-- o actualiza ese precio, null lo borra (y el medio deja de ofrecerse), un
-- código ausente no se toca. p_aromas nulo = no se tocan; si viene,
-- reemplaza la lista. El stock no se toca acá: tiene su propia historia.
create or replace function public.guardar_producto(
  p_id uuid, p_nombre text, p_descripcion text, p_proveedor uuid,
  p_activo boolean, p_stock_aviso int, p_precios jsonb,
  p_aromas text[] default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_nombre text := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
  v_id     uuid;
  v_prev   uuid;
  v_k      text;
  v_v      jsonb;
  v_pm     record;
  -- Deduplicados sin distinguir mayúsculas: "Lavanda" y "lavanda" son uno.
  v_aromas text[] := (select array_agg(a order by lower(a))
                        from (select distinct on (lower(a)) a
                                from (select btrim(regexp_replace(x, '\s+', ' ', 'g')) a
                                        from unnest(p_aromas) x) t
                               where a <> '' and length(a) <= 60
                               order by lower(a), a) u);
begin
  if not public.can('inventario.gestionar') then
    raise exception 'No tenés permiso para cargar productos ni precios.';
  end if;
  if v_nombre = '' then
    raise exception 'Falta el nombre del producto.';
  end if;
  if p_stock_aviso is null or p_stock_aviso < 0 then
    raise exception 'El aviso de stock bajo tiene que ser 0 o más.';
  end if;
  if p_precios is not null and jsonb_typeof(p_precios) <> 'object' then
    raise exception 'Los precios llegaron mal armados.';
  end if;

  if p_id is not null then
    select proveedor_id into v_prev from public.productos where id = p_id for update;
    if not found then
      raise exception 'Ese producto no existe.';
    end if;
  end if;

  -- Un proveedor dado de baja no se elige para un producto nuevo, pero el
  -- que ya tenía puede quedar (dar de baja al proveedor no rompe la ficha).
  if p_proveedor is not null and p_proveedor is distinct from v_prev
     and not exists (select 1 from public.proveedores where id = p_proveedor and active) then
    raise exception 'Ese proveedor no existe o está dado de baja.';
  end if;

  begin
    if p_id is null then
      insert into public.productos (nombre, descripcion, proveedor_id, active, stock_aviso, aromas, created_by, updated_by)
      values (v_nombre, btrim(coalesce(p_descripcion, '')), p_proveedor, coalesce(p_activo, true),
              p_stock_aviso, coalesce(v_aromas, '{}'), auth.uid(), auth.uid())
      returning id into v_id;
    else
      update public.productos
         set nombre = v_nombre, descripcion = btrim(coalesce(p_descripcion, '')),
             proveedor_id = p_proveedor, active = coalesce(p_activo, active),
             stock_aviso = p_stock_aviso,
             aromas = case when p_aromas is null then aromas else coalesce(v_aromas, '{}') end,
             updated_by = auth.uid(), updated_at = now()
       where id = p_id
      returning id into v_id;
    end if;
  exception when unique_violation then
    raise exception 'Ya hay un producto activo que se llama %.', v_nombre;
  end;

  for v_k, v_v in select key, value from jsonb_each(coalesce(p_precios, '{}'::jsonb)) loop
    select code, name, is_manual into v_pm from public.payment_methods where code = v_k;
    if not found then
      raise exception 'El medio de pago % no existe.', v_k;
    end if;
    if jsonb_typeof(v_v) = 'null' then
      delete from public.producto_precios where producto_id = v_id and method = v_k;
    elsif jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}')::numeric <= 0 then
      raise exception 'El precio en % tiene que ser un número mayor que cero.', v_pm.name;
    elsif not v_pm.is_manual then
      raise exception '% se acredita solo: no se le pone precio de mostrador.', v_pm.name;
    else
      insert into public.producto_precios (producto_id, method, precio, updated_by)
      values (v_id, v_k, round((v_v #>> '{}')::numeric, 2), auth.uid())
      on conflict (producto_id, method)
        do update set precio = excluded.precio, updated_by = excluded.updated_by, updated_at = now();
    end if;
  end loop;

  return v_id;
end;
$$;

-- ingreso: lo que trajo el proveedor (positivo). devolucion: lo que se
-- lleva el proveedor (llega positivo, se resta). ajuste: con signo y con
-- motivo obligatorio (rotura, faltante, conteo). El stock nunca negativo.
create or replace function public.mover_stock(
  p_producto uuid, p_tipo text, p_cantidad int, p_motivo text
)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_p     record;
  v_nuevo int;
  v_delta int;
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if not public.can('inventario.gestionar') then
    raise exception 'No tenés permiso para cargar ni ajustar stock.';
  end if;
  if p_tipo is null or p_tipo not in ('ingreso', 'devolucion', 'ajuste') then
    raise exception 'El movimiento de stock tiene que ser un ingreso, una devolución al proveedor o un ajuste.';
  end if;
  if p_cantidad is null or p_cantidad = 0 then
    raise exception 'Falta la cantidad.';
  end if;
  if p_tipo in ('ingreso', 'devolucion') and p_cantidad < 0 then
    raise exception 'La cantidad va en positivo: lo que trajo o lo que se lleva el proveedor.';
  end if;
  if p_tipo = 'ajuste' and v_motivo = '' then
    raise exception 'El ajuste necesita un motivo (rotura, faltante, conteo).';
  end if;

  select * into v_p from public.productos where id = p_producto for update;
  if not found then
    raise exception 'Ese producto no existe.';
  end if;
  v_delta := case when p_tipo = 'devolucion' then -p_cantidad else p_cantidad end;
  v_nuevo := v_p.stock + v_delta;
  if v_nuevo < 0 then
    raise exception 'Hay % en stock: no se pueden restar %.', v_p.stock, -v_delta;
  end if;

  update public.productos set stock = v_nuevo, updated_by = auth.uid(), updated_at = now()
   where id = p_producto;
  insert into public.stock_movimientos (producto_id, tipo, cantidad, stock_resultante, motivo, proveedor_id, created_by)
  values (p_producto, p_tipo, v_delta, v_nuevo, v_motivo,
          case when p_tipo in ('ingreso', 'devolucion') then v_p.proveedor_id end, auth.uid());
  return v_nuevo;
end;
$$;

-- La venta. La BASE decide todo: el permiso, el stock (con la fila
-- bloqueada: dos ventas a la vez de la última unidad no pasan las dos),
-- el aroma, el precio del medio, la cuenta donde entra la plata y el
-- reparto. Del navegador llegan el producto, la cantidad, el aroma, el
-- medio y el comprador; el precio y el total nunca.
--
-- p_precio_esperado es un CONTROL, no la fuente del precio: es el que vio
-- quien vende. La tablet del mostrador puede tener la pantalla abierta
-- desde la mañana y el admin cambiar la lista desde otro lado (con la
-- inflación va a pasar): sin esto se le cobra a quien compra el precio
-- viejo, la base registra el nuevo, el cajón no cuadra y el 70% del
-- proveedor sale de plata que nunca entró. Si no coincide, corta.
--
-- Una versión anterior de esta migración tenía ocho parámetros. Nunca se
-- corrió en producción, pero si quedó en alguna base de prueba las dos
-- convivirían y PostgREST no sabría a cuál llamar: se borra.
drop function if exists public.vender_producto(uuid, integer, text, text, uuid, text, text, uuid);

create or replace function public.vender_producto(
  p_producto  uuid,
  p_cantidad  int,
  p_aroma     text,
  p_method    text,
  p_student   uuid default null,
  p_comprador text default '',
  p_notas     text default '',
  p_idem      uuid default null,
  p_precio_esperado numeric default null
)
returns table (
  venta_id uuid, numero bigint, cobrado numeric, precio_unitario numeric, cantidad int,
  parte_estudio numeric, parte_proveedor numeric, medio text, cuenta text,
  stock_restante int, paid_at timestamptz, repetida boolean
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_p      record;
  v_prov   record;
  v_pm     record;
  v_precio numeric(14, 2);
  v_total  numeric(14, 2);
  v_est    numeric(14, 2);
  v_aroma  text := btrim(regexp_replace(coalesce(p_aroma, ''), '\s+', ' ', 'g'));
  v_comp   text := btrim(regexp_replace(coalesce(p_comprador, ''), '\s+', ' ', 'g'));
  v_cuenta uuid;
  v_ahora  timestamptz := now();
  v_v      public.ventas_productos;
begin
  if not public.can('inventario.vender') then
    raise exception 'No tenés permiso para vender productos.';
  end if;
  if p_cantidad is null or p_cantidad < 1 then
    raise exception 'La cantidad tiene que ser al menos 1.';
  end if;
  if v_aroma = '' then
    raise exception 'Falta el aroma: escribilo antes de cobrar.';
  end if;
  if length(v_aroma) > 60 then
    raise exception 'El aroma es demasiado largo (hasta 60 letras).';
  end if;

  select * into v_p from public.productos where id = p_producto for update;
  if not found then
    raise exception 'Ese producto no existe.';
  end if;

  if p_idem is not null then
    select * into v_v from public.ventas_productos v where v.idem = p_idem;
    if found then
      -- La misma llave con otro producto no es un reintento: es un error del
      -- navegador, y devolver la venta del otro producto con este stock mentiría.
      if v_v.producto_id <> p_producto then
        raise exception 'Ese cobro ya se registró con otro producto. Cerrá la venta y volvé a abrirla.';
      end if;
      return query
        select v_v.id, v_v.numero, v_v.amount, v_v.precio_unitario, v_v.cantidad,
               v_v.parte_estudio, v_v.parte_proveedor,
               coalesce((select pm.name from public.payment_methods pm where pm.code = v_v.method), v_v.method),
               (select a.name from public.accounts a where a.id = v_v.account_id),
               v_p.stock, v_v.paid_at, true;
      return;
    end if;
  end if;

  if not v_p.active then
    raise exception '% está dado de baja: no se vende.', v_p.nombre;
  end if;
  if v_p.proveedor_id is null then
    raise exception '% no tiene proveedor cargado. Pedile a quien administra que lo complete en Productos: sin proveedor no queda a quién rendirle la venta.', v_p.nombre;
  end if;
  if v_p.stock < p_cantidad then
    raise exception 'Quedan % de %: no alcanza para vender %.', v_p.stock, v_p.nombre, p_cantidad;
  end if;

  select * into v_pm from public.payment_methods where code = p_method;
  if not found then
    raise exception 'Ese medio de pago no existe.';
  end if;
  if not v_pm.active then
    raise exception '% está dado de baja como medio de pago.', v_pm.name;
  end if;
  if not v_pm.is_manual then
    raise exception '% se acredita solo: no se cobra desde el mostrador.', v_pm.name;
  end if;

  -- El precio de la lista para ese medio, tal cual. No se aplica el
  -- ajuste_pct del medio: los precios por medio los dio el estudio.
  select pp.precio into v_precio from public.producto_precios pp
   where pp.producto_id = p_producto and pp.method = p_method;
  if v_precio is null then
    raise exception '% no tiene precio en %.', v_p.nombre, v_pm.name;
  end if;
  if p_precio_esperado is not null and round(p_precio_esperado, 2) <> v_precio then
    raise exception 'El precio de % en % cambió: ahora es %. Revisalo con quien compra y volvé a cobrar.',
      v_p.nombre, v_pm.name, public.pesos(v_precio);
  end if;

  select * into v_prov from public.proveedores where id = v_p.proveedor_id;

  if p_student is not null then
    select s.name into v_comp from public.students s where s.id = p_student;
    if not found then
      raise exception 'No se encontró la ficha de ese cliente.';
    end if;
  end if;

  -- El % del estudio sobre lo cobrado; el redondeo queda del lado del
  -- estudio y el proveedor se lleva exactamente el resto (el CHECK de la
  -- tabla exige que sumen el total).
  v_total := v_precio * p_cantidad;
  v_est   := round(v_total * v_prov.pct_estudio / 100, 2);
  -- La cuenta del medio, como los cobros desde la 0074. Sin cuenta
  -- configurada cae en "A imputar", igual que un cobro.
  v_cuenta := coalesce(v_pm.default_account_id, 'a0000000-0000-4000-8000-000000000009');

  insert into public.ventas_productos (
    producto_id, producto_nombre, proveedor_id, proveedor_nombre, aroma, cantidad,
    precio_unitario, amount, pct_estudio, parte_estudio, parte_proveedor,
    method, account_id, paid_at, paid_date, student_id, comprador_nombre, notas, idem, vendido_por
  ) values (
    p_producto, v_p.nombre, v_prov.id, v_prov.nombre, v_aroma, p_cantidad,
    v_precio, v_total, v_prov.pct_estudio, v_est, v_total - v_est,
    p_method, v_cuenta, v_ahora, (v_ahora at time zone 'America/Argentina/Buenos_Aires')::date,
    p_student, left(coalesce(v_comp, ''), 80), btrim(coalesce(p_notas, '')), p_idem, auth.uid()
  ) returning * into v_v;

  update public.productos set stock = stock - p_cantidad where id = p_producto;
  insert into public.stock_movimientos (producto_id, at, tipo, cantidad, stock_resultante, venta_id, created_by)
  values (p_producto, v_ahora, 'venta', -p_cantidad, v_p.stock - p_cantidad, v_v.id, auth.uid());

  return query
    select v_v.id, v_v.numero, v_v.amount, v_v.precio_unitario, v_v.cantidad,
           v_v.parte_estudio, v_v.parte_proveedor, v_pm.name,
           (select a.name from public.accounts a where a.id = v_cuenta),
           v_p.stock - p_cantidad, v_v.paid_at, false;
end;
$$;

-- Anular cambia SÓLO status, motivo, quién y cuándo: guard_dia_cerrado lo
-- deja pasar también en un turno cerrado, igual que anular un cobro
-- (0083). La plata sale del libro en el acto; si era de un turno cerrado
-- el arqueo firmado no cambia y caja_control lo marca desactualizado.
create or replace function public.anular_venta(p_venta uuid, p_motivo text)
returns table (
  venta_id uuid, numero bigint, anulado numeric, devuelto int, stock_restante int,
  turno_cerrado boolean, cuenta text
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_v      public.ventas_productos;
  v_rend   uuid;
  v_fecha  timestamptz;
  v_stock  int;
  v_cerr   boolean;
begin
  if not public.can('inventario.anular') then
    raise exception 'No tenés permiso para anular ventas.';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'La anulación necesita un motivo: queda escrito en la venta.';
  end if;

  select * into v_v from public.ventas_productos where id = p_venta for update;
  if not found then
    raise exception 'Esa venta no existe.';
  end if;
  if v_v.status = 'anulado' then
    raise exception 'Esa venta ya estaba anulada.';
  end if;

  v_rend := public.venta_rendida(p_venta);
  if v_rend is not null then
    select r.created_at into v_fecha from public.rendiciones r where r.id = v_rend;
    raise exception 'Esa venta ya se le rindió al proveedor el %. Para anularla, primero anulá ese pago (Productos → Rendir a proveedores → Pagos anteriores).',
      to_char(v_fecha at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY');
  end if;

  v_cerr := exists (select 1 from public.cash_sessions s
                     where s.account_id = v_v.account_id and s.closed_at is not null
                       and v_v.paid_at > s.desde and v_v.paid_at <= s.hasta);

  update public.ventas_productos
     set status = 'anulado', void_reason = btrim(p_motivo),
         anulado_por = auth.uid(), anulado_at = now()
   where id = p_venta;

  update public.productos set stock = stock + v_v.cantidad
   where id = v_v.producto_id
  returning stock into v_stock;
  insert into public.stock_movimientos (producto_id, tipo, cantidad, stock_resultante, motivo, venta_id, created_by)
  values (v_v.producto_id, 'anulacion', v_v.cantidad, v_stock, btrim(p_motivo), p_venta, auth.uid());

  return query
    select v_v.id, v_v.numero, v_v.amount, v_v.cantidad, v_stock, v_cerr,
           (select a.name from public.accounts a where a.id = v_v.account_id);
end;
$$;

-- Pagarle al proveedor su parte: el patrón de pagar_liquidacion (0054).
-- Gasto, rendición y renglones en una sola transacción; el total lo
-- calcula la base y la lista tiene que ser exacta (si cambió desde que se
-- abrió la pantalla, corta). La plata sale ahora (paid_at = now()), así
-- no puede caer en un turno ya cerrado.
--
-- Las dos fechas del gasto dicen cosas distintas (0020: "una factura de
-- marzo se paga en abril y los dos datos importan"). paid_at es cuándo
-- salió la plata: hoy, y es lo que mira la caja y el resultado "por lo
-- pagado". `fecha` es la del comprobante, y lo que se le debe al
-- proveedor nace con la venta: va la de la última venta que cubre. Así,
-- con el resultado "devengado", rendir el 4/10 lo vendido en septiembre
-- deja el costo en septiembre, al lado del ingreso. (pagar_liquidacion
-- pone hoy en las dos; acá no se copió eso a propósito.) Si la rendición
-- junta ventas de dos meses, el costo entero cae en el de la última: la
-- pantalla lo avisa y sugiere rendir un mes por vez.
create or replace function public.rendir_proveedor(
  p_proveedor uuid, p_ventas uuid[], p_method text, p_account uuid,
  p_fecha date default null, p_notas text default ''
)
returns table (rendicion_id uuid, expense_id uuid, total numeric, ventas int, cobrado numeric)
language plpgsql security definer set search_path = ''
as $$
declare
  v_prov   record;
  v_pm     record;
  v_ids    uuid[];
  v_n      int;
  v_ok     int;
  v_total  numeric(14, 2);
  v_cobr   numeric(14, 2);
  v_desde  date;
  v_hasta  date;
  v_cat    uuid;
  v_cuenta uuid;
  v_exp    uuid;
  v_rid    uuid;
  v_fecha  date;
begin
  if not public.can('inventario.rendir') then
    raise exception 'No tenés permiso para rendirle a un proveedor.';
  end if;
  -- Adentro de un DEFINER la política de expenses no corre: la clave que
  -- pide para cargar un gasto se exige acá.
  if not public.can('gastos.cargar') then
    raise exception 'Rendirle a un proveedor carga un gasto, y no tenés permiso para eso.';
  end if;

  select array_agg(distinct x) into v_ids from unnest(coalesce(p_ventas, '{}'::uuid[])) x where x is not null;
  v_n := coalesce(cardinality(v_ids), 0);
  if v_n = 0 then
    raise exception 'No hay ventas elegidas para rendir.';
  end if;

  select * into v_prov from public.proveedores where id = p_proveedor;
  if not found then
    raise exception 'Ese proveedor no existe.';
  end if;

  select * into v_pm from public.payment_methods where code = p_method;
  if not found or not v_pm.active then
    raise exception 'Elegí con qué medio se le paga.';
  end if;
  v_cuenta := coalesce(p_account, v_pm.default_account_id);
  if v_cuenta is null or not exists (select 1 from public.accounts a where a.id = v_cuenta and a.active) then
    raise exception 'Elegí de qué cuenta sale la plata.';
  end if;

  perform 1 from public.ventas_productos v where v.id = any(v_ids) order by v.id for update;

  select count(*), sum(v.parte_proveedor), sum(v.amount), min(v.paid_date), max(v.paid_date)
    into v_ok, v_total, v_cobr, v_desde, v_hasta
    from public.ventas_productos v
   where v.id = any(v_ids)
     and v.proveedor_id = p_proveedor
     and v.status = 'pagado'
     and v.parte_proveedor > 0
     and public.venta_rendida(v.id) is null;
  if v_ok <> v_n then
    raise exception 'La lista cambió desde que la abriste (una venta se anuló, ya se rindió o no es de este proveedor). Cerrá esta ventana: la lista de atrás ya se actualizó.';
  end if;
  if coalesce(v_total, 0) <= 0 then
    raise exception 'Esas ventas no le dejan nada al proveedor: no hay qué rendir.';
  end if;
  -- La fecha del comprobante: la de la última venta que cubre (ver arriba).
  v_fecha := coalesce(p_fecha, v_hasta);

  select c.id into v_cat from public.expense_categories c
   where c.id = 'e0000000-0000-4000-8000-000000000090' and c.active;
  if v_cat is null then
    select c.id into v_cat from public.expense_categories c
     where lower(c.name) = 'rendiciones a proveedores' and c.active limit 1;
  end if;
  if v_cat is null then
    raise exception 'No está la categoría de gasto "Rendiciones a proveedores" (o está dada de baja). Activala en Configuración antes de rendir.';
  end if;

  insert into public.expenses (fecha, category_id, detail, amount, supplier, method, account_id,
                               paid_at, status, notes)
  values (v_fecha, v_cat,
          'Rendición ' || v_prov.nombre || ' · ' || v_n || case when v_n = 1 then ' venta' else ' ventas' end
            || ' del ' || to_char(v_desde, 'DD/MM') || ' al ' || to_char(v_hasta, 'DD/MM/YYYY'),
          v_total, v_prov.nombre, p_method, v_cuenta, now(), 'pagado',
          concat_ws(' · ', nullif(btrim(coalesce(p_notas, '')), ''),
                    'Cobrado ' || public.pesos(v_cobr) || ', parte del estudio ' || public.pesos(v_cobr - v_total)))
  returning id into v_exp;

  insert into public.rendiciones (proveedor_id, proveedor_nombre, expense_id, ventas, cobrado, total,
                                  desde, hasta, method, account_id, notas, created_by)
  values (p_proveedor, v_prov.nombre, v_exp, v_n, v_cobr, v_total, v_desde, v_hasta,
          p_method, v_cuenta, btrim(coalesce(p_notas, '')), auth.uid())
  returning id into v_rid;

  insert into public.rendicion_ventas (rendicion_id, venta_id, parte_proveedor)
  select v_rid, v.id, v.parte_proveedor from public.ventas_productos v where v.id = any(v_ids);

  return query select v_rid, v_exp, v_total, v_n, v_cobr;
end;
$$;

-- Deshacer un pago al proveedor desde el propio módulo. El único otro camino
-- es "Anular" en Gastos, que pide el motivo con window.prompt: el navegador
-- de Instagram y el panel de vista previa lo descartan solos y el botón
-- parece muerto. Anula el gasto (no la rendición): "rendida" se calcula del
-- gasto vivo, así que las ventas vuelven solas a pendientes.
create or replace function public.anular_rendicion(p_rendicion uuid, p_motivo text)
returns table (rendicion_id uuid, expense_id uuid, ventas int, total numeric,
               turno_cerrado boolean, cuenta text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_r    public.rendiciones;
  v_e    public.expenses;
  v_cerr boolean;
begin
  if not public.can('inventario.rendir') then
    raise exception 'No tenés permiso para anular pagos a proveedores.';
  end if;
  -- Adentro de un SECURITY DEFINER la restrictiva de expenses no corre: la
  -- clave que exige para anular un gasto se pide acá a mano.
  if not public.can('gastos.anular') then
    raise exception 'Anular el pago a un proveedor anula un gasto, y no tenés permiso para eso.';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Escribí por qué se anula el pago: queda en el gasto.';
  end if;

  select * into v_r from public.rendiciones r where r.id = p_rendicion;
  if not found then
    raise exception 'Ese pago a proveedor no existe.';
  end if;
  select * into v_e from public.expenses e where e.id = v_r.expense_id for update;
  if v_e.status = 'anulado' then
    raise exception 'Ese pago ya estaba anulado.';
  end if;

  v_cerr := exists (select 1 from public.cash_sessions s
                     where s.account_id = v_e.account_id and s.closed_at is not null
                       and v_e.paid_at > s.desde and v_e.paid_at <= s.hasta);

  -- Pasa por los disparadores de siempre del gasto: guard_dia_cerrado deja
  -- anular sin cambiar el monto, stamp_expense sella quién, y
  -- expenses_rendicion_fija deja pasar a 'anulado'.
  update public.expenses
     set status = 'anulado', void_reason = btrim(p_motivo)
   where id = v_e.id;

  return query
    select v_r.id, v_e.id, v_r.ventas, v_r.total, v_cerr,
           (select a.name from public.accounts a where a.id = v_e.account_id);
end;
$$;

-- Nadie sin sesión ejecuta nada; quien tiene sesión, sí (cada función
-- pide su clave adentro). La del disparador no se llama desde el navegador.
do $fn$
declare f text;
begin
  foreach f in array array[
    'public.rendicion_vigente(uuid)', 'public.venta_rendida(uuid)',
    'public.guard_gasto_de_rendicion()',
    'public.guardar_proveedor(uuid, text, text, text, numeric, boolean)',
    'public.guardar_producto(uuid, text, text, uuid, boolean, integer, jsonb, text[])',
    'public.mover_stock(uuid, text, integer, text)',
    'public.vender_producto(uuid, integer, text, text, uuid, text, text, uuid, numeric)',
    'public.anular_venta(uuid, text)',
    'public.rendir_proveedor(uuid, uuid[], text, uuid, date, text)',
    'public.anular_rendicion(uuid, text)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    if f = 'public.guard_gasto_de_rendicion()' then
      execute format('revoke all on function %s from authenticated', f);
    else
      execute format('grant execute on function %s to authenticated', f);
    end if;
  end loop;
end
$fn$;

-- ------------------------------------------------------------
-- 5. VISTAS DEL MÓDULO
--
-- security_invoker, y sólo SELECT: toda vista nueva en public nace
-- escribible para el navegador (la lección de la 0088).
-- ------------------------------------------------------------
create or replace view public.ventas_productos_estado
with (security_invoker = on) as
select v.id, v.numero, v.paid_at, v.paid_date, v.producto_id, v.producto_nombre,
       v.proveedor_id, v.proveedor_nombre, v.aroma, v.cantidad, v.precio_unitario,
       v.amount, v.pct_estudio, v.parte_estudio, v.parte_proveedor,
       v.method, coalesce(pm.name, v.method) as medio, v.account_id,
       v.student_id, v.comprador_nombre, v.notas, v.vendido_por,
       pr.full_name as vendido_por_nombre, v.created_at,
       v.status, v.void_reason, v.anulado_por, v.anulado_at,
       r.rendicion_id,
       case when v.status = 'anulado' then 'anulada'
            when r.rendicion_id is not null then 'rendida'
            -- Con la parte del estudio en 100% no hay nada que rendirle a
            -- nadie: sin esto quedaría "a rendir" para siempre por $0.
            when v.parte_proveedor = 0 then 'sin_parte'
            else 'a_rendir' end as estado
  from public.ventas_productos v
  left join public.payment_methods pm on pm.code = v.method
  left join public.profiles pr on pr.id = v.vendido_por
  left join lateral (select public.venta_rendida(v.id) as rendicion_id) r on true;

create or replace view public.rendiciones_estado
with (security_invoker = on) as
select r.id, r.proveedor_id, r.proveedor_nombre, r.expense_id, r.ventas, r.cobrado, r.total,
       r.desde, r.hasta, r.method, r.account_id, r.notas, r.created_by, r.created_at,
       public.rendicion_vigente(r.id) as vigente,
       e.amount as gasto_monto      -- nulo para quien no tiene gastos.ver
  from public.rendiciones r
  left join public.expenses e on e.id = r.expense_id;

revoke all on public.ventas_productos_estado, public.rendiciones_estado from public, anon, authenticated;
grant select on public.ventas_productos_estado, public.rendiciones_estado to authenticated;

-- ------------------------------------------------------------
-- 6. LAS TRES VISTAS DE LA CAJA, CON LAS VENTAS
--
-- Primero se reconoce la versión viva: tiene que ser la del repo
-- ("antes") o la de esta misma migración (segunda corrida). Las tres en
-- la misma era: una con ventas y otra sin, separaría el tablero de la
-- caja.
-- ------------------------------------------------------------
create or replace temp view ref_libro_0090 with (security_invoker = on) as
select 'cobro'::text            as origen,
       p.id                     as ref_id,
       p.account_id,
       p.paid_at                as at,
       p.paid_date              as dia,
       'ingreso'::text          as sentido,
       p.amount                 as monto,
       coalesce(nullif(p.concept, ''), 'Cobro') as concepto,
       coalesce(pm.name, p.method) as medio,
       s.name                   as contraparte,
       p.receipt_number::text   as comprobante
  from public.payments p
  left join public.students s on s.id = p.student_id
  left join public.payment_methods pm on pm.code = p.method
 where p.status = 'pagado' and p.account_id is not null and p.paid_at is not null
union all
select 'gasto', g.id, g.account_id, g.paid_at, g.paid_date, 'egreso',
       g.amount,
       coalesce(nullif(g.detail, ''), c.name, 'Gasto'),
       coalesce(gm.name, g.method), nullif(g.supplier, ''), nullif(g.doc_number, '')
  from public.expenses g
  left join public.expense_categories c on c.id = g.category_id
  left join public.payment_methods gm on gm.code = g.method
 where g.status = 'pagado' and g.account_id is not null
union all
select 'movimiento', m.id, m.from_account_id, m.at, m.dia, 'egreso',
       m.amount, coalesce(nullif(m.concept, ''), m.kind), null, null, null
  from public.account_movements m
 where m.status = 'vigente' and m.from_account_id is not null
union all
select 'movimiento', m.id, m.to_account_id, m.at, m.dia, 'ingreso',
       m.amount, coalesce(nullif(m.concept, ''), m.kind), null, null, null
  from public.account_movements m
 where m.status = 'vigente' and m.to_account_id is not null
union all
select 'venta', v.id, v.account_id, v.paid_at, v.paid_date, 'ingreso',
       v.amount,
       'Venta: ' || v.producto_nombre || ' · ' || v.aroma
         || case when v.cantidad > 1 then ' ×' || v.cantidad else '' end,
       coalesce(vm.name, v.method), nullif(v.comprador_nombre, ''), 'V-' || v.numero
  from public.ventas_productos v
  left join public.payment_methods vm on vm.code = v.method
 where v.status = 'pagado';

create or replace temp view ref_resultado_0090 with (security_invoker = on) as
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
  union all
  select to_char(paid_date, 'YYYY-MM'), sum(amount), 0, 0
    from public.ventas_productos where status = 'pagado' and (select public.can('finanzas.ver'))
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

create or replace temp view ref_ingresos_0090 with (security_invoker = on) as
select t.month, sum(t.amount)::numeric(14, 2) as amount
  from (
    select to_char((paid_at at time zone 'America/Argentina/Buenos_Aires'), 'YYYY-MM') as month, amount
      from public.payments
     where status = 'pagado' and paid_at is not null
    union all
    select to_char((paid_at at time zone 'America/Argentina/Buenos_Aires'), 'YYYY-MM'), amount
      from public.ventas_productos
     where status = 'pagado' and (select public.can('finanzas.ver'))
  ) t
 group by 1
 order by 1;

create temp table era_0090 (vista text primary key, era text not null) on commit drop;

do $huella$
declare
  v record;
  v_viva text;
begin
  for v in select * from (values
      ('public.account_ledger',    'pg_temp.ref_libro_0075',     'pg_temp.ref_libro_0090',     '0075'),
      ('public.resultado_mensual', 'pg_temp.ref_resultado_0020', 'pg_temp.ref_resultado_0090', '0020'),
      ('public.monthly_revenue',   'pg_temp.ref_ingresos_0016',  'pg_temp.ref_ingresos_0090',  '0016')) x (vista, antes, esta, origen)
  loop
    v_viva := pg_get_viewdef(v.vista::regclass, true);
    if v_viva = pg_get_viewdef(v.antes::regclass, true) then
      insert into pg_temp.era_0090 values (v.vista, 'antes');
    elsif v_viva = pg_get_viewdef(v.esta::regclass, true) then
      insert into pg_temp.era_0090 values (v.vista, '0090');
    else
      raise exception '% no es la de la % ni la de la 0090 (md5 de la viva: %): la cambió otra migración o se tocó a mano. Mandar  select pg_get_viewdef(''%'', true);  antes de seguir.',
        v.vista, v.origen, md5(v_viva), v.vista;
    end if;
  end loop;

  if (select count(distinct era) from pg_temp.era_0090) > 1 then
    raise exception 'De las tres vistas, unas tienen las ventas y otras no: %',
      (select string_agg(vista || ' = ' || era, ', ') from pg_temp.era_0090);
  end if;

  -- Pasa después de una vuelta atrás que dejó ventas: aplicar esto las
  -- mete de golpe en la caja y en el resultado, y eso se decide aparte.
  if exists (select 1 from pg_temp.era_0090 where era = 'antes')
     and exists (select 1 from public.ventas_productos where status = 'pagado') then
    raise exception 'Hay ventas cobradas y el libro no las tiene (¿se volvió atrás?). Aplicar esto las mete de golpe en la caja y en el resultado: decidirlo aparte.';
  end if;
end
$huella$;

-- La foto de ANTES. Sin las columnas ve_* de resultado_mensual, que
-- dependen de quién pregunta y no son plata.
create temp table foto_libro on commit drop as select * from public.account_ledger;
create temp table foto_resultado on commit drop as
  select mes, ingresos, egresos_pagados, egresos_devengados, neto from public.resultado_mensual;
create temp table foto_ingresos on commit drop as select * from public.monthly_revenue;

-- Una foto con RLS de por medio sería una foto parcial, y comparar dos
-- parciales no prueba nada. Desde el SQL Editor se ve todo.
do $foto$
declare v_esperadas bigint;
begin
  select (select count(*) from public.payments where status = 'pagado' and account_id is not null and paid_at is not null)
       + (select count(*) from public.expenses where status = 'pagado' and account_id is not null)
       + (select count(*) from public.account_movements where status = 'vigente' and from_account_id is not null)
       + (select count(*) from public.account_movements where status = 'vigente' and to_account_id is not null)
       + (select count(*) from public.ventas_productos where status = 'pagado'
                  and exists (select 1 from pg_temp.era_0090 where era = '0090'))
    into v_esperadas;
  if (select count(*) from pg_temp.foto_libro) <> v_esperadas then
    raise exception 'La foto del libro vio % filas y la base tiene %: quien corre esto no ve todo (¿RLS?). Correrla desde el SQL Editor.',
      (select count(*) from pg_temp.foto_libro), v_esperadas;
  end if;
end
$foto$;

-- Las tres vivas, recreadas: el mismo texto que las ref_*_0090. Mismas
-- columnas, mismo orden y mismos tipos (lo exige create or replace), y
-- siguen siendo security_invoker: sin el WITH correrían como dueño.
create or replace view public.account_ledger
with (security_invoker = on) as
select 'cobro'::text            as origen,
       p.id                     as ref_id,
       p.account_id,
       p.paid_at                as at,
       p.paid_date              as dia,
       'ingreso'::text          as sentido,
       p.amount                 as monto,
       coalesce(nullif(p.concept, ''), 'Cobro') as concepto,
       coalesce(pm.name, p.method) as medio,
       s.name                   as contraparte,
       p.receipt_number::text   as comprobante
  from public.payments p
  left join public.students s on s.id = p.student_id
  left join public.payment_methods pm on pm.code = p.method
 where p.status = 'pagado' and p.account_id is not null and p.paid_at is not null
union all
select 'gasto', g.id, g.account_id, g.paid_at, g.paid_date, 'egreso',
       g.amount,
       coalesce(nullif(g.detail, ''), c.name, 'Gasto'),
       coalesce(gm.name, g.method), nullif(g.supplier, ''), nullif(g.doc_number, '')
  from public.expenses g
  left join public.expense_categories c on c.id = g.category_id
  left join public.payment_methods gm on gm.code = g.method
 where g.status = 'pagado' and g.account_id is not null
union all
select 'movimiento', m.id, m.from_account_id, m.at, m.dia, 'egreso',
       m.amount, coalesce(nullif(m.concept, ''), m.kind), null, null, null
  from public.account_movements m
 where m.status = 'vigente' and m.from_account_id is not null
union all
select 'movimiento', m.id, m.to_account_id, m.at, m.dia, 'ingreso',
       m.amount, coalesce(nullif(m.concept, ''), m.kind), null, null, null
  from public.account_movements m
 where m.status = 'vigente' and m.to_account_id is not null
union all
-- Venta de un producto en consignación (0090). Entra entera, como un cobro;
-- la parte del proveedor sale después, como gasto, cuando se le rinde.
select 'venta', v.id, v.account_id, v.paid_at, v.paid_date, 'ingreso',
       v.amount,
       'Venta: ' || v.producto_nombre || ' · ' || v.aroma
         || case when v.cantidad > 1 then ' ×' || v.cantidad else '' end,
       coalesce(vm.name, v.method), nullif(v.comprador_nombre, ''), 'V-' || v.numero
  from public.ventas_productos v
  left join public.payment_methods vm on vm.code = v.method
 where v.status = 'pagado';

create or replace view public.resultado_mensual
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
  union all
  select to_char(paid_date, 'YYYY-MM'), sum(amount), 0, 0
    from public.ventas_productos where status = 'pagado' and (select public.can('finanzas.ver'))
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

-- Mismo mes del huso del estudio que los cobros (0016): paid_date de la
-- venta sale de ahí, así que monthly_revenue y resultado_mensual siguen
-- dando lo mismo.
--
-- La rama de las ventas, en las dos, pide finanzas.ver aparte. Los cobros
-- de estas vistas los filtra la política de payments, que es finanzas.ver
-- (0013): "gobierna sola la vista monthly_revenue". Las ventas tienen su
-- propia política, que también abre con caja.ver y con inventario.*: sin
-- este filtro, a un rol al que le saquen finanzas.ver y conserve la caja
-- le llegaría un "ingreso del mes" hecho sólo de productos, que es un
-- número que miente (lo que la 0013 vino a sacar). Para admin y recepción
-- no cambia nada hoy: las dos tienen finanzas.ver. La caja
-- (account_ledger) NO lleva este filtro: la gobierna caja.ver, y la lee
-- cerrar_caja, que tiene que ver todas las ventas para que el cajón cuadre.
create or replace view public.monthly_revenue
with (security_invoker = on) as
select t.month, sum(t.amount)::numeric(14, 2) as amount
  from (
    select to_char((paid_at at time zone 'America/Argentina/Buenos_Aires'), 'YYYY-MM') as month, amount
      from public.payments
     where status = 'pagado' and paid_at is not null
    union all
    select to_char((paid_at at time zone 'America/Argentina/Buenos_Aires'), 'YYYY-MM'), amount
      from public.ventas_productos
     where status = 'pagado' and (select public.can('finanzas.ver'))
  ) t
 group by 1
 order by 1;

-- ------------------------------------------------------------
-- 7. LA COMPARACIÓN: NI UN PESO DISTINTO
-- ------------------------------------------------------------
do $igual$
declare v_n bigint;
begin
  if pg_get_viewdef('public.account_ledger'::regclass, true) is distinct from pg_get_viewdef('pg_temp.ref_libro_0090'::regclass, true)
     or pg_get_viewdef('public.resultado_mensual'::regclass, true) is distinct from pg_get_viewdef('pg_temp.ref_resultado_0090'::regclass, true)
     or pg_get_viewdef('public.monthly_revenue'::regclass, true) is distinct from pg_get_viewdef('pg_temp.ref_ingresos_0090'::regclass, true) then
    raise exception 'Las vistas recreadas no son las ref_*_0090: se tocó una sin la otra.';
  end if;

  select count(*) into v_n from (
    (select * from public.account_ledger except all select * from pg_temp.foto_libro)
    union all
    (select * from pg_temp.foto_libro except all select * from public.account_ledger)) d;
  if v_n > 0 then
    raise exception 'El libro cambió en % filas al agregarle las ventas. No se aplica nada.', v_n;
  end if;

  select count(*) into v_n from (
    (select mes, ingresos, egresos_pagados, egresos_devengados, neto from public.resultado_mensual
     except all select * from pg_temp.foto_resultado)
    union all
    (select * from pg_temp.foto_resultado
     except all select mes, ingresos, egresos_pagados, egresos_devengados, neto from public.resultado_mensual)) d;
  if v_n > 0 then
    raise exception 'resultado_mensual cambió en % meses. No se aplica nada.', v_n;
  end if;

  select count(*) into v_n from (
    (select * from public.monthly_revenue except all select * from pg_temp.foto_ingresos)
    union all
    (select * from pg_temp.foto_ingresos except all select * from public.monthly_revenue)) d;
  if v_n > 0 then
    raise exception 'monthly_revenue cambió en % meses. No se aplica nada.', v_n;
  end if;

  if exists (select 1 from pg_class c
              where c.oid in ('public.account_ledger'::regclass, 'public.resultado_mensual'::regclass,
                              'public.monthly_revenue'::regclass)
                and not coalesce(c.reloptions, '{}') @> array['security_invoker=on']) then
    raise exception 'Una de las tres vistas perdió security_invoker.';
  end if;
end
$igual$;

-- ------------------------------------------------------------
-- 8. LA CATEGORÍA DE GASTO Y LOS PRODUCTOS DE ARRANQUE
-- ------------------------------------------------------------
-- La categoría de las rendiciones, con id fijo para que rendir_proveedor
-- la encuentre aunque la renombren. Si el estudio ya tenía una con ese
-- nombre en el primer nivel, se usa esa (la función la busca también por
-- nombre).
insert into public.expense_categories (id, name, nature, sort_order)
select 'e0000000-0000-4000-8000-000000000090', 'Rendiciones a proveedores', 'variable', 95
 where not exists (select 1 from public.expense_categories
                    where id = 'e0000000-0000-4000-8000-000000000090'
                       or (parent_id is null and lower(name) = 'rendiciones a proveedores'));

-- Difusor y Spray, con stock 0 y sin proveedor: se venden recién cuando el
-- admin carga el proveedor y la mercadería. Si ya hay uno activo con ese
-- nombre (segunda corrida, o lo cargaron a mano), no se duplica.
insert into public.productos (id, nombre, sort_order)
select x.id::uuid, x.nombre, x.orden
  from (values ('b0000000-0000-4000-8000-000000000901', 'Difusor', 10),
               ('b0000000-0000-4000-8000-000000000902', 'Spray', 20)) x (id, nombre, orden)
 where not exists (select 1 from public.productos p where p.id = x.id::uuid)
   and not exists (select 1 from public.productos p where lower(btrim(p.nombre)) = lower(x.nombre) and p.active);

-- Los precios que dio el estudio, por código de medio. "3 cuotas" es
-- Tarjeta; las dos transferencias, el mismo precio. Sólo para los medios
-- manuales que existan, y sin pisar un precio ya cargado.
insert into public.producto_precios (producto_id, method, precio)
select x.producto::uuid, x.method, x.precio
  from (values ('b0000000-0000-4000-8000-000000000901', 'efectivo', 30000),
               ('b0000000-0000-4000-8000-000000000901', 'transferencia', 31500),
               ('b0000000-0000-4000-8000-000000000901', 'transferencia_bbva', 31500),
               ('b0000000-0000-4000-8000-000000000901', 'tarjeta', 37500),
               ('b0000000-0000-4000-8000-000000000902', 'efectivo', 18500),
               ('b0000000-0000-4000-8000-000000000902', 'transferencia', 19500),
               ('b0000000-0000-4000-8000-000000000902', 'transferencia_bbva', 19500),
               ('b0000000-0000-4000-8000-000000000902', 'tarjeta', 23200)) x (producto, method, precio)
  join public.payment_methods pm on pm.code = x.method and pm.is_manual
  join public.productos p on p.id = x.producto::uuid
on conflict (producto_id, method) do nothing;

-- ------------------------------------------------------------
-- 9. PERMISOS
-- ------------------------------------------------------------
create temp table claves_0090 (
  clave text primary key, etiqueta text not null, ayuda text not null, orden int not null, roles text[] not null
) on commit drop;
insert into claves_0090 values
  -- Sin prometer de más: RLS filtra por tabla, y las ventas entran a la
  -- caja, así que quien ve la caja o la información financiera también
  -- las lee (con su reparto y su comprador). Mismo criterio que el aviso
  -- de finanzas.ver sobre el precio de la membresía.
  ('inventario.ver', 'Ver productos, stock y ventas',
   'Ver los productos con su stock y sus precios, las ventas con el reparto entre el estudio y el proveedor, los movimientos de stock y lo que falta rendirle a cada proveedor. Ojo: las ventas, con su reparto y quién compró, también las ve quien tiene "Ver la caja diaria" o "Ver información financiera", porque entran a la caja. Sacar esta clave no se las esconde a esos roles.', 10, '{admin,recepcion}'),
  ('inventario.vender', 'Vender productos',
   'Registrar la venta de un producto en el mostrador: elige el aroma, el medio de pago y, si hay, el cliente. El precio sale de la lista y la plata entra a la caja. Incluye ver los productos y las ventas.', 15, '{admin,recepcion}'),
  ('inventario.gestionar', 'Cargar productos, precios, stock y proveedores',
   'Dar de alta y modificar productos y sus precios por medio de pago, cargar la mercadería que trae el proveedor, ajustar el stock con un motivo y administrar los proveedores y la parte del estudio de cada uno.', 20, '{admin}'),
  ('inventario.anular', 'Anular una venta de productos',
   'Anular una venta con un motivo: devuelve las unidades al stock y saca el ingreso de la caja. No se puede si la venta ya se le rindió al proveedor.', 22, '{admin}'),
  ('inventario.rendir', 'Registrar el pago a un proveedor',
   'Pagarle al proveedor su parte de las ventas: se carga como gasto en la categoría "Rendiciones a proveedores" y esas ventas quedan rendidas. Pide además "Cargar gastos" (y "Anular gastos" para deshacer un pago).', 24, '{admin}');

insert into public.permission_keys (clave, etiqueta, ayuda, grupo, orden, tipo, legacy_roles, enforce_mode)
select c.clave, c.etiqueta, c.ayuda, 'Inventario', c.orden, 'permiso', c.roles, 'sombra'
  from pg_temp.claves_0090 c
on conflict (clave) do nothing;

-- Primero el tipo (deja de ser 'futuro'), después la matriz: así nunca hay
-- una fila de matriz sobre una clave que la pantalla muestra con candado.
-- (Que la migración pueda escribir la matriz no prueba nada: guard_permisos
-- deja todo cuando auth.uid() es nulo.) El legado queda igual a la matriz:
-- en modo emergencia el mostrador sigue vendiendo.
update public.permission_keys k
   set tipo = 'permiso', etiqueta = c.etiqueta, ayuda = c.ayuda, orden = c.orden, legacy_roles = c.roles
  from pg_temp.claves_0090 c
 where k.clave = c.clave and k.enforce_mode = 'sombra';

-- La matriz, sólo de las que todavía no rigen (las nuevas y las dos de la
-- 0012 la primera vez). En una segunda corrida ya están encendidas y no se
-- pisa lo que se haya cambiado desde Permisos.
delete from public.role_permissions rp
 using pg_temp.claves_0090 c, public.permission_keys k
 where rp.clave = c.clave and k.clave = c.clave and k.enforce_mode = 'sombra'
   and not (rp.role = any(c.roles));
insert into public.role_permissions (role, clave)
select unnest(c.roles), c.clave
  from pg_temp.claves_0090 c
  join public.permission_keys k on k.clave = c.clave and k.enforce_mode = 'sombra'
on conflict do nothing;

-- ver_costos no se enciende (en consignación no hay costo), pero con el
-- módulo ya andando el candado no puede seguir diciendo "el módulo
-- todavía no existe".
update public.permission_keys
   set ayuda = 'Todavía no hace nada: en consignación el estudio no paga la mercadería, así que no hay costo que ver. Queda para el día que se vendan productos propios.'
 where clave = 'inventario.ver_costos' and tipo = 'futuro' and enforce_mode = 'sombra';

do $encender$
declare v_n int;
begin
  update public.permission_keys set enforce_mode = 'activo'
   where clave in (select clave from pg_temp.claves_0090) and enforce_mode = 'sombra';
  get diagnostics v_n = row_count;
  if exists (select 1 from public.permission_keys
              where clave in (select clave from pg_temp.claves_0090) and enforce_mode <> 'activo') then
    raise exception 'Alguna de las cinco claves de Inventario quedó sin encender.';
  end if;
  raise notice 'Encendidas % claves de Inventario.', v_n;
end
$encender$;

-- ------------------------------------------------------------
-- 10. CÓMO QUEDÓ
-- ------------------------------------------------------------
do $despues$
declare v_detalle text;
begin
  select string_agg(format('%s para %s', e.clave, e.rol), '; ')
    into v_detalle
    from (values
      ('inventario.ver', 'admin', true), ('inventario.ver', 'recepcion', true),
      ('inventario.ver', 'profesor', false), ('inventario.ver', 'alumno', false),
      ('inventario.vender', 'admin', true), ('inventario.vender', 'recepcion', true),
      ('inventario.vender', 'profesor', false), ('inventario.vender', 'alumno', false),
      ('inventario.gestionar', 'admin', true), ('inventario.gestionar', 'recepcion', false),
      ('inventario.gestionar', 'profesor', false), ('inventario.gestionar', 'alumno', false),
      ('inventario.anular', 'admin', true), ('inventario.anular', 'recepcion', false),
      ('inventario.anular', 'profesor', false), ('inventario.anular', 'alumno', false),
      ('inventario.rendir', 'admin', true), ('inventario.rendir', 'recepcion', false),
      ('inventario.rendir', 'profesor', false), ('inventario.rendir', 'alumno', false),
      ('inventario.ver_costos', 'admin', true), ('inventario.ver_costos', 'recepcion', false),
      ('inventario.ver_costos', 'profesor', false), ('inventario.ver_costos', 'alumno', false)
    ) e (clave, rol, debe)
    join public.permission_keys k on k.clave = e.clave
   where e.debe is distinct from (
           case when k.enforce_mode = 'activo'
                then exists (select 1 from public.role_permissions rp where rp.role = e.rol and rp.clave = e.clave)
                else e.rol = any(k.legacy_roles) end);
  if v_detalle is not null then
    raise notice 'La matriz no quedó como se decidió (en una segunda corrida puede ser un cambio hecho desde la pantalla): %', v_detalle;
  end if;

  select string_agg(x, ', ') into v_detalle
    from unnest(array['inventario.ver', 'inventario.vender', 'inventario.gestionar', 'inventario.anular',
                      'inventario.rendir', 'gastos.cargar', 'gastos.anular', 'caja.ver', 'finanzas.ver']) x
   where not exists (select 1 from public.permission_keys k where k.clave = x);
  if v_detalle is not null then
    raise exception 'Estas claves las usa la 0090 y no existen: %', v_detalle;
  end if;

  -- La 0090 no puede sumar ni una fila a perm_diff(). Si ya había deriva
  -- de antes, se avisó arriba y se deja como estaba.
  if exists (select * from public.perm_diff() except select * from pg_temp.perm_diff_antes) then
    raise exception 'La 0090 cambió un permiso en sombra: %',
      (select string_agg(d.rol || ' · ' || d.clave, ', ')
         from (select * from public.perm_diff() except select * from pg_temp.perm_diff_antes) d);
  end if;

  -- has_table_privilege y no information_schema: ésta sólo muestra los
  -- permisos que quien pregunta otorgó o recibió, y anon hereda los de
  -- PUBLIC, así que preguntarle a anon cubre los dos.
  select string_agg(t.n || ' (' || t.quien || ')', ', ') into v_detalle
    from (select n, 'anon' as quien
            from unnest(array['proveedores', 'productos', 'producto_precios', 'ventas_productos',
                              'stock_movimientos', 'rendiciones', 'rendicion_ventas',
                              'ventas_productos_estado', 'rendiciones_estado']) n
           where has_table_privilege('anon', 'public.' || n, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
          union all
          select n, 'authenticated'
            from unnest(array['proveedores', 'productos', 'producto_precios', 'ventas_productos',
                              'stock_movimientos', 'rendiciones', 'rendicion_ventas',
                              'ventas_productos_estado', 'rendiciones_estado']) n
           where has_table_privilege('authenticated', 'public.' || n, 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
              or not has_table_privilege('authenticated', 'public.' || n, 'SELECT')) t;
  if v_detalle is not null then
    raise exception 'Quedaron tablas o vistas del módulo abiertas de más (o sin lectura): %', v_detalle;
  end if;

  if exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace
              and c.relname in ('proveedores', 'productos', 'producto_precios', 'ventas_productos',
                                'stock_movimientos', 'rendiciones', 'rendicion_ventas')
              and not c.relrowsecurity) then
    raise exception 'Una tabla del módulo quedó sin RLS.';
  end if;

  select string_agg(p.oid::regprocedure::text, ', ') into v_detalle
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('rendicion_vigente', 'venta_rendida', 'guardar_proveedor', 'guardar_producto',
                       'mover_stock', 'vender_producto', 'anular_venta', 'rendir_proveedor',
                       'anular_rendicion', 'guard_gasto_de_rendicion')
     and (   not p.prosecdef
          or not coalesce(p.proconfig, '{}') @> array['search_path=""']
          or has_function_privilege('anon', p.oid, 'EXECUTE')
          or (p.proname <> 'guard_gasto_de_rendicion'
              and not has_function_privilege('authenticated', p.oid, 'EXECUTE'))
          or (p.proname = 'guard_gasto_de_rendicion'
              and has_function_privilege('authenticated', p.oid, 'EXECUTE')));
  if v_detalle is not null then
    raise exception 'Funciones del módulo mal cerradas: %', v_detalle;
  end if;

  if has_sequence_privilege('anon', pg_get_serial_sequence('public.ventas_productos', 'numero'), 'USAGE, SELECT, UPDATE')
     or has_sequence_privilege('authenticated', pg_get_serial_sequence('public.ventas_productos', 'numero'), 'USAGE, SELECT, UPDATE') then
    raise exception 'La numeración de ventas quedó abierta al navegador.';
  end if;

  if not exists (select 1 from pg_trigger
                  where tgname = 'expenses_rendicion_fija' and tgrelid = 'public.expenses'::regclass)
     or not exists (select 1 from pg_trigger
                  where tgname = 'ventas_productos_dia_cerrado' and tgrelid = 'public.ventas_productos'::regclass) then
    raise exception 'Falta uno de los dos disparadores de la 0090.';
  end if;
end
$despues$;

drop view if exists pg_temp.ref_libro_0075, pg_temp.ref_libro_0090, pg_temp.ref_resultado_0020,
  pg_temp.ref_resultado_0090, pg_temp.ref_ingresos_0016, pg_temp.ref_ingresos_0090;

-- PostgREST se entera solo de las tablas y funciones nuevas en Supabase;
-- esto es por las dudas, y se entrega recién con el commit.
notify pgrst, 'reload schema';

commit;

-- Lo que el SQL Editor muestra al terminar (no depender del NOTICE, que el
-- Editor puede no mostrar). Después del ensayo con rollback tiene que dar
-- las tres claves de siempre en sombra y modulo = false; después del commit,
-- las seis con las cinco en 'activo', perm_diff = 0 y modulo = true.
select k.clave, k.tipo, k.enforce_mode,
       array(select rp.role from public.role_permissions rp where rp.clave = k.clave order by 1) as roles,
       (select count(*) from public.perm_diff()) as perm_diff,
       to_regclass('public.ventas_productos') is not null as modulo
  from public.permission_keys k
 where k.grupo = 'Inventario'
 order by k.orden;

-- ============================================================
-- CÓMO VERIFICAR (en el SQL Editor, después de correrla; todo sólo lee)
--
--   -- 1. La tabla del select de arriba: 6 filas, las 5 nuevas/encendidas
--   --    en 'activo' con su matriz (ver y vender: admin y recepcion; el
--   --    resto: admin), ver_costos 'futuro' con {admin}, perm_diff = 0 y
--   --    modulo = true.
--
--   -- 2. El libro no tiene ventas todavía, y los totales son los de antes:
--   select origen, count(*), sum(monto) from public.account_ledger group by 1 order by 1;
--   → cobro, gasto y movimiento, como antes; ninguna fila 'venta'.
--   (Más adelante, ojo: desde el Editor, sin sesión, monthly_revenue y
--   resultado_mensual NO muestran las ventas, porque su rama pide
--   finanzas.ver y sin sesión can() dice que no. Para verlas como el
--   tablero, el patrón del punto 6. El libro sí las muestra.)
--
--   -- 3. Las cinco vistas, con security_invoker:
--   select relname, reloptions from pg_class
--    where relname in ('account_ledger', 'resultado_mensual', 'monthly_revenue',
--                      'ventas_productos_estado', 'rendiciones_estado');
--   → security_invoker=on en las cinco.
--
--   -- 4. Los dos productos con sus cuatro precios:
--   select p.nombre, pp.method, pp.precio
--     from public.productos p join public.producto_precios pp on pp.producto_id = p.id
--    order by p.sort_order, pp.method;
--   → Difusor 30000 / 31500 / 31500 / 37500 y Spray 18500 / 19500 / 19500 / 23200
--     (efectivo, transferencia, transferencia_bbva, tarjeta).
--
--   -- 5. Los disparadores de expenses:
--   select tgname from pg_trigger where tgrelid = 'public.expenses'::regclass and not tgisinternal;
--   → están expenses_dia_cerrado, expenses_rendicion_fija y expenses_stamp.
--
--   -- 6. La caja, como la ve el admin (patrón de la 0087): igual que antes.
--   begin;
--   select set_config('request.jwt.claims',
--     json_build_object('sub', (select id from public.profiles where role = 'admin' and active
--                                order by created_at limit 1), 'role', 'authenticated')::text, true);
--   set local role authenticated;
--   select * from public.caja_control();
--   select name, saldo from public.account_balances order by name;
--   rollback;
--
-- Y en la pantalla, con el admin: Productos aparece en el menú después de
-- Pagos, con Difusor y Spray "Sin stock" y "Falta el proveedor". Pagos y
-- el tablero muestran los mismos números que antes (todavía no hay
-- ventas). Para que el mostrador pueda vender, el admin tiene que cargar
-- el proveedor real (con su % para el estudio), elegirlo en cada producto
-- y cargar la mercadería.
-- ============================================================

-- ============================================================
-- PARA VOLVER ATRÁS
--
-- NIVEL 1 — apagar el módulo sin tocar la plata. Las ventas ya hechas
-- siguen en la caja y en el resultado, y nadie puede vender, cargar,
-- anular ni rendir. Hay que vaciar la matriz Y el legado: en modo
-- emergencia mis_permisos() responde el legado sin mirar la matriz, y la
-- 0090 lo dejó igual a ella. Si se borra sólo la matriz, tirar el freno
-- de mano después vuelve a prender el módulo sin avisar (probado).
-- Son claves en 'activo': perm_diff() no las mira y no suma filas.
--
--   begin;
--   delete from public.role_permissions
--    where clave in ('inventario.vender', 'inventario.gestionar', 'inventario.anular', 'inventario.rendir');
--   update public.permission_keys set legacy_roles = '{}'
--    where clave in ('inventario.vender', 'inventario.gestionar', 'inventario.anular', 'inventario.rendir');
--   commit;
--
-- El disparador expenses_rendicion_fija sigue protegiendo los gastos de
-- las rendiciones que ya existan, y es lo correcto. Para volver a
-- prenderlo hay que restituir las dos cosas: las filas de la matriz
-- (desde la pantalla Permisos o con el insert de la sección 9) y el
-- legado ('{admin,recepcion}' en vender; '{admin}' en las otras tres).
--
-- NIVEL 2 — sacar todo. Sólo sirve si NO hay ventas cobradas (sacar la
-- rama del libro haría desaparecer esa plata de la caja y del
-- resultado); la primera sentencia corta si las hay. Las tablas no se
-- borran: quedan vacías o con su historia, sin funciones que las
-- escriban.
--
--   begin;
--   do $$ begin
--     if exists (select 1 from public.ventas_productos where status = 'pagado') then
--       raise exception 'Hay % ventas cobradas: al volver atrás esa plata sale de la caja y del resultado.',
--         (select count(*) from public.ventas_productos where status = 'pagado');
--     end if;
--   end $$;
--   create or replace view public.account_ledger with (security_invoker = on) as
--   select 'cobro'::text            as origen,
--          p.id                     as ref_id,
--          p.account_id,
--          p.paid_at                as at,
--          p.paid_date              as dia,
--          'ingreso'::text          as sentido,
--          p.amount                 as monto,
--          coalesce(nullif(p.concept, ''), 'Cobro') as concepto,
--          coalesce(pm.name, p.method) as medio,
--          s.name                   as contraparte,
--          p.receipt_number::text   as comprobante
--     from public.payments p
--     left join public.students s on s.id = p.student_id
--     left join public.payment_methods pm on pm.code = p.method
--    where p.status = 'pagado' and p.account_id is not null and p.paid_at is not null
--   union all
--   select 'gasto', g.id, g.account_id, g.paid_at, g.paid_date, 'egreso',
--          g.amount,
--          coalesce(nullif(g.detail, ''), c.name, 'Gasto'),
--          coalesce(gm.name, g.method), nullif(g.supplier, ''), nullif(g.doc_number, '')
--     from public.expenses g
--     left join public.expense_categories c on c.id = g.category_id
--     left join public.payment_methods gm on gm.code = g.method
--    where g.status = 'pagado' and g.account_id is not null
--   union all
--   select 'movimiento', m.id, m.from_account_id, m.at, m.dia, 'egreso',
--          m.amount, coalesce(nullif(m.concept, ''), m.kind), null, null, null
--     from public.account_movements m
--    where m.status = 'vigente' and m.from_account_id is not null
--   union all
--   select 'movimiento', m.id, m.to_account_id, m.at, m.dia, 'ingreso',
--          m.amount, coalesce(nullif(m.concept, ''), m.kind), null, null, null
--     from public.account_movements m
--    where m.status = 'vigente' and m.to_account_id is not null;
--   create or replace view public.resultado_mensual with (security_invoker = on) as
--   with meses as (
--     select to_char(paid_date, 'YYYY-MM') as mes, sum(amount) as ingresos,
--            0::numeric as egresos_pagados, 0::numeric as egresos_devengados
--       from public.payments where status = 'pagado' and paid_date is not null
--      group by 1
--     union all
--     select to_char(paid_date, 'YYYY-MM'), 0, sum(amount), 0
--       from public.expenses where status = 'pagado' and paid_date is not null
--      group by 1
--     union all
--     select to_char(fecha, 'YYYY-MM'), 0, 0, sum(amount)
--       from public.expenses where status in ('pendiente', 'pagado')
--      group by 1
--   )
--   select mes,
--          sum(ingresos)::numeric(14, 2)           as ingresos,
--          sum(egresos_pagados)::numeric(14, 2)    as egresos_pagados,
--          sum(egresos_devengados)::numeric(14, 2) as egresos_devengados,
--          (sum(ingresos) - sum(egresos_pagados))::numeric(14, 2) as neto,
--          (select public.can('finanzas.ver')) as ve_ingresos,
--          (select public.can('gastos.ver'))   as ve_egresos
--     from meses
--    group by mes
--    order by mes;
--   create or replace view public.monthly_revenue with (security_invoker = on) as
--   select
--     to_char(
--       (paid_at at time zone 'America/Argentina/Buenos_Aires'),
--       'YYYY-MM'
--     ) as month,
--     sum(amount)::numeric(14, 2) as amount
--   from public.payments
--   where status = 'pagado' and paid_at is not null
--   group by 1
--   order by 1;
--   drop view if exists public.ventas_productos_estado, public.rendiciones_estado;
--   drop function if exists public.vender_producto(uuid, integer, text, text, uuid, text, text, uuid, numeric);
--   drop function if exists public.anular_venta(uuid, text);
--   drop function if exists public.rendir_proveedor(uuid, uuid[], text, uuid, date, text);
--   drop function if exists public.anular_rendicion(uuid, text);
--   drop function if exists public.mover_stock(uuid, text, integer, text);
--   drop function if exists public.guardar_producto(uuid, text, text, uuid, boolean, integer, jsonb, text[]);
--   drop function if exists public.guardar_proveedor(uuid, text, text, text, numeric, boolean);
--   drop trigger if exists expenses_rendicion_fija on public.expenses;
--   drop function if exists public.guard_gasto_de_rendicion();
--   drop function if exists public.venta_rendida(uuid);
--   drop function if exists public.rendicion_vigente(uuid);
--   drop trigger if exists ventas_productos_dia_cerrado on public.ventas_productos;
--   delete from public.permission_keys where clave in ('inventario.vender', 'inventario.anular', 'inventario.rendir');
--   delete from public.role_permissions where clave in ('inventario.ver', 'inventario.gestionar') and role <> 'admin';
--   insert into public.role_permissions (role, clave) values ('admin', 'inventario.ver'), ('admin', 'inventario.gestionar')
--   on conflict do nothing;
--   update public.permission_keys
--      set tipo = 'futuro', enforce_mode = 'sombra', legacy_roles = '{admin}',
--          etiqueta = case clave when 'inventario.ver' then 'Ver el inventario' else 'Gestionar stock y movimientos de inventario' end,
--          ayuda = case clave when 'inventario.ver' then 'MÓDULO FUTURO. Es ''gestionar inventario'' del punto 11.' else 'MÓDULO FUTURO.' end,
--          orden = case clave when 'inventario.ver' then 10 else 20 end
--    where clave in ('inventario.ver', 'inventario.gestionar');
--   update public.permission_keys
--      set ayuda = 'MÓDULO FUTURO. Dato sensible por columna: va en tabla satélite, patrón student_private.'
--    where clave = 'inventario.ver_costos';
--   commit;
--
-- Después: `select count(*) from public.perm_diff();` da 0, y la 0090 se
-- puede volver a aplicar limpia. Ojo: si para entonces el admin ya había
-- cargado precios y proveedores, quedan en las tablas y la 0090 no los
-- pisa al volver.
--
-- El freno de mano de siempre, si hay gente esperando:
--   update public.permission_config set value = 'emergencia' where key = 'modo';
-- (con el legado igual a la matriz, el mostrador sigue vendiendo; si antes
-- se apagó el módulo con el NIVEL 1, sigue apagado, porque ese nivel
-- vacía también el legado).
-- ============================================================
