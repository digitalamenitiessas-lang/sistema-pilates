-- ============================================================
-- 0036 — La vigencia de un mes, y el pago anticipado que se encola
--
-- El estudio lo escribió con un ejemplo, y conviene copiarlo textual
-- porque cada línea es una regla:
--
--   "La clienta paga e inicia su membresía el 20 de septiembre. Puede
--    utilizarla hasta el 19 de octubre inclusive. Debe renovarla, como
--    máximo, el 20 de octubre."
--   "Puede pagar anticipadamente, pero el nuevo período comienza cuando
--    finaliza el anterior."
--   "Las clases no utilizadas vencen con la membresía y no se acumulan."
--
-- Hoy el sistema hace otras dos cosas:
--
--   1. La vigencia corre por DÍAS FIJOS. Los cinco planes FE mensuales
--      tienen duration_days = 30 (FE FIRST tiene 7: es un pase de un
--      día), y 30 días no es un mes.
--
--      Conviene tenerlo derecho porque es fácil decirlo al revés: sumar
--      30 días acierta cuando el mes tiene 31 —del 15/01 al 14/02 da lo
--      mismo por los dos caminos— y falla en todos los demás. Con el
--      ejemplo del estudio, 20/09 da 20/10 en vez de 19/10: un día de
--      más, porque end_date es inclusivo. Y desde un 15/02 da 17/03 en
--      vez de 14/03: tres días de más.
--
--   2. El pago anticipado NO se encola: assignMembership arranca siempre
--      hoy sin mirar la membresía anterior, así que quedan dos vigentes
--      solapadas. Y como membresia_para elige la de end_date mayor, desde
--      el día del pago anticipado todo consumo va contra la nueva y lo
--      que quedaba de la vieja queda huérfano. La 0030 lo dejó escrito en
--      su sección "LO QUE ESTO NO ARREGLA".
--
-- Las dos cosas se arreglan juntas y no por prolijidad: encolar elimina
-- el solapamiento, y sin solapamiento la pregunta de cuál membresía elige
-- el motor —que la 0029 y la 0030 contestaron distinto— deja de tener dos
-- respuestas posibles. Hay a lo sumo una membresía que cubra una fecha.
--
-- DÓNDE VIVE LA REGLA. En la base, no en el navegador. Hasta hoy el
-- vencimiento se calculaba en dos lugares con la misma fórmula duplicada
-- (lib/api.ts y el proceso diario), que es exactamente lo que la 0029
-- vino a terminar con el consumo de clases. Acá el cálculo es un trigger
-- BEFORE INSERT que pisa lo que venga: el navegador puede seguir mandando
-- su valor —y lo manda, para que el sistema siga funcionando si esta
-- migración todavía no corrió— pero la base lo sobreescribe.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. EL PLAN DICE EN QUÉ UNIDAD DURA
--
-- Se suma una columna en vez de reinterpretar duration_days, porque hacen
-- falta las dos unidades a la vez: los cinco planes mensuales duran un
-- mes y FE FIRST es un pase de un día que hoy vale 7 días. Una columna
-- llamada duration_days que guardara un 1 queriendo decir "un mes"
-- mentiría en el nombre, y el nombre es lo único que lee el que llega
-- después.
--
-- Nace en 0 para todos, o sea que sin tocar nada la vigencia sigue
-- corriendo por días exactamente como hasta ahora: esta migración no
-- cambia ninguna membresía existente ni ningún plan hasta el UPDATE de
-- más abajo.
-- ------------------------------------------------------------

alter table public.plans
  add column if not exists duration_months int not null default 0
    check (duration_months >= 0);

comment on column public.plans.duration_months is
  'Meses de calendario que dura la membresía. 0 = la vigencia la manda duration_days. Con 1, iniciar el 20/09 vence el 19/10 inclusive.';

