-- ============================================================
-- 0013 — Las políticas de la base pasan a preguntarle al motor
--
-- Reemplaza `app_role() in (...)` por `can('clave')` en las políticas que
-- corresponde. Como TODAS las claves están en modo sombra (migración
-- 0012), can() responde hoy exactamente lo mismo que respondía el rol:
-- este cambio no altera ningún comportamiento y es verificable.
--
-- Ejecutar DESPUÉS de comprobar que `select * from public.perm_diff()`
-- devuelve cero filas.
--
-- Lo que NO se toca, a propósito:
--   · Todo el aislamiento del portal (my_student_ids): que cada alumna vea
--     solo lo suyo no es un permiso configurable. Si fuera un casillero,
--     alguien lo apaga por error y es una fuga.
--   · `admin administra perfiles`: es la puerta de la elevación de
--     privilegios. Queda con el rol clavado y sin clave asociada.
--   · Las dos políticas de app_settings: ahí vive el token de cobro.
--   · Las políticas del propio motor (0012): si administrar permisos
--     dependiera del motor, un error dejaría el sistema sin nadie que lo
--     pueda arreglar.
--   · `lectura autenticados` de teachers, plans, class_sessions, rooms,
--     studio_settings, disciplines y payment_methods: el portal y la
--     landing dependen de ellas.
--   · handle_new_user, enforce_class_capacity y assign_receipt_number:
--     son reglas de negocio, no permisos.
--
-- Dos cuidados que están en cada línea de abajo:
--   1. can() va SIEMPRE envuelto en (select ...). Sin eso Postgres la
--      evalúa una vez POR FILA en vez de una vez por consulta.
--   2. `for all` también otorgaba SELECT. Al abrirlo en verbos hay que
--      verificar que quede una política de lectura viva o el staff se
--      queda ciego. Está verificado tabla por tabla más abajo.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. PERFILES — la política mixta se PARTE, no se reescribe
--
-- `id = auth.uid()` es aislamiento: sin eso nadie puede leer su propio
-- perfil y se rompen el login y el encabezado. Las políticas permisivas
-- se suman con OR, así que partirla en dos no cambia nada.
-- ------------------------------------------------------------
drop policy "leer perfil propio o staff" on public.profiles;

create policy "leo mi propio perfil"
  on public.profiles for select
  using (id = auth.uid());

create policy "staff ve los perfiles"
  on public.profiles for select
  using ((select public.can('usuarios.ver')));

-- ------------------------------------------------------------
-- 2. LECTURA DE LOS DATOS DE LA ALUMNA
--
-- En las cuatro, la política del portal (alumno lee lo suyo) queda intacta.
-- ------------------------------------------------------------
drop policy "staff y profesores leen" on public.students;
create policy "alumnos: ver"
  on public.students for select
  using ((select public.can('alumnos.ver')));

drop policy "staff y profesores leen" on public.memberships;
create policy "membresias: ver"
  on public.memberships for select
  using ((select public.can('membresias.ver')));

-- La rama ".propio" queda escrita pero inerte: nadie tiene esa clave en el
-- catálogo. NO encenderla hasta arreglar el cálculo de cupos de la agenda,
-- que hoy cuenta sobre las reservas que la base le dejó ver: un profesor
-- con acceso solo a sus clases vería todas las demás vacías.
drop policy "staff y profesores leen" on public.reservations;
create policy "reservas: ver"
  on public.reservations for select
  using (
    (select public.can('reservas.ver'))
    or (
      (select public.can('reservas.ver.propio'))
      and class_id in (select public.my_class_ids())
    )
  );

-- Esta política gobierna también la vista monthly_revenue, la única del
-- proyecto que hereda los permisos de quien consulta.
drop policy "staff lee pagos" on public.payments;
create policy "finanzas: ver"
  on public.payments for select
  using ((select public.can('finanzas.ver')));

-- ------------------------------------------------------------
-- 3. DATOS DE SALUD
--
-- Se abre en cuatro verbos: ver y editar quedan separados, que es lo que
-- pide el documento. La política del portal no se toca.
-- ------------------------------------------------------------
drop policy "staff administra datos sensibles" on public.student_private;

create policy "salud: ver"
  on public.student_private for select
  using ((select public.can('salud.ver')));
create policy "salud: crear"
  on public.student_private for insert
  with check ((select public.can('salud.editar')));
create policy "salud: editar"
  on public.student_private for update
  using ((select public.can('salud.editar')));
create policy "salud: borrar"
  on public.student_private for delete
  using ((select public.can('salud.editar')));

-- ------------------------------------------------------------
-- 4. AVISOS
-- ------------------------------------------------------------
drop policy "staff ve notificaciones del estudio" on public.notifications;
create policy "avisos: ver"
  on public.notifications for select
  using (audience = 'staff' and (select public.can('avisos.ver')));

