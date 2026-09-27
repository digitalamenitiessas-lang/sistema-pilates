-- ============================================================
-- 0087 — Los planes y los parámetros del negocio los cambia el admin
--
-- LA DECISIÓN (Matías, 27/09)
--
-- Recepción deja de poder crear, modificar y dar de baja planes, y de
-- cambiar los parámetros del negocio: plazos, ventanas de pago, avisos,
-- los datos del estudio y prender o apagar una regla. Son cuatro claves:
-- `planes.crear`, `planes.editar`, `planes.eliminar` y `config.editar`.
-- Lo demás de recepción no se mueve: sigue viendo los planes y los
-- parámetros, sigue entrando a Configuración y sigue cobrando.
--
-- La ayuda de `config.editar` lo dejó escrito en la 0012: "candidato
-- claro a bajar a solo admin DESPUÉS de la migración, no durante". Es
-- esto.
--
-- POR QUÉ NO ALCANZA CON DESTILDAR
--
-- Los dos grupos están en sombra, y en sombra `can()` responde
-- `legacy_roles`, no la matriz (0012, `mis_permisos`). Destildar a
-- recepción en la pantalla no cambiaba nada: el tilde se iba y el
-- permiso quedaba. Hay que borrar la fila Y encender los grupos
-- 'Planes' y 'Configuración' — con esos nombres exactos, que son los de
-- la 0012 y ninguna migración cambió (el de clientes sí, tres veces).
--
-- POR QUÉ ENCENDER NO CAMBIA NADA MÁS, Y POR QUÉ SE COMPRUEBA ACÁ ADENTRO
--
-- Relevado el 27/09 en producción con la sesión del admin: las cuatro
-- están en sombra con legado admin y recepción, la matriz de recepción
-- las tiene, y todavía no existe ninguna cuenta de recepción. Pero eso es
-- una foto, y entre la foto y el momento en que se pegue esto alguien
-- pudo tildar algo o cargar una excepción. Por eso la migración no lo da
-- por hecho: antes de encender compara la matriz con el legado clave por
-- clave y rol por rol, y mira las excepciones por persona —que en sombra
-- no pesan y encendidas ganan en las dos direcciones—. Si algo no
-- coincide, corta y dice qué, sin dejar nada a medias.
--
-- Las dos que más importan son `config.ver` y `planes.ver`, que el
-- legado da a los cuatro roles. Son 'fija': la lectura de la base no
-- pregunta por ellas (la política de plans y de studio_settings es
-- "lectura autenticados", 0001 y 0011), pero encendidas su respuesta
-- sale de la matriz, y la pantalla que pregunte por ellas no puede
-- recibir un "no" para el rol profesor o para el portal. Después de esta
-- migración no pueden faltar: se comprueba al final, y `guard_permisos`
-- (0012) no deja tocar una clave 'fija' desde la pantalla.
--
-- `promos.administrar` también es del grupo Planes y rige desde la 0079
-- con `legacy_roles = '{}'` a propósito. No se compara —compararla
-- cortaría siempre— y no se toca: el encendido es sólo de lo que está en
-- sombra.
--
-- LAS POLÍTICAS YA PREGUNTAN POR ESTAS CLAVES
--
-- Desde la 0013, las tres de escritura de plans piden `planes.crear`,
-- `planes.editar` y `planes.eliminar`, y las tres de studio_settings
-- piden `config.editar`. Las permisivas se suman con O, así que una sola
-- que diga otra cosa —una vieja con `app_role() in ('admin',
-- 'recepcion')`, o la clave correcta con un `or` al costado— dejaría el
-- encendido sin efecto. La guarda no busca la clave adentro del texto:
-- exige que la expresión entera sea esa `can()` y nada más.
--
-- Dar de baja un plan es un UPDATE `active = false`, así que pasa por
-- las dos: la permisiva de `planes.editar` y la restrictiva de la 0013,
-- que pide `planes.eliminar`. Hacen falta las dos claves; la ayuda de
-- `planes.eliminar` ahora lo dice.
--
-- La restrictiva de los parámetros de control (0020) mira
-- `app_role() = 'admin'`: es más estricta que la clave y queda.
--
-- LAS VISTAS PÚBLICAS ERAN UNA PUERTA DE ESCRITURA
--
-- La landing lee `public_plans` (0003/0037), `public_studio_settings`
-- (0011), `public_disciplines` (0011), `public_payment_discounts` (0056)
-- y `public_schedule` (0003/0017) sin sesión. Las cinco son vistas sin
-- `security_invoker` a propósito —así muestran filas que la llave
-- pública no ve—, y ninguna migración les dio permisos: los tienen por
-- los privilegios por defecto del esquema, que en Supabase son TODOS
-- para anon y authenticated (la 0073 lo vio en `class_occupancy`, que
-- contestaba sin sesión).
--
-- El problema es que cuatro de ellas son simples —una tabla, sin join ni
-- agregado— y Postgres las deja escribir solas. Una escritura por la
-- vista toca la tabla con los permisos del dueño, que es el dueño de la
-- tabla, y la RLS no se aplica. O sea que con la llave pública, sin
-- sesión, un PATCH a `/rest/v1/public_plans` cambiaba el precio de un
-- plan; a `public_studio_settings`, los datos del estudio o
-- `portal_autoregistro` (pública y sólo del admin); a
-- `public_payment_discounts`, el `ajuste_pct` con el que `cobrar_cuota`
-- cobra. Reproducido en una base local con las migraciones del repo y los
-- privilegios por defecto de Supabase. Ya estaba antes de esta
-- migración, pero sin cerrarlo apagar las claves no frena a nadie: por la
-- vista se escribe igual.
--
-- Se les deja sólo SELECT, explícito: la landing sigue leyendo y deja de
-- depender de los privilegios por defecto. Van las cinco aunque
-- `public_schedule` (con join) no se pueda escribir: son de lectura por
-- diseño, y así lo dice el permiso. Al final se comprueba que no quede
-- ninguna vista escribible sin `security_invoker` sobre plans o
-- studio_settings.
--
-- LO QUE ESCRIBE POR FUERA DE LAS POLÍTICAS
--
-- Ningún endpoint de app/api escribe plans ni studio_settings (el alta
-- del portal y el proceso diario sólo leen). La única función SECURITY
-- DEFINER que escribe plans es `editar_disciplina` (0025): arrastra el
-- nombre nuevo de una disciplina a los planes que la tienen, pide
-- `catalogos.editar`, y está bien que siga así — si el renombre no
-- llegara a los planes, quedarían apuntando a una disciplina que no
-- existe. La guarda corta si aparece otra.
--
-- EL FRENO DE MANO
--
-- Con `permission_config.modo = 'emergencia'`, `can()` responde el
-- legado de todo, y recepción vuelve a tener estas cuatro. Es lo que
-- tiene que hacer un freno de mano —todo como antes del motor—, pero
-- conviene saberlo antes de tirarlo. Las vistas no vuelven a abrirse con
-- el freno: no pasan por el motor.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- REQUIERE la 0012, la 0013 y la 0014.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 0. Guarda: el motor, las claves donde se las espera, y nada que
--    escriba plans o studio_settings sin pasar por ellas
-- ------------------------------------------------------------

