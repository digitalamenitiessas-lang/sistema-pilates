-- ============================================================
-- 0086 — La promo respeta el recargo del medio de pago
--
-- EL SÍNTOMA
--
-- Visto en producción el 27/09: una cuota de FE FLOW de $70.000 con una
-- promo automática del 10%. En efectivo cobraba $63.000, bien. Con
-- TARJETA también cobraba $63.000, cuando esa misma cuota sin la promo
-- cuesta $87.500 con tarjeta. La 0079 hacía que la promo REEMPLAZARA al
-- ajuste del medio, y eso estaba pensado para el descuento del efectivo
-- —que no se sumen dos descuentos—, pero se llevaba puesto también el
-- recargo. Y el recargo no es un precio: existe para cubrir la comisión
-- de la tarjeta, que el estudio paga igual con promo o sin ella. Con la
-- regla de la 0079 cada promo le salía al estudio el 10% más la comisión
-- entera.
--
-- Decisión de Matías, 27/09: "que respete el recargo".
--
-- ANTES DE CORRERLA: PRIMERO EL DEPLOY
--
-- La pantalla de antes de esta migración anticipa el monto con la regla
-- de la 0079 sin preguntarle a la base. Con la 0086 corrida y esa
-- pantalla todavía en uso, el "Cobrar" diría $63.000 con tarjeta y la
-- base cobraría $78.750 — y con tarjeta lo que dice la pantalla es lo que
-- se marca en el posnet. La pantalla nueva, en cambio, anda con las dos
-- bases: le pregunta a `regla_del_cobro()` (punto 6) y anticipa la regla
-- que rige. Así que el orden es: mergear a main, esperar el deploy de
-- Vercel, recargar las pestañas abiertas del mostrador y recién ahí
-- correr esto.
--
-- LA REGLA NUEVA
--
--   · Si el medio tiene RECARGO, se cobra encima del precio con la promo:
--       70.000 → promo 10% → 63.000 → +25% → 78.750.
--     Con un monto fijo es lo mismo: 70.000 − 5.000 = 65.000 → 81.250.
--
--   · Si el medio tiene DESCUENTO, no se suman: queda el mayor de los
--     dos. Es lo que la 0079 quería y lo que el estudio definió el 23/09
--     (una promo del 20% en efectivo sale 56.000, no 53.200).
--
--   · El redondeo de `price_rounding` va UNA sola vez y al final, como
--     siempre.
--
-- LO QUE LA 0079 HACÍA MAL CON EL EFECTIVO, Y SE CORRIGE ACÁ
--
-- "La promo reemplaza al ajuste" no es "queda el mayor". Con una promo
-- más chica que el descuento del medio —una del 3% y el efectivo al −5%—
-- la 0079 cobraba $67.900: MÁS que los $66.500 que esa persona pagaba en
-- efectivo sin ninguna promo. Tener la promo le costaba $1.400, y encima
-- le gastaba un uso. Ahora cobra $66.500 y la promo no se aplica: no
-- queda en `promocion_id` y no gasta el uso, que se cuenta sobre los
-- cobros vivos con esa promo (0079).
--
-- Por lo mismo, la promo se aplica sólo si deja pagar MENOS, comparando
-- los dos números ya redondeados. En un empate —la promo del 5% contra
-- el −5% del efectivo, o un descuento tan chico que el redondeo lo
-- borra— gana el medio y el uso no se gasta: no hay nada que la persona
-- se haya llevado a cambio.
--
-- EL CUPÓN QUE NO GANA NO TAPA A LA AUTOMÁTICA
--
-- Desde la 0079, si alguien escribe un cupón se prueba ése y no la
-- automática. Mientras el cupón se aplicaba siempre, eso era una
-- elección. Con la regla nueva un cupón puede no ganarle al medio, y si
-- igual tapara a la automática, traerlo saldría más caro que no traerlo:
-- cupón del 3% y automática del 10% en efectivo, $66.500 con el cupón
-- escrito y $63.000 sin escribirlo. Ahora, si el cupón no gana, se prueba
-- la mejor automática, igual que si no se hubiera escrito nada; y el
-- cupón queda sin usar. Si el cupón gana, sigue siendo el que se aplica,
-- como hasta hoy.
--
-- Queda como estaba, porque es otra decisión: un cupón que SÍ gana tapa
-- a una automática que descuenta más. Cupón del 3% y automática del 10%
-- con tarjeta: $84.900 con el cupón escrito, $78.750 sin él. Viene de la
-- 0079 (el cupón que se escribe manda) y cambiarlo es elegir otra regla
-- de negocio, no arreglar ésta.
--
-- LA PROMO QUE NO GANÓ QUEDA ANOTADA
--
-- La 0083 le promete a quien pagó dentro de la ventana de una promo que
-- no la pierde si el estudio anula el cobro para corregirlo: la cuota
-- reabierta hereda `promocion_id`. Con la regla nueva, una promo que no
-- le ganó al efectivo deja `promocion_id` en nulo, y el caso que esa
-- migración pone de ejemplo —se cobró con el medio equivocado— la
-- perdía: efectivo a $66.500 sin promo, se anula, se vuelve a cobrar con
-- tarjeta cuando la ventana ya cerró, y sale $87.500 en vez de $83.150.
--
-- Por eso el cobro anota aparte la promo que le correspondía y no se
-- aplicó, en `promocion_ofrecida_id`, que no cuenta como uso; y
-- `anular_cobro` (0083) le pasa a la cuota reabierta la aplicada o, si no
-- hubo, ésa. Es lo único que cambia de esa función.
--
-- QUÉ DICE `descuento` CUANDO HAY RECARGO ENCIMA
--
-- La 0079 lo definió como `precio_lista − amount`, que con esta regla
-- dejaría de explicar el cobro: la cuota de arriba diría "descuento
-- −8.750" al lado del nombre de la promo, como si la promo hubiera
-- encarecido la cuota. Desde acá:
--
--   · Con promo, `descuento` es lo que descontó LA PROMO: precio de lista
--     menos el precio con la promo, redondeado. En el ejemplo, 7.000. Es
--     el mismo número en cualquier medio, y es el que contesta "cuánto le
--     costó esta promo al estudio".
--   · Sin promo, es lo que hizo el medio, como hasta hoy: positivo si
--     descontó (efectivo), negativo si recargó (tarjeta).
--   · El recargo que va encima de una promo no tiene columna propia:
--     es `amount − (precio_lista − descuento)`. En el ejemplo, 78.750 −
--     63.000 = 15.750, el 25% de 63.000. Una columna más obligaría a
--     rellenar hacia atrás cobros que ya están en arqueos cerrados, que
--     `guard_dia_cerrado` (0020) no deja tocar — y los de antes nunca
--     combinaron promo con recargo, así que para ellos la cuenta de
--     siempre, `amount = precio_lista − descuento`, sigue dando.
--
-- LA CUENTA VIVE EN UN SOLO LUGAR
--
-- La pantalla anticipa el número antes de cobrar, y hasta hoy lo hacía
-- con su propia copia de la regla. Para que no vuelvan a separarse, la
-- cuenta sale de `cobrar_cuota` a una función pura, `precio_de_cobro`,
-- que no lee ninguna tabla: recibe el precio, el ajuste, la promo y el
-- redondeo, y devuelve lo que se cobra. La pantalla la espeja en
-- `lib/precios.ts`, y para saber cuál de las dos reglas anticipar le
-- pregunta a `regla_del_cobro()`, que lo deduce del cuerpo mismo de
-- `cobrar_cuota`: si alguien la vuelve a la de la 0079, la respuesta
-- cambia sola.
--
-- LO QUE NO CAMBIA
--
-- La firma de `cobrar_cuota` y lo que devuelve: `promo` viene en nulo
-- cuando no se aplicó ninguna, que es lo que la pantalla ya leía como
-- "sin promo". Los rechazos y sus textos. Qué automática se prueba: la
-- que más descuenta, que es la mejor en cualquier medio —el recargo
-- multiplica a todas por igual—, así que `promociones_para` (0083) no se
-- toca.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase, DESPUÉS
-- del deploy (ver arriba). REQUIERE la 0020, la 0028, la 0079 y la 0083.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 0. EL CHEQUEO ANTES DE PISAR NADA
--
-- `cobrar_cuota` y `anular_cobro` se reescriben enteras a partir de su
-- última definición: la de la 0079 y la de la 0083 (ni la 0083 ni la
-- 0084 tocaron `cobrar_cuota`, y la 0084 no tocó `anular_cobro`). Si
-- después alguien redefinió una de las dos —en otra migración o a mano
-- en el SQL Editor—, pegar esta copia deshace ese arreglo sin avisar:
-- `create or replace` no compara nada. Por eso se mira que la versión
-- viva sea la de antes (primera vez) o ésta (si se vuelve a correr), y si
-- no es ninguna, corta.
--
-- Se compara el código entero y no una línea, por su huella: el md5 del
-- cuerpo sin los comentarios y con los espacios juntados. Una línea no
-- alcanza para ninguna de las dos. Un arreglo de la de antes puede no
-- tocar la línea que se mira, y cualquier arreglo posterior de
-- `cobrar_cuota` va a seguir llamando a `precio_de_cobro`: reconocerlo
-- como "la 0086 otra vez" lo pisaría. Los comentarios quedan afuera
-- porque la copia viva puede no ser letra por letra la del repo —el
-- 27/09 la 0084 cortó con otra función justo por eso— y lo que importa
-- es que el código sea el mismo.
--
-- Para mirarlo antes de correr nada, en el SQL Editor (sólo lee):
--
--   select p.oid::regprocedure,
--          md5(btrim(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
--     from pg_proc p
--    where p.oid in ('public.cobrar_cuota(uuid, text, text)'::regprocedure,
--                    'public.anular_cobro(uuid, text, text)'::regprocedure);
--
-- Tiene que dar la columna `antes` de abajo (o `esta`, si ya corrió).
-- Las huellas se anotan una sola vez, acá, y el punto 7 comprueba que
-- `esta` es la de lo que esta migración crea: si alguien toca un cuerpo y
-- no la huella, corta ahí antes de dejar una función que la próxima
-- corrida no reconocería.
-- ------------------------------------------------------------

create temp table huellas_0086 (
  firma  text primary key,
  origen text not null,
  antes  text not null,
  esta   text not null
) on commit drop;
insert into huellas_0086 values
  ('public.cobrar_cuota(uuid, text, text)', '0079', '0e41d88a64f86467972d3c3c3813f836', '81933ab1c0ed676e9dc497af5c2ee340'),
  ('public.anular_cobro(uuid, text, text)', '0083', '4a386dfde513be49481732de13d7611e', '3bed204d27c886986754d85e2c79f1ad');

do $guarda$
declare
  h      record;
  v_viva text;
begin
  if to_regprocedure('public.cobrar_cuota(uuid, text, text)') is null
     or to_regprocedure('public.promociones_para(uuid)') is null
     or to_regclass('public.promociones') is null then
    raise exception 'Falta cobrar_cuota(), promociones_para() o la tabla promociones. Revisar si corrió la 0079.';
  end if;

  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'payments'
         and column_name in ('precio_lista', 'promocion_id', 'descuento')) < 3 then
    raise exception 'Falta payments.precio_lista, promocion_id o descuento. Revisar si corrió la 0079.';
  end if;

  if to_regprocedure('public.anular_cobro(uuid, text, text)') is null
     or (select count(*) from information_schema.columns
          where table_schema = 'public' and table_name = 'payments'
            and column_name in ('origen', 'reabre_pago_id')) < 2 then
    raise exception 'Falta anular_cobro() o payments.origen / reabre_pago_id. Revisar si corrió la 0083.';
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'payment_methods'
                    and column_name = 'ajuste_pct') then
    raise exception 'Falta payment_methods.ajuste_pct. Revisar si corrió la 0028.';
  end if;

  if to_regprocedure('public.param(text, text)') is null then
    raise exception 'Falta public.param(). Revisar si corrió la 0020.';
  end if;

  for h in select * from pg_temp.huellas_0086 loop
    select md5(btrim(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
      into v_viva
      from pg_proc p
     where p.oid = to_regprocedure(h.firma);

    if v_viva is distinct from h.antes and v_viva is distinct from h.esta then
      raise exception
        '% no es la versión de la % ni la de la 0086 (su huella es %): la redefinió otra migración o se tocó a mano. Copiá esa versión acá antes de correr ésta.',
        h.firma, h.origen, v_viva;
    end if;
  end loop;
end
$guarda$;

-- ------------------------------------------------------------
-- 1. La promo que le correspondía y no se aplicó
--
-- Nula, y nula en todo lo de antes: hasta acá una promo se aplicaba
-- siempre, así que no hay nada que rellenar. Va aparte de
-- `promocion_id` porque ésa es la que cuenta los usos (0079): anotar ahí
-- una promo que no se aplicó le gastaría el uso a quien no se llevó
-- nada, y la sumaría al "cuánto costó esta promo".
-- ------------------------------------------------------------

alter table public.payments
  add column if not exists promocion_ofrecida_id uuid references public.promociones (id);

comment on column public.payments.promocion_ofrecida_id is
  'La promo que le correspondía a este cobro y no se aplicó porque el medio ya descontaba igual o más (0086). No cuenta como uso: sirve para que anular_cobro se la pase a la cuota reabierta.';

-- ------------------------------------------------------------
-- 2. El redondeo, una sola vez escrito
--
-- El mismo `case` que tenía `cobrar_cuota` desde la 0079, con el mismo
-- parámetro y el mismo respaldo ('cincuenta'). Sale a una función porque
-- ahora hay que redondear más de un número —el precio con la promo y el
-- precio sin ella— para compararlos, y dos copias del `case` son dos
-- lugares donde puede cambiar uno solo.
--
-- `round` redondea la mitad hacia arriba (para afuera del cero, pero acá
-- no hay montos negativos): 67.925 con 'cincuenta' da 67.950.
-- ------------------------------------------------------------

create or replace function public.redondear_precio(p_monto numeric, p_modo text)
returns numeric
language sql immutable parallel safe
set search_path = ''
as $$
  select case coalesce(nullif(p_modo, ''), 'cincuenta')
    when 'cien'        then round(p_monto / 100) * 100
    when 'cien_arriba' then ceil(p_monto / 100) * 100
    when 'ninguno'     then round(p_monto, 2)
    else                    round(p_monto / 50) * 50
  end
$$;

comment on function public.redondear_precio(numeric, text) is
  'El redondeo de price_rounding (0028): cincuenta, cien, cien_arriba o ninguno. Lo usa precio_de_cobro (0086).';

-- ------------------------------------------------------------
-- 3. La cuenta del cobro
--
-- Pura: no lee ninguna tabla ni ningún parámetro, todo le llega. Así
-- contesta lo mismo que cuando cobra `cobrar_cuota`, y se puede probar
-- sin datos.
--
-- `p_promo_tipo` en nulo es "sin promo". `aplica_promo` dice si la promo
-- ganó: cuando no, el cobro sale sin ella y sin gastarle el uso.
-- ------------------------------------------------------------

create or replace function public.precio_de_cobro(
  p_lista       numeric,
  p_ajuste_pct  numeric,
  p_promo_tipo  text,
  p_promo_valor numeric,
  p_redondeo    text
)
returns table (cobrado numeric, descuento numeric, aplica_promo boolean)
language plpgsql immutable
set search_path = ''
as $$
declare
  v_ajuste    numeric := coalesce(p_ajuste_pct, 0);
  v_sin_promo numeric;
  v_con_promo numeric;
  v_con_todo  numeric;
begin
  -- Lo que se cobra sin promo: el ajuste del medio, sea descuento o
  -- recargo. Es la cuenta de siempre (0028) y el número contra el que la
  -- promo tiene que ganar.
  v_sin_promo := public.redondear_precio(p_lista * (1 + v_ajuste / 100), p_redondeo);

  if p_promo_tipo is not null then
    v_con_promo := case when p_promo_tipo = 'porcentaje'
                        then p_lista * (1 - p_promo_valor / 100)
                        else p_lista - p_promo_valor end;
    -- Un descuento no puede dejar la cuota en negativo (0079).
    if v_con_promo < 0 then v_con_promo := 0; end if;

    -- El recargo va encima del precio con la promo. El descuento del
    -- medio, en cambio, no se le suma: compite con ella abajo.
    v_con_todo := public.redondear_precio(
      v_con_promo * (1 + greatest(v_ajuste, 0) / 100), p_redondeo);

    -- La promo se aplica sólo si deja pagar menos que el medio solo. En
    -- el empate gana el medio: no hay nada por lo que gastar el uso.
    if v_con_todo < v_sin_promo then
      cobrado      := v_con_todo;
      -- Lo que descontó la promo, no lo que sumó el recargo: el mismo
      -- número en cualquier medio (ver el encabezado).
      descuento    := p_lista - public.redondear_precio(v_con_promo, p_redondeo);
      aplica_promo := true;
      return next;
      return;
    end if;
  end if;

  cobrado      := v_sin_promo;
  descuento    := p_lista - v_sin_promo;
  aplica_promo := false;
  return next;
end;
$$;

comment on function public.precio_de_cobro(numeric, numeric, text, numeric, text) is
  'Lo que se cobra por una cuota (0086): el recargo del medio va encima del precio con la promo; el descuento del medio no se suma, queda el mayor. Pura. La usa cobrar_cuota, y la pantalla la espeja en lib/precios.ts.';

-- Cerrada para quien no tiene sesión, como las que cerró la 0073. No
-- contesta nada que quien la llama no le haya pasado, pero no hay por qué
-- dejar abierta una puerta que nadie de afuera necesita.
revoke all on function public.redondear_precio(numeric, text) from public, anon;
grant execute on function public.redondear_precio(numeric, text) to authenticated;
revoke all on function public.precio_de_cobro(numeric, numeric, text, numeric, text) from public, anon;
grant execute on function public.precio_de_cobro(numeric, numeric, text, numeric, text) to authenticated;

-- Y se prueba acá mismo, antes de que la use el cobro: si una cuenta da
-- mal, es mejor que la migración corte a que el lunes se cobre mal. Son
-- los casos del pedido, con 'cincuenta' como en producción.
do $$
declare
  v_casos text[] := array[
    -- lista, ajuste, tipo, valor,  cobrado, descuento, aplica
    array['70000', '25', '',           '',     '87500', '-17500', 'f'],  -- tarjeta sin promo
    array['70000', '-5', '',           '',     '66500',   '3500', 'f'],  -- efectivo sin promo
    array['70000',  '0', '',           '',     '70000',      '0', 'f'],  -- transferencia
    array['70000', '25', 'porcentaje', '10',   '78750',   '7000', 't'],  -- EL CASO: recargo encima
    array['70000', '-5', 'porcentaje', '10',   '63000',   '7000', 't'],  -- gana la promo
    array['70000',  '0', 'porcentaje', '10',   '63000',   '7000', 't'],
    array['70000', '-5', 'porcentaje', '20',   '56000',  '14000', 't'],  -- la decisión del 23/09
    array['70000', '-5', 'porcentaje', '3',    '66500',   '3500', 'f'],  -- gana el efectivo
    array['70000', '-5', 'porcentaje', '5',    '66500',   '3500', 'f'],  -- empate: gana el medio
    array['70000', '25', 'monto',      '5000', '81250',   '5000', 't'],  -- monto fijo con recargo
    array['70000', '25', 'monto',      '90000',    '0',  '70000', 't'],  -- no queda negativa
    array['70000',  '0', 'monto',      '10',   '70000',      '0', 'f']   -- el redondeo la borra
  ];
  c text[];
  r record;
begin
  foreach c slice 1 in array v_casos loop
    select * into r from public.precio_de_cobro(
      c[1]::numeric, c[2]::numeric, nullif(c[3], ''), nullif(c[4], '')::numeric, 'cincuenta');
    if r.cobrado <> c[5]::numeric or r.descuento <> c[6]::numeric or r.aplica_promo <> c[7]::boolean then
      raise exception 'precio_de_cobro(%, %, %, %) dio % / % / % y tenía que dar % / % / %',
        c[1], c[2], nullif(c[3], ''), nullif(c[4], ''),
        r.cobrado, r.descuento, r.aplica_promo, c[5], c[6], c[7];
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 4. El cobro
--
-- El cuerpo de la 0079 con la cuenta cambiada y el cupón que no gana
-- cediéndole el lugar a la automática. El permiso, el `for update`, los
-- rechazos y sus textos van igual.
-- ------------------------------------------------------------

create or replace function public.cobrar_cuota(
  p_payment uuid,
  p_method  text,
  p_codigo  text default null
)
returns table (comprobante bigint, cobrado numeric, lista numeric, promo text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_pago      record;
  v_cand      record;
  v_cuenta    record;
  v_ajuste    numeric;
  v_bruto     numeric;
  v_redondeo  text;
  v_final     numeric;
  v_descuento numeric;
  v_promo_id  uuid;
  v_promo_nom text;
  v_ofrecida  uuid;
begin
  if not public.can('pagos.registrar') then
    raise exception 'No tenés permiso para cobrar.';
  end if;

  select * into v_pago from public.payments where id = p_payment for update;
  if not found then
    raise exception 'Esa cuota no existe.';
  end if;
  if v_pago.status = 'pagado' then
    raise exception 'Esa cuota ya está cobrada (comprobante %).',
      coalesce(v_pago.receipt_number::text, 's/n');
  end if;
  if v_pago.status = 'anulado' then
    raise exception 'Esa cuota está anulada: no se puede cobrar.';
  end if;

  -- El precio de lista es lo que la cuota decía antes de tocarla.
  v_bruto := v_pago.amount;

  -- El ajuste del medio se lee siempre, haya promo o no: la 0079 lo leía
  -- sólo sin promo, y por eso la promo se comía el recargo.
  select pm.ajuste_pct into v_ajuste
    from public.payment_methods pm where pm.code = p_method;
  v_ajuste := coalesce(v_ajuste, 0);

  -- El mismo redondeo de siempre, con el mismo parámetro. Lo aplica
  -- `precio_de_cobro`, una sola vez y al final.
  v_redondeo := coalesce(nullif(public.param('price_rounding', 'cincuenta'), ''), 'cincuenta');

  -- Sin promo, el medio solo: es lo que se cobra si ninguna gana.
  select pc.cobrado, pc.descuento into v_final, v_descuento
    from public.precio_de_cobro(v_bruto, v_ajuste, null, null, v_redondeo) pc;

  if p_codigo is not null and btrim(p_codigo) <> '' then
    -- Con cupón: tiene que existir Y servirle a esta cuota. Los dos
    -- rechazos van separados porque significan cosas distintas para quien
    -- está en el mostrador con la persona enfrente.
    if not exists (select 1 from public.promociones
                    where upper(codigo) = upper(btrim(p_codigo))) then
      raise exception 'No existe ninguna promoción con el código %.', upper(btrim(p_codigo));
    end if;
    select pp.id, pp.nombre, pp.tipo, pp.valor into v_cand
      from public.promociones_para(p_payment) pp
     where upper(pp.codigo) = upper(btrim(p_codigo));
    if not found then
      raise exception 'El código % no se puede usar en esta cuota: puede estar vencido, agotado o ser de otro plan.',
        upper(btrim(p_codigo));
    end if;

    -- El cupón se prueba primero: es el que pidió quien lo trajo (0079).
    v_ofrecida := v_cand.id;
    select * into v_cuenta
      from public.precio_de_cobro(v_bruto, v_ajuste, v_cand.tipo, v_cand.valor, v_redondeo);
    if v_cuenta.aplica_promo then
      v_final     := v_cuenta.cobrado;
      v_descuento := v_cuenta.descuento;
      v_promo_id  := v_cand.id;
      v_promo_nom := v_cand.nombre;
    end if;
  end if;

  -- La mejor automática: sin cupón, o con un cupón que no le ganó al
  -- medio. Si ese cupón la tapara, traerlo saldría más caro que no
  -- traerlo. Las que tienen código quedan afuera: un cupón no se aplica
  -- solo.
  if v_promo_id is null then
    select pp.id, pp.nombre, pp.tipo, pp.valor into v_cand
      from public.promociones_para(p_payment) pp
     where pp.codigo is null limit 1;
    if found then
      v_ofrecida := coalesce(v_ofrecida, v_cand.id);
      select * into v_cuenta
        from public.precio_de_cobro(v_bruto, v_ajuste, v_cand.tipo, v_cand.valor, v_redondeo);
      if v_cuenta.aplica_promo then
        v_final     := v_cuenta.cobrado;
        v_descuento := v_cuenta.descuento;
        v_promo_id  := v_cand.id;
        v_promo_nom := v_cand.nombre;
      end if;
    end if;
  end if;

  -- Si ninguna promo ganó, el cobro sale sin ella: no queda nombrada ni
  -- le gasta el uso, que se cuenta por `promocion_id` sobre los cobrados.
  -- La que le correspondía queda anotada aparte (punto 1), para que
  -- anular el cobro para corregirlo no se la haga perder.
  update public.payments
     set status = 'pagado',
         method = p_method,
         paid_at = now(),
         amount = v_final,
         precio_lista = v_bruto,
         promocion_id = v_promo_id,
         promocion_ofrecida_id = case when v_promo_id is null then v_ofrecida end,
         descuento = v_descuento
   where id = p_payment
  returning receipt_number into comprobante;

  cobrado := v_final;
  lista   := v_bruto;
  promo   := v_promo_nom;
  return next;
end;
$$;

revoke all on function public.cobrar_cuota(uuid, text, text) from public, anon;
grant execute on function public.cobrar_cuota(uuid, text, text) to authenticated;

-- ------------------------------------------------------------
-- 5. Anular un cobro, conservando la promo que le correspondía
--
-- El cuerpo de la 0083 letra por letra, salvo la promo de la cuota
-- reabierta: la aplicada o, si no hubo, la que no se aplicó porque el
-- medio descontaba igual o más (punto 1). Sin esto, la promesa de la
-- 0083 —quien pagó dentro de la ventana no la pierde por una corrección—
-- se rompía justo con una promo de pago temprano chica y el efectivo.
-- ------------------------------------------------------------

create or replace function public.anular_cobro(
  p_payment uuid,
  p_motivo  text,
  p_queda   text
)
returns table (
  comprobante   bigint,
  anulado       numeric,
  -- Lo que quedó de verdad, que puede no ser lo que se pidió: 'debe',
  -- 'nada' o 'renovacion'.
  queda         text,
  -- La gemela, o la oferta que se devolvió.
  cuota_nueva   uuid,
  debe          numeric,
  vence         date,
  promo         text,
  -- El período que se borró al deshacer la renovación.
  periodo_desde date,
  periodo_hasta date,
  -- Por qué no se hizo lo que se pidió, o lo que conviene saber.
  aviso         text
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_pago   record;
  v_m      record;
  v_vieja  record;
  v_otro   record;
  v_hoy    date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_comp   text;
  v_gracia text;
  v_lista  numeric;
  v_n      int;
  v_promo  uuid;
begin
  -- La misma clave que exige la restrictiva "anular exige permiso" (0013)
  -- cuando se anula con un update. La gemela no pide `pagos.registrar`:
  -- no es un cobro nuevo, es la deuda que el cobro había saldado.
  if not public.can('pagos.anular') then
    raise exception 'No tenés permiso para anular cobros.';
  end if;

  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'La anulación necesita un motivo: queda escrito en el cobro.';
  end if;

  -- Sin valor por defecto a propósito: qué queda después es una decisión
  -- de quien anula, y un default la tomaría por ella.
  if p_queda is null or p_queda not in ('debe', 'nada', 'renovacion') then
    raise exception 'Falta decir qué queda después de anular: la deuda, nada, o deshacer la renovación.';
  end if;

  select * into v_pago from public.payments where id = p_payment for update;
  if not found then
    raise exception 'Ese cobro no existe.';
  end if;
  if v_pago.status = 'anulado' then
    raise exception 'Ese cobro ya estaba anulado.';
  end if;
  if v_pago.status <> 'pagado' then
    raise exception 'Esa cuota todavía no se cobró: no hay cobro que anular. Si no corresponde, anulá la cuota.';
  end if;

  v_comp := '#' || lpad(coalesce(v_pago.receipt_number::text, '0'), 6, '0');

  -- La nota, igual que la escribía `voidPayment`: lo que ya tenía, y el
  -- motivo a continuación.
  update public.payments
     set status = 'anulado',
         notes = concat_ws(' · ',
                           nullif(btrim(coalesce(notes, '')), ''),
                           'Anulado: ' || btrim(p_motivo))
   where id = p_payment;

  -- Si no había sello —un cobro de Mercado Pago no tiene sesión, o el
  -- sello falló—, se crea con el instante del cobro y sin quién cobró,
  -- que es lo que se sabe.
  insert into public.payment_staff (payment_id, cobrado_at, anulado_por, anulado_at)
  values (p_payment, v_pago.paid_at, auth.uid(), now())
  on conflict (payment_id) do update
     set anulado_por = excluded.anulado_por,
         anulado_at  = excluded.anulado_at;

  comprobante := v_pago.receipt_number;
  anulado     := v_pago.amount;
  queda       := 'nada';

  if p_queda = 'nada' then
    return next;
    return;
  end if;

  -- ----------------------------------------------------------
  -- Deshacer la renovación
  --
  -- Acá lo que no se puede hacer frena todo, incluida la anulación: quien
  -- pidió deshacer no pidió dejar el período sin deuda, y hacer la mitad
  -- sería decidir por ella.
  -- ----------------------------------------------------------
  if p_queda = 'renovacion' then
    if v_pago.renueva_membresia_id is null then
      raise exception 'Ese cobro no es de una renovación: no hay renovación que deshacer.';
    end if;
    if v_pago.membership_id is null then
      raise exception 'Ese cobro no llegó a crear ningún período, así que no hay renovación que deshacer: anulalo sin deuda.';
    end if;
    if not public.can('membresias.eliminar') then
      raise exception 'Deshacer la renovación borra el período que creó, y eso pide el permiso de eliminar membresías. Anulalo dejando la deuda o sin deuda, y que alguien con ese permiso deshaga el período desde la ficha.';
    end if;

    select m.id, m.student_id, m.start_date, m.end_date, m.classes_used
      into v_m
      from public.memberships m
     where m.id = v_pago.membership_id
       for update;
    if not found then
      raise exception 'El período que creó ese cobro ya no existe.';
    end if;

    -- Las condiciones de `eliminar_membresia` (0071): se borra sólo lo
    -- que no dejó huella.
    if v_m.classes_used > 0 then
      raise exception
        'El período que creó ya tiene % clase(s) usada(s), así que no se puede deshacer. Anulalo dejando la deuda, o sin deuda y cancelá el período desde su ficha.',
        v_m.classes_used;
    end if;
    select count(*) into v_n from public.reservations r where r.membership_id = v_m.id;
    if v_n > 0 then
      raise exception
        'El período que creó ya tiene % reserva(s) hechas contra él, así que no se puede deshacer. Anulalo dejando la deuda, o sin deuda y cancelá el período desde su ficha.',
        v_n;
    end if;
    -- Otra cuota o cobro colgado del período, o su propia oferta de
    -- renovación: la clave ajena los dejaría vivos y sin período, o sea
    -- una deuda de algo que no existe.
    if exists (select 1 from public.payments q
                where (q.membership_id = v_m.id or q.renueva_membresia_id = v_m.id)
                  and q.id <> p_payment
                  and q.status <> 'anulado') then
      raise exception 'El período que creó ya tiene otras cuotas o cobros, así que no se puede deshacer. Anulalo dejando la deuda o sin deuda.';
    end if;
    if exists (select 1 from public.memberships d
                where d.student_id = v_m.student_id
                  and d.id <> v_m.id
                  and d.status <> 'cancelada'
                  and d.start_date > v_m.end_date) then
      raise exception 'Hay otro período encolado detrás del que creó este cobro: borrarlo dejaría un hueco. Anulalo dejando la deuda o sin deuda.';
    end if;

    update public.payments
       set notes = notes || ' · Se deshizo la renovación: se borró el período del '
                 || to_char(v_m.start_date, 'DD/MM/YYYY') || ' al '
                 || to_char(v_m.end_date, 'DD/MM/YYYY') || '.'
     where id = p_payment;

    -- La clave ajena (`on delete set null`) le saca el período al cobro
    -- anulado, que queda con su comprobante y apuntando a lo que renovaba.
    delete from public.memberships where id = v_m.id;

    queda         := 'renovacion';
    periodo_desde := v_m.start_date;
    periodo_hasta := v_m.end_date;

    select m.id, m.end_date, m.status into v_vieja
      from public.memberships m
     where m.id = v_pago.renueva_membresia_id;

    if not found then
      aviso := 'La membresía que renovaba ya no existe, así que no se le vuelve a ofrecer la renovación.';
    elsif v_vieja.status = 'cancelada' then
      aviso := 'La membresía que renovaba está cancelada, así que no se le vuelve a ofrecer la renovación.';
    elsif v_vieja.end_date + 1 < v_hoy then
      aviso := 'La oferta de renovación vencía el ' || to_char(v_vieja.end_date + 1, 'DD/MM/YYYY')
            || ', así que no se le vuelve a ofrecer. Si quiere seguir, asignale el plan desde su ficha.';
    else
      -- La oferta como la emite el proceso diario (0041): sin período, con
      -- el vencimiento en el día siguiente al fin. Sin la promo del cobro:
      -- esto vuelve las cosas a antes de que se cobrara, y la promo se
      -- mide de nuevo cuando lo pague.
      insert into public.payments
        (student_id, concept, amount, due_date, status,
         renueva_membresia_id, origen, reabre_pago_id, notes)
      values
        (v_pago.student_id, v_pago.concept, coalesce(v_pago.precio_lista, v_pago.amount),
         v_vieja.end_date + 1, 'pendiente', v_vieja.id, 'cuota', p_payment,
         'Oferta devuelta al anular el comprobante ' || v_comp || ': ' || btrim(p_motivo))
      on conflict (renueva_membresia_id)
        where renueva_membresia_id is not null and status <> 'anulado'
        do nothing
      returning id, amount, due_date into cuota_nueva, debe, vence;

      if cuota_nueva is null then
        aviso := 'Ya tenía otra oferta de renovación viva, así que no se emitió una nueva.';
      end if;
    end if;

    return next;
    return;
  end if;

  -- ----------------------------------------------------------
  -- Vuelve a deber
  -- ----------------------------------------------------------
  if v_pago.origen = 'suelto' then
    aviso := 'Ese cobro se cargó como "Otro cobro": no saldó ninguna cuota, así que no hay deuda que reabrir.';
  elsif v_pago.membership_id is null and v_pago.renueva_membresia_id is not null then
    aviso := 'Ese cobro no llegó a crear ningún período, así que no hay deuda que reabrir.';
  elsif v_pago.membership_id is null then
    aviso := 'Ese cobro no está colgado de ningún período, así que no hay cuota que reabrir.';
  else
    -- Se toma la membresía para que dos anulaciones del mismo período no
    -- corran a la par: anulando a la vez las dos cuotas cobradas de un
    -- mes, cada una vería a la otra todavía pagada y ninguna reabriría.
    -- `no key update` es el lock más liviano que choca consigo mismo. Una
    -- reserva contra este período actualiza `classes_used` y espera lo que
    -- dure la anulación, que son milisegundos.
    select m.id, m.status, m.start_date, m.price
      into v_m
      from public.memberships m
     where m.id = v_pago.membership_id
       for no key update;

    if not found then
      aviso := 'El período de ese cobro ya no existe, así que no hay cuota que reabrir.';
    elsif v_m.status = 'cancelada' then
      aviso := 'El período de ese cobro está cancelado: no se le vuelve a cobrar.';
    else
      select q.receipt_number into v_otro
        from public.payments q
       where q.membership_id = v_m.id
         and q.id <> p_payment
         and q.status = 'pagado'
         and q.origen = 'cuota'
       order by q.paid_at
       limit 1;
      if found then
        aviso := 'El período sigue pago con el comprobante #'
          || lpad(coalesce(v_otro.receipt_number::text, '0'), 6, '0')
          || ': no queda debiendo nada.';
      else
        select q.amount into v_otro
          from public.payments q
         where q.membership_id = v_m.id
           and q.id <> p_payment
           and q.status = 'pendiente'
           and q.renueva_membresia_id is null
           and q.origen = 'cuota'
         limit 1;
        if found then
          -- El separador va literal: la `G` de `to_char` usa el locale de
          -- la base, que es inglés (lo mismo que en la 0055).
          aviso := 'Ese período ya tiene una cuota pendiente de $'
            || replace(trim(to_char(v_otro.amount, 'FM999,999,999')), ',', '.')
            || ': la deuda ya figura y no se duplica.';
        end if;
      end if;
    end if;
  end if;

  if aviso is null then
    v_lista := coalesce(
      v_pago.precio_lista,
      case
        when v_pago.renueva_membresia_id is null
         and not exists (select 1 from public.payments r
                          where r.membership_id = v_m.id
                            and r.renueva_membresia_id is not null)
        then nullif(v_m.price, 0)
      end,
      v_pago.amount);
    if v_lista <= 0 then
      aviso := 'El cobro era de $0: no hay deuda que reabrir.';
    end if;
  end if;

  if aviso is null then
    -- Un número mal escrito en Configuración no puede impedir anular: cae
    -- al mismo 5 que usa la pantalla cuando el parámetro no está.
    v_gracia := btrim(public.param('payment_grace_days', '5'));
    vence := greatest(v_hoy, v_m.start_date)
             + case when v_gracia ~ '^\d{1,3}$' then v_gracia::int else 5 end;
    debe := v_lista;

    -- 0086: la promo con que se cobró o, si no se aplicó porque el medio
    -- ya descontaba igual o más, la que le correspondía. Sin la segunda,
    -- quien pagó en efectivo dentro de la ventana de la promo y se
    -- corrigió después a tarjeta la perdía.
    v_promo := coalesce(v_pago.promocion_id, v_pago.promocion_ofrecida_id);

    insert into public.payments
      (student_id, membership_id, concept, amount, due_date, status,
       origen, reabre_pago_id, promocion_id, notes)
    values
      (v_pago.student_id, v_m.id, v_pago.concept, debe, vence, 'pendiente',
       'cuota', p_payment, v_promo,
       'Reabierta al anular el comprobante ' || v_comp || ': ' || btrim(p_motivo))
    returning id into cuota_nueva;

    queda := 'debe';
    if v_promo is not null then
      select pr.nombre into promo from public.promociones pr where pr.id = v_promo;
    end if;
  end if;

  return next;
end;
$$;

comment on function public.anular_cobro(uuid, text, text) is
  'Anula un cobro y deja lo que se pida: la cuota pendiente otra vez (debe), nada, o la renovación deshecha (0083). Devuelve lo que hizo; aviso dice por qué no, si no lo hizo.';

revoke all on function public.anular_cobro(uuid, text, text) from public, anon;
grant execute on function public.anular_cobro(uuid, text, text) to authenticated;

-- ------------------------------------------------------------
-- 6. Con qué regla cobra la base, para la pantalla
--
-- La pantalla anticipa el monto antes de cobrar, y con tarjeta las dos
-- reglas dan números distintos ($78.750 contra $63.000). Tiene que saber
-- cuál rige, y lo único que cambió es el cuerpo de `cobrar_cuota`, que
-- desde el navegador no se ve. Que exista `precio_de_cobro` no alcanza:
-- si alguien vuelve `cobrar_cuota` a la de la 0079 y la función pura
-- queda, la pantalla prometería la regla nueva y la base cobraría la
-- vieja. Por eso se le pregunta al cuerpo mismo: si llama a
-- `precio_de_cobro`, es ésta.
--
-- Sin esta función (la 0086 no corrió) la pantalla anticipa la de la
-- 0079. Si otra migración cambia la regla otra vez, tiene que cambiar
-- también esta respuesta, y la pantalla trata lo que no conoce como "no
-- sé": no promete un número.
--
-- `security definer` para no depender de que quien pregunta pueda leer
-- `pg_proc`; no contesta nada más que una palabra.
-- ------------------------------------------------------------

create or replace function public.regla_del_cobro()
returns text
language sql stable security definer set search_path = ''
as $$
  select case when position('public.precio_de_cobro(' in p.prosrc) > 0
              then 'respeta_recargo'
              else 'reemplaza' end
    from pg_catalog.pg_proc p
   where p.oid = to_regprocedure('public.cobrar_cuota(uuid, text, text)')
$$;

comment on function public.regla_del_cobro() is
  'Con qué regla combina cobrar_cuota la promo con el ajuste del medio: respeta_recargo (0086) o reemplaza (0079). La lee la pantalla para anticipar el monto.';

revoke all on function public.regla_del_cobro() from public, anon;
grant execute on function public.regla_del_cobro() to authenticated;

-- ------------------------------------------------------------
-- 7. Las huellas y la regla, comprobadas
--
-- Lo que se acaba de crear tiene que tener las huellas que anota el
-- punto 0: si no, la próxima vez que se corra esta migración no
-- reconocería su propia versión y cortaría. Y la regla que ve la
-- pantalla tiene que ser la nueva.
-- ------------------------------------------------------------

do $$
declare
  h record;
  v_viva text;
begin
  for h in select * from pg_temp.huellas_0086 loop
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

  if public.regla_del_cobro() is distinct from 'respeta_recargo' then
    raise exception 'regla_del_cobro() dice % y tenía que decir respeta_recargo.', public.regla_del_cobro();
  end if;
end $$;

comment on column public.payments.descuento is
  'Con promo (promocion_id), lo que descontó la promo: precio_lista menos el precio con la promo. Sin promo, lo que hizo el medio: positivo descuenta, negativo es el recargo. Si hubo promo y recargo, el recargo es amount − (precio_lista − descuento) (0086).';

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
-- 0. Que esté hecho el deploy de la pantalla nueva y recargadas las
--    pestañas del mostrador (ver el encabezado). Si no, no correrla.
--
-- 1. Que la cuenta y la regla sean las nuevas (la migración ya lo probó
--    al correr, esto es para verlo):
--
--    select public.regla_del_cobro();
--    -- respeta_recargo
--    select * from public.precio_de_cobro(70000, 25, 'porcentaje', 10, 'cincuenta');
--    -- 78750 | 7000 | t
--    select * from public.precio_de_cobro(70000, -5, 'porcentaje', 3, 'cincuenta');
--    -- 66500 | 3500 | f
--
-- 2. Por la pantalla, con una ficha de prueba y sin mail. La prueba va
--    con un CUPÓN y no con una automática: un cupón se aplica sólo si
--    alguien lo escribe, así que no toca los cobros de verdad que se
--    hagan mientras tanto. En Configuración, "Prueba 0086", 10%, con el
--    código PRUEBA86, encendida. "Cobrar" una cuota de $70.000 de la
--    ficha de prueba con PRUEBA86 escrito:
--      · con transferencia: $63.000;
--      · con efectivo: $63.000, y dice que el descuento del efectivo no
--        se suma;
--      · con tarjeta: $78.750, con la promo y el recargo por separado.
--    Cobrar con tarjeta. En la base:
--
--    select amount, precio_lista, descuento, promocion_id is not null as con_promo
--      from public.payments where id = '<la cuota>';
--    -- 78750 | 70000 | 7000 | t
--
-- 3. El cupón más chico que el efectivo: cambiar "Prueba 0086" al 3% y
--    cobrar otra cuota de $70.000 en efectivo con PRUEBA86 escrito. La
--    pantalla dice que el cupón no se aplica y queda sin usar; la base:
--
--    select amount, precio_lista, descuento, promocion_id is not null as con_promo,
--           promocion_ofrecida_id is not null as anotada
--      from public.payments where id = '<la cuota>';
--    -- 66500 | 70000 | 3500 | f | t
--
--    Ojo: si en ese momento hay una promo AUTOMÁTICA encendida, en este
--    paso entra ésa en lugar del cupón (es la regla: el cupón que no gana
--    no la tapa), y los números cambian. Mirar Configuración antes.
--
-- 4. Que la promo sobreviva a la corrección: anular ese último cobro con
--    "Vuelve a deber". La cuota reabierta nace con la promo:
--
--    select pr.nombre from public.payments p join public.promociones pr on pr.id = p.promocion_id
--     where p.reabre_pago_id = '<el cobro anulado>';
--    -- Prueba 0086
--
--    Cobrarla con tarjeta, sin escribir nada: $84.900, con la promo.
--
-- 5. Limpiar: anular los cobros con "No queda debiendo" para que no
--    quede plata de prueba en la caja, borrar la ficha de prueba y
--    después la promo desde el SQL Editor:
--      delete from public.promociones where nombre = 'Prueba 0086';
--
-- PARA VOLVER ATRÁS
--
-- Todo junto, en una transacción: una vuelta atrás a medias es peor que
-- ninguna. La pantalla no depende del orden —deduce la regla del cuerpo
-- de `cobrar_cuota`—, pero `anular_cobro` de esta versión lee la columna
-- que se borra al final.
--
--   begin;
--   -- a) Pegar acá el punto 4 de la 0079 entero (cobrar_cuota: la promo
--   --    reemplaza al ajuste del medio).
--   -- b) Pegar acá el punto 3 de la 0083 entero (anular_cobro).
--   drop function if exists public.regla_del_cobro();
--   drop function if exists public.precio_de_cobro(numeric, numeric, text, numeric, text);
--   drop function if exists public.redondear_precio(numeric, text);
--   alter table public.payments drop column if exists promocion_ofrecida_id;
--   comment on column public.payments.descuento is
--     'Cuánto se descontó respecto de precio_lista. Positivo descuenta, negativo es el recargo del medio.';
--   commit;
--
--   La pantalla vuelve sola a anticipar la regla de la 0079: sin
--   `regla_del_cobro` entiende que la base es la de antes. Los cobros
--   hechos con promo y recargo quedan como se cobraron; su `descuento`
--   sigue siendo el de la promo, y el recargo se lee igual que arriba.
--   Las promos anotadas en `promocion_ofrecida_id` se pierden con la
--   columna; las cuotas reabiertas que ya la heredaron la conservan.
-- ============================================================
