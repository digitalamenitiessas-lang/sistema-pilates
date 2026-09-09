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
-- Acá también entran cuatro cosas más, y la última no es de este tema
-- pero no puede esperar:
--
--   · Un off-by-one que la 0036 dejó vivo justo en la rama que no miraba.
--   · El desempate de qué membresía paga la clase cuando hay dos, que es
--     la consecuencia directa de dejar que el pase de prueba arranque hoy:
--     sin eso, este arreglo mueve el problema en vez de sacarlo.
--   · Un piso para la vigencia, porque un plan en cero creaba membresías
--     vencidas el día antes de empezar y el insert pasaba.
--   · La columna que le falta a la vista pública para no publicar una
--     vigencia falsa.
--   · Y `consumir_clase` de la 0029, que lee OLD en un INSERT: está
--     aplicada y encendida, y si eso muerde falla TODA reserva nueva.
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

  -- Un plan con la vigencia en cero devuelve `start - 1`, o sea una
  -- membresía vencida el día antes de empezar, y el insert PASA: no hay
  -- CHECK que lo impida. Pasaba de verdad, porque hasta el arreglo de
  -- este mismo lote el formulario de Planes escribía duration_days = 0 al
  -- guardar un plan mensual. Se corta acá, que es donde se ve el
  -- resultado, y no con un CHECK sobre plans: un plan mal cargado se
  -- corrige, una membresía nacida vencida hay que descubrirla.
  if new.end_date < new.start_date then
    raise exception
      'El plan no tiene vigencia: revisá los días o los meses en Planes antes de asignarlo';
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- 3. CUÁL MEMBRESÍA PAGA LA CLASE, CUANDO HAY DOS
--
-- Dejar que el pase de prueba arranque hoy abre a propósito lo que la
-- 0036 había cerrado: dos membresías que cubren la misma fecha. Y ahí
-- `membresia_para` elige "la que primero se pierde", que era lo correcto
-- entre dos mensualidades y es lo PEOR entre una mensualidad y un pase:
-- elige el pase aunque esté agotado, y `consumir_clase` rechaza la
-- reserva con "Ya usó la clase de su plan" mientras la mensualidad tiene
-- ocho clases sin tocar.
--
-- O sea: sin esto, arreglar el encolado del pase de prueba mueve el
-- problema en vez de sacarlo.
--
-- El orden pasa a ser: primero la que TIENE saldo, y entre esas la que
-- primero se pierde. Sigue siendo verdad lo que la 0029 quería —no
-- desperdiciar la que vence antes— y deja de ser posible que una
-- membresía agotada bloquee a una que no lo está.
--
-- `classes_used` es derivado y los triggers de la 0029 lo mantienen, así
-- que se lee directo en vez de recalcular: `consumo_control()` es el que
-- garantiza que no miente.
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
  order by (m.classes_used >= m.classes_total), m.end_date
  limit 1
$$;

-- ------------------------------------------------------------
-- 4. Y UNA QUE NO ES DE ESTE TEMA, PERO NO PUEDE ESPERAR
--
-- `consumir_clase` (0029) arma su bandera de "se está marcando
-- asistencia" leyendo `old.status` dentro de una expresión con `and`:
--
--   v_marca := tg_op = 'UPDATE' and new.status in (...)
--              and old.status is distinct from new.status;
--
-- En un INSERT, OLD no existe: no es una fila de nulos, es un registro
-- sin asignar, y tocarle un campo levanta `record "old" is not assigned
-- yet`. Lo único que lo salva es que el AND cortocircuite, y el manual
-- dice explícitamente que el orden de evaluación de las subexpresiones no
-- está definido.
--
-- Este proyecto ya había tomado la decisión contraria y la dejó escrita:
-- `stamp_reservation` (0022) usa una bandera "con una bandera y no con un
-- `or` en la condición: el OR de SQL no garantiza evaluación perezosa, y
-- en un INSERT no existe OLD". En la 0029 se volvió a colar.
--
-- POR QUÉ AHORA. Esa línea nunca se ejecutó: consumir_clase arranca con
-- `if not consumo_rige() then return new`, y el motor estuvo apagado
-- hasta el 09/09. Se encendió el mismo día, y desde entonces no hubo
-- ninguna reserva real porque no hay clientes cargados. La primera que
-- se haga la ejercita — y si muerde, no falla una reserva: fallan TODAS,
-- desde el portal y desde el mostrador.
--
-- La función va completa porque `create or replace` reemplaza el cuerpo
-- entero; lo único que cambia son esas tres líneas. El trigger que la
-- llama no se toca.
-- ------------------------------------------------------------