do $guarda$
declare
  v_detalle text;
begin
  if to_regprocedure('public.mis_permisos()') is null
     or to_regprocedure('public.can(text)') is null
     or to_regclass('public.role_permissions') is null
     or to_regclass('public.user_permissions') is null then
    raise exception 'Falta el motor de permisos. Revisar si corrieron la 0012 y la 0014.';
  end if;

  -- Filtrar el encendido por un nombre de grupo viejo no enciende nada y
  -- no da error. Por eso primero se comprueba, clave por clave, que cada
  -- una está en el grupo por el que se la va a encender.
  select string_agg(format('%s (se la espera en "%s"; %s)', e.clave, e.grupo,
                           coalesce('está en "' || k.grupo || '"', 'no existe')),
                    '; ' order by e.clave)
    into v_detalle
    from (values ('planes.ver', 'Planes'), ('planes.crear', 'Planes'),
                 ('planes.editar', 'Planes'), ('planes.eliminar', 'Planes'),
                 ('config.ver', 'Configuración'), ('configuracion.ver', 'Configuración'),
                 ('config.editar', 'Configuración')) as e (clave, grupo)
    left join public.permission_keys k on k.clave = e.clave
   where k.grupo is distinct from e.grupo;
  if v_detalle is not null then
    raise exception 'Las claves no están donde esta migración las busca: %', v_detalle;
  end if;

  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.plans'::regclass)
     or not (select c.relrowsecurity from pg_class c where c.oid = 'public.studio_settings'::regclass) then
    raise exception 'plans o studio_settings no tienen RLS habilitada: apagar la clave no frenaría a nadie.';
  end if;

  -- Toda política PERMISIVA de escritura sobre las dos tablas tiene que
  -- ser exactamente `(select can('<la clave>'))`, sin nada al costado.
  -- Se compara la expresión entera y no un pedazo: `can('planes.editar')
  -- or auth.uid() is not null` también contiene la clave. Se normaliza lo
  -- que cambia con el search_path y con la versión (el `public.`, los
  -- espacios, el alias `AS can`), y se acepta la `can()` suelta, que
  -- decide lo mismo aunque se evalúe por fila.
  select string_agg(format('"%s" en %s (%s)', x.policyname, x.tablename, x.cmd), '; '
                    order by x.tablename, x.policyname)
    into v_detalle
    from (
      select p.policyname, p.tablename, p.cmd,
             case
               when p.tablename = 'plans' and p.cmd = 'INSERT' then 'planes.crear'
               when p.tablename = 'plans' and p.cmd = 'UPDATE' then 'planes.editar'
               when p.tablename = 'plans' and p.cmd = 'DELETE' then 'planes.eliminar'
               when p.tablename = 'studio_settings' and p.cmd in ('INSERT', 'UPDATE', 'DELETE') then 'config.editar'
             end as clave,
             regexp_replace(replace(lower(coalesce(p.qual, '')), 'public.', ''), '\s', '', 'g') as qual,
             regexp_replace(replace(lower(coalesce(p.with_check, '')), 'public.', ''), '\s', '', 'g') as chk
        from pg_policies p
       where p.schemaname = 'public'
         and p.tablename in ('plans', 'studio_settings')
         and p.permissive = 'PERMISSIVE'
         and p.cmd <> 'SELECT'
    ) x
   where x.clave is null  -- un FOR ALL: abre las tres cosas con una sola expresión
      or not (
        case x.cmd
          when 'INSERT' then x.qual = ''
                         and x.chk in (format('(selectcan(%L::text)ascan)', x.clave),
                                       format('(selectcan(%L::text))', x.clave),
                                       format('can(%L::text)', x.clave))
          else x.qual in (format('(selectcan(%L::text)ascan)', x.clave),
                          format('(selectcan(%L::text))', x.clave),
                          format('can(%L::text)', x.clave))
           and (x.chk = '' or x.chk in (format('(selectcan(%L::text)ascan)', x.clave),
                                        format('(selectcan(%L::text))', x.clave),
                                        format('can(%L::text)', x.clave)))
        end
      );
  if v_detalle is not null then
    raise exception 'Hay políticas de escritura que no son sólo la clave, y apagarla no las cierra: %', v_detalle
      using hint = 'Dejarlas en (select public.can(''...'')) con la clave que corresponde antes de correr esta migración.';
  end if;

  -- Una función SECURITY DEFINER no pasa por la RLS de lo que escribe. La
  -- única conocida que escribe plans es editar_disciplina, y sólo con
  -- catalogos.editar. Si aparece otra, hay que mirarla antes de decir que
  -- apagar las claves cierra la puerta.
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
    into v_detalle
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and p.prorettype <> 'trigger'::regtype
     and p.prosrc ~* '(update|insert[[:space:]]+into|delete[[:space:]]+from)[[:space:]]+(public\.)?(plans|studio_settings)\M'
     and not (p.proname = 'editar_disciplina' and p.prosrc ~ 'can\(''catalogos\.editar''\)')
     and (   exists (select 1 from pg_roles r where r.rolname = 'anon'
                      and has_function_privilege(r.oid, p.oid, 'EXECUTE'))
          or exists (select 1 from pg_roles r where r.rolname = 'authenticated'
                      and has_function_privilege(r.oid, p.oid, 'EXECUTE')));
  if v_detalle is not null then
    raise exception 'Hay funciones SECURITY DEFINER que escriben plans o studio_settings sin pasar por la RLS: %', v_detalle
      using hint = 'Revisar qué permiso piden adentro antes de correr esta migración.';
  end if;
