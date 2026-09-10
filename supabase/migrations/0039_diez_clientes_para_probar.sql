-- ============================================================
-- 0039 — Diez clientes para probar, y su vuelta atrás
--
-- Datos de prueba para el testeo antes de que el estudio opere. NO son
-- datos del estudio y no tienen que sobrevivir al testeo: para eso está
-- el bloque de VUELTA ATRÁS del final, que los borra a todos de una.
--
-- Van como migración y no cargados a mano por dos razones. La primera es
-- que así se borran con una sentencia: los diez llevan el prefijo fijo
-- 'feed0001' en su id, y el rollback es un delete por ese prefijo. La
-- segunda es que la 0027 —la que limpió los datos de prueba originales—
-- YA CORRIÓ y no se puede volver a correr: su guardia aborta si encuentra
-- una clienta que no sea de las sembradas. O sea que lo que se cargue a
-- mano de acá en adelante hay que sacarlo a mano, uno por uno.
--
-- LA MEZCLA, elegida para que cada pantalla tenga algo que mostrar y
-- cada caso de borde algo que ejercer:
--
--   1. Vale Prueba        FE FLOW vigente, pagada
--   2. Sofi Prueba        FE START vigente, pagada
--   3. Caro Prueba        FE BALANCE vigente, pagada
--   4. Meli Prueba        FE FULL vigente, pagada
--   5. Naty Prueba        FE FLOW vigente, cuota PENDIENTE — para cobrar
--   6. Rocío Prueba       FE START vigente, cuota VENCIDA — para ver la deuda
--   7. Juli Prueba        FE FIRST, el pase de prueba
--   8. Belén Prueba       mensualidad VENCIDA sin renovar
--   9. Flor Prueba        FE FLOW vigente + período ENCOLADO (pagó adelantado)
--  10. Agus Prueba        SIN membresía
--
-- LO QUE NO TRAE, a propósito: cuentas de acceso. Crear un usuario exige
-- email y contraseña, eso vive en `auth.users` —que no se toca desde una
-- migración— y además no se puede borrar desde el sistema, solo a mano en
-- el dashboard. Los accesos se crean desde la pantalla, con los emails
-- que ya están cargados acá abajo.
--
-- LAS FECHAS Y LOS CONTADORES NO SE ESCRIBEN. Los derivan los triggers
-- que ya están aplicados: `memberships_fechas` (0036/0037) calcula
-- start_date y end_date y encola el período de la que pagó adelantado, y
-- `consumir_clase` (0029) descuenta las clases de las reservas. Escribir
-- esos valores a mano acá sería inventar un estado que el sistema no
-- podría haber producido, que es lo peor que puede tener un dato de
-- prueba: pasa el test y esconde el bug.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. LOS DIEZ
--
-- Los emails son con el truco del '+': el proveedor entrega todo al mismo
-- buzón, así que los mails que el sistema manda se pueden LEER. Es la
-- mitad de lo que hay que probar y sin esto no se puede.
--
-- El nombre lleva "Prueba" adelante para que ordenados alfabéticamente no
-- se mezclen con nadie real, y el apellido "Prueba" para que se vean como
-- lo que son en cualquier listado.
-- ------------------------------------------------------------

insert into public.students (id, name, email, phone, dni, join_date) values
  ('feed0001-0000-0000-0000-000000000001', 'Vale Prueba',  'mlujan+vale@smt.gob.ar',  '3815000001', '40000001', current_date - 40),
  ('feed0001-0000-0000-0000-000000000002', 'Sofi Prueba',  'mlujan+sofi@smt.gob.ar',  '3815000002', '40000002', current_date - 35),
  ('feed0001-0000-0000-0000-000000000003', 'Caro Prueba',  'mlujan+caro@smt.gob.ar',  '3815000003', '40000003', current_date - 30),
  ('feed0001-0000-0000-0000-000000000004', 'Meli Prueba',  'mlujan+meli@smt.gob.ar',  '3815000004', '40000004', current_date - 25),
  ('feed0001-0000-0000-0000-000000000005', 'Naty Prueba',  'mlujan+naty@smt.gob.ar',  '3815000005', '40000005', current_date - 20),
  ('feed0001-0000-0000-0000-000000000006', 'Rocío Prueba', 'mlujan+rocio@smt.gob.ar', '3815000006', '40000006', current_date - 18),
  ('feed0001-0000-0000-0000-000000000007', 'Juli Prueba',  'mlujan+juli@smt.gob.ar',  '3815000007', '40000007', current_date - 3),
  ('feed0001-0000-0000-0000-000000000008', 'Belén Prueba', 'mlujan+belen@smt.gob.ar', '3815000008', '40000008', current_date - 60),
  ('feed0001-0000-0000-0000-000000000009', 'Flor Prueba',  'mlujan+flor@smt.gob.ar',  '3815000009', '40000009', current_date - 45),
  ('feed0001-0000-0000-0000-000000000010', 'Agus Prueba',  'mlujan+agus@smt.gob.ar',  '3815000010', '40000010', current_date - 1)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 2. LAS MEMBRESÍAS
