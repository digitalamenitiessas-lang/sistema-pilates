-- ============================================================
-- 0062 — `ultimos_cierres()` se escapó de la 0057
--
-- La 0057 revisó seis funciones `security definer` que le contestaban a
-- quien no debía y les puso candado. Quedó una afuera, y es del mismo
-- grupo: `ultimos_cierres()` de la 0055.
--
-- Verificado el 17/09, leyendo la 0055 línea por línea:
--
--   grant execute on function public.ultimos_cierres() to authenticated;
--
-- y CERO llamadas a `can()` adentro. Devuelve
-- `(teacher_id, hasta, total, estado)`: lo último que se le liquidó a cada
-- integrante del equipo, con el monto.
--
-- Hoy devuelve `[]` porque no hay ninguna liquidación cerrada. O sea que
-- la fuga está cerrada por casualidad —igual que las seis de la 0057— y
-- se abre el día que el estudio cierre su primera liquidación, que es
-- justo lo que está a punto de hacer.
--
-- POR QUÉ SE ESCAPÓ, PARA NO REPETIRLO
--
-- La 0057 salió de probar el portal con la sesión de un alumno: se
-- revisaron las funciones que aparecieron en ese recorrido. Ésta no
-- aparece en ninguna pantalla del alumno —la llama sólo la pantalla de
-- Personal, para el cartel de "último cierre"— así que no se cruzó. La
-- lección es que la lista no se arma mirando lo que la pantalla usa, sino
-- preguntándole al esquema quién es `security definer` y quién no tiene
-- adentro un `can()`.
--
-- CÓMO SE CIERRA
--
-- Como las dos de la 0057 que la pantalla sí llama: candado adentro, con
-- `personal.remuneracion`. Es la misma clave que gobierna `teacher_pay`,
-- `liquidacion()` y `liquidaciones_cerradas()`, y la misma con la que la
-- pantalla decide si dibuja la sección — o sea que para el admin no
-- cambia nada y a recepción no le cambia nada tampoco, porque ese cartel
-- ya no se le dibujaba.
--
-- Pasa a `plpgsql` para poder cortar con un motivo en vez de devolver
-- vacío: un "último cierre: ninguno" que miente es peor que un
-- "no tenés acceso".
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

create or replace function public.ultimos_cierres()
returns table (teacher_id uuid, hasta date, total numeric, estado text)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.can('personal.remuneracion') then
    raise exception 'No tenés permiso para ver las remuneraciones';
  end if;

  return query
  select distinct on (s.teacher_id)
    s.teacher_id, s.hasta, s.total, s.estado
  from public.teacher_settlements s
  where s.estado <> 'anulada'
  order by s.teacher_id, s.hasta desc;
end;
$$;

revoke all on function public.ultimos_cierres() from public, anon;
grant execute on function public.ultimos_cierres() to authenticated;

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
--   -- 1. Desde el SQL Editor TIENE que rechazar: ahí no hay sesión,
--   --    auth.uid() es null y can() da false. Que corte es la prueba.
--   select * from public.ultimos_cierres();
--   → ERROR: No tenés permiso para ver las remuneraciones
--
--   -- 2. Con la sesión de una PROFESORA o de una ALUMNA, el mismo error.
--   -- 3. Con la del ADMIN, la pantalla de Personal tiene que seguir
--   --    mostrando el cartel de último cierre igual que antes.
--
--   -- 4. Y el barrido que faltó hacer la primera vez: qué otras funciones
--   --    definer no preguntan nada adentro.
--   select p.proname,
--          has_function_privilege('authenticated', p.oid, 'execute') as la_puede_llamar,
--          prosrc like '%public.can(%' as pregunta_permiso
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.prosecdef
--    order by 2 desc, 3, 1;
--   → revisar una por una las que dan (true, false): cada una es una
--     candidata. No todas están mal —`membresia_para` o `franja_de` no
--     devuelven nada sensible— pero la lista hay que mirarla entera.
--
-- PARA VOLVER ATRÁS
--
--   Volver a correr el bloque 2 de la `0055`, que es el mismo cuerpo en
--   `language sql` y sin el `if`.
-- ============================================================
