-- ============================================================
-- 0028 — La clase se descuenta al reservar
--
-- Hasta hoy el descuento de la clase lo hace el NAVEGADOR: markAttendance
-- en lib/api.ts marca 'asistió' y después, en una segunda llamada, suma
-- uno a memberships.classes_used. Eso significa tres cosas incómodas:
--
--   · si la segunda llamada no sale —se cortó internet, se cerró la
--     pestaña, el update rebotó— la clase queda marcada y sin cobrar;
--   · el contador se puede escribir desde cualquier lado, sin que nada
--     diga contra qué reservas se formó ese número;
--   · las cuatro reglas que la clienta pidió (descontar al reservar,
--     devolver si cancela en plazo, no devolver si cancela tarde, no
--     cobrarle lo que el estudio suspendió) no tienen dónde vivir.
--
-- Esta migración muda la regla a la base. Y la decisión que sostiene todo
-- lo demás es que EL CONSUMO ES UN ESTADO, NO UN EVENTO:
--
--     classes_used = classes_used_base + (reservas de esa membresía
--                                         que hoy consumen una clase)
--
-- No hay ningún `classes_used + 1` en ningún lado. Hay una cuenta que se
-- vuelve a hacer entera cada vez que una reserva cambia. De ahí salen
-- gratis las propiedades que más importan:
--
--   · aplicar la operación dos veces da el mismo número, así que el
--     doble cobro deja de ser un riesgo y pasa a ser imposible;
--   · devolver una clase no es restar: es que la fila deje de contar,
--     y como membership_id se sella UNA VEZ y NO SE BORRA NUNCA, la
--     devolución siempre cae en la membresía que la pagó, aunque la
--     clienta haya renovado entre medio;
--   · el número se puede auditar: consumo_control() tiene que dar cero
--     filas, igual que perm_diff() y caja_control().
--
-- NACE APAGADA. El interruptor es la columna `rige` de la fila
-- class_consumption, la misma que la 0024 creó para decir "el código
-- todavía no lee este parámetro". Mientras esté en false, esta migración
-- no cambia absolutamente nada: ni descuenta, ni devuelve, ni bloquea, ni
-- protege el contador. Encenderla es un update de una fila, sin deploy, y
-- apagarla también. El bloque de ENCENDIDO está al final del archivo.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Leer un parámetro numérico sin que una letra trabe el estudio
--
-- param() devuelve texto. 'tres'::numeric adentro de un trigger levanta
-- una excepción, y ese trigger está en el camino de cancelar una reserva:
-- una letra de más tipeada en Configuración dejaría al estudio sin poder
-- cancelar, un viernes a la noche, sin ninguna pista de por qué.
--
-- Lo ilegible se trata como ausente y manda el default. La clienta ve un
-- valor raro en la pantalla; el sistema sigue andando.
-- ------------------------------------------------------------
create or replace function public.param_num(p_key text, p_default numeric)
returns numeric
language plpgsql stable security definer set search_path = ''
as $$
declare v text;
begin
  v := public.param(p_key, '');
  if v is null or btrim(v) = '' then
    return p_default;
  end if;
  begin
    return v::numeric;
  exception when others then
    return p_default;
  end;
end;
$$;

revoke all on function public.param_num(text, numeric) from public, anon;
grant execute on function public.param_num(text, numeric) to authenticated;

-- ------------------------------------------------------------
-- 2. El interruptor
--
-- Se reusa `rige` de class_consumption en vez de inventar un parámetro
-- nuevo, porque 0024 le dio a esa columna exactamente este significado:
-- "la fila existe y el código todavía no la lee". Así el cartel que la
-- pantalla de Configuración ya muestra es cierto por construcción, en vez
-- de ser una segunda verdad que hay que acordarse de sincronizar.
--
-- Si la fila no existiera, devuelve false: apagado es el estado seguro.
-- ------------------------------------------------------------
create or replace function public.consumo_rige()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select s.rige from public.studio_settings s where s.key = 'class_consumption'),
    false)
$$;

revoke all on function public.consumo_rige() from public, anon;
grant execute on function public.consumo_rige() to authenticated;

-- ------------------------------------------------------------
-- 3. El resto que la cuenta no explica
--
-- classes_used deja de ser un número suelto y pasa a ser el resultado de
-- una suma. Pero las reservas viejas no alcanzan para reconstruirlo: el
-- código del navegador cobraba contra la membresía vigente HOY, no contra
-- la del día de la clase, y se frenaba al llegar al total. Reconstruir
-- ese pasado sería inventarlo.
--
-- Entonces el pasado se congela acá y la cuenta arranca de cero desde el
-- encendido. classes_used_base es el saldo de apertura, igual que el
-- asiento de apertura de una caja: no se justifica, se declara.
-- ------------------------------------------------------------
alter table public.memberships
  add column if not exists classes_used_base int not null default 0;

comment on column public.memberships.classes_used_base is
  'Saldo de apertura: las clases que ya estaban descontadas cuando el motor se encendió y que ninguna reserva explica. classes_used = classes_used_base + las reservas que consumen.';

-- El ancla inicial. El encendido la vuelve a tomar, porque entre esta
-- migración y ese momento el navegador sigue moviendo el contador.
update public.memberships set classes_used_base = classes_used;

alter table public.memberships
  add constraint memberships_base_no_negativa check (classes_used_base >= 0);

-- ------------------------------------------------------------
-- 4. La cancelación que no es culpa de la clienta
--
-- La 0022 dejó cancel_kind con dos valores. Falta el tercero, que es una
-- categoría distinta y no un matiz de los otros dos: cuando el estudio
-- suspende la clase, no importa con cuántas horas se avisó ni cuántos
-- recuperos le quedan. No pierde la clase, y esa devolución NO gasta el
-- cupo de recuperos del mes.
--
-- Sigue sin ser un estado: el estado es 'cancelada'. La 0022 explicó por
-- qué (el WITH CHECK de "alumno cancela" y la rama else de la restrictiva
-- de 0013), y esa razón no cambió.
-- ------------------------------------------------------------
do $$
declare v_nombre text;
begin
  select conname into v_nombre
  from pg_constraint
  where conrelid = 'public.reservations'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%fuera de plazo%';

  if v_nombre is null then
    raise exception 'No se encontró el CHECK de cancel_kind en reservations: revisar antes de seguir';
  end if;

  execute format('alter table public.reservations drop constraint %I', v_nombre);
end $$;