end
$guarda$;

-- ------------------------------------------------------------
-- 1. Antes de tocar nada: encender tiene que cambiar SOLO lo pedido
-- ------------------------------------------------------------

do $antes$
declare
  v_detalle text;
begin
  -- (a) La matriz contra el legado, en todo lo que se va a encender. Lo
  --     único que se admite distinto es recepción en las cuatro que se le
  --     sacan: si alguien ya destildó alguna, da igual, se borra igual.
  select string_agg(format('%s para %s: el legado dice %s y la matriz %s',
                           x.clave, x.rol,
                           case when x.legado then 'sí' else 'no' end,
                           case when x.matriz then 'sí' else 'no' end),
                    '; ' order by x.clave, x.rol)
    into v_detalle
    from (
      select k.clave, r.rol,
             r.rol = any(k.legacy_roles) as legado,
             exists (select 1 from public.role_permissions rp
                      where rp.role = r.rol and rp.clave = k.clave) as matriz
        from public.permission_keys k
       cross join (values ('admin'), ('recepcion'), ('profesor'), ('alumno')) as r (rol)
       where k.grupo in ('Planes', 'Configuración')
         and k.enforce_mode = 'sombra'
         and not (r.rol = 'recepcion'
                  and k.clave in ('planes.crear', 'planes.editar', 'planes.eliminar', 'config.editar'))
    ) x
   where x.legado <> x.matriz;
  if v_detalle is not null then
    raise exception 'Encender Planes y Configuración cambiaría más de lo pedido: %', v_detalle
      using hint = 'Dejar la matriz igual al legado en esas claves (o decidir ese cambio aparte) y volver a correr esta migración.';
  end if;

  -- (b) Las excepciones por persona. En sombra no pesan; encendidas,
  --     ganan. Una que diga lo mismo que el rol no cambia nada y pasa.
  --     Una que diga otra cosa se estrenaría con el encendido sin que
  --     nadie lo haya decidido ahora: alguien del rol profesor sin config.ver, o
  --     alguien de recepción que conservaría planes.editar.
  select string_agg(format('%s (%s) tiene una excepción que %s %s',
                           up.user_id, coalesce(p.role, 'sin rol'),
                           case when up.allow then 'le da' else 'le saca' end,
                           up.clave),
                    '; ' order by up.clave, up.user_id)
    into v_detalle
    from public.user_permissions up
    join public.permission_keys k on k.clave = up.clave
    left join public.profiles p on p.id = up.user_id
   where k.grupo in ('Planes', 'Configuración')
     and k.enforce_mode = 'sombra'
     and (up.expires_at is null or up.expires_at > now())
     and up.allow is distinct from (
           p.role = any(k.legacy_roles)
           and not (p.role = 'recepcion'
                    and k.clave in ('planes.crear', 'planes.editar', 'planes.eliminar', 'config.editar')));
  if v_detalle is not null then
    raise exception 'Hay excepciones por persona que el encendido pondría a regir: %', v_detalle
      using hint = 'La pantalla no las administra todavía: sacarlas con delete from public.user_permissions where user_id = ... and clave = ... (o decidirlas aparte) y volver a correr esta migración.';
  end if;