-- Los cinco planes mensuales pasan a un mes de calendario. FE FIRST se
-- queda en días: es un pase de un día y su vigencia de 7 días es la
-- ventana para venir a usarlo, no un período mensual.
update public.plans set duration_months = 1
where name in ('FE START', 'FE FLOW', 'FE BALANCE', 'FE STRONG', 'FE FULL');

-- ------------------------------------------------------------
-- 2. HASTA CUÁNDO VALE
--
-- Un mes de calendario y no 30 días: 'start + 1 month - 1 day'. El
-- "- 1 day" es porque end_date es INCLUSIVO — membresia_para compara
-- `p_fecha between start_date and end_date` (0030) — así que iniciando el
-- 20/09 el último día de uso es el 19/10, que es literalmente lo que
-- escribió el estudio.
--
-- Postgres resuelve solo el caso que siempre se olvida: no existe el 31
-- de febrero. Iniciando el 31/01/2026, 'start + 1 month' se ajusta al
-- 28/02 y el "- 1 day" lo deja en 27/02.
-- ------------------------------------------------------------

create or replace function public.vigencia_hasta(p_start date, p_plan uuid)
returns date
language sql stable security definer set search_path = ''
as $$
  select case
    when p.duration_months > 0
      then (p_start + make_interval(months => p.duration_months) - interval '1 day')::date
    else p_start + p.duration_days
  end
  from public.plans p
  where p.id = p_plan
$$;

comment on function public.vigencia_hasta(date, uuid) is
  'Último día de uso, inclusive. La autoridad del vencimiento: el trigger la usa y pisa lo que mande el navegador.';

-- ------------------------------------------------------------
-- 3. EL PERÍODO NUEVO ARRANCA CUANDO TERMINA EL ANTERIOR
--
-- El trigger hace dos cosas, en este orden, y el orden importa: primero
-- corre el inicio si hay solapamiento, después calcula el fin sobre ese
-- inicio ya corrido.
--
-- La regla de encolado es simple de decir: una membresía nueva no puede
-- empezar antes de que termine la última que le queda viva. Si el estudio
-- le cobra el 15 y su membresía muere el 19, la nueva arranca el 20. Si
-- le cobra el 25, cuando ya no tiene nada vivo, arranca el 25 — que es la
-- otra regla del estudio: "si paga después del vencimiento puede renovar,
-- pero deberá elegir entre los horarios que continúen disponibles".
--
-- Se mira la membresía con end_date más alto y no "la vigente hoy": si
-- alguien pagó dos meses adelantados, el tercero va detrás del segundo.
--
-- Sobre por qué pisa el end_date que venga en vez de respetarlo: si lo
-- respetara, habría dos fórmulas de la misma regla —una acá y otra en el
-- navegador— y tarde o temprano dirían cosas distintas. Que el navegador
-- mande un valor y la base lo descarte es el precio de que el sistema
-- siga funcionando mientras esta migración no esté aplicada.
--
-- No se toca en UPDATE, a propósito: corregir a mano las fechas de una
-- membresía es una operación legítima del mostrador, y un trigger que
-- recalculara en cada update la haría imposible.
-- ------------------------------------------------------------

create or replace function public.membresia_fechas()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ultimo date;
begin
  select max(m.end_date) into v_ultimo
  from public.memberships m
  where m.student_id = new.student_id
    and m.status = 'activa'
    and m.end_date >= new.start_date;

  if v_ultimo is not null then
    new.start_date := v_ultimo + 1;
  end if;

  new.end_date := public.vigencia_hasta(new.start_date, new.plan_id);

  -- Si el plan no existe la función devuelve null, y end_date es NOT NULL:
  -- el insert muere con un mensaje sobre una columna nula que no dice qué
  -- pasó. Mejor decirlo.
  if new.end_date is null then
    raise exception
      'No se pudo calcular la vigencia: el plan % no existe', new.plan_id;
  end if;

  return new;
end;
$$;

