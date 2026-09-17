-- ============================================================
-- 0066 — Un cierre correcto dejaba "algo que revisar" para siempre
--
-- Encontrado el 17/09 ejerciendo el turno de caja completo por primera
-- vez: abrir, cobrar $19.000 en efectivo, cerrar contando $18.000 y
-- explicando el faltante. El cierre funcionó bien —el arqueo quedó
-- firmado, el movimiento de ajuste se asentó con su motivo y el saldo del
-- cajón quedó en los $18.000 contados— y ACTO SEGUIDO la pantalla de Caja
-- mostró:
--
--     Hay algo que revisar
--     arqueo desactualizado · Caja del mostrador · $1.000
--
-- Sin que nadie hiciera nada más.
--
-- POR QUÉ
--
-- El chequeo 2 de `caja_control()` existe para detectar un arqueo firmado
-- que dejó de coincidir con el libro: alguien anula un cobro de un turno
-- ya cerrado y el número firmado deja de explicarse. Compara
-- `saldo_esperado` contra `saldo_inicial + los movimientos del rango`.
--
-- Pero el cierre inserta el ajuste de la diferencia con `at = v_hasta`, y
-- el rango del chequeo es `at > desde and at <= hasta`. O sea que **el
-- ajuste cae adentro del turno que lo creó**. Y ese ajuste existe
-- justamente para que el saldo del sistema pase a ser el contado, así que
-- después de insertarlo la igualdad ya no puede dar: el libro del rango
-- vale lo contado ($18.000) y `saldo_esperado` vale lo que el libro decía
-- antes de contar ($19.000).
--
-- Resultado: **cada cierre que no cierre justo deja una fila permanente**
-- en la cajita roja, imposible de sacar. A los tres días son cinco o seis
-- cosas "que revisar" que no significan nada, y ahí la encargada deja de
-- mirar la cajita — que es lo único que el módulo tiene para avisar de un
-- problema de verdad.
--
-- EL ARREGLO: SE COMPARA CONTRA LO CONTADO
--
-- No hay que excluir el ajuste ni moverle la fecha. Después de un cierre
-- correcto la invariante es otra, y es más fuerte: **el libro del rango
-- vale exactamente lo que se contó**. Para eso se insertó el ajuste.
--
--   saldo_inicial + movimientos(desde, hasta) = saldo_real
--
-- Y esa igualdad se rompe con lo mismo que el chequeo quería detectar: si
-- mañana alguien anula el cobro de $19.000 de ese turno, el libro del
-- rango pasa a valer -$1.000 y deja de coincidir con los $18.000
-- firmados. Sale la alerta, y el monto que informa es el tamaño del
-- cambio posterior —lo que hay que explicar— en vez de la diferencia
-- original del arqueo, que ya está explicada y firmada.
--
-- Un cierre sin diferencia tampoco cambia: no hay ajuste, el libro vale
-- $19.000 y `saldo_real` vale $19.000.
--
-- Es un cambio de dos palabras (`saldo_esperado` → `saldo_real`) y el
-- resto del cuerpo queda igual.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

create or replace function public.caja_control()
returns table (problema text, cuenta text, referencia text, monto numeric)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.can('caja.ver') then
    raise exception 'No tenés permiso para auditar la caja';
  end if;

  return query
  -- 1. Un cobro cobrado que no cayó en ninguna cuenta: no puede pasar
  --    (el disparador lo imputa), y si pasa, el libro tiene un agujero.
  select 'cobro sin cuenta'::text, '—'::text, p.id::text, p.amount
    from public.payments p
   where p.status = 'pagado' and p.account_id is null
  union all
  -- 2. Un arqueo firmado que ya no coincide con el libro: pasó cuando
  --    alguien anuló un cobro de un turno cerrado. No es un error, es lo
  --    que hay que poder explicar.
  --
  --    Se compara contra `saldo_real` —lo que se contó— y no contra
  --    `saldo_esperado`. El ajuste del arqueo se asienta DENTRO del rango
  --    del turno que lo creó, y existe para que el libro pase a valer lo
  --    contado: comparar contra lo esperado hacía que todo cierre con
  --    diferencia se denunciara a sí mismo para siempre (0066).
  select 'arqueo desactualizado', a.name, s.id::text,
         s.saldo_real - (s.saldo_inicial + coalesce((
           select sum(case when l.sentido = 'ingreso' then l.monto else -l.monto end)
             from public.account_ledger l
            where l.account_id = s.account_id
              and l.at > s.desde and l.at <= s.hasta), 0))
    from public.cash_sessions s
    join public.accounts a on a.id = s.account_id
   where s.closed_at is not null
     and s.saldo_real <> (s.saldo_inicial + coalesce((
           select sum(case when l.sentido = 'ingreso' then l.monto else -l.monto end)
             from public.account_ledger l
            where l.account_id = s.account_id
              and l.at > s.desde and l.at <= s.hasta), 0))
  union all
  -- 3. Un medio de pago activo sin cuenta: sus cobros van a "A imputar".
  select 'medio de pago sin cuenta', '—', pm.code, 0::numeric
    from public.payment_methods pm
   where pm.active and pm.default_account_id is null
  union all
  -- 4. Plata en una cuenta dada de baja.
  select 'cuenta inactiva con saldo', b.name, b.account_id::text, b.saldo
    from public.account_balances b
   where not b.active and b.saldo <> 0;
end;
$$;

revoke all on function public.caja_control() from public, anon;
grant execute on function public.caja_control() to authenticated;

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
-- Desde el SQL Editor la función rechaza (no hay sesión, can() da false).
-- Con la sesión de un admin, en la pantalla de Caja:
--
--   -- 1. Con el cierre con diferencia que ya está hecho, la cajita roja
--   --    tiene que DESAPARECER. Antes de esta migración decía
--   --    "arqueo desactualizado · Caja del mostrador · $1.000".
--
--   -- 2. Y el chequeo tiene que seguir sirviendo para lo que es: anular
--   --    un cobro de un turno ya cerrado tiene que hacerla aparecer, con
--   --    el monto del cobro anulado.
--
--   -- 3. Un cierre sin diferencia no deja nada: contar exactamente lo que
--   --    dice "Debería haber" y la cajita tiene que quedar vacía.
--
-- PARA VOLVER ATRÁS
--
--   Volver a correr el bloque 12 de la `0020`, que es este mismo cuerpo
--   con `saldo_esperado` en lugar de `saldo_real`. Ojo: volver atrás es
--   volver a que cada cierre con diferencia se denuncie a sí mismo.
-- ============================================================
