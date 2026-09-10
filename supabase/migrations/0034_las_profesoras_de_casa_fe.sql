-- ============================================================
-- 0034 — Las profesoras de Casa Fe
--
-- Las tres que el estudio pasó el 09/09, con los datos incompletos tal
-- como vinieron. Se cargan igual porque la base solo exige el nombre:
-- teléfono y email tienen default '' desde la 0001, así que una ficha
-- sin ellos es una ficha válida, no una a medias.
--
-- La del turno tarde todavía no está definida y entra con un nombre
-- provisorio. Se puede porque `class_sessions.teacher_id` apunta al id,
-- no al nombre: el día que se sepa quién es, se le cambia el nombre desde
-- Configuración y las clases que ya tenga cargadas siguen apuntando a
-- ella sin que haya que tocar ninguna.
--
-- LOS TURNOS NO SE GUARDAN, y hay que decir por qué: no existe tabla de
-- disponibilidad. El turno queda implícito en qué profesora lleva cada
-- clase de la grilla, y el formulario ofrece las tres para cualquier
-- horario. Se anotan acá para que el dato no se pierda:
--
--   Ivana                    lunes a viernes de 8:00 a 14:00
--   Profesora turno tarde    lunes a viernes de 14:00 a 20:00
--   Leandro                  sábados de 9:00 a 13:00
--
-- Si más adelante se quiere que el sistema avise al cargar una clase
-- fuera del turno de su profesora, eso es una tabla nueva.
--
-- VA DESPUÉS DE LA 0027, y el orden no es opcional: la guardia de la
-- 0027 aborta si encuentra una profesora que no sea de las sembradas.
-- Corrida esta, la 0027 ya no puede correr nunca más.
--
-- Los ids son fijos y con prefijo 'fe0000' —no 'a0000000', que es el de
-- las profesoras de demo que la 0027 borra— así que correr esta
-- migración dos veces no duplica a nadie.
--
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- ============================================================

begin;

insert into public.teachers (id, name, disciplines, phone, email, color, active) values
  ('fe000001-0000-0000-0000-000000000001', 'Ivana',
   '{"Pilates Reformer"}', '', '', '#C4735A', true),

  ('fe000001-0000-0000-0000-000000000002', 'Profesora turno tarde',
   '{"Pilates Reformer"}', '', '', '#8B9B6E', true),

  ('fe000001-0000-0000-0000-000000000003', 'Leandro',
   '{"Pilates Reformer"}', '', '', '#7E93B8', true)

-- do nothing y no do update: si el estudio ya les corrigió el nombre o
-- les cargó el teléfono desde la pantalla, volver a correr esto no se lo
-- pisa.
on conflict (id) do nothing;

commit;

-- ============================================================
-- CÓMO VERIFICAR
--
--   select name, disciplines, coalesce(nullif(phone,''),'—') as tel,
--          coalesce(nullif(email,''),'—') as mail, active
--   from public.teachers order by name;
--   → las tres, con Pilates Reformer, sin teléfono ni mail
--
-- Y en la pantalla: Configuración → Profesores las muestra, y el
-- formulario de clase de la Agenda ya las ofrece en su desplegable.
--
-- ------------------------------------------------------------
-- LO QUE FALTA DE ESTAS TRES
--
-- 1. Nombre completo, teléfono y email de Ivana y de Leandro.
-- 2. Quién es la profesora del turno tarde.
-- 3. El email es lo que bloquea el paso siguiente: la cuenta con la que
--    la profesora entra al sistema se crea con su mail, así que hasta
--    que lleguen, el rol profesora no se puede probar de punta a punta.
--    El vínculo ficha↔cuenta es un desplegable por fila en Configuración
--    (teachers.user_id, 0012), así que se hace después sin tocar nada.
-- ------------------------------------------------------------
-- ============================================================

-- ============================================================
-- VUELTA ATRÁS (no ejecutar salvo que haga falta)
--
-- Solo sirve si ninguna clase les quedó asignada: teacher_id es NOT NULL
-- con clave foránea, así que si ya hay grilla cargada el delete falla, y
-- está bien que falle.
--
--   begin;
--   delete from public.teachers where id::text like 'fe000001%';
--   commit;
-- ============================================================
