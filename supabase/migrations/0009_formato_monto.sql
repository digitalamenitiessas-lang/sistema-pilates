-- 0009 — Fix de formato: el monto en la notificación de pago salía con
-- separador de miles inglés ("$12,345" en vez de "$12.345") porque to_char
-- usa el lc_numeric del servidor. Se fuerza el punto como en es-AR.

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
      coalesce(v_student_name, 'Un alumno') || ' pagó $'
        || replace(to_char(new.amount, 'FM999,999,999,999'), ',', '.')
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