alter table public.reservations
  add constraint reservations_cancel_kind_check
  check (cancel_kind in ('en plazo', 'fuera de plazo', 'suspendida'));

-- ------------------------------------------------------------
-- 5. Los parámetros que faltaban
--
-- Nacen sin regir, como los tres de 0024 que esta migración va a
-- encender: hasta el encendido, la pantalla tiene que seguir diciendo la
-- verdad.
--
-- reserva_exige_membresia existe aparte de class_consumption porque son
-- dos decisiones distintas que se encenderían juntas por accidente:
-- "cuándo se descuenta la clase" y "si se puede anotar a alguien que no
-- tiene clases". La segunda es la que puede trabar el mostrador un lunes
-- a la mañana, y tiene que poder apagarse sola.
--
-- consumo_protege_contador es el freno de mano del punto 13. Vive en la
-- tabla y no en un comentario porque un escape que solo existe en el
-- código fuente no lo encuentra nadie a las ocho de la noche.
-- ------------------------------------------------------------
insert into public.studio_settings
  (key, value, kind, options, label, help, group_key, sort_order, is_public, rige)
values
  ('recoveries_per_month', '2', 'number', '{}',
   'Recuperos por mes',
   'Cuántas clases canceladas en plazo se le devuelven por mes de membresía. Las que el estudio suspende no cuentan para este tope.',
   'reservas', 50, false, false),

  ('reserva_exige_membresia', 'true', 'boolean', '{}',
   'No se puede reservar sin clases disponibles',
   'Si está encendido, el sistema rechaza anotar a alguien sin membresía vigente para esa fecha o sin clases disponibles. Quien tenga el permiso de excepción puede pasar igual, dejando el motivo escrito.',
   'reservas', 60, false, false),

  ('consumo_protege_contador', 'true', 'boolean', '{}',
   'Proteger el contador de clases',
   'Si está encendido, el contador de clases usadas solo lo puede escribir el sistema a partir de las reservas. Apagarlo solo tiene sentido para corregir a mano una membresía.',
   'reservas', 70, false, false)
on conflict (key) do nothing;

-- ------------------------------------------------------------
-- 6. La clave de la excepción (requerimiento 1.11)
--
-- "La profesora pide autorización a recepción para agregar a alguien."
-- legacy_roles = {admin,recepcion} es la verdad literal de hoy: es
-- exactamente quién puede crear una reserva (reservas.crear, 0012:332).
-- La alumna NO va en el conjunto a propósito: si estuviera, podría
-- autoperdonarse su propia falta de saldo mandando un motivo.
--
-- En sombra can() responde ese conjunto, así que la clave funciona desde
-- el primer día y perm_diff() sigue dando cero (patrón de la 0019).
-- ------------------------------------------------------------
insert into public.permission_keys
  (clave, etiqueta, ayuda, grupo, orden, tipo, legacy_roles)
values
  ('reservas.excepcion',
   'Anotar en una clase aunque no queden clases disponibles',
   'Requerimiento 1.11. Sin esta clave, el sistema rechaza la reserva de quien no tiene membresía vigente para esa fecha o se quedó sin clases. Con ella se pasa igual, pero el motivo queda escrito en la reserva y la clienta lo va a ver desde el portal (RLS filtra filas, no columnas).',
   'Reservas', 45, 'permiso', '{admin,recepcion}')
on conflict (clave) do nothing;

insert into public.role_permissions (role, clave)
select unnest(k.legacy_roles), k.clave
from public.permission_keys k
where k.clave = 'reservas.excepcion'
on conflict do nothing;

-- ------------------------------------------------------------
-- 7. Contra qué membresía se cobra
--
-- Contra la que cubre la FECHA DE LA CLASE, no la vigente hoy. El código
-- del navegador buscaba la vigente hoy, así que reservar el 28 para el 3
-- del mes que viene cobraba a la membresía equivocada — y el día que se
-- devolviera, la devolución caía en otra.
--
-- Una membresía suspendida no se cobra: la clienta está congelada, y
-- devolver "no hay membresía para esa fecha" es la respuesta correcta.
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
  order by m.end_date desc, m.start_date desc, m.created_at desc
  limit 1
$$;

revoke all on function public.membresia_para(uuid, date) from public, anon;

