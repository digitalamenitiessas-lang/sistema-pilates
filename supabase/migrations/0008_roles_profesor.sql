-- 0008 — Recorte del rol profesor + credenciales de MP solo para admin.
--
-- Decisión del 26/08/2026: el profesor consulta lo operativo (agenda,
-- alumnos, reservas) pero NO datos económicos (pagos) ni sensibles de la
-- ficha (notas médicas, contacto de emergencia). Como RLS no filtra por
-- columna, lo sensible de la ficha se muda a una tabla propia.

-- ── 1. El profesor deja de leer pagos ─────────────────────────────────────

drop policy "staff y profesores leen" on public.payments;

create policy "staff lee pagos"
  on public.payments for select
  using (public.app_role() in ('admin', 'recepcion'));

-- ── 2. Datos sensibles de la ficha a tabla aparte ─────────────────────────

create table public.student_private (
  student_id uuid primary key references public.students(id) on delete cascade,
  medical_notes text not null default '',
  emergency_contact text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.student_private (student_id, medical_notes, emergency_contact)
select id, coalesce(medical_notes, ''), coalesce(emergency_contact, '')
from public.students
where coalesce(medical_notes, '') <> '' or coalesce(emergency_contact, '') <> '';

alter table public.students drop column medical_notes;
alter table public.students drop column emergency_contact;

alter table public.student_private enable row level security;

-- El staff administra; cada alumna puede ver lo suyo desde el portal.
create policy "staff administra datos sensibles"
  on public.student_private for all
  using (public.app_role() in ('admin', 'recepcion'))
  with check (public.app_role() in ('admin', 'recepcion'));

create policy "alumno lee sus datos sensibles"
  on public.student_private for select
  using (student_id in (select public.my_student_ids()));

-- ── 3. Credenciales de MP: solo el admin las lee desde el cliente ─────────
-- Recepción sigue generando links y sincronizando pagos igual que antes:
-- los endpoints /api/mp/* verifican su rol y leen el token con el service
-- role del servidor, así el token nunca viaja al navegador de recepción.

drop policy "staff lee configuracion" on public.app_settings;

create policy "admin lee configuracion"
  on public.app_settings for select
  using (public.app_role() = 'admin');
