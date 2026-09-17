-- ============================================================
-- 0057 — Seis funciones le contestaban a quien no debía
--
-- Encontrado el 16/09 probando el portal con la sesión real de un alumno,
-- no leyendo el esquema. Todas son `security definer`, o sea que se
-- saltean las políticas a propósito —lo necesitan para poder cruzar
-- tablas—, y quedaron con el EXECUTE que Supabase le da por defecto a
-- todo el mundo. Ninguna pregunta adentro quién la está llamando.
--
-- EL PATRÓN QUE FALTÓ, Y QUE YA ESTABA ESCRITO
--
-- `caja_control()` (0020) lo hace bien: primero `if not can('caja.ver')
-- then raise`, y recién después la consulta. Probada con el alumno,
-- contestó "No tenés permiso para auditar la caja". Es el molde.
--
-- LO QUE SE VERIFICÓ, EJERCIÉNDOLO
--
--   liquidacion(p_desde, p_hasta)   → 200 y TRES FILAS con el nombre de
--     cada profesora, sus clases dictadas y sus montos. Llamada con el
--     token de un alumno. Los montos dan 0 sólo porque todavía no hay
--     tarifas cargadas en teacher_pay: el día que se carguen —que es el
--     día en que alguien use la pantalla de Personal— cada clienta del
--     estudio puede leer los sueldos. La tabla satélite `teacher_pay`
--     está bien cerrada (0 filas para el alumno) y esta función la
--     esquivaba por completo.
--
--   consumo_control() y renovacion_control() → 200 CON LA ANON KEY, sin
--     sesión. La anon key viaja en el paquete de la web pública, así que
--     es cualquiera con el link. Hoy devuelven [] porque no hay
--     inconsistencias; devuelven nombre de clienta, uuid de membresía,
--     monto cobrado y fecha en cuanto haya una.
--
--   turnos_sin_prioridad() → 200 con el token del alumno (0 filas hoy,
--     porque todavía no se asignó ningún turno fijo). Devuelve el padrón:
--     nombre, día y hora de cada clienta.
--
--   recordar_clases_de_hoy() → le dice 401 a la anon key, pero está
--     granteada a authenticated. Un alumno podía dispararle los avisos
--     del día a todo el estudio cuando quisiera.
--
--   tarifa_vigente() → nadie la llama desde el código: sólo la usa
--     `liquidacion` por dentro.
--
-- CÓMO SE CIERRA CADA UNA, Y POR QUÉ NO TODAS IGUAL
--
-- Las cuatro que el navegador NO llama se cierran con un `revoke`, que es
-- la reja más barata y no toca ni una línea de su cuerpo. Se verificó una
-- por una contra el código quién las llama:
--
--   consumo_control, renovacion_control → nadie. Son de auditoría, se
--     corren desde el SQL Editor, que entra como `postgres` y no se ve
--     afectado por el revoke.
--   turnos_sin_prioridad, recordar_clases_de_hoy → sólo
--     app/api/cron/diario, que usa el service role. Le queda el grant.
--   tarifa_vigente → sólo `liquidacion`, por dentro. Una definer corre su
--     cuerpo con los permisos del dueño, así que la llamada interna
--     sigue andando aunque authenticated ya no la pueda llamar suelta.
--
-- Las dos que el navegador SÍ llama —`liquidacion` y
-- `liquidaciones_cerradas`, desde lib/personal-api.ts— no se pueden
-- cerrar con un revoke sin romper la pantalla de Personal. Esas llevan el
-- candado adentro, con `personal.remuneracion`, que es la misma clave con
-- la que la pantalla ya decide si dibuja la sección (personal-page:810) y
-- la misma que gobierna `teacher_pay` (0053). O sea que para el admin no
-- cambia nada, y para recepción tampoco: hoy ya no ve esa sección.
--
-- POR QUÉ NO ALCANZA CON QUITAR EL PERMISO POR COLUMNA
--
-- Porque admin y alumno son el MISMO rol de Postgres (`authenticated`):
-- lo que los distingue son las políticas, que filtran filas y no
-- columnas. Un grant por columna los trataría igual. Es el mismo motivo
-- por el que lo sensible vive en tablas satélite.
--
-- LO QUE ESTA MIGRACIÓN NO ARREGLA
--
-- `teachers` sigue con la política "lectura autenticados" de la 0001 y la
-- 0053 le agregó `dni` y `notas_laborales` como columnas de esa tabla:
-- todo alumno logueado las lee. Hoy están vacías. Eso se arregla con
-- tabla satélite y toca código, así que va en la 0058.
-- **Hasta entonces, no cargar DNI ni notas laborales.**
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Las cuatro que se cierran con la reja
--
-- `from public` saca el default de Supabase; `anon` y `authenticated` van
-- nombrados aparte porque si alguien les hizo un grant explícito, quitar
-- el de `public` no se lo saca.
-- ------------------------------------------------------------

