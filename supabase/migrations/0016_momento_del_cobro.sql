-- ============================================================
-- 0016 — El momento exacto del cobro, y un solo día
--
-- Hoy `payments.paid_date` es una fecha sin hora, y el "día" se calcula de
-- cuatro maneras distintas según quién escriba:
--
--   · el navegador, con la fecha local de la máquina de quien cobra
--   · el proceso diario, con la fecha en huso argentino
--   · Mercado Pago, recortando su fecha de aprobación en UTC
--   · el disparador del comprobante, con la fecha del servidor (UTC)
--
-- Mientras el dato solo alimenta un gráfico mensual, la diferencia no se
-- nota. Para la caja diaria sí: un cobro de las 22:00 puede caer en el
-- día siguiente y aparecer en el arqueo equivocado.
--
-- Esta migración agrega el instante exacto y deja UNA definición de día:
-- la del huso del estudio. `paid_date` se conserva y se sincroniza sola,
-- así nada de lo que hoy la lee se rompe.
--
-- Prerrequisito del módulo de caja (sección 8 del documento).
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

alter table public.payments
  add column paid_at timestamptz;

-- Los cobros que ya están: se les asume el mediodía del huso del estudio,
-- que es la hora que menos riesgo tiene de caer en el día equivocado.
update public.payments
set paid_at = (paid_date::timestamp + interval '12 hours')
              at time zone 'America/Argentina/Buenos_Aires'
where paid_date is not null and paid_at is null;

-- Red por si algún cobro quedó sin fecha: sin esto desaparecería del
-- gráfico de ingresos, que ahora agrupa por paid_at.
update public.payments
set paid_at = created_at
where status = 'pagado' and paid_at is null;

-- El disparador del comprobante ahora también sella el instante, y deriva
-- la fecha del día del estudio en vez de la del servidor.
create or replace function public.assign_receipt_number()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'pagado' then
    if new.receipt_number is null then
      new.receipt_number := nextval('public.receipt_seq');
    end if;
    -- Quien cobra puede mandar el instante; si no viene, es ahora.
    new.paid_at := coalesce(new.paid_at, now());
    -- La fecha siempre se deriva del instante, en el huso del estudio:
    -- una sola definición de "día" para todo el sistema.
    new.paid_date := (new.paid_at at time zone 'America/Argentina/Buenos_Aires')::date;
  end if;
  return new;
end;
$$;

-- La vista de ingresos mensuales pasa a agrupar por el mes del huso del
-- estudio. Sigue siendo security_invoker: quien no tenga permiso para ver
-- finanzas no ve nada acá tampoco.
create or replace view public.monthly_revenue
with (security_invoker = on) as
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

-- Para los reportes por rango de fechas y para la caja diaria.
create index payments_paid_at_idx on public.payments (paid_at)
  where status = 'pagado';

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
--   select paid_date,
--          paid_at at time zone 'America/Argentina/Buenos_Aires' as momento
--     from public.payments
--    where status = 'pagado'
--    order by paid_at desc limit 5;
--
-- La fecha y el día del momento tienen que coincidir siempre.
-- El gráfico de ingresos del tablero no debería cambiar.
-- ============================================================
