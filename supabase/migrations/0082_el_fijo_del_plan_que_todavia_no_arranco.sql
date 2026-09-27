-- ============================================================
-- 0082 — El turno fijo del plan que todavía no arrancó
--
-- La tanda de la apertura: el estudio abre el martes 29/09 y desde el 22
-- viene dando de alta a las clientas con planes que arrancan ese día. Una
-- de ellas entra al portal el domingo, reserva su primera clase del 29 y
-- el portal no le ofrece hacerla fija. Y si se lo ofreciera, la base se
-- lo rechazaría: la 0077 pide una membresía que cubra HOY, y la suya
-- cubre desde pasado mañana.
--
-- Es la misma trampa que el 22/09 se sacó de la reserva común: la regla
-- se escribió contra "la membresía de hoy", cuando lo que importa es la
-- membresía que va a pagar esas clases. Quien pagó por adelantado no
-- tiene menos derecho a elegir su horario que quien ya está yendo; tiene
-- más, porque es la que llega primero.
--
-- DOS FUNCIONES QUE CAMBIAN, Y NINGUNA OTRA MIGRACIÓN LAS TOCÓ DESPUÉS
--
--   · `turno_fijo_propio` (0077): pide un plan vigente O POR EMPEZAR.
--   · `guard_turnos_del_plan` (0078): el tope sale del plan que le va a
--     pagar las semanas del horario, y no sólo del que corre hoy. Sin
--     membresía de hoy no había tope que leer, así que a una clienta con
--     un plan del 29 el mostrador le podía dar un fijo por día de la
--     semana, y en cuanto la 0077 la dejara, ella también. Y de paso
--     rechaza un fijo sobre un taller, que hasta acá la base le negaba a
--     la clienta (0077) pero no al mostrador.
--
-- Van juntas a propósito: abrir la primera sin la segunda le daría a la
-- tanda de la apertura el único camino sin tope de todo el sistema.
--
-- Y DOS QUE SE AGREGAN
--
--   · `plan_de_los_fijos(uuid)`: qué plan pone el tope. Interna: la usa
--     el trigger y nadie más la puede llamar.
--   · `mi_tope_de_fijos()`: el mismo número, para el portal. Con esto el
--     portal deja de calcular el tope por su cuenta —era una copia del
--     orden de acá, en otro idioma— y además sabe que esta migración
--     corrió: si la función no existe, no le ofrece el fijo a quien tiene
--     un plan por empezar, porque la 0077 se lo rechazaría siempre. Es la
--     regla de la casa de que sin la migración todo siga andando igual, y
--     un cambio de cuerpo de función no se ve desde afuera de otra forma.
--
-- LO QUE SIGUE SIN HACER LA BASE, IGUAL QUE EN LA 0077
--
-- No crea las reservas. Las siguen creando el portal y la Agenda, de a
-- una, por el mismo insert que usa la reserva a mano: cada fecha pasa
-- por `consumir_clase`, `enforce_class_capacity` y `reserva_en_hora`, y
-- una que no entra no arrastra a las demás. Lo que cambió del lado de la
-- pantalla (T27) es DE QUÉ PERÍODO salen esas fechas: del plan que va a
-- pagar las semanas de ese horario —el mismo orden que el tope, abajo—,
-- desde la fecha que eligió hasta que vence. Nunca del siguiente que
-- tenga encolado, que es lo que haría usar `prioridad_hasta`: ése se
-- completa aparte, cuando le toca.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- REQUIERE la 0077 y la 0078.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 0. Que no pase en silencio
--
-- `create or replace` sobre una función que no existe no falla: la crea.
-- Si la 0077 o la 0078 no hubieran corrido, esto dejaría una de las dos
-- funciones sin el trigger que la llama, y la migración parecería haber
-- andado. Mejor que se corte acá, antes de escribir nada.
-- ------------------------------------------------------------