drop trigger if exists memberships_fechas on public.memberships;
create trigger memberships_fechas
  before insert on public.memberships
  for each row execute function public.membresia_fechas();

-- ------------------------------------------------------------
-- 4. CUÁL ES "LA" MEMBRESÍA DE UN CLIENTE
--
-- Esto es la consecuencia del encolado y hay que hacerlo en la misma
-- migración, porque encolar sin esto rompe una pantalla que hoy funciona.
--
-- La 0029 escribió membresia_para con `order by end_date` ASCENDENTE
-- ("se usa primero la que primero se pierde") y la 0030 lo dio vuelta a
-- DESCENDENTE para que coincidiera con lo que mostraba la ficha, que leía
-- las membresías ordenadas por end_date descendente y se quedaba con la
-- primera de cada cliente ("su membresía más reciente").
--
-- Con el encolado las dos quedan mal por el mismo motivo: si un cliente
-- paga adelantado, su membresía de end_date más alto es una que todavía
-- NO EMPEZÓ. El motor elegiría la futura para descontar una clase de hoy,
-- y la ficha mostraría como suya una que arranca el mes que viene.
--
-- La respuesta correcta a "cuál es su membresía" es la que cubre la fecha
-- que se está preguntando. Y cuando hay varias que la cubren —solo puede
-- pasar con filas viejas, anteriores a esta migración— la que primero se
-- pierde, que es lo que había escrito la 0029.
--
-- La pantalla se mueve en el mismo commit que esta migración.
-- ------------------------------------------------------------

create or replace function public.membresia_para(p_student uuid, p_fecha date)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select m.id
  from public.memberships m
  where m.student_id = p_student
    and m.status = 'activa'
    and p_fecha between m.start_date and m.end_date
  -- asc: la que primero se pierde. Con el encolado de la 0036 no hay dos
  -- que cubran la misma fecha, así que esto solo desempata filas viejas.
  order by m.end_date
  limit 1
$$;

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
--   -- 1. La fórmula, sin tocar datos: el ejemplo del estudio y cuatro
--   --    casos de borde. Ojo con el de 15/01, que está para mostrar el
--   --    único caso donde los 30 días viejos ya acertaban.
--   with p as (select id from public.plans where name = 'FE FLOW')
--   select d as inicia, public.vigencia_hasta(d, p.id) as hasta_inclusive
--   from p, (values ('2026-09-20'::date), ('2026-01-31'), ('2026-03-31'),
--                   ('2026-01-15'), ('2026-02-15')) as v(d);
--   → 20/09 → 19/10   (el ejemplo del estudio, textual)
--   → 31/01 → 27/02   (no existe el 31 de febrero: Postgres lo resuelve)
--   → 31/03 → 29/04
--   → 15/01 → 14/02   (los 30 días viejos daban lo mismo: enero tiene 31)
--   → 15/02 → 14/03   (los 30 días viejos daban 17/03: tres de más)
--
--   -- 2. FE FIRST sigue por días
--   select public.vigencia_hasta('2026-09-20', id) from public.plans where name = 'FE FIRST';
--   → 27/09   (7 días)
--
--   -- 3. El encolado, con un cliente real. Asignale FE FLOW dos veces
--   --    seguidas desde la ficha y mirá las dos filas:
--   select s.name, p.name as plan, m.start_date, m.end_date
--   from public.memberships m
--   join public.students s on s.id = m.student_id
--   join public.plans p on p.id = m.plan_id
--   order by s.name, m.start_date;
--   → la segunda arranca el día siguiente al end_date de la primera,
--     NO hoy, y sus períodos no se pisan
--
--   -- 4. Que no queden dos membresías cubriendo el mismo día
--   select a.student_id, a.id, b.id
--   from public.memberships a
--   join public.memberships b
--     on b.student_id = a.student_id and b.id <> a.id
--    and a.start_date <= b.end_date and b.start_date <= a.end_date
--   where a.status = 'activa' and b.status = 'activa';
--   → cero filas para todo lo creado a partir de acá. Las filas viejas
--     pueden aparecer, y ahí el desempate es "la que primero se pierde".
--
--   -- 5. Los invariantes de siempre
--   select * from public.consumo_control();   → cero filas
--   select * from public.perm_diff();         → cero filas
-- ============================================================

