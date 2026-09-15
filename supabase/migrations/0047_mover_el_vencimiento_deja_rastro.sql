-- ============================================================
-- 0047 — Mover el vencimiento deja rastro
--
-- Del pedido del estudio del 15/09 (§1): resolver una clienta sin salir
-- de Agenda, y una de las cinco cosas que quiere poder hacer ahí es
-- "actualizar vencimiento".
--
-- Se puede: el trigger `memberships_fechas` de la 0036 es `before
-- INSERT` solamente, así que calcula la vigencia al crear el período y
-- después no la vuelve a pisar. Mover `end_date` a mano funciona hoy y
-- nadie lo deshace.
--
-- El problema es otro: **no queda registro de nada**. `memberships` no
-- tiene una sola columna de autoría, y correr un vencimiento es regalar
-- días de un período que se cobró por un plazo fijo. Es la clase de
-- cosa que después nadie se acuerda de haber hecho.
--
-- POR QUÉ EL SELLO MIRA SI `end_date` CAMBIÓ
--
-- Un `before insert or update` pelado sellaría la membresía en cada
-- reserva: desde la 0029 `consumo_recalcular` hace un `update` a
-- `classes_used` cada vez que alguien reserva o cancela, y corre como
-- el usuario logueado. El registro diría que la recepción editó la
-- membresía cuarenta veces por mes sin haberla tocado nunca, y un
-- registro que miente es peor que no tenerlo.
--
-- Por eso sella **solo cuando el vencimiento se movió de verdad**, que
-- es exactamente el acto que se quiere poder auditar.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Las tres columnas
--
-- El motivo va en su propia columna y no en una nota suelta porque es
-- el dato que explica el resto: un vencimiento corrido sin motivo es
-- indistinguible de un error de tipeo. Mismo criterio que el motivo de
-- la suspensión (0018) y el de la anulación de un cobro (0020).
--
-- Nota de privacidad: la clienta lee sus propias membresías desde el
-- portal con `select('*')`, así que **va a ver este motivo**. Se
-- escribe pensando en eso, como el `override_reason` de la 0046.
-- ------------------------------------------------------------

alter table public.memberships
  add column if not exists end_date_motivo text,
  add column if not exists updated_by uuid references auth.users (id),
  add column if not exists updated_at timestamptz;

comment on column public.memberships.end_date_motivo is
  'Por qué se movió el vencimiento. Lo ve la clienta desde su portal.';

-- ------------------------------------------------------------
-- 2. El sello
-- ------------------------------------------------------------

create or replace function public.stamp_membership()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Solo el movimiento del vencimiento. Ver el encabezado: sin esta
  -- condición, cada reserva sellaría la membresía.
  if tg_op = 'UPDATE' and new.end_date is distinct from old.end_date then

    -- Un período que termina antes de empezar no vence nunca: no hay
    -- fecha en la que `membresia_para` lo encuentre, así que la clienta
    -- se queda sin poder reservar y el motivo no se ve por ningún lado.
    if new.end_date < new.start_date then
      raise exception
        'El vencimiento no puede ser anterior al inicio del período (%)',
        to_char(new.start_date, 'DD/MM/YYYY');
    end if;

    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists memberships_stamp on public.memberships;
create trigger memberships_stamp
  before update on public.memberships
  for each row execute function public.stamp_membership();

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
-- 1. Reservar y cancelar una clase NO tiene que sellar nada: el
--    contador se mueve y la autoría queda como estaba.
--
--      select id, classes_used, updated_by, updated_at
--      from public.memberships where status = 'activa';
--
-- 2. Mover el vencimiento desde Agenda sí sella, con el motivo escrito:
--
--      select m.end_date, m.end_date_motivo, p.full_name, m.updated_at
--      from public.memberships m
--      left join public.profiles p on p.id = m.updated_by
--      where m.updated_at is not null;
--
-- 3. Un vencimiento anterior al inicio se rechaza con su mensaje.
--
-- ============================================================
-- PARA VOLVER ATRÁS
--
--   begin;
--   drop trigger if exists memberships_stamp on public.memberships;
--   drop function if exists public.stamp_membership();
--   alter table public.memberships
--     drop column if exists end_date_motivo,
--     drop column if exists updated_by,
--     drop column if exists updated_at;
--   commit;
-- ============================================================
