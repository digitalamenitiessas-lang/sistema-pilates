-- ============================================================
-- PilatesStudio — Fase 2: integración Mercado Pago
-- Ejecutar completo en el SQL Editor del dashboard.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Configuración de la aplicación (credenciales MP, etc.)
--    La carga el propio admin desde la pantalla Configuración.
-- ------------------------------------------------------------
create table public.app_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

-- Recepción también lee (necesita el token para generar links de pago
-- a través del servidor); solo admin modifica.
create policy "staff lee configuracion"
  on public.app_settings for select
  using (public.app_role() in ('admin', 'recepcion'));

create policy "admin escribe configuracion"
  on public.app_settings for all
  using (public.app_role() = 'admin')
  with check (public.app_role() = 'admin');

-- ------------------------------------------------------------
-- 2. Datos de Mercado Pago en los pagos
-- ------------------------------------------------------------
alter table public.payments add column mp_preference_id text;
alter table public.payments add column mp_payment_id text;
alter table public.payments add column mp_link text;

-- Nuevo método de pago 'mercadopago' (acreditación online)
alter table public.payments drop constraint payments_method_check;
alter table public.payments add constraint payments_method_check
  check (method in ('efectivo', 'transferencia', 'tarjeta', 'mercadopago'));