--
-- `start_date` es lo único que se elige; el resto lo pone el trigger.
--
-- La de Belén arranca hace 45 días, así que su mes de calendario ya murió
-- y queda vencida sin renovar — el caso que el proceso diario tiene que
-- levantar. La segunda de Flor no dice desde cuándo: el trigger la encola
-- detrás de la primera, que es exactamente lo que hay que ver en la
-- ficha.
--
-- `classes_total` y `price` se copian del plan, igual que hace
-- assignMembership: son una foto, no una referencia, porque el precio del
-- plan puede cambiar y lo que se cobró no.
-- ------------------------------------------------------------

insert into public.memberships (student_id, plan_id, start_date, end_date, classes_total, price)
select s.id, p.id, s.inicio, s.inicio, p.class_count, p.price
from (values
  ('feed0001-0000-0000-0000-000000000001'::uuid, 'FE FLOW',    current_date - 10),
  ('feed0001-0000-0000-0000-000000000002'::uuid, 'FE START',   current_date - 8),
  ('feed0001-0000-0000-0000-000000000003'::uuid, 'FE BALANCE', current_date - 6),
  ('feed0001-0000-0000-0000-000000000004'::uuid, 'FE FULL',    current_date - 5),
  ('feed0001-0000-0000-0000-000000000005'::uuid, 'FE FLOW',    current_date - 4),
  ('feed0001-0000-0000-0000-000000000006'::uuid, 'FE START',   current_date - 12),
  ('feed0001-0000-0000-0000-000000000007'::uuid, 'FE FIRST',   current_date - 1),
  ('feed0001-0000-0000-0000-000000000008'::uuid, 'FE FLOW',    current_date - 45),
  ('feed0001-0000-0000-0000-000000000009'::uuid, 'FE FLOW',    current_date - 7)
) as s(id, plan, inicio)
join public.plans p on p.name = s.plan;

-- El período que Flor pagó adelantado. No lleva fecha de inicio elegida a
-- propósito: `current_date` va a caer dentro de su período vigente y el
-- trigger la va a correr al día siguiente del vencimiento. Si en vez de
-- eso el trigger la dejara arrancar hoy, quedarían dos membresías
-- solapadas y este dato de prueba estaría escondiendo un bug.
insert into public.memberships (student_id, plan_id, start_date, end_date, classes_total, price)
select 'feed0001-0000-0000-0000-000000000009'::uuid, p.id, current_date, current_date,
       p.class_count, p.price
from public.plans p where p.name = 'FE FLOW';

-- ------------------------------------------------------------
-- 3. LAS CUOTAS
--
-- Tres estados, que son los tres que la pantalla distingue: pagada,
-- pendiente en plazo y pendiente fuera de plazo. El 'vencido' no existe
-- como estado en la base —se deriva de `due_date` al leer (0001:144)— así
-- que la de Rocío es una pendiente con la fecha ya pasada.
-- ------------------------------------------------------------

insert into public.payments (student_id, membership_id, concept, amount, due_date, paid_date, status, method)
select m.student_id, m.id, p.name, m.price,
       m.start_date + 5,
       case when v.estado = 'pagado' then m.start_date else null end,
       v.estado,
       case when v.estado = 'pagado' then v.medio else null end
from (values
  ('feed0001-0000-0000-0000-000000000001'::uuid, 'pagado',    'transferencia'),
  ('feed0001-0000-0000-0000-000000000002'::uuid, 'pagado',    'efectivo'),
  ('feed0001-0000-0000-0000-000000000003'::uuid, 'pagado',    'tarjeta'),
  ('feed0001-0000-0000-0000-000000000004'::uuid, 'pagado',    'transferencia'),
  ('feed0001-0000-0000-0000-000000000005'::uuid, 'pendiente', null),
  ('feed0001-0000-0000-0000-000000000008'::uuid, 'pagado',    'efectivo')
) as v(id, estado, medio)
join public.memberships m on m.student_id = v.id
join public.plans p on p.id = m.plan_id;

