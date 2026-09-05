-- ============================================================
-- 0011 — Bloque 0: la mesa de control
--
-- Saca del código lo que el estudio tiene que poder cambiar solo:
--   1. studio_settings — los números del negocio y los datos del estudio,
--      con su etiqueta y su ayuda, para que la pantalla se arme sola y
--      agregar un parámetro nuevo sea un INSERT y no un deploy.
--   2. disciplines — catálogo editable (requisito explícito del documento
--      de Casa Fé: "poder agregar nuevas disciplinas sin depender del
--      desarrollador").
--   3. payment_methods — catálogo editable, base de los tres precios por
--      plan y, más adelante, de la caja diaria.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

-- ------------------------------------------------------------
-- 1. PARÁMETROS DEL NEGOCIO Y DATOS DEL ESTUDIO
--
--    Tabla aparte de app_settings a propósito: app_settings guarda el token
--    de Mercado Pago y por eso solo la lee el admin (migración 0008). Estos
--    parámetros los necesitan todos los roles (el portal tiene que saber el
--    plazo de cancelación) y algunos hasta la landing sin login.
-- ------------------------------------------------------------
create table public.studio_settings (
  key text primary key,
  value text not null default '',
  -- Cómo se edita y se valida en pantalla
  kind text not null default 'text'
    check (kind in ('text', 'number', 'boolean', 'time', 'choice', 'textarea')),
  -- Opciones cuando kind = 'choice' (etiqueta visible|valor guardado)
  options text[] not null default '{}',
  label text not null,
  help text not null default '',
  -- Agrupa los campos en la pantalla de Configuración
  group_key text not null default 'general'
    check (group_key in ('estudio', 'reservas', 'membresias', 'cobros', 'avisos', 'general')),
  sort_order int not null default 0,
  -- true = lo puede leer cualquiera sin login (lo usa la landing)
  is_public boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

alter table public.studio_settings enable row level security;

create policy "lectura autenticados"
  on public.studio_settings for select
  using (auth.uid() is not null);

-- Escribe el staff; el profesor y la alumna solo leen.
create policy "escritura staff"
  on public.studio_settings for all
  using (public.app_role() in ('admin', 'recepcion'))
  with check (public.app_role() in ('admin', 'recepcion'));

create or replace function public.stamp_studio_setting()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger studio_settings_stamp
  before update on public.studio_settings
  for each row execute function public.stamp_studio_setting();

-- La landing entra sin login: solo ve las claves marcadas como públicas.
-- (Las vistas corren con los permisos del dueño, así que no expone el resto.)
create view public.public_studio_settings as
select key, value
from public.studio_settings
where is_public;

-- ── Valores iniciales ────────────────────────────────────────────────────
-- Los defaults replican lo que hoy está escrito en el código, así que nada
-- cambia de comportamiento hasta que el estudio los toque.

insert into public.studio_settings (key, value, kind, options, label, help, group_key, sort_order, is_public) values
  -- Datos del estudio (los lee la landing)
  ('studio_name',      'PilatesStudio',            'text',     '{}', 'Nombre del estudio',      'Aparece en la web, en los emails y en los comprobantes.', 'estudio', 10, true),
  ('studio_address',   '',                         'text',     '{}', 'Dirección',               'Dirección que se muestra en la web.',                     'estudio', 20, true),
  ('studio_maps_url',  '',                         'text',     '{}', 'Link de Google Maps',     'Se abre al tocar la dirección en la web.',                'estudio', 30, true),
  ('studio_whatsapp',  '5493813007791',            'text',     '{}', 'WhatsApp',                'Solo números, con código de país y sin espacios. Ej: 5493811234567.', 'estudio', 40, true),
  ('studio_instagram', '',                         'text',     '{}', 'Instagram',               'Usuario sin la arroba.',                                  'estudio', 50, true),
  ('studio_email',     '',                         'text',     '{}', 'Email de contacto',       'Dirección a la que escriben las alumnas.',                'estudio', 60, true),
  ('studio_hours',     '',                         'textarea', '{}', 'Horario de atención',     'Texto libre. Ej: Lunes a viernes de 7 a 21, sábados de 9 a 13.', 'estudio', 70, true),

  -- Reservas y clases
  ('cancel_hours',            '12',          'number', '{}', 'Plazo de cancelación (horas)',        'Con cuántas horas de anticipación puede cancelar sin perder la clase.', 'reservas', 10, false),
  ('waitlist_offer_minutes',  '120',         'number', '{}', 'Tiempo para confirmar un lugar (minutos)', 'Cuando se libera un lugar se le ofrece a la primera de la lista de espera. Si no confirma en este tiempo, pasa a la siguiente.', 'reservas', 20, false),
  ('class_consumption',       'asistencia',  'choice',
     '{"Cuando viene a la clase|asistencia","Al reservar|reserva"}',
     'Cuándo se descuenta la clase',
     'Hoy la clase se descuenta cuando se marca la asistencia. La otra opción la descuenta al reservar y la devuelve si cancela en plazo.', 'reservas', 30, false),
  ('absence_consumes_class',  'true',        'boolean', '{}', 'La ausencia sin aviso consume la clase', 'Si está apagado, faltar sin avisar no descuenta la clase.', 'reservas', 40, false),

  -- Membresías
  ('expiry_warning_days', '5',   'number', '{}', 'Aviso de vencimiento (días antes)',   'Con cuántos días de anticipación se marca una membresía como "por vencer" y se avisa.', 'membresias', 10, false),
  ('freeze_max_days',     '30',  'number', '{}', 'Congelamiento máximo (días)',         'Cuántos días como máximo se puede congelar una membresía.', 'membresias', 20, false),
  ('recovery_after_days', '15',  'number', '{}', 'Pasa a "por recuperar" (días)',       'Cuántos días después de vencer, sin renovar, una alumna entra en la lista de recuperación.', 'membresias', 30, false),

  -- Cobros y prioridad del horario fijo
  ('payment_grace_days',    '5',  'number', '{}', 'Vencimiento de la cuota (días)',      'Cuántos días tiene para pagar desde que se genera la cuota.', 'cobros', 10, false),
  ('priority_pay_from_day', '1',  'number', '{}', 'La ventana de pago abre el día',      'Desde qué día del mes se puede pagar para conservar el horario fijo del mes siguiente.', 'cobros', 20, false),
  ('priority_pay_to_day',   '9',  'number', '{}', 'La ventana de pago cierra el día',    'Hasta qué día del mes se conserva la prioridad sobre el horario fijo.', 'cobros', 30, false),
  ('slot_release_day',      '10', 'number', '{}', 'Los lugares se liberan el día',       'Desde qué día del mes se liberan los horarios fijos de quienes no pagaron.', 'cobros', 40, false),

  -- Avisos
  ('debt_reminder_days',    '3',  'number', '{}', 'Recordatorio de deuda (días antes)',  'Con cuántos días de anticipación se avisa una cuota por vencer.', 'avisos', 10, false),
  ('priority_reminder_days','4',  'number', '{}', 'Recordatorio de la ventana de pago (días antes)', 'Cuántos días antes del cierre de la ventana se le recuerda a la alumna que pague para conservar su horario.', 'avisos', 20, false),
  ('renewal_catchup_days',  '7',  'number', '{}', 'Reintento de renovación (días)',      'Cuántos días hacia atrás mira el proceso diario para renovar membresías vencidas.', 'avisos', 30, false);

-- ------------------------------------------------------------
-- 2. CATÁLOGO DE DISCIPLINAS
--
--    class_sessions.discipline, plans.disciplines y teachers.disciplines
--    siguen guardando el nombre como texto: al renombrar, la app actualiza
--    en cascada (mismo criterio que las salas en 0004).
-- ------------------------------------------------------------
create table public.disciplines (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  -- Colores de la etiqueta en la agenda y en la web
  color text not null default '#C4735A',
  bg_color text not null default '#FDEEE8',
  text_color text not null default '#8B3A25',
  blurb text not null default '',
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.disciplines enable row level security;

create policy "lectura autenticados"
  on public.disciplines for select
  using (auth.uid() is not null);

create policy "escritura staff"
  on public.disciplines for all
  using (public.app_role() in ('admin', 'recepcion'))
  with check (public.app_role() in ('admin', 'recepcion'));

-- La landing las lee sin login (colores y textos de la sección disciplinas).
create view public.public_disciplines as
select name, color, bg_color, text_color, blurb, sort_order
from public.disciplines
where active
order by sort_order, name;

-- Seed: las 6 que hoy están escritas en el código, con sus mismos colores
-- y textos, para que la web y la agenda se vean igual que antes.
insert into public.disciplines (name, color, bg_color, text_color, blurb, sort_order) values
  ('Pilates Mat',      '#C4735A', '#FDEEE8', '#8B3A25', 'Fuerza y control desde el centro del cuerpo, en colchoneta. La base de todo.', 10),
  ('Pilates Reformer', '#7D9B76', '#E8F2EB', '#2E6040', 'Resistencia con resortes para trabajar profundo, con precisión y sin impacto.', 20),
  ('Pilates Clínico',  '#9B6E8E', '#F0EAF5', '#5A2F72', 'Rehabilitación y trabajo postural guiado, indicado junto a tu médico o kinesiólogo.', 30),
  ('Yoga',             '#D4A854', '#FDF5E6', '#7A5A1A', 'Respiración, flexibilidad y calma. El contrapeso perfecto para tu semana.', 40),
  ('Stretching',       '#5E8FA8', '#E6EFF5', '#1A4D6A', 'Movilidad y elongación profunda para descomprimir el cuerpo.', 50),
  ('Funcional',        '#B8956A', '#F5EDE0', '#6A4A1A', 'Fuerza aplicada a movimientos reales. Energía pura en grupos chicos.', 60);

-- Cualquier disciplina que ya estuviera cargada en una clase y no esté en la
-- lista de arriba entra igual, para no perder nada.
insert into public.disciplines (name, sort_order)
select distinct cs.discipline, 100
from public.class_sessions cs
where cs.discipline <> ''
  and not exists (select 1 from public.disciplines d where d.name = cs.discipline);

-- ------------------------------------------------------------
-- 3. CATÁLOGO DE MEDIOS DE PAGO
--
--    payments.method sigue siendo texto con su check: el catálogo maneja
--    el nombre visible, el orden y si está activo. El código 'mercadopago'
--    es el único con integración y no se puede borrar.
-- ------------------------------------------------------------
create table public.payment_methods (
  code text primary key,
  name text not null,
  -- false = lo acredita una integración (Mercado Pago), no se cobra a mano
  is_manual boolean not null default true,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.payment_methods enable row level security;

create policy "lectura autenticados"
  on public.payment_methods for select
  using (auth.uid() is not null);

create policy "escritura staff"
  on public.payment_methods for all
  using (public.app_role() in ('admin', 'recepcion'))
  with check (public.app_role() in ('admin', 'recepcion'));

insert into public.payment_methods (code, name, is_manual, sort_order) values
  ('efectivo',      'Efectivo',       true,  10),
  ('transferencia', 'Transferencia',  true,  20),
  ('tarjeta',       'Tarjeta',        true,  30),
  ('mercadopago',   'Mercado Pago',   false, 40);
