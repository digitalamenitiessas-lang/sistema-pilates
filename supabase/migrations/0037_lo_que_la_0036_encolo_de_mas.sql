-- ============================================================
-- 0037 — Lo que la 0036 encoló de más
--
-- La 0036 ya está aplicada y su regla de fondo es la correcta: un mes de
-- calendario y el pago anticipado detrás del período en curso. Lo que
-- estaba mal es el ALCANCE de "detrás": el trigger encola cualquier
-- membresía nueva, sin preguntarse qué se está vendiendo.
--
-- El caso que lo delata es el embudo normal de un estudio que abre:
-- alguien toma la clase de prueba y ese mismo día se decide por una
-- mensualidad. FE FIRST queda vigente una semana, así que el trigger le
-- arranca FE FLOW recién cuando la prueba muere — pagó un mes que no
-- puede usar por seis días. Y si el mostrador le intenta reservar una
-- clase de esta semana, `membresia_para` devuelve el pase de prueba
-- (es el único que cubre hoy) y `consumir_clase` la rechaza con "Ya usó
-- la clase de su plan".
--
-- El mismo error al revés: la clienta con mensualidad vigente que compra
-- un pase suelto para recuperar una clase recibe un pase que arranca el
-- mes que viene, o sea que no le suma nada al mes que está pagando.
--
-- Lo que el estudio pidió —"puede pagar anticipadamente, pero el nuevo
-- período comienza cuando finaliza el anterior"— es sobre la RENOVACIÓN
-- DE UNA MENSUALIDAD. Un pase de un día arranca el día que se compra,
-- siempre.
--
-- Acá también se corrige un off-by-one que la 0036 dejó vivo justo en la
-- rama que no miraba, y se le agrega a la vista pública la columna que le
-- falta para no publicar una vigencia falsa.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. LA VIGENCIA POR DÍAS TAMBIÉN CUENTA INCLUSIVE
--
-- La 0036 dejó las dos ramas con convenciones distintas: la de meses
-- resta un día porque `end_date` es inclusivo, y la de días no. Con 7
-- días, arrancar el 20 daba hasta el 27, que son ocho días de uso,
-- mientras la pantalla dice "Vigencia 7 días".
--
-- Es exactamente el off-by-one que la 0036 identificó como el bug de los
-- 30 días, sobreviviendo en la rama de al lado. Se corrige ahora porque
-- todavía no hay ninguna membresía en la base: dentro de un mes, cambiar
-- esto le movería un día a gente real.
--
-- Y de paso queda una sola definición de qué significa el número de un
-- plan: días —o meses— DE USO, contados desde el día que arranca.
-- ------------------------------------------------------------

create or replace function public.vigencia_hasta(p_start date, p_plan uuid)
returns date
language sql stable security definer set search_path = ''
as $$
  select case
    when p.duration_months > 0
      then (p_start + make_interval(months => p.duration_months) - interval '1 day')::date
    else p_start + p.duration_days - 1
  end
  from public.plans p
  where p.id = p_plan
$$;

comment on function public.vigencia_hasta(date, uuid) is
  'Último día de uso, inclusive. El número del plan son días o meses DE USO: 7 días arrancando el 20 llega hasta el 26, no el 27.';

-- ------------------------------------------------------------
-- 2. SOLO SE ENCOLAN LAS MENSUALIDADES
--
-- Dos condiciones, y cada una arregla un caso distinto:
--
--   · Si lo que entra es un pase de prueba, no se encola nunca. Arranca
--     hoy, que es para lo que se compra.
--   · Al buscar detrás de qué encolar, los pases de prueba no cuentan.
--     Una prueba viva no puede empujar una mensualidad al mes siguiente.
--
-- El discriminador es `is_trial` y no `duration_months`, a propósito: lo
-- que define a un pase no es que dure poco, es que sea un pase. Un plan
-- mensual sigue encolándose detrás de otro mensual aunque alguien le
-- cargue la vigencia en días.
--
-- LO QUE SIGUE SIN RESOLVER, y es una decisión de negocio: "Cambiar plan"
-- y "Renovar membresía" son el mismo botón (ficha-alumno.tsx), así que un
-- cambio de plan también se encola. La clienta con FE START que el 5 de
-- octubre quiere pasar a FE FULL paga el plan grande hoy y lo empieza a
-- usar el 20, con cuatro clases hasta entonces. Arreglarlo obliga a
-- decidir qué pasa con lo que le queda del plan viejo —si se pierde, si
-- se prorratea, si se le acredita— y eso lo contesta el estudio. Hasta
-- entonces la pantalla avisa cuándo va a arrancar antes de cobrar, que es
-- lo único honesto que se puede hacer sin esa respuesta.
-- ------------------------------------------------------------

create or replace function public.membresia_fechas()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_prueba  boolean;
  v_ultimo  date;
