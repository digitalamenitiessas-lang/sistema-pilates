-- ============================================================
-- 0058 — La profesora ve las reservas de SUS clases, no las de todas
--
-- Verificado el 16/09 con la sesión real de Ivana: de las 13 reservas del
-- estudio veía las 13, y SEIS eran de clases que no dicta. La agenda le
-- listaba los turnos de la tarde de la otra profesora con nombre y
-- apellido de cada clienta anotada.
--
-- No es un agujero del motor: es la clave que tiene. `reservas.ver` es la
-- amplia. La acotada existe desde la 0012 y nunca se usó.
--
-- LO QUE LA 0012 DEJÓ ESCRITO, Y HABÍA QUE HACER PRIMERO
--
-- La ayuda de `reservas.ver.propio` dice, textual:
--
--   "NADIE la tiene hoy. Requiere teachers.user_id (se crea en 0012) y,
--    ANTES de encenderla, arreglar el cálculo de cupos de lib/api.ts o
--    las clases aparecen vacías."
--
-- Era exacto. El cupo que muestra la agenda se derivaba de la lista de
-- reservas que volvía en el paquete del estudio, y eso funcionaba sólo
-- porque todos los roles leían todas las reservas. Con esta clave, las
-- clases de la otra profesora habrían aparecido en 0/8: no escondidas,
-- mentidas.
--
-- Está arreglado en la entrega que acompaña a esta migración: el cupo
-- ahora sale de `class_occupancy`, la vista de la 0005 que —sin
-- `security_invoker`— corre con los permisos del dueño y cuenta todas las
-- reservas, no sólo las legibles. Es la misma vista con la que el portal
-- le muestra "8 lugares libres" a una clienta que no ve a las demás.
--
-- Verificado antes y después del cambio de código, con la clave todavía
-- amplia: los mismos números (jueves 12:00 en 1/8, el pie de la agenda en
-- 9 reservas confirmadas). Y verificado que Ivana puede leer esa vista:
-- 13 filas, incluidas las de las clases que no dicta.
--
-- POR QUÉ HAY QUE ENCENDER EL GRUPO, Y POR QUÉ ES SEGURO
--
-- `reservas.ver.propio` nace con `legacy_roles = '{}'`: en sombra, `can()`
-- responde el legado, y el legado es "nadie". O sea que tildarla sin
-- encender el grupo no hace absolutamente nada. Son dos pasos.
--
-- Encender el grupo es el no-op que el motor promete, y se verificó clave
-- por clave antes de escribir esto: en las OCHO del grupo Reservas la
-- matriz reproduce el legado exactamente.
--
--   reservas.anular      admin,recepcion  =  admin,recepcion
--   reservas.asistencia  admin,recepcion  =  admin,recepcion
--   reservas.crear       admin,recepcion  =  admin,recepcion
--   reservas.editar      admin,recepcion  =  admin,recepcion
--   reservas.eliminar    admin,recepcion  =  admin,recepcion
--   reservas.excepcion   admin,recepcion  =  admin,recepcion
--   reservas.ver         admin,profesor,recepcion = admin,profesor,recepcion
--   reservas.ver.propio  (nadie)          =  (nadie)
--
-- Así que lo único que cambia de comportamiento es el cambio deliberado
-- de abajo. Y ojo con una consecuencia del encendido, que CLAUDE.md
-- avisa: un grupo encendido SALE de la red de `perm_diff()`, que desde la
-- 0020 compara sólo las claves en sombra. Lo que protege es lo que
-- todavía no rige.
--
-- LO QUE NO CAMBIA
--
-- La grilla. La profesora sigue viendo las 64 clases de la semana con su
-- ocupación real, porque saber cuándo abre el estudio y qué tan llena
-- está cada clase no es un dato de nadie. Lo que deja de ver son los
-- NOMBRES de las clientas de las clases que no da. El agregado es
-- público; la identidad, no.
--
-- El portal de la clienta tampoco: sus reservas las lee por la política
-- "alumno lee sus reservas" de la 0005, que no pasa por estas claves
-- —verificado hoy: el alumno tiene cinco permisos y ninguno es
-- `reservas.ver`, y ve sus seis reservas igual—.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. La advertencia de la 0012 ya no aplica: se cumplió
--
-- Dejarla como está sería mandar al próximo a arreglar algo que está
-- arreglado, y peor, a buscarlo en unas líneas que se movieron.
-- ------------------------------------------------------------

update public.permission_keys
   set ayuda = 'Acota la lectura a las clases donde la persona es la profesora, por teachers.user_id (my_class_ids). Se suma con OR a reservas.ver, así que tener las dos es lo mismo que tener la amplia: para acotar de verdad hay que QUITAR reservas.ver. El cupo de la agenda no se rompe: desde la 0058 sale de class_occupancy, que cuenta todas las reservas aunque quien mira no las pueda leer.'
 where clave = 'reservas.ver.propio';

-- ------------------------------------------------------------
-- 2. El grupo pasa a regir
-- ------------------------------------------------------------

update public.permission_keys
   set enforce_mode = 'activo'
 where grupo = 'Reservas';

-- ------------------------------------------------------------
-- 3. El cambio deliberado: la profesora cambia la amplia por la acotada
--
-- En este orden y en la misma transacción. Al revés —primero dar la
-- acotada— no habría ninguna diferencia, porque la política las suma con
-- OR: mientras tenga la amplia, sigue viendo todo.
--
-- Admin y recepción no se tocan: siguen con la amplia.
-- ------------------------------------------------------------

delete from public.role_permissions
 where role = 'profesor' and clave = 'reservas.ver';

insert into public.role_permissions (role, clave)
values ('profesor', 'reservas.ver.propio')
on conflict do nothing;

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
--   -- 1. La matriz quedó como se quiere
--   select clave, array_agg(role order by role) as roles
--     from public.role_permissions
--    where clave like 'reservas.%'
--    group by clave order by clave;
--   → reservas.ver        {admin,recepcion}
--     reservas.ver.propio {profesor}
--     el resto            {admin,recepcion}
--
--   -- 2. El grupo rige
--   select clave, enforce_mode from public.permission_keys
--    where grupo = 'Reservas' order by clave;
--   → las ocho en 'activo'
--
-- Y lo que hay que ejercer, que es lo que importa:
--
--   -- 3. Con la sesión de una PROFESORA, en Reservas:
--   --    tienen que quedar sólo las reservas de sus clases. Con los datos
--   --    de hoy, Ivana pasa de 13 a 7.
--   -- 4. En la Agenda, la ocupación de las clases de la OTRA profesora
--   --    tiene que seguir siendo la de verdad, no 0/8. Este es el punto
--   --    que la 0012 avisó: si acá aparece 0/8, el cupo volvió a salir de
--   --    las reservas legibles.
--   -- 5. Con la sesión del ADMIN, Reservas tiene que seguir mostrando las
--   --    13. Si bajaron, el encendido del grupo no fue el no-op que se
--   --    verificó.
--
-- PARA VOLVER ATRÁS
--
--   begin;
--   delete from public.role_permissions
--    where role = 'profesor' and clave = 'reservas.ver.propio';
--   insert into public.role_permissions (role, clave)
--   values ('profesor', 'reservas.ver') on conflict do nothing;
--   update public.permission_keys set enforce_mode = 'sombra' where grupo = 'Reservas';
--   commit;
--
-- El freno de mano, si algo sale mal y hay gente esperando:
--   update public.permission_config set value = 'emergencia' where key = 'modo';
-- ============================================================