do $guarda$
begin
  if to_regprocedure('public.turno_fijo_propio(uuid)') is null then
    raise exception 'Falta public.turno_fijo_propio(uuid). Revisar si corrió la 0077.';
  end if;

  if to_regprocedure('public.guard_turnos_del_plan()') is null then
    raise exception 'Falta public.guard_turnos_del_plan(). Revisar si corrió la 0078.';
  end if;

  if to_regclass('public.fixed_slots') is null then
    raise exception 'Falta la tabla public.fixed_slots. Revisar si corrió la 0048.';
  end if;

  if not exists (
    select 1 from pg_trigger t
    where t.tgname = 'fixed_slots_tope_plan'
      and t.tgrelid = 'public.fixed_slots'::regclass
  ) then
    raise exception 'Falta el trigger fixed_slots_tope_plan. Revisar si corrió la 0078.';
  end if;

  if not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'plans'
      and c.column_name = 'weekly_frequency'
  ) then
    raise exception 'Falta plans.weekly_frequency. Revisar si corrió la 0025.';
  end if;

  if not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'class_sessions'
      and c.column_name = 'kind'
  ) then
    raise exception 'Falta class_sessions.kind. Revisar si corrió la 0017.';
  end if;

  if to_regprocedure('public.my_student_ids()') is null then
    raise exception 'Falta public.my_student_ids(). Revisar si corrió la 0005.';
  end if;
end
$guarda$;

-- ------------------------------------------------------------
-- 1. Tomar el turno con un plan que arranca más adelante
--
-- El cuerpo es el de la 0077 con una sola condición cambiada: la
-- membresía tiene que estar activa y no haber vencido, en vez de cubrir
-- hoy. Lo demás va igual y con los mismos textos, que son los que ella
-- ya conoce.
-- ------------------------------------------------------------

