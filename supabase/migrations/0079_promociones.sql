-- ============================================================
-- 0079 — Promociones: el estudio crea sus descuentos
--
-- Lo pidió el estudio el 23/09: "poder crear descuentos: por ejemplo los
-- diez primeros días del mes hay un descuento de tanto por ciento, tal
-- cupón, tantas limitaciones de uso. Que eso lo gestione desde admin."
--
-- LA DECISIÓN QUE ORDENA TODO: EL MONTO LO CALCULA LA BASE
--
-- Hoy no. `precioConAjuste` es una función del navegador sin equivalente
-- acá, `payments.amount` no tiene ningún CHECK, y `collectPayment` es un
-- update directo: quien tiene permiso de cobrar escribe el número que
-- quiera. Mientras el único ajuste era el −5% del efectivo eso se
-- toleraba, porque el número salía de un parámetro que el estudio mismo
-- carga y no había nada que hacer cumplir.
--
-- Con promociones deja de tolerarse. Un tope de "50 usos" o de "una por
-- clienta" que el navegador cuenta no es un tope: dos pestañas abiertas
-- lo pasan. Y un descuento que el cliente calcula no es un descuento, es
-- una sugerencia. Por eso el cobro pasa a hacerse con `cobrar_cuota()`,
-- que resuelve la promo, hace la cuenta, cuenta los usos y escribe — todo
-- adentro, en una transacción.
--
-- QUÉ QUEDA REGISTRADO, Y POR QUÉ IMPORTA
--
-- Hasta acá, cobrar PISABA `amount` con el monto cobrado y el precio de
-- lista se perdía: con el −5% de efectivo no hay forma de reconstruir de
-- cuánto partió. Con promociones eso sería peor —el estudio no podría
-- contestar cuánto le costó una promo— así que el cobro guarda las tres
-- cosas: de cuánto partió, qué promo se aplicó y cuánto se descontó.
--
-- LAS TRES FORMAS DE VENTANA
--
--   'siempre'   → sin ventana; vale mientras esté activa.
--   'fechas'    → entre dos fechas concretas. Una promo de una vez.
--   'dias_mes'  → del día N al M de CADA mes. Es la del pedido: "los
--                 diez primeros días".
--
-- Es la misma decisión que tomó la 0036 con `duration_months` frente a
-- `duration_days`: una columna nueva con su significado propio en vez de
-- reinterpretar la que había. Guardar "los primeros 10 de cada mes" como
-- un rango de fechas obligaría a reescribirlo todos los meses.
--
-- SE MIDE CONTRA EL DÍA DEL COBRO. Una promo de "los primeros diez días"
-- existe para que paguen temprano, así que se mide cuando pagan y no
-- contra el vencimiento de la cuota — que además, con el encolado de la
-- 0036, puede caer dos meses después.
--
-- LA PROMO REEMPLAZA AL AJUSTE DEL MEDIO, no se suma. Lo definió el
-- estudio: una cuota de $70.000 con una promo del 20% pagada en efectivo
-- sale $56.000 y no $53.200. Protege el margen y es una sola cuenta para
-- explicar.
--
-- EL USO SE GASTA CUANDO ENTRA LA PLATA, no al aplicar la promo. Y si el
-- cobro se anula, el uso vuelve — se cuenta sobre los cobros vivos, que
-- es como el proyecto ya resolvió lo mismo dos veces (el tope de
-- recuperaciones de la 0046 y el de devoluciones de la 0076).
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. El catálogo
-- ------------------------------------------------------------

create table if not exists public.promociones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,

  tipo text not null default 'porcentaje'
    check (tipo in ('porcentaje', 'monto')),
  -- En 'porcentaje' es cuánto descuenta (20 = 20%); en 'monto', los pesos
  -- que se restan. Siempre positivo: un descuento que suma sería un
  -- recargo, y eso ya vive en el medio de pago.
  valor numeric(12,2) not null check (valor > 0),

  ventana text not null default 'siempre'
    check (ventana in ('siempre', 'fechas', 'dias_mes')),
  desde date,
  hasta date,
  dia_desde int check (dia_desde between 1 and 31),
  dia_hasta int check (dia_hasta between 1 and 31),

  -- Nulo = automática: se aplica sola a quien cumpla. Con código, hay que
  -- escribirlo. El único texto único que una persona tipea en este
  -- sistema, así que se normaliza al guardar y se compara en mayúsculas.
  codigo text unique,

  -- Nulos = sin tope.
  usos_max int check (usos_max is null or usos_max > 0),
  usos_por_cliente int check (usos_por_cliente is null or usos_por_cliente > 0),

  -- Vacío = todos los planes.
  planes uuid[] not null default '{}',

  active boolean not null default true,
  -- El patrón de la 0046 y la 0076: la fila puede existir sin regir. Una
  -- promo a medio cargar no descuenta nada hasta que alguien la enciende.
  rige boolean not null default false,

  sort_order int not null default 100,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- Las dos formas de ventana exigen sus datos, y la base lo hace cumplir:
