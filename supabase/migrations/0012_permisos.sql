-- ============================================================
-- 0012 — Motor de permisos configurable
--
-- Requisito de la sección 11 del documento de Casa Fé: los permisos se
-- tienen que poder configurar por rol y, cuando haga falta, por persona.
--
-- Esta migración se aplica EN FRÍO: crea el motor pero NADA lo consume
-- todavía. Ninguna política existente se toca acá. El sistema sigue
-- comportándose exactamente igual después de correrla.
--
-- La idea que hace esto seguro es el MODO SOMBRA: cada clave guarda en
-- `legacy_roles` la respuesta que da el sistema HOY. Mientras la clave
-- está en sombra, can() responde con eso, así que reemplazar una política
-- de app_role() por can() es un cambio sin efecto, verificable. Recién
-- cuando perm_diff() da cero filas se enciende clave por clave, y cada
-- encendido se revierte con un UPDATE.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. LAS TABLAS DEL MOTOR
-- ------------------------------------------------------------

-- El catálogo de claves es DATO, no un enum ni un CHECK: un módulo futuro
-- (gastos, caja, inventario, remuneraciones, landing) se registra con un
-- INSERT y ya aparece en la pantalla de permisos. Mismo patrón que
-- studio_settings en 0011.
create table public.permission_keys (
  clave    text primary key,
  etiqueta text not null,
  ayuda    text not null default '',
  grupo    text not null,
  orden    int not null default 100,

  -- 'permiso'     → configurable desde la pantalla
  -- 'fija'        → la tiene todo usuario logueado; su política sigue
  --                 siendo "auth.uid() is not null" y NO se migra (el
  --                 portal y la landing dependen de ella)
  -- 'estructural' → existe y can() la resuelve, pero no es tildable:
  --                 tildarla sería una escalada de privilegios
  -- 'servicio'    → identidad de máquina (cron, webhook), no asignable
  -- 'futuro'      → el módulo todavía no existe
  tipo text not null default 'permiso'
    check (tipo in ('permiso', 'fija', 'estructural', 'servicio', 'futuro')),

  -- Modo sombra: la respuesta de HOY, copiada del relevamiento.
  legacy_roles text[] not null default '{}',
  enforce_mode text not null default 'sombra'
    check (enforce_mode in ('sombra', 'activo')),

  created_at timestamptz not null default now()
);

create index permission_keys_grupo_idx on public.permission_keys (grupo, orden);

-- La matriz por rol. La PRESENCIA de la fila ES el permiso: apagar uno es
-- borrar la fila, así no quedan filas en false ensuciando la resolución.
create table public.role_permissions (
  role  text not null check (role in ('admin', 'recepcion', 'profesor', 'alumno')),
  clave text not null references public.permission_keys (clave) on delete cascade,
  primary key (role, clave)
);

-- El "y cuando haga falta, por persona". allow = true suma una clave que
-- el rol no tiene (una profesora que sí puede tomar asistencia, sin tocar
-- el rol profesor entero); allow = false se la resta. Sin fila, manda el
-- rol. La fila individual gana siempre, en las dos direcciones.
create table public.user_permissions (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  clave      text not null references public.permission_keys (clave) on delete cascade,
  allow      boolean not null,
  motivo     text not null default '',
  granted_by uuid references auth.users (id),
  granted_at timestamptz not null default now(),
  -- Para el permiso temporal: la suplente del verano.
  expires_at timestamptz,
  primary key (user_id, clave)
);

-- Interruptor de emergencia, por encima del enforce_mode de cada clave:
-- modo = 'emergencia' devuelve todo a la respuesta de hoy con un UPDATE,
-- sin deploy y sin revertir migraciones.
-- No va en studio_settings a propósito: recepción escribe studio_settings
-- (0011) y podría apagar la fiscalización de permisos.
create table public.permission_config (
  key   text primary key,
  value text not null default ''
);

insert into public.permission_config (key, value) values ('modo', 'normal');

-- Bitácora: quién cambió qué permiso y cuándo. La escriben los triggers;
-- nadie la escribe desde el cliente.
create table public.permission_audit (
  id      bigserial primary key,
  at      timestamptz not null default now(),
  actor   uuid references auth.users (id),
  tabla   text not null,
  op      text not null,
  clave   text,
  role    text,
  target  uuid,
  antes   jsonb,
  despues jsonb
);

