-- ============================================================
-- 0074 — El medio de pago de un cobro lo manda el catálogo, no un CHECK
--
-- Es la deuda que la 0020 dejó anotada con nombre y apellido:
--
--   "OJO: payments.method sigue con su CHECK de cuatro valores
--    (0002:37-39). Cambiarlo por una FK al catálogo es correcto y está
--    pendiente, pero HOY rompería la pantalla de Pagos: METHOD_ICON /
--    METHOD_LABEL / METHOD_COLORS son objetos de cuatro claves escritos a
--    mano y un código desconocido deja el icono en undefined, que en React
--    es una pantalla en blanco. Primero se derivan del catálogo en el
--    front, después la FK, en su propia migración."
--
-- El "primero" ya está hecho y desplegado: la pantalla de Pagos busca el
-- nombre y el icono en el catálogo, con un valor por defecto para lo que
-- no conoce. Esta migración es el "después".
--
-- QUÉ CAMBIA
--
-- Hasta acá la base decía "la columna method sólo puede valer una de
-- estas cuatro palabras", con las cuatro escritas adentro de la regla.
-- Por eso el botón "Nuevo medio de pago" de Configuración —que existe
-- desde la 0011— creaba una fila que después no servía para cobrar: la
-- palabra no estaba en la lista y el INSERT del cobro rebotaba.
--
-- Ahora la regla dice "tiene que ser un medio del catálogo", apuntando a
-- `payment_methods`. Agregar un medio pasa a ser cargar una fila.
--
-- NO ES UN DISEÑO NUEVO: `expenses.method` ya es exactamente esta clave
-- ajena desde la 0020 (línea 479), con el mismo `on update cascade`. Lo
-- que hace esta migración es traer `payments` al modelo que el resto del
-- módulo de caja ya usa.
--
-- POR QUÉ `on update cascade` Y NADA EN EL DELETE
--
-- Si mañana se corrige el código de un medio, los cobros lo siguen solos.
-- Y en el borrado no se pone nada a propósito: sin acción, la base impide
-- borrar un medio que tiene cobros hechos. Eso es lo que se quiere — un
-- cobro sin medio sería historia perdida— y además no molesta a nadie,
-- porque el sistema no borra medios: los apaga (`active = false`), y un
-- medio apagado sigue leyéndose en los cobros viejos.
--
-- LO QUE SE VERIFICÓ ANTES DE ESCRIBIRLA
--
-- Que no haya ningún cobro con un medio fuera del catálogo, que es lo
-- único que haría fallar la creación de la clave. La consulta está abajo
-- y hay que correrla: si devuelve filas, PARAR — esos códigos hay que
-- corregirlos o darles su fila en `payment_methods` antes.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================


-- ------------------------------------------------------------
-- ANTES: mirar que no haya un medio huérfano. Tiene que dar CERO filas.
-- ------------------------------------------------------------
--
--   select p.method, count(*) as cobros
--     from public.payments p
--    where p.method is not null
--      and not exists (select 1 from public.payment_methods m where m.code = p.method)
--    group by p.method;
--
--   -- Si devuelve algo, cada código de esos necesita su fila:
--   --   insert into public.payment_methods (code, name, is_manual, sort_order)
--   --   values ('<codigo>', '<Nombre>', true, 99);


begin;

-- El CHECK de la 0002, que era la copia en la base de una lista que
-- también estaba en el código.
alter table public.payments
  drop constraint if exists payments_method_check;

alter table public.payments
  add constraint payments_method_fkey
  foreign key (method) references public.payment_methods (code)
  on update cascade;

comment on column public.payments.method is
  'El code del medio con el que se cobró, contra el catálogo payment_methods. Nulo mientras la cuota no se cobró.';

commit;


-- ============================================================
-- CÓMO VERIFICAR
--
-- 1. La regla vieja se fue y la nueva está:
--
--    select conname, pg_get_constraintdef(oid)
--      from pg_constraint
--     where conrelid = 'public.payments'::regclass
--       and conname like '%method%';
--    -- tiene que quedar payments_method_fkey, y NO payments_method_check
--
-- 2. Los cuatro de siempre siguen entrando. Desde el sistema, con sesión
--    de admin: cobrar una cuota en efectivo. Tiene que salir igual que
--    siempre, con su comprobante y su imputación a la Caja del mostrador.
--
-- 3. Y lo que esta migración viene a habilitar, que es el punto:
--
--    · Configuración → Cuentas → nueva cuenta "Macro" (tipo Banco).
--    · Configuración → Medios de pago → nuevo medio "Débito", y elegirle
--      la cuenta Macro en el selector de su fila.
--    · Pagos → cobrar una cuota con Débito. ANTES de esta migración la
--      base rechazaba ese INSERT; ahora tiene que entrar.
--    · Y la plata tiene que aparecer en Macro, no en "A imputar": eso lo
--      hace sola la base con el trigger de la 0020, leyendo
--      default_account_id.
--
--    select p.receipt_number, p.method, a.name as cuenta, p.amount
--      from public.payments p
--      left join public.accounts a on a.id = p.account_id
--     where p.status = 'pagado'
--     order by p.paid_at desc limit 5;
--
-- 4. Que no se pueda borrar un medio con cobros (la red del delete):
--
--    delete from public.payment_methods where code = 'efectivo';
--    -- tiene que fallar con violación de clave ajena. NO confirmar.
--
-- PARA VOLVER ATRÁS
--
--   begin;
--   alter table public.payments drop constraint if exists payments_method_fkey;
--   alter table public.payments add constraint payments_method_check
--     check (method in ('efectivo', 'transferencia', 'tarjeta', 'mercadopago'));
--   commit;
--
--   Ojo: si para entonces ya hay cobros hechos con un medio nuevo, ese
--   CHECK no va a poder crearse hasta que esos cobros se corrijan. Es la
--   señal de que la vuelta atrás ya no es gratis, no un error.
-- ============================================================
