-- ============================================================
-- 0091 — La clase sin nadie anotado no se paga
--
-- EL SÍNTOMA
--
-- Desde el 01/10 las tres profesoras cobran por clase ($10.000), y la
-- liquidación cuenta como dictada TODA clase activa de la grilla que no
-- esté suspendida, haya o no alguien anotado: sale de
-- `sesiones_dictadas` (0073), que mira la grilla y no las reservas. Pero
-- en el estudio, por ahora, quien da la clase va sólo si hay alguien
-- anotado. Del 01/10 al 03/10 la grilla tiene 28 clases —$280.000— y
-- hubo reservas sólo el 01/10 (5) y el 03/10 (1): la liquidación pagaba
-- clases que nadie dio. Todavía no hay ninguna liquidación cerrada.
--
-- Decisión de Matías, 05/10: "hacé lo de la liquidación".
--
-- LA REGLA SE CONFIGURA
--
-- "Por ahora" es la palabra que manda: el día que la grilla se llene, o
-- que el estudio decida pagar la disponibilidad, la regla cambia. Por
-- eso es un parámetro y no un `where` escrito en la función:
-- `payroll_only_booked_classes`, en un grupo nuevo de Configuración,
-- "Personal y liquidación". Nace PRENDIDO, que es como trabaja hoy el
-- estudio. Apagado, se paga toda la grilla exactamente como hasta hoy, y
-- el punto 7 lo comprueba antes de dejar nada escrito.
--
-- Si la fila del parámetro no está, la función responde "apagado": sin
-- la regla configurada rige la de antes. Es el mismo criterio que
-- `settingRige` en la pantalla.
--
-- QUÉ ES "ALGUIEN ANOTADO"
--
-- Una reserva de esa clase en esa fecha que hizo ir a quien la da:
--
--   · confirmada, asistió o ausente. La ausente también: faltó sin
--     avisar, pero la clase estaba armada. Los recuperos y las
--     excepciones son reservas como cualquiera y cuentan igual;
--   · cancelada FUERA de plazo: avisó tarde, y quien da la clase ya
--     estaba en camino.
--
-- No cuentan la lista de espera —tampoco el lugar ofrecido que nadie
-- tomó—, la cancelada en plazo ('en plazo' y 'en plazo sin cupo': avisó
-- a tiempo, nadie tenía por qué ir) ni la clase suspendida, que ya la
-- saca `sesiones_dictadas`.
--
-- POR QUÉ `sesiones_dictadas` NO SE TOCA
--
-- La usa también el reporte de Ocupación (`reporte_ocupacion`, 0073), y
-- ahí una clase vacía es un dato: es la que baja el porcentaje. Sacarle
-- las clases sin nadie inflaría la ocupación. Se buscaron todas las que
-- la llaman —en el repo, sólo `liquidacion` y `reporte_ocupacion`; en la
-- pantalla, ninguna directo— y el filtro va sólo en la liquidación.
--
-- Va en una función nueva, `clases_a_pagar(desde, hasta)`, que devuelve
-- cada clase dictada con cuántas reservas la armaron, si se paga y, si
-- no, por qué. La liquidación suma las que se pagan, y la pantalla de
-- Personal la usa para mostrar el detalle: las dos leen la regla en el
-- mismo lugar, así que no pueden decir cosas distintas.
--
-- Los reemplazos siguen como estaban: la clase se le cuenta a quien la
-- dio ese día (`class_occurrences.teacher_id`), porque eso lo sigue
-- poniendo `sesiones_dictadas`. Las horas, el mensual y los ajustes no
-- cambian: `liquidacion()` es la de la 0065 con una sola cosa distinta,
-- de dónde salen las clases.
--
-- LAS RESERVAS QUE NO CAEN EN LA GRILLA
--
-- `sesiones_dictadas` arma las fechas con la grilla de HOY: el día de la
-- semana actual de cada clase activa. Si el estudio pasa una clase de los
-- jueves a los miércoles, o la da de baja, los jueves en que se dio con
-- gente ya no salen en ninguna fila. Con la grilla entera eso casi no se
-- notaba —se pagaba la misma cantidad, en otras fechas—; con la regla, esas
-- clases se dejarían de pagar sin que nadie lo vea.
--
-- No se pagan solas: una reserva vieja que quedó en un día al que la
-- clase ya no va también "cae fuera", y pagarla sería pagar una clase que
-- no se dio. `clases_a_pagar` las devuelve aparte (`en_grilla = false`,
-- nunca `cuenta`) para que la pantalla las muestre, y si se dieron se
-- pagan con un ajuste. La solución de fondo es guardar la historia de la
-- grilla, y no entra acá.
--
-- LO CERRADO NO SE MUEVE
--
-- `teacher_settlements` guarda el total congelado y esta migración no lo
-- toca ni lo recalcula: no hay un solo `update` ni `insert` sobre esa
-- tabla. Lo único que puede cambiar sobre una cerrada es el "hoy daría"
-- de `liquidaciones_cerradas`, que se calcula al leer: si alguna se
-- hubiera cerrado con la regla vieja, la pantalla mostraría la
-- diferencia, que es para lo que está. Al 05/10 no hay ninguna.
--
-- UN PERÍODO SE CIERRA CUANDO TERMINÓ
--
-- Hasta la 0090 la liquidación sólo miraba la grilla, que no cambia en el
-- día. Con la regla, la parte por clase depende de las reservas en el
-- momento de calcular: cerrar a mediodía un período que llega hasta hoy
-- dejaba afuera las clases de la tarde que todavía no tenían a nadie, y
-- pagaba las que tenían una reserva que después se cancela a tiempo. Y
-- una vez cerrado ese día no se puede volver a liquidar (0055).
--
-- Así que, mientras rige la regla, la base no deja cerrar un período que
-- llega hasta hoy o después. Es un disparador nuevo sobre
-- `teacher_settlements`, y no un cambio en `cerrar_liquidacion` ni en
-- `cerrar_liquidaciones`: ésas son de la familia de la 0054 y la 0055,
-- que no entraron al registro, y pisarlas a ciegas es lo que hizo cortar
-- a la 0084. Un disparador aparte no pisa nada, y frena por los dos
-- caminos. Lo que se carga DESPUÉS de cerrar un período ya pasado —una
-- asistencia que recepción anota tarde— lo sigue mostrando el "hoy daría"
-- de las cerradas, como cualquier otra carga tardía.
--
-- ANTES DE CORRERLA: PRIMERO EL DEPLOY, Y EL PREVUELO
--
-- La pantalla de Personal de antes de esto dice "sale de las clases que
-- figuran dictadas en la agenda", y con la 0091 corrida eso sería falso.
-- La nueva anda con las dos bases: sin `clases_a_pagar` explica la regla
-- de antes y se comporta como hoy. Así que el orden es: mergear a main,
-- esperar el deploy de Vercel, y recién ahí correr esto.
--
-- Y antes de correrla, el prevuelo (`prevuelo-0091.sql`, una sola
-- consulta que sólo lee). El 27/09 la 0084 cortó porque
-- `guard_periodo_liquidacion` en producción no era la de la 0055 del
-- repo: la 0054 y la 0055 nunca entraron al registro, y `liquidacion` y
-- `sesiones_dictadas` son de la misma familia. El punto 0 de abajo
-- compara igual antes de pisar, pero el prevuelo lo dice sin abrir una
-- transacción y trae la definición viva si no coincide.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase, DESPUÉS
-- del deploy. REQUIERE la 0012, la 0020, la 0024, la 0053, la 0054, la
-- 0065, la 0073, la 0076 y la 0081.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 0. EL CHEQUEO ANTES DE PISAR NADA
--
-- `liquidacion` se reescribe a partir de su última definición, la de la
-- 0065 (la 0084 no la tocó: redefinió `cerrar_liquidacion`, que la llama
-- y no cambia). Si después alguien la redefinió —en otra migración o a
-- mano en el SQL Editor—, pegar esta copia deshace ese cambio sin
-- avisar: `create or replace` no compara nada. Por eso se mira que la
-- versión viva sea la de antes (primera vez) o ésta (si se vuelve a
-- correr), y si no es ninguna, corta.
--
-- `sesiones_dictadas` no se pisa, pero la liquidación nueva se apoya en
-- ella y en lo que hace hoy (sacar las suspendidas, poner a quien dio la
-- clase ese día): tiene que ser la de la 0073. Y `clases_a_pagar` y
-- `guard_liquidacion_terminada` son nuevas: no tienen que existir, o
-- tienen que ser éstas.
--
-- Se compara el código entero por su huella, como en la 0086: el md5 del
-- cuerpo sin los comentarios y con los espacios juntados. Los
-- comentarios quedan afuera porque la copia viva puede no ser letra por
-- letra la del repo, y lo que importa es que el código sea el mismo.
--
-- Para mirarlo antes de correr nada está el prevuelo; a mano (sólo lee):
--
--   select p.oid::regprocedure,
--          md5(btrim(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
--     from pg_proc p
--    where p.oid in ('public.liquidacion(date, date)'::regprocedure,
--                    'public.sesiones_dictadas(date, date)'::regprocedure);
--
-- Las huellas se anotan una sola vez, acá, y el punto 8 comprueba que
-- `esta` es la de lo que esta migración crea.
--
-- Lo mismo con la lista de grupos de `studio_settings`: es una lista
-- cerrada (0020) y para sumar 'personal' hay que reescribirla entera. Si
-- la viva no es la de la 0020 —o ésta—, reescribirla podría sacarle un
-- grupo que alguien agregó a mano.
-- ------------------------------------------------------------

create temp table huellas_0091 (
  firma  text primary key,
  origen text not null,
  -- null: la crea esta migración, así que puede no existir.
  antes  text,
  esta   text not null
) on commit drop;
insert into huellas_0091 values
  ('public.liquidacion(date, date)',       '0065', '893e17fa31f0e35ccb026a121592129d', '5559d62bf5f740133073127aef0f0813'),
  ('public.clases_a_pagar(date, date)',    '0091', null,                               'ef72163ce1c9857dcc0a64d9a9280bd4'),
  ('public.guard_liquidacion_terminada()', '0091', null,                               '41551616d16d4434d08ab9fa8cbc0d0a'),
  -- No se pisa: `antes` y `esta` son la misma.
  ('public.sesiones_dictadas(date, date)', '0073', '1d19b517e04172a4f1bde66b6da0d387', '1d19b517e04172a4f1bde66b6da0d387');

create temp table grupos_0091 (
  origen text primary key,
  def    text not null
) on commit drop;
insert into grupos_0091 values
  ('0020', 'CHECK ((group_key = ANY (ARRAY[''estudio''::text, ''reservas''::text, ''membresias''::text, ''cobros''::text, ''avisos''::text, ''caja''::text, ''gastos''::text, ''general''::text])))'),
  ('0091', 'CHECK ((group_key = ANY (ARRAY[''estudio''::text, ''reservas''::text, ''membresias''::text, ''cobros''::text, ''avisos''::text, ''caja''::text, ''gastos''::text, ''personal''::text, ''general''::text])))');

-- Lo que el resto de la migración necesita recordar entre bloques.
create temp table sesion_0091 (
  -- true: la `liquidacion` viva era la de la 0065, o sea que es la
  -- primera vez y hay un "antes" contra el cual comparar (punto 7).
  primera     boolean not null,
  -- La cuenta admin con la que se calcula la liquidación para comparar.
  admin       uuid,
  -- Lo que tenía la sesión del SQL Editor, para dejárselo como estaba.
  prev_sub    text,
  prev_claims text
) on commit drop;

do $guarda$
declare
  h      record;
  v_viva text;
  v_def  text;
begin
  if to_regprocedure('public.can(text)') is null then
    raise exception 'Falta public.can(). Revisar si corrió la 0012.';
  end if;

  if to_regprocedure('public.param(text, text)') is null then
    raise exception 'Falta public.param(). Revisar si corrió la 0020.';
  end if;

  if to_regprocedure('public.tarifa_vigente(uuid, text, date)') is null then
    raise exception 'Falta public.tarifa_vigente(). Revisar si corrió la 0053.';
  end if;

  if to_regclass('public.teacher_settlements') is null then
    raise exception 'Falta la tabla teacher_settlements. Revisar si corrió la 0054.';
  end if;

  if to_regclass('public.teacher_adjustments') is null
     or to_regprocedure('public.liquidacion(date, date)') is null then
    raise exception 'Falta la tabla teacher_adjustments o liquidacion(). Revisar si corrió la 0065.';
  end if;

  if to_regprocedure('public.sesiones_dictadas(date, date)') is null then
    raise exception 'Falta public.sesiones_dictadas(). Revisar si corrieron la 0051 y la 0073.';
  end if;

  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'studio_settings'
         and column_name in ('solo_admin', 'rige', 'encendible')) < 3 then
    raise exception 'Falta studio_settings.solo_admin, rige o encendible. Revisar si corrieron la 0020, la 0024 y la 0081.';
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'reservations'
                    and column_name = 'cancel_kind') then
    raise exception 'Falta reservations.cancel_kind. Revisar si corrieron la 0022 y la 0076.';
  end if;

  for h in select * from pg_temp.huellas_0091 loop
    select md5(btrim(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
      into v_viva
      from pg_proc p
     where p.oid = to_regprocedure(h.firma);

    if v_viva is null and h.antes is null then
      continue;  -- la crea esta migración
    end if;

    if v_viva is distinct from h.antes and v_viva is distinct from h.esta then
      if h.antes is null then
        raise exception
          '% ya existe y no es la de la 0091 (su huella es %): alguien la creó a mano o con otra migración, y pisarla desharía eso sin avisar. No se tocó nada. Para seguir hace falta esa versión: mandá el resultado de esta consulta, que sólo lee: select pg_get_functiondef(''%''::regprocedure);',
          h.firma, v_viva, h.firma;
      elsif h.antes is distinct from h.esta then
        raise exception
          '% no es la versión de la % ni la de la 0091 (su huella es %): la redefinió otra migración o se tocó a mano, y pisarla desharía ese cambio sin avisar. No se tocó nada. Para seguir hace falta la versión viva: mandá el resultado de esta consulta, que sólo lee: select pg_get_functiondef(''%''::regprocedure);',
          h.firma, h.origen, coalesce(v_viva, '(no existe)'), h.firma;
      else
        raise exception
          '% no es la versión de la % (su huella es %). Esta migración no la toca, pero la liquidación nueva se apoya en ella y en lo que hace. No se tocó nada. Para seguir hace falta la versión viva: mandá el resultado de esta consulta, que sólo lee: select pg_get_functiondef(''%''::regprocedure);',
          h.firma, h.origen, coalesce(v_viva, '(no existe)'), h.firma;
      end if;
    end if;
  end loop;

  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
   where c.conrelid = 'public.studio_settings'::regclass
     and c.conname = 'studio_settings_group_key_check';

  if v_def is null or v_def not in (select g.def from pg_temp.grupos_0091 g) then
    raise exception
      'La lista de grupos de studio_settings no es la de la 0020 ni la de la 0091 (es %): reescribirla podría sacar un grupo que alguien agregó. No se tocó nada. Mandá el resultado de esta consulta, que sólo lee: select pg_get_constraintdef(oid) from pg_constraint where conname = ''studio_settings_group_key_check'';',
      coalesce(v_def, '(no existe)');
  end if;

  insert into pg_temp.sesion_0091 (primera, prev_sub, prev_claims)
  select
    (select md5(btrim(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
       from pg_proc p where p.oid = 'public.liquidacion(date, date)'::regprocedure)
      = (select x.antes from pg_temp.huellas_0091 x where x.firma = 'public.liquidacion(date, date)'),
    current_setting('request.jwt.claim.sub', true),
    current_setting('request.jwt.claims', true);
end
$guarda$;

-- ------------------------------------------------------------
-- 1. LA FOTO DE ANTES
--
-- La liquidación de la 0065, tal cual responde hoy, para compararla en
-- el punto 7 con la nueva y el parámetro apagado: tienen que dar lo
-- mismo fila por fila. Tres períodos: el que dijo Matías (del 01/09 a
-- hoy), el mes en curso con dos meses para adelante —ahí hay reservas
-- futuras, que la regla nueva mira— y el año entero.
--
-- `liquidacion()` le contesta sólo a quien tiene `personal.remuneracion`,
-- y el SQL Editor no tiene sesión: `can()` da false. Así que, sólo para
-- calcular, se usa la sesión de una cuenta admin que tenga ese permiso y
-- `reportes.ver` (`sesiones_dictadas` lo pide desde la 0073). Es
-- `set_config(..., true)`: dura hasta el final de esta transacción, y se
-- deja como estaba apenas termina el cálculo.
-- ------------------------------------------------------------

create temp table rangos_0091 (
  rango int primary key,
  desde date not null,
  hasta date not null
) on commit drop;
insert into rangos_0091 values
  (1, date '2026-09-01', current_date),
  (2, date_trunc('month', current_date)::date, current_date + 60),
  (3, date '2026-01-01', date '2026-12-31');

create temp table foto_0091 (
  rango        int,
  teacher_id   uuid,
  profesora    text,
  clases       bigint,
  monto_clases numeric,
  horas        numeric,
  monto_horas  numeric,
  mensual      numeric,
  ajustes      numeric,
  ausencias    bigint,
  tardanzas    bigint,
  total        numeric
) on commit drop;

do $foto$
declare
  v_cand  uuid;
  v_admin uuid;
  v_s     record;
begin
  select * into v_s from pg_temp.sesion_0091;

  for v_cand in
    select p.id from public.profiles p where p.role = 'admin' order by p.created_at
  loop
    perform set_config('request.jwt.claim.sub', v_cand::text, true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_cand, 'role', 'authenticated')::text, true);
    if public.can('personal.remuneracion') and public.can('reportes.ver') then
      v_admin := v_cand;
      exit;
    end if;
  end loop;

  if v_admin is null then
    perform set_config('request.jwt.claim.sub', coalesce(v_s.prev_sub, ''), true);
    perform set_config('request.jwt.claims', coalesce(v_s.prev_claims, ''), true);
    raise exception 'No hay ninguna cuenta admin con personal.remuneracion y reportes.ver, y sin una no se puede comparar la liquidación de antes con la nueva. No se tocó nada.';
  end if;

  update pg_temp.sesion_0091 set admin = v_admin;

  insert into pg_temp.foto_0091
  select r.rango, l.*
    from pg_temp.rangos_0091 r
    cross join lateral public.liquidacion(r.desde, r.hasta) l;

  perform set_config('request.jwt.claim.sub', coalesce(v_s.prev_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(v_s.prev_claims, ''), true);
end
$foto$;

-- ------------------------------------------------------------
-- 2. EL GRUPO NUEVO DE CONFIGURACIÓN
--
-- La pantalla arma una sección por cada `group_key` que encuentra
-- (configuracion-page.tsx), así que con la fila alcanza para que
-- aparezca. Pero la lista de la base es cerrada desde la 0020 y hay que
-- sumarle 'personal'. El punto 0 ya comprobó que la viva es la de la
-- 0020 o ésta.
-- ------------------------------------------------------------

alter table public.studio_settings
  drop constraint if exists studio_settings_group_key_check;
alter table public.studio_settings
  add constraint studio_settings_group_key_check
  check (group_key in ('estudio', 'reservas', 'membresias', 'cobros',
                       'avisos', 'caja', 'gastos', 'personal', 'general'));

-- ------------------------------------------------------------
-- 3. EL PARÁMETRO
--
-- Prendido de entrada: es como trabaja hoy el estudio.
--
-- `rige = true` porque el código de esta misma entrega lo lee, y
-- `encendible = false` porque no hay nada que encender: el interruptor
-- es el valor, como en los demás booleanos (`absence_consumes_class`).
--
-- `solo_admin = true`: cambia cuánto se le paga al equipo, y es plata.
-- Desde la 0087 `config.editar` es sólo del admin, pero esto queda
-- cerrado también si mañana alguien le da esa clave a otra persona.
--
-- `on conflict do nothing` para que volver a correr la migración no pise
-- lo que el estudio haya elegido.
-- ------------------------------------------------------------

insert into public.studio_settings
  (key, value, kind, options, label, help, group_key, sort_order, is_public, solo_admin, rige, encendible)
values (
  'payroll_only_booked_classes', 'true', 'boolean', '{}',
  'Pagar sólo las clases con alguien anotado',
  'Prendido, cada clase se paga sólo si ese día tuvo al menos una reserva confirmada, una asistencia, una ausencia o una cancelación fuera de plazo. No se pagan las clases sin reservas, ni aquellas en las que todas las cancelaciones fueron a tiempo; la lista de espera no cuenta. Como las reservas cambian hasta que pasa la clase, un período se cierra recién cuando terminó: hasta ayer o antes. Apagado, se paga cada clase de la grilla que no se suspendió, haya o no reservas. Las liquidaciones ya cerradas no cambian.',
  'personal', 10, false, true, true, false
)
on conflict (key) do nothing;

-- ------------------------------------------------------------
-- 4. QUÉ CLASES SE PAGAN
--
-- Cada clase dictada del período —la de `sesiones_dictadas`, sin
-- cambiarle nada— con cuántas reservas la armaron, si se paga y, si no,
-- por qué. La liquidación suma las que se pagan; la pantalla de Personal
-- muestra el detalle.
--
-- Con la regla prendida devuelve además, con `en_grilla = false`, las
-- clases que tuvieron reservas en una fecha en que la grilla de hoy no
-- las tiene (ver "Las reservas que no caen en la grilla", arriba). Nunca
-- se pagan solas: están para que se vean. Con la regla apagada no
-- aparecen, y el detalle es el de siempre.
--
-- Pide la misma clave que la liquidación: el detalle de qué se le paga a
-- cada persona es parte de su remuneración. `sesiones_dictadas` pide
-- además `reportes.ver`, igual que hoy la liquidación.
--
-- Las reservas se cuentan acá y no de lo que puede leer quien pregunta:
-- es `security definer` como las demás de este módulo, y desde la 0058
-- hay roles que no leen las reservas de todas las clases. Si las contara
-- con los ojos de quien pregunta, una clase con gente podría salir "sin
-- nadie".
--
-- El orden termina en `class_id` para que sea total: la pantalla lo pide
-- de a mil filas (PostgREST corta ahí), y con dos clases a la misma hora y
-- con el mismo nombre una página podía repetir una y saltear otra.
-- ------------------------------------------------------------

create or replace function public.clases_a_pagar(p_desde date, p_hasta date)
returns table (
  class_id   uuid,
  fecha      date,
  titulo     text,
  hora       time,
  teacher_id uuid,
  profesora  text,
  -- Las reservas que armaron la clase (ver el encabezado). Se calcula
  -- igual con el parámetro apagado: es un dato, no la regla.
  reservas   bigint,
  -- false: tuvo reservas, pero esa fecha no está en la grilla de hoy.
  en_grilla  boolean,
  cuenta     boolean,
  -- Por qué no se paga; nulo si se paga.
  motivo     text
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_solo boolean;
begin
  if not public.can('personal.remuneracion') then
    raise exception 'No tenés permiso para ver las remuneraciones';
  end if;

  -- Sin la fila, 'false': la regla de antes. Ver el encabezado.
  v_solo := public.param('payroll_only_booked_classes', 'false') = 'true';

  return query
  with s as (
    select * from public.sesiones_dictadas(p_desde, p_hasta)
  ),
  armaron as (
    select r.class_id, r.date, count(*)::bigint as n
    from public.reservations r
    where r.date between p_desde and p_hasta
      and (
        r.status in ('confirmada', 'asistió', 'ausente')
        -- Avisó tarde: quien da la clase ya estaba en camino.
        or (r.status = 'cancelada' and r.cancel_kind = 'fuera de plazo')
      )
    group by r.class_id, r.date
  ),
  -- Reservas que arman una clase en una fecha que la grilla de hoy no
  -- tiene: la clase se cambió de día o se dio de baja. Sólo con la regla.
  fuera as (
    select a.class_id, a.date, a.n
    from armaron a
    where v_solo
      and not exists (
        select 1 from s x where x.class_id = a.class_id and x.fecha = a.date
      )
  )
  select
    s.class_id,
    s.fecha,
    s.titulo,
    s.hora,
    s.teacher_id,
    s.profesora,
    coalesce(a.n, 0),
    true,
    (not v_solo or coalesce(a.n, 0) > 0),
    case when v_solo and coalesce(a.n, 0) = 0 then 'nadie anotado' end
  from s
  left join armaron a on a.class_id = s.class_id and a.date = s.fecha

  union all

  -- Con la profesora y la hora de ese día, como `sesiones_dictadas`. Una
  -- fecha suspendida no es una clase que se dio, tampoco acá.
  select
    f.class_id,
    f.date,
    cs.title,
    coalesce(o.start_time, cs.start_time),
    coalesce(o.teacher_id, cs.teacher_id),
    coalesce(t.name, '—'),
    f.n,
    false,
    false,
    'no está en la grilla ese día'
  from fuera f
  join public.class_sessions cs on cs.id = f.class_id
  left join public.class_occurrences o
    on o.class_id = f.class_id and o.date = f.date
  left join public.teachers t
    on t.id = coalesce(o.teacher_id, cs.teacher_id)
  where coalesce(o.status, 'normal') <> 'suspendida'

  -- fecha, hora, título, clase
  order by 2, 4, 3, 1;
end;
$$;

comment on function public.clases_a_pagar(date, date) is
  'Cada clase dictada del período, con cuántas reservas la armaron y si se le paga a quien la dio (0091). La regla la pone payroll_only_booked_classes; apagado, se pagan todas. Con la regla, también las reservas que caen fuera de la grilla de hoy (en_grilla = false), que no se pagan.';

-- Supabase le da EXECUTE a anon a toda función nueva en public: se
-- revoca explícito, como a las demás del módulo.
revoke all on function public.clases_a_pagar(date, date) from public, anon;
grant execute on function public.clases_a_pagar(date, date) to authenticated;

-- ------------------------------------------------------------
-- 5. LA LIQUIDACIÓN
--
-- El cuerpo es el de la 0065 sin una coma de diferencia salvo el `from`
-- de las clases: se generó a partir del texto de esa migración, no se
-- transcribió. `create or replace` y no `drop`: no cambia ni la firma ni
-- lo que devuelve, así que conserva los permisos y quien la llama
-- (`cerrar_liquidacion`, `cerrar_liquidaciones`,
-- `liquidaciones_cerradas`) no se entera.
-- ------------------------------------------------------------

create or replace function public.liquidacion(p_desde date, p_hasta date)
returns table (
  teacher_id    uuid,
  profesora     text,
  clases        bigint,
  monto_clases  numeric,
  horas         numeric,
  monto_horas   numeric,
  mensual       numeric,
  ajustes       numeric,
  ausencias     bigint,
  tardanzas     bigint,
  total         numeric
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.can('personal.remuneracion') then
    raise exception 'No tenés permiso para ver las remuneraciones';
  end if;

  return query
  with clases as (
    select s.teacher_id,
           count(*)::bigint as n,
           -- Fila por fila, con la tarifa del día de esa clase.
           coalesce(sum(public.tarifa_vigente(s.teacher_id, 'por_clase', s.fecha)), 0) as monto
    -- Desde la 0091 las clases salen de `clases_a_pagar`: las mismas
    -- de `sesiones_dictadas`, con la regla del estudio sobre cuáles se
    -- pagan. Con el parámetro apagado `cuenta` es true en todas, y esto
    -- da lo mismo que antes.
    from public.clases_a_pagar(p_desde, p_hasta) s
    where s.teacher_id is not null
      and s.cuenta
    group by s.teacher_id
  ),
  horas as (
    select w.teacher_id,
           coalesce(sum(w.horas) filter (where w.tipo <> 'ausencia'), 0) as n,
           coalesce(sum(
             w.horas * public.tarifa_vigente(w.teacher_id, 'por_hora', w.fecha)
           ) filter (where w.tipo <> 'ausencia'), 0) as monto,
           count(*) filter (where w.tipo = 'ausencia')::bigint as aus,
           count(*) filter (where w.tipo = 'tardanza')::bigint as tar
    from public.staff_work_logs w
    where w.fecha between p_desde and p_hasta
    group by w.teacher_id
  ),
  -- Los ajustes del período (0065). Se suman como vienen: positivos
  -- suman, negativos restan.
  ajustes as (
    select a.teacher_id, coalesce(sum(a.monto), 0) as monto
    from public.teacher_adjustments a
    where a.fecha between p_desde and p_hasta
    group by a.teacher_id
  ),
  -- Los meses que toca el período, con cuántos de sus días entran (0064).
  meses as (
    select
      g::date as mes_inicio,
      (g + interval '1 month' - interval '1 day')::date as mes_fin,
      greatest(g::date, p_desde) as desde_cubierto,
      least((g + interval '1 month' - interval '1 day')::date, p_hasta) as hasta_cubierto
    from generate_series(
      date_trunc('month', p_desde::timestamp),
      date_trunc('month', p_hasta::timestamp),
      interval '1 month'
    ) as g
  ),
  mensual_prorrateado as (
    select t.id as teacher_id,
           round(coalesce(sum(
             -- La tarifa que regía al terminar el tramo de ESE mes.
             public.tarifa_vigente(t.id, 'mensual', m.hasta_cubierto)
               * ((m.hasta_cubierto - m.desde_cubierto + 1)::numeric
                  / (m.mes_fin - m.mes_inicio + 1))
           ), 0), 2) as monto
    from public.teachers t
    cross join meses m
    group by t.id
  )
  select
    t.id,
    t.name,
    coalesce(c.n, 0),
    coalesce(c.monto, 0),
    coalesce(h.n, 0),
    coalesce(h.monto, 0),
    coalesce(mp.monto, 0),
    coalesce(aj.monto, 0),
    coalesce(h.aus, 0),
    coalesce(h.tar, 0),
    coalesce(c.monto, 0) + coalesce(h.monto, 0) + coalesce(mp.monto, 0)
      + coalesce(aj.monto, 0)
  from public.teachers t
  left join clases c on c.teacher_id = t.id
  left join horas  h on h.teacher_id = t.id
  left join ajustes aj on aj.teacher_id = t.id
  left join mensual_prorrateado mp on mp.teacher_id = t.id
  -- Una profesora que se fue en marzo tiene que aparecer en la
  -- liquidación de marzo: se filtra por la fecha de baja y no por
  -- `active`, que es la baja del catálogo y no la laboral.
  where (t.fecha_baja is null or t.fecha_baja >= p_desde)
    and (t.active or t.fecha_baja is not null)
  order by t.name;
end;
$$;

revoke all on function public.liquidacion(date, date) from public, anon;
grant execute on function public.liquidacion(date, date) to authenticated;

-- ------------------------------------------------------------
-- 6. UN PERÍODO SE CIERRA CUANDO TERMINÓ
--
-- Ver el encabezado. Mientras rige la regla, no entra un cierre cuyo
-- "hasta" sea hoy o un día que no llegó: las clases de esos días todavía
-- pueden sumar o perder reservas, y lo cerrado no se mueve después. Con
-- la regla apagada no frena nada, como hasta hoy.
--
-- Sólo al insertar, que es cerrar: pagar y anular son `update` sobre una
-- fila que ya pasó por acá. El día es el del estudio, no el del servidor
-- (0016). Lo frena la base y no sólo la pantalla: `cerrar_liquidaciones`
-- se puede llamar con cualquier período.
-- ------------------------------------------------------------

create or replace function public.guard_liquidacion_terminada()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if new.hasta >= v_hoy
     and public.param('payroll_only_booked_classes', 'false') = 'true' then
    raise exception
      'El período llega hasta el % y todavía no terminó. Como se pagan sólo las clases con alguien anotado, las de hoy y las que vienen todavía pueden sumar o perder reservas, y lo cerrado ya no se mueve. Cerralo hasta el % o antes, o esperá a que pase el %.',
      to_char(new.hasta, 'DD/MM/YYYY'),
      to_char(v_hoy - 1, 'DD/MM/YYYY'),
      to_char(new.hasta, 'DD/MM/YYYY');
  end if;

  return new;
end;
$$;

-- No se llama sola (una función de disparador no se puede invocar
-- directo), pero Supabase le da EXECUTE a anon a toda función nueva.
revoke all on function public.guard_liquidacion_terminada() from public, anon;

drop trigger if exists teacher_settlements_terminado on public.teacher_settlements;
create trigger teacher_settlements_terminado
  before insert on public.teacher_settlements
  for each row execute function public.guard_liquidacion_terminada();

-- ------------------------------------------------------------
-- 7. APAGADO, DA LO MISMO QUE ANTES
--
-- La comprobación que pidió Matías: con el parámetro apagado, la
-- liquidación nueva tiene que dar exactamente la foto del punto 1, fila
-- por fila y en los tres períodos. Si no, corta y no queda nada.
--
-- Se apaga en serio —la misma fila que lee la función— y se vuelve a
-- dejar como estaba, todo dentro de esta transacción. La escritura va
-- con la sesión que traía el editor —ninguna, en el SQL Editor— y no con
-- la de la cuenta admin prestada, así que el sello de la fila
-- (`updated_by`) queda nulo, como el de una recién creada, y no a nombre
-- de alguien que no la tocó. Sólo la primera vez: si la
-- `liquidacion` viva ya era ésta, no hay un "antes" contra el cual
-- comparar, y se comprueba sólo que la nueva dé lo mismo que la viva con
-- el parámetro como está.
--
-- Y al final deja el resumen de lo que cambia con la regla como queda,
-- que se muestra después del commit. "Toda la grilla" se calcula de las
-- mismas clases con la tarifa de cada día, sin mirar la regla, así que
-- dice lo mismo la primera vez que si se vuelve a correr. Las reservas
-- que caen fuera de la grilla van en su columna y no suman a "toda la
-- grilla": no estaban en ella.
-- ------------------------------------------------------------

drop table if exists pg_temp.resumen_0091;
-- Sin `on commit drop`: se lee después del commit, en el último select.
create temp table resumen_0091 (
  profesora                  text,
  periodo                    text,
  clases_grilla              bigint,
  clases_que_se_pagan        bigint,
  sin_nadie_anotado          bigint,
  reservas_fuera_de_grilla   bigint,
  por_clases_toda_la_grilla  numeric,
  por_clases_con_la_regla    numeric,
  total_toda_la_grilla       numeric,
  total_con_la_regla         numeric
);

do $compara$
declare
  v_s     record;
  v_valor text;
  v_n     bigint;
begin
  select * into v_s from pg_temp.sesion_0091;

  if v_s.primera then
    select s.value into v_valor
      from public.studio_settings s where s.key = 'payroll_only_booked_classes';
    update public.studio_settings set value = 'false'
     where key = 'payroll_only_booked_classes';
  end if;

  perform set_config('request.jwt.claim.sub', v_s.admin::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_s.admin, 'role', 'authenticated')::text, true);

  select count(*) into v_n from (
    (select * from pg_temp.foto_0091
     except all
     select r.rango, l.* from pg_temp.rangos_0091 r
       cross join lateral public.liquidacion(r.desde, r.hasta) l)
    union all
    (select r.rango, l.* from pg_temp.rangos_0091 r
       cross join lateral public.liquidacion(r.desde, r.hasta) l
     except all
     select * from pg_temp.foto_0091)
  ) d;

  if v_n > 0 then
    raise exception
      'Con el parámetro apagado, la liquidación nueva no da lo mismo que la de antes (% filas distintas entre los tres períodos). No se tocó nada.',
      v_n;
  end if;

  if v_s.primera then
    perform set_config('request.jwt.claim.sub', coalesce(v_s.prev_sub, ''), true);
    perform set_config('request.jwt.claims', coalesce(v_s.prev_claims, ''), true);
    update public.studio_settings set value = v_valor
     where key = 'payroll_only_booked_classes';
    perform set_config('request.jwt.claim.sub', v_s.admin::text, true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_s.admin, 'role', 'authenticated')::text, true);
  end if;

  -- El resumen: del 01/09 a hoy, con la regla como queda.
  insert into pg_temp.resumen_0091
  with r as (
    select * from pg_temp.rangos_0091 where rango = 1
  ),
  grilla as (
    select c.teacher_id,
           count(*) filter (where c.en_grilla)::bigint as n,
           count(*) filter (where c.en_grilla and not c.cuenta)::bigint as sin_nadie,
           count(*) filter (where not c.en_grilla)::bigint as fuera,
           coalesce(sum(public.tarifa_vigente(c.teacher_id, 'por_clase', c.fecha))
                      filter (where c.en_grilla), 0) as monto
    from r cross join lateral public.clases_a_pagar(r.desde, r.hasta) c
    group by c.teacher_id
  )
  select
    l.profesora,
    to_char(r.desde, 'DD/MM/YYYY') || ' al ' || to_char(r.hasta, 'DD/MM/YYYY'),
    coalesce(g.n, 0),
    l.clases,
    coalesce(g.sin_nadie, 0),
    coalesce(g.fuera, 0),
    coalesce(g.monto, 0),
    l.monto_clases,
    l.total - l.monto_clases + coalesce(g.monto, 0),
    l.total
  from r
  cross join lateral public.liquidacion(r.desde, r.hasta) l
  left join grilla g on g.teacher_id = l.teacher_id;

  perform set_config('request.jwt.claim.sub', coalesce(v_s.prev_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(v_s.prev_claims, ''), true);
end
$compara$;

-- ------------------------------------------------------------
-- 8. LAS HUELLAS, COMPROBADAS
--
-- Lo que se acaba de crear tiene que tener las huellas que anota el
-- punto 0: si no, la próxima vez que se corra esta migración no
-- reconocería su propia versión y cortaría.
-- ------------------------------------------------------------

do $$
declare
  h      record;
  v_viva text;
begin
  for h in select * from pg_temp.huellas_0091 loop
    select md5(btrim(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
      into v_viva
      from pg_proc p
     where p.oid = to_regprocedure(h.firma);
    if v_viva is distinct from h.esta then
      raise exception
        'La huella de % es % y el punto 0 anota %. Si se cambió el código de la función, hay que anotar la nueva ahí.',
        h.firma, v_viva, h.esta;
    end if;
  end loop;
end $$;

commit;

-- Lo que cambia con la regla como quedó, del 01/09 a hoy. Sólo lee.
select * from resumen_0091 order by profesora;

-- ============================================================
-- CÓMO VERIFICAR
--
-- 0. Que esté hecho el deploy de la pantalla nueva (ver el encabezado).
--
-- 1. Lo que la migración ya comprobó al correr, para verlo: el último
--    select muestra, por profesora y del 01/09 a hoy, cuántas clases
--    tiene la grilla, cuántas se pagan y cuántas no por no tener a nadie,
--    cuántas reservas cayeron fuera de la grilla, y el monto por clases y
--    el total pagando toda la grilla y con la regla. Con los datos del 05/10, del 01/10 al 03/10 la grilla daba 28
--    clases y tienen que quedar sólo las del 01/10 y la del 03/10 que
--    tuvieron reservas. Si se vuelve a correr, muestra lo mismo.
--
-- 2. Por la pantalla, con la sesión del admin: Personal → Liquidación
--    del período, "Este mes". La columna Clases dice cuántas se pagan y
--    cuántas quedaron afuera "sin nadie"; el detalle de cada fila las
--    lista con el motivo, y el texto de abajo explica la regla.
--
-- 3. Configuración → Reglas del negocio → Personal y liquidación:
--    apagar "Pagar sólo las clases con alguien anotado", guardar, y la
--    liquidación vuelve a contar toda la grilla. Volver a prenderlo.
--
-- 3b. Con "Este mes" (llega hasta hoy), la columna del botón dice que el
--    período no terminó y "Cerrar el período de todos" no se ofrece. Lo
--    frena la base igual. Para verlo sin cerrar nada: este insert tiene
--    que fallar con "El período llega hasta el … y todavía no terminó", y
--    el rollback deja todo como estaba.
--
--      begin;
--      insert into public.teacher_settlements (teacher_id, desde, hasta, total)
--      select id, current_date + 1, current_date + 1, 1 from public.teachers limit 1;
--      rollback;
--
-- 4. Lo cerrado, intacto (hoy no hay ninguna, así que tiene que dar 0):
--
--    select count(*) from public.teacher_settlements;
--
-- PARA VOLVER ATRÁS
--
-- Todo junto, en una transacción. Primero la liquidación, que es la que
-- llama a `clases_a_pagar`; después la función, el freno de los cierres,
-- el parámetro y la lista de grupos (ninguna fila queda en 'personal' una
-- vez borrado el parámetro). La pantalla nueva no depende del orden: sin
-- `clases_a_pagar` vuelve a explicar la regla de antes.
--
--   begin;
--
--   -- a) `liquidacion` como la dejó la 0065, letra por letra:
--
--   create or replace function public.liquidacion(p_desde date, p_hasta date)
--   returns table (
--     teacher_id    uuid,
--     profesora     text,
--     clases        bigint,
--     monto_clases  numeric,
--     horas         numeric,
--     monto_horas   numeric,
--     mensual       numeric,
--     ajustes       numeric,
--     ausencias     bigint,
--     tardanzas     bigint,
--     total         numeric
--   )
--   language plpgsql stable security definer set search_path = ''
--   as $$
--   #variable_conflict use_column
--   begin
--     if not public.can('personal.remuneracion') then
--       raise exception 'No tenés permiso para ver las remuneraciones';
--     end if;
--
--     return query
--     with clases as (
--       select s.teacher_id,
--              count(*)::bigint as n,
--              -- Fila por fila, con la tarifa del día de esa clase.
--              coalesce(sum(public.tarifa_vigente(s.teacher_id, 'por_clase', s.fecha)), 0) as monto
--       from public.sesiones_dictadas(p_desde, p_hasta) s
--       where s.teacher_id is not null
--       group by s.teacher_id
--     ),
--     horas as (
--       select w.teacher_id,
--              coalesce(sum(w.horas) filter (where w.tipo <> 'ausencia'), 0) as n,
--              coalesce(sum(
--                w.horas * public.tarifa_vigente(w.teacher_id, 'por_hora', w.fecha)
--              ) filter (where w.tipo <> 'ausencia'), 0) as monto,
--              count(*) filter (where w.tipo = 'ausencia')::bigint as aus,
--              count(*) filter (where w.tipo = 'tardanza')::bigint as tar
--       from public.staff_work_logs w
--       where w.fecha between p_desde and p_hasta
--       group by w.teacher_id
--     ),
--     -- Los ajustes del período (0065). Se suman como vienen: positivos
--     -- suman, negativos restan.
--     ajustes as (
--       select a.teacher_id, coalesce(sum(a.monto), 0) as monto
--       from public.teacher_adjustments a
--       where a.fecha between p_desde and p_hasta
--       group by a.teacher_id
--     ),
--     -- Los meses que toca el período, con cuántos de sus días entran (0064).
--     meses as (
--       select
--         g::date as mes_inicio,
--         (g + interval '1 month' - interval '1 day')::date as mes_fin,
--         greatest(g::date, p_desde) as desde_cubierto,
--         least((g + interval '1 month' - interval '1 day')::date, p_hasta) as hasta_cubierto
--       from generate_series(
--         date_trunc('month', p_desde::timestamp),
--         date_trunc('month', p_hasta::timestamp),
--         interval '1 month'
--       ) as g
--     ),
--     mensual_prorrateado as (
--       select t.id as teacher_id,
--              round(coalesce(sum(
--                -- La tarifa que regía al terminar el tramo de ESE mes.
--                public.tarifa_vigente(t.id, 'mensual', m.hasta_cubierto)
--                  * ((m.hasta_cubierto - m.desde_cubierto + 1)::numeric
--                     / (m.mes_fin - m.mes_inicio + 1))
--              ), 0), 2) as monto
--       from public.teachers t
--       cross join meses m
--       group by t.id
--     )
--     select
--       t.id,
--       t.name,
--       coalesce(c.n, 0),
--       coalesce(c.monto, 0),
--       coalesce(h.n, 0),
--       coalesce(h.monto, 0),
--       coalesce(mp.monto, 0),
--       coalesce(aj.monto, 0),
--       coalesce(h.aus, 0),
--       coalesce(h.tar, 0),
--       coalesce(c.monto, 0) + coalesce(h.monto, 0) + coalesce(mp.monto, 0)
--         + coalesce(aj.monto, 0)
--     from public.teachers t
--     left join clases c on c.teacher_id = t.id
--     left join horas  h on h.teacher_id = t.id
--     left join ajustes aj on aj.teacher_id = t.id
--     left join mensual_prorrateado mp on mp.teacher_id = t.id
--     -- Una profesora que se fue en marzo tiene que aparecer en la
--     -- liquidación de marzo: se filtra por la fecha de baja y no por
--     -- `active`, que es la baja del catálogo y no la laboral.
--     where (t.fecha_baja is null or t.fecha_baja >= p_desde)
--       and (t.active or t.fecha_baja is not null)
--     order by t.name;
--   end;
--   $$;
--
--   revoke all on function public.liquidacion(date, date) from public, anon;
--   grant execute on function public.liquidacion(date, date) to authenticated;
--
--   -- b) Lo demás:
--   drop function if exists public.clases_a_pagar(date, date);
--   drop trigger if exists teacher_settlements_terminado on public.teacher_settlements;
--   drop function if exists public.guard_liquidacion_terminada();
--   delete from public.studio_settings where key = 'payroll_only_booked_classes';
--   alter table public.studio_settings
--     drop constraint if exists studio_settings_group_key_check;
--   alter table public.studio_settings
--     add constraint studio_settings_group_key_check
--     check (group_key in ('estudio', 'reservas', 'membresias', 'cobros',
--                          'avisos', 'caja', 'gastos', 'general'));
--
--   commit;
--
-- Ojo: volver atrás vuelve a pagar las clases sin nadie, y el "hoy
-- daría" de una liquidación cerrada mientras regía esto va a mostrar la
-- diferencia.
-- ============================================================