create or replace function public.turno_fijo_propio(p_class uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_alumna uuid;
  v_kind   text;
  v_activa boolean;
  v_titulo text;
  v_id     uuid;
  v_hoy    date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  -- Su propia ficha, y sólo esa. `my_student_ids()` es el aislamiento de
  -- la clienta y no es configurable (0005): acá se apoya en él en vez de
  -- recibir un student_id, que sería pedirle al navegador que diga quién
  -- es.
  select s.id into v_alumna
  from public.students s
  where s.id in (select public.my_student_ids())
  limit 1;

  if v_alumna is null then
    raise exception 'Tu cuenta no está vinculada a una ficha de cliente.';
  end if;

  select cs.kind, cs.active, cs.title into v_kind, v_activa, v_titulo
  from public.class_sessions cs where cs.id = p_class;

  if v_kind is null then
    raise exception 'Esa clase no existe.';
  end if;
  if not v_activa then
    raise exception 'Esa clase ya no se dicta.';
  end if;
  -- Un taller tiene fecha propia (0040), así que no se repite y no puede
  -- ser el horario de todas las semanas.
  if v_kind <> 'regular' then
    raise exception 'Ese es un taller con fecha propia, no un horario que se repita todas las semanas.';
  end if;

  -- Vigente o por empezar. `end_date >= hoy` y no `hoy between inicio y
  -- fin`: el plan que arranca el 29 es el que le va a pagar las clases de
  -- ese horario, y la prioridad de la 0048 ya se mide contra su
  -- vencimiento — `prioridad_hasta` toma el máximo `end_date` sin mirar
  -- el inicio. O sea que el turno que se da hoy ya nace con prioridad, y
  -- la liberación automática de la 0049 no lo toca.
  --
  -- Suspendida y cancelada siguen afuera por el `status = 'activa'`: ésas
  -- no pagan ninguna clase, ni hoy ni después.
  if not exists (
    select 1 from public.memberships m
    where m.student_id = v_alumna
      and m.status = 'activa'
      and m.end_date >= v_hoy
  ) then
    raise exception 'Necesitás un plan vigente o por empezar para tomar un horario fijo.';
  end if;

  -- El índice parcial de la 0048 ya lo impide, pero su error habla de un
  -- índice y esto lo lee ella.
  if exists (
    select 1 from public.fixed_slots f
    where f.student_id = v_alumna and f.class_id = p_class and f.estado <> 'liberado'
  ) then
    raise exception 'Ese horario ya es tu turno fijo.';
  end if;

  -- El cupo de turnos fijos lo cuida `guard_cupo_fijo` (0048) y cuántos
  -- le tocan `guard_turnos_del_plan` (abajo), cada uno con su mensaje.
  insert into public.fixed_slots (student_id, class_id, motivo)
  values (v_alumna, p_class, 'Lo eligió desde el portal')
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.turno_fijo_propio(uuid) from public, anon;
grant execute on function public.turno_fijo_propio(uuid) to authenticated;

-- ------------------------------------------------------------
-- 2. Qué plan pone el tope
--
-- La 0078 leía el plan que corre hoy y, entre varios, el que más lejos
-- llega. Eso sigue siendo lo primero. Lo que se agrega son dos casos que
-- la apertura hace comunes:
--
--   · NINGUNO CORRE HOY, PERO HAY UNO POR EMPEZAR. Se toma el próximo en
--     arrancar: es el que le va a pagar las semanas que vienen. Antes
--     esto daba "sin membresía, sin tope".
--
--   · EL QUE CORRE HOY ES UN PASE DE PRUEBA. FE FIRST dice 1 vez por
--     semana porque es una clase, no porque la clienta vaya a venir una
--     vez: la que usó su clase gratis el sábado y arranca FE FLOW el
--     martes tenía, hasta el martes, un tope de 1 horario. Por eso el
--     pase va último, aunque cubra hoy. Si no tiene otra cosa, rige el
--     pase, igual que antes. El discriminador es `is_trial` y no la
--     duración, el mismo criterio de la 0037.
--
-- En una función aparte y no adentro del trigger para que el portal lea
-- el mismo número (abajo) sin tener que copiar este orden. Del lado de
-- la pantalla queda `periodoDelTurno` (lib/api.ts), que usa el mismo
-- orden para otra cosa —de qué período salen las fechas que se le
-- proponen— y que conviene que siga coincidiendo.
--
-- Interna: sin grant. Recibe cualquier ficha y contesta con el id de una
-- membresía ajena, así que sólo la llaman el trigger y la de abajo, que
-- corren como dueñas.
-- ------------------------------------------------------------

create or replace function public.plan_de_los_fijos(p_student uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select m.id
  from public.memberships m
  join public.plans p on p.id = m.plan_id
  where m.student_id = p_student
    and m.status = 'activa'
    and m.end_date >= (now() at time zone 'America/Argentina/Buenos_Aires')::date
  order by
    p.is_trial,                                        -- el pase, último
    -- la que corre hoy, primero; entre ésas, la que más lejos llega
    (m.start_date <= (now() at time zone 'America/Argentina/Buenos_Aires')::date) desc,
    case when m.start_date <= (now() at time zone 'America/Argentina/Buenos_Aires')::date
         then m.end_date end desc nulls last,
    m.start_date                                       -- si no, la próxima en arrancar
  limit 1
$$;

revoke all on function public.plan_de_los_fijos(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3. El tope, y el taller
--
-- Sin membresía activa y no vencida sigue sin haber tope, a propósito y
-- por lo mismo que en la 0078: el mostrador puede guardarle el horario a
-- alguien que todavía no tiene plan, y sin plan no hay número que leer.
--
-- El taller va acá porque es el trigger que esta migración ya reescribe
-- y el que contesta "qué horarios puede tener": un taller tiene fecha
-- propia (0017) y no se repite, así que no es un horario. La 0077 se lo
-- rechazaba a la clienta; al mostrador, que escribe `fixed_slots` directo,
-- sólo lo frenaba la pantalla. Con el mismo texto que la 0077.
--
-- Las dos reglas miran sólo lo que queda 'activo'. Pausar y liberar un
-- turno que ya exista sobre un taller siguen andando: la regla cierra la
-- entrada, no la salida.
-- ------------------------------------------------------------

create or replace function public.guard_turnos_del_plan()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_tope    int;
  v_plan    text;
  v_tiene   int;
  v_kind    text;
  v_mem     uuid;
begin
  if new.estado <> 'activo' then return new; end if;

  select cs.kind into v_kind from public.class_sessions cs where cs.id = new.class_id;
  if v_kind <> 'regular' then
    raise exception 'Ese es un taller con fecha propia, no un horario que se repita todas las semanas.';
  end if;

  -- En una variable y no en el where: así se evalúa una vez y no una por
  -- cada membresía que recorra la consulta.
  v_mem := public.plan_de_los_fijos(new.student_id);

  select p.weekly_frequency, p.name into v_tope, v_plan
  from public.memberships m
  join public.plans p on p.id = m.plan_id
  where m.id = v_mem;

  -- Sin membresía, o con un plan que no declara frecuencia: no hay tope
  -- que hacer cumplir.
  if v_tope is null or v_tope <= 0 then return new; end if;

  select count(*) into v_tiene
  from public.fixed_slots f
  where f.student_id = new.student_id
    and f.estado <> 'liberado'
    and f.id <> new.id;

  if v_tiene >= v_tope then
    raise exception
      'Tu plan % es de % % por semana y ya tenés % horario% fijo%. Dejá uno si querés cambiarlo.',
      v_plan, v_tope,
      case when v_tope = 1 then 'vez' else 'veces' end,
      v_tiene,
      case when v_tiene = 1 then '' else 's' end,
      case when v_tiene = 1 then '' else 's' end;
  end if;

  return new;
end;
$$;

-- El trigger no se toca: sigue siendo `fixed_slots_tope_plan` (0078), con
-- el mismo nombre —que decide que corra después del de cupo— y el mismo
-- momento. Cambia sólo el cuerpo de la función que llama.

-- ------------------------------------------------------------
-- 4. El tope, para el portal
--
-- Su propia ficha y sólo esa, por `my_student_ids()` como la 0077: no
-- recibe un student_id, que sería pedirle al navegador que diga quién es.
-- Null es "sin tope": sin plan, o un plan con frecuencia 0.
-- ------------------------------------------------------------

create or replace function public.mi_tope_de_fijos()
returns int
language sql stable security definer set search_path = ''
as $$
  select nullif(p.weekly_frequency, 0)
  from public.memberships m
  join public.plans p on p.id = m.plan_id
  where m.id = (
    select public.plan_de_los_fijos(s.id)
    from public.students s
    where s.id in (select public.my_student_ids())
    limit 1
  )
$$;

revoke all on function public.mi_tope_de_fijos() from public, anon;
grant execute on function public.mi_tope_de_fijos() to authenticated;

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
-- Desde el SQL Editor `turno_fijo_propio` y `mi_tope_de_fijos` no sirven:
-- no hay sesión, así que `my_student_ids()` viene vacío. Lo que se puede
-- mirar desde acá:
--
--   a. Que las cuatro funciones estén, y quién puede llamar a cuál:
--
--      select p.proname, p.proacl
--        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname = 'public'
--         and p.proname in ('turno_fijo_propio', 'guard_turnos_del_plan',
--                           'plan_de_los_fijos', 'mi_tope_de_fijos');
--      -- plan_de_los_fijos sin authenticated; mi_tope_de_fijos con él
--
--   b. Qué plan le pone el tope a cada una, con la función de verdad:
--
--      select s.name, p.name as plan, p.is_trial, m.start_date, m.end_date,
--             p.weekly_frequency as tope,
--             (select count(*) from public.fixed_slots f
--               where f.student_id = s.id and f.estado <> 'liberado') as tiene
--        from public.students s
--        join public.memberships m on m.id = public.plan_de_los_fijos(s.id)
--        join public.plans p on p.id = m.plan_id
--       order by s.name;
--
-- El resto, con la sesión de verdad, está en PLAN.md (T27): la clienta
-- del plan del 29 desde el portal, la del pase más FE FLOW, el mostrador
-- desde la Agenda y el taller.
--
-- Los datos de prueba se revierten: las reservas se cancelan o se
-- borran, y el turno se libera.
--
-- ============================================================
-- PARA VOLVER ATRÁS
--
-- No cambia políticas ni datos: el cuerpo de dos funciones y dos
-- funciones nuevas. Volver atrás es correr de nuevo la 0077 y la 0078
-- enteras —son `create or replace` y `drop trigger if exists`, se pueden
-- repetir sin romper nada, y la 0078 deja un trigger que ya no llama a
-- `plan_de_los_fijos`— y después:
--
--   begin;
--   drop function if exists public.mi_tope_de_fijos();
--   drop function if exists public.plan_de_los_fijos(uuid);
--   commit;
--
-- En ese orden: la primera usa la segunda. Sin `mi_tope_de_fijos` el
-- portal vuelve solo a lo de antes (no le ofrece el fijo a quien tiene un
-- plan por empezar). No se transcriben acá los cuerpos viejos: dejar dos
-- copias de la misma función en el repo es garantizar que una se
-- desactualice.
--
-- Los turnos que se hayan tomado con un plan por empezar quedan: son
-- filas normales de fixed_slots, con el motivo del portal.
-- ============================================================