-- ------------------------------------------------------------
-- 8. El bloqueo que evita que dos reservas gasten la misma clase
--
-- Sin esto, dos reservas simultáneas de la misma clienta cuentan las dos
-- sobre la misma foto y descuentan UNA SOLA clase. Con el conteo, además,
-- la segunda pisaría el número de la primera.
--
-- Se bloquean TODAS las membresías de la clienta, siempre EN ORDEN DE id.
-- El conjunto y el orden dependen solo de student_id, así que dos
-- transacciones sobre la misma clienta se serializan y sobre clientas
-- distintas no se estorban. Si se bloqueara solo la membresía apuntada,
-- una devolución (que va a la vieja) y un cobro (que va a la nueva)
-- tomarían dos filas en orden distinto y se trabarían entre sí.
--
-- El bloqueo se toma SIEMPRE ANTES de contar. Al revés no sirve de nada.
-- ------------------------------------------------------------
create or replace function public.bloquear_alumna(p_student uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare r record;
begin
  if p_student is null then return; end if;
  for r in
    select m.id from public.memberships m
    where m.student_id = p_student
    order by m.id
  loop
    perform 1 from public.memberships m where m.id = r.id for update;
  end loop;
end;
$$;

revoke all on function public.bloquear_alumna(uuid) from public, anon;

-- ------------------------------------------------------------
-- 9. LA CUENTA
--
-- Cuántas clases consumen hoy las reservas de esta membresía. Es la única
-- definición de "consumir" que hay en el sistema; todo lo demás la
-- consulta. Es de solo lectura y es idempotente: llamarla mil veces da
-- mil veces el mismo número.
--
-- Las reglas, en el orden en que se aplican:
--
--   · Si el estudio suspendió esa fecha, NO consume. Nunca, sin importar
--     el estado. Esto cubre también la reserva que quedó 'confirmada'
--     sobre una fecha suspendida, porque la 0018 decidió que suspender no
--     cancela las reservas: la promesa "si suspende Casa Fé no pierde la
--     clase" queda siendo verdad AUNQUE NADIE SE ACUERDE DE CANCELAR
--     NADA.
--
--   · 'lista de espera' y 'ofrecida' no ocupan lugar y no consumen. La
--     0022 §2 ya avisó que 'ofrecida' tampoco cuenta para el cupo; esto
--     es coherente con eso y se revisa junto en el Paso 4.
--
--   · 'asistió' consume siempre, en los dos modos.
--   · 'ausente' consume si absence_consumes_class. Este parámetro estaba
--     en 'true' desde la 0011 sin que nadie lo leyera: recién acá empieza
--     a ser cierto.
--   · 'confirmada' consume solo en modo 'reserva'. En modo 'asistencia'
--     el sistema se comporta como se venía comportando.
--
--   · 'cancelada' solo puede consumir en modo 'reserva', porque en modo
--     'asistencia' nunca se le llegó a cobrar nada:
--       - 'fuera de plazo' → la pierde;
--       - 'suspendida'     → no la pierde, y no gasta cupo;
--       - 'en plazo'       → se le devuelve, HASTA EL TOPE DEL MES;
--       - sin clasificar   → cancelaciones anteriores a la regla: no
--                            consumen. No se les cobra en retroactivo.
--
-- EL TOPE DE 2 SE APLICA A LAS DEVOLUCIONES, NO A LOS RECUPEROS
--
-- La tentación era contar las reservas con recovers_reservation_id. No
-- sirve: mientras no existan horarios fijos, una reserva de recupero y
-- una reserva común son la misma fila, y nada obliga a declarar el
-- puntero. Un tope sobre "cuántas veces recuperás" se saltea reservando
-- normal. Peor: devolverle la clase y después prohibirle usarla le
-- mostraría "1 clase disponible" y la rechazaría al reservar.
--
-- Entonces el tope se aplica donde sí se sostiene: cuántas veces se le
-- DEVUELVE la clase dentro del mes de la membresía. La tercera
-- cancelación en plazo del mes ya no vuelve. Y "dentro del mes de la
-- membresía" sale gratis, porque la partición es membership_id y la
-- membresía se selló contra la fecha de la clase.
--
-- Se ordena por cancelled_at: las primeras dos del período son las que
-- vuelven. Deshacer una cancelación cambia el significado de la tercera
-- sin tocarla — que es exactamente por qué esto se deriva y no se guarda.
-- ------------------------------------------------------------
create or replace function public.consumo_contadas(p_membership uuid)
returns int
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_modo text;
  v_aus  boolean;
  v_tope int;
  v_n    int;
begin
  if p_membership is null then return 0; end if;

  v_modo := public.param('class_consumption', 'asistencia');
  v_aus  := public.param('absence_consumes_class', 'true') = 'true';
  v_tope := public.param_num('recoveries_per_month', 2)::int;

  with base as (
    select r.id,
           r.status,
           r.cancel_kind,
           r.cancelled_at,
           exists (
             select 1 from public.class_occurrences co
             where co.class_id = r.class_id
               and co.date = r.date
               and co.status = 'suspendida'
           ) as susp
    from public.reservations r
    where r.membership_id = p_membership
  ),
  ord as (
    select b.*,
           -- El row_number vale solo dentro del grupo de las devoluciones
           -- candidatas; en el resto de las filas no se mira.
           row_number() over (
             partition by (b.status = 'cancelada'
                           and b.cancel_kind = 'en plazo'
                           and not b.susp)
             order by b.cancelled_at nulls last, b.id
           ) as rn
    from base b
  )
  select count(*) into v_n
  from ord o
  where not o.susp
    and (
      o.status = 'asistió'
      or (o.status = 'ausente'    and v_aus)
      or (o.status = 'confirmada' and v_modo = 'reserva')
      or (o.status = 'cancelada'  and v_modo = 'reserva'
          and (o.cancel_kind = 'fuera de plazo'
               or (o.cancel_kind = 'en plazo' and o.rn > v_tope)))
    );

  return coalesce(v_n, 0);
end;
$$;

revoke all on function public.consumo_contadas(uuid) from public, anon;

-- ------------------------------------------------------------
-- 10. Escribir el resultado de la cuenta
--
-- Toma el bloqueo de la fila ANTES de contar: bajo READ COMMITTED, una
-- transacción que despierta después del commit de otra vuelve a contar
-- sobre una foto nueva. Al revés, las dos contarían lo mismo y la segunda
-- pisaría a la primera.
--
-- La bandera pilates.consumo es transaccional y la lee el guardián del
-- punto 13: es la firma que distingue "lo escribió el motor" de "lo
-- escribió una pestaña vieja".
-- ------------------------------------------------------------
create or replace function public.consumo_recalcular(p_membership uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_n int;
begin
  if p_membership is null then return; end if;

  perform 1 from public.memberships m where m.id = p_membership for update;

  v_n := public.consumo_contadas(p_membership);

  perform set_config('pilates.consumo', 'on', true);
  update public.memberships m
     set classes_used = m.classes_used_base + v_n
   where m.id = p_membership
     and m.classes_used is distinct from m.classes_used_base + v_n;
  perform set_config('pilates.consumo', 'off', true);
end;
$$;

revoke all on function public.consumo_recalcular(uuid) from public, anon;

-- ------------------------------------------------------------
-- 11. EL DISPARADOR DE LA RESERVA (before)
--
-- Escribe membership_id, cancel_kind y override_by. NUNCA ESCRIBE status.
-- Eso no es un detalle de implementación, es la condición para que el
-- portal siga andando: el WITH CHECK de una política se evalúa DESPUÉS de
-- los triggers BEFORE ROW, así que si acá se reescribiera el estado,
-- "alumno cancela" (0005:75-78, `with check (status = 'cancelada')`)
-- dejaría de aceptar la cancelación de la clienta, y la restrictiva de
-- 0013:264 caería en su rama else y dejaría de exigir reservas.anular.
-- Ninguna política mira las columnas que este trigger sí escribe.
--
-- SE RECHAZA SOLO AL TOMAR UN LUGAR. Marcar presente, marcar ausente,
-- deshacer un presente y cancelar pasan siempre de largo. Una excepción
-- levantada mientras la profesora toma asistencia a las siete de la
-- mañana, con diez personas esperando, es peor que cualquier descuadre.
-- Cancelar fuera de plazo tampoco se bloquea: cuesta la clase, no se
-- prohíbe — bloquearla dejaría además el lugar ocupado.
--
-- Y no se rechaza nunca sin sesión: el cron y el webhook de Mercado Pago
-- entran por el service role, donde can() responde que no a todo.
--
-- Se llama reservations_uso_de_clase y no reservations_consumo por una
-- razón que no se ve: los BEFORE ROW disparan en ORDEN ALFABÉTICO, y este
-- tiene que correr DESPUÉS de reservations_stamp (0022), que es quien
-- sella start_time y quien limpia cancel_kind al deshacer una
-- cancelación. Con un nombre que empezara con 'c' leería una foto que
-- todavía no existe y resucitaría lo que stamp acaba de borrar.
-- ------------------------------------------------------------
create or replace function public.consumir_clase()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_modo    text;
  v_horas   numeric;
  v_susp    boolean;
  v_inicio  timestamptz;
  v_ocupa   boolean;
  v_ocupaba boolean;
  v_toma    boolean;
  v_marca   boolean;
  v_cancela boolean;
  v_motivo  boolean;
  v_excep   boolean := false;
  v_saldo   int;
begin
  if not public.consumo_rige() then return new; end if;
  -- Durante el backfill el motor se aparta: si no, el sellado de abajo
  -- pisaría el membership_id que el backfill acaba de escribir y el
  -- update se desharía solo, en silencio.
  if coalesce(current_setting('pilates.backfill', true), 'off') = 'on' then
    return new;
  end if;

  v_modo := public.param('class_consumption', 'asistencia');

  -- Las banderas se calculan adentro de una rama guardada por tg_op. En
  -- un INSERT no existe OLD y el AND de SQL no corta: la 0022 documentó
  -- esta misma trampa con su bandera v_foto.
  v_ocupa := new.status in ('confirmada', 'asistió', 'ausente');

  if tg_op = 'INSERT' then
    v_ocupaba := false;
    v_marca   := new.status in ('asistió', 'ausente');
    v_cancela := new.status = 'cancelada';
    v_motivo  := btrim(coalesce(new.override_reason, '')) <> '';
    -- El cliente no elige la membresía ni la firma de la excepción.
    new.membership_id := null;
    new.override_by   := null;
    if not v_cancela then new.cancel_kind := null; end if;
  else
    v_ocupaba := old.status in ('confirmada', 'asistió', 'ausente');
    v_marca   := new.status in ('asistió', 'ausente')
                 and old.status is distinct from new.status;
    v_cancela := new.status = 'cancelada' and old.status is distinct from 'cancelada';
    -- Se compara contra old, no se mira si está lleno: un update que solo
    -- cambia el estado reenvía override_reason igual, y si eso pidiera el
    -- permiso, la clienta no podría cancelar su propia reserva de
    -- excepción desde el portal.
    v_motivo  := btrim(coalesce(new.override_reason, '')) <> ''
                 and coalesce(new.override_reason, '')
                     is distinct from coalesce(old.override_reason, '');

    -- membership_id se sella una vez y no se mueve nunca. RLS filtra
    -- filas y no columnas: sin esto la clienta podría apuntar su reserva
    -- a otra membresía desde el portal.
    new.membership_id := old.membership_id;

    if not v_motivo then new.override_by := old.override_by; end if;

    -- cancel_kind se congela. Comparar dos relojes más tarde da otra
    -- respuesta, y cambiar cancel_hours de 3 a 6 reescribiría el pasado.
    if new.status <> 'cancelada' then
      new.cancel_kind := null;            -- coincide con lo que ya hizo stamp
    elsif old.status = 'cancelada' then
      new.cancel_kind := old.cancel_kind; -- ya clasificada, no se reescribe
    end if;
  end if;

  v_toma := v_ocupa and not v_ocupaba;

  -- --- La excepción autorizada (1.11) ---
  if v_motivo then
    if v_uid is null then
      new.override_by := null;   -- proceso del sistema: queda el motivo, sin firma
    elsif public.can('reservas.excepcion') then
      new.override_by := v_uid;
      v_excep := true;
    else
      raise exception 'No tenés permiso para autorizar una excepción sobre esta reserva';
    end if;
  end if;

  -- --- El sellado ---
  --
  -- Una fila sin membresía se sella al nacer, al tomar un lugar, o al
  -- marcarle la asistencia. Ese tercer caso es el que hace que las
  -- 'confirmada' anteriores al corte se sigan cobrando cuando la clienta
  -- viene, exactamente como se venían cobrando.
  --
  -- Lo que NO sella es una fila vieja que solo cambia de forma —deshacer
  -- un presente de hace meses, o cualquier guardado incidental—, porque
  -- ahí el cobro iría para el lado equivocado: deshacer una asistencia
  -- sumaría una clase en vez de restarla.
  if new.membership_id is null and v_ocupa
     and (tg_op = 'INSERT' or v_toma or v_marca) then
    new.membership_id := public.membresia_para(new.student_id, new.date);
  end if;

  -- --- Clasificar la cancelación ---
  --
  -- La suspensión se pregunta ANTES de mirar el reloj. Al revés, la
  -- suspensión avisada a la mañana caería como "fuera de plazo" y el
  -- estudio le estaría cobrando a la clienta su propia falla.
  --
  -- La categoría se DERIVA de class_occurrences, no se acepta del
  -- cliente: por eso vale igual si la clienta cancela un segundo después
  -- de que se suspendió, y nadie puede inventársela para recuperar una
  -- clase que perdió.
  if v_cancela then
    select (co.status = 'suspendida') into v_susp
    from public.class_occurrences co
    where co.class_id = new.class_id and co.date = new.date;

    if coalesce(v_susp, false) then
      new.cancel_kind := 'suspendida';
    else
      v_horas := public.param_num('cancel_hours', 12);
      -- start_time lo dejó completo el backfill de la 0022 en todas las
      -- filas; el coalesce es por si alguna quedara sin foto.
      v_inicio := (new.date + coalesce(new.start_time, '00:00'::time))
                    at time zone 'America/Argentina/Buenos_Aires';
      -- Contra now() y no contra new.cancelled_at: stamp acepta el
      -- cancelled_at que venga del cliente, y la clienta escribe sus
      -- propias filas. Una cancelación avisada por teléfono y cargada
      -- días después se corrige con reservas.excepcion, no falseando una
      -- fecha.
      if now() <= v_inicio - (v_horas * interval '1 hour') then
        new.cancel_kind := 'en plazo';
      else
        new.cancel_kind := 'fuera de plazo';
      end if;
    end if;
  end if;

  -- --- La validación: solo al tomar un lugar ---
  if v_toma
     and v_modo = 'reserva'
     and v_uid is not null
     and not v_excep
     and public.param('reserva_exige_membresia', 'true') = 'true'
  then
    perform public.bloquear_alumna(new.student_id);

    if new.membership_id is null then
      raise exception 'No tiene una membresía vigente para el %. Renovala, o pedí el permiso de excepción y dejá el motivo escrito.', new.date;
    end if;

    select m.classes_total - m.classes_used into v_saldo
    from public.memberships m where m.id = new.membership_id;

    if coalesce(v_saldo, 0) <= 0 then
      raise exception 'No le quedan clases en la membresía de ese período. Renovala, o pedí el permiso de excepción y dejá el motivo escrito.';
    end if;
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- 12. EL RECÁLCULO (after)
--
-- Va después y no adentro del BEFORE porque en un BEFORE INSERT la fila
-- todavía no existe y no se puede contar a sí misma.
--
-- Bloquea por clienta y no por membresía, y siempre con la misma
-- función: así todas las transacciones del sistema toman las filas de
-- memberships en el mismo orden y no hay ciclo posible entre dos
-- operaciones sobre la misma clienta.
--
-- LIMITACIÓN CONOCIDA: los AFTER ROW se encolan y disparan al final de la
-- sentencia, así que un INSERT de varias filas de la misma clienta en UNA
-- sentencia valida todas contra la foto previa. Hoy nadie inserta de a
-- varias (createReservation inserta una), y enforce_class_capacity tiene
-- exactamente la misma limitación desde la 0005.
-- ------------------------------------------------------------
create or replace function public.recalcular_uso_de_clase()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_alumna uuid;
  v_a uuid;
  v_b uuid;
begin
  if not public.consumo_rige() then return null; end if;
  if coalesce(current_setting('pilates.backfill', true), 'off') = 'on' then
    return null;
  end if;

  if tg_op = 'DELETE' then
    v_alumna := old.student_id;
    v_a := old.membership_id;
    v_b := null;
  elsif tg_op = 'INSERT' then
    v_alumna := new.student_id;
    v_a := new.membership_id;
    v_b := null;
  else
    v_alumna := new.student_id;
    v_a := new.membership_id;
    v_b := old.membership_id;
  end if;

  if v_a is null and v_b is null then return null; end if;

  perform public.bloquear_alumna(v_alumna);

  if v_a is not null then perform public.consumo_recalcular(v_a); end if;
  if v_b is not null and v_b is distinct from v_a then
    perform public.consumo_recalcular(v_b);
  end if;

  return null;
end;
$$;

-- ------------------------------------------------------------
-- 13. El guardián del contador
--
-- Es la mitigación del único caso que el orden de despliegue NO cubre:
-- recepción con el sistema abierto desde el viernes. Esa pestaña tiene
-- todavía el código que suma uno a classes_used, y el día que el motor se
-- encienda cada clase se cobraría dos veces, en silencio.
--
-- Con el recálculo, un escribano ajeno además no se corrige solo: el
-- número queda mal hasta que alguna reserva de esa clienta cambie.
--
-- Esto convierte un cobro doble mudo en un cartel que dice "recargá la
-- página". Se apaga sin deploy con consumo_protege_contador, y no existe
-- mientras el motor esté apagado — si existiera, bloquearía al navegador
-- que HOY es el que lleva la cuenta.
-- ------------------------------------------------------------
create or replace function public.guard_clases_usadas()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.classes_used is not distinct from old.classes_used then return new; end if;
  if not public.consumo_rige() then return new; end if;
  if public.param('consumo_protege_contador', 'true') <> 'true' then return new; end if;
  if coalesce(current_setting('pilates.consumo', true), 'off') = 'on' then return new; end if;

  raise exception 'El contador de clases lo lleva el sistema a partir de las reservas. Recargá la página: puede que estés viendo una versión anterior del sistema.';
end;
$$;

-- ------------------------------------------------------------
-- 14. Suspender un día cancela y devuelve
--
-- La 0018 cerró con una nota: "Suspender una fecha NO cancela sola las
-- reservas que ya estaban: eso es una decisión con consecuencias (¿se les
-- devuelve la clase?, ¿se les avisa?)". Las dos preguntas ya están
-- contestadas por la clienta: no la pierde, y la devolución no gasta el
-- cupo de recuperos.
--
-- El camino de devolver no valida nada y no puede fallar: es lo que
-- separa "suspender el feriado" de "no poder suspender el feriado".
-- enforce_class_capacity (0018) solo actúa sobre 'confirmada', así que
-- pasar a 'cancelada' lo atraviesa sin mirar.
--
-- Dessuspender NO resucita las reservas, a propósito: restaurar doce
-- filas podría pasarse del cupo, y decidir a quién dejar afuera no es
-- algo que un trigger deba hacer solo. El SQL para revisarlo a mano está
-- en el bloque de VUELTA ATRÁS.
--
-- cancel_kind se escribe acá por claridad, pero el que manda es
-- consumir_clase: lee la propia instancia ya suspendida —visible dentro
-- de la transacción— y clasifica igual.
-- ------------------------------------------------------------
create or replace function public.cancelar_por_suspension()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.consumo_rige() then return null; end if;
  if new.status <> 'suspendida' then return null; end if;
  -- La referencia a OLD vive adentro de una rama guardada por tg_op. Este
  -- disparador también corre en INSERT, donde OLD no existe, y el AND de
  -- SQL no corta: escrito en una sola línea, cada alta de instancia
  -- reventaría con "record old is not assigned yet".
  if tg_op = 'UPDATE' then
    if old.status = 'suspendida' then return null; end if;
  end if;

  update public.reservations r
     set status = 'cancelada',
         cancel_kind = 'suspendida'
   where r.class_id = new.class_id
     and r.date = new.date
     and r.status in ('confirmada', 'lista de espera', 'ofrecida');

  return null;
end;
$$;

-- ------------------------------------------------------------
-- 15. El saldo, en solo lectura
--
-- La misma cuenta que la base va a exigir, para que el mostrador y el
-- portal muestren el número verdadero antes de intentar la reserva
-- (requerimientos 1.7 y 1.10) — y para que la clienta vea cuántos
-- recuperos le quedan en el momento de cancelar, no cuando quiere
-- anotarse.
--
-- Es security definer, así que el recorte se hace a mano: staff con
-- membresias.ver, o la propia clienta. Sin sesión pasa, porque sin sesión
-- es el service role, que no pasa por RLS de todos modos.
-- ------------------------------------------------------------
create or replace function public.saldo_de_clases(p_student uuid, p_fecha date default null)
returns table (
  membresia uuid,
  total int,
  usadas int,
  disponibles int,
  devoluciones_usadas int,
  devoluciones_restantes int
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_mem  uuid;
  v_tope int;
  v_dev  int;
begin
  if v_uid is not null
     and not public.can('membresias.ver')
     and p_student not in (select public.my_student_ids())
  then
    raise exception 'No tenés permiso para ver el saldo de clases de esa persona';
  end if;

  v_mem := public.membresia_para(
    p_student,
    coalesce(p_fecha, (now() at time zone 'America/Argentina/Buenos_Aires')::date));

  if v_mem is null then return; end if;

  v_tope := public.param_num('recoveries_per_month', 2)::int;

  select count(*) into v_dev
  from public.reservations r
  where r.membership_id = v_mem
    and r.status = 'cancelada'
    and r.cancel_kind = 'en plazo'
    and not exists (
      select 1 from public.class_occurrences co
      where co.class_id = r.class_id and co.date = r.date
        and co.status = 'suspendida');

  return query
  select m.id,
         m.classes_total,
         m.classes_used,
         greatest(m.classes_total - m.classes_used, 0),
         least(v_dev, v_tope),
         greatest(v_tope - v_dev, 0)
  from public.memberships m
  where m.id = v_mem;
end;
$$;

revoke all on function public.saldo_de_clases(uuid, date) from public, anon;
grant execute on function public.saldo_de_clases(uuid, date) to authenticated;

-- ------------------------------------------------------------
-- 16. El control
--
-- Es el perm_diff() de este módulo. La invariante es una sola:
--
--     classes_used = classes_used_base + consumo_contadas(id)
--
-- Cualquier fila acá es un contador que alguien movió por fuera del
-- motor, o una base que quedó negativa.
--
-- Con el motor apagado devuelve cero filas a propósito: entre esta
-- migración y el encendido el navegador sigue moviendo el contador, y
-- denunciar eso sería denunciar el funcionamiento normal.
--
-- El revoke a PUBLIC no es decorativo: Postgres otorga EXECUTE a PUBLIC
-- por defecto, esta función es definer y devuelve el nombre de cada
-- clienta. Sin él, cualquiera la llama por RPC y saltea membresias.ver
-- por la ventana. Se le devuelve a authenticated en la línea siguiente y
-- el recorte de verdad lo hace el can() de adentro.
-- ------------------------------------------------------------
create or replace function public.consumo_control()
returns table (problema text, membresia uuid, alumna text, contador int, deberia int)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.can('membresias.ver') then
    raise exception 'No tenés permiso para auditar el consumo de clases';
  end if;

  if not public.consumo_rige() then return; end if;

  return query
  select 'contador fuera del motor'::text, m.id, s.name, m.classes_used,
         m.classes_used_base + public.consumo_contadas(m.id)
  from public.memberships m
  join public.students s on s.id = m.student_id
  where m.classes_used is distinct from m.classes_used_base + public.consumo_contadas(m.id)
  union all
  select 'base negativa'::text, m.id, s.name, m.classes_used, m.classes_used_base
  from public.memberships m
  join public.students s on s.id = m.student_id
  where m.classes_used_base < 0;
end;
$$;

revoke all on function public.consumo_control() from public, anon;
grant execute on function public.consumo_control() to authenticated;

-- ------------------------------------------------------------
-- 17. EL BACKFILL — qué se hace con lo que ya estaba
--
-- Es una función y no un update suelto para que se pueda MIRAR antes de
-- aplicarla (consumo_backfill(false)) y para que sea idempotente:
-- correrla dos veces no atribuye nada nuevo, porque solo mira filas sin
-- membresía sellada.
--
-- LAS 'confirmada' VIEJAS NO SE COBRAN DE GOLPE.
-- Cobrarlas el día del encendido le sacaría ocho clases a cada clienta de
-- una, por reservas que hizo cuando la regla no existía. Corte limpio: lo
-- que se reservó bajo la regla vieja se sigue cobrando como antes, cuando
-- se marque la asistencia — y ahí sí lo cobra el motor, porque el sellado
-- del punto 11 también corre en el UPDATE que la lleva a 'asistió'.
-- La contracara, escrita para que nadie se sorprenda: una 'confirmada'
-- vieja cancelada tarde no cuesta la clase, porque nunca se cobró.
--
-- LAS 'ausente' VIEJAS TAMPOCO. El navegador nunca las cobró. Atribuirlas
-- con absence_consumes_class = true les cobraría en retroactivo una falta
-- que el estudio ya perdonó.
--
-- LAS 'asistió' VIEJAS SÍ SE ATRIBUYEN, SIN MOVER UN SOLO NÚMERO.
-- Son las únicas que el código viejo llegó a cobrar, y hoy están dentro
-- de classes_used sin ninguna fila que las explique. Si no se atribuyen,
-- deshacer un presente lo cobraría de nuevo (doble) y cancelarlo no
-- devolvería nada (de menos).
--
-- La parte crítica es el tope `limit classes_used`. El código viejo tenía
-- `if (m.classes_used < m.classes_total)` y dejaba de descontar al llegar
-- al total, así que hay membresías con MÁS 'asistió' que clases
-- descontadas. Atribuirlas todas subiría classes_used y LE COMERÍA CLASES
-- A CLIENTAS REALES. Atribuyendo como mucho tantas como el contador ya
-- paga —las MÁS NUEVAS, que son las únicas que alguien todavía puede
-- deshacer— la suma queda idéntica y classes_used_base nunca queda
-- negativo.
-- ------------------------------------------------------------
create or replace function public.consumo_backfill(p_aplicar boolean default false)
returns table (membresia uuid, alumna text, contador int, atribuidas int, base int)
language plpgsql security definer set search_path = ''
as $$
declare
  r   record;
  v_n int;
begin
  if auth.uid() is not null and not public.can('membresias.editar') then
    raise exception 'No tenés permiso para reconstruir el consumo de clases';
  end if;

  for r in
    select m.id, m.student_id, m.classes_used, m.start_date, m.end_date, s.name
    from public.memberships m
    join public.students s on s.id = m.student_id
    order by m.id
  loop
    if p_aplicar then
      perform set_config('pilates.backfill', 'on', true);

      update public.reservations res
         set membership_id = r.id
       where res.id in (
         select r2.id
         from public.reservations r2
         where r2.student_id = r.student_id
           and r2.membership_id is null
           and r2.status = 'asistió'
           and r2.date between r.start_date and r.end_date
         order by r2.date desc, r2.id desc
         limit r.classes_used
       );
      -- Inmediatamente después del UPDATE: un PERFORM en el medio pisa
      -- FOUND y row_count, y el conteo saldría siempre mal.
      get diagnostics v_n = row_count;

      perform set_config('pilates.consumo', 'on', true);
      update public.memberships m
         set classes_used_base = r.classes_used - v_n
       where m.id = r.id;
      perform set_config('pilates.consumo', 'off', true);
      perform set_config('pilates.backfill', 'off', true);
    else
      select count(*) into v_n
      from (
        select r2.id
        from public.reservations r2
        where r2.student_id = r.student_id
          and r2.membership_id is null
          and r2.status = 'asistió'
          and r2.date between r.start_date and r.end_date
        order by r2.date desc, r2.id desc
        limit r.classes_used
      ) q;
    end if;

    membresia  := r.id;
    alumna     := r.name;
    contador   := r.classes_used;
    atribuidas := v_n;
    base       := r.classes_used - v_n;
    return next;
  end loop;
end;
$$;

revoke all on function public.consumo_backfill(boolean) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 18. Recién ahora los disparadores
--
-- Van al final a propósito: con los disparadores puestos, el update del
-- punto 3 (el ancla de classes_used_base) y cualquier corrección previa
-- pasarían por el guardián y por el sellado, y se desharían solos, en
-- silencio — la migración terminaría bien y mal.
--
-- Con el drop adelante para que se pueda volver a pegar entera sin fallar
-- por un trigger ya creado.
--
-- El nombre del BEFORE tiene que ordenar DESPUÉS de reservations_stamp:
-- ver el punto 11.
-- ------------------------------------------------------------
drop trigger if exists reservations_uso_de_clase on public.reservations;
create trigger reservations_uso_de_clase
  before insert or update on public.reservations
  for each row execute function public.consumir_clase();

drop trigger if exists reservations_uso_recalculo on public.reservations;
create trigger reservations_uso_recalculo
  after insert or update or delete on public.reservations
  for each row execute function public.recalcular_uso_de_clase();

drop trigger if exists memberships_guard_uso on public.memberships;
create trigger memberships_guard_uso
  before update on public.memberships
  for each row execute function public.guard_clases_usadas();

drop trigger if exists class_occurrences_suspension on public.class_occurrences;
create trigger class_occurrences_suspension
  after insert or update on public.class_occurrences
  for each row execute function public.cancelar_por_suspension();

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
-- --- A. Apenas se corre la migración (el motor está APAGADO) ---
--
--   -- 1. Ningún permiso cambió sin que nadie lo pidiera
--   select * from public.perm_diff();                    → cero filas
--
--   -- 2. El motor está apagado y la pantalla lo dice
--   select public.consumo_rige();                        → false
--   select key, value, rige from public.studio_settings
--    where group_key = 'reservas' order by sort_order;
--        → cancel_hours, class_consumption, absence_consumes_class,
--          recoveries_per_month, reserva_exige_membresia y
--          consumo_protege_contador, todos con rige = false
--
--   -- 3. Ningún contador se movió
--   select count(*) from public.memberships
--    where classes_used <> classes_used_base;            → 0
--
--   -- 4. Nada que auditar todavía
--   select * from public.consumo_control();              → cero filas
--
--   Y en la pantalla: reservar, cancelar, marcar presente, deshacerlo y
--   suspender un día siguen haciendo EXACTAMENTE lo mismo que antes. Si
--   algo cambió, esta migración está mal.
--
-- --- B. Después de desplegar el código (ver la lista de cambios) ---
--
--   El navegador ya no descuenta y el motor todavía duerme: durante estos
--   minutos no descuenta nadie. Es a propósito y el error es a favor de
--   la clienta; el backfill del encendido lo levanta.
--
-- --- C. Después del ENCENDIDO ---
--
--   -- 5. La invariante
--   select * from public.consumo_control();              → cero filas
--
--   -- 6. Reservar descuenta
--   Anotar a alguien desde la agenda y mirar su ficha: clases usadas sube
--   en uno EN EL MOMENTO, sin marcar asistencia.
--
--   -- 7. Marcar presente NO vuelve a descontar (esto es la trampa 7)
--   Marcar asistencia sobre esa misma reserva.
--   select classes_used from public.memberships where id = '<esa>';
--        → el mismo número que en 6
--   Deshacerlo y volver a marcarlo tres veces: el número no se mueve.
--
--   -- 8. Cancelar en plazo devuelve
--   Cancelar una reserva de dentro de más de 3 horas.
--   select cancel_kind from public.reservations where id = '<esa>';
--        → 'en plazo', y clases usadas bajó en uno
--
--   -- 9. Cancelar fuera de plazo no devuelve
--   Cancelar una de dentro de menos de 3 horas.
--        → 'fuera de plazo', y clases usadas NO se movió
--
--   -- 10. El tope de recuperos
--   Cancelar en plazo tres clases del mismo período.
--        → las dos primeras devuelven, la tercera no
--   select * from public.saldo_de_clases('<persona>', current_date);
--        → devoluciones_restantes = 0
--
--   -- 11. La suspensión no le cuesta la clase, ni gasta el cupo
--   Suspender un día con reservas confirmadas.
--   select status, cancel_kind from public.reservations
--    where class_id = '<clase>' and date = '<fecha>';
--        → todas 'cancelada' / 'suspendida', clases usadas bajó,
--          y devoluciones_restantes NO bajó
--
--   -- 12. LA PRUEBA DE LA TRAMPA DEL WITH CHECK
--   Con la sesión REAL DE UNA CLIENTA, desde el portal, cancelar su
--   clase.
--        → tiene que funcionar. Si falla, el trigger está escribiendo
--          status y hay que volver atrás. Esta prueba no se puede saltear
--          ni hacer con un admin: el problema aparece solo con la clienta.
--
--   -- 13. Nadie con rol alumno puede pasar nada a 'confirmada'
--   --     (verificación de lo que este diseño da por sentado)
--   Con esa misma sesión:
--     update reservations set status='confirmada' where id='<una cancelada suya>'
--        → cero filas tocadas. Su única política permisiva de update es
--          "alumno cancela" (0005:75-78), cuyo WITH CHECK exige
--          status = 'cancelada'. Un update que la política rechaza
--          responde SIN ERROR: hay que mirar CUÁNTAS filas volvieron.
--
--   -- 14. Dos reservas simultáneas sobre la última clase
--   Con alguien a quien le queda UNA clase, dos pestañas reservando dos
--   clases distintas a la vez.
--        → una entra, la otra recibe "No le quedan clases". Nunca las dos.
--
--   -- 15. El guardián
--   update public.memberships set classes_used = classes_used + 1
--    where id = '<una>';
--        → error "recargá la página"
--
--   -- 16. Una letra en Configuración no traba nada
--   update public.studio_settings set value = 'tres' where key = 'cancel_hours';
--   Cancelar una reserva.
--        → funciona, tomando el default de 12 horas. Dejarlo en '3'.
--
--   -- 17. Suspender un día NUEVO (instancia que no existía) no revienta
--   Suspender una fecha desde la agenda que todavía no tenía instancia:
--   es un INSERT en class_occurrences, y ahí OLD no existe.
--        → funciona. Es la trampa del punto 14.
--
-- ============================================================

-- ============================================================
-- ENCENDIDO (pegar entero, en el momento acordado, DESPUÉS de que el
-- código nuevo esté desplegado)
--
-- Va todo en una transacción: si el backfill falla, no queda una regla
-- encendida a medias.
--
--   begin;
--
--   -- La foto contra la que se verifica al final.
--   create temp table _antes on commit drop as
--     select id, classes_used from public.memberships;
--
--   -- Re-anclar: entre la migración y ahora el navegador siguió
--   -- moviendo el contador, así que el ancla de la migración quedó vieja.
--   update public.memberships set classes_used_base = classes_used;
--
--   -- Las reglas que pidió la clienta.
--   update public.studio_settings set value = '3'       where key = 'cancel_hours';
--   update public.studio_settings set value = 'reserva' where key = 'class_consumption';
--   update public.studio_settings set value = 'true'    where key = 'absence_consumes_class';
--   update public.studio_settings set value = '2'       where key = 'recoveries_per_month';
--
--   -- Y recién acá dejan de ser una promesa.
--   update public.studio_settings set rige = true where key in (
--     'cancel_hours', 'class_consumption', 'absence_consumes_class',
--     'recoveries_per_month', 'reserva_exige_membresia',
--     'consumo_protege_contador');
--
--   -- Atribuir las 'asistió' viejas. Mirarlo antes con (false) si se
--   -- quiere; con (true) es cuando escribe.
--   select * from public.consumo_backfill(true);
--
--   -- Y abortar entera si movió el contador de una sola membresía.
--   do $enc$
--   declare v int;
--   begin
--     select count(*) into v
--     from public.memberships m join _antes a on a.id = m.id
--     where m.classes_used is distinct from a.classes_used;
--     if v > 0 then
--       raise exception 'El encendido movió el contador de % membresías. Se revierte entero.', v;
--     end if;
--   end $enc$;
--
--   -- Tiene que dar cero filas.
--   select * from public.consumo_control();
--
--   commit;
--
-- APAGADO (freno de mano, sin deploy, en cualquier momento)
--
--   update public.studio_settings set rige = false where key = 'class_consumption';
--
-- Con eso el motor se detiene entero: deja de descontar, de devolver, de
-- bloquear, de proteger el contador y de cancelar por suspensión. Los
-- números quedan donde estaban. Para volver a la regla vieja hay que
-- reponer también el descuento del navegador.
--
-- APAGADOS PARCIALES
--
--   -- El mostrador no puede anotar a nadie y hay gente esperando:
--   update public.studio_settings set value = 'false' where key = 'reserva_exige_membresia';
--   -- (sigue descontando y devolviendo; solo deja de rechazar)
--
--   -- Hay que corregir un contador a mano:
--   update public.studio_settings set value = 'false' where key = 'consumo_protege_contador';
--   -- y volver a ponerlo en 'true' al terminar.
-- ============================================================

-- ============================================================
-- VUELTA ATRÁS (no ejecutar salvo que haga falta)
--
-- Antes de esto, probar el APAGADO: resuelve casi todo sin tocar el
-- esquema y es reversible en un segundo.
--
--   begin;
--
--   drop trigger if exists reservations_uso_de_clase on public.reservations;
--   drop trigger if exists reservations_uso_recalculo on public.reservations;
--   drop trigger if exists memberships_guard_uso on public.memberships;
--   drop trigger if exists class_occurrences_suspension on public.class_occurrences;
--
--   drop function if exists public.consumir_clase();
--   drop function if exists public.recalcular_uso_de_clase();
--   drop function if exists public.guard_clases_usadas();
--   drop function if exists public.cancelar_por_suspension();
--   drop function if exists public.consumo_backfill(boolean);
--   drop function if exists public.consumo_control();
--   drop function if exists public.saldo_de_clases(uuid, date);
--   drop function if exists public.consumo_recalcular(uuid);
--   drop function if exists public.consumo_contadas(uuid);
--   drop function if exists public.bloquear_alumna(uuid);
--   drop function if exists public.membresia_para(uuid, date);
--   drop function if exists public.consumo_rige();
--   drop function if exists public.param_num(text, numeric);
--
--   -- Las cancelaciones por suspensión quedan como cancelaciones sin
--   -- clasificar; el CHECK viejo no admite 'suspendida'.
--   update public.reservations set cancel_kind = null where cancel_kind = 'suspendida';
--   alter table public.reservations drop constraint reservations_cancel_kind_check;
--   alter table public.reservations add constraint reservations_cancel_kind_check
--     check (cancel_kind in ('en plazo', 'fuera de plazo'));
--
--   alter table public.memberships drop constraint memberships_base_no_negativa;
--   alter table public.memberships drop column classes_used_base;
--
--   delete from public.studio_settings where key in (
--     'recoveries_per_month', 'reserva_exige_membresia', 'consumo_protege_contador');
--   update public.studio_settings set value = 'asistencia', rige = false
--    where key = 'class_consumption';
--   update public.studio_settings set rige = false
--    where key in ('cancel_hours', 'absence_consumes_class');
--
--   delete from public.role_permissions where clave = 'reservas.excepcion';
--   delete from public.permission_keys  where clave = 'reservas.excepcion';
--
--   commit;
--
--   select * from public.perm_diff();   → tiene que volver a dar cero
--
-- Y hay que REPONER el descuento en el navegador (lib/api.ts
-- markAttendance / undoAttendance), o nadie descuenta nada.
--
-- LAS RESERVAS QUE UNA SUSPENSIÓN CANCELÓ no vuelven solas, ni acá ni al
-- dessuspender la fecha: restaurarlas podría pasarse del cupo. Para
-- revisarlas a mano:
--
--   select r.* from public.reservations r
--   where r.cancel_kind = 'suspendida'
--     and not exists (select 1 from public.class_occurrences co
--                     where co.class_id = r.class_id and co.date = r.date
--                       and co.status = 'suspendida');
-- ============================================================
