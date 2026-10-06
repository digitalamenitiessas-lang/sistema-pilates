-- ============================================================
-- 0092 — El precio por letra, el dato que se pide al vender y la parte
--        del estudio sobre el precio de efectivo
--
-- EL PEDIDO (el estudio, vía Matías, 06/10)
--
-- Llega un proveedor nuevo, Accesorios Chini, con aros, collares, anillos
-- y pulseras. Cada pieza trae en la etiqueta una LETRA (A..K) y un
-- CÓDIGO. La letra define el precio —que además depende del medio de
-- pago: efectivo, transferencia +10%, tarjeta +30%—; el código dice qué
-- pieza es. Al vender se elige la letra de una lista y se escribe el
-- código a mano, "para tener registrado bien qué aro vendo". El stock es
-- un número por producto (cuántos aros), como el de los difusores.
--
-- Y sobre la plata: el pedido de Chini dice "la comisión siempre sobre
-- precio de efectivo", y Matías le preguntó al estudio si con los
-- difusores era igual. La respuesta, textual: "Sí, desde ese valor el 30%
-- es del estudio". Las dos cosas están CONFIRMADAS. La regla igual queda
-- configurable por proveedor: si un proveedor futuro cobra sobre lo
-- cobrado, se elige desde Productos → Proveedores, sin otra migración.
--
-- LA REGLA
--
-- El estudio se queda el % calculado sobre el precio de EFECTIVO, cobre
-- como cobre. El proveedor recibe el resto de ese precio, y el recargo
-- de la transferencia o la tarjeta queda entero para el estudio:
--
--   proveedor = base − round(base × % / 100, 2)
--   estudio   = cobrado − proveedor
--
-- Un aro letra A cobrado con tarjeta: $20.280 cobrado, base $15.600 →
-- proveedor $10.920, estudio $9.360.
--
-- Es UNA sola fórmula con dos bases, no dos fórmulas: la regla de la 0090
-- ("sobre lo cobrado") es la misma cuenta con base = lo cobrado, y da
-- exactamente lo que daba (`estudio = round(total × % / 100, 2)`). Va en
-- una función pura, `reparto_de_venta`, que usa la venta y que esta
-- migración prueba antes del commit con los números del estudio. Así no
-- hace falta simular una venta en producción, que gastaría números V-n.
--
-- Sobre qué se calcula es un dato del PROVEEDOR (`comision_sobre`:
-- 'efectivo' o 'cobrado'), no una constante: lo que es un número o una
-- regla de negocio se configura. Nace en 'efectivo' para todos, que es lo
-- que confirmó el estudio. Cada venta guarda en su foto la base, la regla
-- y el % con que se hizo, y un CHECK exige que el reparto salga de esa
-- foto: la rendición no puede salir de una cuenta distinta.
--
-- 'efectivo' queda escrito como código de medio adentro de la venta, a
-- propósito. La regla del estudio es literalmente "sobre el efectivo", y
-- el código existe desde la 0011. Una FK a payment_methods no sirve: no
-- hay forma de decir "lo cobrado" con una FK. La guarda exige que exista.
--
-- POR QUÉ LA LETRA ES DEL PROVEEDOR Y NO DEL PRODUCTO
--
-- Chini tiene UNA tabla para aros, collares, anillos y pulseras. Por
-- producto serían 4 × 11 × 4 = 176 precios para mantener iguales a mano.
-- La tabla nueva `proveedor_letras` guarda letra × medio → precio, y el
-- producto dice si su precio sale de ahí (`precio_por_letra`). El nombre
-- del dato que se escribe al vender también es del producto
-- (`dato_venta`): "Aroma" para el difusor, "Código" para un aro. Se sigue
-- guardando en la columna `aroma` de la venta: renombrarla tocaría el
-- libro de la caja, y el texto del libro ("Venta: Aros · AR-0012") sale
-- bien igual. La letra no entra en ese texto: es una limitación aceptada.
--
-- LO QUE NO SE TOCA
--
--   · `account_ledger`, `resultado_mensual` y `monthly_revenue`: la caja
--     suma la venta por su monto, y eso no cambia. Se saca una foto del
--     libro antes y se exige que dé lo mismo después.
--   · Las ventas ya hechas: conservan su foto, calculada sobre lo cobrado.
--     No se recalculan ni se les completa nada (completarlas dispararía
--     `guard_dia_cerrado` sobre datos reales). Las columnas nuevas quedan
--     nulas y la vista las completa: antes de la 0092 la base siempre fue
--     lo cobrado y el dato siempre fue "Aroma". Al 06/10 no había
--     ninguna venta en producción (lo consultó Matías), así que no queda
--     nada calculado con la regla vieja. Si al correr esto apareciera
--     alguna, CÓMO VERIFICAR (punto 5) la muestra.
--   · `rendir_proveedor`, `anular_venta`, `anular_rendicion` y
--     `mover_stock`: la rendición suma `parte_proveedor`, que ya trae la
--     regla nueva.
--   · Ninguna clave de permiso nueva: cargar letras va con
--     inventario.gestionar y vender por letra con inventario.vender.
--
-- QUÉ CAMBIA PARA EL DIFUSOR
--
-- Desde la 0092, un difusor cobrado con tarjeta ($37.500) le deja al
-- proveedor $21.000 (70% de $30.000) y no $26.250; el estudio se queda
-- $16.500. En efectivo da lo mismo que antes: $21.000 / $9.000.
--
-- UN PRODUCTO SIN PRECIO EN EFECTIVO NO SE PUEDE VENDER con tarjeta ni
-- transferencia si su proveedor calcula sobre el efectivo. Para que eso
-- no aparezca de golpe en el mostrador, esta migración CORTA si hay algún
-- producto activo de precio fijo, con proveedor y con precios, que no
-- tenga el de efectivo. El prevuelo los lista: cargarles el precio antes.
--
-- ORDEN: PRIMERO EL DEPLOY, DESPUÉS ESTO
--
-- La pantalla nueva anda con las dos bases: sin la 0092 vende y muestra
-- todo como hoy (sin letras, "sobre lo cobrado"). La vieja con la base
-- nueva vende bien los difusores, pero su vista previa del reparto con
-- tarjeta o transferencia muestra la cuenta vieja (el comprobante no: sale
-- de la base), dice "sobre lo cobrado" en el proveedor y no puede vender
-- los productos por letra. Así que: mergear a main, esperar el deploy de
-- Vercel y recién ahí correr esto, fuera del horario del mostrador
-- (toma un lock exclusivo sobre productos y ventas por un instante).
--
-- EL PREVUELO (sólo lee; corre igual antes y después de la 0092)
--
--   with h (firma, antes) as (values
--     ('public.vender_producto(uuid, integer, text, text, uuid, text, text, uuid, numeric)', '8237f5680ad382f2527e37b6c702911b'),
--     ('public.guardar_producto(uuid, text, text, uuid, boolean, integer, jsonb, text[])', '2f1b90b909b9b4b8b6f5ff17dc6b36c9'),
--     ('public.guardar_proveedor(uuid, text, text, text, numeric, boolean)', '41bc687d2bd16ed23f524bfb17224376'))
--   select 'huella' as que, h.firma as nombre,
--          case when to_regprocedure(h.firma) is null then 'no existe (bien si ya corrió la 0092)'
--               when (select md5(btrim(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
--                       from pg_proc p where p.oid = to_regprocedure(h.firma)) = h.antes then 'la de la 0090: bien'
--               else 'DISTINTA: mandar  select prosrc from pg_proc where oid = to_regprocedure(''' || h.firma || ''');' end as como_esta
--     from h
--   union all
--   select 'sobrecargas', p.proname, count(*)::text || ' (tiene que ser 1)'
--     from pg_proc p
--    where p.pronamespace = 'public'::regnamespace
--      and p.proname in ('vender_producto', 'guardar_producto', 'guardar_proveedor')
--    group by p.proname
--   union all
--   select 'medio efectivo', coalesce(max(m.name), '(no existe)'),
--          case when count(*) = 0 then 'FALTA: la 0092 corta'
--               when not bool_and(m.is_manual) then 'NO ES MANUAL: la 0092 corta'
--               when not bool_and(m.active) then 'dado de baja: avisa, no corta'
--               else 'bien' end
--     from public.payment_methods m where m.code = 'efectivo'
--   union all
--   select 'proveedor chini', pr.nombre, case when pr.active then 'activo' else 'dado de baja' end
--     from public.proveedores pr where pr.nombre ~* '\mchini\M'
--   union all
--   select 'producto con ese nombre', p.nombre, 'ya existe: la 0092 no lo convierte ni lo duplica'
--     from public.productos p
--    where p.active and lower(btrim(p.nombre)) in ('aros', 'aro', 'collares', 'collar', 'anillos', 'anillo', 'pulseras', 'pulsera')
--   union all
--   select 'sin precio en efectivo', p.nombre, 'cargarle el precio en efectivo ANTES: si no, la 0092 corta'
--     from public.productos p
--    where p.active and p.proveedor_id is not null
--      and exists (select 1 from public.producto_precios pp where pp.producto_id = p.id)
--      and not exists (select 1 from public.producto_precios pp where pp.producto_id = p.id and pp.method = 'efectivo');
--
-- Bien: tres huellas "de la 0090", una sobrecarga por nombre, efectivo
-- "bien", y ninguna fila "sin precio en efectivo". Ninguna o una fila
-- "proveedor chini" (con dos o más, la 0092 corta: no adivina cuál es).
--
-- Ejecutar completo en el SQL Editor. REQUIERE la 0012, la 0084, la 0089
-- y la 0090. Ensayar antes con `rollback;` en lugar del `commit;` final:
-- en el Editor el ensayo termina con "relation resumen_0092 does not
-- exist" (el rollback se lleva también esa tabla), y eso quiere decir que
-- no quedó nada aplicado. Mirar la tabla que devuelve el último `select`:
-- no depender de los NOTICE, que el Editor puede no mostrar.
-- ============================================================

-- El resumen se lee después del commit, en el último select.
create temp table if not exists resumen_0092 (orden int, que text, nombre text, como_quedo text);
truncate pg_temp.resumen_0092;

begin;

-- Los ALTER de abajo toman un lock exclusivo sobre productos, ventas y
-- proveedores. Si hay una venta a medio hacer, mejor cortar en 5 segundos
-- con un error claro (y reintentar) que dejar el mostrador colgado detrás.
set local lock_timeout = '5s';

-- ------------------------------------------------------------
-- 0. GUARDAS
--
-- Cortan con un mensaje que dice qué falta, antes de tocar nada.
-- ------------------------------------------------------------

-- Sólo el catálogo, sin leer ninguna tabla: si la 0090 no corrió, el lock
-- de abajo fallaría con un "relation does not exist" que no dice nada.
do $tablas$
begin
  if to_regclass('public.productos') is null or to_regclass('public.ventas_productos') is null
     or to_regclass('public.producto_precios') is null or to_regclass('public.proveedores') is null
     or to_regclass('public.stock_movimientos') is null or to_regclass('public.rendiciones') is null
     or to_regclass('public.rendicion_ventas') is null then
    raise exception 'Faltan las tablas de productos. Revisar si corrió la 0090.';
  end if;
end
$tablas$;

-- Todo de una vez y en el orden en que los usa vender_producto (primero la
-- fila del producto, después la venta, los precios y el proveedor). Tomar
-- los locks de a uno, a medida que llega cada ALTER, puede cruzarse con
-- una venta que ya tiene el producto y espera al proveedor: un deadlock,
-- y Postgres puede elegir abortar la venta del mostrador en vez de esto.
lock table public.productos, public.ventas_productos, public.producto_precios, public.proveedores
  in access exclusive mode;

-- Las funciones que reemplaza esta migración, por su huella: el md5 del
-- cuerpo sin comentarios y con los espacios juntados (el patrón de la
-- 0086 y la 0091). `antes` es la de la 0090 del repo, `esta` la que deja
-- esta migración (segunda corrida). Producción no siempre es el repo —la
-- 0084 cortó por eso—, y `create or replace` no compara nada: pisar una
-- versión que alguien cambió desharía ese cambio sin avisar.
create temp table huellas_0092 (
  nombre text primary key,
  vieja  text,          -- la firma que se borra (null: la función es nueva)
  nueva  text not null,
  origen text not null,
  antes  text,
  esta   text not null
) on commit drop;
insert into huellas_0092 values
  ('vender_producto',
   'public.vender_producto(uuid, integer, text, text, uuid, text, text, uuid, numeric)',
   'public.vender_producto(uuid, integer, text, text, uuid, text, text, uuid, numeric, text)',
   '0090', '8237f5680ad382f2527e37b6c702911b', '6512ffa83a50267d9c39f2c7d8ba1bae'),
  ('guardar_producto',
   'public.guardar_producto(uuid, text, text, uuid, boolean, integer, jsonb, text[])',
   'public.guardar_producto(uuid, text, text, uuid, boolean, integer, jsonb, text[], boolean, text)',
   '0090', '2f1b90b909b9b4b8b6f5ff17dc6b36c9', 'c04b62ae06f4cf960a913679cd8cdf3c'),
  ('guardar_proveedor',
   'public.guardar_proveedor(uuid, text, text, text, numeric, boolean)',
   'public.guardar_proveedor(uuid, text, text, text, numeric, boolean, text, jsonb)',
   '0090', '41bc687d2bd16ed23f524bfb17224376', '6685a9bf833e8bc73e72da0d77788553'),
  ('reparto_de_venta', null,
   'public.reparto_de_venta(numeric, numeric, numeric)',
   '0092', null, '7135a5dfb410d0a4d4846728eebe145b');

-- La versión del repo de la vista de ventas, para reconocer la viva.
create or replace temp view ref_estado_0090 with (security_invoker = on) as
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
            when v.parte_proveedor = 0 then 'sin_parte'
            else 'a_rendir' end as estado
  from public.ventas_productos v
  left join public.payment_methods pm on pm.code = v.method
  left join public.profiles pr on pr.id = v.vendido_por
  left join lateral (select public.venta_rendida(v.id) as rendicion_id) r on true;

do $guarda$
declare
  h        record;
  v_vieja  text;
  v_nueva  text;
  v_otras  int;
  v_detalle text;
  v_pm     record;
begin
  if to_regprocedure('public.can(text)') is null or to_regprocedure('public.perm_diff()') is null then
    raise exception 'Falta el motor de permisos. Revisar si corrieron la 0012 y la 0014.';
  end if;
  if to_regprocedure('public.pesos(numeric)') is null then
    raise exception 'Falta pesos(). Revisar si corrió la 0084.';
  end if;
  if to_regprocedure('public.venta_rendida(uuid)') is null
     or to_regclass('public.ventas_productos_estado') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'ventas_productos'
                       and column_name = 'parte_proveedor') then
    raise exception 'La 0090 no está completa (falta venta_rendida, la vista de ventas o ventas_productos.parte_proveedor).';
  end if;

  -- plpgsql no valida las columnas al crear la función: si producción no
  -- tuviera alguna, la 0092 entraría igual y la primera venta fallaría en
  -- el mostrador. Se mira acá.
  select string_agg(x.t || '.' || x.c, ', ') into v_detalle
    from (values ('proveedores', 'nombre'), ('proveedores', 'pct_estudio'), ('proveedores', 'active'),
                 ('productos', 'nombre'), ('productos', 'stock'), ('productos', 'proveedor_id'),
                 ('productos', 'active'), ('productos', 'aromas'), ('productos', 'stock_aviso'),
                 ('productos', 'sort_order'),
                 ('producto_precios', 'precio'), ('producto_precios', 'method'),
                 ('payment_methods', 'is_manual'), ('payment_methods', 'active'), ('payment_methods', 'name'),
                 ('payment_methods', 'default_account_id'),
                 ('accounts', 'name'), ('students', 'name'), ('profiles', 'full_name')) x (t, c)
   where not exists (select 1 from information_schema.columns ic
                      where ic.table_schema = 'public' and ic.table_name = x.t and ic.column_name = x.c);
  if v_detalle is not null then
    raise exception 'A la base le faltan columnas que usa la 0092: %', v_detalle;
  end if;

  -- La regla nueva busca el precio del medio 'efectivo'. Si no existe, o
  -- no es manual (guardar_producto le rechazaría el precio: "se acredita
  -- solo"), nada sobre efectivo se podría vender con otro medio.
  select * into v_pm from public.payment_methods where code = 'efectivo';
  if not found then
    raise exception 'No está el medio de pago ''efectivo'' (0011), y la parte del estudio se calcula sobre su precio. No se tocó nada.';
  end if;
  if not v_pm.is_manual then
    raise exception 'El medio ''efectivo'' no es manual: no se le puede poner precio de mostrador, y la parte del estudio se calcula sobre ese precio. No se tocó nada.';
  end if;

  for h in select * from pg_temp.huellas_0092 loop
    v_vieja := null;
    v_nueva := null;
    if h.vieja is not null then
      select md5(btrim(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
        into v_vieja from pg_proc p where p.oid = to_regprocedure(h.vieja);
    end if;
    select md5(btrim(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
      into v_nueva from pg_proc p where p.oid = to_regprocedure(h.nueva);

    if v_vieja is not null and v_vieja is distinct from h.antes then
      raise exception '% no es la de la % (su huella es %): la redefinió otra migración o se tocó a mano, y la 0092 la borraría sin avisar. No se tocó nada. Para seguir hace falta esa versión: mandá el resultado de  select prosrc from pg_proc where oid = to_regprocedure(''%'');',
        h.vieja, h.origen, v_vieja, h.vieja;
    end if;
    if v_nueva is not null and v_nueva is distinct from h.esta then
      raise exception '% ya existe y no es la de la 0092 (su huella es %): alguien la creó o la cambió, y pisarla desharía eso sin avisar. No se tocó nada. Mandá el resultado de  select prosrc from pg_proc where oid = to_regprocedure(''%'');',
        h.nueva, v_nueva, h.nueva;
    end if;
    if v_vieja is null and v_nueva is null and h.antes is not null then
      raise exception 'Falta public.%: ni la versión de la 0090 ni la de la 0092. Revisar si corrió la 0090.', h.nombre;
    end if;

    -- Cualquier otra versión con el mismo nombre dejaría a PostgREST con
    -- dos candidatas, y el mostrador no podría vender (PGRST203).
    select count(*) into v_otras
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname = h.nombre
       and p.oid is distinct from to_regprocedure(h.nueva)
       and (h.vieja is null or p.oid is distinct from to_regprocedure(h.vieja));
    if v_otras > 0 then
      raise exception 'Hay % versión(es) de public.% además de la de la 0090 y la de la 0092. PostgREST no sabría a cuál llamar. No se tocó nada. Mandá  select oid::regprocedure from pg_proc where proname = ''%'';',
        v_otras, h.nombre, h.nombre;
    end if;
  end loop;

  -- La primera vez, la vista viva tiene que ser la de la 0090. (Si ya
  -- están las columnas nuevas, se compara contra las dos versiones más
  -- abajo, después de agregarlas: la de la 0092 las usa.)
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'ventas_productos' and column_name = 'letra')
     and pg_get_viewdef('public.ventas_productos_estado'::regclass, true)
         is distinct from pg_get_viewdef('pg_temp.ref_estado_0090'::regclass, true) then
    raise exception 'public.ventas_productos_estado no es la de la 0090 (md5 de la viva: %): la cambió otra migración o se tocó a mano. No se tocó nada. Mandá  select pg_get_viewdef(''public.ventas_productos_estado'', true);',
      md5(pg_get_viewdef('public.ventas_productos_estado'::regclass, true));
  end if;

  -- Cuál es Chini: el del id fijo, o el único que tenga "chini" como
  -- palabra en el nombre (\m \M: "Bochini" no es Chini). Con dos o más y
  -- ninguno con el id fijo, sembrar las letras en uno al azar sería peor
  -- que no hacer nada.
  if not exists (select 1 from public.proveedores where id = 'd0000000-0000-4000-8000-000000000921')
     and (select count(*) from public.proveedores where nombre ~* '\mchini\M') > 1 then
    raise exception 'Hay más de un proveedor con "Chini" en el nombre (%) y la 0092 no sabe en cuál cargar las letras. Dejá uno solo con ese nombre (renombrá el otro) y volvé a correrla. No se tocó nada.',
      (select string_agg(nombre || case when active then '' else ' (dado de baja)' end, ', ' order by nombre)
         from public.proveedores where nombre ~* '\mchini\M');
  end if;

  -- `create table if not exists` no mira qué hay adentro.
  if to_regclass('public.proveedor_letras') is not null
     and (select count(*) from information_schema.columns
           where table_schema = 'public' and table_name = 'proveedor_letras'
             and column_name in ('proveedor_id', 'letra', 'method', 'precio')) < 4 then
    raise exception 'Ya hay una tabla public.proveedor_letras y no es la de la 0092. Revisar antes de seguir.';
  end if;
end
$guarda$;

-- La red del motor ANTES de tocar nada: la 0092 no puede sumarle filas.
create temp table perm_diff_antes on commit drop as select * from public.perm_diff();

-- Las ventas y el libro, antes. Ninguna de las dos cosas se puede mover.
create temp table foto_ventas on commit drop as
  select id, numero, amount, precio_unitario, cantidad, pct_estudio, parte_estudio, parte_proveedor,
         status, aroma, method, account_id, paid_at
    from public.ventas_productos;
create temp table foto_libro on commit drop as select * from public.account_ledger;

-- Una foto con RLS de por medio sería parcial, y comparar dos parciales no
-- prueba nada. Desde el SQL Editor se ve todo.
do $foto$
declare v_esperadas bigint;
begin
  select (select count(*) from public.payments where status = 'pagado' and account_id is not null and paid_at is not null)
       + (select count(*) from public.expenses where status = 'pagado' and account_id is not null)
       + (select count(*) from public.account_movements where status = 'vigente' and from_account_id is not null)
       + (select count(*) from public.account_movements where status = 'vigente' and to_account_id is not null)
       + (select count(*) from public.ventas_productos where status = 'pagado')
    into v_esperadas;
  if (select count(*) from pg_temp.foto_libro) <> v_esperadas then
    raise exception 'La foto del libro vio % filas y la base tiene %: quien corre esto no ve todo (¿RLS?), o el libro no es el de la 0090. Correrla desde el SQL Editor.',
      (select count(*) from pg_temp.foto_libro), v_esperadas;
  end if;
end
$foto$;

-- ------------------------------------------------------------
-- 1. COLUMNAS Y TABLA
--
-- Con un default constante, ADD COLUMN no reescribe la tabla ni dispara
-- los disparadores de las filas que ya están.
-- ------------------------------------------------------------

-- Sobre qué precio se calcula la parte del estudio. 'efectivo' para todos
-- los que ya existen: lo confirmó el estudio el 06/10 por los difusores.
alter table public.proveedores add column if not exists comision_sobre text not null default 'efectivo';
-- Aparte del ADD: si la columna ya estaba (la VUELTA ATRÁS de nivel 1 la
-- deja con default 'cobrado'), el ADD no la toca. Los proveedores que ya
-- existen NO se cambian en esa segunda corrida: eso se decide desde
-- Proveedores.
alter table public.proveedores alter column comision_sobre set default 'efectivo';
alter table public.proveedores drop constraint if exists proveedores_comision_sobre_valida;
alter table public.proveedores add constraint proveedores_comision_sobre_valida
  check (comision_sobre in ('efectivo', 'cobrado'));

-- Si el precio sale de la letra de la etiqueta (la lista del proveedor), y
-- cómo se llama el dato que se escribe al vender. Los dos con el valor de
-- hoy por defecto: Difusor y Spray siguen exactamente igual.
alter table public.productos add column if not exists precio_por_letra boolean not null default false;
alter table public.productos add column if not exists dato_venta text not null default 'Aroma';
alter table public.productos drop constraint if exists productos_dato_venta_valido;
alter table public.productos add constraint productos_dato_venta_valido
  check (btrim(dato_venta) <> '' and length(dato_venta) <= 30);

-- La foto nueva de cada venta. Nula en todo lo anterior a la 0092: la
-- vista la completa (ver arriba, LO QUE NO SE TOCA).
alter table public.ventas_productos
  add column if not exists letra text,
  add column if not exists dato_nombre text,
  add column if not exists precio_base numeric(14, 2),
  add column if not exists comision_sobre text;
alter table public.ventas_productos drop constraint if exists venta_letra_valida;
alter table public.ventas_productos add constraint venta_letra_valida
  check (letra is null or letra ~ '^[A-Z0-9]{1,4}$');
-- Toda venta nueva cumple la fórmula con su propia foto. Así la foto se
-- explica sola, y la rendición no puede salir de una cuenta distinta. Con
-- 'cobrado' la base TIENE que ser lo cobrado: si no, sería la regla del
-- efectivo con otra etiqueta. Las ventas viejas (comision_sobre nulo)
-- quedan afuera.
alter table public.ventas_productos drop constraint if exists venta_reparto_regla;
alter table public.ventas_productos add constraint venta_reparto_regla check (
  comision_sobre is null or (
    comision_sobre in ('efectivo', 'cobrado')
    and precio_base > 0
    and dato_nombre is not null and btrim(dato_nombre) <> ''
    and (comision_sobre <> 'cobrado' or precio_base = precio_unitario)
    and parte_proveedor = precio_base * cantidad - round(precio_base * cantidad * pct_estudio / 100, 2)));

-- La lista de precios por letra. El mismo patrón que producto_precios: un
-- medio sin fila no se ofrece al vender esa letra.
create table if not exists public.proveedor_letras (
  proveedor_id uuid not null references public.proveedores (id) on delete cascade,
  -- Normalizada (mayúsculas, sin espacios): la etiqueta dice "A" y quien
  -- vende puede escribir "a ".
  letra text not null constraint proveedor_letras_letra_valida check (letra ~ '^[A-Z0-9]{1,4}$'),
  method text not null references public.payment_methods (code) on update cascade on delete cascade,
  precio numeric(14, 2) not null check (precio > 0),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (proveedor_id, letra, method)
);

-- Supabase les da todo a anon y authenticated sobre lo nuevo en public.
-- Se escribe sólo desde guardar_proveedor (definer, pide
-- inventario.gestionar): ninguna política de escritura. La lectura
-- incluye inventario.vender, a diferencia de la de proveedores: el
-- mostrador tiene que ver los precios aunque el rol sólo pueda vender.
alter table public.proveedor_letras enable row level security;
revoke all on table public.proveedor_letras from public, anon, authenticated;
grant select on table public.proveedor_letras to authenticated;
drop policy if exists "letras: ver" on public.proveedor_letras;
create policy "letras: ver" on public.proveedor_letras for select
  using ((select public.can('inventario.ver')) or (select public.can('inventario.vender'))
         or (select public.can('inventario.gestionar')));

-- Ahora que están las columnas: la vista viva es la de la 0090 o la de
-- esta migración (segunda corrida, o la 0090 restituida con la VUELTA
-- ATRÁS). Cualquier otra cosa es un cambio que nadie anotó.
create or replace temp view ref_estado_0092 with (security_invoker = on) as
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
            when v.parte_proveedor = 0 then 'sin_parte'
            else 'a_rendir' end as estado,
       v.letra,
       coalesce(v.dato_nombre, 'Aroma')           as dato_nombre,
       coalesce(v.precio_base, v.precio_unitario) as precio_base,
       coalesce(v.comision_sobre, 'cobrado')      as comision_sobre
  from public.ventas_productos v
  left join public.payment_methods pm on pm.code = v.method
  left join public.profiles pr on pr.id = v.vendido_por
  left join lateral (select public.venta_rendida(v.id) as rendicion_id) r on true;

do $vista$
declare v_viva text := pg_get_viewdef('public.ventas_productos_estado'::regclass, true);
begin
  if v_viva is distinct from pg_get_viewdef('pg_temp.ref_estado_0090'::regclass, true)
     and v_viva is distinct from pg_get_viewdef('pg_temp.ref_estado_0092'::regclass, true) then
    raise exception 'public.ventas_productos_estado no es la de la 0090 ni la de la 0092 (md5 de la viva: %): la cambió otra migración o se tocó a mano. No se tocó nada. Mandá  select pg_get_viewdef(''public.ventas_productos_estado'', true);',
      md5(v_viva);
  end if;
end
$vista$;

-- Un producto que hoy se vende y mañana no, sin que nadie lo decida: el
-- default de arriba pasó a todos los proveedores a 'efectivo' sin la
-- validación que sí hace guardar_proveedor. Si alguno tiene precios y no
-- el de efectivo, con tarjeta o transferencia ya no se podría vender. Se
-- corta: el prevuelo lo lista y se arregla cargando ese precio.
do $efectivo$
declare v_detalle text;
begin
  select string_agg(p.nombre || ' (' || pr.nombre || ')', ', ' order by p.nombre) into v_detalle
    from public.productos p
    join public.proveedores pr on pr.id = p.proveedor_id
   where p.active and not p.precio_por_letra and pr.comision_sobre = 'efectivo'
     and exists (select 1 from public.producto_precios pp where pp.producto_id = p.id)
     and not exists (select 1 from public.producto_precios pp where pp.producto_id = p.id and pp.method = 'efectivo');
  if v_detalle is not null then
    raise exception 'Estos productos no tienen precio en efectivo, y desde la 0092 la parte del estudio se calcula sobre ese precio: %. Cargáselo desde Productos y volvé a correrla. No se tocó nada.', v_detalle;
  end if;
end
$efectivo$;

-- ------------------------------------------------------------
-- 2. LA REGLA
--
-- Pura: misma entrada, misma salida. La usa vender_producto y la prueba
-- el punto 7 con los números del estudio. Con p_base = p_cobrado es la
-- cuenta de la 0090. El redondeo del % queda del lado del estudio, como
-- en la 0090, y estudio + proveedor = cobrado siempre.
-- ------------------------------------------------------------
create or replace function public.reparto_de_venta(p_cobrado numeric, p_base numeric, p_pct numeric)
returns table (parte_estudio numeric, parte_proveedor numeric)
language sql immutable set search_path = ''
as $$
  select p_cobrado - (p_base - round(p_base * p_pct / 100, 2)),
         p_base - round(p_base * p_pct / 100, 2)
$$;

-- ------------------------------------------------------------
-- 3. FUNCIONES
--
-- Las tres suman parámetros AL FINAL y con default: la pantalla vieja las
-- llama con argumentos con nombre y sin los nuevos, y Postgres resuelve a
-- la nueva. La firma vieja se borra en esta misma transacción: si
-- convivieran, PostgREST no sabría a cuál llamar (PGRST203) y el
-- mostrador no podría vender.
-- ------------------------------------------------------------
drop function if exists public.guardar_proveedor(uuid, text, text, text, numeric, boolean);

-- p_comision_sobre nulo = no se toca (en un alta, 'efectivo').
-- p_letras es un objeto {letra: {medio: número | null} | null} y cambia
-- SÓLO lo que viene, igual que p_precios en guardar_producto: una letra en
-- null se borra entera, un medio en null se borra, y lo que no viene no se
-- toca. Si reemplazara la lista entera, un medio que la pantalla no
-- muestra (uno dado de baja) se borraría sin que nadie lo vea.
create or replace function public.guardar_proveedor(
  p_id uuid, p_nombre text, p_contacto text, p_notas text, p_pct_estudio numeric, p_activo boolean,
  p_comision_sobre text default null,
  p_letras jsonb default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_nombre  text := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
  v_id      uuid;
  v_antes   text;
  v_sobre   text;
  v_k       text;
  v_l       text;
  v_v       jsonb;
  v_m       text;
  v_mv      jsonb;
  v_pm      record;
  v_detalle text;
  v_n       int;
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
  if p_comision_sobre is not null and p_comision_sobre not in ('efectivo', 'cobrado') then
    raise exception 'La parte del estudio se calcula sobre el precio de efectivo o sobre lo cobrado.';
  end if;
  if p_letras is not null and jsonb_typeof(p_letras) <> 'object' then
    raise exception 'Los precios por letra llegaron mal armados.';
  end if;

  -- Las letras se normalizan antes de tocar nada: "a" y "A" son la misma,
  -- y si llegan las dos no hay forma de saber cuál vale.
  if p_letras is not null then
    select string_agg(x.l, ', ' order by x.l) into v_detalle
      from (select upper(btrim(k)) as l from jsonb_object_keys(p_letras) k
             group by 1 having count(*) > 1) x;
    if v_detalle is not null then
      raise exception 'La letra % está dos veces.', v_detalle;
    end if;
    select k into v_k from jsonb_object_keys(p_letras) k
     where upper(btrim(k)) !~ '^[A-Z0-9]{1,4}$' limit 1;
    if v_k is not null then
      raise exception 'La letra «%» no sirve: usá de 1 a 4 letras o números, sin espacios.', v_k;
    end if;
  end if;

  if p_id is not null then
    select pr.comision_sobre into v_antes from public.proveedores pr where pr.id = p_id for update;
  end if;

  begin
    if p_id is null then
      insert into public.proveedores (nombre, contacto, notas, pct_estudio, comision_sobre, active, created_by, updated_by)
      values (v_nombre, btrim(coalesce(p_contacto, '')), btrim(coalesce(p_notas, '')),
              p_pct_estudio, coalesce(p_comision_sobre, 'efectivo'), coalesce(p_activo, true), auth.uid(), auth.uid())
      returning id into v_id;
    else
      update public.proveedores
         set nombre = v_nombre, contacto = btrim(coalesce(p_contacto, '')),
             notas = btrim(coalesce(p_notas, '')), pct_estudio = p_pct_estudio,
             comision_sobre = coalesce(p_comision_sobre, comision_sobre),
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

  for v_k, v_v in select key, value from jsonb_each(coalesce(p_letras, '{}'::jsonb)) loop
    v_l := upper(btrim(v_k));
    if jsonb_typeof(v_v) = 'null' then
      delete from public.proveedor_letras pl where pl.proveedor_id = v_id and pl.letra = v_l;
      continue;
    end if;
    if jsonb_typeof(v_v) <> 'object' then
      raise exception 'Los precios por letra llegaron mal armados.';
    end if;
    for v_m, v_mv in select key, value from jsonb_each(v_v) loop
      select pm.code, pm.name, pm.is_manual into v_pm from public.payment_methods pm where pm.code = v_m;
      if not found then
        raise exception 'El medio de pago % no existe.', v_m;
      end if;
      if jsonb_typeof(v_mv) = 'null' then
        delete from public.proveedor_letras pl
         where pl.proveedor_id = v_id and pl.letra = v_l and pl.method = v_m;
      elsif jsonb_typeof(v_mv) <> 'number' or (v_mv #>> '{}')::numeric <= 0 then
        raise exception 'El precio de la letra % en % tiene que ser un número mayor que cero.', v_l, v_pm.name;
      elsif not v_pm.is_manual then
        raise exception '% se acredita solo: no se le pone precio de mostrador.', v_pm.name;
      else
        insert into public.proveedor_letras (proveedor_id, letra, method, precio, updated_by)
        values (v_id, v_l, v_m, round((v_mv #>> '{}')::numeric, 2), auth.uid())
        on conflict (proveedor_id, letra, method)
          do update set precio = excluded.precio, updated_by = excluded.updated_by, updated_at = now();
      end if;
    end loop;
  end loop;

  -- Se controla al guardar y no recién en el mostrador: si la parte del
  -- estudio sale del precio de efectivo, una letra o un producto sin ese
  -- precio no se podría vender con otro medio, y quien se entera es la
  -- recepcionista con alguien esperando.
  select pr.comision_sobre into v_sobre from public.proveedores pr where pr.id = v_id;
  if v_sobre = 'efectivo' and (p_letras is not null or v_antes is distinct from 'efectivo') then
    select string_agg(x.letra, ', ' order by length(x.letra), x.letra), count(*) into v_detalle, v_n
      from (select distinct pl.letra from public.proveedor_letras pl where pl.proveedor_id = v_id) x
     where not exists (select 1 from public.proveedor_letras e
                        where e.proveedor_id = v_id and e.letra = x.letra and e.method = 'efectivo');
    if v_n = 1 then
      raise exception 'La letra % no tiene precio en efectivo, y la parte del estudio se calcula sobre ese precio.', v_detalle;
    elsif v_n > 1 then
      raise exception 'Las letras % no tienen precio en efectivo, y la parte del estudio se calcula sobre ese precio.', v_detalle;
    end if;

    if v_antes is not null and v_antes <> 'efectivo' then
      select string_agg(p.nombre, ', ' order by p.nombre) into v_detalle
        from public.productos p
       where p.proveedor_id = v_id and p.active and not p.precio_por_letra
         and exists (select 1 from public.producto_precios pp where pp.producto_id = p.id)
         and not exists (select 1 from public.producto_precios pp where pp.producto_id = p.id and pp.method = 'efectivo');
      if v_detalle is not null then
        raise exception 'Antes de calcular sobre el efectivo, cargale precio en efectivo a: %.', v_detalle;
      end if;
    end if;
  end if;

  return v_id;
end;
$$;

drop function if exists public.guardar_producto(uuid, text, text, uuid, boolean, integer, jsonb, text[]);

-- p_precios es un objeto {código del medio: número | null}: un número crea
-- o actualiza ese precio, null lo borra, un código ausente no se toca.
-- p_aromas nulo = no se tocan; si viene, reemplaza la lista (son las
-- sugerencias del dato, sea aroma o código). p_precio_por_letra y
-- p_dato_venta nulos = no se tocan (en un alta: precio fijo y "Aroma").
-- Con precio por letra los precios propios se conservan sin usarse:
-- quedan para el día que el producto vuelva al precio fijo.
create or replace function public.guardar_producto(
  p_id uuid, p_nombre text, p_descripcion text, p_proveedor uuid,
  p_activo boolean, p_stock_aviso int, p_precios jsonb,
  p_aromas text[] default null,
  p_precio_por_letra boolean default null,
  p_dato_venta text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_nombre text := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
  v_dato   text := btrim(regexp_replace(coalesce(p_dato_venta, ''), '\s+', ' ', 'g'));
  v_id     uuid;
  v_prev   uuid;
  v_k      text;
  v_v      jsonb;
  v_pm     record;
  v_fin    record;
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
  if p_dato_venta is not null and (v_dato = '' or length(v_dato) > 30) then
    raise exception 'El dato que se pide al vender necesita un nombre (hasta 30 letras), por ejemplo Aroma o Código.';
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
      insert into public.productos (nombre, descripcion, proveedor_id, active, stock_aviso, aromas,
                                    precio_por_letra, dato_venta, created_by, updated_by)
      values (v_nombre, btrim(coalesce(p_descripcion, '')), p_proveedor, coalesce(p_activo, true),
              p_stock_aviso, coalesce(v_aromas, '{}'), coalesce(p_precio_por_letra, false),
              case when p_dato_venta is null then 'Aroma' else v_dato end, auth.uid(), auth.uid())
      returning id into v_id;
    else
      update public.productos
         set nombre = v_nombre, descripcion = btrim(coalesce(p_descripcion, '')),
             proveedor_id = p_proveedor, active = coalesce(p_activo, active),
             stock_aviso = p_stock_aviso,
             aromas = case when p_aromas is null then aromas else coalesce(v_aromas, '{}') end,
             precio_por_letra = coalesce(p_precio_por_letra, precio_por_letra),
             dato_venta = case when p_dato_venta is null then dato_venta else v_dato end,
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

  -- Al guardar y no en el mostrador (ver guardar_proveedor): con precio
  -- fijo y un proveedor que calcula sobre el efectivo, sin ese precio no
  -- se podría vender con ningún otro medio.
  select p.nombre, p.active, p.precio_por_letra, pr.nombre as proveedor, pr.comision_sobre
    into v_fin
    from public.productos p
    left join public.proveedores pr on pr.id = p.proveedor_id
   where p.id = v_id;
  if v_fin.active and not v_fin.precio_por_letra and v_fin.comision_sobre = 'efectivo'
     and exists (select 1 from public.producto_precios pp where pp.producto_id = v_id)
     and not exists (select 1 from public.producto_precios pp where pp.producto_id = v_id and pp.method = 'efectivo') then
    raise exception '% no tiene precio en efectivo, y la parte del estudio de % se calcula sobre ese precio.',
      v_fin.nombre, v_fin.proveedor;
  end if;

  return v_id;
end;
$$;

drop function if exists public.vender_producto(uuid, integer, text, text, uuid, text, text, uuid, numeric);

-- La venta. La BASE decide todo, como en la 0090: permiso, stock con la
-- fila bloqueada, el dato, la letra, el precio del medio, la cuenta y el
-- reparto. Del navegador llegan el producto, la cantidad, el dato (sigue
-- llamándose p_aroma: la pantalla vieja lo manda así), la letra, el medio
-- y el comprador; el precio y el total nunca. p_precio_esperado es un
-- control (ver la 0090): si la lista cambió con la pantalla abierta, corta.
--
-- Lo que devuelve suma columnas AL FINAL: la pantalla vieja lee por nombre
-- e ignora las que sobran. Con letra, dato y base, el comprobante se arma
-- con lo que registró la base y no con lo que hay en la pantalla: en un
-- reintento la pantalla puede tener otra pieza, otro medio u otra
-- cantidad elegidos.
create or replace function public.vender_producto(
  p_producto  uuid,
  p_cantidad  int,
  p_aroma     text,
  p_method    text,
  p_student   uuid default null,
  p_comprador text default '',
  p_notas     text default '',
  p_idem      uuid default null,
  p_precio_esperado numeric default null,
  p_letra     text default null
)
returns table (
  venta_id uuid, numero bigint, cobrado numeric, precio_unitario numeric, cantidad int,
  parte_estudio numeric, parte_proveedor numeric, medio text, cuenta text,
  stock_restante int, paid_at timestamptz, repetida boolean,
  letra text, dato text, dato_nombre text, precio_base numeric, comision_sobre text
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_p      record;
  v_prov   record;
  v_pm     record;
  v_precio numeric(14, 2);
  v_base   numeric(14, 2);
  v_total  numeric(14, 2);
  v_est    numeric(14, 2);
  v_prv    numeric(14, 2);
  v_aroma  text := btrim(regexp_replace(coalesce(p_aroma, ''), '\s+', ' ', 'g'));
  v_letra  text := nullif(upper(btrim(coalesce(p_letra, ''))), '');
  v_comp   text := btrim(regexp_replace(coalesce(p_comprador, ''), '\s+', ' ', 'g'));
  v_que    text;
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

  select * into v_p from public.productos pp where pp.id = p_producto for update;
  if not found then
    raise exception 'Ese producto no existe.';
  end if;

  if p_idem is not null then
    select * into v_v from public.ventas_productos v where v.idem = p_idem;
    if found then
      -- La misma llave con otro producto no es un reintento: es un error
      -- del navegador (la 0090 ya cortaba acá).
      if v_v.producto_id <> p_producto then
        raise exception 'Ese cobro ya se registró con otro producto. Cerrá la venta y volvé a abrirla.';
      end if;
      -- Con el mismo producto se devuelve la venta ya hecha AUNQUE ahora
      -- lleguen otra letra, otro dato, otro medio u otra cantidad. Después
      -- de una respuesta perdida, lo más probable es que se haya corregido
      -- un código mal escrito o que la tarjeta no pasara: cortar con error
      -- invitaba a cobrar de nuevo la misma pieza (stock y caja dobles), y
      -- la pantalla vieja quedaba trabada con esa llave. Una llave, una
      -- venta como mucho. El comprobante no miente porque se arma con lo
      -- que devuelve esto (letra, dato, medio, cantidad registrados), y la
      -- pantalla avisa si no coincide con lo elegido: corregirlo es anular
      -- esa venta, que es de admin.
      return query
        select v_v.id, v_v.numero, v_v.amount, v_v.precio_unitario, v_v.cantidad,
               v_v.parte_estudio, v_v.parte_proveedor,
               coalesce((select pm.name from public.payment_methods pm where pm.code = v_v.method), v_v.method),
               (select a.name from public.accounts a where a.id = v_v.account_id),
               v_p.stock, v_v.paid_at, true,
               v_v.letra, v_v.aroma, coalesce(v_v.dato_nombre, 'Aroma'),
               coalesce(v_v.precio_base, v_v.precio_unitario), coalesce(v_v.comision_sobre, 'cobrado');
      return;
    end if;
  end if;

  -- Sin género ni número: el dato puede ser "Aroma", "Código" o lo que el
  -- estudio le ponga al producto.
  if v_aroma = '' then
    raise exception 'Falta completar «%» antes de cobrar.', v_p.dato_venta;
  end if;
  if length(v_aroma) > 60 then
    raise exception '«%» es demasiado largo (hasta 60 letras).', v_p.dato_venta;
  end if;
  if not v_p.precio_por_letra and v_letra is not null then
    raise exception '% no se vende por letra: el precio sale de su lista.', v_p.nombre;
  end if;
  if v_p.precio_por_letra and v_letra is null then
    raise exception 'Falta elegir la letra de la etiqueta.';
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

  select * into v_prov from public.proveedores pr where pr.id = v_p.proveedor_id;

  select * into v_pm from public.payment_methods pm where pm.code = p_method;
  if not found then
    raise exception 'Ese medio de pago no existe.';
  end if;
  if not v_pm.active then
    raise exception '% está dado de baja como medio de pago.', v_pm.name;
  end if;
  if not v_pm.is_manual then
    raise exception '% se acredita solo: no se cobra desde el mostrador.', v_pm.name;
  end if;

  -- El precio para ese medio, tal cual: de la lista por letra del
  -- proveedor o de la del producto. No se aplica el ajuste_pct del medio:
  -- los precios por medio los dio el estudio.
  if v_p.precio_por_letra then
    select pl.precio into v_precio from public.proveedor_letras pl
     where pl.proveedor_id = v_p.proveedor_id and pl.letra = v_letra and pl.method = p_method;
    if v_precio is null then
      if not exists (select 1 from public.proveedor_letras pl
                      where pl.proveedor_id = v_p.proveedor_id and pl.letra = v_letra) then
        raise exception 'La letra % no está en la lista de %.', v_letra, v_prov.nombre;
      end if;
      raise exception 'La letra % no tiene precio en %.', v_letra, v_pm.name;
    end if;
    v_que := v_p.nombre || ' (letra ' || v_letra || ')';
  else
    select pp.precio into v_precio from public.producto_precios pp
     where pp.producto_id = p_producto and pp.method = p_method;
    if v_precio is null then
      raise exception '% no tiene precio en %.', v_p.nombre, v_pm.name;
    end if;
    v_que := v_p.nombre;
  end if;
  if p_precio_esperado is not null and round(p_precio_esperado, 2) <> v_precio then
    raise exception 'El precio de % en % cambió: ahora es %. Revisalo con quien compra y volvé a cobrar.',
      v_que, v_pm.name, public.pesos(v_precio);
  end if;

  -- La base de la parte del estudio: lo cobrado, o el precio de efectivo
  -- de la misma pieza, según el proveedor.
  if v_prov.comision_sobre = 'efectivo' and p_method <> 'efectivo' then
    if v_p.precio_por_letra then
      select pl.precio into v_base from public.proveedor_letras pl
       where pl.proveedor_id = v_p.proveedor_id and pl.letra = v_letra and pl.method = 'efectivo';
      if v_base is null then
        raise exception 'La letra % de % no tiene precio en efectivo, y la parte del estudio se calcula sobre ese precio. Pedile a quien administra que lo cargue.',
          v_letra, v_prov.nombre;
      end if;
    else
      select pp.precio into v_base from public.producto_precios pp
       where pp.producto_id = p_producto and pp.method = 'efectivo';
      if v_base is null then
        raise exception '% no tiene precio en efectivo, y la parte del estudio se calcula sobre ese precio. Pedile a quien administra que lo cargue.',
          v_p.nombre;
      end if;
    end if;
  else
    v_base := v_precio;
  end if;

  if p_student is not null then
    select s.name into v_comp from public.students s where s.id = p_student;
    if not found then
      raise exception 'No se encontró la ficha de ese cliente.';
    end if;
  end if;

  v_total := v_precio * p_cantidad;
  select r.parte_estudio, r.parte_proveedor into v_est, v_prv
    from public.reparto_de_venta(v_total, v_base * p_cantidad, v_prov.pct_estudio) r;
  -- Un medio más barato que el efectivo dejaría al estudio en negativo.
  if v_prv > v_total then
    raise exception '% en % sale %, menos que en efectivo (%): al proveedor le tocaría más de lo cobrado. Revisá los precios, o en el proveedor cambiá sobre qué se calcula la parte del estudio.',
      v_que, v_pm.name, public.pesos(v_precio), public.pesos(v_base);
  end if;
  -- La cuenta del medio, como los cobros desde la 0074. Sin cuenta
  -- configurada cae en "A imputar", igual que un cobro.
  v_cuenta := coalesce(v_pm.default_account_id, 'a0000000-0000-4000-8000-000000000009');

  insert into public.ventas_productos (
    producto_id, producto_nombre, proveedor_id, proveedor_nombre, aroma, cantidad,
    precio_unitario, amount, pct_estudio, parte_estudio, parte_proveedor,
    method, account_id, paid_at, paid_date, student_id, comprador_nombre, notas, idem, vendido_por,
    letra, dato_nombre, precio_base, comision_sobre
  ) values (
    p_producto, v_p.nombre, v_prov.id, v_prov.nombre, v_aroma, p_cantidad,
    v_precio, v_total, v_prov.pct_estudio, v_est, v_prv,
    p_method, v_cuenta, v_ahora, (v_ahora at time zone 'America/Argentina/Buenos_Aires')::date,
    p_student, left(coalesce(v_comp, ''), 80), btrim(coalesce(p_notas, '')), p_idem, auth.uid(),
    v_letra, v_p.dato_venta, v_base, v_prov.comision_sobre
  ) returning * into v_v;

  update public.productos pp set stock = pp.stock - p_cantidad where pp.id = p_producto;
  insert into public.stock_movimientos (producto_id, at, tipo, cantidad, stock_resultante, venta_id, created_by)
  values (p_producto, v_ahora, 'venta', -p_cantidad, v_p.stock - p_cantidad, v_v.id, auth.uid());

  return query
    select v_v.id, v_v.numero, v_v.amount, v_v.precio_unitario, v_v.cantidad,
           v_v.parte_estudio, v_v.parte_proveedor, v_pm.name,
           (select a.name from public.accounts a where a.id = v_cuenta),
           v_p.stock - p_cantidad, v_v.paid_at, false,
           v_v.letra, v_v.aroma, v_v.dato_nombre, v_v.precio_base, v_v.comision_sobre;
end;
$$;

-- Nadie sin sesión ejecuta nada; quien tiene sesión, sí (cada función pide
-- su clave adentro). La regla pura no se llama desde el navegador: la usa
-- vender_producto, que corre como dueño.
do $fn$
declare h record;
begin
  for h in select * from pg_temp.huellas_0092 loop
    execute format('revoke all on function %s from public, anon', h.nueva);
    if h.nombre = 'reparto_de_venta' then
      execute format('revoke all on function %s from authenticated', h.nueva);
    else
      execute format('grant execute on function %s to authenticated', h.nueva);
    end if;
  end loop;
end
$fn$;

-- ------------------------------------------------------------
-- 4. LA VISTA DE VENTAS
--
-- Las cuatro columnas nuevas AL FINAL (create or replace sólo deja
-- agregar al final). El WITH es obligatorio: `create or replace view` sin
-- él le BORRA security_invoker a la vista (probado), y pasaría a correr
-- como dueño, salteando las políticas.
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
            else 'a_rendir' end as estado,
       v.letra,
       -- Antes de la 0092 el dato siempre fue el aroma y la base siempre
       -- fue lo cobrado: completar así es exacto, no una suposición.
       coalesce(v.dato_nombre, 'Aroma')           as dato_nombre,
       coalesce(v.precio_base, v.precio_unitario) as precio_base,
       coalesce(v.comision_sobre, 'cobrado')      as comision_sobre
  from public.ventas_productos v
  left join public.payment_methods pm on pm.code = v.method
  left join public.profiles pr on pr.id = v.vendido_por
  left join lateral (select public.venta_rendida(v.id) as rendicion_id) r on true;

revoke all on public.ventas_productos_estado from public, anon, authenticated;
grant select on public.ventas_productos_estado to authenticated;

-- ------------------------------------------------------------
-- 5. ACCESORIOS CHINI
--
-- Ids fijos (el prefijo d0 no lo usa ninguna otra migración) para que una
-- segunda corrida no duplique nada.
-- ------------------------------------------------------------
create temp table chini_0092 (id uuid, nombre text, active boolean, creado boolean,
                              letras_antes int, letras_sembradas int) on commit drop;

do $siembra$
declare
  v_id     uuid;
  v_nombre text;
  v_activo boolean;
  v_creado boolean := false;
  v_antes  int;
  v_n      int := 0;
begin
  select pr.id, pr.nombre, pr.active into v_id, v_nombre, v_activo
    from public.proveedores pr where pr.id = 'd0000000-0000-4000-8000-000000000921';
  if v_id is null then
    -- Uno solo (la guarda cortó si había más): si el estudio ya lo cargó a
    -- mano, se usa ése en vez de duplicarlo.
    select pr.id, pr.nombre, pr.active into v_id, v_nombre, v_activo
      from public.proveedores pr where pr.nombre ~* '\mchini\M';
  end if;
  if v_id is null then
    insert into public.proveedores (id, nombre, pct_estudio, comision_sobre, notas)
    values ('d0000000-0000-4000-8000-000000000921', 'Accesorios Chini', 30, 'efectivo',
            'Aros, collares, anillos y pulseras: el precio sale de la letra de la etiqueta.')
    returning id, nombre, active into v_id, v_nombre, v_activo;
    v_creado := true;
  end if;

  select count(*) into v_antes from public.proveedor_letras pl where pl.proveedor_id = v_id;

  -- Un proveedor dado de baja no se elige para un producto (guardar_producto
  -- lo rechaza), y colgarle productos nuevos los dejaría vendiéndose a
  -- nombre de alguien que el estudio dio de baja. No se le carga nada.
  if v_activo then
    -- Las letras sólo si no tiene ninguna. `on conflict do nothing`
    -- respetaría lo editado pero no lo BORRADO: correr esto otra vez le
    -- devolvería al admin la K que sacó.
    if v_antes = 0 then
      insert into public.proveedor_letras (proveedor_id, letra, method, precio)
      select v_id, x.letra, m.method, m.precio
        from (values ('A', 15600, 17160, 20280), ('B', 18000, 19800, 23400), ('C', 20000, 22000, 26000),
                     ('D', 22000, 24200, 28600), ('E', 24000, 26400, 31200), ('F', 25000, 27500, 32500),
                     ('G', 26000, 28600, 33800), ('H', 28000, 30800, 36400), ('I', 30000, 33000, 39000),
                     ('J', 32000, 35200, 41600), ('K', 38000, 41800, 49400)) x (letra, efe, trf, tar)
        -- El precio de "Transferencia" vale para los dos bancos.
        cross join lateral (values ('efectivo', x.efe), ('transferencia', x.trf),
                                   ('transferencia_bbva', x.trf), ('tarjeta', x.tar)) m (method, precio)
        join public.payment_methods pm on pm.code = m.method and pm.is_manual
      on conflict do nothing;
      get diagnostics v_n = row_count;
    end if;

    -- Si ya hay uno activo con ese nombre (plural o singular), no se
    -- duplica ni se convierte: pasar en silencio a precio por letra un
    -- producto que el estudio cargó a mano cambiaría cómo se vende.
    insert into public.productos (id, nombre, proveedor_id, precio_por_letra, dato_venta,
                                  stock, stock_aviso, sort_order)
    select x.id::uuid, x.nombre, v_id, true, 'Código', 0, 2, x.orden
      from (values ('b0000000-0000-4000-8000-000000000921', 'Aros',     'aro',     30),
                   ('b0000000-0000-4000-8000-000000000922', 'Collares', 'collar',  40),
                   ('b0000000-0000-4000-8000-000000000923', 'Anillos',  'anillo',  50),
                   ('b0000000-0000-4000-8000-000000000924', 'Pulseras', 'pulsera', 60)) x (id, nombre, singular, orden)
     where not exists (select 1 from public.productos p where p.id = x.id::uuid)
       and not exists (select 1 from public.productos p
                        where p.active and lower(btrim(p.nombre)) in (lower(x.nombre), x.singular));
  end if;

  insert into pg_temp.chini_0092 values (v_id, v_nombre, v_activo, v_creado, v_antes, v_n);
end
$siembra$;

-- ------------------------------------------------------------
-- 6. LA AYUDA DE LOS PERMISOS
--
-- Las claves son las mismas; cambia lo que hacen, y la pantalla de
-- Permisos tiene que decirlo. Sólo si el texto es el que dejó la 0090: si
-- alguien lo cambió, no se pisa (va al resumen).
-- ------------------------------------------------------------
create temp table ayudas_0092 (clave text primary key, de_0090 text not null, nueva text not null) on commit drop;
insert into ayudas_0092 values
  ('inventario.vender',
   'Registrar la venta de un producto en el mostrador: elige el aroma, el medio de pago y, si hay, el cliente. El precio sale de la lista y la plata entra a la caja. Incluye ver los productos y las ventas.',
   'Registrar la venta de un producto en el mostrador: completa el dato que pide el producto (el aroma de un difusor, el código de un accesorio), la letra de la etiqueta si el precio sale de ahí, el medio de pago y, si hay, el cliente. El precio sale de la lista y la plata entra a la caja. Incluye ver los productos y las ventas.'),
  ('inventario.gestionar',
   'Dar de alta y modificar productos y sus precios por medio de pago, cargar la mercadería que trae el proveedor, ajustar el stock con un motivo y administrar los proveedores y la parte del estudio de cada uno.',
   'Dar de alta y modificar productos y sus precios por medio de pago, cargar la mercadería que trae el proveedor, ajustar el stock con un motivo y administrar los proveedores: la parte del estudio de cada uno, sobre qué precio se calcula y su lista de precios por letra.');

update public.permission_keys k
   set ayuda = a.nueva
  from pg_temp.ayudas_0092 a
 where k.clave = a.clave and k.ayuda = a.de_0090;

-- ------------------------------------------------------------
-- 7. COMPROBACIONES
--
-- Si algo no quedó como se decidió, no se aplica nada.
-- ------------------------------------------------------------
do $despues$
declare
  h         record;
  v_viva    text;
  v_detalle text;
  v_n       bigint;
  v_r       record;
  v_c       record;
begin
  -- La regla, con los números del estudio. (cobrado, base, %) → (estudio, proveedor)
  for v_r in select * from (values
      (20280::numeric, 15600::numeric, 30::numeric, 9360::numeric, 10920::numeric),   -- aro A, tarjeta
      (44000, 40000, 30, 16000, 28000),   -- 2 aros C, Transferencia BBVA
      (37500, 30000, 30, 16500, 21000),   -- difusor, tarjeta, sobre el efectivo
      (37500, 37500, 30, 11250, 26250),   -- difusor, tarjeta, sobre lo cobrado (la 0090)
      (30000, 30000, 30, 9000, 21000)     -- difusor, efectivo: igual con las dos reglas
    ) x (cobrado, base, pct, estudio, proveedor)
  loop
    select * into v_c from public.reparto_de_venta(v_r.cobrado, v_r.base, v_r.pct);
    if v_c.parte_estudio is distinct from v_r.estudio or v_c.parte_proveedor is distinct from v_r.proveedor then
      raise exception 'reparto_de_venta(%, %, %) dio estudio % / proveedor %, y tenía que dar % / %.',
        v_r.cobrado, v_r.base, v_r.pct, v_c.parte_estudio, v_c.parte_proveedor, v_r.estudio, v_r.proveedor;
    end if;
  end loop;

  -- Las huellas de lo que se acaba de crear tienen que ser las que anota
  -- el punto 0: si no, la próxima corrida no reconocería su propia versión.
  for h in select * from pg_temp.huellas_0092 loop
    select md5(btrim(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
      into v_viva from pg_proc p where p.oid = to_regprocedure(h.nueva);
    if v_viva is distinct from h.esta then
      raise exception 'La huella de % es % y el punto 0 anota %. Si se cambió el código de la función, hay que anotar la nueva ahí.',
        h.nueva, coalesce(v_viva, '(no existe)'), h.esta;
    end if;
    if h.vieja is not null and to_regprocedure(h.vieja) is not null then
      raise exception 'Quedó la firma vieja %.', h.vieja;
    end if;
    select count(*) into v_n from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname = h.nombre;
    if v_n <> 1 then
      raise exception 'Hay % versiones de public.%: PostgREST no sabría a cuál llamar.', v_n, h.nombre;
    end if;
  end loop;

  -- Cerradas: definer y con search_path vacío las tres que escriben;
  -- nadie sin sesión ejecuta nada; la regla pura, ni con sesión.
  select string_agg(p.oid::regprocedure::text, ', ') into v_detalle
    from pg_temp.huellas_0092 x
    join pg_proc p on p.oid = to_regprocedure(x.nueva)
   where not coalesce(p.proconfig, '{}') @> array['search_path=""']
      or has_function_privilege('anon', p.oid, 'EXECUTE')
      or (x.nombre <> 'reparto_de_venta'
          and (not p.prosecdef or not has_function_privilege('authenticated', p.oid, 'EXECUTE')))
      or (x.nombre = 'reparto_de_venta'
          and (p.prosecdef or has_function_privilege('authenticated', p.oid, 'EXECUTE')));
  if v_detalle is not null then
    raise exception 'Funciones mal cerradas: %', v_detalle;
  end if;

  -- has_table_privilege y no information_schema (ver la 0090): preguntarle
  -- a anon cubre también lo que hereda de PUBLIC.
  select string_agg(t.n || ' (' || t.quien || ')', ', ') into v_detalle
    from (select n, 'anon' as quien
            from unnest(array['proveedor_letras', 'ventas_productos_estado']) n
           where has_table_privilege('anon', 'public.' || n, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
          union all
          select n, 'authenticated'
            from unnest(array['proveedor_letras', 'ventas_productos_estado']) n
           where has_table_privilege('authenticated', 'public.' || n, 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
              or not has_table_privilege('authenticated', 'public.' || n, 'SELECT')) t;
  if v_detalle is not null then
    raise exception 'Quedaron abiertas de más (o sin lectura): %', v_detalle;
  end if;
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.proveedor_letras'::regclass) then
    raise exception 'proveedor_letras quedó sin RLS.';
  end if;
  if not exists (select 1 from pg_class c
                  where c.oid = 'public.ventas_productos_estado'::regclass
                    and coalesce(c.reloptions, '{}') @> array['security_invoker=on']) then
    raise exception 'ventas_productos_estado perdió security_invoker.';
  end if;
  if pg_get_viewdef('public.ventas_productos_estado'::regclass, true)
     is distinct from pg_get_viewdef('pg_temp.ref_estado_0092'::regclass, true) then
    raise exception 'La vista de ventas recreada no es la ref_estado_0092.';
  end if;

  -- Ni un permiso en sombra distinto.
  if exists (select * from public.perm_diff() except select * from pg_temp.perm_diff_antes) then
    raise exception 'La 0092 cambió un permiso en sombra: %',
      (select string_agg(d.rol || ' · ' || d.clave, ', ')
         from (select * from public.perm_diff() except select * from pg_temp.perm_diff_antes) d);
  end if;

  -- Las ventas hechas y el libro, idénticos.
  select count(*) into v_n from (
    (select id, numero, amount, precio_unitario, cantidad, pct_estudio, parte_estudio, parte_proveedor,
            status, aroma, method, account_id, paid_at from public.ventas_productos
     except all select * from pg_temp.foto_ventas)
    union all
    (select * from pg_temp.foto_ventas
     except all select id, numero, amount, precio_unitario, cantidad, pct_estudio, parte_estudio, parte_proveedor,
                       status, aroma, method, account_id, paid_at from public.ventas_productos)) d;
  if v_n > 0 then
    raise exception 'Las ventas cambiaron en % filas. No se aplica nada.', v_n;
  end if;
  select count(*) into v_n from (
    (select * from public.account_ledger except all select * from pg_temp.foto_libro)
    union all
    (select * from pg_temp.foto_libro except all select * from public.account_ledger)) d;
  if v_n > 0 then
    raise exception 'El libro de la caja cambió en % filas. No se aplica nada.', v_n;
  end if;

  -- Si las letras se sembraron ahora, tienen que ser 11 por cada medio
  -- manual que exista de los cuatro (sin transferencia_bbva son 33).
  select c.letras_sembradas, c.letras_antes, c.active into v_r from pg_temp.chini_0092 c;
  if v_r.active and v_r.letras_antes = 0
     and v_r.letras_sembradas <> 11 * (select count(*) from public.payment_methods pm
                                        where pm.is_manual
                                          and pm.code in ('efectivo', 'transferencia', 'transferencia_bbva', 'tarjeta')) then
    raise exception 'Se sembraron % precios por letra y tenían que ser 11 por medio.', v_r.letras_sembradas;
  end if;
end
$despues$;

-- ------------------------------------------------------------
-- 8. EL RESUMEN
-- ------------------------------------------------------------
insert into pg_temp.resumen_0092 (orden, que, nombre, como_quedo)
select 1, 'proveedor', pr.nombre,
       format('%s%% para el estudio, sobre %s', trim_scale(pr.pct_estudio),
              case pr.comision_sobre when 'efectivo' then 'el precio de efectivo' else 'lo cobrado' end)
       || coalesce((select format(' · letras %s a %s (%s)', min(l.letra), max(l.letra), count(*))
                      from (select distinct pl.letra from public.proveedor_letras pl
                             where pl.proveedor_id = pr.id) l
                    having count(*) > 0), '')
       || case when not pr.active then ' · dado de baja' else '' end
  from public.proveedores pr;

insert into pg_temp.resumen_0092 (orden, que, nombre, como_quedo)
select 2, 'producto', p.nombre,
       concat_ws(' · ',
         coalesce(pr.nombre, 'sin proveedor'),
         case when p.precio_por_letra then 'precio por letra' else 'precio fijo' end,
         'al vender se pide ' || p.dato_venta,
         'stock ' || p.stock,
         case
           when p.proveedor_id is null then 'NO SE PUEDE VENDER: falta el proveedor'
           when p.precio_por_letra and not exists (select 1 from public.proveedor_letras pl where pl.proveedor_id = p.proveedor_id)
             then 'NO SE PUEDE VENDER: el proveedor no tiene letras'
           when not p.precio_por_letra and not exists (select 1 from public.producto_precios pp where pp.producto_id = p.id)
             then 'NO SE PUEDE VENDER: no tiene precios'
           when p.stock = 0 then 'sin stock: cargar la mercadería'
           else 'se puede vender' end)
  from public.productos p
  left join public.proveedores pr on pr.id = p.proveedor_id
 where p.active;

insert into pg_temp.resumen_0092 (orden, que, nombre, como_quedo)
select 3, 'aviso', p.nombre,
       'ya existía con ese nombre: se dejó como estaba. Si es de Chini, pasalo a precio por letra desde Productos.'
  from public.productos p
 where p.active
   and lower(btrim(p.nombre)) in ('aros', 'aro', 'collares', 'collar', 'anillos', 'anillo', 'pulseras', 'pulsera')
   and p.id not in ('b0000000-0000-4000-8000-000000000921', 'b0000000-0000-4000-8000-000000000922',
                    'b0000000-0000-4000-8000-000000000923', 'b0000000-0000-4000-8000-000000000924');

insert into pg_temp.resumen_0092 (orden, que, nombre, como_quedo)
select 3, 'aviso', c.nombre,
       case
         when not c.active then 'está dado de baja: no se le cargaron letras ni productos. Reactivalo y volvé a correr la 0092, o cargalo a mano.'
         when c.letras_antes > 0 then format('ya tenía %s precios por letra: no se tocaron.', c.letras_antes)
         else format('%s: se le cargaron %s precios por letra (A a K).',
                     case when c.creado then 'proveedor nuevo' else 'ya existía' end, c.letras_sembradas)
       end
  from pg_temp.chini_0092 c;

insert into pg_temp.resumen_0092 (orden, que, nombre, como_quedo)
select 3, 'aviso', 'medio efectivo', 'está dado de baja: la pantalla no muestra su columna de precios, y la parte del estudio se calcula sobre ese precio.'
  from public.payment_methods where code = 'efectivo' and not active;

insert into pg_temp.resumen_0092 (orden, que, nombre, como_quedo)
select 3, 'aviso', 'ayuda de ' || a.clave, 'no era la de la 0090: no se cambió. Revisarla en Permisos.'
  from pg_temp.ayudas_0092 a
  join public.permission_keys k on k.clave = a.clave
 where k.ayuda is distinct from a.nueva;

insert into pg_temp.resumen_0092 (orden, que, nombre, como_quedo)
select 4, 'perm_diff', 'filas', (select count(*) from public.perm_diff())::text || ' (tiene que ser 0)';

insert into pg_temp.resumen_0092 (orden, que, nombre, como_quedo)
select 5, 'sobrecargas', p.proname, count(*)::text || ' (tiene que ser 1)'
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('vender_producto', 'guardar_producto', 'guardar_proveedor', 'reparto_de_venta')
 group by p.proname;

drop view if exists pg_temp.ref_estado_0090, pg_temp.ref_estado_0092;

-- PostgREST se entera solo en Supabase; esto es por las dudas, y se
-- entrega recién con el commit.
notify pgrst, 'reload schema';

commit;

select que, nombre, como_quedo from resumen_0092 order by orden, nombre;

-- ============================================================
-- CÓMO VERIFICAR (en el SQL Editor; todo sólo lee)
--
-- 1. El resumen de arriba: Accesorios Chini al 30% sobre el precio de
--    efectivo con las letras A a K; el proveedor de los difusores, sobre
--    el precio de efectivo; Aros, Collares, Anillos y Pulseras por letra,
--    pidiendo "Código", "sin stock: cargar la mercadería"; Difusor y
--    Spray como estaban, pidiendo "Aroma"; perm_diff 0; una sobrecarga
--    por nombre.
--
-- 2. La lista de Chini (44 filas con los cuatro medios):
--
--    select pl.letra, pl.method, pl.precio
--      from public.proveedor_letras pl
--      join public.proveedores pr on pr.id = pl.proveedor_id
--     where pr.nombre ~* '\mchini\M'
--     order by length(pl.letra), pl.letra, pl.method;
--
-- 3. Las ventas como las ve el admin (patrón de la 0087): las viejas con
--    comision_sobre = 'cobrado', dato_nombre = 'Aroma' y precio_base =
--    precio_unitario.
--
--    begin;
--    select set_config('request.jwt.claims',
--      json_build_object('sub', (select id from public.profiles where role = 'admin' and active
--                                 order by created_at limit 1), 'role', 'authenticated')::text, true);
--    set local role authenticated;
--    select numero, producto_nombre, letra, dato_nombre, aroma, method, amount,
--           precio_base, comision_sobre, parte_estudio, parte_proveedor
--      from public.ventas_productos_estado order by numero desc limit 20;
--    rollback;
--
-- 4. En la pantalla NO se vende un aro de prueba: producción tiene datos
--    reales. La primera venta real se mira contra la vista del punto 3:
--    comision_sobre = 'efectivo', precio_base y letra.
--
-- 5. Para cuantificar lo viejo —ventas con tarjeta o transferencia
--    calculadas sobre lo cobrado—, sólo lectura. Ojo: usa el precio de
--    efectivo de HOY, y qué se hace con esas ventas se decide aparte.
--
--    select v.numero, v.producto_nombre, v.method, v.amount, v.parte_proveedor as se_registro,
--           pp.precio * v.cantidad - round(pp.precio * v.cantidad * v.pct_estudio / 100, 2) as con_la_regla_nueva,
--           public.venta_rendida(v.id) is not null as rendida
--      from public.ventas_productos v
--      join public.producto_precios pp on pp.producto_id = v.producto_id and pp.method = 'efectivo'
--     where v.comision_sobre is null and v.status = 'pagado' and v.method <> 'efectivo';
--
-- ============================================================
-- PARA VOLVER ATRÁS
--
-- NIVEL 0, sin tocar código. La regla de la 0090 vuelve por proveedor
-- desde Productos → Proveedores ("lo que se cobró"), o así:
--
--   update public.proveedores set comision_sobre = 'cobrado' where nombre = '...';
--
-- Es la ventaja de que la regla sea un dato.
--
-- NIVEL 1, las funciones y la vista como las dejó la 0090. Las columnas y
-- `proveedor_letras` quedan con sus datos (en este proyecto no se borran
-- tablas). Los productos por letra quedan sin poder venderse: avisar, o
-- darlos de baja.
--
-- Todos los proveedores vuelven a 'cobrado', también como default: las
-- funciones de la 0090 calculan sobre lo cobrado, y un 'efectivo' que
-- quedara en la base haría que la pantalla nueva mostrara una vista previa
-- y un "sobre el precio de efectivo" que la base ya no aplica. Con eso, la
-- pantalla nueva puede quedar desplegada: manda los parámetros de la 0092
-- sólo cuando alguien cambia la regla, las letras o el dato (y entonces
-- avisa que la base no los tiene), y vende y guarda lo demás como la 0090.
-- Si igual se vuelve atrás también el deploy, primero el deploy.
--
-- Después, la 0092 se puede volver a correr: las huellas "antes" vuelven a
-- coincidir y las letras que ya están no se tocan. Pero los proveedores
-- quedan sobre lo cobrado: pasarlos al efectivo desde Proveedores.
--
--   begin;
--   update public.proveedores set comision_sobre = 'cobrado' where comision_sobre <> 'cobrado';
--   alter table public.proveedores alter column comision_sobre set default 'cobrado';
--   -- La ayuda de los permisos, la de la 0090 (sólo si sigue la de la 0092):
--   update public.permission_keys
--      set ayuda = 'Registrar la venta de un producto en el mostrador: elige el aroma, el medio de pago y, si hay, el cliente. El precio sale de la lista y la plata entra a la caja. Incluye ver los productos y las ventas.'
--    where clave = 'inventario.vender'
--      and ayuda = 'Registrar la venta de un producto en el mostrador: completa el dato que pide el producto (el aroma de un difusor, el código de un accesorio), la letra de la etiqueta si el precio sale de ahí, el medio de pago y, si hay, el cliente. El precio sale de la lista y la plata entra a la caja. Incluye ver los productos y las ventas.';
--   update public.permission_keys
--      set ayuda = 'Dar de alta y modificar productos y sus precios por medio de pago, cargar la mercadería que trae el proveedor, ajustar el stock con un motivo y administrar los proveedores y la parte del estudio de cada uno.'
--    where clave = 'inventario.gestionar'
--      and ayuda = 'Dar de alta y modificar productos y sus precios por medio de pago, cargar la mercadería que trae el proveedor, ajustar el stock con un motivo y administrar los proveedores: la parte del estudio de cada uno, sobre qué precio se calcula y su lista de precios por letra.';
--
--   drop function if exists public.vender_producto(uuid, integer, text, text, uuid, text, text, uuid, numeric, text);
--   drop function if exists public.guardar_producto(uuid, text, text, uuid, boolean, integer, jsonb, text[], boolean, text);
--   drop function if exists public.guardar_proveedor(uuid, text, text, text, numeric, boolean, text, jsonb);
--   drop function if exists public.reparto_de_venta(numeric, numeric, numeric);
--
--   -- Las tres de la 0090, letra por letra:
--   create or replace function public.guardar_proveedor(
--     p_id uuid, p_nombre text, p_contacto text, p_notas text, p_pct_estudio numeric, p_activo boolean
--   )
--   returns uuid
--   language plpgsql security definer set search_path = ''
--   as $$
--   declare
--     v_nombre text := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
--     v_id uuid;
--   begin
--     if not public.can('inventario.gestionar') then
--       raise exception 'No tenés permiso para cargar proveedores.';
--     end if;
--     if v_nombre = '' then
--       raise exception 'Falta el nombre del proveedor.';
--     end if;
--     if p_pct_estudio is null or p_pct_estudio < 0 or p_pct_estudio > 100 then
--       raise exception 'La parte del estudio tiene que ser un porcentaje entre 0 y 100.';
--     end if;
--
--     begin
--       if p_id is null then
--         insert into public.proveedores (nombre, contacto, notas, pct_estudio, active, created_by, updated_by)
--         values (v_nombre, btrim(coalesce(p_contacto, '')), btrim(coalesce(p_notas, '')),
--                 p_pct_estudio, coalesce(p_activo, true), auth.uid(), auth.uid())
--         returning id into v_id;
--       else
--         update public.proveedores
--            set nombre = v_nombre, contacto = btrim(coalesce(p_contacto, '')),
--                notas = btrim(coalesce(p_notas, '')), pct_estudio = p_pct_estudio,
--                active = coalesce(p_activo, active), updated_by = auth.uid(), updated_at = now()
--          where id = p_id
--         returning id into v_id;
--         if v_id is null then
--           raise exception 'Ese proveedor no existe.';
--         end if;
--       end if;
--     exception when unique_violation then
--       raise exception 'Ya hay un proveedor que se llama % (si no lo ves, puede estar dado de baja: reactivalo desde Proveedores).', v_nombre;
--     end;
--     return v_id;
--   end;
--   $$;
--
--   create or replace function public.guardar_producto(
--     p_id uuid, p_nombre text, p_descripcion text, p_proveedor uuid,
--     p_activo boolean, p_stock_aviso int, p_precios jsonb,
--     p_aromas text[] default null
--   )
--   returns uuid
--   language plpgsql security definer set search_path = ''
--   as $$
--   declare
--     v_nombre text := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
--     v_id     uuid;
--     v_prev   uuid;
--     v_k      text;
--     v_v      jsonb;
--     v_pm     record;
--     -- Deduplicados sin distinguir mayúsculas: "Lavanda" y "lavanda" son uno.
--     v_aromas text[] := (select array_agg(a order by lower(a))
--                           from (select distinct on (lower(a)) a
--                                   from (select btrim(regexp_replace(x, '\s+', ' ', 'g')) a
--                                           from unnest(p_aromas) x) t
--                                  where a <> '' and length(a) <= 60
--                                  order by lower(a), a) u);
--   begin
--     if not public.can('inventario.gestionar') then
--       raise exception 'No tenés permiso para cargar productos ni precios.';
--     end if;
--     if v_nombre = '' then
--       raise exception 'Falta el nombre del producto.';
--     end if;
--     if p_stock_aviso is null or p_stock_aviso < 0 then
--       raise exception 'El aviso de stock bajo tiene que ser 0 o más.';
--     end if;
--     if p_precios is not null and jsonb_typeof(p_precios) <> 'object' then
--       raise exception 'Los precios llegaron mal armados.';
--     end if;
--
--     if p_id is not null then
--       select proveedor_id into v_prev from public.productos where id = p_id for update;
--       if not found then
--         raise exception 'Ese producto no existe.';
--       end if;
--     end if;
--
--     -- Un proveedor dado de baja no se elige para un producto nuevo, pero el
--     -- que ya tenía puede quedar (dar de baja al proveedor no rompe la ficha).
--     if p_proveedor is not null and p_proveedor is distinct from v_prev
--        and not exists (select 1 from public.proveedores where id = p_proveedor and active) then
--       raise exception 'Ese proveedor no existe o está dado de baja.';
--     end if;
--
--     begin
--       if p_id is null then
--         insert into public.productos (nombre, descripcion, proveedor_id, active, stock_aviso, aromas, created_by, updated_by)
--         values (v_nombre, btrim(coalesce(p_descripcion, '')), p_proveedor, coalesce(p_activo, true),
--                 p_stock_aviso, coalesce(v_aromas, '{}'), auth.uid(), auth.uid())
--         returning id into v_id;
--       else
--         update public.productos
--            set nombre = v_nombre, descripcion = btrim(coalesce(p_descripcion, '')),
--                proveedor_id = p_proveedor, active = coalesce(p_activo, active),
--                stock_aviso = p_stock_aviso,
--                aromas = case when p_aromas is null then aromas else coalesce(v_aromas, '{}') end,
--                updated_by = auth.uid(), updated_at = now()
--          where id = p_id
--         returning id into v_id;
--       end if;
--     exception when unique_violation then
--       raise exception 'Ya hay un producto activo que se llama %.', v_nombre;
--     end;
--
--     for v_k, v_v in select key, value from jsonb_each(coalesce(p_precios, '{}'::jsonb)) loop
--       select code, name, is_manual into v_pm from public.payment_methods where code = v_k;
--       if not found then
--         raise exception 'El medio de pago % no existe.', v_k;
--       end if;
--       if jsonb_typeof(v_v) = 'null' then
--         delete from public.producto_precios where producto_id = v_id and method = v_k;
--       elsif jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}')::numeric <= 0 then
--         raise exception 'El precio en % tiene que ser un número mayor que cero.', v_pm.name;
--       elsif not v_pm.is_manual then
--         raise exception '% se acredita solo: no se le pone precio de mostrador.', v_pm.name;
--       else
--         insert into public.producto_precios (producto_id, method, precio, updated_by)
--         values (v_id, v_k, round((v_v #>> '{}')::numeric, 2), auth.uid())
--         on conflict (producto_id, method)
--           do update set precio = excluded.precio, updated_by = excluded.updated_by, updated_at = now();
--       end if;
--     end loop;
--
--     return v_id;
--   end;
--   $$;
--
--   create or replace function public.vender_producto(
--     p_producto  uuid,
--     p_cantidad  int,
--     p_aroma     text,
--     p_method    text,
--     p_student   uuid default null,
--     p_comprador text default '',
--     p_notas     text default '',
--     p_idem      uuid default null,
--     p_precio_esperado numeric default null
--   )
--   returns table (
--     venta_id uuid, numero bigint, cobrado numeric, precio_unitario numeric, cantidad int,
--     parte_estudio numeric, parte_proveedor numeric, medio text, cuenta text,
--     stock_restante int, paid_at timestamptz, repetida boolean
--   )
--   language plpgsql security definer set search_path = ''
--   as $$
--   declare
--     v_p      record;
--     v_prov   record;
--     v_pm     record;
--     v_precio numeric(14, 2);
--     v_total  numeric(14, 2);
--     v_est    numeric(14, 2);
--     v_aroma  text := btrim(regexp_replace(coalesce(p_aroma, ''), '\s+', ' ', 'g'));
--     v_comp   text := btrim(regexp_replace(coalesce(p_comprador, ''), '\s+', ' ', 'g'));
--     v_cuenta uuid;
--     v_ahora  timestamptz := now();
--     v_v      public.ventas_productos;
--   begin
--     if not public.can('inventario.vender') then
--       raise exception 'No tenés permiso para vender productos.';
--     end if;
--     if p_cantidad is null or p_cantidad < 1 then
--       raise exception 'La cantidad tiene que ser al menos 1.';
--     end if;
--     if v_aroma = '' then
--       raise exception 'Falta el aroma: escribilo antes de cobrar.';
--     end if;
--     if length(v_aroma) > 60 then
--       raise exception 'El aroma es demasiado largo (hasta 60 letras).';
--     end if;
--
--     select * into v_p from public.productos where id = p_producto for update;
--     if not found then
--       raise exception 'Ese producto no existe.';
--     end if;
--
--     if p_idem is not null then
--       select * into v_v from public.ventas_productos v where v.idem = p_idem;
--       if found then
--         -- La misma llave con otro producto no es un reintento: es un error del
--         -- navegador, y devolver la venta del otro producto con este stock mentiría.
--         if v_v.producto_id <> p_producto then
--           raise exception 'Ese cobro ya se registró con otro producto. Cerrá la venta y volvé a abrirla.';
--         end if;
--         return query
--           select v_v.id, v_v.numero, v_v.amount, v_v.precio_unitario, v_v.cantidad,
--                  v_v.parte_estudio, v_v.parte_proveedor,
--                  coalesce((select pm.name from public.payment_methods pm where pm.code = v_v.method), v_v.method),
--                  (select a.name from public.accounts a where a.id = v_v.account_id),
--                  v_p.stock, v_v.paid_at, true;
--         return;
--       end if;
--     end if;
--
--     if not v_p.active then
--       raise exception '% está dado de baja: no se vende.', v_p.nombre;
--     end if;
--     if v_p.proveedor_id is null then
--       raise exception '% no tiene proveedor cargado. Pedile a quien administra que lo complete en Productos: sin proveedor no queda a quién rendirle la venta.', v_p.nombre;
--     end if;
--     if v_p.stock < p_cantidad then
--       raise exception 'Quedan % de %: no alcanza para vender %.', v_p.stock, v_p.nombre, p_cantidad;
--     end if;
--
--     select * into v_pm from public.payment_methods where code = p_method;
--     if not found then
--       raise exception 'Ese medio de pago no existe.';
--     end if;
--     if not v_pm.active then
--       raise exception '% está dado de baja como medio de pago.', v_pm.name;
--     end if;
--     if not v_pm.is_manual then
--       raise exception '% se acredita solo: no se cobra desde el mostrador.', v_pm.name;
--     end if;
--
--     -- El precio de la lista para ese medio, tal cual. No se aplica el
--     -- ajuste_pct del medio: los precios por medio los dio el estudio.
--     select pp.precio into v_precio from public.producto_precios pp
--      where pp.producto_id = p_producto and pp.method = p_method;
--     if v_precio is null then
--       raise exception '% no tiene precio en %.', v_p.nombre, v_pm.name;
--     end if;
--     if p_precio_esperado is not null and round(p_precio_esperado, 2) <> v_precio then
--       raise exception 'El precio de % en % cambió: ahora es %. Revisalo con quien compra y volvé a cobrar.',
--         v_p.nombre, v_pm.name, public.pesos(v_precio);
--     end if;
--
--     select * into v_prov from public.proveedores where id = v_p.proveedor_id;
--
--     if p_student is not null then
--       select s.name into v_comp from public.students s where s.id = p_student;
--       if not found then
--         raise exception 'No se encontró la ficha de ese cliente.';
--       end if;
--     end if;
--
--     -- El % del estudio sobre lo cobrado; el redondeo queda del lado del
--     -- estudio y el proveedor se lleva exactamente el resto (el CHECK de la
--     -- tabla exige que sumen el total).
--     v_total := v_precio * p_cantidad;
--     v_est   := round(v_total * v_prov.pct_estudio / 100, 2);
--     -- La cuenta del medio, como los cobros desde la 0074. Sin cuenta
--     -- configurada cae en "A imputar", igual que un cobro.
--     v_cuenta := coalesce(v_pm.default_account_id, 'a0000000-0000-4000-8000-000000000009');
--
--     insert into public.ventas_productos (
--       producto_id, producto_nombre, proveedor_id, proveedor_nombre, aroma, cantidad,
--       precio_unitario, amount, pct_estudio, parte_estudio, parte_proveedor,
--       method, account_id, paid_at, paid_date, student_id, comprador_nombre, notas, idem, vendido_por
--     ) values (
--       p_producto, v_p.nombre, v_prov.id, v_prov.nombre, v_aroma, p_cantidad,
--       v_precio, v_total, v_prov.pct_estudio, v_est, v_total - v_est,
--       p_method, v_cuenta, v_ahora, (v_ahora at time zone 'America/Argentina/Buenos_Aires')::date,
--       p_student, left(coalesce(v_comp, ''), 80), btrim(coalesce(p_notas, '')), p_idem, auth.uid()
--     ) returning * into v_v;
--
--     update public.productos set stock = stock - p_cantidad where id = p_producto;
--     insert into public.stock_movimientos (producto_id, at, tipo, cantidad, stock_resultante, venta_id, created_by)
--     values (p_producto, v_ahora, 'venta', -p_cantidad, v_p.stock - p_cantidad, v_v.id, auth.uid());
--
--     return query
--       select v_v.id, v_v.numero, v_v.amount, v_v.precio_unitario, v_v.cantidad,
--              v_v.parte_estudio, v_v.parte_proveedor, v_pm.name,
--              (select a.name from public.accounts a where a.id = v_cuenta),
--              v_p.stock - p_cantidad, v_v.paid_at, false;
--   end;
--   $$;
--
--   do $fn$
--   declare f text;
--   begin
--     foreach f in array array[
--       'public.guardar_proveedor(uuid, text, text, text, numeric, boolean)',
--       'public.guardar_producto(uuid, text, text, uuid, boolean, integer, jsonb, text[])',
--       'public.vender_producto(uuid, integer, text, text, uuid, text, text, uuid, numeric)']
--     loop
--       execute format('revoke all on function %s from public, anon', f);
--       execute format('grant execute on function %s to authenticated', f);
--     end loop;
--   end
--   $fn$;
--
--   -- La vista de la 0090. `drop` y no `create or replace`: le sobran
--   -- columnas, y create or replace no deja sacarlas. Nada depende de ella.
--   drop view if exists public.ventas_productos_estado;
--   create or replace view public.ventas_productos_estado
--   with (security_invoker = on) as
--   select v.id, v.numero, v.paid_at, v.paid_date, v.producto_id, v.producto_nombre,
--          v.proveedor_id, v.proveedor_nombre, v.aroma, v.cantidad, v.precio_unitario,
--          v.amount, v.pct_estudio, v.parte_estudio, v.parte_proveedor,
--          v.method, coalesce(pm.name, v.method) as medio, v.account_id,
--          v.student_id, v.comprador_nombre, v.notas, v.vendido_por,
--          pr.full_name as vendido_por_nombre, v.created_at,
--          v.status, v.void_reason, v.anulado_por, v.anulado_at,
--          r.rendicion_id,
--          case when v.status = 'anulado' then 'anulada'
--               when r.rendicion_id is not null then 'rendida'
--               -- Con la parte del estudio en 100% no hay nada que rendirle a
--               -- nadie: sin esto quedaría "a rendir" para siempre por $0.
--               when v.parte_proveedor = 0 then 'sin_parte'
--               else 'a_rendir' end as estado
--     from public.ventas_productos v
--     left join public.payment_methods pm on pm.code = v.method
--     left join public.profiles pr on pr.id = v.vendido_por
--     left join lateral (select public.venta_rendida(v.id) as rendicion_id) r on true;
--   revoke all on public.ventas_productos_estado from public, anon, authenticated;
--   grant select on public.ventas_productos_estado to authenticated;
--
--   notify pgrst, 'reload schema';
--   commit;
--
-- Ojo: volver a correr la 0090 encima de la 0092 NO sirve para esto y no
-- hay que "arreglarlo": su vista tiene columnas de menos y aborta con
-- "cannot drop columns from view", así que la transacción entera vuelve
-- atrás sin tocar nada (probado). La vuelta atrás es la de arriba.
-- ============================================================