-- ------------------------------------------------------------
-- 5. ESCRITURA — se abre el `for all` en crear / editar / borrar
--
-- El documento pide distinguir crear, modificar y eliminar. Hoy es una
-- sola regla que colapsa los tres.
--
-- Verificación de que nadie queda ciego al perder el SELECT implícito:
--   teachers, plans, class_sessions → `lectura autenticados` (0001), viva
--   students, memberships, reservations, payments → reescritas arriba
-- ------------------------------------------------------------
do $$
declare
  tablas  text[] := array['students', 'memberships', 'reservations', 'payments',
                          'class_sessions', 'plans', 'teachers'];
  modulos text[] := array['alumnos', 'membresias', 'reservas', 'pagos',
                          'agenda', 'planes', 'profesores'];
  i int;
begin
  for i in 1 .. array_length(tablas, 1) loop
    execute format('drop policy "escritura staff" on public.%I', tablas[i]);

    execute format(
      'create policy "%s: crear" on public.%I for insert
         with check ((select public.can(''%s.crear'')))',
      modulos[i], tablas[i], modulos[i]);

    execute format(
      'create policy "%s: editar" on public.%I for update
         using ((select public.can(''%s.editar'')))',
      modulos[i], tablas[i], modulos[i]);

    execute format(
      'create policy "%s: borrar" on public.%I for delete
         using ((select public.can(''%s.eliminar'')))',
      modulos[i], tablas[i], modulos[i]);
  end loop;
end;
$$;

-- Dos módulos usan un verbo propio en vez del genérico.
drop policy "pagos: crear" on public.payments;
create policy "pagos: registrar"
  on public.payments for insert
  with check ((select public.can('pagos.registrar')));

drop policy "membresias: crear" on public.memberships;
create policy "membresias: asignar"
  on public.memberships for insert
  with check ((select public.can('membresias.asignar')));

-- Reservas tiene tres formas distintas de modificar (confirmar, marcar
-- asistencia, cancelar). La política deja pasar las tres; la restrictiva
-- de más abajo es la que decide cuál se ejerció.
drop policy "reservas: editar" on public.reservations;
create policy "reservas: escribir"
  on public.reservations for update
  using (
    (select public.can('reservas.editar'))
    or (select public.can('reservas.asistencia'))
    or (select public.can('reservas.anular'))
  );