end
$antes$;

-- ------------------------------------------------------------
-- 2. Recepción sin las cuatro
--
-- Antes del encendido y en la misma transacción: al revés habría un
-- instante —invisible, porque nadie ve la transacción a medias, pero
-- mejor no depender de eso— con el grupo rigiendo y la fila todavía ahí.
-- ------------------------------------------------------------

delete from public.role_permissions
 where role = 'recepcion'
   and clave in ('planes.crear', 'planes.editar', 'planes.eliminar', 'config.editar');

-- ------------------------------------------------------------
-- 3. Las ayudas que se leen en la pantalla de permisos
--
-- La de `config.editar` decía "Recepción hoy puede cambiar la ventana de
-- pago…", y las tres de planes eran notas para quien programa con números
-- de línea que ya se movieron. Se escriben diciendo qué hace la clave y
-- no quién la tiene, así siguen siendo ciertas si se vuelve atrás.
-- ------------------------------------------------------------

update public.permission_keys
   set ayuda = case clave
     when 'planes.crear' then
       'Dar de alta un plan nuevo con su precio, sus clases y su vigencia. Es configuración de precios, no operación de mostrador: asignar un plan a un cliente y cobrarlo no lo necesitan.'
     when 'planes.editar' then
       'Cambiar el precio, las clases, la vigencia o las disciplinas de un plan. Es configuración de precios, no operación de mostrador.'
     when 'planes.eliminar' then
       'Dar de baja un plan para que no se ofrezca más. Necesita además "Modificar planes y precios": dar de baja es una modificación del plan, y la base pide las dos. Las membresías que ya lo tienen no se modifican.'
     when 'config.editar' then
       'Cambiar los parámetros del negocio y los datos del estudio (plazos, ventanas de pago, avisos, horarios, contacto) y prender o apagar las reglas. Cambia cómo se comporta el sistema para todos los clientes. Los de control (el arqueo de la caja, el autoregistro del portal) los cambia sólo el admin, tenga quien tenga esta clave.'
     else ayuda end
 where clave in ('planes.crear', 'planes.editar', 'planes.eliminar', 'config.editar');

