-- 0007 — Notificaciones persistentes + suscripciones push.
--
-- Hasta acá las "alertas" se derivaban en memoria al abrir la app y la
-- campana del header era solo un contador. Esta migración crea:
--   · notifications: eventos persistidos (pago acreditado, nuevo alumno,
--     membresía por vencer/vencida, deuda vencida). Los generan triggers
--     (eventos instantáneos) y el cron diario (vencimientos).
--   · notification_reads: leído/no-leído POR USUARIO (si recepción lee
--     una notificación, el admin la sigue viendo como nueva).
--   · push_subscriptions: dispositivos suscriptos a Web Push.
--
-- La idempotencia la garantiza dedupe_key (unique): el mismo evento puede
-- intentarse mil veces (webhook + sync + cron re-corrido) y queda una sola.

-- ── Notificaciones ────────────────────────────────────────────────────────

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in (
    'pago_acreditado', 'nuevo_alumno',
    'membresia_por_vencer', 'membresia_vencida', 'deuda_vencida'
  )),
  title text not null,
  body text not null default '',
  -- referencias opcionales para navegar desde la campana
  student_id uuid references public.students(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete cascade,
  membership_id uuid references public.memberships(id) on delete cascade,
  -- quién debe verla: el staff del estudio o el alumno referenciado
  audience text not null default 'staff' check (audience in ('staff', 'alumno')),
  dedupe_key text unique,
  created_at timestamptz not null default now()
);

create index notifications_created_idx on public.notifications (created_at desc);

alter table public.notifications enable row level security;

create policy "staff ve notificaciones del estudio" on public.notifications
  for select using (
    audience = 'staff' and public.app_role() in ('admin', 'recepcion')
  );

create policy "alumno ve sus notificaciones" on public.notifications
  for select using (
    audience = 'alumno' and student_id in (select public.my_student_ids())
  );

-- Nadie escribe desde el cliente: insertan los triggers (security definer)
-- y el cron con service role.

create table public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

alter table public.notification_reads enable row level security;

create policy "cada usuario maneja sus lecturas" on public.notification_reads
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── Triggers de eventos instantáneos ─────────────────────────────────────

-- Pago acreditado: cubre de una el webhook de MP, el sync manual y los
-- cobros en mostrador (insert ya 'pagado' o update pendiente → pagado).
create or replace function public.notify_payment_paid()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_student_name text;
begin
  if new.status = 'pagado' and (tg_op = 'INSERT' or old.status is distinct from 'pagado') then
    select name into v_student_name from public.students where id = new.student_id;
    insert into public.notifications (type, title, body, student_id, payment_id, audience, dedupe_key)
    values (
      'pago_acreditado',
      'Pago acreditado',
      coalesce(v_student_name, 'Un alumno') || ' pagó $' || trim(to_char(new.amount, 'FM999G999G999'))
        || coalesce(' — ' || nullif(new.concept, ''), ''),
      new.student_id,
      new.id,
      'staff',
      'pago-' || new.id
    )
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
end;
$$;

create trigger payments_notify_paid
  after insert or update of status on public.payments
  for each row execute function public.notify_payment_paid();

-- Nuevo alumno dado de alta.
create or replace function public.notify_new_student()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.notifications (type, title, body, student_id, audience, dedupe_key)
  values (
    'nuevo_alumno',
    'Nuevo alumno',
    new.name || ' se sumó al estudio',
    new.id,
    'staff',
    'alumno-' || new.id
  )
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

create trigger students_notify_new
  after insert on public.students
  for each row execute function public.notify_new_student();

-- ── Suscripciones Web Push ────────────────────────────────────────────────

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "cada usuario maneja sus dispositivos" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── Realtime: la campana se entera de inserts sin recargar ───────────────

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.notifications;
    exception when duplicate_object then
      null; -- ya estaba agregada
    end;
  end if;
end $$;
