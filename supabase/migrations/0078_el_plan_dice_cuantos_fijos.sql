-- ============================================================
-- 0078 — Cuántos horarios fijos puede tener, lo dice su plan
--
-- Salió de relevar el pedido del turno fijo (0077): nada limitaba cuántos
-- tomaba una persona. Con la clienta pudiendo dárselos sola desde el
-- portal, eso deja de ser teórico — podía quedarse con un horario fijo
-- los seis días de la semana y bloquear ese lugar para todas las demás,
-- teniendo un plan de dos veces por semana.
--
-- EL NÚMERO YA ESTABA CARGADO Y NO LO LEÍA NADIE
--
-- `plans.weekly_frequency` existe desde la 0025 y el estudio lo completa
-- en Planes: FE START 1, FE FLOW 2, FE BALANCE 3, FE STRONG 4, FE FULL 5.
-- Era un dato decorativo: se mostraba en la web y en la ficha del plan, y
-- ninguna regla lo consultaba. Ahora es el tope.
--
-- Por eso esto NO trae un parámetro nuevo a Configuración: el número ya
-- se configura donde corresponde, que es el plan. Cambiar FE FLOW a 3
-- veces por semana cambia el tope de todas las que lo tienen, sin tocar
-- nada más.
--
-- CERO SIGNIFICA SIN TOPE, y es a propósito. Los planes viejos del set
-- inicial tienen 0 porque nacieron antes de que la columna existiera; un
-- plan que no declara su frecuencia no puede limitar nada, así que no
-- limita. Si mañana el estudio quiere apagar la regla para un plan, le
-- pone 0 y listo.
--
-- VA EN UN TRIGGER Y NO EN LA FUNCIÓN DE LA 0077, porque el mostrador
-- asigna turnos por otro camino —un insert directo sobre `fixed_slots`—
-- y la regla tiene que valer para los dos. Es el mismo lugar donde vive
-- `guard_cupo_fijo`, que cuida el otro tope: ése mira cuántos caben en la
-- CLASE, éste cuántos le tocan a la PERSONA.
--
-- SIN MEMBRESÍA NO SE APLICA. El mostrador puede tener motivos para
-- guardarle el horario a alguien que todavía no tiene plan, y sin plan no
-- hay número que leer. La 0077 ya le exige membresía a la clienta.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

create or replace function public.guard_turnos_del_plan()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_tope    int;
  v_plan    text;
  v_tiene   int;
begin
  if new.estado <> 'activo' then return new; end if;

  -- El plan que la cubre hoy. `membresia_para` no sirve acá: ésa contesta
  -- quién paga una CLASE de una fecha, y el turno fijo no es de una fecha
  -- sino del horario. Se toma la que corre hoy, y entre varias la que más
  -- lejos llega — que es la que le va a pagar las semanas que vienen.
  select p.weekly_frequency, p.name into v_tope, v_plan
  from public.memberships m
  join public.plans p on p.id = m.plan_id
  where m.student_id = new.student_id
    and m.status = 'activa'
    and (now() at time zone 'America/Argentina/Buenos_Aires')::date
        between m.start_date and m.end_date
  order by m.end_date desc
  limit 1;

  -- Sin membresía, o con un plan que no declara frecuencia: no hay tope
  -- que hacer cumplir.
  if v_tope is null or v_tope <= 0 then return new; end if;

  select count(*) into v_tiene
  from public.fixed_slots f
  where f.student_id = new.student_id
    and f.estado <> 'liberado'
    and f.id <> new.id;

  if v_tiene >= v_tope then
    raise exception
      'Tu plan % es de % % por semana y ya tenés % horario% fijo%. Dejá uno si querés cambiarlo.',
      v_plan, v_tope,
      case when v_tope = 1 then 'vez' else 'veces' end,
      v_tiene,
      case when v_tiene = 1 then '' else 's' end,
      case when v_tiene = 1 then '' else 's' end;
  end if;

  return new;
end;
$$;

-- El nombre importa: Postgres dispara los BEFORE por orden alfabético, y
-- 'fixed_slots_cupo' (0048) va antes que éste. Así el mensaje que ve
-- primero quien asigna es el de la clase llena, que es el más común.
drop trigger if exists fixed_slots_tope_plan on public.fixed_slots;
create trigger fixed_slots_tope_plan
  before insert or update on public.fixed_slots
  for each row execute function public.guard_turnos_del_plan();

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
-- 1. Cuántos le tocan a cada una hoy, según su plan:
--
--    select s.name, p.name as plan, p.weekly_frequency as tope,
--           (select count(*) from public.fixed_slots f
--             where f.student_id = s.id and f.estado <> 'liberado') as tiene
--      from public.students s
--      join public.memberships m on m.student_id = s.id and m.status = 'activa'
--      join public.plans p on p.id = m.plan_id
--     where current_date between m.start_date and m.end_date
--     order by s.name;
--
-- 2. Con la sesión de una clienta cuyo plan sea de 2 por semana: tomar un
--    segundo horario fijo tiene que entrar, y el tercero tiene que
--    rechazar con el mensaje que nombra su plan.
--
-- 3. Y que el mostrador tenga el mismo límite: desde la Agenda, "Darle
--    este horario fijo a X" sobre alguien que ya llegó a su tope tiene
--    que dar el mismo texto. Ésa es la razón de que esto sea un trigger y
--    no una validación adentro de la función de la 0077.
--
-- 4. Lo que NO tiene que pasar: que un turno ya existente se rompa. La
--    regla sólo corre al insertar o al reactivar, así que las filas que
--    ya están no se tocan aunque hoy pasen el tope.
--
-- PARA VOLVER ATRÁS
--
--   drop trigger if exists fixed_slots_tope_plan on public.fixed_slots;
--   drop function if exists public.guard_turnos_del_plan();
--
--   No hay datos que revertir: la regla sólo rechaza, nunca escribe.
-- ============================================================