-- ------------------------------------------------------------
-- 4. Las vistas públicas, de sólo lectura
--
-- `revoke all` y `grant select`, y no sólo revocar la escritura: así el
-- permiso queda escrito, en vez de depender de lo que el esquema dé por
-- defecto. Sólo a anon y authenticated, que son las llaves que viajan en
-- el navegador. Se salta la que no exista.
-- ------------------------------------------------------------

do $vistas$
declare
  v text;
begin
  foreach v in array array['public_plans', 'public_studio_settings', 'public_disciplines',
                           'public_payment_discounts', 'public_schedule']
  loop
    if to_regclass('public.' || v) is not null then
      execute format('revoke all on public.%I from public, anon, authenticated', v);
      execute format('grant select on public.%I to anon, authenticated', v);
    end if;
  end loop;
end
$vistas$;

-- ------------------------------------------------------------
-- 5. Los dos grupos pasan a regir
-- ------------------------------------------------------------

do $encender$
declare
  v_sombra      int;
  v_nombradas   int;
  v_encendidas  int;
  v_extra       text;
begin
  select count(*),
         count(*) filter (where clave in ('planes.ver', 'planes.crear', 'planes.editar', 'planes.eliminar',
                                          'config.ver', 'configuracion.ver', 'config.editar')),
         string_agg(clave, ', ' order by clave)
           filter (where clave not in ('planes.ver', 'planes.crear', 'planes.editar', 'planes.eliminar',
                                       'config.ver', 'configuracion.ver', 'config.editar'))
    into v_sombra, v_nombradas, v_extra
    from public.permission_keys
   where grupo in ('Planes', 'Configuración') and enforce_mode = 'sombra';

  update public.permission_keys
     set enforce_mode = 'activo'
   where grupo in ('Planes', 'Configuración')
     and enforce_mode = 'sombra';
  get diagnostics v_encendidas = row_count;

  -- La primera vez son 7; si se vuelve a correr, 0. Lo que no puede pasar
  -- es que el filtro por grupo deje alguna de las siete sin encender.
  if v_encendidas <> v_sombra
     or exists (select 1 from public.permission_keys
                 where clave in ('planes.ver', 'planes.crear', 'planes.editar', 'planes.eliminar',
                                 'config.ver', 'configuracion.ver', 'config.editar')
                   and enforce_mode <> 'activo') then
    raise exception 'El encendido tocó % claves de % en sombra, y alguna de las siete quedó sin encender.',
      v_encendidas, v_sombra;
  end if;

  raise notice 'Encendidas % claves de Planes y Configuración (% de las siete de esta migración).',
    v_encendidas, v_nombradas;
  if v_extra is not null then
    -- Una clave que llegó a esos grupos después del relevamiento. Ya pasó
    -- por la comparación del punto 1, así que encenderla no la cambia.
    raise notice 'También se encendieron: %. Su matriz coincidía con el legado.', v_extra;
  end if;
