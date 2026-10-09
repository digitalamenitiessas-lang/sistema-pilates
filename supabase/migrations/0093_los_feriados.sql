-- ============================================================
-- 0093 — Los feriados: el estudio cierra un día entero desde Configuración
--
-- EL PEDIDO (el estudio, vía Matías, 08/10)
--
-- "Que en Configuración pueda poner que tal día es feriado, que ese día
-- esté cerrado y no se pueda reservar; y si había una reserva, que se
-- cancele directamente y se le libere ese cupo a la clienta."
--
-- LO QUE YA HABÍA
--
-- Suspender una clase en una fecha (`class_occurrences`, 0018), clase por
-- clase desde la Agenda. Una suspensión ya hace casi todo:
--   · la base no deja confirmar una reserva ese día (enforce_class_capacity);
--   · no se le descuenta la clase a nadie (consumo_contadas, 0076);
--   · a quien estaba anotado le llega "Se suspendió una clase tuya… No se
--     te descuenta la clase", y a la profesora también (avisar_instancia);
--   · la liquidación no la paga (sesiones_dictadas / clases_a_pagar).
-- Lo que no hacía: un día entero de una vez (un lunes son 8 clases), desde
-- Configuración, y cancelar las reservas, que quedaban "confirmadas" en
-- una clase que no se dicta.
--
-- CÓMO QUEDA
--
-- Un feriado es una fila en `feriados` (fecha única + nombre). Cargarlo
-- SUSPENDE cada clase de ese día con el mecanismo de siempre —así todo lo
-- de arriba vale sin reescribirlo— y marca esas suspensiones con
-- `feriado_id`, para que quitar el feriado deshaga sólo lo suyo y no una
-- suspensión que el estudio hizo a mano ni un reemplazo de profesora.
-- Después CANCELA las reservas de ese día: primero la lista de espera y
-- recién después las confirmadas, así nadie recibe "se liberó un lugar"
-- de una clase que no se dicta. Como la fecha ya está suspendida,
-- consumir_clase sella esas cancelaciones sin plazo (cancel_kind nulo):
-- no se cuentan ni gastan una devolución. La clase vuelve al plan.
--
-- Una clase que se crea o se mueve DESPUÉS de cargar el feriado también
-- queda suspendida: un trigger en `class_sessions` vuelve a aplicar los
-- feriados que vienen.
--
-- Quitar un feriado devuelve las clases de ese día a la grilla. Las
-- reservas canceladas NO vuelven solas (a esa altura la clienta pudo usar
-- la clase en otro día): hay que reservarlas de nuevo. La pantalla lo dice.
--
-- POR QUÉ SÓLO DE HOY EN ADELANTE, Y HOY SÓLO LO QUE NO EMPEZÓ
--
-- Suspender una clase que ya se dio devuelve la clase a quien asistió y
-- se la saca a la profesora de la liquidación. Un feriado se carga antes;
-- si se carga el mismo día, toca sólo las clases que todavía no empezaron.
-- Lo mismo al quitarlo. Los feriados pasados quedan como registro.
--
-- LA LISTA DE ESPERA EN UNA FECHA SUSPENDIDA
--
-- `enforce_class_capacity` frenaba sólo 'confirmada': anotarse en la lista
-- de espera de una clase suspendida pasaba. La pantalla no lo ofrece, pero
-- la base es la autoridad, y "que no se pueda reservar ese día" incluye la
-- lista. Se reemplaza con esa sola diferencia (más el motivo en el
-- mensaje), con la guardia de huella de siempre.
--
-- QUIÉN
--
-- Cargar y quitar feriados pide `config.editar`, que rige desde la 0087 y
-- hoy es sólo del admin: es Configuración. Las funciones son security
-- definer porque tocan reservas de otras personas; el permiso se exige
-- adentro. Leer la lista lo puede cualquiera con sesión (son fechas).
--
-- Ejecutar completo en el SQL Editor. Antes, el PREVUELO (sólo lee).
-- ============================================================

-- El resumen se lee después del commit, en el último select.
create temp table if not exists resumen_0093 (orden int, que text, como_quedo text);
truncate pg_temp.resumen_0093;

begin;

set local lock_timeout = '5s';