-- ------------------------------------------------------------
-- 6. CATÁLOGOS Y PARÁMETROS
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['rooms', 'disciplines', 'payment_methods']
  loop
    execute format('drop policy "escritura staff" on public.%I', t);
    execute format(
      'create policy "catalogos: crear" on public.%I for insert
         with check ((select public.can(''catalogos.crear'')))', t);
    execute format(
      'create policy "catalogos: editar" on public.%I for update
         using ((select public.can(''catalogos.editar'')))', t);
    execute format(
      'create policy "catalogos: borrar" on public.%I for delete
         using ((select public.can(''catalogos.eliminar'')))', t);
  end loop;
end;
$$;

drop policy "escritura staff" on public.studio_settings;
create policy "config: crear"
  on public.studio_settings for insert
  with check ((select public.can('config.editar')));
create policy "config: editar"
  on public.studio_settings for update
  using ((select public.can('config.editar')));
create policy "config: borrar"
  on public.studio_settings for delete
  using ((select public.can('config.editar')));

-- ------------------------------------------------------------
-- 7. "ELIMINAR O ANULAR MOVIMIENTOS" — el corte real
--
-- El documento pide separar modificar de eliminar/anular. Acá eso NO se
-- resuelve con políticas de DELETE: el sistema no borra nada desde el
-- navegador (verificado: los únicos dos DELETE del código son sobre
-- suscripciones push). Dar de baja es poner `active` en false y anular es
-- cambiar el estado — los dos son modificaciones.
--
-- Por eso el corte va en el WITH CHECK del UPDATE, que mira cómo queda la
-- fila. Las políticas restrictivas se suman con Y a las permisivas, así
-- que se agregan sin tocar nada de lo anterior.
-- ------------------------------------------------------------
do $$
declare
  tablas text[] := array['plans', 'teachers', 'class_sessions', 'students',
                         'rooms', 'disciplines', 'payment_methods'];
  claves text[] := array['planes.eliminar', 'profesores.eliminar', 'agenda.eliminar',
                         'alumnos.eliminar', 'catalogos.eliminar', 'catalogos.eliminar',
                         'catalogos.eliminar'];
  i int;
begin
  for i in 1 .. array_length(tablas, 1) loop
    execute format(
      'create policy "baja exige permiso" on public.%I as restrictive for update
         using (true) with check (active or (select public.can(''%s'')))',
      tablas[i], claves[i]);
  end loop;
end;
$$;

create policy "anular exige permiso"
  on public.payments as restrictive for update
  using (true)
  with check (status <> 'anulado' or (select public.can('pagos.anular')));

create policy "anular exige permiso"
  on public.memberships as restrictive for update
  using (true)
  with check (status <> 'suspendida' or (select public.can('membresias.anular')));

-- La más delicada de todas. Las restrictivas aplican a TODOS los roles,
-- incluida la alumna — y "alumno cancela" (0005) es literalmente un
-- update a estado 'cancelada'. Sin la rama de aislamiento, el portal deja
-- de poder cancelar y el problema recién aparece cuando una alumna lo
-- intenta.
create policy "anular y asistencia exigen permiso"
  on public.reservations as restrictive for update
  using (true)
  with check (
    case
      when status = 'cancelada' then
        (select public.can('reservas.anular'))
        or student_id in (select public.my_student_ids())
      when status in ('asistió', 'ausente') then
        (select public.can('reservas.asistencia'))
      else
        (select public.can('reservas.editar'))
        or student_id in (select public.my_student_ids())
    end
  );

commit;

-- ============================================================
-- CÓMO VERIFICAR (no ejecutar acá)
--
-- Nada tiene que haber cambiado. Con una sesión de cada rol:
--   · admin y recepción: crear una alumna, cobrar un pago, generar un
--     link de Mercado Pago, ver el historial de pagos, ver la ficha
--     médica, marcar asistencia, dar de baja un plan.
--   · profesora: ve la agenda, las alumnas y las reservas; NO ve pagos ni
--     datos médicos; no puede modificar nada.
--   · alumna: entra al portal, reserva, se anota en lista de espera y
--     CANCELA (esto último es lo que prueba la restrictiva de reservas).
--
-- Recién con eso, el encendido va grupo por grupo:
--   update public.permission_keys set enforce_mode = 'activo'
--    where grupo = 'Catálogos';
--
-- Y ante cualquier cosa rara, sin desplegar nada:
--   update public.permission_config set value = 'emergencia'
--    where key = 'modo';
-- ============================================================

-- ============================================================
-- VUELTA ATRÁS
--
-- El interruptor de emergencia de la 0012 NO sirve acá: en modo sombra
-- can() ya devuelve el legado, así que si algo se rompe después de esta
-- migración es un error de las políticas mismas, no de los permisos.
-- Para eso está esto: pegar el bloque entero deja la base como antes.
--
-- begin;
--   drop policy if exists "leo mi propio perfil" on public.profiles;
--   drop policy if exists "staff ve los perfiles" on public.profiles;
--   create policy "leer perfil propio o staff" on public.profiles for select
--     using (id = auth.uid() or public.app_role() in ('admin', 'recepcion'));
--
--   drop policy if exists "alumnos: ver" on public.students;
--   drop policy if exists "membresias: ver" on public.memberships;
--   drop policy if exists "reservas: ver" on public.reservations;
--   create policy "staff y profesores leen" on public.students for select
--     using (public.app_role() in ('admin', 'recepcion', 'profesor'));
--   create policy "staff y profesores leen" on public.memberships for select
--     using (public.app_role() in ('admin', 'recepcion', 'profesor'));
--   create policy "staff y profesores leen" on public.reservations for select
--     using (public.app_role() in ('admin', 'recepcion', 'profesor'));
--
--   drop policy if exists "finanzas: ver" on public.payments;
--   create policy "staff lee pagos" on public.payments for select
--     using (public.app_role() in ('admin', 'recepcion'));
--
--   drop policy if exists "salud: ver" on public.student_private;
--   drop policy if exists "salud: crear" on public.student_private;
--   drop policy if exists "salud: editar" on public.student_private;
--   drop policy if exists "salud: borrar" on public.student_private;
--   create policy "staff administra datos sensibles" on public.student_private for all
--     using (public.app_role() in ('admin', 'recepcion'))
--     with check (public.app_role() in ('admin', 'recepcion'));
--
--   drop policy if exists "avisos: ver" on public.notifications;
--   create policy "staff ve notificaciones del estudio" on public.notifications for select
--     using (audience = 'staff' and public.app_role() in ('admin', 'recepcion'));
--
--   -- Escritura: se borran los verbos y vuelve el for all de siempre.
--   do $r$
--   declare
--     tablas  text[] := array['students','memberships','reservations','payments',
--                             'class_sessions','plans','teachers','rooms',
--                             'disciplines','payment_methods','studio_settings'];
--     t text; p record;
--   begin
--     foreach t in array tablas loop
--       for p in select policyname from pg_policies
--                 where schemaname = 'public' and tablename = t
--                   and (policyname like '%: crear' or policyname like '%: editar'
--                        or policyname like '%: borrar' or policyname like '%: registrar'
--                        or policyname like '%: asignar' or policyname like '%: escribir'
--                        or policyname in ('baja exige permiso', 'anular exige permiso',
--                                          'anular y asistencia exigen permiso'))
--       loop
--         execute format('drop policy %I on public.%I', p.policyname, t);
--       end loop;
--       execute format(
--         'create policy "escritura staff" on public.%I for all
--            using (public.app_role() in (''admin'', ''recepcion''))
--            with check (public.app_role() in (''admin'', ''recepcion''))', t);
--     end loop;
--   end;
--   $r$;
-- commit;
-- ============================================================