-- ------------------------------------------------------------
-- 2. RLS DE LAS TABLAS DEL MOTOR
--
-- Clavadas a app_role() = 'admin' y NUNCA migradas a can(): si el permiso
-- de administrar permisos dependiera del propio motor, un error de
-- configuración dejaría el sistema sin nadie que lo pueda arreglar.
-- ------------------------------------------------------------
alter table public.permission_keys   enable row level security;
alter table public.role_permissions  enable row level security;
alter table public.user_permissions  enable row level security;
alter table public.permission_config enable row level security;
alter table public.permission_audit  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['permission_keys', 'role_permissions', 'user_permissions', 'permission_config']
  loop
    execute format(
      'create policy "admin administra permisos" on public.%I for all
         using (public.app_role() = ''admin'')
         with check (public.app_role() = ''admin'')', t
    );
  end loop;
end;
$$;

-- La bitácora se lee, no se escribe: sin política de insert, solo entran
-- filas por los triggers (que son security definer).
create policy "admin lee la bitacora"
  on public.permission_audit for select
  using (public.app_role() = 'admin');

-- ------------------------------------------------------------
-- 3. IDENTIDAD DEL STAFF
--
-- Hoy no hay forma de saber qué profesor es el usuario logueado, así que
-- "que vea solo SUS clases" es inexpresable en la base y terminaría
-- implementado únicamente en la pantalla, o sea sin protección real.
-- Gemela de students.user_id y my_student_ids() (0005).
-- ------------------------------------------------------------
alter table public.teachers
  add column user_id uuid unique references auth.users (id) on delete set null;

create index teachers_user_id_idx on public.teachers (user_id) where user_id is not null;

create or replace function public.my_teacher_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$ select id from public.teachers where user_id = auth.uid() $$;

create or replace function public.my_class_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select id from public.class_sessions
  where teacher_id in (select public.my_teacher_ids())
$$;

-- ------------------------------------------------------------
-- 4. RESOLUCIÓN DE PERMISOS
--
-- SECURITY DEFINER es obligatorio, por el mismo motivo que app_role()
-- (0001) y my_student_ids() (0005): la función lee profiles,
-- role_permissions y user_permissions, y las tres tienen RLS. Sin
-- DEFINER, evaluar la política de pagos dispararía la política de
-- role_permissions, que llamaría de nuevo a esta función → recursión.
--
-- STABLE (lee tablas, no las modifica) es lo que permite al planificador
-- sacar la llamada del recorrido fila por fila.
-- ------------------------------------------------------------
create or replace function public.mis_permisos()
returns text[]
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_role text;
  v_modo text;
  v_res  text[];
begin
  -- Anónimo o service role: sin permisos. El service role no pasa por RLS,
  -- así que no los necesita.
  if v_uid is null then
    return '{}'::text[];
  end if;

  select p.role into v_role from public.profiles p where p.id = v_uid;
  if v_role is null then
    return '{}'::text[];
  end if;

  select coalesce(c.value, 'normal') into v_modo
  from public.permission_config c where c.key = 'modo';

  -- Interruptor de emergencia: todo vuelve a la respuesta de hoy.
  if coalesce(v_modo, 'normal') = 'emergencia' then
    select coalesce(array_agg(k.clave), '{}'::text[]) into v_res
    from public.permission_keys k
    where v_role = any(k.legacy_roles);
    return v_res;
  end if;

  select coalesce(array_agg(distinct t.clave), '{}'::text[]) into v_res
  from (
    -- (a) claves todavía en sombra → responde el legado, igual que hoy
    select k.clave
    from public.permission_keys k
    where k.enforce_mode = 'sombra'
      and v_role = any(k.legacy_roles)

    union

    -- (b) claves ya activas → matriz por rol, con la excepción por
    --     persona ganando en las dos direcciones
    select k.clave
    from public.permission_keys k
    left join public.role_permissions rp
      on rp.clave = k.clave and rp.role = v_role
    left join public.user_permissions up
      on up.clave = k.clave and up.user_id = v_uid
     and (up.expires_at is null or up.expires_at > now())
    where k.enforce_mode = 'activo'
      and coalesce(up.allow, rp.clave is not null)
  ) t;

  return v_res;
end;
$$;