-- La de Rocío, con el plazo ya pasado: la pantalla la va a mostrar como
-- vencida sin que ningún proceso la toque.
insert into public.payments (student_id, membership_id, concept, amount, due_date, status)
select m.student_id, m.id, p.name || ' — cuota atrasada', m.price, current_date - 4, 'pendiente'
from public.memberships m
join public.plans p on p.id = m.plan_id
where m.student_id = 'feed0001-0000-0000-0000-000000000006';

-- ------------------------------------------------------------
-- 4. UNAS RESERVAS, PARA QUE LA AGENDA NO ESTÉ VACÍA
--
-- Cinco clientas anotadas en la próxima vez que se dicta cada clase.
--
-- La fecha se calcula, no se escribe: tiene que caer en el día de la
-- semana de su clase o el trigger de la 0038 la rechaza — y ese rechazo
-- estaría bien, así que el dato de prueba se adapta a la regla en vez de
-- pedirle excepciones.
--
-- Y al insertarlas, `consumir_clase` les va a descontar la clase de su
-- membresía. Eso es lo que se quiere ver: que los contadores de la ficha
-- se muevan solos.
-- ------------------------------------------------------------

insert into public.reservations (student_id, class_id, date, status)
select v.id, c.id,
       -- La próxima fecha en que se dicta esa clase. day_of_week va 0 =
       -- lunes y isodow 1 = lunes, de ahí el -1.
       current_date + ((c.day_of_week - (extract(isodow from current_date)::int - 1) + 7) % 7)
                    + case when c.day_of_week = (extract(isodow from current_date)::int - 1) then 7 else 0 end,
       'confirmada'
from (values
  ('feed0001-0000-0000-0000-000000000001'::uuid, '08:00'::time),
  ('feed0001-0000-0000-0000-000000000002'::uuid, '09:00'::time),
  ('feed0001-0000-0000-0000-000000000003'::uuid, '10:00'::time),
  ('feed0001-0000-0000-0000-000000000004'::uuid, '18:00'::time),
  ('feed0001-0000-0000-0000-000000000005'::uuid, '19:00'::time)
) as v(id, hora)
join public.class_sessions c
  on c.start_time = v.hora and c.active and c.day_of_week = 0;

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
--   -- Los diez, con lo que la ficha les va a mostrar
--   select s.name,
--          coalesce(p.name, '— sin membresía') as plan,
--          m.start_date, m.end_date,
--          m.classes_used || '/' || m.classes_total as clases,
--          case when m.end_date < current_date then 'vencida'
--               when m.start_date > current_date then 'empieza después'
--               else 'vigente' end as estado
--   from public.students s
--   left join public.memberships m on m.student_id = s.id
--   left join public.plans p on p.id = m.plan_id
--   where s.id::text like 'feed0001%'
--   order by s.name, m.start_date;
--   → once filas (Flor tiene dos), y la segunda de Flor tiene que arrancar
--     el día siguiente al end_date de la primera. Si arranca hoy, el
--     encolado de la 0037 no está funcionando.
--
--   -- Las cuotas, con el estado que se deriva
--   select s.name, y.concept, y.amount, y.due_date, y.status,
--          case when y.status = 'pendiente' and y.due_date < current_date
--               then 'se muestra VENCIDA' else '' end as ojo
--   from public.payments y join public.students s on s.id = y.student_id
--   where s.id::text like 'feed0001%' order by s.name;
--   → siete cuotas: cinco pagadas, una pendiente en plazo y la de Rocío vencida
--
--   -- Que las reservas movieron los contadores
--   select s.name, m.classes_used, m.classes_total
--   from public.memberships m join public.students s on s.id = m.student_id
--   where s.id::text like 'feed0001%' and m.classes_used > 0;
--   → las cinco que quedaron anotadas, con 1 clase usada
--
--   select * from public.consumo_control();   → cero filas
-- ============================================================

-- ============================================================
-- VUELTA ATRÁS — CORRERLA AL TERMINAR EL TESTEO
--
-- Se lleva todo en cascada: membresías, cuotas, reservas y avisos de los
-- diez. Es un delete de verdad y no hace falta backup, porque lo único
-- que borra es lo que esta migración creó.
--
--   begin;
--   delete from public.students where id::text like 'feed0001%';
--   commit;
--
--   -- Y comprobar que no quedó nada:
--   select count(*) from public.students where id::text like 'feed0001%';   → 0
--   select count(*) from public.memberships;                                 → 0
--
-- Los ACCESOS que se hayan creado desde la pantalla NO se van con esto:
-- viven en `auth.users` y se borran a mano en el dashboard, en
-- Authentication → Users. Los reconocés por el '+' del email.
-- ============================================================