end
$encender$;

-- ------------------------------------------------------------
-- 6. Cómo quedó
-- ------------------------------------------------------------

do $despues$
declare
  v_detalle text;
  v_cortan  text;
  v_avisan  text;
begin
  -- (a) Rol por rol: lo que respondería `mis_permisos()` a alguien de cada
  --     rol sin excepciones (las excepciones ya se miraron en el punto 1).
  --     Es la tabla de la decisión escrita entera: si una sola casilla no
  --     da, no se aplica nada.
  select string_agg(format('%s para %s: tendría que %s', e.clave, e.rol,
                           case when e.debe then 'tenerla y no la tiene' else 'no tenerla y la tiene' end),
                    '; ' order by e.clave, e.rol)
    into v_detalle
    from (values
      ('planes.ver',        'admin', true),  ('planes.ver',        'recepcion', true),
      ('planes.ver',        'profesor', true), ('planes.ver',      'alumno', true),
      ('config.ver',        'admin', true),  ('config.ver',        'recepcion', true),
      ('config.ver',        'profesor', true), ('config.ver',      'alumno', true),
      ('configuracion.ver', 'admin', true),  ('configuracion.ver', 'recepcion', true),
      ('configuracion.ver', 'profesor', false), ('configuracion.ver', 'alumno', false),
      ('planes.crear',      'admin', true),  ('planes.crear',      'recepcion', false),
      ('planes.crear',      'profesor', false), ('planes.crear',   'alumno', false),
      ('planes.editar',     'admin', true),  ('planes.editar',     'recepcion', false),
      ('planes.editar',     'profesor', false), ('planes.editar',  'alumno', false),
      ('planes.eliminar',   'admin', true),  ('planes.eliminar',   'recepcion', false),
      ('planes.eliminar',   'profesor', false), ('planes.eliminar', 'alumno', false),
      ('config.editar',     'admin', true),  ('config.editar',     'recepcion', false),
      ('config.editar',     'profesor', false), ('config.editar',  'alumno', false)
    ) as e (clave, rol, debe)
    join public.permission_keys k on k.clave = e.clave
   where e.debe is distinct from (
           case when k.enforce_mode = 'activo'
                then exists (select 1 from public.role_permissions rp
                              where rp.role = e.rol and rp.clave = e.clave)
                else e.rol = any(k.legacy_roles) end);
  if v_detalle is not null then
    raise exception 'La matriz no quedó como se decidió: %', v_detalle;
  end if;

  -- (b) La landing sigue leyendo las cinco vistas, con y sin sesión.
  select string_agg(format('%s para %s', v.nombre, r.rolname), ', ' order by v.nombre, r.rolname)
    into v_detalle
    from (values ('public_plans'), ('public_studio_settings'), ('public_disciplines'),
                 ('public_payment_discounts'), ('public_schedule')) as v (nombre)
    cross join pg_roles r
   where r.rolname in ('anon', 'authenticated')
     and to_regclass('public.' || v.nombre) is not null
     and not has_table_privilege(r.oid, to_regclass('public.' || v.nombre), 'SELECT');
  if v_detalle is not null then
    raise exception 'La web pública dejaría de leer: %', v_detalle;
  end if;

  -- (c) Ninguna vista sin security_invoker que se pueda escribir con las
  --     llaves del navegador. Sobre plans o studio_settings, directa o a
  --     través de otra vista, corta: es la misma puerta que se acaba de
  --     cerrar. Sobre otra tabla, avisa: es otro agujero, y se decide
  --     aparte.
  with recursive
    base as (
      select c.oid
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname in ('plans', 'studio_settings')
    ),
    depende (vista) as (
      -- La regla de una vista depende de las tablas que lee; y la de una
      -- vista sobre otra vista, de esa vista.
      select rw.ev_class
        from pg_depend d
        join pg_rewrite rw on rw.oid = d.objid
       where d.classid = 'pg_rewrite'::regclass
         and d.refclassid = 'pg_class'::regclass
         and d.refobjid in (select oid from base)
         and rw.ev_class not in (select oid from base)
      union
      select rw.ev_class
        from depende x
        join pg_depend d on d.refobjid = x.vista
                        and d.classid = 'pg_rewrite'::regclass
                        and d.refclassid = 'pg_class'::regclass
        join pg_rewrite rw on rw.oid = d.objid
       where rw.ev_class <> x.vista
    ),
    abiertas as (
      select n.nspname || '.' || c.relname as nombre,
             c.oid in (select vista from depende) as sobre_estas
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relkind = 'v'
         and not exists (select 1 from unnest(coalesce(c.reloptions, '{}'::text[])) o
                          where o ~* '^security_invoker=(on|true|yes|1)$')
         and pg_relation_is_updatable(c.oid, true) <> 0
         and exists (select 1 from pg_roles r
                      where r.rolname in ('anon', 'authenticated')
                        and (   has_table_privilege(r.oid, c.oid, 'INSERT')
                             or has_table_privilege(r.oid, c.oid, 'UPDATE')
                             or has_table_privilege(r.oid, c.oid, 'DELETE')))
    )
  select string_agg(nombre, ', ' order by nombre) filter (where sobre_estas),
         string_agg(nombre, ', ' order by nombre) filter (where not sobre_estas)
    into v_cortan, v_avisan
    from abiertas;
  if v_cortan is not null then
    raise exception 'Hay vistas sobre plans o studio_settings que la llave pública puede escribir sin pasar por la RLS: %', v_cortan
      using hint = 'Dejarles sólo SELECT (revoke insert, update, delete ... from anon, authenticated) o crearlas con security_invoker, y volver a correr esta migración.';
  end if;
  if v_avisan is not null then
    raise notice 'Estas vistas se pueden escribir con la llave pública sin pasar por la RLS, y no son de esta migración: %', v_avisan;
  end if;

  if exists (select 1 from public.permission_config where key = 'modo' and value = 'emergencia') then
    raise notice 'El interruptor de emergencia está puesto: mientras siga así, can() responde el legado y recepción conserva estas cuatro claves.';
  end if;