-- La función que evalúan las políticas.
--
-- El resultado se cachea en una variable TRANSACCIONAL: un statement que
-- cruza tres tablas con RLS resuelve una sola vez en lugar de tres.
--
-- El `true` del set_config es obligatorio: hace el valor local a la
-- transacción. Con `false` queda pegado a la conexión, y como el pool se
-- comparte entre usuarios, los permisos de uno se los llevaría el
-- siguiente. Es un error de una palabra, con consecuencia de acceso
-- indebido total, y no da ningún síntoma con un solo usuario logueado.
--
-- El caché es una optimización: la corrección no depende de que exista.
create or replace function public.can(p_clave text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_cache text;
begin
  v_cache := current_setting('pilates.perms', true);
  if v_cache is null then
    v_cache := '|' || array_to_string(public.mis_permisos(), '|') || '|';
    perform set_config('pilates.perms', v_cache, true);
  end if;
  return strpos(v_cache, '|' || p_clave || '|') > 0;
end;
$$;

revoke all on function public.mis_permisos() from public, anon;
revoke all on function public.can(text) from public, anon;
grant execute on function public.mis_permisos() to authenticated;
grant execute on function public.can(text) to authenticated;
grant execute on function public.my_teacher_ids() to authenticated;
grant execute on function public.my_class_ids() to authenticated;

-- ------------------------------------------------------------
-- 5. PRUEBA DE EQUIVALENCIA
--
-- Tiene que devolver CERO FILAS antes de encender cualquier clave.
-- Cualquier fila acá es un cambio de permisos disfrazado de migración
-- técnica: es el momento barato de descubrir que la matriz no reprodujo
-- lo que el sistema hace hoy.
-- ------------------------------------------------------------
create or replace function public.perm_diff()
returns table (rol text, clave text, legado boolean, motor boolean)
language sql stable security definer set search_path = ''
as $$
  select r.rol,
         k.clave,
         r.rol = any(k.legacy_roles),
         exists (select 1 from public.role_permissions rp
                 where rp.role = r.rol and rp.clave = k.clave)
  from (values ('admin'), ('recepcion'), ('profesor'), ('alumno')) as r(rol)
  cross join public.permission_keys k
  where (r.rol = any(k.legacy_roles))
        is distinct from
        exists (select 1 from public.role_permissions rp
                where rp.role = r.rol and rp.clave = k.clave)
$$;

grant execute on function public.perm_diff() to authenticated;

-- ------------------------------------------------------------
-- 6. EL CATÁLOGO DE CLAVES
--
-- `legacy_roles` es lo que cada rol puede hacer HOY, sacado del
-- relevamiento de los 116 puntos de control del sistema.
-- ------------------------------------------------------------
insert into public.permission_keys (clave, etiqueta, ayuda, grupo, orden, tipo, legacy_roles) values
  -- Accesos
  ('usuarios.ver', 'Ver los usuarios del sistema', 'Replica el tramo de staff de ''leer perfil propio o staff'' (0001:202-204). El tramo id = auth.uid() es aislamiento y se separa en su propia policy.', 'Accesos', 10, 'permiso', '{admin,recepcion}'),
  ('usuarios.gestionar', 'Entrar a la sección Usuarios del sistema', 'Hoy la sección se muestra solo a admin (configuracion-page.tsx:716), aunque el endpoint acepta admin y recepción. Se replica la UI, que es la más restrictiva.', 'Accesos', 20, 'permiso', '{admin}'),
  ('usuarios.crear_alumno', 'Crear el acceso al portal de una alumna', 'Es el botón ''Crear acceso'' de la ficha (ficha-alumno.tsx:328), que hoy usa canWrite y llega al endpoint con role=''alumno''.', 'Accesos', 30, 'permiso', '{admin,recepcion}'),
  ('usuarios.crear_staff', 'Crear usuarios de staff (recepción, profesor, admin)', 'NO CONFIGURABLE (tipo estructural). Replica el refinamiento de app/api/admin/users/route.ts:67-69. Si se vuelve tildable, quien la tenga se crea un admin.', 'Accesos', 40, 'estructural', '{admin}'),
  ('usuarios.eliminar', 'Eliminar un acceso al sistema', 'Replica el DELETE de app/api/admin/users/route.ts:125-127. El guard de no borrarte a vos mismo es lógica de negocio y se conserva aparte del motor.', 'Accesos', 50, 'permiso', '{admin}'),
  ('permisos.administrar', 'Configurar la matriz de permisos y las excepciones por persona', 'NO CONFIGURABLE (tipo estructural). La RLS de las tablas del motor está hardcodeada a app_role()=''admin'' y no evalúa can(): esta clave gobierna solo la UI.', 'Accesos', 60, 'estructural', '{admin}'),
  -- Alumnos
  ('alumnos.ver', 'Ver el listado y la ficha de alumnas', 'Replica ''staff y profesores leen'' sobre students (0005:37-39).', 'Alumnos', 10, 'permiso', '{admin,recepcion,profesor}'),
  ('alumnos.crear', 'Dar de alta una alumna', 'Sale del FOR ALL ''escritura staff'' sobre students (0001:222).', 'Alumnos', 20, 'permiso', '{admin,recepcion}'),
  ('alumnos.editar', 'Modificar la ficha de una alumna', 'Mismo origen. No incluye los datos de salud, que viven en student_private desde 0008.', 'Alumnos', 30, 'permiso', '{admin,recepcion}'),
  ('alumnos.eliminar', 'Dar de baja una alumna', 'Hoy no hay botón de baja de alumna en la UI: la clave queda declarada y la restrictiva la hace cumplir cuando exista.', 'Alumnos', 40, 'permiso', '{admin,recepcion}'),
  -- Datos sensibles
  ('salud.ver', 'Ver observaciones médicas y contacto de emergencia', 'Es el ''ver información de salud'' del punto 11. Replica el FOR ALL sobre student_private (0008:36-39). El andamiaje ya está: la tabla satélite existe.', 'Datos sensibles', 10, 'permiso', '{admin,recepcion}'),
  ('salud.editar', 'Cargar o modificar datos de salud', 'Mismo origen. Separarla de alumnos.editar exige antes arreglar lib/api.ts:492 y 452-454 (ver pasos y trampas): si no, se pisa la nota médica con vacío.', 'Datos sensibles', 20, 'permiso', '{admin,recepcion}'),
  -- Agenda
  ('agenda.ver', 'Ver la grilla de clases', 'CLAVE FIJA: la policy ''lectura autenticados'' de class_sessions (0001:219) NO se migra. El portal de la alumna depende de ella. Apagarla en la pantalla esconde el módulo en la UI pero no lo blinda en la base.', 'Agenda', 10, 'fija', '{admin,recepcion,profesor,alumno}'),
  ('agenda.crear', 'Crear clases', 'Del FOR ALL ''escritura staff'' sobre class_sessions (0001:222). Gate en agenda-page.tsx:471.', 'Agenda', 20, 'permiso', '{admin,recepcion}'),
  ('agenda.editar', 'Modificar clases', 'Mismo origen. Gate en agenda-page.tsx:332 (hoy comparte canWrite con eliminar).', 'Agenda', 30, 'permiso', '{admin,recepcion}'),
  ('agenda.eliminar', 'Dar de baja clases', 'Es update active=false (lib/api.ts:965), no delete. La hace cumplir la policy RESTRICTIVE de class_sessions.', 'Agenda', 40, 'permiso', '{admin,recepcion}'),
  -- Reservas
  ('reservas.ver', 'Ver reservas y lista de asistentes', 'Replica ''staff y profesores leen'' sobre reservations (0005:58-60).', 'Reservas', 10, 'permiso', '{admin,recepcion,profesor}'),
  ('reservas.ver.propio', 'Ver solo las reservas de mis propias clases', 'NADIE la tiene hoy. Requiere teachers.user_id (se crea en 0012) y, ANTES de encenderla, arreglar el cálculo de cupos de lib/api.ts:291-313 o las clases aparecen vacías.', 'Reservas', 20, 'permiso', '{}'),
  ('reservas.crear', 'Anotar una alumna en una clase', 'Del FOR ALL sobre reservations. Gate en agenda-page.tsx:413-467. Candidata natural a habilitarle al profesor por persona.', 'Reservas', 30, 'permiso', '{admin,recepcion}'),
  ('reservas.editar', 'Confirmar desde lista de espera', 'Gate en reservas-page.tsx:273.', 'Reservas', 40, 'permiso', '{admin,recepcion}'),
  ('reservas.asistencia', 'Marcar asistió / ausente', 'Candidata número uno a habilitarle a UNA profesora por persona. Se separa de reservas.editar con la restrictiva que mira el status resultante.', 'Reservas', 50, 'permiso', '{admin,recepcion}'),
  ('reservas.anular', 'Cancelar una reserva', 'Es el ''anular movimientos'' del punto 11. La restrictiva DEBE llevar la rama my_student_ids o la alumna deja de poder cancelar desde el portal.', 'Reservas', 60, 'permiso', '{admin,recepcion}'),
  -- Membresías
  ('membresias.ver', 'Ver membresías, vigencia y clases usadas', 'Replica ''staff y profesores leen'' sobre memberships (0005:44-46). ATENCIÓN: incluye memberships.price, que es información financiera y el profesor la ve hoy pese al recorte de 0008.', 'Membresías', 10, 'permiso', '{admin,recepcion,profesor}'),
  ('membresias.asignar', 'Asignar, renovar o cambiar el plan de una alumna', 'Es el INSERT sobre memberships. Ojo: AsignarPlanModal además genera la cuota (lib/api.ts:526 inserta en payments), así que esta acción toca plata sin pasar por pagos.registrar.', 'Membresías', 20, 'permiso', '{admin,recepcion}'),
  ('membresias.editar', 'Modificar una membresía (incluye renovación automática)', 'Gate en ficha-alumno.tsx:524, que ya usa el buen patrón: sin permiso muestra el valor en modo lectura en vez de desaparecer.', 'Membresías', 30, 'permiso', '{admin,recepcion}'),
  ('membresias.anular', 'Suspender o anular una membresía', 'El CHECK de 0001:104-105 admite ''suspendida''. La hace cumplir la restrictiva de memberships.', 'Membresías', 40, 'permiso', '{admin,recepcion}'),
  -- Finanzas
  ('finanzas.ver', 'Ver información financiera (pagos, facturación, deuda)', 'Es el ''ver información financiera'' del punto 11. Replica ''staff lee pagos'' (0008:12-14) y gobierna sola la vista monthly_revenue, única con security_invoker=on. Es también la clave del módulo Pagos en el sidebar.', 'Finanzas', 10, 'permiso', '{admin,recepcion}'),
  ('pagos.registrar', 'Registrar un pago / cobrar', 'Es ''registrar pagos'' del punto 11. HOY recepción cobra por el FOR ALL de 0001:222 sobre payments, no por una policy que se llame así: si esta clave no queda en el preset de recepción, el mostrador deja de cobrar el día uno.', 'Finanzas', 20, 'permiso', '{admin,recepcion}'),
  ('pagos.editar', 'Modificar un pago ya registrado', 'Del mismo FOR ALL.', 'Finanzas', 30, 'permiso', '{admin,recepcion}'),
  ('pagos.anular', 'Anular un movimiento de pago', 'Es ''anular movimientos'' del punto 11. La base ya admite status=''anulado'' (0001:145-146) pero todavía no hay botón en ningún lado: la clave queda declarada y la restrictiva la hace cumplir cuando exista.', 'Finanzas', 40, 'permiso', '{admin,recepcion}'),
  ('pagos.eliminar', 'Eliminar un movimiento de pago', 'Sin uso hoy (no hay DELETE desde el cliente), pero el FOR ALL lo permitía: se declara para no cambiar el comportamiento.', 'Finanzas', 50, 'permiso', '{admin,recepcion}'),
  ('pagos.link_mp', 'Generar links de cobro de Mercado Pago', 'Replica requireStaff en /api/mp/create-link. Caso canónico de ''usar la credencial sin verla'': el token se lee server-side con service role y nunca baja al navegador de recepción.', 'Finanzas', 60, 'permiso', '{admin,recepcion}'),
  ('pagos.acreditar', 'Sincronizar y acreditar pagos de Mercado Pago', 'Replica requireStaff en /api/mp/sync. El front tiene que consultarla ANTES de llamar: hoy el sync se dispara solo al abrir Pagos (pagos-page.tsx:495-509).', 'Finanzas', 70, 'permiso', '{admin,recepcion}'),
  -- Planes
  ('planes.ver', 'Ver los planes y sus precios', 'CLAVE FIJA: ''lectura autenticados'' sobre plans (0001:219) no se migra; el portal y la landing dependen de ella.', 'Planes', 10, 'fija', '{admin,recepcion,profesor,alumno}'),
  ('planes.crear', 'Crear planes', 'Gate en planes-page.tsx:336.', 'Planes', 20, 'permiso', '{admin,recepcion}'),
  ('planes.editar', 'Modificar planes y precios', 'Gate en planes-page.tsx:121 (hoy comparte canWrite con la baja).', 'Planes', 30, 'permiso', '{admin,recepcion}'),
  ('planes.eliminar', 'Dar de baja planes', 'Es update active=false (lib/api.ts:624). La hace cumplir la restrictiva de plans.', 'Planes', 40, 'permiso', '{admin,recepcion}'),
  -- Equipo
  ('profesores.ver', 'Ver el listado de profesores', 'CLAVE FIJA: ''lectura autenticados'' sobre teachers (0001:219) nunca fue derogada, así que la alumna del portal lee HOY teléfono y email de todos. Deuda a saldar con teacher_private, no con un tilde.', 'Equipo', 10, 'fija', '{admin,recepcion,profesor,alumno}'),
  ('profesores.crear', 'Agregar profesores', 'Gate en configuracion-page.tsx:428.', 'Equipo', 20, 'permiso', '{admin,recepcion}'),
  ('profesores.editar', 'Modificar profesores', 'Gate en configuracion-page.tsx:453.', 'Equipo', 30, 'permiso', '{admin,recepcion}'),
  ('profesores.eliminar', 'Dar de baja profesores', 'Es update active=false (lib/api.ts:769).', 'Equipo', 40, 'permiso', '{admin,recepcion}'),
  ('remuneraciones.ver', 'Ver remuneraciones del equipo', 'MÓDULO FUTURO. Requiere teacher_private: si el sueldo se agrega como columna de teachers, todos los profesores lo ven desde el primer día por ''lectura autenticados'' y ninguna clave lo arregla.', 'Equipo', 50, 'futuro', '{admin}'),
  ('remuneraciones.editar', 'Modificar remuneraciones', 'MÓDULO FUTURO. Es ''modificar remuneraciones'' del punto 11.', 'Equipo', 60, 'futuro', '{admin}'),
  -- Catálogos
  ('catalogos.ver', 'Ver salas, disciplinas y medios de pago', 'CLAVE FIJA: las tres ''lectura autenticados'' (0004:20-22, 0011:141-143, 0011:194-196) no se migran. Son catálogos inocuos y el portal los usa.', 'Catálogos', 10, 'fija', '{admin,recepcion,profesor,alumno}'),
  ('catalogos.crear', 'Agregar salas, disciplinas y medios de pago', 'Requisito explícito del documento: agregar disciplinas sin depender del desarrollador.', 'Catálogos', 20, 'permiso', '{admin,recepcion}'),
  ('catalogos.editar', 'Renombrar salas, disciplinas y medios de pago', 'Los catálogos guardan el NOMBRE como texto, no como FK: renombrar dispara una cascada sobre class_sessions, plans y teachers. Quien tenga esta clave sin agenda.editar y planes.editar falla a mitad de camino.', 'Catálogos', 30, 'permiso', '{admin,recepcion}'),
  ('catalogos.eliminar', 'Dar de baja salas, disciplinas y medios de pago', 'Es update active=false (lib/api.ts:799 y 877).', 'Catálogos', 40, 'permiso', '{admin,recepcion}'),
  -- Configuración
  ('config.ver', 'Leer los parámetros del negocio', 'CLAVE FIJA: ''lectura autenticados'' sobre studio_settings (0011:47-49) no se migra. El portal necesita cancel_hours y la alumna el horario del estudio; apagarla rompe el portal en silencio.', 'Configuración', 10, 'fija', '{admin,recepcion,profesor,alumno}'),
  ('configuracion.ver', 'Entrar a la pantalla de Configuración', 'Solo UI: replica el gate del botón del pie del sidebar (sidebar.tsx:174).', 'Configuración', 20, 'permiso', '{admin,recepcion}'),
  ('config.editar', 'Modificar los parámetros del negocio (plazos, ventanas, avisos)', 'Replica el FOR ALL sobre studio_settings (0011:52-55). Recepción hoy puede cambiar la ventana de pago y el plazo de cancelación: candidato claro a bajar a solo admin DESPUÉS de la migración, no durante.', 'Configuración', 30, 'permiso', '{admin,recepcion}'),
  -- Integraciones
  ('integraciones.credenciales', 'Ver y cargar las credenciales de Mercado Pago', 'NO CONFIGURABLE (tipo estructural). Replica el isAdmin de configuracion-page.tsx:79 y las policies de app_settings, que NO se migran. Es la tabla que guarda el secreto de cobro.', 'Integraciones', 10, 'estructural', '{admin}'),
  ('integraciones.probar', 'Probar la conexión con Mercado Pago', 'Se replica el estado de HOY: /api/mp/test comparte requireStaff con las rutas de cobro, así que recepción ya obtiene nickname y email de la cuenta de MP del estudio. Fuga conocida: destildarla para recepción es el primer ajuste post-migración, no parte de ella.', 'Integraciones', 20, 'permiso', '{admin,recepcion}'),
  -- Avisos
  ('avisos.ver', 'Ver las notificaciones del estudio', 'Replica ''staff ve notificaciones del estudio'' (0007:39-42). CANAL LATERAL: el body lleva montos desnormalizados (0009:19-21), así que quitar finanzas.ver no impide leer el monto en la campana.', 'Avisos', 10, 'permiso', '{admin,recepcion}'),
  ('avisos.recibir_push', 'Recibir los avisos push del estudio', 'Define el fan-out, hoy hardcodeado en lib/push-server.ts:53 con .in(''role'',[''admin'',''recepcion'']). Un rol nuevo con finanzas.ver no recibe ningún aviso hasta que esto se migre.', 'Avisos', 20, 'permiso', '{admin,recepcion}'),
  ('avisos.crear', 'Crear un aviso manual', 'MÓDULO FUTURO. notifications no tiene NINGUNA policy de insert (0007:17-50): RLS habilitada sin policy = todo denegado. Hay que crear la policy; un generador que solo reescriba las existentes se lo saltea en silencio.', 'Avisos', 30, 'permiso', '{admin}'),
  -- Comunicaciones
  ('comunicaciones.enviar', 'Enviar recordatorios por WhatsApp o email', 'Replica los gates de canWrite sobre los links de WhatsApp (dashboard-page.tsx:243 y 393, pagos-page.tsx). El de la 393 expone el monto en el mensaje, así que debería pedir además finanzas.ver.', 'Comunicaciones', 10, 'permiso', '{admin,recepcion}'),
  -- Web pública
  ('landing.administrar', 'Administrar el contenido de la web pública', 'MÓDULO FUTURO SIN ANCLAJE. Lo que se publica sale de plans.active, class_sessions.active, disciplines.* y studio_settings.is_public, todas gobernadas por otras claves. Hasta que exista una columna publish separada de active, esta clave no controla nada y hay que mostrarla como pendiente.', 'Web pública', 10, 'futuro', '{admin}'),
  -- Gastos
  ('gastos.ver', 'Ver los gastos del estudio', 'MÓDULO FUTURO. La clave existe desde ahora: cuando llegue la tabla, la policy se escribe con (select public.can(''gastos.ver'')) y ya está asignada.', 'Gastos', 10, 'futuro', '{admin}'),
  ('gastos.cargar', 'Cargar gastos', 'MÓDULO FUTURO. Es ''cargar gastos'' del punto 11.', 'Gastos', 20, 'futuro', '{admin}'),
  ('gastos.editar', 'Modificar gastos', 'MÓDULO FUTURO.', 'Gastos', 30, 'futuro', '{admin}'),
  ('gastos.anular', 'Anular o eliminar gastos', 'MÓDULO FUTURO.', 'Gastos', 40, 'futuro', '{admin}'),
  -- Caja
  ('caja.ver', 'Ver la caja diaria', 'MÓDULO FUTURO.', 'Caja', 10, 'futuro', '{admin}'),
  ('caja.operar', 'Registrar movimientos de caja', 'MÓDULO FUTURO. Depende de payment_methods, hoy desincronizado del CHECK de payments.method (0002:37-39).', 'Caja', 20, 'futuro', '{admin}'),
  ('caja.cerrar', 'Cerrar la caja del día', 'MÓDULO FUTURO.', 'Caja', 30, 'futuro', '{admin}'),
  -- Inventario
  ('inventario.ver', 'Ver el inventario', 'MÓDULO FUTURO. Es ''gestionar inventario'' del punto 11.', 'Inventario', 10, 'futuro', '{admin}'),
  ('inventario.gestionar', 'Gestionar stock y movimientos de inventario', 'MÓDULO FUTURO.', 'Inventario', 20, 'futuro', '{admin}'),
  ('inventario.ver_costos', 'Ver costos y precios de compra', 'MÓDULO FUTURO. Dato sensible por columna: va en tabla satélite, patrón student_private.', 'Inventario', 30, 'futuro', '{admin}'),
  -- Reportes
  ('reportes.ver', 'Ver reportes y estadísticas', 'MÓDULO FUTURO.', 'Reportes', 10, 'futuro', '{admin}'),
  -- Sistema
  ('sistema.cron.ejecutar', 'Ejecutar el proceso diario', 'IDENTIDAD DE MÁQUINA, no asignable a personas. app/api/cron/diario/route.ts no tiene sujeto humano: se autentica con CRON_SECRET y usa service role. NO meterlo bajo un rol.', 'Sistema', 10, 'servicio', '{}'),
  ('sistema.webhook_mp', 'Acreditar pagos desde el webhook de Mercado Pago', 'IDENTIDAD DE MÁQUINA. app/api/mp/webhook/route.ts arranca directo con supabaseAdmin(): si el motor exigiera resolver un sujeto, la acreditación se cae y el webhook devuelve 200 igual, así que nadie se entera.', 'Sistema', 20, 'servicio', '{}'),
  ('portal.autoregistro', 'Auto-registro del portal habilitado', 'FLAG DE CONFIGURACIÓN, no permiso de rol. app/api/portal/registro es público a propósito. El rol que nace lo fija handle_new_user (0006) en ''alumno'' y eso NO debe volverse configurable.', 'Sistema', 30, 'servicio', '{}');
-- ------------------------------------------------------------
-- 7. LA MATRIZ INICIAL
--
-- Se deriva de legacy_roles en vez de escribirse a mano: así la matriz
-- arranca siendo, por construcción, exactamente lo que el sistema hace
-- hoy, y perm_diff() da cero sin depender de que nadie se equivoque
-- transcribiendo 150 filas.
-- ------------------------------------------------------------
insert into public.role_permissions (role, clave)
select unnest(k.legacy_roles), k.clave
from public.permission_keys k
where cardinality(k.legacy_roles) > 0;

-- ------------------------------------------------------------
-- 8. GUARDIA ANTI AUTO-ELEVACIÓN Y BITÁCORA
--
-- Se crea DESPUÉS del seed a propósito: si existiera antes, el propio
-- INSERT de las claves estructurales dispararía el rechazo y la migración
-- se cortaría por la mitad.
-- ------------------------------------------------------------
create or replace function public.guard_permisos()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  j       jsonb;
  j_old   jsonb;
  v_clave text;
  v_allow boolean;
  v_tipo  text;
begin
  if tg_op = 'DELETE' then
    j := to_jsonb(old);
    j_old := to_jsonb(old);
  else
    j := to_jsonb(new);
    j_old := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  end if;

  v_clave := j ->> 'clave';
  -- role_permissions no tiene columna allow: la fila ES el permiso
  v_allow := coalesce((j ->> 'allow')::boolean, true);

  -- auth.uid() nulo = migración o service role. Se deja pasar para que el
  -- seed y los scripts de arranque funcionen; es coherente con que el
  -- service role ya saltea toda la RLS.
  if auth.uid() is not null then

    -- (a) nadie toca sus propios permisos, ni para darse ni para quitarse
    if tg_table_name = 'user_permissions' and (j ->> 'user_id')::uuid = auth.uid() then
      raise exception 'No podés modificar tus propios permisos';
    end if;

    -- (b) las claves no configurables no se otorgan desde la pantalla
    select k.tipo into v_tipo from public.permission_keys k where k.clave = v_clave;
    if v_tipo in ('estructural', 'fija', 'servicio') then
      raise exception 'La clave "%" no se puede asignar desde la pantalla (es %)', v_clave, v_tipo;
    end if;

    -- (c) nadie otorga una clave que él mismo no tiene
    if tg_op in ('INSERT', 'UPDATE') and v_allow and not public.can(v_clave) then
      raise exception 'No podés otorgar "%": vos no la tenés', v_clave;
    end if;
  end if;

  insert into public.permission_audit (actor, tabla, op, clave, role, target, antes, despues)
  values (auth.uid(), tg_table_name, tg_op, v_clave,
          j ->> 'role', (j ->> 'user_id')::uuid, j_old,
          case when tg_op = 'DELETE' then null else j end);

  return coalesce(new, old);
end;
$$;

create trigger guard_role_permissions
  before insert or update or delete on public.role_permissions
  for each row execute function public.guard_permisos();

create trigger guard_user_permissions
  before insert or update or delete on public.user_permissions
  for each row execute function public.guard_permisos();

-- ------------------------------------------------------------
-- 9. GUARDIA DEL ROL
--
-- profiles.role es la puerta real de la elevación de privilegios, porque
-- "admin administra perfiles" (0001) es un FOR ALL sobre la tabla que
-- guarda el rol. Complementa —no reemplaza— a handle_new_user (0006),
-- que sigue forzando 'alumno' en el alta.
-- ------------------------------------------------------------
create or replace function public.guard_role_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.role is not distinct from old.role then
    return new;
  end if;

  if auth.uid() is not null and new.id = auth.uid() then
    raise exception 'No podés cambiar tu propio rol';
  end if;

  -- Invariante que hoy no existe en ningún lado: el sistema nunca se
  -- queda sin nadie que lo administre. El borrado de usuarios solo impide
  -- borrarte a vos mismo, así que dos admins podían dejarse afuera.
  if old.role = 'admin'
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'El sistema no puede quedarse sin ningún admin';
  end if;

  return new;
end;
$$;

create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_role_change();

-- ============================================================
-- CÓMO SEGUIR (no ejecutar acá)
--
--   1. select * from public.perm_diff();   → tiene que dar CERO filas
--   2. select public.mis_permisos();       → logueado con cada rol
--   3. Recién con eso verificado, la migración 0013 reescribe las
--      políticas de app_role() a can(). Como todas las claves están en
--      sombra, ese cambio no altera ningún comportamiento.
--   4. El encendido va grupo por grupo:
--        update public.permission_keys set enforce_mode = 'activo'
--         where grupo = 'Catálogos';
--      y se revierte con 'sombra' en segundos.
--   5. Ante cualquier cosa rara:
--        update public.permission_config set value = 'emergencia'
--         where key = 'modo';
-- ============================================================

commit;