-- ------------------------------------------------------------
-- 0. Guardias
--
-- La 0093 reemplaza enforce_class_capacity y se apoya en lo que hacen
-- otras cuatro: si alguna no es la del repo, lo que acá se da por hecho
-- (que la suspensión no descuenta, que el aviso sale al suspender, que
-- cancelar la confirmada avisa a la lista) puede no ser cierto. Se compara
-- el cuerpo entero por su huella, como desde la 0084.
-- ------------------------------------------------------------

create temp table huellas_0093 (firma text primary key, esperada text, despues text, se_reemplaza boolean)
  on commit drop;

insert into huellas_0093 values
  ('public.enforce_class_capacity()',     'd40f041dc8379da48a134306d97f02c3', '10ff77305cfed34834364e1bc402d4b0', true),
  ('public.consumir_clase()',             '4c7bb0cbe570fdfaa6ab91e8b903f683', null, false),
  ('public.avisar_instancia()',           'bd70da120ed54ae2eb2f335a26077a25', null, false),
  ('public.avisar_reserva()',             '55805ab5799a46909953d4bc9095ba9a', null, false),
  ('public.inicio_de_clase(uuid, date)',  'a3bd229615ac883243e0f57dece5c78c', null, false);

do $$
declare
  h record;
  v_actual text;