end
$despues$;

commit;

-- ============================================================
-- CÓMO VERIFICAR (en el SQL Editor, después de correrla)
--
--   -- 1. La red de siempre, en cero. Ojo: estos dos grupos ya salieron
--   --    de ella (perm_diff mira sólo lo que está en sombra).
--   select * from public.perm_diff();
--
--   -- 2. Lo que responde el motor a cada rol en los dos grupos, con la
--   --    misma cuenta que mis_permisos() (sin excepciones por persona):
--   select k.clave, k.enforce_mode, r.rol,
--          case when k.enforce_mode = 'activo'
--               then exists (select 1 from public.role_permissions rp
--                             where rp.role = r.rol and rp.clave = k.clave)
--               else r.rol = any(k.legacy_roles) end as responde
--     from public.permission_keys k
--    cross join (values ('admin'), ('recepcion'), ('profesor'), ('alumno')) as r (rol)
--    where k.grupo in ('Planes', 'Configuración')
--    order by k.grupo, k.orden, r.rol;
--   → recepción: sí en planes.ver, config.ver y configuracion.ver; no en
--     planes.crear, planes.editar, planes.eliminar, config.editar y
--     promos.administrar. Admin: sí en las ocho. Profesor y cliente: sí
--     en planes.ver y config.ver, no en el resto.
--
--   -- 3. can() de verdad, con una sesión simulada de un usuario real
--   --    (el uuid sale de select id, role from public.profiles). Se
--   --    deshace solo:
--   begin;
--   select set_config('request.jwt.claims',
--          json_build_object('sub', '<uuid>', 'role', 'authenticated')::text, true);
--   select public.can('planes.editar') as planes_editar,
--          public.can('config.editar') as config_editar,
--          public.can('config.ver')    as config_ver,
--          public.can('planes.ver')    as planes_ver;
--   rollback;
--   → con el admin: las cuatro en true. Con alguien del rol profesor o un cliente:
--     false, false, true, true. Con recepción, cuando exista la primera
--     cuenta: false, false, true, true.
--
--   -- 4. La base rechaza, no la pantalla. Con la misma sesión simulada y
--   --    el rol de la API (se deshace solo):
--   begin;
--   select set_config('request.jwt.claims',
--          json_build_object('sub', '<uuid>', 'role', 'authenticated')::text, true);
--   set local role authenticated;
--   update public.plans set name = name
--    where id = (select id from public.plans order by created_at limit 1) returning id;
--   update public.studio_settings set value = value where key = 'cancel_hours' returning key;
--   rollback;
--   → con el admin, una fila cada uno. Con recepción, profesor o
--     cliente, cero filas: RLS no da error, filtra.
--
--   -- 5. Las vistas públicas, de sólo lectura. Sólo lee:
--   select table_name, grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_schema = 'public' and table_name like 'public\_%'
--      and grantee in ('anon', 'authenticated')
--    order by 1, 2, 3;
--   → sólo SELECT, para anon y para authenticated, en las cinco.
--   Y probarlo sin escribir nada (`where false` no toca ninguna fila; con
--   la vista abierta daría UPDATE 0, cerrada da el error):
--   begin;
--   set local role anon;
--   update public.public_plans set name = name where false;
--   rollback;
--   → permission denied for view public_plans
--   Y la web, sin sesión: la landing muestra los planes, los horarios, el
--   WhatsApp y la línea del descuento en efectivo, como antes.
--
-- Y en la pantalla, cuando exista una cuenta de recepción: en Planes no
-- aparecen "Nuevo plan", el lápiz ni la papelera, y dice que es de sólo
-- lectura; en Configuración los parámetros y los datos del estudio se
-- ven deshabilitados, sin "Guardar" ni "Encender". Con el admin, todo
-- igual que antes.
-- ============================================================

