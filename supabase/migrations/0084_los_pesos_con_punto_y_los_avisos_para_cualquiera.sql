-- ============================================================
-- 0084 — Los pesos con punto, y los avisos para cualquiera
--
-- Salieron de la prueba del 27/09, y las dos cosas son textos que arma
-- la base: la pantalla los muestra tal cual, así que no hay manera de
-- arreglarlos desde la app.
--
-- LOS PESOS SALÍAN CON COMA
--
-- La campana del mostrador decía "Test 1 Alta Efectivo pagó $42,750 —
-- FE START". Ya había pasado y ya se había arreglado: la 0009 fijó el
-- separador a mano. La 0033 lo volvió a romper sin querer —para cambiar
-- "Un alumno" por "Un cliente" copió el cuerpo de la 0007 y no el de la
-- 0009—, y con eso volvió la `G` de `to_char`, que es el separador de
-- miles del locale de la BASE. El de Supabase es inglés.
--
-- Al buscar las demás apareció que cada función que pone plata en un
-- texto lo resolvía a su manera, y de las cuatro sólo una daba bien:
--
--   · `notify_payment_paid` (0033)        con `G`             "$42,750"
--   · `cerrar_caja` (0020)                el número crudo     "La diferencia es de -1000.00 …"
--   · `cerrar_liquidacion` (0065)         'FM999999999.00'    "el total da -1500.00 …"
--   · `guard_periodo_liquidacion` (0055)  reemplazo a mano    "$10.000", bien
--
-- La última se deja como está. La primera versión de esta migración la
-- reescribía con `pesos()` para que la regla quedara en un solo lugar, y
-- al correrla el 27/09 el chequeo de abajo cortó: la que está viva en
-- producción no es la que dice la 0055 del repo. Como ahí no había nada
-- que arreglar, no vale la pena pisar una versión que no se conoce.
--
-- Ahora hay una sola manera, `public.pesos(numeric)`, y es la que tiene
-- que usar cualquier texto nuevo que lleve plata: "$42.750", "-$1.000",
-- "$1.234,50". Los centavos aparecen sólo si los hay.
--
-- LOS AVISOS PARA CUALQUIERA
--
-- "Quedaste anotada en Pilates Reformer del 28/09…" le llegaba igual a un
-- cliente varón, y el estudio tiene clientes de los dos sexos. Tampoco
-- se arregla pasándolo al masculino: "anotado" le erra a la otra mitad.
--
-- El criterio que se siguió: cuando el texto habla de UNA persona —se le
-- escribe a ella, o se la nombra en un aviso o en un error—, va sin
-- género. Cuando habla de la categoría ("la dirección a la que escriben
-- los clientes"), queda la palabra que eligió el estudio el 09/09, que
-- es "cliente" (0033). Por eso el botón "Nuevo cliente" de la pantalla no
-- se toca, y el aviso "Nuevo cliente" que va arriba de un nombre sí.
--
-- Qué cambia en cada función está escrito al lado de cada una. En el
-- código de la app que lee la clienta (los mails, el portal, el proceso
-- diario) no apareció ninguno: ya estaba escrito sin género.
--
-- LO QUE QUEDA AFUERA A PROPÓSITO
--
--   · `turno_fijo_propio` (0077) escribe "Lo eligió la clienta desde el
--     portal" como motivo del turno fijo. No se redefine acá porque hay
--     una migración en revisión —la del fijo de un plan que todavía no
--     arrancó— que la redefine entera, y copiarla desde la 0077 pisaría
--     ese arreglo. La frase se cambió en esa migración, la 0082.
--   · Los avisos que ya están en `notifications` conservan su texto. Es
--     lo mismo que dijo la 0033: son el registro de lo que se dijo.
--
-- CÓMO SE ARMÓ
--
-- Cada función se generó a partir del texto de su última definición, no
-- se transcribió, y lo único que cambia es lo que se anota al lado. Los
-- comentarios de adentro quedan como estaban, aunque digan "la clienta":
-- son para quien programa, y cambiarlos ensuciaría la comparación con el
-- original.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 0. EL CHEQUEO ANTES DE PISAR NADA
--
-- Cada función de abajo es la copia de su última definición. Si después
-- alguien la redefinió en otra migración, pegar esta copia deshace ese
-- arreglo sin avisar —`create or replace` no compara nada—. Por eso,
-- antes de tocar, se mira que la versión viva sea la que se copió: tiene
-- que decir lo viejo (primera vez) o lo nuevo (si se vuelve a correr).
-- Si no dice ninguna de las dos, corta con el nombre de la función.
-- ------------------------------------------------------------

do $$
declare
  v_chequeos text[] := array[
    array['notify_payment_paid', 'FM999G999G999', 'public.pesos(new.amount)'],
    array['notify_new_student', '''Nuevo cliente''', '''Nueva ficha'''],
    array['avisar_reserva', 'Quedaste anotada en', 'Tu lugar quedó reservado en'],
    array['avisar_instancia', 'clase-susp-prof-', 'clase-susp-prof-'],
    array['avisar_instancia', 'Cambió la profesora de tu clase', 'Cambió quién da tu clase'],
    array['cerrar_caja', 'hace falta un motivo'', (p_saldo_real - v_esp)', 'public.pesos(p_saldo_real - v_esp)'],
    array['cerrar_liquidacion', 'FM999999999.00', 'public.pesos(v_l.total)'],
    array['cancelar_membresia', 'cancel_motivo', 'cancel_motivo'],
    array['cancelar_membresia', 'en la ficha de la clienta', 'queda escrito en la ficha'''],
    array['consumir_clase', 'devoluciones_tope()', 'devoluciones_tope()'],
    array['consumir_clase', 'no es de este cliente', 'es de otra ficha'],
    array['reserva_en_hora', 'v_disc', 'v_disc'],
    array['reserva_en_hora', 'Para anotarla en esta clase', 'Para esta clase hace falta'],
    array['soltar_turno_fijo_propio', 'Lo dejó la clienta desde el portal', '''Lo dejó desde el portal''']
  ];
  c text[];
  v_src text;
begin
  foreach c slice 1 in array v_chequeos loop
    select string_agg(p.prosrc, ' ') into v_src
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = c[1];

    if v_src is null then
      raise exception 'No existe public.%: falta correr la migración que la crea.', c[1];
    end if;

    if position(c[2] in v_src) = 0 and position(c[3] in v_src) = 0 then
      raise exception
        'public.% no es la versión que copió esta migración (no dice "%" ni "%"). La redefinió otra migración después: copiá esa versión acá antes de correr esta.',
        c[1], c[2], c[3];
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 1. `pesos()`: LA ÚNICA MANERA DE ESCRIBIR PLATA EN UN TEXTO
--
-- No depende del locale. La coma y el punto de un patrón de `to_char`
-- son LITERALES —los que dependen del locale son `G` y `D`—, así que se
-- arma el número a la inglesa, "42,750.50", y `translate` cambia los
-- dos caracteres a la vez: "42.750,50". Da lo mismo en Supabase, en una
-- base local o en la que venga.
--
-- Los centavos van sólo si los hay, que es como lo muestra la pantalla:
-- "$42.750" y no "$42.750,00". El redondeo a dos decimales va primero,
-- porque es el que decide si hay centavos y si el signo sigue siendo
-- negativo (-0,004 es "$0", no "-$0").
--
-- El signo va antes del `$` ("-$1.000") y no entre el `$` y el número
-- como sale de pegar un '$' adelante de `to_char`.
--
-- Queda con el EXECUTE de siempre, abierto: no es `security definer`, no
-- lee ninguna tabla y no puede contestar nada que quien la llama no le
-- haya pasado. Cerrarla no protege nada y sí obligaría a revisar desde
-- qué rol corre cada función que la usa.
-- ------------------------------------------------------------

create or replace function public.pesos(p_monto numeric)
returns text
language sql immutable strict parallel safe
set search_path = ''
as $$
  select case when x.r < 0 then '-' else '' end
      || '$'
      || translate(
           to_char(abs(x.r), case when x.r = trunc(x.r)
                                  then 'FM999,999,999,999,990'
                                  else 'FM999,999,999,999,990.00' end),
           ',.', '.,')
  from (select round(p_monto, 2) as r) x
$$;

comment on function public.pesos(numeric) is
  'Monto en pesos para un texto que lee una persona: "$42.750", "-$1.000", "$1.234,50". No depende del locale de la base. Todo aviso o mensaje con plata tiene que pasar por acá (0084).';

-- Y se prueba acá mismo, antes de que la usen las demás. Lo que decide es
-- el locale de la base de verdad, y a esa se llega recién al pegar esto
-- en el SQL Editor: si ahí da mal, es mejor que la migración corte a que
-- diez avisos salgan con el número equivocado.
do $$
declare
  v_casos text[] := array[
    array['42750',       '$42.750'],
    array['-1000',       '-$1.000'],
    array['1234.5',      '$1.234,50'],
    array['0',           '$0'],
    array['0.004',       '$0'],
    array['-0.5',        '-$0,50'],
    array['999.999',     '$1.000'],
    array['87500.00',    '$87.500'],
    array['1234567890',  '$1.234.567.890']
  ];
  c text[];
begin
  foreach c slice 1 in array v_casos loop
    if public.pesos(c[1]::numeric) is distinct from c[2] then
      raise exception 'pesos(%) dio "%" y tenía que dar "%"',
        c[1], public.pesos(c[1]::numeric), c[2];
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 2. EL AVISO DE COBRO — el de la 0033, con dos cambios
--
-- El monto sale de `pesos()`, que ya trae el signo: por eso el literal
-- pasa de ' pagó $' a ' pagó '. Y el respaldo para cuando no se encuentra
-- el nombre pasa de 'Un cliente' a 'Alguien': en la práctica no se ve
-- nunca —`student_id` y `name` son NOT NULL y esto corre como definer—,
-- pero si se viera, nombraría a una persona.
-- ------------------------------------------------------------

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
      coalesce(v_student_name, 'Alguien') || ' pagó ' || public.pesos(new.amount)
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

-- ------------------------------------------------------------
-- 3. EL AVISO DE ALTA — el de la 0033, con otro título
--
-- "Nuevo cliente" arriba de "María Pérez se sumó al estudio" es el
-- masculino aplicado a una persona con nombre. "Nueva ficha" dice lo
-- mismo —hay alguien nuevo, y la campana lleva a Clientes— y es lo que
-- la recepción abre. El botón "Nuevo cliente" de la pantalla nombra la
-- categoría y queda como está.
-- ------------------------------------------------------------

create or replace function public.notify_new_student()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.notifications (type, title, body, student_id, audience, dedupe_key)
  values (
    'nuevo_alumno',
    'Nueva ficha',
    new.name || ' se sumó al estudio',
    new.id,
    'staff',
    'alumno-' || new.id
  )
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 4. LA RESERVA CONFIRMADA — el de la 0052, con otra frase
--
-- Es el aviso que se vio en la prueba. El título ("Te anotamos en una
-- clase") ya era neutro; el cuerpo pasa de "Quedaste anotada en…" a "Tu
-- lugar quedó reservado en…", que dice lo mismo sin decir de quién.
-- ------------------------------------------------------------

create or replace function public.avisar_reserva()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_clase text;
begin
  -- ---- Le confirmamos la reserva ----
  if tg_op = 'INSERT' and new.status = 'confirmada' then
    -- Salvo que se la haya hecho ella misma desde el portal: confirmarle
    -- lo que acaba de tocar es ruido. El aviso existe para cuando la
    -- anota el mostrador y ella se entera acá.
    if coalesce(new.source, '') <> 'portal' then
      insert into public.notifications (type, title, body, student_id, audience, dedupe_key)
      values (
        'reserva_confirmada',
        'Te anotamos en una clase',
        'Tu lugar quedó reservado en ' || public.texto_de_la_clase(new.class_id, new.date) || '.',
        new.student_id,
        'alumno',
        'reserva-ok-' || new.id
      )
      on conflict (dedupe_key) do nothing;
    end if;
  end if;

  -- ---- Se liberó un lugar: se le avisa a TODA la lista de espera ----
  --
  -- A todas y no a la primera, que es la política que el estudio dejó
  -- dicha cuando se relevó la lista de espera. Por eso
  -- `waitlist_offer_minutes` sigue sin regir: tal como está redactado
  -- describe una oferta por turno, que es lo contrario.
  if tg_op = 'UPDATE'
     and new.status = 'cancelada'
     and old.status = 'confirmada' then

    v_clase := public.texto_de_la_clase(new.class_id, new.date);

    insert into public.notifications (type, title, body, student_id, audience, dedupe_key)
    select
      'lugar_liberado',
      'Se liberó un lugar',
      'Se liberó un lugar en ' || v_clase || '. Entrá a reservarlo.',
      w.student_id,
      'alumno',
      -- Por (quien espera, clase, fecha): si se liberan dos lugares el
      -- mismo día no se le avisa dos veces lo mismo.
      'lugar-libre-' || w.student_id || '-' || new.class_id || '-' || new.date
    from public.reservations w
    where w.class_id = new.class_id
      and w.date = new.date
      and w.status = 'lista de espera'
    on conflict (dedupe_key) do nothing;
  end if;

  return null;
end;
$$;

-- ------------------------------------------------------------
-- 5. LA SUSPENSIÓN Y EL CAMBIO DE PROFESOR — el de la 0060
--
-- Acá el género no era el de la clienta sino el de quien da la clase:
-- "Cambió la profesora de tu clase" le llegaba igual cuando la pasaba a
-- dar Leandro. El título pasa a "Cambió quién da tu clase" y el respaldo
-- para una profesora sin nombre, a "otra persona del equipo". El nombre
-- sigue yendo en el cuerpo, que es lo que importa.
-- ------------------------------------------------------------

create or replace function public.avisar_instancia()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_clase   text;
  v_prof    text;
  v_titular uuid;
  v_antes   uuid;
  v_ahora   uuid;
begin
  v_clase := public.texto_de_la_clase(new.class_id, new.date);

  select cs.teacher_id into v_titular
  from public.class_sessions cs where cs.id = new.class_id;

  -- Quién la iba a dar y quién la da: la excepción del día gana sobre la
  -- titular.
  --
  -- El `if` va explícito y no como un CASE adentro de un coalesce. En
  -- INSERT `old` es un registro nulo y leerle un campo devuelve nulo sin
  -- error —probado el 17/09 suspendiendo por INSERT con el trigger de la
  -- 0052, que usa el mismo idioma en la línea de abajo: HTTP 201—, así que
  -- las dos formas funcionan. Se elige la explícita porque acá `v_antes`
  -- alimenta una decisión de a quién avisarle, y en esa posición conviene
  -- que se lea de una que en un INSERT no hay "antes".
  if tg_op = 'UPDATE' then
    v_antes := coalesce(old.teacher_id, v_titular);
  else
    v_antes := v_titular;
  end if;
  v_ahora := coalesce(new.teacher_id, v_titular);

  -- ---- El estudio no la dicta ese día ----
  if new.status = 'suspendida'
     and (tg_op = 'INSERT' or old.status is distinct from 'suspendida') then

    insert into public.notifications (type, title, body, student_id, audience, dedupe_key)
    select
      'clase_suspendida',
      'Se suspendió una clase tuya',
      'No se dicta ' || v_clase
        -- El punto va adentro del coalesce: afuera, cuando hay motivo la
        -- frase quedaba "…: Feriado No se te descuenta la clase".
        || coalesce(': ' || nullif(btrim(new.reason), '') || '.', '.')
        || ' No se te descuenta la clase.',
      r.student_id,
      'alumno',
      'clase-susp-' || r.student_id || '-' || new.class_id || '-' || new.date
    from public.reservations r
    where r.class_id = new.class_id
      and r.date = new.date
      and r.status in ('confirmada', 'lista de espera')
    on conflict (dedupe_key) do nothing;

    -- Y a quien la iba a dar. Una fila sola, y sin mirar si alguien
    -- reservó: es la diferencia entre ir al estudio y no ir.
    if v_ahora is not null then
      insert into public.notifications (type, title, body, teacher_id, audience, dedupe_key)
      values (
        'clase_suspendida',
        'Se suspendió una clase tuya',
        'No se dicta ' || v_clase
          || coalesce(': ' || nullif(btrim(new.reason), '') || '.', '.'),
        v_ahora,
        'profesor',
        'clase-susp-prof-' || v_ahora || '-' || new.class_id || '-' || new.date
      )
      on conflict (dedupe_key) do nothing;
    end if;
  end if;

  -- ---- Ese día la da otra ----
  --
  -- Solo si cambió de verdad: el trigger corre también cuando se toca el
  -- cupo o el horario, y avisar "la da Ivana" cuando ya la daba Ivana es
  -- el tipo de aviso que hace que dejen de leerlos.
  if new.teacher_id is not null
     and (tg_op = 'INSERT' or old.teacher_id is distinct from new.teacher_id)
     and new.status <> 'suspendida' then

    select t.name into v_prof from public.teachers t where t.id = new.teacher_id;

    insert into public.notifications (type, title, body, student_id, audience, dedupe_key)
    select
      'clase_cambio_profesora',
      'Cambió quién da tu clase',
      v_clase || ' la da ' || coalesce(v_prof, 'otra persona del equipo') || '.',
      r.student_id,
      'alumno',
      -- Con la profesora adentro: si vuelve a cambiar, es otro aviso.
      'clase-prof-' || r.student_id || '-' || new.class_id || '-' || new.date
        || '-' || new.teacher_id
    from public.reservations r
    where r.class_id = new.class_id
      and r.date = new.date
      and r.status = 'confirmada'
    on conflict (dedupe_key) do nothing;

    -- A la que entra. El `is distinct from` de arriba no alcanza para
    -- saber que cambió para ELLA: en un INSERT que fija a la titular,
    -- `old` no existe y la que "entra" ya la daba.
    if v_ahora is distinct from v_antes then
      insert into public.notifications (type, title, body, teacher_id, audience, dedupe_key)
      values (
        'clase_cambio_profesora',
        'Te asignaron una clase',
        'Pasás a dar ' || v_clase || '.',
        v_ahora,
        'profesor',
        'clase-prof-alta-' || v_ahora || '-' || new.class_id || '-' || new.date
      )
      on conflict (dedupe_key) do nothing;

      -- Y a la que sale, si había otra.
      if v_antes is not null then
        insert into public.notifications (type, title, body, teacher_id, audience, dedupe_key)
        values (
          'clase_cambio_profesora',
          'Te reemplazan en una clase',
          v_clase || ' la da ' || coalesce(v_prof, 'otra persona del equipo') || '.',
          v_antes,
          'profesor',
          'clase-prof-baja-' || v_antes || '-' || new.class_id || '-' || new.date
            || '-' || new.teacher_id
        )
        on conflict (dedupe_key) do nothing;
      end if;
    end if;
  end if;

  return null;
end;
$$;

-- ------------------------------------------------------------
-- 6. EL CIERRE DE CAJA — el de la 0020, con el monto en pesos
--
-- Decía "La diferencia es de -1000.00 y hace falta un motivo": el
-- `numeric(14,2)` crudo, con punto decimal inglés y los centavos en cero.
-- Ahora "-$1.000". El signo se deja porque es el que dice si falta o
-- sobra.
-- ------------------------------------------------------------

create or replace function public.cerrar_caja(
  p_account uuid,
  p_saldo_real numeric,
  p_notas text default ''
)
returns public.cash_sessions
language plpgsql security definer set search_path = ''
as $$
declare
  v_ses    public.cash_sessions;
  v_desde  timestamptz;
  v_hasta  timestamptz := now();
  v_ini    numeric(14, 2);
  v_in     numeric(14, 2);
  v_out    numeric(14, 2);
  v_esp    numeric(14, 2);
  v_med    jsonb;
  v_tol    numeric;
  v_exige  boolean;
begin
  if not public.can('caja.cerrar') then
    raise exception 'No tenés permiso para cerrar la caja';
  end if;
  -- Adentro de un SECURITY DEFINER la RLS de payments y expenses no corre:
  -- el permiso se exige acá y no se hereda de la vista.
  if not public.can('finanzas.ver') or not public.can('gastos.ver') then
    raise exception 'Para cerrar la caja hace falta ver los cobros y los gastos: el esperado se calcula con los dos';
  end if;

  if not exists (select 1 from public.accounts a
                  where a.id = p_account and a.arquea and a.active) then
    raise exception 'Esa cuenta no se arquea: la caja diaria es para la plata que se cuenta';
  end if;

  v_tol   := coalesce(nullif(public.param('caja_diferencia_tolerada', '0'), '')::numeric, 0);
  v_exige := public.param('caja_exige_motivo_diferencia', 'true') = 'true';

  -- Si nadie abrió la caja, el cierre la crea: olvidarse de abrir no
  -- puede ser un motivo para no poder cerrar.
  select * into v_ses from public.cash_sessions
   where account_id = p_account and closed_at is null
   for update;

  if not found then
    select coalesce(max(s.hasta), '-infinity'::timestamptz) into v_desde
      from public.cash_sessions s where s.account_id = p_account;
    insert into public.cash_sessions (account_id, desde, fecha, opened_at, opened_by)
    values (p_account, v_desde,
            (v_hasta at time zone 'America/Argentina/Buenos_Aires')::date,
            v_hasta, auth.uid())
    returning * into v_ses;
  end if;

  v_desde := v_ses.desde;

  select coalesce(sum(l.monto) filter (where l.sentido = 'ingreso'), 0),
         coalesce(sum(l.monto) filter (where l.sentido = 'egreso'),  0)
    into v_in, v_out
    from public.account_ledger l
   where l.account_id = p_account and l.at > v_desde and l.at <= v_hasta;

  v_ini := case when v_desde = '-infinity'::timestamptz then 0
                else public.saldo_cuenta(p_account, v_desde) end;
  v_esp := v_ini + v_in - v_out;

  if p_saldo_real is null then
    raise exception 'Falta el saldo contado: el cierre declara lo que se contó, no lo que el sistema esperaba';
  end if;
  if v_exige and abs(p_saldo_real - v_esp) > v_tol and coalesce(nullif(p_notas, ''), '') = '' then
    raise exception 'La diferencia es de % y hace falta un motivo', public.pesos(p_saldo_real - v_esp);
  end if;

  -- Los totales por medio son de TODOS los cobros del turno, no solo de
  -- los de esta cuenta: lo que pide la sección 8 es cuánto se cobró en
  -- efectivo, transferencia y tarjeta, y la transferencia no pasa por el
  -- cajón.
  select coalesce(jsonb_object_agg(t.medio, t.monto), '{}'::jsonb) into v_med
    from (select coalesce(p.method, 'sin_medio') as medio, sum(p.amount) as monto
            from public.payments p
           where p.status = 'pagado'
             and p.paid_at > v_desde and p.paid_at <= v_hasta
           group by 1) t;

  update public.cash_sessions
     set hasta = v_hasta,
         fecha = (v_hasta at time zone 'America/Argentina/Buenos_Aires')::date,
         closed_at = v_hasta,
         closed_by = auth.uid(),
         saldo_inicial = v_ini,
         ingresos = v_in,
         egresos = v_out,
         saldo_esperado = v_esp,
         saldo_real = p_saldo_real,
         totales_por_medio = v_med,
         notas = p_notas
   where id = v_ses.id
  returning * into v_ses;

  -- LA LÍNEA QUE HACE QUE LOS SALDOS CIERREN SIEMPRE. La diferencia del
  -- arqueo se asienta como movimiento, así el saldo del sistema queda
  -- igual a la plata contada sin ningún ancla escondida y sin ningún
  -- campo "saldo" editable. Si mañana aparece un faltante, quedó
  -- registrado acá con su fecha, su responsable y su motivo.
  if p_saldo_real <> v_esp then
    insert into public.account_movements
      (at, kind, from_account_id, to_account_id, amount, concept,
       cash_session_id, created_by)
    values (
      v_hasta, 'ajuste',
      case when p_saldo_real < v_esp then p_account else null end,
      case when p_saldo_real > v_esp then p_account else null end,
      abs(p_saldo_real - v_esp),
      case when p_saldo_real < v_esp then 'Faltante de arqueo' else 'Sobrante de arqueo' end
        || case when p_notas = '' then '' else ': ' || p_notas end,
      v_ses.id, auth.uid());
  end if;

  return v_ses;
end;
$$;

-- ------------------------------------------------------------
-- 7. EL CIERRE DE LA LIQUIDACIÓN — el de la 0065, con el monto en pesos
--
-- 'FM999999999.00' daba "-1500.00": sin separador de miles y con punto
-- decimal.
-- ------------------------------------------------------------

create or replace function public.cerrar_liquidacion(
  p_teacher uuid, p_desde date, p_hasta date, p_notas text default ''
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_l record;
  v_id uuid;
begin
  if not public.can('personal.remuneracion') then
    raise exception 'No tenés permiso para cerrar liquidaciones.';
  end if;

  select * into v_l
  from public.liquidacion(p_desde, p_hasta) l
  where l.teacher_id = p_teacher;

  if not found then
    raise exception 'Esa persona no tiene nada liquidado en el período.';
  end if;

  -- Con un ajuste negativo grande el total puede dar menos que cero, y la
  -- tabla no lo admite (0054). Sin esto el cierre fallaba con el texto
  -- crudo del check, que no le dice nada a nadie.
  if v_l.total < 0 then
    raise exception
      'Con los ajustes el total da % y no puede ser negativo. Revisá los ajustes del período.',
      public.pesos(v_l.total);
  end if;

  insert into public.teacher_settlements (
    teacher_id, desde, hasta,
    clases, monto_clases, horas, monto_horas, mensual, ajustes, total, notas
  ) values (
    p_teacher, p_desde, p_hasta,
    v_l.clases, v_l.monto_clases, v_l.horas, v_l.monto_horas, v_l.mensual,
    v_l.ajustes, v_l.total, coalesce(p_notas, '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- 8. CANCELAR UNA MEMBRESÍA — el de la 0070, con otra frase
--
-- "…queda escrito en la ficha de la clienta" pasa a "…queda escrito en
-- la ficha". Se lee en el mostrador, con la ficha abierta: no hace falta
-- decir de quién.
-- ------------------------------------------------------------

create or replace function public.cancelar_membresia(p_id uuid, p_motivo text)
returns table (plan text, desde date, hasta date, clases_usadas int, cuota_anulada numeric)
language plpgsql security definer set search_path = ''
as $$
declare
  v_m record;
  v_cobrada record;
  v_anulado numeric := 0;
begin
  if not public.can('membresias.anular') then
    raise exception 'No tenés permiso para cancelar una membresía';
  end if;

  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'La cancelación necesita un motivo: queda escrito en la ficha';
  end if;

  select m.id, m.status, m.start_date, m.end_date, m.classes_used, p.name as plan_name
    into v_m
    from public.memberships m
    join public.plans p on p.id = m.plan_id
   where m.id = p_id
     for update of m;

  if not found then
    raise exception 'Esa membresía no existe';
  end if;
  if v_m.status = 'cancelada' then
    raise exception 'Esa membresía ya estaba cancelada';
  end if;

  select pa.receipt_number, pa.amount into v_cobrada
    from public.payments pa
   where pa.membership_id = p_id and pa.status = 'pagado'
   limit 1;
  if found then
    raise exception
      'La cuota de este período ya está cobrada (comprobante %). Si corresponde devolverla, anulá el cobro desde Pagos y después cancelá la membresía.',
      coalesce(v_cobrada.receipt_number::text, 's/n');
  end if;

  update public.memberships
     set status = 'cancelada',
         auto_renew = false,
         -- El motivo, el momento y la persona. Sin esto la cancelación era
         -- un cambio de estado anónimo y sin fecha (0070).
         cancel_motivo = btrim(p_motivo),
         updated_at = now(),
         updated_by = auth.uid()
   where id = p_id;

  -- La nota de la cuota se sigue escribiendo: es donde alguien la busca
  -- cuando mira Pagos y ve un mes anulado. Ya no es el único lugar.
  with anuladas as (
    update public.payments
       set status = 'anulado',
           notes = btrim(
             coalesce(notes || ' · ', '') ||
             'Anulado: se canceló la membresía — ' || btrim(p_motivo)
           )
     where membership_id = p_id
       and status in ('pendiente', 'vencido')
    returning amount
  )
  select coalesce(sum(amount), 0) into v_anulado from anuladas;

  return query
  select v_m.plan_name, v_m.start_date, v_m.end_date, v_m.classes_used, v_anulado;
end;
$$;

-- ------------------------------------------------------------
-- 9. EL DESCUENTO DE CLASES — el de la 0076, con dos frases
--
-- Las dos las lee el mostrador sobre una persona concreta:
--   · "Esa clase perdida no es de este cliente." → "…es de otra ficha."
--   · "Para anotarla igual, renovale…" → "Para reservarle igual, renovale…"
-- ------------------------------------------------------------

create or replace function public.consumir_clase()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_toma     boolean;   -- ¿esta escritura toma un lugar?
  v_marca    boolean;   -- ¿se está marcando asistencia?
  v_exc      boolean;   -- ¿viene con una excepción autorizada?
  v_mem      uuid;
  v_total    int;
  v_usadas   int;
  v_horas    numeric;
  v_inicio   timestamptz;
  v_susp     boolean;
  v_rec      public.reservations%rowtype;
  v_topes    int;
  v_hechos   int;
  v_desde    date;
  v_hasta    date;
  v_tope     int;      -- devoluciones con cupo por período (0076); null = sin tope
  v_dev      int;      -- cuántas lleva devueltas en este período
begin
  -- ── EL BLINDAJE DE COLUMNAS VA PRIMERO (0072) ────────────────────
  --
  -- Antes estaba debajo de `if not consumo_rige() then return new`, o sea
  -- que el interruptor de pánico de Configuración —pensado para apagar el
  -- descuento de clases— apagaba también esto. Con el motor apagado, la
  -- política "alumno cancela" deja a la clienta escribir cualquier
  -- columna de su propia fila, `student_id` incluido. El freno de mano no
  -- puede abrir una puerta.
  v_marca := tg_op = 'UPDATE' and new.status in ('asistió', 'ausente')
             and old.status is distinct from new.status;

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
    -- Las tres de la 0046, por el mismo motivo: son las que deciden si
    -- la clase se cobra o se regala, y se fijan al crear la reserva.
    new.recovers_reservation_id := old.recovers_reservation_id;
    new.override_by     := old.override_by;
    new.override_reason := old.override_reason;
    -- start_time solo lo refresca reservations_stamp al marcar asistencia,
    -- que corre después de este trigger.
    if not v_marca then new.start_time := old.start_time; end if;
    -- Y la que faltaba, que es la que decide la plata de frente (0072):
    -- `cancel_kind` es lo único que `consumo_contadas` mira para saber si
    -- una cancelada se cobra. Sin clavarla, la clienta mandaba
    -- `{status:'cancelada', cancel_kind:'en plazo'}` sobre una reserva YA
    -- cancelada fuera de plazo: el status no cambia, así que la
    -- clasificación de abajo no vuelve a correr, y la clase que había
    -- perdido volvía a su plan. Repetible, y sin un solo aviso.
    --
    -- Cuando la fila deja de estar cancelada no hay plazo que contar, así
    -- que se limpia: `reactivar_reserva` (0031) no la toca y quedaba el
    -- plazo viejo pegado a una reserva confirmada.
    if new.status = 'cancelada' then
      new.cancel_kind := old.cancel_kind;
    else
      new.cancel_kind := null;
    end if;
  end if;

  -- El motor de consumo, después del blindaje.
  if not public.consumo_rige() then return new; end if;

  v_toma := new.status in ('confirmada', 'asistió');

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

      if now() > v_inicio - make_interval(mins => (v_horas * 60)::int) then
        new.cancel_kind := 'fuera de plazo';
      else
        -- EN PLAZO, PERO ¿LE QUEDA CUPO? (0076)
        --
        -- Se decide ACÁ y se sella en la fila, en vez de contarlo después
        -- en `consumo_contadas`: esa función mira el ESTADO ACTUAL de las
        -- reservas, y con el tope contado ahí, cancelar y volver a
        -- anotarse liberaba el cupo. La clienta podía reciclar sus dos
        -- devoluciones todas las veces que quisiera.
        --
        -- Sellado, no: la fila queda con lo que le tocó en el momento, y
        -- `cancel_kind` es de las columnas que la 0072 le clava a la
        -- clienta en el update, así que no puede reescribirlo.
        --
        -- Si reactiva una devuelta, su `cancel_kind` se limpia (0072) y el
        -- cupo vuelve a estar libre — que es lo correcto: volvió a tomar
        -- la clase, así que la devolución se deshizo.
        v_tope := public.devoluciones_tope();
        if v_tope is null or new.membership_id is null then
          -- Sin tope configurado —o sin período que descontar— se comporta
          -- como siempre: la clase vuelve.
          new.cancel_kind := 'en plazo';
        else
          select count(*) into v_dev
            from public.reservations r
           where r.membership_id = new.membership_id
             and r.id <> new.id
             and r.status = 'cancelada'
             and r.cancel_kind = 'en plazo';
          new.cancel_kind := case when v_dev < v_tope
            then 'en plazo' else 'en plazo sin cupo' end;
        end if;
      end if;
    end if;
  end if;

  -- ---- El recupero (0046) ----
  --
  -- Solo al crear: en un update la columna viene pineada de arriba.
  if tg_op = 'INSERT' and new.recovers_reservation_id is not null then

    if not public.recupero_rige() then
      raise exception
        'Las recuperaciones todavía no están habilitadas. Se encienden desde Configuración → Reservas.';
    end if;

    -- Lo carga una recepción, no la clienta desde el portal: el tope es
    -- una regla del estudio y quien lo aplica es quien atiende.
    if not public.can('reservas.crear') then
      raise exception 'No tenés permiso para registrar una recuperación.';
    end if;

    select * into v_rec from public.reservations
    where id = new.recovers_reservation_id;

    if not found or v_rec.student_id <> new.student_id then
      raise exception 'Esa clase perdida es de otra ficha.';
    end if;

    if not public.recupero_elegible(new.recovers_reservation_id) then
      raise exception
        'Esa clase no se puede recuperar: se recuperan las que perdió por cancelar tarde o faltar sin avisar, y solo una vez.';
    end if;

    -- El recupero vive dentro del período que pagó la clase perdida: las
    -- clases no se acumulan de un mes al otro, así que reponerla fuera
    -- de su membresía sería revivir una clase vencida.
    select m.start_date, m.end_date into v_desde, v_hasta
    from public.memberships m where m.id = v_rec.membership_id;

    if new.date < v_desde or new.date > v_hasta then
      raise exception
        'La recuperación tiene que caer dentro del período que pagó esa clase (% al %)',
        to_char(v_desde, 'DD/MM/YYYY'), to_char(v_hasta, 'DD/MM/YYYY');
    end if;

    v_topes := coalesce(nullif(public.param('recovery_max', '2'), '')::int, 2);

    select count(*)::int into v_hechos
    from public.reservations r
    where r.membership_id = v_rec.membership_id
      and r.recovers_reservation_id is not null
      and r.status <> 'cancelada';

    -- La frase se arma según el número porque el número lo elige el
    -- estudio: en 1 decía "Ya usó las 1 recuperaciones" y en 0 decía que
    -- usó las cero, cuando lo que pasa es que no permite ninguna.
    if v_hechos >= v_topes then
      raise exception '%', case
        when v_topes <= 0 then 'El estudio no permite recuperaciones. Se habilitan desde Configuración → Reservas.'
        when v_topes = 1  then 'Ya usó la recuperación de este período'
        else 'Ya usó las ' || v_topes || ' recuperaciones de este período'
      end;
    end if;

    -- Se paga con la membresía de la clase perdida, y `consumo_contadas`
    -- la excluye: la sella para poder contar el tope por período, no
    -- para volver a cobrarla.
    new.membership_id := v_rec.membership_id;
    new.override_by := null;
    new.override_reason := null;

    return new;
  end if;

  -- ---- Validar y sellar al tomar un lugar ----
  if v_toma and new.recovers_reservation_id is null
     and (tg_op = 'INSERT' or new.membership_id is null) then

    -- La excepción autorizada (0046). Pide las dos cosas: la clave y el
    -- motivo escrito. `override_by` lo pone la base con quien está
    -- logueado y nunca lo que mande el cliente.
    v_exc := new.override_reason is not null and btrim(new.override_reason) <> '';

    if v_exc and not public.can('reservas.excepcion') then
      raise exception 'No tenés permiso para autorizar una excepción.';
    end if;

    if not v_exc then
      new.override_by := null;
      new.override_reason := null;
    end if;

    v_mem := public.membresia_para(new.student_id, new.date);

    if v_mem is null then
      if not v_exc then
        raise exception
          'No tiene una membresía vigente para el % — asignale un plan antes de reservarle esa clase',
          to_char(new.date, 'DD/MM/YYYY');
      end if;
      -- Autorizada sin membresía: no hay a qué cobrársela.
      new.override_by := auth.uid();
      new.membership_id := null;
      return new;
    end if;

    select m.classes_total, m.classes_used_base + public.consumo_contadas(m.id)
    into v_total, v_usadas
    from public.memberships m where m.id = v_mem;

    if v_usadas >= v_total then
      if not v_exc then
        raise exception
          'Ya usó las % clases de su plan. Para reservarle igual, renovale la membresía o cambiale el plan',
          v_total;
      end if;
      -- Autorizada con el plan agotado: la clase va de más y no se
      -- descuenta, así el contador sigue diciendo "usó % de %".
      new.override_by := auth.uid();
      new.membership_id := null;
      return new;
    end if;

    -- Había lugar: la excepción no hacía falta, y guardarla igual dejaría
    -- una reserva común diciendo "autorizada por" en la ficha y en el
    -- portal. Se descarta y la reserva sigue el camino de siempre.
    new.override_by := null;
    new.override_reason := null;

    new.membership_id := v_mem;
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- 10. LA MODALIDAD DEL PLAN — el de la 0040, con otra frase
--
-- "Para anotarla en esta clase necesita el plan…" hablaba de ella en
-- tercera persona, y este error no lo ve sólo el mostrador: sale igual
-- cuando la reserva la intenta la propia clienta desde el portal. "Para
-- esta clase hace falta un plan de esa modalidad" se lee bien de los dos
-- lados.
-- ------------------------------------------------------------

create or replace function public.reserva_en_hora()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  -- Bandera y no una expresión con `and`: el AND de SQL no garantiza
  -- evaluación perezosa, y en un INSERT OLD no existe —es un registro sin
  -- asignar, no una fila de nulos— así que leerle un campo levanta
  -- 'record "old" is not assigned yet' y falla toda reserva nueva. La 0022
  -- ya lo dejó escrito para stamp_reservation; acá se respeta.
  v_reabre boolean := false;
  v_kind   text;
  v_disc   text;
  v_alumna uuid;
  v_mem    uuid;
  v_plan   text;
  v_dow    int;
  v_fecha  date;
  -- La identidad de la fila que va a QUEDAR. En un UPDATE no se lee de
  -- new: quien reactiva manda esas columnas y `consumir_clase` las clava
  -- después contra las de old, así que validar new sería validar lo que
  -- llegó y no lo que se escribe.
  v_clase  uuid;
  v_dia    date;
  v_inicio timestamptz;
  v_corte  int;
  v_dias   text[] := array['lunes', 'martes', 'miércoles', 'jueves',
                           'viernes', 'sábado', 'domingo'];
begin
  if tg_op = 'UPDATE' then
    -- Vuelve a tomar un lugar: 'lista de espera' entra porque anotarse en
    -- la espera de una clase que ya pasó tampoco tiene sentido, y sin ella
    -- cancelar y pasar a la espera era la puerta de atrás.
    v_reabre := new.status in ('confirmada', 'asistió', 'lista de espera')
                and old.status in ('cancelada', 'lista de espera', 'ofrecida');
  end if;

  -- En una rama y no en un `case`, por el mismo motivo que v_reabre: el
  -- manual garantiza que CASE evalúa solo el brazo elegido, pero el
  -- precedente de la casa (0022) es no depender del orden de evaluación
  -- cuando OLD está en juego, y acá no cuesta nada respetarlo.
  if tg_op = 'UPDATE' then
    v_clase  := old.class_id;
    v_dia    := old.date;
    v_alumna := old.student_id;
  else
    v_clase  := new.class_id;
    v_dia    := new.date;
    v_alumna := new.student_id;
  end if;

  if tg_op <> 'INSERT' and not v_reabre then
    return new;
  end if;

  select cs.kind, cs.day_of_week, cs.date, cs.discipline
  into v_kind, v_dow, v_fecha, v_disc
  from public.class_sessions cs where cs.id = v_clase;

  -- ---- La fecha tiene que ser un día en que esa clase se dicta ----
  --
  -- Solo en el INSERT: en una reactivación la fecha ya está escrita, y
  -- rechazarla ahí sería trabar la salida en vez de la entrada.
  --
  -- Y solo de hoy en adelante. La grilla cambia: el día que el estudio
  -- mueva una clase de los lunes a los martes, `day_of_week` pasa a decir
  -- martes y todas las fechas pasadas de esa clase dejan de cerrar. Sin
  -- este corte, cargar una reserva vieja —o volver a cargar un día entero
  -- después de un problema— se vuelve imposible, y el mensaje culparía a
  -- la fecha en vez de al cambio de grilla.
  --
  -- Hacia adelante no hay permiso que valga, y eso sí es a propósito: no
  -- es una excepción autorizada, es un dato que no cierra. Una reserva del
  -- martes contra la clase de los lunes no aparece en ninguna lista de
  -- asistentes y no la ve nadie hasta que la clienta reclama la clase que
  -- pagó.
  if tg_op = 'INSERT'
     and new.date >= (now() at time zone 'America/Argentina/Buenos_Aires')::date then
    if v_kind = 'especial' then
      if v_fecha is distinct from new.date then
        raise exception
          'Esa clase especial se dicta el %, no el %',
          to_char(v_fecha, 'DD/MM/YYYY'), to_char(new.date, 'DD/MM/YYYY');
      end if;
    elsif v_dow is not null
          and extract(isodow from new.date)::int - 1 <> v_dow then
      raise exception
        'Esa clase se dicta los %, y el % es %',
        v_dias[v_dow + 1],
        to_char(new.date, 'DD/MM/YYYY'),
        v_dias[extract(isodow from new.date)::int];
    end if;
  end if;

  -- ---- Y la clase tiene que ser de una disciplina que su plan habilita ----
  --
  -- Es la respuesta del estudio del 09/09, textual: "La membresia de Pilates
  -- Reformer NO podra combinarse con clases para embarazadas", con "cupos
  -- independientes" y "grilla separada".
  --
  -- Hasta hoy eso era una promesa de pantalla: el formulario de Planes
  -- rotula el campo "Disciplinas habilitadas *" y no deja guardar sin elegir
  -- al menos una, pero NADA lo validaba al reservar — ni el trigger de
  -- consumo, ni el de cupo, ni las políticas. El estudio iba a entrar a
  -- Planes, iba a destildar 'Pilates Embarazadas' de FE FLOW, y no iba a
  -- pasar nada.
  --
  -- POR QUÉ ACÁ Y NO EN `consumir_clase`, que era el lugar obvio porque ahí
  -- ya se resuelve la membresía: esa función arranca con
  -- `if not consumo_rige() then return new`. El freno de mano de la 0029
  -- apagaría también esta regla, y la disciplina que puede tomar una clienta
  -- no tiene nada que ver con si el descuento de clases está funcionando.
  -- Es el mismo criterio con el que la 0038 eligió este trigger.
  --
  -- Sin membresía no se dice nada: de eso se ocupa `consumir_clase`, y
  -- duplicar el mensaje acá sería contestar dos veces la misma pregunta con
  -- palabras distintas.
  --
  -- SIN SALIDA POR PERMISO, y es una decisión que conviene poder revisar:
  -- el estudio lo dijo en términos categóricos y las clases de embarazadas
  -- tienen cupo y profesora propios, así que meter a alguien de Reformer no
  -- es una excepción del mostrador, es romper la modalidad. Si mañana
  -- resulta que el mostrador necesita hacerlo, la salida es darle el plan
  -- que corresponde —que es una acción real del negocio— o agregarle acá el
  -- mismo escape por permiso que tiene el corte por horario.
  if v_disc is not null then
    v_mem := public.membresia_para(v_alumna, v_dia);
    if v_mem is not null then
      select p.name into v_plan
      from public.memberships m
      join public.plans p on p.id = m.plan_id
      where m.id = v_mem and not (v_disc = any (p.disciplines));

      if v_plan is not null then
        raise exception
          'El plan % no incluye %. Para esta clase hace falta un plan de esa modalidad',
          v_plan, v_disc;
      end if;
    end if;
  end if;

  -- ---- Recepción sí puede anotar después ----
  --
  -- El que llegó sin reserva y se la cargan cuando terminó. Las tres
  -- claves, no solo `reservas.crear`: el camino de UPDATE que este
  -- trigger frena lo ejercen acciones gobernadas por `reservas.editar`
  -- (confirmar desde la lista de espera) y `reservas.asistencia` (marcar
  -- presente), así que con el grupo Reservas en activo una profesora con
  -- asistencia y sin crear quedaría trabada.
  --
  -- `can()` en sombra responde el legado —admin y recepción— así que esto
  -- ya funciona hoy y sigue funcionando al encender el grupo. Ningún rol
  -- de clienta tiene estas claves, ni en sombra ni en la matriz sembrada;
  -- su puerta al insert es "alumno reserva" (0005:68-73). Por persona sí
  -- se le podrían dar desde la matriz de excepciones, y ahí el freno se
  -- afloja: es la misma propiedad que tiene cualquier otro permiso.
  if (select public.can('reservas.crear')
           or public.can('reservas.editar')
           or public.can('reservas.asistencia')) then
    return new;
  end if;

  -- Sin sesión es el service role, que no pasa por RLS. Hoy eso es la
  -- carga a mano desde el SQL Editor —lo que la vuelta atrás de abajo
  -- asume para poder anotar un día entero de clases viejas—, no el cron
  -- ni el webhook de Mercado Pago: ninguno de los dos escribe reservas.
  if auth.uid() is null then
    return new;
  end if;

  -- ---- Y la clase no puede haber empezado ----
  v_inicio := public.inicio_de_clase(v_clase, v_dia);
  if v_inicio is null then
    return new;   -- clase sin horario: no hay contra qué comparar
  end if;

  -- Sin el filtro por `rige`, a propósito: el portal lee este parámetro
  -- con settingNum, que tampoco lo mira, y las dos mitades de la misma
  -- regla tienen que leer el mismo número. Es lo que hace la 0029 con
  -- cancel_hours.
  select coalesce(nullif(s.value, '')::numeric, 0)::int into v_corte
  from public.studio_settings s
  where s.key = 'booking_cutoff_minutes';

  -- Con piso en cero: un margen negativo habilitaría reservar DESPUÉS de
  -- que la clase empezó, que es exactamente lo que este trigger existe
  -- para impedir. El parámetro puede endurecer la regla, no aflojarla, y
  -- se acota donde vive el dato y no en la pantalla.
  v_corte := greatest(coalesce(v_corte, 0), 0);

  if now() >= v_inicio - make_interval(mins => v_corte) then
    if v_corte > 0 then
      raise exception
        'La reserva de esa clase ya cerró: empieza a las % del % y se cierra % minutos antes. Para anotarte igual, pedilo en recepción',
        to_char(v_inicio at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI'),
        to_char(v_dia, 'DD/MM/YYYY'), v_corte;
    else
      raise exception
        'Esa clase ya empezó — era a las % del %. Para anotarte igual, pedilo en recepción',
        to_char(v_inicio at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI'),
        to_char(v_dia, 'DD/MM/YYYY');
    end if;
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- 11. SOLTAR EL TURNO FIJO DESDE EL PORTAL — el de la 0077
--
-- El motivo que queda escrito en el turno pasa de "Lo dejó la clienta
-- desde el portal" a "Lo dejó desde el portal": se lee en su ficha, así
-- que el sujeto se sobreentiende.
-- ------------------------------------------------------------

create or replace function public.soltar_turno_fijo_propio(p_slot uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_tocadas int;
begin
  update public.fixed_slots f
     set estado = 'liberado',
         motivo = 'Lo dejó desde el portal',
         liberado_at = now()
   where f.id = p_slot
     and f.student_id in (select public.my_student_ids())
     and f.estado <> 'liberado';

  get diagnostics v_tocadas = row_count;
  if v_tocadas = 0 then
    raise exception 'Ese horario fijo no es tuyo, o ya lo habías dejado.';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 12. TRES AYUDAS DE CONFIGURACIÓN QUE QUEDARON EN FEMENINO
--
-- No son avisos, pero las escribe la base y las lee el equipo, y son las
-- únicas que se salían de la regla de la 0033: quedaron en femenino
-- porque se escribieron después de ella, o —la de recuperación— porque
-- `masculinizar()` cambió "una alumna" por "un cliente" y dejó el resto
-- de la frase como estaba ("un cliente aparece en la lista de las que
-- dejaron de venir, para llamarla").
--
-- Van con `replace` sobre el tramo exacto y no pisando el texto entero:
-- si la fila no está, o alguien ya la corrigió, no cambia nada. Por eso
-- tampoco llevan chequeo al principio: no dan nada por existente.
-- ------------------------------------------------------------

update public.studio_settings
   set label = replace(label, 'para ponerla en la lista de contacto', 'para pasar a la lista de contacto'),
       help  = replace(help,
                 'un cliente aparece en la lista de las que dejaron de venir, para llamarla o escribirle',
                 'una persona pasa a la lista de quienes dejaron de venir, para llamarla o escribirle')
 where key = 'recovery_after_days'
   and (label like '%para ponerla en la lista de contacto%'
        or help like '%un cliente aparece en la lista de las que dejaron de venir%');

update public.studio_settings
   set help = replace(help, 'Con 4, la clienta 42 es "0042".', 'Con 4, la credencial 42 es "0042".')
 where key = 'credencial_digitos'
   and help like '%la clienta 42%';

update public.studio_settings
   set help = replace(help, 'La dirección con la que las clientas entran,', 'La dirección por la que se entra al portal,')
 where key = 'portal_url'
   and help like '%con la que las clientas entran%';

commit;

-- ------------------------------------------------------------
-- CÓMO VERIFICAR
-- ------------------------------------------------------------
--
-- 1. Que ninguna función vigente siga escribiendo plata por su cuenta
--    (tiene que dar cero filas; `pesos` es la única que puede usar esos
--    patrones):
--
--   select p.proname
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname <> 'pesos'
--      and p.prosrc ~ 'FM9|G999|999,999';
--
--    Si aparece `anular_cobro`, es la migración de "anular el cobro no
--    borra la deuda", que se escribió antes que esta y arma su mensaje
--    con el reemplazo a mano: da bien, pero conviene pasarla a `pesos()`.
--    `guard_periodo_liquidacion` puede aparecer también: se dejó afuera
--    a propósito (ver arriba).
--
-- 2. Que ninguna diga lo que se cambió (tiene que dar cero filas:
--    `turno_fijo_propio` la corrigió la 0082).
--    Las frases van enteras porque `prosrc` trae también los comentarios,
--    y ahí "la clienta" sigue apareciendo:
--
--   select p.proname
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.prosrc ~ 'Quedaste anotada|Para anotarla|Lo eligió la clienta|Lo dejó la clienta|ficha de la clienta|de este cliente|''otra profesora''|Cambió la profesora|''Nuevo cliente''|''Un cliente''';
--
-- 3. Por la pantalla, con datos de prueba y sin mail (que no le escriba
--    a nadie):
--
--    a) Cobrar la cuota de una ficha de prueba. En la campana del
--       mostrador: "… pagó $42.750 — FE START", con punto.
--    b) Desde la Agenda, anotar en una clase a una ficha de prueba que
--       tenga acceso al portal, y entrar al portal con esa sesión. En su
--       campana: "Tu lugar quedó reservado en Pilates Reformer del …".
--       Sin sesión de clienta a mano, alcanza con la fila:
--         select body from public.notifications
--          where type = 'reserva_confirmada' order by created_at desc limit 1;
--       Después cancelar la reserva (o borrarla), como siempre.
--    c) Caja → Cerrar, escribir un contado distinto del esperado y dejar
--       el motivo vacío. Tiene que rebotar con "La diferencia es de
--       -$1.000 y hace falta un motivo" (con el número que toque) y la
--       caja seguir abierta: el rechazo no escribe nada. Ojo que eso vale
--       mientras `caja_exige_motivo_diferencia` esté en 'true' y la
--       tolerancia en 0, como el 27/09; con el motivo apagado, el cierre
--       sale y hay que reabrirlo.
--    d) En Configuración, el parámetro de los días sin renovar se llama
--       "Días sin renovar para pasar a la lista de contacto" y su ayuda
--       ya no dice "las que dejaron de venir".
--
--    Los avisos viejos de la campana siguen diciendo "anotada" y
--    "$87,500": son los de antes, y quedan así a propósito.

-- ------------------------------------------------------------
-- VUELTA ATRÁS
--
-- No toca políticas ni datos de nadie, así que no hace falta una para
-- salir del paso: si una frase no gusta, se cambia en una migración
-- nueva. Si igual se quisiera volver a lo de antes, es volver a correr
-- cada función desde su migración de origen —la que se nombra en el
-- título de cada bloque— y, al final, cuando ya nadie la use:
--
--   drop function public.pesos(numeric);
-- ------------------------------------------------------------
