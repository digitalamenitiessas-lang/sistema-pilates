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
-- CÓMO VERIFICAR
--   select unnest(enum_range(null::text)) ;  -- no: es un CHECK, no un enum
--   -- Que el tipo nuevo entre:
--   insert into public.notifications (type, title, body, audience, dedupe_key)
--   values ('promocion', 'prueba', 'prueba', 'alumno', 'prueba-0080');
--   delete from public.notifications where dedupe_key = 'prueba-0080';
--   -- Tiene que devolver 1 fila borrada. Si el insert falla con 23514,
--   -- esta migración no corrió.

begin;

-- Se repite la lista entera y no se "agrega" el valor: un CHECK no se
-- extiende, se reemplaza. La lista es la de la 0049 más 'promocion'.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'pago_acreditado', 'nuevo_alumno',
  'membresia_por_vencer', 'membresia_vencida', 'deuda_vencida',
  'membresia_renovada',
  'caja_sin_cerrar', 'caja_diferencia', 'saldo_sin_imputar',
  'renovacion_omitida',
  'turno_liberado',
  -- Nuevo: el estudio anunció una promoción. Va con audience 'alumno':
  -- es para la clienta, no para el mostrador, que ya la ve en el catálogo.
  'promocion'
));

commit;

-- ------------------------------------------------------------
-- VUELTA ATRÁS
--
-- Ojo: si ya se anunció alguna promo, hay que borrar esas filas antes,
-- o el CHECK viejo no se puede volver a crear.
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
--     'turno_liberado'
--   ));
--   commit;
