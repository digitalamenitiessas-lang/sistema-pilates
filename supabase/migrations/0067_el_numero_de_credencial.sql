-- ============================================================
-- 0067 — Cada clienta con su número de credencial
--
-- Lo pidió el estudio el 17/09: "Cada alumna puede tener un número de
-- credencial? Para poder usar los beneficios e identificarse". De las tres
-- cosas que esa frase podía significar, la que pidieron es la más simple:
-- un número propio, que la clienta ve en su portal y el mostrador ve en
-- Clientes, para identificarla sin pedirle el documento.
--
-- TRES DECISIONES QUE VALE LA PENA DEJAR ESCRITAS
--
-- 1. **No es el DNI.** Hoy mismo saquemos el documento de ser la llave de
--    la cuenta (0057 apagó el auto-registro por mail + DNI, y el acceso
--    nace con cambio obligatorio). Un número que se va a decir en voz alta
--    en el mostrador —y que mañana quizás se muestre en un comercio— es lo
--    más público que va a tener el sistema. Así que es una secuencia
--    propia, que **identifica y no autoriza nada**: igual que el número de
--    comprobante de la caja, que funciona así desde la 0001.
--
-- 2. **La base guarda el número; el formato lo pone el estudio.** En la
--    base es un entero y nada más. Cómo se muestra —"CF-0042",
--    "casalumna42", "Casa Fe 0042"— sale de dos parámetros de
--    Configuración, porque es un texto y los textos no se escriben en el
--    código. Si mañana quieren cambiar el prefijo, no dependen de un
--    deploy, y el número guardado no se toca.
--
-- 3. **No se renumera.** El número se asigna al crear la ficha y después
--    no cambia: una credencial que puede cambiar no sirve para
--    identificar. Las bajas son lógicas en este sistema (`active =
--    false`), así que el número de quien se va queda retirado y no se
--    reutiliza — si volviera, vuelve con el suyo.
--
-- El relleno de ceros es un MÍNIMO, no un techo: con 4 dígitos la clienta
-- 1 es "0001" y la 12.345 es "12345". No hay límite de clientas.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- ── 1. La columna y su secuencia ────────────────────────────────────
alter table public.students
  add column if not exists member_no int;

create sequence if not exists public.member_seq start 1;

-- ── 2. Las que ya están: por antigüedad, la más vieja es la 1 ───────
--
-- El orden importa porque el número va a quedar a la vista y "yo soy más
-- vieja que ella" es una comparación que alguien va a hacer. Se ordena por
-- la fecha de ingreso al estudio (`join_date`), que es el dato del negocio,
-- y se desempata por `created_at` y por id para que el resultado sea el
-- mismo si esta migración se corre dos veces.
with orden as (
  select id,
         row_number() over (
           order by coalesce(join_date, created_at::date), created_at, id
         ) as n
    from public.students
   where member_no is null
)
update public.students s
   set member_no = o.n
  from orden o
 where s.id = o.id;

-- La secuencia arranca después del último asignado. Con `is_called =
-- false`, el próximo `nextval` devuelve exactamente ese número.
select setval(
  'public.member_seq',
  coalesce((select max(member_no) from public.students), 0) + 1,
  false
);

-- ── 3. Único, y asignado solo ───────────────────────────────────────
create unique index if not exists students_member_no_key
  on public.students (member_no);

create or replace function public.assign_member_no()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.member_no is null then
    new.member_no := nextval('public.member_seq');
  end if;
  return new;
end;
$$;

drop trigger if exists students_assign_member_no on public.students;
create trigger students_assign_member_no
  before insert on public.students
  for each row execute function public.assign_member_no();

-- El número no se renumera. En vez de rechazar el update entero, se
-- conserva el que estaba: hoy `updateStudent` manda una lista fija de
-- campos y el número no viaja, pero el día que alguien haga un
-- `select('*')` y lo devuelva completo, un valor viejo o un null no puede
-- romper el guardado de una ficha — y mucho menos cambiarle la credencial
-- a alguien sin que nadie lo pida.
create or replace function public.member_no_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.member_no is distinct from old.member_no then
    new.member_no := old.member_no;
  end if;
  return new;
end;
$$;

drop trigger if exists students_member_no_inmutable on public.students;
create trigger students_member_no_inmutable
  before update on public.students
  for each row execute function public.member_no_inmutable();

-- ── 4. El formato, que lo decide el estudio ─────────────────────────
--
-- Van en `estudio` porque son parte de cómo el estudio se nombra a sí
-- mismo, y no llevan `is_public`: la landing no las necesita y la política
-- de lectura de `studio_settings` ya alcanza a cualquiera con sesión, así
-- que la clienta las lee desde su portal.
insert into public.studio_settings
  (key, value, kind, label, help, group_key, sort_order, is_public)
values
  ('credencial_prefijo', 'CF-', 'text',
   'Prefijo del número de credencial',
   'Lo que va antes del número. Con "CF-" la credencial se ve "CF-0042"; con "casalumna" se ve "casalumna0042". Dejalo vacío para mostrar solo el número.',
   'estudio', 71, false),
  ('credencial_digitos', '4', 'number',
   'Dígitos del número de credencial',
   'Ceros adelante para que todas se vean iguales de largo. Con 4, la clienta 42 es "0042". Es un mínimo: cuando pasen de 9999 el número sigue creciendo solo.',
   'estudio', 72, false)
on conflict (key) do nothing;

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
--   -- 1. Todas tienen número, sin repetidos y sin agujeros:
--   select count(*) as clientas,
--          count(member_no) as con_numero,
--          count(distinct member_no) as distintos,
--          min(member_no), max(member_no)
--     from public.students;
--   -- con_numero tiene que igualar a clientas, y distintos a con_numero.
--
--   -- 2. La más vieja es la 1:
--   select member_no, name, join_date from public.students order by member_no;
--
--   -- 3. La próxima que se cree sigue la serie. Desde la pantalla de
--   --    Clientes, dar de alta una y mirar que le toque max+1.
--
--   -- 4. Que no se pueda renumerar:
--   update public.students set member_no = 999 where member_no = 1;
--   select member_no from public.students where name = '<la que era 1>';
--   -- Tiene que seguir siendo 1. El update no da error: conserva el valor.
--
--   -- 5. Que no se pueda duplicar (esto SÍ tiene que fallar):
--   insert into public.students (name, member_no) values ('choque', 1);
--   -- duplicate key value violates unique constraint
--
-- PARA VOLVER ATRÁS
--
--   drop trigger if exists students_assign_member_no on public.students;
--   drop trigger if exists students_member_no_inmutable on public.students;
--   drop function if exists public.assign_member_no();
--   drop function if exists public.member_no_inmutable();
--   drop index if exists public.students_member_no_key;
--   alter table public.students drop column if exists member_no;
--   drop sequence if exists public.member_seq;
--   delete from public.studio_settings
--    where key in ('credencial_prefijo', 'credencial_digitos');
--
--   Ojo: volver atrás borra los números. Si después se vuelve a aplicar,
--   se reasignan por antigüedad y van a dar los mismos, salvo que en el
--   medio haya entrado o salido alguien.
-- ============================================================