create or replace function public.consumir_clase()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_toma     boolean;   -- ¿esta escritura toma un lugar?
  v_marca    boolean;   -- ¿se está marcando asistencia?
  v_mem      uuid;
  v_total    int;
  v_usadas   int;
  v_horas    numeric;
  v_inicio   timestamptz;
  v_susp     boolean;
begin
  if not public.consumo_rige() then return new; end if;

  v_toma  := new.status in ('confirmada', 'asistió');

  -- Con una bandera y no con un `and` en la expresión: el AND de SQL no
  -- garantiza evaluación perezosa, y en un INSERT OLD no existe — leerlo
  -- levanta 'record "old" is not assigned yet' y falla TODA reserva
  -- nueva. La 0022 ya lo había dejado escrito (stamp_reservation usa
  -- v_foto por este mismo motivo) y acá se había colado.
  v_marca := false;
  if tg_op = 'UPDATE' then
    v_marca := new.status in ('asistió', 'ausente')
               and old.status is distinct from new.status;
  end if;

  if tg_op = 'UPDATE' then
    -- La identidad de la reserva NO se mueve en un update, y esto no es
    -- cosmético: desde la 0029 date, class_id y start_time deciden si la
    -- clase se pierde o vuelve. La política "alumno cancela" (0005:75-78)
    -- deja a la alumna escribir sus propias filas y NO restringe
    -- columnas, así que sin esto puede mandar start_time = '23:59' junto
    -- con la cancelación y convertir un aviso tardío en uno en plazo.
    -- Ningún camino legítimo del código escribe estas columnas en un
    -- update: el único que existe es .update({ status }).
    new.student_id := old.student_id;
    new.class_id   := old.class_id;
    new.date       := old.date;
    new.membership_id := old.membership_id;
    -- start_time solo lo refresca reservations_stamp al marcar asistencia,
    -- que corre después de este trigger.
    if not v_marca then new.start_time := old.start_time; end if;
  end if;

  -- ---- Clasificar la cancelación ----
  if tg_op = 'UPDATE' and new.status = 'cancelada'
     and old.status is distinct from 'cancelada' then

    select exists (
      select 1 from public.class_occurrences o
      where o.class_id = new.class_id and o.date = new.date and o.status = 'suspendida'
    ) into v_susp;

    if v_susp then
      -- La suspensión manda sobre el reloj: si el estudio no la dictó, no
      -- importa a qué hora avisó la clienta.
      new.cancel_kind := null;
    else
      select coalesce(nullif(s.value, '')::numeric, 3) into v_horas
      from public.studio_settings s where s.key = 'cancel_hours';
      v_horas := coalesce(v_horas, 3);

      v_inicio := (new.date + coalesce(new.start_time, time '00:00'))
                    at time zone 'America/Argentina/Buenos_Aires';

      new.cancel_kind := case
        when now() <= v_inicio - make_interval(mins => (v_horas * 60)::int)
        then 'en plazo' else 'fuera de plazo' end;
    end if;
  end if;

  -- ---- Validar y sellar al tomar un lugar ----
  if v_toma and (tg_op = 'INSERT' or new.membership_id is null) then
    v_mem := public.membresia_para(new.student_id, new.date);

    if v_mem is null then
      raise exception
        'No tiene una membresía vigente para el % — asignale un plan antes de reservarle esa clase',
        to_char(new.date, 'DD/MM/YYYY');
    end if;

    select m.classes_total, m.classes_used_base + public.consumo_contadas(m.id)
    into v_total, v_usadas
    from public.memberships m where m.id = v_mem;

    if v_usadas >= v_total then
      raise exception
        'Ya usó las % clases de su plan. Para anotarla igual, renovale la membresía o cambiale el plan',
        v_total;
    end if;

    new.membership_id := v_mem;
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- 5. LA WEB PÚBLICA NO PUEDE PUBLICAR UNA VIGENCIA QUE NO EXISTE
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
--
-- LA COLUMNA VA AL FINAL, Y NO ES UNA CUESTIÓN DE ESTILO. `create or
-- replace view` solo admite AGREGAR columnas después de las que ya
-- estaban: poner `duration_months` en su lugar natural —al lado de
-- `duration_days`— hace que Postgres lea la lista por posición y crea que
-- se le está renombrando la sexta columna. Falla con
-- `42P16: cannot change name of view column "disciplines" to
-- "duration_months"` y, como todo esto va en una transacción, no se aplica
-- nada del resto de la migración.
--
-- La alternativa era `drop view` + `create view`, y no se elige: la vista
-- la lee la landing SIN LOGIN, y su acceso público depende de los
-- privilegios por defecto del esquema. Recrear el objeto es apostar a que
-- se los vuelva a dar; agregar al final no toca nada de eso.
--
-- El orden de las columnas de una vista no lo usa nadie acá: PostgREST
-- devuelve un objeto y el código lee por nombre.
-- ------------------------------------------------------------