-- ============================================================
-- LO QUE ESTO NO ARREGLA
--
-- · EL DÍA DE GRACIA, cuando no paga. El estudio dijo que usa hasta el
--   19/10, renueva como máximo el 20/10 y el 21/10 pierde la prioridad.
--   Si el 20 PAGA, no hay ningún problema: no le queda nada vivo detrás
--   de qué encolarse, la membresía nueva arranca ese mismo día y puede
--   reservar. Si el 20 NO paga, ese día no tiene membresía que cubra la
--   fecha, así que conserva la prioridad sobre su horario pero no puede
--   reservar. Es coherente con su regla, y el mostrador lo va a reportar
--   como un bug si no está escrito. Modelar la prioridad es parte del
--   turno fijo, no de esto: hoy no hay turno fijo que conservar.
--
-- · LA RENOVACIÓN AUTOMÁTICA SIGUE SIN EXIGIR EL PAGO. auto_renew nace en
--   true y el proceso diario inserta la membresía y recién después genera
--   la cuota como pendiente, así que un cliente que no pagó queda vigente
--   y puede reservar — lo contrario de "si no paga ese día pierde la
--   prioridad". Con el encolado de acá esa renovación ya arranca donde
--   corresponde, pero la decisión de si auto_renew sigue existiendo es
--   aparte y gobierna los avisos.
--
-- · EL MES DE CINCO LUNES. Un período de 20/09 a 19/10 son cuatro semanas
--   y dos días, así que uno o dos días de la semana caen cinco veces,
--   mientras el plan trae cuatro clases por semana. Hoy no muerde porque
--   las reservas se crean de a una y el cliente elige. El día que exista
--   el turno fijo y materialice las reservas del período, la quinta
--   inserción va a chocar con el tope y consumir_clase va a tirar
--   excepción. Está anotado en §8 de docs/REQUERIMIENTOS-CASA-FE.md.
-- ============================================================

-- ============================================================
-- VUELTA ATRÁS (no ejecutar salvo que haga falta)
--
-- Las membresías ya creadas con vigencia mensual conservan sus fechas:
-- son datos, no se recalculan. Esto solo deja de aplicar la regla a las
-- nuevas.
--
--   begin;
--
--   drop trigger if exists memberships_fechas on public.memberships;
--   drop function if exists public.membresia_fechas();
--   drop function if exists public.vigencia_hasta(date, uuid);
--
--   -- Los planes mensuales editados desde la pantalla pueden haber
--   -- quedado con duration_days en 0, y sin duration_months ese 0 pasa a
--   -- ser la vigencia: hay que devolverles un número antes de soltar la
--   -- columna. (Un `set duration_months = 0` acá no serviría de nada: la
--   -- línea siguiente borra la columna.)
--   update public.plans set duration_days = duration_months * 30
--   where duration_months > 0 and duration_days = 0;
--   alter table public.plans drop column duration_months;
--
--   -- Y membresia_para vuelve a como la dejó la 0030
--   create or replace function public.membresia_para(p_student uuid, p_fecha date)
--   returns uuid
--   language sql stable security definer set search_path = ''
--   as $fn$
--     select m.id from public.memberships m
--     where m.student_id = p_student and m.status = 'activa'
--       and p_fecha between m.start_date and m.end_date
--     order by m.end_date desc limit 1
--   $fn$;
--
--   commit;
--
-- Y revertir el commit que mueve la ficha, o la pantalla vuelve a
-- mostrar la membresía futura de quien pagó adelantado.
-- ============================================================
