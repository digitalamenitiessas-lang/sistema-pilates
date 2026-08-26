-- 0010 — Renovación automática de membresías.
--
-- El cron diario renueva las membresías activas que vencieron (mismo plan,
-- precio actual del plan) y genera la cuota del mes como pago pendiente,
-- con aviso al staff y email a la alumna (con link de pago si MP está
-- conectado). El interruptor por membresía vive en la ficha: si una alumna
-- deja el estudio, se apaga auto_renew y listo (los planes de prueba nunca
-- se renuevan solos).

alter table public.memberships
  add column auto_renew boolean not null default true;

-- Nuevo tipo de notificación para el evento de renovación.
alter table public.notifications
  drop constraint notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (type in (
    'pago_acreditado', 'nuevo_alumno',
    'membresia_por_vencer', 'membresia_vencida', 'deuda_vencida',
    'membresia_renovada'
  ));
