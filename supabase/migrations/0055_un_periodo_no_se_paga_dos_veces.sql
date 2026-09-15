-- ============================================================
-- 0055 — Un período no se paga dos veces
--
-- Encontrado el mismo día que la 0054, contestando cómo se encadenan los
-- períodos.
--
-- EL AGUJERO
--
-- La 0054 puso un índice único sobre `(teacher_id, desde, hasta)`. Eso
-- impide cerrar DOS VECES EL MISMO período, que era la mitad del
-- problema. La otra mitad es que dos períodos que **se pisan** sin ser
-- idénticos entran los dos:
--
--   cerrar 01/09 → 15/09   por $10.000   ✓
--   cerrar 01/09 → 30/09   por $18.000   ✓  ← y no debería
--
-- Total liquidado: $28.000 donde correspondían $18.000. Del 1 al 15 se
-- pagó dos veces, y nada avisó.
--
-- Probado contra la base antes de escribir esta migración.
--
-- POR QUÉ UN TRIGGER Y NO UNA RESTRICCIÓN DE EXCLUSIÓN
--
-- Postgres tiene `exclude using gist` con `daterange`, que es la forma
-- canónica, pero necesita la extensión `btree_gist` para poder combinar
-- el rango con la igualdad del uuid. Una migración que se corre a mano
-- no es lugar para agregar una extensión: si el proyecto no la tiene
-- habilitada, la migración falla a la mitad y hay que ir a buscar por
-- qué. El trigger hace lo mismo, sin depender de nada, y además puede
-- decir CUÁL es el período que choca — que es lo que quien cierra
-- necesita leer.
--
-- Y LO QUE FALTABA PARA QUE NO PASE
--
-- El agujero no es solo técnico: nada le decía al mostrador dónde
-- terminó el último cierre. `ultimos_cierres()` lo devuelve, para que la
-- pantalla proponga el período siguiente en vez de que haya que
-- acordarse.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- REQUIERE la 0054.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. El freno
-- ------------------------------------------------------------

create or replace function public.guard_periodo_liquidacion()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_choca record;
begin
  -- Una anulada es el registro de que se cerró mal: no reserva días.
  if new.estado = 'anulada' then return new; end if;

  select s.desde, s.hasta, s.estado, s.total into v_choca
  from public.teacher_settlements s
  where s.teacher_id = new.teacher_id
    and s.estado <> 'anulada'
    and s.id <> new.id
    -- Dos rangos se pisan si cada uno empieza antes de que el otro
    -- termine. Es la comparación entera: basta un día en común.
    and s.desde <= new.hasta
    and s.hasta >= new.desde
  limit 1;

  if found then
    raise exception
      'Ese período se pisa con una liquidación % del % al % por $%. Si hay que corregirla, anulala primero.',
      v_choca.estado,
      to_char(v_choca.desde, 'DD/MM/YYYY'),
      to_char(v_choca.hasta, 'DD/MM/YYYY'),
      -- El separador va literal y se cambia a mano: la `G` de `to_char`
      -- usa el locale de la BASE, que es inglés, así que $10.000 salía
      -- "$10,000". Mismo problema que los días en la 0051.
      replace(trim(to_char(v_choca.total, 'FM999,999,999')), ',', '.');
  end if;

  return new;
end;
$$;

drop trigger if exists teacher_settlements_periodo on public.teacher_settlements;
create trigger teacher_settlements_periodo
  before insert or update on public.teacher_settlements
  for each row execute function public.guard_periodo_liquidacion();

-- ------------------------------------------------------------
-- 2. Dónde terminó el último cierre de cada una
--
-- Para que la pantalla proponga el período siguiente. Una fila por
-- profesora con cierres; las que nunca se liquidaron no aparecen, y
-- ahí la pantalla no propone nada — no hay desde dónde.
-- ------------------------------------------------------------