revoke all on function public.consumo_control()    from public, anon, authenticated;
revoke all on function public.renovacion_control() from public, anon, authenticated;

revoke all on function public.turnos_sin_prioridad()   from public, anon, authenticated;
grant execute on function public.turnos_sin_prioridad() to service_role;

revoke all on function public.recordar_clases_de_hoy()   from public, anon, authenticated;
grant execute on function public.recordar_clases_de_hoy() to service_role;

revoke all on function public.tarifa_vigente(uuid, text, date)
  from public, anon, authenticated;

comment on function public.consumo_control() is
  'Auditoría del contador. Sólo postgres: se corre desde el SQL Editor. Contestaba con la anon key hasta la 0057.';
comment on function public.renovacion_control() is
  'Auditoría de renovaciones. Sólo postgres: se corre desde el SQL Editor. Contestaba con la anon key hasta la 0057.';

-- ------------------------------------------------------------
-- 2. Las dos que la pantalla llama, con el candado adentro
--
-- Las dos pasan de `language sql` a `plpgsql` para poder cortar con un
-- motivo en vez de devolver vacío. Devolver vacío sería lo peor de los
-- dos mundos: la pantalla mostraría una liquidación de $0 que miente, que
-- es justo lo que el criterio de la casa evita distinguiendo "no tenés
-- acceso" de "está vacío".
--
-- `#variable_conflict use_column` porque los nombres de las columnas que
-- devuelve —`teacher_id`, `total`— son también variables de salida en
-- plpgsql, y sin esto un nombre suelto se vuelve ambiguo.
--
-- El cuerpo es el mismo de la 0053 y la 0054, sin un cambio.
-- ------------------------------------------------------------

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
  )
  select
    t.id,
    t.name,
    coalesce(c.n, 0),
    coalesce(c.monto, 0),
    coalesce(h.n, 0),
    coalesce(h.monto, 0),
    public.tarifa_vigente(t.id, 'mensual', p_hasta),
    coalesce(h.aus, 0),
    coalesce(h.tar, 0),
    coalesce(c.monto, 0) + coalesce(h.monto, 0)
      + public.tarifa_vigente(t.id, 'mensual', p_hasta)
  from public.teachers t
  left join clases c on c.teacher_id = t.id
  left join horas  h on h.teacher_id = t.id
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

