-- ============================================================
-- 0028 — El precio cambia según cómo se paga
--
-- La lista de Casa Fé tiene tres precios por membresía: transferencia es
-- el valor base, efectivo lleva 5% de descuento y tarjeta 25% de
-- recargo. Hoy el sistema guarda un solo precio por plan, así que
-- recepción hace la cuenta a mano sobre dieciocho combinaciones.
--
-- POR QUÉ DOS PORCENTAJES Y NO TRES PRECIOS
--
-- Se verificó la tabla del documento fila por fila: el precio de efectivo
-- es EXACTAMENTE base × 0,95 y el de tarjeta EXACTAMENTE base × 1,25, en
-- las seis membresías, sin una sola excepción.
--
--   45.000 → 42.750 y 56.250      80.000 → 76.000  y 100.000
--   65.000 → 61.750 y 81.250      95.000 → 90.250  y 118.750
--   20.000 → 19.000 y 25.000     110.000 → 104.500 y 137.500
--
-- Guardar tres precios por plan sería guardar la misma información tres
-- veces, y el día que ella cambie el descuento habría que editar doce
-- números a mano con la chance de equivocarse en uno. Así toca uno.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. El ajuste vive en el medio de pago
--
-- Negativo es descuento, positivo es recargo. Va acá y no en el plan
-- porque es una propiedad de CÓMO se paga, no de QUÉ se compra: el día
-- que se venda un producto en el mostrador, el 5% del efectivo vale
-- igual sin tener que repetirlo en cada precio.
-- ------------------------------------------------------------

alter table public.payment_methods
  add column if not exists ajuste_pct numeric(5,2) not null default 0
    check (ajuste_pct between -100 and 100);

comment on column public.payment_methods.ajuste_pct is
  'Qué le hace este medio al precio de lista. -5 = 5% de descuento, 25 = 25% de recargo, 0 = el precio tal cual.';

update public.payment_methods set ajuste_pct = -5 where code = 'efectivo';
update public.payment_methods set ajuste_pct = 25 where code = 'tarjeta';
update public.payment_methods set ajuste_pct =  0 where code in ('transferencia', 'mercadopago');

-- ------------------------------------------------------------
-- 2. Qué hacer cuando la cuenta no da redonda
--
-- Que los doce números del documento den exactos es una propiedad de
-- ESOS precios, no de la regla: base × 0,95 da entero solo si la base es
-- múltiplo de 20, y × 1,25 solo si es múltiplo de 4. El día que aumente
-- a $47.010, el descuento da $44.659,50.
--
-- El default es "a los $50 más cercanos" y no "a los $100" a propósito:
-- los doce valores de la lista son múltiplos de 50 —42.750, 56.250,
-- 61.750— así que redondear a 50 los deja intactos, y redondear a 100
-- convertiría 42.750 en 42.800 y le cambiaría el precio publicado.
--
-- Queda marcado como que ya rige, porque el código de esta misma entrega
-- lo lee.
-- ------------------------------------------------------------

insert into public.studio_settings
  (key, value, kind, options, label, help, group_key, sort_order, is_public, rige)
values
  ('price_rounding', 'cincuenta', 'choice',
   '{"A los $50 más cercanos|cincuenta","A los $100 más cercanos|cien","Siempre para arriba, a los $100|cien_arriba","Sin redondear, con centavos|ninguno"}',
   'Redondeo del precio ajustado',
   'Cuando el descuento o el recargo no dan un número redondo. Con los precios de hoy no cambia nada: los doce son múltiplos de 50.',
   'cobros', 15, false, true)
on conflict (key) do nothing;

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
--   select code, name, ajuste_pct from public.payment_methods order by sort_order;
--     → efectivo -5,00 · transferencia 0,00 · tarjeta 25,00 · mercadopago 0,00
--
--   -- La tabla del documento, calculada por la base:
--   select p.name,
--          p.price                                      as transferencia,
--          round(p.price * (1 + (select ajuste_pct from public.payment_methods where code='efectivo')/100) / 50) * 50 as efectivo,
--          round(p.price * (1 + (select ajuste_pct from public.payment_methods where code='tarjeta')/100) / 50) * 50 as tarjeta
--   from public.plans p
--   where p.name like 'FE %' and p.price > 0
--   order by p.price;
--     → FE START  45000 / 42750 / 56250
--     → FE FLOW   65000 / 61750 / 81250
--     → y así las seis, iguales al documento
--
-- Y en la pantalla: al cobrar, elegir Efectivo baja el monto y elegir
-- Tarjeta lo sube, con el cartel diciendo por qué. Lo que se guarda en el
-- pago es el monto ajustado, que es el que entró de verdad a la caja.
--
-- ------------------------------------------------------------
-- LO QUE ESTA MIGRACIÓN NO ARREGLA
--
-- El link de Mercado Pago sigue cobrando el precio base. No es un olvido:
-- al generar el link no se sabe con qué va a pagar la clienta —adentro
-- elige crédito, débito o saldo— y al acreditarse, mapMpMethod
-- (lib/mp-server.ts) descarta payment_type_id, que es justo el dato que
-- lo diría. Consecuencia comercial: tarjeta en el mostrador paga +25%,
-- tarjeta por el link paga base. Está preguntado a la clienta.
-- ------------------------------------------------------------
-- ============================================================

-- ============================================================
-- VUELTA ATRÁS (no ejecutar salvo que haga falta)
--
--   begin;
--   delete from public.studio_settings where key = 'price_rounding';
--   alter table public.payment_methods drop column ajuste_pct;
--   commit;
--
-- Ojo: el código deja de encontrar la columna y vuelve a cobrar el precio
-- de lista, así que hay que revertir también el commit que la usa.
-- ============================================================
