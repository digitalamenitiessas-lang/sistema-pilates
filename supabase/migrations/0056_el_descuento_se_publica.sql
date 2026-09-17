-- ============================================================
-- 0056 — El descuento por efectivo se publica en la web
--
-- El estudio pidió que debajo de los planes diga "-5% OFF Efectivo"
-- (16/09).
--
-- POR QUÉ UNA VISTA Y NO UN TEXTO EN LA PÁGINA
--
-- Ese 5% ya existe y ya rige: vive en `payment_methods.ajuste_pct` desde
-- la 0028, el estudio lo edita desde Configuración → Medios de pago, y es
-- el número con el que el sistema cobra. Escribirlo otra vez en la web
-- sería guardar el mismo dato dos veces, y el día que el estudio lo mueva
-- a 8 la página seguiría prometiendo 5 —cobrando una cosa y publicando
-- otra, que es la peor de las dos.
--
-- La landing entra sin login y `payment_methods` no le contesta: con la
-- anon key devuelve cero filas y ningún error, porque las políticas
-- filtran las filas (verificado hoy contra la API). Así que hace falta
-- una vista pública, como las cuatro que ya lee.
--
-- POR QUÉ SOLO LOS DESCUENTOS
--
-- La tabla también tiene el 25% de recargo de la tarjeta, y eso no se
-- publica: anunciar un recargo es una decisión del estudio, no algo que
-- deba pasar por sí solo porque la fila está al lado. La vista filtra
-- `ajuste_pct < 0`, así que para publicar el recargo alguien tiene que
-- venir acá a cambiarlo a propósito.
--
-- Un medio dado de baja tampoco sale: si mañana dejan de tomar efectivo,
-- la línea desaparece de la web sola.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- La vista corre con los permisos del dueño —sin `security_invoker`, al
-- revés de `turnos_fijos` en la 0048— y por eso puede mostrarle estas
-- tres columnas a quien no tiene sesión. Son tres y no `*` a propósito:
-- la cuenta contable del medio y su plazo de liquidación son de adentro.
create or replace view public.public_payment_discounts as
select code, name, ajuste_pct
from public.payment_methods
where active = true
  and ajuste_pct < 0
order by sort_order;

comment on view public.public_payment_discounts is
  'Los descuentos por medio de pago que la web publica. Solo medios activos y solo descuentos: el recargo de la tarjeta queda adentro a propósito.';

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
--   -- 1. La vista trae el efectivo y NO trae la tarjeta
--   select * from public.public_payment_discounts;
--   → una fila: efectivo · Efectivo · -5.00
--
--   -- 2. Y la lee alguien sin sesión (que es el caso de la web).
--   --    Desde la terminal, con la anon key:
--   --    curl "$URL/rest/v1/public_payment_discounts?select=*" -H "apikey: $ANON"
--   → la misma fila
--
--   -- 3. Que la tabla de abajo siga cerrada: la misma consulta a
--   --    payment_methods con la anon key tiene que dar []
--
--   -- 4. Y que la página siga al número: cambiá el descuento a -8 desde
--   --    Configuración → Medios de pago, recargá la web y la línea tiene
--   --    que decir -8% OFF. Después dejalo en -5.
--
-- PARA VOLVER ATRÁS
--
--   drop view if exists public.public_payment_discounts;
--
-- La web deja de mostrar la línea y nada más: el descuento con el que se
-- cobra no está acá, está en payment_methods.
-- ============================================================