-- `liquidaciones_cerradas` llama a `liquidacion` por dentro para el
-- "total de hoy". El candado de arriba se evalúa también en esa llamada
-- —`can()` mira al usuario de la petición, no al dueño de la función—,
-- así que este candado y el de arriba dicen lo mismo a propósito: si no
-- puede ver montos, ninguna de las dos le contesta.
create or replace function public.liquidaciones_cerradas(p_desde date, p_hasta date)
returns table (
  id          uuid,
  teacher_id  uuid,
  profesora   text,
  desde       date,
  hasta       date,
  clases      int,
  horas       numeric,
  total       numeric,
  total_hoy   numeric,
  estado      text,
  expense_id  uuid,
  notas       text,
  void_reason text,
  created_at  timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.can('personal.remuneracion') then
    raise exception 'No tenés permiso para ver las remuneraciones';
  end if;

  return query
  select
    s.id, s.teacher_id, coalesce(t.name, '—'),
    s.desde, s.hasta, s.clases, s.horas, s.total,
    -- Lo que daría hoy el mismo período. Se calcula al leer, no se
    -- guarda: guardarlo sería un tercer número que también envejece.
    coalesce((
      select l.total from public.liquidacion(s.desde, s.hasta) l
      where l.teacher_id = s.teacher_id
    ), 0),
    s.estado, s.expense_id, s.notas, s.void_reason, s.created_at
  from public.teacher_settlements s
  left join public.teachers t on t.id = s.teacher_id
  where s.hasta >= p_desde and s.desde <= p_hasta
  order by s.hasta desc, t.name;
end;
$$;

revoke all on function public.liquidaciones_cerradas(date, date) from public, anon;
grant execute on function public.liquidaciones_cerradas(date, date) to authenticated;

-- ------------------------------------------------------------
-- 3. El interruptor del auto-registro, que existía de nombre
--
-- La clave `portal.autoregistro` de la 0012 es tipo 'servicio' con
-- `legacy_roles = '{}'`: no es un permiso de rol y `can()` le contesta
-- false a todos, así que nunca pudo servir de interruptor. Quedó como una
-- fila en la matriz de Permisos que el estudio ve, no puede tocar, y que
-- no apaga nada.
--
-- El interruptor de verdad va donde van los parámetros del negocio: en
-- studio_settings, que el estudio edita desde Configuración.
--
-- NACE APAGADO. Con el auto-registro encendido, email + DNI alcanzan para
-- crear la cuenta de una clienta y entrar a su portal —pagos, deuda,
-- lesiones, embarazo, medicación—, y el DNI no es un secreto. Mientras
-- Resend siga en sandbox no hay forma de confirmar el mail, que es lo que
-- haría que esa puerta sea segura. Hasta entonces el acceso lo crea el
-- mostrador desde la ficha, que es lo que ya hace.
--
-- `rige = true` porque el código de esta misma entrega lo lee.
-- ------------------------------------------------------------

-- `group_key` tiene lista cerrada (0020:64) y no incluye 'sistema': va en
-- 'general', que existe para esto y ya tiene título en Configuración.
--
-- `solo_admin` en true: esta clave abre una puerta al portal de una
-- persona —pagos, deuda, salud—, así que la política restrictiva
-- "parametros de control: solo admin" (0020) la deja fuera del alcance de
-- recepción. Es el mismo criterio que los parámetros de caja.
insert into public.studio_settings
  (key, value, kind, options, label, help, group_key, sort_order, is_public, solo_admin, rige)
values
  ('portal_autoregistro', 'false', 'boolean', '{}',
   'El cliente puede crearse el acceso solo',
   'Encendido, quien esté cargado con email y DNI puede crear su propio acceso al portal desde la pantalla de ingreso. Apagado, el acceso lo crea el estudio desde la ficha. Ojo: con esto encendido, saber el email y el DNI de una persona alcanza para entrar a su portal.',
   -- `is_public` en true a propósito: la pantalla de ingreso no tiene
   -- sesión y necesita leerlo para no ofrecer un botón que el servidor va
   -- a rechazar. Lo único que se publica es si la puerta está abierta, y
   -- eso ya se sabe intentando.
   'general', 10, true, true, true)
on conflict (key) do nothing;

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
-- Lo que la base contesta sola:
--
--   -- 1. Las dos de auditoría ya no las puede llamar nadie más que postgres
--   select has_function_privilege('anon',          'public.consumo_control()', 'execute'),
--          has_function_privilege('authenticated', 'public.consumo_control()', 'execute'),
--          has_function_privilege('anon',          'public.renovacion_control()', 'execute'),
--          has_function_privilege('authenticated', 'public.renovacion_control()', 'execute');
--   → las cuatro false
--
--   -- 2. Las del cron: sólo el service role
--   select has_function_privilege('authenticated', 'public.turnos_sin_prioridad()', 'execute'),
--          has_function_privilege('service_role',  'public.turnos_sin_prioridad()', 'execute'),
--          has_function_privilege('authenticated', 'public.recordar_clases_de_hoy()', 'execute'),
--          has_function_privilege('service_role',  'public.recordar_clases_de_hoy()', 'execute');
--   → false, true, false, true
--
--   -- 3. La tarifa ya no se llama suelta
--   select has_function_privilege('authenticated', 'public.tarifa_vigente(uuid, text, date)', 'execute');
--   → false
--
--   -- 4. Y el candado de adentro corta. OJO, esto es al revés de lo que
--   --    parece: acá TIENE que fallar. En el SQL Editor no hay sesión,
--   --    auth.uid() es null, mis_permisos() devuelve '{}' (0012:193-195) y
--   --    entonces can() da false. Que rechace es la prueba.
--   select count(*) from public.liquidacion(date_trunc('month', current_date)::date, current_date);
--   → ERROR: No tenés permiso para ver las remuneraciones
--
--   -- Si querés verla andar desde acá, hay que ponerse la sesión de un
--   -- admin a mano, en la MISMA ejecución:
--   --   set local role authenticated;
--   --   set local request.jwt.claims = '{"sub":"<uuid del perfil admin>"}';
--   --   select count(*) from public.liquidacion('2026-09-01', '2026-09-30');
--   -- → tres filas
--
-- Lo que hay que ejercer desde el navegador, que es donde estaba el
-- agujero:
--
--   -- 5. Con la sesión de un ALUMNO, las seis tienen que rebotar:
--   --    liquidacion y liquidaciones_cerradas → "No tenés permiso para ver
--   --    las remuneraciones"; las otras cuatro → permission denied.
--   -- 6. Con la sesión del ADMIN, Personal tiene que seguir mostrando la
--   --    liquidación del período igual que antes.
--   -- 7. Con la ANON key, consumo_control y renovacion_control tienen que
--   --    pasar de 200 a 401.
--
-- PARA VOLVER ATRÁS
--
--   grant execute on function public.consumo_control()    to anon, authenticated;
--   grant execute on function public.renovacion_control() to anon, authenticated;
--   grant execute on function public.turnos_sin_prioridad()   to authenticated;
--   grant execute on function public.recordar_clases_de_hoy() to authenticated;
--   grant execute on function public.tarifa_vigente(uuid, text, date) to authenticated;
--   -- y para los dos candados de adentro, volver a correr los `create or
--   -- replace` de la 0053 (liquidacion) y la 0054 (liquidaciones_cerradas),
--   -- que son los mismos cuerpos en `language sql` y sin el `if`.
--   update public.studio_settings set value = 'true' where key = 'portal_autoregistro';
-- ============================================================