create or replace view public.public_plans as
select id, name, price, class_count, duration_days, disciplines,
       description, color, popular, is_trial,
       duration_months
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
--   → los cinco FE con duration_months = 1, FE FIRST con 7 días y 0 meses
--
--   -- Y que la vista no haya perdido ninguna columna en el camino
--   select column_name from information_schema.columns
--   where table_name = 'public_plans' order by ordinal_position;
--   → las diez de siempre y duration_months al final
--
--   -- 7. El desempate: con una prueba agotada y una mensualidad con
--   --    saldo cubriendo el mismo día, el motor tiene que elegir la que
--   --    tiene saldo. Con un cliente de prueba:
--   --    asignale FE FIRST, marcale la clase como usada, asignale FE FLOW
--   --    y pedile el motor para hoy.
--   select p.name from public.plans p
--   where p.id = (select m.plan_id from public.memberships m
--                 where m.id = public.membresia_para('<id del cliente>', current_date));
--   → FE FLOW   (antes devolvía FE FIRST y rechazaba la reserva)
--
--   -- 8. Un plan sin vigencia no puede asignarse
--   --    (probalo creando un plan con 0 días y 0 meses desde Planes)
--   → la base rechaza con "El plan no tiene vigencia"
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
-- · EL CONTROL #4 DE LA 0036 YA NO DA CERO, Y ESTÁ BIEN. Esa migración
--   dejó una consulta que buscaba membresías solapadas prometiendo "cero
--   filas para todo lo creado a partir de acá". Desde acá el pase de
--   prueba se solapa A PROPÓSITO con la mensualidad, así que esa consulta
--   va a devolver esas parejas. El invariante correcto es más chico: no
--   hay dos MENSUALIDADES que cubran la misma fecha. Para verificarlo hay
--   que sumarle a esa consulta el `join plans` de las dos patas y filtrar
--   `not p.is_trial`.
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
--   -- Sacar una columna del final tampoco lo permite `create or replace`
--   -- (solo agregar), así que la vuelta atrás de la vista necesita el
--   -- drop, y con él hay que revisar que el acceso público siga estando.
--   drop view public.public_plans;
--   create view public.public_plans as
--   select id, name, price, class_count, duration_days, disciplines,
--          description, color, popular, is_trial
--   from public.plans where active = true;
--
--   commit;
--
-- Y revertir el commit del código, o la landing va a pedirle a la vista
-- una columna que dejó de existir.
-- ============================================================