-- una promo 'dias_mes' sin días es una promo que no se sabe cuándo vale.
alter table public.promociones
  drop constraint if exists promociones_ventana_check;
alter table public.promociones
  add constraint promociones_ventana_check check (
    (ventana = 'siempre')
    or (ventana = 'fechas'   and desde is not null and hasta is not null and hasta >= desde)
    or (ventana = 'dias_mes' and dia_desde is not null and dia_hasta is not null and dia_hasta >= dia_desde)
  );

create index if not exists promociones_vivas_idx
  on public.promociones (active, rige) where active and rige;

comment on table public.promociones is
  'Descuentos que el estudio crea y edita. El monto final lo resuelve cobrar_cuota(), nunca el navegador.';

-- ------------------------------------------------------------
-- 2. Lo que el cobro tiene que recordar
--
-- Tres columnas nulables: las cuotas viejas no las tienen y no se
-- inventan hacia atrás. `precio_lista` se llena recién al cobrar, que es
-- cuando `amount` se pisa.
-- ------------------------------------------------------------

alter table public.payments
  add column if not exists precio_lista numeric(12,2),
  add column if not exists promocion_id uuid references public.promociones (id),
  add column if not exists descuento numeric(12,2);

comment on column public.payments.precio_lista is
  'De cuánto partió, antes de la promo o del ajuste del medio. Nulo en los cobros anteriores a la 0079.';
comment on column public.payments.descuento is
  'Cuánto se descontó respecto de precio_lista. Positivo descuenta, negativo es el recargo del medio.';

-- ------------------------------------------------------------
-- 3. Qué promociones le sirven a una cuota, hoy
--
-- Se usa para dos cosas: que la pantalla ofrezca las automáticas, y que
-- el cobro valide la que le mandan. Una sola definición de "aplica".
-- ------------------------------------------------------------

create or replace function public.promociones_para(p_payment uuid)
returns table (
  id uuid, nombre text, tipo text, valor numeric,
  codigo text, usos_restantes int
)
language sql stable security definer set search_path = ''
as $$
  with pago as (
    select p.id, p.student_id, p.amount,
           -- El plan sale de la membresía, que es el vínculo real. El
           -- nombre del concepto es el respaldo para la cuota de
           -- renovación, que nace con `membership_id` en nulo a propósito
           -- (0041): la membresía que cobra todavía no existe.
           --
           -- Va como subconsulta con `limit 1` y no como join: `plans.name`
           -- NO es único —el catálogo deja repetir nombres— y un join
           -- duplicaría la fila del pago, multiplicando las promociones
           -- que se le ofrecen.
           coalesce(
             m.plan_id,
             (select pl.id from public.plans pl
               where pl.name = p.concept order by pl.active desc limit 1)
           ) as plan_id
      from public.payments p
      left join public.memberships m on m.id = p.membership_id
     where p.id = p_payment
  ),
  hoy as (select (now() at time zone 'America/Argentina/Buenos_Aires')::date as d)
  select pr.id, pr.nombre, pr.tipo, pr.valor, pr.codigo,
         case when pr.usos_max is null then null
              else greatest(0, pr.usos_max - (
                select count(*)::int from public.payments q
                 where q.promocion_id = pr.id and q.status = 'pagado')) end
    from public.promociones pr, pago, hoy
   where pr.active and pr.rige
     -- La ventana, medida contra el día del cobro.
     and (
       pr.ventana = 'siempre'
       or (pr.ventana = 'fechas'   and hoy.d between pr.desde and pr.hasta)
       or (pr.ventana = 'dias_mes' and extract(day from hoy.d) between pr.dia_desde and pr.dia_hasta)
     )
     -- El plan, si la promo se limitó a algunos.
     and (cardinality(pr.planes) = 0 or pago.plan_id = any(pr.planes))
     -- El tope total.
     and (pr.usos_max is null or (
       select count(*) from public.payments q
        where q.promocion_id = pr.id and q.status = 'pagado') < pr.usos_max)
     -- El tope por clienta.
     and (pr.usos_por_cliente is null or (
       select count(*) from public.payments q
        where q.promocion_id = pr.id and q.status = 'pagado'
          and q.student_id = pago.student_id) < pr.usos_por_cliente)
   order by
     -- La que más descuenta primero: si hay dos automáticas, se ofrece la
     -- mejor para la clienta. Con código no hay competencia, porque lo
     -- elige quien lo escribe.
     case when pr.tipo = 'porcentaje' then pago.amount * pr.valor / 100 else pr.valor end desc
