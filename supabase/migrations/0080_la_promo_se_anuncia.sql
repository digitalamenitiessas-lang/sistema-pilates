-- 0080 — La promoción se anuncia
--
-- La 0079 dejó las promociones creables y cobrables, pero mudas: el
-- estudio carga un 20% de descuento y nadie se entera salvo que pase por
-- el mostrador. Un descuento que no se anuncia no cambia el
-- comportamiento de nadie, así que es plata resignada sin contrapartida.
--
-- Acá va lo único que la base necesita para que el anuncio exista: el
-- tipo de aviso. El envío lo hace /api/admin/promos/anunciar, y es
-- deliberadamente MANUAL —un botón, no un trigger—: mandar un mail a
-- todo el padrón no se deshace, y una promo recién creada se corrige
-- tres veces antes de quedar como va. El día que salga sola, saldrá con
-- el número equivocado.
--
-- OJO CON ESTE CHECK, QUE YA MORDIÓ
--
-- Un CHECK no se extiende: se reemplaza, así que hay que repetir la
-- lista ENTERA. Y la lista entera es la de la migración más alta que lo
-- define, que no es la que uno se acuerda. El primer intento de esta
-- migración copió la lista de la `0049` sin ver que la `0052` la había
-- vuelto a definir con cinco tipos más, y la base la rechazó con
-- `23514 ... is violated by some row`: había seis avisos
-- `reserva_confirmada` vivos que el CHECK nuevo dejaba afuera.
--
-- El mensaje no dice cuál es la fila ni cuál el valor, así que abajo va
-- primero un bloque que lo dice él. Si algún día vuelve a pasar, la
-- migración corta con el tipo que sobra escrito con todas las letras.

begin;

-- El aviso ANTES del daño. Sin esto, el rechazo de Postgres obliga a
-- adivinar qué tipo quedó afuera; con esto, lo nombra.
do $$
declare
  v_huerfanos text;
begin
  select string_agg(distinct type, ', ')
    into v_huerfanos
    from public.notifications
   where type not in (
     'pago_acreditado', 'nuevo_alumno',
     'membresia_por_vencer', 'membresia_vencida', 'deuda_vencida',
     'membresia_renovada',
     'caja_sin_cerrar', 'caja_diferencia', 'saldo_sin_imputar',
     'renovacion_omitida',
     'turno_liberado',
     'reserva_confirmada', 'clase_recordatorio', 'clase_suspendida',
     'clase_cambio_profesora', 'lugar_liberado',
     'promocion'
   );

  if v_huerfanos is not null then
    raise exception
      'La lista de tipos de esta migración está incompleta: hay avisos de tipo % que quedarían afuera. Agregalos a la lista de abajo (y a la vuelta atrás) antes de correrla.',
      v_huerfanos;
  end if;
end $$;

-- La lista es la de la 0052 —sus dieciséis, tal cual— más 'promocion'.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'pago_acreditado', 'nuevo_alumno',
  'membresia_por_vencer', 'membresia_vencida', 'deuda_vencida',
  'membresia_renovada',
  'caja_sin_cerrar', 'caja_diferencia', 'saldo_sin_imputar',
  'renovacion_omitida',
  'turno_liberado',
  'reserva_confirmada', 'clase_recordatorio', 'clase_suspendida',
  'clase_cambio_profesora', 'lugar_liberado',
  -- Nuevo: el estudio anunció una promoción. Va con audience 'alumno':
  -- es para la clienta, no para el mostrador, que ya la ve en el catálogo.
  'promocion'
));

commit;

-- ------------------------------------------------------------
-- CÓMO VERIFICAR
-- ------------------------------------------------------------
--
-- 1. Que el tipo nuevo entre y que la lista siga cubriendo lo de antes:
--
--   insert into public.notifications (type, title, body, audience, dedupe_key)
--   values ('promocion', 'prueba 0080', 'prueba 0080', 'alumno', 'prueba-0080');
--   delete from public.notifications where dedupe_key = 'prueba-0080';
--
--   El delete tiene que decir DELETE 1. Si el insert falla con 23514,
--   esta migración no corrió.
--
-- 2. Que ningún aviso vivo quede afuera del CHECK (tiene que dar cero filas):
--
--   select type, count(*) from public.notifications
--    group by type
--   having type not in (
--     'pago_acreditado','nuevo_alumno','membresia_por_vencer','membresia_vencida',
--     'deuda_vencida','membresia_renovada','caja_sin_cerrar','caja_diferencia',
--     'saldo_sin_imputar','renovacion_omitida','turno_liberado','reserva_confirmada',
--     'clase_recordatorio','clase_suspendida','clase_cambio_profesora','lugar_liberado',
--     'promocion');

-- ------------------------------------------------------------
-- VUELTA ATRÁS
--
-- Ojo: si ya se anunció alguna promo, hay que borrar esas filas antes,
-- o el CHECK viejo no se puede volver a crear — que es exactamente el
-- error que dio esta migración la primera vez.
-- ------------------------------------------------------------
--
--   begin;
--   delete from public.notifications where type = 'promocion';
--   alter table public.notifications drop constraint if exists notifications_type_check;
--   alter table public.notifications add constraint notifications_type_check check (type in (
--     'pago_acreditado', 'nuevo_alumno',
--     'membresia_por_vencer', 'membresia_vencida', 'deuda_vencida',
--     'membresia_renovada',
--     'caja_sin_cerrar', 'caja_diferencia', 'saldo_sin_imputar',
--     'renovacion_omitida',
--     'turno_liberado',
--     'reserva_confirmada', 'clase_recordatorio', 'clase_suspendida',
--     'clase_cambio_profesora', 'lugar_liberado'
--   ));
--   commit;