begin
  select p.is_trial into v_prueba
  from public.plans p where p.id = new.plan_id;

  if v_prueba is null then
    raise exception
      'No se pudo calcular la vigencia: el plan % no existe', new.plan_id;
  end if;

  if not v_prueba then
    select max(m.end_date) into v_ultimo
    from public.memberships m
    join public.plans p on p.id = m.plan_id
    where m.student_id = new.student_id
      and m.status = 'activa'
      and not p.is_trial
      and m.end_date >= new.start_date;

    if v_ultimo is not null then
      new.start_date := v_ultimo + 1;
    end if;
  end if;

  new.end_date := public.vigencia_hasta(new.start_date, new.plan_id);
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 3. LA WEB PÚBLICA NO PUEDE PUBLICAR UNA VIGENCIA QUE NO EXISTE
--
-- La vista enumera columnas, así que `duration_months` no llegaba y la
-- landing solo tenía `duration_days` para mostrar: publicaba "Vigencia 30
-- días" de planes que ahora duran un mes de calendario. Comprando FE FLOW
-- el 31 de enero eso son 28 días, no 30: la promesa pública era dos días
-- más larga que lo que el sistema da, en la página que la clienta lee
-- ANTES de pagar.
--
-- Se suma la columna a la vista y la landing la usa. `select *` no sirve
-- acá: la vista enumera a propósito, para no exponer una columna nueva de
-- plans sin decidirlo.
-- ------------------------------------------------------------

create or replace view public.public_plans as
select id, name, price, class_count, duration_days, duration_months, disciplines,
       description, color, popular, is_trial
from public.plans
where active = true;

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
--   -- 1. La vigencia por días ahora cuenta inclusive
--   select public.vigencia_hasta('2026-09-20', id) from public.plans where name = 'FE FIRST';
--   → 26/09   (siete días de uso: 20, 21, 22, 23, 24, 25 y 26)
--
--   -- 2. La de meses no cambió
--   select public.vigencia_hasta('2026-09-20', id) from public.plans where name = 'FE FLOW';
--   → 19/10
--
--   -- 3. El pase de prueba no se encola. Con un cliente de prueba:
--   --    asignale FE FLOW y después, el mismo día, FE FIRST.
--   select p.name, m.start_date, m.end_date
--   from public.memberships m join public.plans p on p.id = m.plan_id
--   where m.student_id = '<id>' order by m.start_date;
--   → FE FLOW arranca hoy, y FE FIRST TAMBIÉN arranca hoy (no detrás)
--
--   -- 4. Y una mensualidad no se encola detrás de una prueba:
--   --    asignale FE FIRST y después FE FLOW.
--   → las dos arrancan hoy
--
--   -- 5. Dos mensualidades sí se encolan (lo de la 0036, que no cambia)
--   → la segunda arranca el día siguiente al end_date de la primera
--
--   -- 6. La vista pública ya trae la columna
--   select name, duration_days, duration_months from public.public_plans order by price;
--   → los cinco FE con duration_months = 1, FE FIRST con 7 días
--
--   select * from public.consumo_control();   → cero filas
--   select * from public.perm_diff();         → cero filas
-- ============================================================

-- ============================================================
-- LO QUE ESTO NO ARREGLA
--
-- · EL CAMBIO DE PLAN, explicado arriba: sigue encolándose porque es el
--   mismo botón que renovar y hace falta una decisión del estudio.
--
-- · LAS MEMBRESÍAS SUSPENDIDAS NO EMPUJAN. El trigger filtra
--   `status = 'activa'`, así que si el estudio suspende una membresía y
--   asigna otra, la nueva arranca hoy y se pisa con la suspendida. Volver
--   la primera a 'activa' deja dos cubriendo los mismos días. Es correcto
--   mientras suspender signifique "no cuenta", y va a dejar de serlo el
--   día que exista el congelamiento de verdad — que el estudio todavía no
--   contestó (§8 de docs/REQUERIMIENTOS-CASA-FE.md).
--
-- · LA RENOVACIÓN AUTOMÁTICA ATRASADA ABRE UN HUECO. El proceso diario
--   inserta con `start_date = today`, así que si no corre el día que
--   correspondía, la membresía nueva arranca tarde y quedan días sin
--   cobertura. Encolar no lo tapa: no hay nada vivo detrás de qué ponerse.
--   Se resuelve con la decisión sobre auto_renew, que es el bloque
--   siguiente.
-- ============================================================

-- ============================================================
-- VUELTA ATRÁS (no ejecutar salvo que haga falta)
--
-- Vuelve a la 0036 tal como estaba, no antes de ella.
--
--   begin;
--
--   create or replace function public.vigencia_hasta(p_start date, p_plan uuid)
--   returns date language sql stable security definer set search_path = ''
--   as $fn$
--     select case
--       when p.duration_months > 0
--         then (p_start + make_interval(months => p.duration_months) - interval '1 day')::date
--       else p_start + p.duration_days
--     end
--     from public.plans p where p.id = p_plan
--   $fn$;
--
--   create or replace function public.membresia_fechas()
--   returns trigger language plpgsql security definer set search_path = ''
--   as $fn$
--   declare v_ultimo date;
--   begin
--     select max(m.end_date) into v_ultimo from public.memberships m
--     where m.student_id = new.student_id and m.status = 'activa'
--       and m.end_date >= new.start_date;
--     if v_ultimo is not null then new.start_date := v_ultimo + 1; end if;
--     new.end_date := public.vigencia_hasta(new.start_date, new.plan_id);
--     if new.end_date is null then
--       raise exception 'No se pudo calcular la vigencia: el plan % no existe', new.plan_id;
--     end if;
--     return new;
--   end;
--   $fn$;
--
--   create or replace view public.public_plans as
--   select id, name, price, class_count, duration_days, disciplines,
--          description, color, popular, is_trial
--   from public.plans where active = true;
--
--   commit;
--
-- Y revertir el commit del código, o la landing va a pedirle a la vista
-- una columna que dejó de existir.
-- ============================================================
