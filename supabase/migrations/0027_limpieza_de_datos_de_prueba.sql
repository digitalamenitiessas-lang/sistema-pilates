-- ============================================================
-- 0027 — Se va la casa de muestra
--
-- El sistema se construyó sobre datos inventados: doce clientas con
-- nombres de fantasía, cuatro profesoras, veintitrés clases y sesenta y
-- tres pagos. Sirvieron para probar todo lo que se construyó, y no tienen
-- que estar el día que el estudio empiece a cargar a sus clientas reales.
--
-- Si conviven, recepción va a ver a "Camila Torres" mezclada con las
-- verdaderas, y los reportes van a sumar $1.793.000 que nadie cobró.
--
-- ⚠ ESTA MIGRACIÓN BORRA DE VERDAD. No es una baja lógica: son DELETE.
--   Es la única del proyecto que destruye información, y por eso lleva
--   una guardia que la hace abortar si encuentra una sola clienta que no
--   sea de las sembradas. Andá al dashboard de Supabase y sacá un backup
--   antes de correrla.
--
-- Lo que NO se toca, porque son catálogos que el estudio va a usar:
-- cuentas, categorías de gasto, medios de pago, salas, los parámetros de
-- Configuración y el motor de permisos entero.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- La guardia
--
-- Las filas sembradas en la 0001 tienen un prefijo fijo en su id. Si
-- aparece una clienta con otro prefijo es porque alguien ya la cargó a
-- mano, y entonces esta migración NO tiene que correr: fue escrita para
-- una base de pruebas, no para una con datos reales adentro.
--
-- Se planta con un mensaje, no borra a medias: un `raise exception`
-- dentro de la transacción deshace todo lo anterior.
-- ------------------------------------------------------------

do $$
declare
  v_clientas   int;
  v_profesoras int;
begin
  select count(*) into v_clientas
  from public.students where id::text not like 'c0000000%';

  select count(*) into v_profesoras
  from public.teachers where id::text not like 'a0000000%';

  if v_clientas > 0 then
    raise exception
      'Hay % clienta(s) que no son de prueba. Esta migración borra datos y no está pensada para correr con datos reales cargados: revisá antes de seguir.',
      v_clientas;
  end if;

  if v_profesoras > 0 then
    raise exception
      'Hay % profesora(s) que no son de prueba. Misma razón: revisá antes de seguir.',
      v_profesoras;
  end if;
end $$;

-- ------------------------------------------------------------
-- 1. Lo transaccional
--
-- En orden de hijo a padre. Varias de estas relaciones tienen `on delete
-- cascade` y se irían solas, pero se borran explícitamente para que el
-- SQL diga qué desaparece en vez de que haya que deducirlo de las claves
-- foráneas.
-- ------------------------------------------------------------

delete from public.notifications;
delete from public.reservations;
delete from public.payments;
delete from public.memberships;

-- Caja y gastos: las dos únicas filas son de las pruebas del 5 de
-- septiembre, las dos anuladas.
delete from public.account_movements;
delete from public.cash_sessions;
delete from public.expenses;

-- ------------------------------------------------------------
-- 2. La agenda de mentira
--
-- Se borra todo lo sembrado más una clase que quedó de una prueba: el
-- "Taller de suelo pélvico" del 5 de septiembre, que se cargó para
-- verificar las clases especiales de la 0017 y no se sacó después.
--
-- Cualquier clase que el estudio haya cargado de verdad sobrevive: solo
-- caen las de prefijo sembrado y esa, por nombre y fecha.
-- ------------------------------------------------------------

delete from public.class_occurrences
where class_id in (
  select id from public.class_sessions
  where id::text like 'e0000000%'
     or (title = 'Taller de suelo pélvico' and kind = 'especial')
);

delete from public.class_sessions
where id::text like 'e0000000%'
   or (title = 'Taller de suelo pélvico' and kind = 'especial');

-- ------------------------------------------------------------
-- 3. Las personas inventadas
-- ------------------------------------------------------------

delete from public.students where id::text like 'c0000000%';
delete from public.teachers where id::text like 'a0000000%';

-- ------------------------------------------------------------
-- 4. Un rastro más de las pruebas
--
-- 'Zona renombrada' quedó de verificar la cascada del renombre de
-- disciplinas. Está inactiva y no la usa nadie.
-- ------------------------------------------------------------

delete from public.disciplines
where name = 'Zona renombrada'
  and not exists (select 1 from public.class_sessions where discipline = 'Zona renombrada');

-- ------------------------------------------------------------
-- 5. Las salas, con nombres genéricos
--
-- No se borran: la agenda las necesita para cargar una clase. Se dejan
-- las cuatro con su nombre de siempre y el estudio las renombra desde
-- Configuración cuando decida cómo se llaman las suyas.
-- ------------------------------------------------------------

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
--   select
--     (select count(*) from public.students)      as clientas,
--     (select count(*) from public.teachers)      as profesoras,
--     (select count(*) from public.class_sessions) as clases,
--     (select count(*) from public.memberships)   as membresias,
--     (select count(*) from public.payments)      as pagos,
--     (select count(*) from public.reservations)  as reservas,
--     (select count(*) from public.expenses)      as gastos;
--     → todo en cero
--
--   select count(*) as cuentas from public.accounts;            → 5
--   select count(*) as categorias from public.expense_categories; → 10
--   select count(*) as medios from public.payment_methods;      → 4
--   select count(*) as salas from public.rooms;                 → 4
--   select count(*) as planes from public.plans where active;   → 6 (los FE)
--   select * from public.perm_diff();                           → cero filas
--
-- Y en la pantalla: el sistema queda vacío y usable. Inicio sin números,
-- la agenda sin clases, Clientas sin nadie. Los reportes en cero, que por
-- primera vez es la verdad.
--
-- ------------------------------------------------------------
-- LO QUE HAY QUE HACER A MANO DESPUÉS (no lo puede hacer una migración)
--
-- 1. Borrar el acceso de prueba al portal desde el dashboard de Supabase,
--    en Authentication → Users: camila.portal@pilatestudio.com. Vivía en
--    auth.users, que no se toca desde acá.
--
-- 2. Revisar si el usuario admin@pilatestudio.com se queda con ese mail o
--    hay que crear uno con el dominio del estudio. Es el único acceso de
--    administración que existe: NO borrarlo sin crear otro antes, o nadie
--    entra al sistema.
--
-- 3. Cargar desde Configuración lo que la web muestra y hoy está vacío:
--    dirección, WhatsApp, Instagram, email y horarios de atención.
--
-- 4. Cargar las profesoras reales, las salas y la grilla de horarios,
--    antes de dar de alta a la primera clienta.
-- ------------------------------------------------------------
-- ============================================================

-- ============================================================
-- VUELTA ATRÁS
--
-- No hay. Un DELETE no se deshace con otra migración: lo que se borra,
-- se borró. Para volver al estado anterior hay que restaurar el backup
-- del dashboard de Supabase, que por eso se pide antes de correrla.
-- ============================================================
