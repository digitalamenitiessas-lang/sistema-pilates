-- ============================================================
-- 0064 — El sueldo mensual se reparte por los días del período
--
-- Como estaba, `liquidacion()` sumaba el mensual ENTERO, una vez por cada
-- cierre, sin mirar cuántos días tenía el período:
--
--   public.tarifa_vigente(t.id, 'mensual', p_hasta)
--
-- Así que cerrar del 1 al 15 y después del 16 al 30 —que es una forma
-- perfectamente razonable de trabajar, y la que va a usar quien pague
-- quincenal— pagaba DOS sueldos completos en el mismo mes. Los dos
-- cierres son legítimos a los ojos del sistema, ninguno está marcado, y
-- nada compara uno con el otro. El único síntoma es la plata que salió.
--
-- Al revés también estaba mal: un cierre de tres días pagaba el mes
-- entero.
--
-- LA REGLA NUEVA
--
-- El mensual se prorratea por los días del mes que el período cubre. Un
-- mes completo paga uno; dos quincenas pagan medio y medio, que suman
-- uno; tres días de un mes de treinta pagan la décima parte.
--
-- POR QUÉ PRORRATEAR Y NO "PAGARLO EN EL CIERRE QUE CONTIENE FIN DE MES"
--
-- Porque esa otra regla obliga a la función a mirar qué se cerró antes, y
-- `liquidacion()` no puede depender del pasado: la usa también
-- `liquidaciones_cerradas()` para recalcular períodos viejos y decir "hoy
-- esto daría X". Una función que mira el historial daría un número
-- distinto según cuándo se la llame, y ese número es justo el que sirve
-- para detectar diferencias. Prorratear es una cuenta pura: mismo
-- período, mismo resultado, siempre.
--
-- Y POR QUÉ MES POR MES Y NO SOBRE EL TOTAL DE DÍAS
--
-- Porque los meses no miden lo mismo y la tarifa puede cambiar entre uno
-- y otro. Un período del 20/09 al 10/10 son once días de septiembre sobre
-- treinta más diez de octubre sobre treinta y uno, cada uno con la tarifa
-- que regía al cerrar su tramo. Dividir por "días totales" mezclaría dos
-- meses de distinto largo y una tarifa que quizá cambió en el medio.
--
-- Es el mismo criterio con el que la 0053 paga cada clase con la tarifa
-- del día de esa clase y no con la de hoy.
--
-- LO QUE ESTO NO ARREGLA
--
-- Los días sin liquidar. El trigger de la 0055 impide que dos períodos se
-- pisen, pero no que queden agujeros: cerrar 1-15 y después 20-30 deja
-- los días 16 a 19 sin pagar, y ahora el mensual de esos cuatro días
-- tampoco se paga. Antes tampoco: se pagaba dos veces el mes completo, lo
-- cual es peor. Queda anotado en §0 que falta una pantalla de "qué días
-- quedaron sin liquidar".
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

create or replace function public.liquidacion(p_desde date, p_hasta date)
returns table (
  teacher_id    uuid,
  profesora     text,
  clases        bigint,
  monto_clases  numeric,
  horas         numeric,
  monto_horas   numeric,
  mensual       numeric,
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
    from public.sesiones_dictadas(p_desde, p_hasta) s
    where s.teacher_id is not null
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
  -- Los meses que toca el período, con cuántos de sus días entran.
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
    coalesce(h.aus, 0),
    coalesce(h.tar, 0),
    coalesce(c.monto, 0) + coalesce(h.monto, 0) + coalesce(mp.monto, 0)
  from public.teachers t
  left join clases c on c.teacher_id = t.id
  left join horas  h on h.teacher_id = t.id
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

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
-- Hace falta una tarifa mensual cargada. Con una de $300.000 para una
-- profesora, en el SQL Editor y poniéndose la sesión de un admin:
--
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<uuid del perfil admin>"}';
--
--   -- 1. El mes completo paga uno
--   select profesora, mensual from public.liquidacion('2026-09-01', '2026-09-30');
--   → 300.000
--
--   -- 2. Las dos quincenas suman UNO, no dos. Es el bug que esto arregla.
--   select (select mensual from public.liquidacion('2026-09-01','2026-09-15')
--             where profesora = '<nombre>')
--        + (select mensual from public.liquidacion('2026-09-16','2026-09-30')
--             where profesora = '<nombre>') as las_dos_quincenas;
--   → 300.000  (antes daba 600.000)
--
--   -- 3. Tres días pagan tres días
--   select mensual from public.liquidacion('2026-09-01', '2026-09-03');
--   → 30.000   (3 de 30)
--
--   -- 4. Y un período a caballo de dos meses reparte por mes
--   select mensual from public.liquidacion('2026-09-20', '2026-10-10');
--   → 300.000 * (11/30) + 300.000 * (10/31) = 110.000 + 96.774,19 = 206.774,19
--
-- En la pantalla de Personal, la columna "Mensual" de un período de medio
-- mes tiene que mostrar la mitad, y la leyenda de abajo lo dice.
--
-- PARA VOLVER ATRÁS
--
--   Volver a correr el bloque 2 de la `0057`, que es este mismo cuerpo con
--   `tarifa_vigente(t.id, 'mensual', p_hasta)` en vez del prorrateo.
--   Ojo: volver atrás es volver a pagar el mes entero en cada cierre.
-- ============================================================