create or replace function public.ultimos_cierres()
returns table (teacher_id uuid, hasta date, total numeric, estado text)
language sql stable security definer set search_path = ''
as $$
  select distinct on (s.teacher_id)
    s.teacher_id, s.hasta, s.total, s.estado
  from public.teacher_settlements s
  where s.estado <> 'anulada'
  order by s.teacher_id, s.hasta desc
$$;

revoke all on function public.ultimos_cierres() from public, anon;
grant execute on function public.ultimos_cierres() to authenticated;

-- ------------------------------------------------------------
-- 3. Cerrar todas las del período de una
--
-- El cierre de mes es un acto, no diez. Cierra a todas las que tengan
-- algo liquidado y no estén cerradas ya, y devuelve cuántas cerró.
--
-- Las que chocan por período se SALTEAN en vez de cortar el proceso: si
-- una profesora tiene un cierre que se pisa, eso no puede impedir
-- cerrarle a las otras nueve. Se devuelven aparte para que la pantalla
-- las muestre.
-- ------------------------------------------------------------

create or replace function public.cerrar_liquidaciones(
  p_desde date, p_hasta date
)
returns table (cerradas int, salteadas text[])
language plpgsql security definer set search_path = ''
as $$
declare
  v_l    record;
  v_n    int := 0;
  v_skip text[] := '{}';
begin
  if not public.can('personal.remuneracion') then
    raise exception 'No tenés permiso para cerrar liquidaciones.';
  end if;

  for v_l in select * from public.liquidacion(p_desde, p_hasta) loop
    -- Sin plata no hay nada que liquidar: cerrar un período en cero
    -- llenaría la lista de filas que no dicen nada y bloquearía esos
    -- días para un cierre posterior que sí tenga monto.
    if v_l.total <= 0 then continue; end if;

    begin
      insert into public.teacher_settlements (
        teacher_id, desde, hasta,
        clases, monto_clases, horas, monto_horas, mensual, total
      ) values (
        v_l.teacher_id, p_desde, p_hasta,
        v_l.clases, v_l.monto_clases, v_l.horas, v_l.monto_horas,
        v_l.mensual, v_l.total
      );
      v_n := v_n + 1;
    exception when others then
      -- Se pisa con otra, o ya estaba cerrada. Se anota y se sigue.
      v_skip := v_skip || (v_l.profesora || ': ' || sqlerrm);
    end;
  end loop;

  return query select v_n, v_skip;
end;
$$;

revoke all on function public.cerrar_liquidaciones(date, date) from public, anon;
grant execute on function public.cerrar_liquidaciones(date, date) to authenticated;

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
-- 1. **El agujero, cerrado.** Cerrar 01/09–15/09 y después intentar
--    01/09–30/09 tiene que fallar, diciendo con cuál choca:
--
--      select public.cerrar_liquidacion('<id>', '2026-09-01', '2026-09-15');
--      select public.cerrar_liquidacion('<id>', '2026-09-01', '2026-09-30');
--      → 'Ese período se pisa con una liquidación cerrada del 01/09/2026…'
--
--    Y 16/09–30/09 tiene que entrar: empieza donde terminó la otra.
--
-- 2. Una anulada NO reserva días: anulando la primera, el período
--    grande vuelve a poder cerrarse.
--
-- 3. `ultimos_cierres()` devuelve una fila por profesora con cierres, y
--    ninguna por las que nunca se liquidaron.
--
-- 4. Cerrar todas saltea las que chocan sin cortar el proceso:
--
--      select * from public.cerrar_liquidaciones('2026-09-01','2026-09-30');
--      → cerradas = las que pudo, salteadas = las que no, con el motivo
--
-- ============================================================
-- PARA VOLVER ATRÁS
--
--   begin;
--   drop trigger if exists teacher_settlements_periodo on public.teacher_settlements;
--   drop function if exists public.guard_periodo_liquidacion();
--   drop function if exists public.cerrar_liquidaciones(date, date);
--   drop function if exists public.ultimos_cierres();
--   commit;
--
--   Ojo: volver atrás deja el agujero abierto de nuevo. Las
--   liquidaciones que se hayan pisado NO se corrigen solas.
-- ============================================================
