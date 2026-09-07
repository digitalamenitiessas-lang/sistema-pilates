-- ============================================================
-- 0030 — El motor descuenta de la misma membresía que muestra la pantalla
--
-- La 0029 eligió, entre las membresías vigentes para la fecha de la
-- clase, la que VENCE PRIMERO: usar antes la que antes se pierde parece
-- lo justo, y aislado lo es.
--
-- Pero la pantalla hace lo contrario. fetchStudioData ordena por end_date
-- descendente y se queda con la primera (lib/api.ts:208 y :401), así que
-- la ficha, el portal y el listado muestran la que vence ÚLTIMO.
--
-- Con una sola membresía por vez las dos reglas dan lo mismo y no se nota
-- nada. Con dos, no — y dos es el caso NORMAL en Casa Fé: la clienta paga
-- entre el 1 y el 9 para conservar su horario, y su membresía anterior
-- vence el 25. Entre el 9 y el 25 tiene dos vigentes.
--
-- Ahí la clienta ve "FE FLOW, te quedan 8" y el sistema le descuenta de
-- la FE START vieja. El número de la pantalla no baja, el de la otra sí,
-- y cuando alguien lo note va a ser imposible de explicar.
--
-- Cuál de las dos reglas es "la correcta" es discutible. Que las dos
-- convivan, no. Gana la de la pantalla, porque es la que la clienta ve y
-- la que recepción va a usar para contestarle.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

create or replace function public.membresia_para(p_student uuid, p_fecha date)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select m.id
  from public.memberships m
  where m.student_id = p_student
    and m.status = 'activa'
    and p_fecha between m.start_date and m.end_date
  -- desc: la misma que muestra la pantalla (lib/api.ts:208).
  order by m.end_date desc
  limit 1
$$;

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
--   -- Si hay alguna clienta con más de una membresía vigente hoy, esta
--   -- consulta muestra cuál elige el motor. Tiene que ser la misma que
--   -- aparece en su ficha.
--   select s.name,
--          count(*) as vigentes,
--          public.membresia_para(s.id, current_date) as elige_el_motor
--   from public.students s
--   join public.memberships m
--     on m.student_id = s.id and m.status = 'activa'
--    and current_date between m.start_date and m.end_date
--   group by s.id, s.name
--   having count(*) > 1;
--
--   select * from public.consumo_control();   → cero filas
-- ============================================================

-- ============================================================
-- LO QUE ESTO NO ARREGLA
--
-- Que existan dos membresías vigentes a la vez. Asignar un plan solo
-- inserta una fila: no cierra la anterior ni la marca de ninguna forma
-- (lib/api.ts, assignMembership). Renovar y cambiar de plan son además
-- el mismo botón, así que tampoco se distinguen.
--
-- Con esta migración por lo menos la pantalla y el motor dicen lo mismo.
-- Lo otro es una decisión de negocio —¿la clienta pierde las clases que
-- le quedaban al renovar antes?— y va con la respuesta de la clienta
-- sobre la vigencia de la membresía, que todavía no llegó.
-- ============================================================

-- ============================================================
-- VUELTA ATRÁS (no ejecutar salvo que haga falta)
--
--   begin;
--   create or replace function public.membresia_para(p_student uuid, p_fecha date)
--   returns uuid language sql stable security definer set search_path = ''
--   as $$
--     select m.id from public.memberships m
--     where m.student_id = p_student and m.status = 'activa'
--       and p_fecha between m.start_date and m.end_date
--     order by m.end_date limit 1
--   $$;
--   commit;
-- ============================================================
