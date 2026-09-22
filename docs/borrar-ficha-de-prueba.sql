-- ============================================================
-- Borrar una ficha de prueba y su cuenta, para volver a hacer el alta
-- desde cero
--
-- NO es una migración: no cambia el esquema y no va numerada. Es la
-- receta de una operación que ya se hizo tres veces a mano y que se va a
-- volver a hacer — por eso queda escrita, y por eso el mail está en un
-- solo lugar arriba en vez de repetido en cada consulta.
--
-- ESTO NO TIENE VUELTA ATRÁS. Son borrados de verdad, no bajas lógicas
-- (`active = false`). Si hay algo que valga la pena conservar, la
-- consulta para exportarlo está al final, y hay que correrla ANTES.
--
-- QUÉ SE VA SIN QUE ESTÉ ESCRITO ACÁ
--
-- Las siete claves foráneas que apuntan a `students` son todas
-- `on delete cascade` (0001, 0007, 0008, 0048, 0050): un solo `delete`
-- arrastra reservas, membresías, cobros, avisos, ficha de salud,
-- bitácora y turnos fijos. Y los cobros arrastran su imputación de caja
-- (`payment_staff`, 0020:334).
--
-- La cuenta de acceso va en un `delete` aparte y DESPUÉS, no antes:
-- `students.user_id` es `on delete set null` (0005:16), así que borrar
-- primero la cuenta dejaría la ficha viva y huérfana. Y al revés
-- funciona porque las reservas —que guardan en `created_by` el usuario
-- que las hizo, sin `on delete`— ya se fueron con la ficha.
--
-- LA PLATA
--
-- El saldo de una cuenta no es un campo: es la suma de sus movimientos
-- (`account_ledger` es una VISTA). Si la ficha tenía una cuota cobrada,
-- ese dinero desaparece del saldo solo, sin ningún ajuste. Es lo que se
-- quiere cuando era plata de prueba — pero conviene mirarlo antes, sobre
-- todo si hay un arqueo cerrado que ya lo contó.
--
-- Correr por bloques en el SQL Editor del dashboard de Supabase.
-- ============================================================


-- ------------------------------------------------------------
-- 1. MIRAR PRIMERO. Correr esto solo y leerlo.
--    Si no es la persona esperada, parar acá.
-- ------------------------------------------------------------

select s.name, s.email, s.member_no as credencial, s.user_id,
       (select count(*) from public.reservations  r where r.student_id = s.id) as reservas,
       (select count(*) from public.memberships   m where m.student_id = s.id) as membresias,
       (select count(*) from public.payments      p where p.student_id = s.id) as cobros,
       (select count(*) from public.payments      p where p.student_id = s.id and p.status = 'pagado') as cobros_cobrados,
       (select coalesce(sum(p.amount), 0) from public.payments p where p.student_id = s.id and p.status = 'pagado') as plata_que_se_va,
       (select count(*) from public.notifications n where n.student_id = s.id) as avisos,
       (select count(*) from public.fixed_slots   f where f.student_id = s.id) as turnos_fijos
  from public.students s
 where s.email = 'matiaslujanw@gmail.com';

-- Los saldos de ahora, para comparar después
select a.name,
       coalesce(sum(case when l.sentido = 'ingreso' then l.monto else -l.monto end), 0) as saldo
  from public.accounts a
  left join public.account_ledger l on l.account_id = a.id
 group by a.name order by a.name;

-- ¿Hay un arqueo CERRADO que ya contó esa plata? Si lo hay, borrar el
-- cobro deja el cierre contando algo que ya no existe, y eso no se
-- arregla solo: hay que reabrirlo.
select id, fecha, opened_at, closed_at, saldo_real, diferencia
  from public.cash_sessions
 where closed_at is not null
 order by fecha desc limit 5;


-- ------------------------------------------------------------
-- 2. LA FICHA. Se lleva todo lo de arriba por cascada.
-- ------------------------------------------------------------

begin;

delete from public.students
 where email = 'matiaslujanw@gmail.com';

commit;


-- ------------------------------------------------------------
-- 3. LA CUENTA DE ACCESO. Después de la ficha, nunca antes.
--
--    Arrastra el perfil, las suscripciones push y los avisos leídos
--    (todos `on delete cascade` sobre `auth.users`).
--
--    Si el editor lo rechaza por permisos, es lo mismo borrarla desde
--    Authentication → Users → la fila → Delete user.
-- ------------------------------------------------------------

begin;

delete from auth.users
 where email = 'matiaslujanw@gmail.com';

commit;


-- ------------------------------------------------------------
-- 4. LOS NÚMEROS DE COMPROBANTE
--
--    Salen de una secuencia, así que borrar un cobro deja un hueco: el
--    próximo sigue donde iba. Eso está BIEN mientras haya comprobantes
--    emitidos —un número que no existe no debería volver a emitirse—,
--    y está MAL si la prueba se llevó el único que había, porque
--    entonces el primer comprobante real del estudio saldría 000002.
--
--    Por eso el bloque se fija antes de tocar nada.
-- ------------------------------------------------------------

do $$
begin
  if exists (select 1 from public.payments where receipt_number is not null) then
    raise notice 'Quedan comprobantes emitidos: la secuencia no se toca.';
  else
    perform setval('public.receipt_seq', 1, false);
    raise notice 'No queda ningún comprobante: el próximo cobro vuelve a ser el 000001.';
  end if;
end $$;


-- ------------------------------------------------------------
-- 5. VERIFICAR
-- ------------------------------------------------------------

-- No queda la ficha ni la cuenta
select (select count(*) from public.students  where email = 'matiaslujanw@gmail.com') as fichas,
       (select count(*) from auth.users       where email = 'matiaslujanw@gmail.com') as cuentas;
-- → 0 y 0

-- No quedó nada colgado. Las FK son cascade, así que tiene que dar cero solo.
select
  (select count(*) from public.reservations r left join public.students s on s.id = r.student_id where s.id is null) as reservas_huerfanas,
  (select count(*) from public.memberships  m left join public.students s on s.id = m.student_id where s.id is null) as membresias_huerfanas,
  (select count(*) from public.payments     p left join public.students s on s.id = p.student_id where s.id is null) as cobros_huerfanos;
-- → 0, 0, 0

-- Y los saldos, contra los de antes
select a.name,
       coalesce(sum(case when l.sentido = 'ingreso' then l.monto else -l.monto end), 0) as saldo
  from public.accounts a
  left join public.account_ledger l on l.account_id = a.id
 group by a.name order by a.name;


-- ------------------------------------------------------------
-- SI HACE FALTA GUARDAR ALGO ANTES (correr en el paso 1, no después)
-- ------------------------------------------------------------
--
--   select json_agg(t) from (
--     select s.*,
--            (select json_agg(m) from public.memberships  m where m.student_id = s.id) as membresias,
--            (select json_agg(p) from public.payments     p where p.student_id = s.id) as cobros,
--            (select json_agg(r) from public.reservations r where r.student_id = s.id) as reservas
--       from public.students s where s.email = 'matiaslujanw@gmail.com'
--   ) t;
--
-- ------------------------------------------------------------
-- DESPUÉS: el alta se hace desde el sistema, no desde acá
--
-- Clientes → Nuevo cliente. Eso crea la cuenta, manda el mail de acceso
-- y asigna la credencial siguiente — que va a ser la próxima de la
-- secuencia, no la que tenía antes. Un número de credencial no se
-- reutiliza: si vuelve a existir un CF-0002, es otra persona.
-- ============================================================