$$;

revoke all on function public.promociones_para(uuid) from public, anon;
grant execute on function public.promociones_para(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. El cobro, con la cuenta adentro
--
-- Reemplaza al update directo que hacía el navegador. Resuelve la promo,
-- hace la cuenta, redondea con el mismo parámetro de siempre y escribe.
--
-- `for update` sobre la fila del pago: es la herramienta de carrera que
-- este proyecto usa —no hay advisory locks en ningún lado— y alcanza para
-- lo que importa, que es que el mismo pago no se cobre dos veces. El tope
-- total se lee adentro de la misma transacción, así que dos cobros
-- simultáneos del último cupón se serializan por la fila de cada pago y
-- el segundo ve el uso del primero.
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
  v_pago    record;
  v_ajuste  numeric := 0;
  v_promo   record;
  v_bruto   numeric;
  v_redondeo text;
  v_final   numeric;
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

  if p_codigo is not null and btrim(p_codigo) <> '' then
    -- Con cupón: tiene que existir Y servirle a esta cuota. Los dos
    -- rechazos van separados porque significan cosas distintas para quien
    -- está en el mostrador con la clienta enfrente.
    if not exists (select 1 from public.promociones
                    where upper(codigo) = upper(btrim(p_codigo))) then
      raise exception 'No existe ninguna promoción con el código %.', upper(btrim(p_codigo));
    end if;
    select * into v_promo from public.promociones_para(p_payment) pp
     where upper(pp.codigo) = upper(btrim(p_codigo));
    if not found then
      raise exception 'El código % no se puede usar en esta cuota: puede estar vencido, agotado o ser de otro plan.',
        upper(btrim(p_codigo));
    end if;
  else
    -- Sin cupón: la mejor automática, si hay alguna. Las que tienen
    -- código quedan afuera — un cupón no se aplica solo.
    select * into v_promo from public.promociones_para(p_payment) pp
     where pp.codigo is null limit 1;
  end if;

  if v_promo.id is not null then
    -- LA PROMO MANDA Y EL AJUSTE DEL MEDIO NO SE APLICA. Decisión del
    -- estudio (23/09): no se encadenan ni se suman.
    v_final := case when v_promo.tipo = 'porcentaje'
                    then v_bruto * (1 - v_promo.valor / 100)
                    else v_bruto - v_promo.valor end;
    -- Un descuento no puede dejar la cuota en negativo.
    if v_final < 0 then v_final := 0; end if;
  else
    -- Sin promo, la cuenta de siempre: el ajuste del medio de pago.
    select coalesce(pm.ajuste_pct, 0) into v_ajuste
      from public.payment_methods pm where pm.code = p_method;
    v_final := v_bruto * (1 + coalesce(v_ajuste, 0) / 100);
  end if;

  -- El mismo redondeo que venía haciendo el navegador, con el mismo
  -- parámetro. Se aplica UNA sola vez y al final.
  v_redondeo := coalesce(nullif(public.param('price_rounding', 'cincuenta'), ''), 'cincuenta');
  v_final := case v_redondeo
    when 'cien'        then round(v_final / 100) * 100
    when 'cien_arriba' then ceil(v_final / 100) * 100
    when 'ninguno'     then round(v_final, 2)
    else                    round(v_final / 50) * 50
  end;

  update public.payments
     set status = 'pagado',
         method = p_method,
         paid_at = now(),
         amount = v_final,
         precio_lista = v_bruto,
         promocion_id = v_promo.id,
         descuento = v_bruto - v_final
   where id = p_payment
  returning receipt_number into comprobante;

  cobrado := v_final;
  lista   := v_bruto;
  promo   := v_promo.nombre;
  return next;
end;
$$;

revoke all on function public.cobrar_cuota(uuid, text, text) from public, anon;
grant execute on function public.cobrar_cuota(uuid, text, text) to authenticated;

-- ------------------------------------------------------------
-- 5. Quién puede administrarlas
--
-- Clave nueva, y con el preset cargado en la misma migración: una clave
-- declarada en sombra con `legacy_roles = '{}'` no la tiene NADIE, ni el
-- admin, porque en sombra `can()` resuelve por el legado. Es la trampa
-- que la 0020 ya documentó, y por eso ésta nace 'activo' con su fila en
-- la matriz — las dos escrituras juntas, que es lo que mantiene sana a
-- perm_diff().
--
-- Administrar promociones es configuración de precios, no operación de
-- mostrador: va sólo para admin. Aplicar una al cobrar no lleva clave
-- propia — ya la cubre `pagos.registrar`, que es quien cobra.
-- ------------------------------------------------------------

insert into public.permission_keys (clave, etiqueta, ayuda, grupo, orden, tipo, legacy_roles) values
  ('promos.administrar', 'Crear y editar promociones',
   'Crear descuentos y cupones, ponerles vigencia y límites de uso, y encenderlos. Es configuración de precios: quien la tiene decide cuánto entra por cada cuota.',
   'Planes', 60, 'permiso', '{}')
on conflict (clave) do nothing;

delete from public.role_permissions where clave = 'promos.administrar';
insert into public.role_permissions (role, clave) values ('admin', 'promos.administrar')
on conflict do nothing;

update public.permission_keys set enforce_mode = 'activo' where clave = 'promos.administrar';

alter table public.promociones enable row level security;

-- Leerlas es de cualquiera con sesión: el mostrador tiene que ver qué
-- promo se aplicó, y la pantalla de cobro necesita ofrecerlas.
create policy "promos: ver" on public.promociones for select
  using (auth.uid() is not null);

create policy "promos: crear" on public.promociones for insert
  with check ((select public.can('promos.administrar')));

create policy "promos: editar" on public.promociones for update
  using ((select public.can('promos.administrar')));

-- Sin delete: una promoción con cobros hechos no se borra, se apaga. Sus
-- cobros la siguen nombrando.

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
-- 1. Nada cambió todavía: no hay ninguna promoción cargada.
--
--    select count(*) from public.promociones;   -- 0
--
--    Y cobrar sigue dando lo mismo que antes, con el ajuste del medio:
--    una cuota de 70.000 en efectivo (−5%) tiene que dar 66.500.
--
-- 2. Cargar la del pedido, desde Configuración o a mano:
--
--    insert into public.promociones (nombre, tipo, valor, ventana, dia_desde, dia_hasta, rige)
--    values ('Pago temprano', 'porcentaje', 20, 'dias_mes', 1, 10, true);
--
--    Entre el 1 y el 10 tiene que aplicarse sola; del 11 en adelante, no.
--
-- 3. Un cupón con tope:
--
--    insert into public.promociones (nombre, tipo, valor, codigo, usos_max, rige)
--    values ('Trae una amiga', 'monto', 10000, 'AMIGA', 2, true);
--
--    El tercer uso tiene que rechazar con "puede estar vencido, agotado o
--    ser de otro plan".
--
-- 4. Que la promo REEMPLACE al medio y no se sume: cobrar en efectivo una
--    cuota de 70.000 con la promo del 20% tiene que dar 56.000, no 53.200.
--
-- 5. Que quede el rastro:
--
--    select receipt_number, precio_lista, amount, descuento, pr.nombre
--      from public.payments p left join public.promociones pr on pr.id = p.promocion_id
--     where p.status = 'pagado' order by p.paid_at desc limit 5;
--
-- 6. Y que anular devuelva el uso: anular el cobro y volver a pedir
--    `promociones_para` sobre otra cuota — el cupón tiene que volver a
--    tener un uso disponible, porque se cuentan los cobros 'pagado'.
--
-- PARA VOLVER ATRÁS
--
--   begin;
--   drop function if exists public.cobrar_cuota(uuid, text, text);
--   drop function if exists public.promociones_para(uuid);
--   alter table public.payments
--     drop column if exists precio_lista,
--     drop column if exists promocion_id,
--     drop column if exists descuento;
--   drop table if exists public.promociones;
--   delete from public.role_permissions where clave = 'promos.administrar';
--   delete from public.permission_keys  where clave = 'promos.administrar';
--   commit;
--
--   Ojo: eso borra el rastro de los descuentos ya aplicados. Los montos
--   cobrados no se tocan, pero deja de poder explicarse por qué fueron
--   esos. Si ya hubo cobros con promo, conviene apagar las promociones
--   (active = false) en vez de volver atrás.
-- ============================================================