begin
  if to_regclass('public.class_occurrences') is null then
    raise exception 'Falta public.class_occurrences. Revisar si corrió la 0018. No se tocó nada.';
  end if;
  if not exists (select 1 from public.permission_keys where clave = 'config.editar') then
    raise exception 'Falta la clave config.editar. Revisar si corrieron la 0012 y la 0087. No se tocó nada.';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'class_occurrences'
                and column_name = 'feriado_id')
     and to_regclass('public.feriados') is null then
    raise exception 'class_occurrences ya tiene feriado_id pero no existe la tabla feriados: hay restos de algo a medias. No se tocó nada. Mandá el resultado de: select * from information_schema.columns where table_name = ''class_occurrences'';';
  end if;

  for h in select * from pg_temp.huellas_0093 loop
    select md5(btrim(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
      into v_actual
      from pg_proc p where p.oid = to_regprocedure(h.firma);
    if v_actual is null then
      raise exception '% no existe. No se tocó nada.', h.firma;
    end if;
    -- La reemplazada puede ser ya la de la 0093 si esto se corre dos veces;
    -- cualquier otra versión corta.
    if v_actual <> h.esperada and v_actual is distinct from h.despues then
      raise exception
        '% no es la versión del repo (su huella es %): la cambió otra migración o se tocó a mano, y la 0093 se apoya en lo que hace. No se tocó nada. Mandá el resultado de esta consulta, que sólo lee: select pg_get_functiondef(''%''::regprocedure);',
        h.firma, v_actual, h.firma;
    end if;
  end loop;
end
$$;

-- ------------------------------------------------------------
-- 1. La tabla y la marca en la suspensión
-- ------------------------------------------------------------

create table if not exists public.feriados (
  id uuid primary key default gen_random_uuid(),
  fecha date not null unique,
  -- Lo lee la clienta en el aviso y en el portal: "No se dicta … : <nombre>."
  nombre text not null default '' check (length(nombre) <= 80),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

comment on table public.feriados is
  'Días en que el estudio cierra (0093). Cargar uno suspende todas las clases de esa fecha y cancela sus reservas; se administra desde Configuración con cargar_feriados y quitar_feriado.';

-- De quién es cada suspensión: la del feriado se deshace al quitarlo, la
-- que el estudio hizo a mano no. `set null` y no cascade: si se borrara un
-- feriado por fuera de quitar_feriado, sus suspensiones quedan como
-- manuales en vez de desaparecer y volver a cobrar clases.
alter table public.class_occurrences
  add column if not exists feriado_id uuid references public.feriados (id) on delete set null;

create index if not exists class_occurrences_feriado_idx
  on public.class_occurrences (feriado_id) where feriado_id is not null;

alter table public.feriados enable row level security;

drop policy if exists "feriados: lectura con sesión" on public.feriados;
create policy "feriados: lectura con sesión" on public.feriados
  for select to authenticated using (true);

-- Toda tabla nueva en public nace escribible para anon y authenticated.
-- Sin políticas de escritura la RLS ya lo frena, pero se cierra igual: lo
-- único que escribe es cargar_feriados / quitar_feriado.
revoke all on public.feriados from public, anon, authenticated;
grant select on public.feriados to authenticated;

-- ------------------------------------------------------------
-- 2. Las piezas internas
--
-- Ninguna se llama desde el navegador: las dos de abajo (punto 3) exigen
-- el permiso y las usan.
-- ------------------------------------------------------------

-- Las clases que se dictan esa fecha: el mismo criterio que
-- sesiones_dictadas (0073) —las regulares por día de la semana, las
-- especiales por su fecha—, más cualquier clase que tenga reservas vivas
-- ese día aunque ya no esté en la grilla, para no dejar a nadie anotado
-- en un día cerrado.
create or replace function public.clases_del_dia(p_fecha date)
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select cs.id
    from public.class_sessions cs
   where cs.active
     and ((cs.kind = 'regular' and cs.day_of_week = extract(isodow from p_fecha)::int - 1)
       or (cs.kind = 'especial' and cs.date = p_fecha))
  union
  select r.class_id
    from public.reservations r
   where r.date = p_fecha
     and r.status in ('confirmada', 'lista de espera', 'ofrecida');
$$;

revoke all on function public.clases_del_dia(date) from public, anon, authenticated;

-- Cierra UNA clase en la fecha del feriado: la suspende (si no estaba
-- suspendida a mano) y cancela sus reservas. Devuelve si la suspendió y
-- cuántas reservas canceló. No toca una clase que ya empezó.
create or replace function public.feriado_cerrar_clase(p_feriado uuid, p_clase uuid)
returns table (suspendida boolean, canceladas int)
language plpgsql security definer set search_path = ''
as $$
declare
  v_f      public.feriados;
  v_motivo text;
  v_n      int;
  v_susp   boolean := false;
  v_canc   int := 0;
begin
  select * into v_f from public.feriados where id = p_feriado;
  if not found or public.inicio_de_clase(p_clase, v_f.fecha) <= now() then
    return query select false, 0;
    return;
  end if;
  v_motivo := coalesce(nullif(v_f.nombre, ''), 'Feriado');

  -- Una suspensión a mano se respeta (su motivo y su dueño). Un reemplazo
  -- de profesora sin suspender pasa a suspendida y queda del feriado: al
  -- quitarlo vuelve a 'normal' con su reemplazo intacto.
  insert into public.class_occurrences as o (class_id, date, status, reason, feriado_id)
  values (p_clase, v_f.fecha, 'suspendida', v_motivo, v_f.id)
  on conflict (class_id, date) do update
     set status = 'suspendida', reason = excluded.reason, feriado_id = excluded.feriado_id
   where o.status <> 'suspendida'
      or o.feriado_id = excluded.feriado_id;
  get diagnostics v_n = row_count;
  v_susp := v_n > 0;

  -- El orden importa: cancelar una confirmada le avisa "se liberó un
  -- lugar" a toda la lista de espera (avisar_reserva). Vaciando antes la
  -- lista, ese aviso no sale. El aviso que sí corresponde —"se suspendió
  -- una clase tuya"— ya salió con el insert de arriba, mientras las
  -- reservas todavía estaban vivas.
  update public.reservations
     set status = 'cancelada'
   where class_id = p_clase and date = v_f.fecha
     and status in ('lista de espera', 'ofrecida');
  get diagnostics v_n = row_count;
  v_canc := v_n;

  update public.reservations
     set status = 'cancelada'
   where class_id = p_clase and date = v_f.fecha
     and status = 'confirmada';
  get diagnostics v_n = row_count;
  v_canc := v_canc + v_n;

  return query select v_susp, v_canc;
end;
$$;

revoke all on function public.feriado_cerrar_clase(uuid, uuid) from public, anon, authenticated;

-- Deshace la suspensión que el feriado puso en UNA clase. Si la fila
-- tenía además un reemplazo, un horario o un cupo del día, vuelve a
-- 'normal' y los conserva; si no, se borra (sin fila = la clase de
-- siempre, 0018). No toca una clase que ya empezó: esa no se dio.
create or replace function public.feriado_abrir_clase(p_feriado uuid, p_clase uuid, p_fecha date)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_o public.class_occurrences;
begin
  select * into v_o from public.class_occurrences
   where class_id = p_clase and date = p_fecha and feriado_id = p_feriado;
  if not found or public.inicio_de_clase(p_clase, p_fecha) <= now() then
    return false;
  end if;

  if v_o.teacher_id is null and v_o.start_time is null and v_o.capacity is null then
    delete from public.class_occurrences where id = v_o.id;
  else
    update public.class_occurrences
       set status = 'normal', reason = '', feriado_id = null
     where id = v_o.id;
  end if;
  return true;
end;
$$;

revoke all on function public.feriado_abrir_clase(uuid, uuid, date) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3. Lo que llama la pantalla
-- ------------------------------------------------------------

-- Carga un día o un rango (vacaciones). Si la fecha ya era feriado, le
-- cambia el nombre y vuelve a cerrar lo que falte. Devuelve, por fecha,
-- cuántas clases suspendió y cuántas reservas canceló.
create or replace function public.cargar_feriados(p_desde date, p_hasta date default null, p_nombre text default '')
returns table (fecha date, clases int, reservas int, ya_estaba boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  v_hoy    date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_hasta  date := coalesce(p_hasta, p_desde);
  v_nombre text := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
  v_dia    date;
  v_id     uuid;
  v_ya     boolean;
  v_clase  uuid;
  v_r      record;
  v_cl     int;
  v_res    int;
begin
  if not public.can('config.editar') then
    raise exception 'No tenés permiso para cargar feriados: se cargan desde Configuración, con una cuenta de administración.';
  end if;
  if p_desde is null then
    raise exception 'Falta la fecha del feriado.';
  end if;
  if v_hasta < p_desde then
    raise exception 'La fecha "hasta" es anterior a la de inicio.';
  end if;
  if p_desde < v_hoy then
    raise exception 'El % ya pasó: los feriados se cargan de hoy en adelante.', to_char(p_desde, 'DD/MM/YYYY');
  end if;
  if v_hasta - p_desde > 61 then
    raise exception 'Son % días: se cargan hasta 62 de una vez. Para un cierre más largo, cargalo en partes.', v_hasta - p_desde + 1;
  end if;
  if v_hasta > v_hoy + 730 then
    raise exception 'Los feriados se cargan hasta dos años para adelante.';
  end if;
  if length(v_nombre) > 80 then
    raise exception 'El nombre es demasiado largo (hasta 80 letras).';
  end if;

  v_dia := p_desde;
  while v_dia <= v_hasta loop
    select f.id into v_id from public.feriados f where f.fecha = v_dia;
    v_ya := found;
    if v_ya then
      update public.feriados f set nombre = v_nombre where f.id = v_id;
      -- El motivo que lee la clienta acompaña al nombre nuevo.
      update public.class_occurrences o
         set reason = coalesce(nullif(v_nombre, ''), 'Feriado')
       where o.feriado_id = v_id and o.status = 'suspendida';
    else
      insert into public.feriados (fecha, nombre) values (v_dia, v_nombre) returning id into v_id;
    end if;

    v_cl := 0;
    v_res := 0;
    for v_clase in select * from public.clases_del_dia(v_dia) loop
      select * into v_r from public.feriado_cerrar_clase(v_id, v_clase);
      v_cl := v_cl + case when v_r.suspendida then 1 else 0 end;
      v_res := v_res + v_r.canceladas;
    end loop;

    fecha := v_dia;
    clases := v_cl;
    reservas := v_res;
    ya_estaba := v_ya;
    return next;

    v_dia := v_dia + 1;
  end loop;
end;
$$;

revoke all on function public.cargar_feriados(date, date, text) from public, anon;
grant execute on function public.cargar_feriados(date, date, text) to authenticated;

-- Quita un feriado: las clases de ese día vuelven a la grilla. Las
-- reservas canceladas quedan canceladas (no se descuentan: se cancelaron
-- con la fecha suspendida). Devuelve cuántas clases reabrió.
create or replace function public.quitar_feriado(p_fecha date)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_f   public.feriados;
  v_o   record;
  v_n   int := 0;
begin
  if not public.can('config.editar') then
    raise exception 'No tenés permiso para quitar feriados: se administran desde Configuración, con una cuenta de administración.';
  end if;
  select * into v_f from public.feriados where fecha = p_fecha;
  if not found then
    raise exception 'El % no está cargado como feriado.', to_char(p_fecha, 'DD/MM/YYYY');
  end if;
  if p_fecha < v_hoy then
    raise exception 'Ese feriado ya pasó: queda como registro.';
  end if;

  for v_o in select o.class_id, o.date from public.class_occurrences o where o.feriado_id = v_f.id loop
    if public.feriado_abrir_clase(v_f.id, v_o.class_id, v_o.date) then
      v_n := v_n + 1;
    end if;
  end loop;

  -- Si era hoy y alguna clase ya había empezado, su suspensión queda
  -- (on delete set null): esa clase no se dio.
  delete from public.feriados where id = v_f.id;
  return v_n;
end;
$$;

revoke all on function public.quitar_feriado(date) from public, anon;
grant execute on function public.quitar_feriado(date) to authenticated;

-- ------------------------------------------------------------
-- 4. La clase nueva o movida después del feriado
--
-- Sin esto, una clase creada el martes para los lunes se podría reservar
-- el lunes feriado, y una clase que se pasa de lunes a martes dejaría
-- suspendido un lunes que ya no da. Corre en cada alta y en cada cambio
-- de día, tipo, fecha o actividad, contra los feriados que vienen.
-- ------------------------------------------------------------

create or replace function public.feriados_de_la_clase()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_hoy  date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_f    record;
  v_dict boolean;
begin
  -- Sólo si cambió algo que mueve la clase de día. La pantalla manda la
  -- fila entera al editar (el título, la sala), y sin esto cambiar la sala
  -- de una clase que el estudio reabrió a mano en un feriado ("Volver a
  -- dictarla") la volvería a cerrar y le cancelaría las reservas nuevas.
  if tg_op = 'UPDATE'
     and old.active = new.active
     and old.day_of_week = new.day_of_week
     and old.kind = new.kind
     and old.date is not distinct from new.date then
    return null;
  end if;

  for v_f in select f.id, f.fecha from public.feriados f where f.fecha >= v_hoy loop
    v_dict := new.active
              and ((new.kind = 'regular' and new.day_of_week = extract(isodow from v_f.fecha)::int - 1)
                or (new.kind = 'especial' and new.date = v_f.fecha));
    if v_dict then
      perform public.feriado_cerrar_clase(v_f.id, new.id);
    else
      perform public.feriado_abrir_clase(v_f.id, new.id, v_f.fecha);
    end if;
  end loop;
  return null;
end;
$$;

revoke all on function public.feriados_de_la_clase() from public, anon, authenticated;

drop trigger if exists class_sessions_feriados on public.class_sessions;
create trigger class_sessions_feriados
  after insert or update of active, day_of_week, kind, date on public.class_sessions
  for each row execute function public.feriados_de_la_clase();

-- ------------------------------------------------------------
-- 5. La lista de espera tampoco, en una fecha suspendida
--
-- La de la 0018 con dos cambios, marcados: anotarse en la lista de
-- espera de una clase suspendida también corta, y el mensaje dice el
-- motivo ("Esa clase está suspendida ese día: Feriado"). La reserva que
-- YA estaba en la lista y se toca por otra cosa no se frena: la bandera
-- mira sólo la entrada a la lista.
-- ------------------------------------------------------------

create or replace function public.enforce_class_capacity()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  cap int;
  taken int;
  occ record;
  v_entra_a_espera boolean := false;   -- 0093
begin
  -- 0093: bandera y no un `and` con OLD, que en un INSERT no existe
  -- (el precedente de la 0022 y la 0038).
  if new.status = 'lista de espera' then
    if tg_op = 'INSERT' then
      v_entra_a_espera := true;
    elsif old.status is distinct from 'lista de espera' then
      v_entra_a_espera := true;
    end if;
  end if;

  if v_entra_a_espera then
    select * into occ
    from public.class_occurrences
    where class_id = new.class_id and date = new.date;

    if occ.status = 'suspendida' then
      raise exception 'Esa clase está suspendida ese día%',
        coalesce(': ' || nullif(btrim(occ.reason), ''), '');
    end if;
  end if;

  if new.status = 'confirmada' then
    select * into occ
    from public.class_occurrences
    where class_id = new.class_id and date = new.date;

    if occ.status = 'suspendida' then
      raise exception 'Esa clase está suspendida ese día%',
        coalesce(': ' || nullif(btrim(occ.reason), ''), '');   -- 0093: el motivo
    end if;

    select capacity into cap from public.class_sessions where id = new.class_id;
    cap := coalesce(occ.capacity, cap);

    select count(*) into taken
    from public.reservations
    where class_id = new.class_id
      and date = new.date
      and status in ('confirmada', 'asistió')
      and id is distinct from new.id;

    if taken >= cap then
      raise exception 'La clase ya está completa';
    end if;
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 6. Comprobaciones antes del commit
-- ------------------------------------------------------------

do $$
begin
  if exists (select 1 from information_schema.role_table_grants
              where table_schema = 'public' and table_name = 'feriados'
                and (grantee in ('anon', 'PUBLIC')
                     or (grantee = 'authenticated' and privilege_type <> 'SELECT'))) then
    raise exception 'La tabla feriados quedó abierta de más.';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.feriados'::regclass) then
    raise exception 'La tabla feriados quedó sin RLS.';
  end if;
  if has_function_privilege('anon', 'public.cargar_feriados(date, date, text)', 'execute')
     or has_function_privilege('anon', 'public.quitar_feriado(date)', 'execute')
     or has_function_privilege('authenticated', 'public.feriado_cerrar_clase(uuid, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.feriado_abrir_clase(uuid, uuid, date)', 'execute')
     or has_function_privilege('authenticated', 'public.clases_del_dia(date)', 'execute') then
    raise exception 'Alguna función de feriados quedó abierta de más.';
  end if;
  if (select count(*) from public.perm_diff()) <> 0 then
    raise exception 'perm_diff no da cero: algo cambió un permiso. No se tocó nada.';
  end if;
end
$$;

insert into pg_temp.resumen_0093 values
  (1, 'tabla feriados', (select count(*)::text || ' feriados cargados' from public.feriados)),
  (2, 'funciones', 'cargar_feriados y quitar_feriado (piden config.editar)'),
  (3, 'clase nueva o movida', 'trigger class_sessions_feriados'),
  (4, 'lista de espera en fecha suspendida', 'ahora también corta'),
  (5, 'perm_diff', (select count(*)::text || ' (tiene que ser 0)' from public.perm_diff()));

commit;

select que, como_quedo from resumen_0093 order by orden;

-- ------------------------------------------------------------
-- CÓMO VERIFICAR
-- ------------------------------------------------------------
--
-- En pantalla, con el admin: Configuración → Feriados. Cargar uno de
-- prueba en una fecha SIN reservas (por ejemplo un domingo sin clases):
-- tiene que decir "0 clases" y aparecer en la lista; quitarlo.
--
-- Con datos (sólo lee):
--   select f.fecha, f.nombre,
--          (select count(*) from public.class_occurrences o where o.feriado_id = f.id) as clases_suspendidas,
--          (select count(*) from public.reservations r where r.date = f.fecha
--             and r.status in ('confirmada', 'lista de espera')) as reservas_vivas   -- tiene que dar 0
--     from public.feriados f order by f.fecha;
--
-- ------------------------------------------------------------
-- VUELTA ATRÁS (no toca políticas de otras tablas)
-- ------------------------------------------------------------
--
-- Primero quitar los feriados que vienen desde la pantalla (así las
-- clases vuelven a la grilla). Después:
--
--   begin;
--   drop trigger if exists class_sessions_feriados on public.class_sessions;
--   drop function if exists public.feriados_de_la_clase();
--   drop function if exists public.cargar_feriados(date, date, text);
--   drop function if exists public.quitar_feriado(date);
--   drop function if exists public.feriado_cerrar_clase(uuid, uuid);
--   drop function if exists public.feriado_abrir_clase(uuid, uuid, date);
--   drop function if exists public.clases_del_dia(date);
--   alter table public.class_occurrences drop column if exists feriado_id;
--   drop table if exists public.feriados;
--   -- y enforce_class_capacity vuelve a la de la 0018 (pegar su bloque).
--   commit;