-- ============================================================
-- PARA VOLVER ATRÁS
--
--   begin;
--   insert into public.role_permissions (role, clave) values
--     ('recepcion', 'planes.crear'), ('recepcion', 'planes.editar'),
--     ('recepcion', 'planes.eliminar'), ('recepcion', 'config.editar')
--   on conflict do nothing;
--   update public.permission_keys set enforce_mode = 'sombra'
--    where clave in ('planes.ver', 'planes.crear', 'planes.editar', 'planes.eliminar',
--                    'config.ver', 'configuracion.ver', 'config.editar');
--   commit;
--
-- Por clave y NO por grupo, a propósito: `promos.administrar` es del
-- grupo Planes, rige desde la 0079 y su legado es '{}'. Devolver el grupo
-- entero a sombra la dejaría sin nadie —ni el admin— que pueda
-- administrar promociones.
--
-- Las ayudas no se revierten: dicen qué hace cada clave, no quién la
-- tiene, así que siguen siendo ciertas. Después de volver atrás,
-- `select * from public.perm_diff();` tiene que dar cero filas otra vez.
--
-- Las vistas NO se vuelven atrás con lo de arriba, y no conviene
-- hacerlo: devolverles la escritura reabre, para cualquiera sin sesión,
-- el precio de los planes, los datos del estudio, el autoregistro del
-- portal y el descuento con que se cobra. Si hiciera falta por algo que
-- no se previó, es esto:
--   grant insert, update, delete on public.public_plans, public.public_studio_settings,
--     public.public_disciplines, public.public_payment_discounts, public.public_schedule
--     to anon, authenticated;
--
-- El freno de mano, si algo sale mal y hay gente esperando:
--   update public.permission_config set value = 'emergencia' where key = 'modo';
-- (devuelve las claves a recepción; las vistas siguen cerradas).
-- ============================================================
