-- ============================================================
-- 0089 — Los datos para transferir, y los dos bancos del estudio
--
-- Lo pidió el estudio el 29/09: que la clienta vea a qué alias transferir.
-- Hasta hoy el portal le decía "pedí el link de pago por WhatsApp" y no le
-- daba ningún dato, y los campos de alias y CBU de las cuentas existían
-- desde la 0020 pero no los veía nadie más que el staff.
--
-- El estudio tiene dos cuentas: Galicia (casafe.galicia) y BBVA
-- (casafe.bbva). Cada medio de pago deposita en una cuenta fija
-- (`default_account_id`, 0074), así que con un solo "Transferencia" todo
-- sumaría en una y el saldo del sistema no coincidiría con ninguno de los
-- dos bancos. Matías eligió dos medios separados: al cobrar se elige en
-- cuál entró.
--
-- 1. La "Cuenta bancaria" que ya existía pasa a ser Galicia (conserva su
--    id: los cobros de transferencia que ya entraron quedan en Galicia) y
--    se agrega BBVA.
-- 2. "Transferencia" pasa a llamarse "Transferencia Galicia" —el código
--    sigue siendo 'transferencia', que es el que guardan los cobros— y se
--    agrega "Transferencia BBVA".
-- 3. La vista `cuentas_para_transferir`: nombre, banco, titular, alias y
--    CBU de las cuentas de banco y billetera activas que tengan alias o
--    CBU cargado. Sin saldos ni movimientos. La lee quien tiene sesión (la
--    clienta en su portal); la llave pública no, y NADIE la escribe: toda
--    vista nueva en `public` nace escribible para el navegador (0088).
--
-- Qué se le muestra a la clienta lo decide el estudio desde Configuración
-- → Cuentas: la cuenta que tenga alias o CBU cargado aparece; la que no,
-- no.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'accounts' and column_name = 'alias') then
    raise exception 'Falta public.accounts con alias y CBU. Revisar si corrió la 0020.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'payment_methods' and column_name = 'default_account_id') then
    raise exception 'Falta payment_methods.default_account_id. Revisar si corrió la 0074.';
  end if;
  if not exists (select 1 from public.accounts where id = 'a0000000-0000-4000-8000-000000000002') then
    raise exception 'No está la cuenta bancaria de siempre (a0000000-…-0002): revisar Configuración → Cuentas antes de correr esto.';
  end if;
  if not exists (select 1 from public.payment_methods where code = 'transferencia') then
    raise exception 'No está el medio "transferencia": revisar Configuración → Medios de pago antes de correr esto.';
  end if;
end
$$;

-- ------------------------------------------------------------
-- 1. Las dos cuentas
--
-- Los `update` sólo completan lo que está vacío o con el nombre de fábrica,
-- así que correrla de nuevo no pisa lo que el estudio haya corregido desde
-- Configuración.
-- ------------------------------------------------------------

update public.accounts
   set name = case when name = 'Cuenta bancaria' then 'Banco Galicia' else name end,
       bank_name = case when bank_name = '' then 'Galicia' else bank_name end,
       alias = case when alias = '' then 'casafe.galicia' else alias end
 where id = 'a0000000-0000-4000-8000-000000000002';

insert into public.accounts (id, name, kind, arquea, is_system, bank_name, alias, sort_order, active)
select 'a0000000-0000-4000-8000-000000000005', 'Banco BBVA', 'banco', false, false, 'BBVA', 'casafe.bbva', 25, true
 where not exists (select 1 from public.accounts where id = 'a0000000-0000-4000-8000-000000000005')
   and not exists (select 1 from public.accounts where lower(alias) = 'casafe.bbva');

-- ------------------------------------------------------------
-- 2. Los dos medios de transferencia
-- ------------------------------------------------------------

update public.payment_methods
   set name = 'Transferencia Galicia'
 where code = 'transferencia' and name = 'Transferencia';

insert into public.payment_methods (code, name, is_manual, active, sort_order, default_account_id, liquidacion, ajuste_pct)
select 'transferencia_bbva', 'Transferencia BBVA', true, true, 21,
       (select id from public.accounts where lower(alias) = 'casafe.bbva' order by sort_order limit 1),
       'inmediata', 0
 where not exists (select 1 from public.payment_methods where code = 'transferencia_bbva');

-- ------------------------------------------------------------
-- 3. La vista para la clienta
--
-- Sin `security_invoker` a propósito: la RLS de `accounts` no deja leer
-- cuentas a la clienta (y está bien, ahí hay saldos). La vista corre como
-- su dueño y expone sólo estas cinco columnas.
-- ------------------------------------------------------------

create or replace view public.cuentas_para_transferir as
select a.name, a.bank_name, a.holder, a.alias, a.cbu
  from public.accounts a
 where a.active
   and a.kind in ('banco', 'billetera')
   and (btrim(a.alias) <> '' or btrim(a.cbu) <> '')
 order by a.sort_order, a.name;

revoke all on public.cuentas_para_transferir from public, anon, authenticated;
grant select on public.cuentas_para_transferir to authenticated;

comment on view public.cuentas_para_transferir is
  'Alias y CBU que ve la clienta en el portal y en los mails de cuota. Sólo lectura, sólo con sesión (0089).';

-- La comprobación: dos cuentas con alias, dos medios, y la vista cerrada
-- a la escritura y a la llave pública.
do $$
begin
  if (select count(*) from public.cuentas_para_transferir
       where alias in ('casafe.galicia', 'casafe.bbva')) <> 2 then
    raise exception 'La vista no muestra las dos cuentas con alias.';
  end if;
  if (select count(*) from public.payment_methods
       where code in ('transferencia', 'transferencia_bbva') and active) <> 2 then
    raise exception 'No quedaron los dos medios de transferencia.';
  end if;
  if exists (select 1 from information_schema.role_table_grants
              where table_schema = 'public' and table_name = 'cuentas_para_transferir'
                and (grantee in ('anon', 'PUBLIC')
                     or (grantee = 'authenticated' and privilege_type <> 'SELECT'))) then
    raise exception 'La vista quedó abierta de más.';
  end if;
end
$$;

commit;

-- ------------------------------------------------------------
-- CÓMO VERIFICAR
-- ------------------------------------------------------------
--
--   select * from public.cuentas_para_transferir;
--   → Banco Galicia · casafe.galicia y Banco BBVA · casafe.bbva.
--   select code, name, default_account_id from public.payment_methods order by sort_order;
--   → Transferencia Galicia va a …0002 y Transferencia BBVA a …0005.
--
-- En pantalla: al cobrar aparecen los dos medios; en el portal de una
-- clienta con deuda aparecen los dos alias con su botón de copiar.
--
-- ------------------------------------------------------------
-- VUELTA ATRÁS (no toca políticas; los cobros que ya entraron por BBVA
-- quedan donde están)
-- ------------------------------------------------------------
--
--   drop view if exists public.cuentas_para_transferir;
--   update public.payment_methods set active = false where code = 'transferencia_bbva';
--   update public.payment_methods set name = 'Transferencia' where code = 'transferencia';
