-- ============================================================
-- 0075 — El libro de caja dice el nombre del medio, no su código
--
-- Cola de la 0074, y del mismo tamaño que la causa: chica.
--
-- Mientras los medios de pago fueron los cuatro que sembró la 0011, esto
-- no se notaba — sus códigos se leen igual que sus nombres: 'efectivo',
-- 'transferencia', 'tarjeta'. Desde la 0074 el estudio crea los suyos
-- desde Configuración, y ahí el código es un slug: "Débito Macro" se
-- guarda como `debito_macro`, y el libro de caja lo mostraba así, con
-- guión bajo y sin tilde, en la columna que lee la encargada.
--
-- Y hay algo peor que la estética: el nombre del medio SE PUEDE EDITAR y
-- el código NO. Si el estudio renombra "Débito" a "Crédito" porque se
-- equivocó, el libro seguía diciendo `debito` para siempre, contradiciendo
-- a Configuración y al reporte de cobrado por medio —que ya resolvía el
-- nombre contra el catálogo (`cobros_por_medio`, 0020:851)—. Tres
-- pantallas y dos respuestas para el mismo dato.
--
-- El `coalesce` deja el código crudo si el medio ya no está en el
-- catálogo: feo, pero cierto. Un cobro viejo no puede quedarse sin decir
-- con qué se pagó.
--
-- La vista se recrea entera porque `create or replace view` exige las
-- mismas columnas, en el mismo orden y del mismo tipo — y eso se cumple:
-- `medio` sigue siendo text y sigue quinta. Lo único que cambia son los
-- dos `select` que la alimentan y los dos left join nuevos.
--
-- SIGUE SIENDO `security_invoker`, y no es un detalle: es lo que hace que
-- el libro herede el permiso de los pagos en vez de abrir una segunda
-- puerta a los montos. Un `create or replace` que se olvide del WITH la
-- dejaría corriendo con los permisos del dueño.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

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

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
-- 1. La vista sigue siendo security_invoker. Si esto da 'f', PARAR y
--    volver atrás: el libro estaría mostrando montos a quien no puede
--    verlos.
--
--    select c.relname, c.reloptions
--      from pg_class c
--     where c.relname = 'account_ledger';
--    -- tiene que incluir security_invoker=on
--
-- 2. El medio sale con su nombre. Con un cobro hecho:
--
--    select origen, medio, monto, contraparte from public.account_ledger
--     order by at desc limit 5;
--    -- "Efectivo" y no "efectivo"; "Débito Macro" y no "debito_macro"
--
-- 3. Y sigue el mismo libro: los saldos no se tienen que mover.
--
--    select a.name,
--           coalesce(sum(case when l.sentido = 'ingreso' then l.monto else -l.monto end), 0) as saldo
--      from public.accounts a
--      left join public.account_ledger l on l.account_id = a.id
--     group by a.name order by a.name;
--    -- los mismos números que antes de correr esto
--
-- 4. En el sistema: Caja → Movimientos tiene que mostrar el nombre del
--    medio, igual que el reporte "Cobrado por medio" ya lo mostraba.
--
-- PARA VOLVER ATRÁS
--
--   Recrear la vista tal como está en la 0020 (líneas 735-782), o sea con
--   `p.method as medio` y `g.method` y sin los dos left join a
--   payment_methods. No hay datos que revertir: es una vista.
-- ============================================================
