-- ============================================================
-- 0025 — El plan sabe cuántas veces por semana, y renombrar deja de
--        poder fallar a la mitad
--
-- Dos cosas independientes que preparan el catálogo real de Casa Fé.
--
-- 1. Los planes de la clienta se definen por FRECUENCIA SEMANAL, no por
--    cantidad de clases: "2 veces por semana · 8 clases". Las dos cifras
--    no son la misma — 8 clases es la consecuencia de venir 2 veces por
--    semana durante 4 semanas — y la que manda para el horario fijo es la
--    frecuencia. Hoy la tabla solo guarda el total.
--
-- 2. Renombrar una disciplina dispara una cascada sobre class_sessions,
--    plans y teachers, porque los catálogos guardan el NOMBRE como texto
--    y no como clave foránea. Esa cascada la hace hoy el navegador con
--    cuatro escrituras sueltas: si la tercera falla, la disciplina ya se
--    llama distinto y las clases siguen apuntando al nombre viejo.
--
--    La 0012 lo dejó anotado en la ayuda de la propia clave:
--    "Quien tenga esta clave sin agenda.editar y planes.editar falla a
--    mitad de camino". Acá se cierra: una función que hace todo o nada.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Cuántas veces por semana
--
-- Cero significa "no aplica": el pase de un día no tiene frecuencia
-- semanal, y es también el default para los planes que ya existen, que
-- se cargaron sin este dato.
-- ------------------------------------------------------------

alter table public.plans
  add column if not exists weekly_frequency int not null default 0
    check (weekly_frequency between 0 and 7);

comment on column public.plans.weekly_frequency is
  'Veces por semana que viene la alumna. 0 = no aplica (pase de un día). class_count sigue siendo el total del período.';

-- ------------------------------------------------------------
-- 2. Renombrar en cascada, o no renombrar
--
-- security definer porque la cascada toca tres tablas que quien renombra
-- puede no tener permiso de escribir — y no debería necesitarlo: no está
-- editando clases ni planes, está arrastrando un nombre. Por eso el
-- permiso se exige acá adentro, a mano: la clave que gobierna esto es
-- catalogos.editar y ninguna otra.
-- ------------------------------------------------------------

create or replace function public.editar_disciplina(
  p_id          uuid,
  p_nombre      text,
  p_color       text,
  p_bg_color    text,
  p_text_color  text,
  p_blurb       text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_viejo text;
  v_nuevo text := trim(p_nombre);
begin
  if not (select public.can('catalogos.editar')) then
    raise exception 'No tenés permiso para renombrar disciplinas';
  end if;

  if v_nuevo = '' then
    raise exception 'La disciplina necesita un nombre';
  end if;

  -- Se bloquea la fila: si dos personas renombran la misma disciplina a
  -- la vez, la segunda espera y lee el nombre ya cambiado, en vez de
  -- arrastrar un nombre viejo que ya no existe en ningún lado.
  select d.name into v_viejo
  from public.disciplines d
  where d.id = p_id
  for update;

  if v_viejo is null then
    raise exception 'Esa disciplina no existe';
  end if;

  update public.disciplines set
    name = v_nuevo,
    color = p_color,
    bg_color = p_bg_color,
    text_color = p_text_color,
    blurb = trim(p_blurb)
  where id = p_id;

  -- Si solo cambiaron los colores o el texto, no hay nada que arrastrar.
  if v_viejo = v_nuevo then
    return;
  end if;

  update public.class_sessions
  set discipline = v_nuevo
  where discipline = v_viejo;

  -- Arrays de texto: array_replace cambia el valor sin tocar el orden ni
  -- el resto de los elementos.
  update public.plans
  set disciplines = array_replace(disciplines, v_viejo, v_nuevo)
  where disciplines @> array[v_viejo];

  update public.teachers
  set disciplines = array_replace(disciplines, v_viejo, v_nuevo)
  where disciplines @> array[v_viejo];
end;
$$;

revoke all on function public.editar_disciplina(uuid, text, text, text, text, text) from public;
grant execute on function public.editar_disciplina(uuid, text, text, text, text, text) to authenticated;

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
--   -- La columna nueva
--   select name, class_count, weekly_frequency from public.plans order by name;
--     → weekly_frequency en 0 en todos, y nada más cambió
--
--   -- El permiso se exige de verdad: con una sesión sin catalogos.editar
--   select public.editar_disciplina(
--     (select id from public.disciplines limit 1),
--     'Prueba', '#000000', '#ffffff', '#000000', ''
--   );
--     → "No tenés permiso para renombrar disciplinas"
--
--   -- La cascada, con una sesión de admin: renombrar y contar las
--   -- referencias antes y después
--   select count(*) from public.class_sessions where discipline = '<viejo>';
--   select count(*) from public.plans where disciplines @> array['<viejo>'];
--   select count(*) from public.teachers where disciplines @> array['<viejo>'];
--     → después del renombre, las tres en cero, y las mismas cantidades
--       apuntando al nombre nuevo
--
--   select * from public.perm_diff();   → sigue dando cero filas
-- ============================================================

-- ============================================================
-- VUELTA ATRÁS (no ejecutar salvo que haga falta)
--
--   begin;
--   drop function if exists public.editar_disciplina(uuid, text, text, text, text, text);
--   alter table public.plans drop column weekly_frequency;
--   commit;
--
-- Ojo: el código vuelve a la cascada desde el navegador, así que hay que
-- revertir también el commit que llama a la función.
-- ============================================================
