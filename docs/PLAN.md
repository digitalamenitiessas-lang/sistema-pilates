# Plan de avance — PilatesStudio

> Documento vivo. Se actualiza con cada bloque de trabajo.
> Última actualización: **05/09/2026** (cruce del documento de requerimientos de Casa Fé).
> Documentos para la clienta (presentables, no este plan interno):
> `docs/PilatesStudio-que-incluye-el-sistema.pdf` (qué abarca hoy + roles) ·
> `docs/PilatesStudio-integraciones-y-etapas.pdf` (integraciones y etapas).

## ⚠️ 05/09/2026 — Llegó el documento de requerimientos de Casa Fé

La clienta pasó **“Requerimientos y ajustes del sistema Casa Fé”** (17 secciones +
4 agregados de último momento). Ese documento pasa a ser la hoja de ruta y este
plan queda como registro de lo construido hasta acá.

- **Qué cubrimos y cómo arrancamos**: [`REQUERIMIENTOS-CASA-FE.md`](REQUERIMIENTOS-CASA-FE.md)
- **Estado ítem por ítem** (178 requerimientos): [`requerimientos-casa-fe-detalle.md`](requerimientos-casa-fe-detalle.md)

Resumen del cruce: 16 cubiertos · 64 parciales · 98 nuevos ≈ 210-250 días de
desarrollo. Lo operativo (agenda, membresías, cobros, portal, avisos, roles) está
hecho; falta todo lo de negocio (caja y gastos, personal y sueldos, inventario,
comercial, reportes) más los cuatro agregados (lista de espera con aviso
automático, horarios fijos, prioridad de pago del 1 al 9, vigencia por activación).

El criterio de trabajo: **lo que es un número o un texto se configura desde el
sistema**, así casi nada queda bloqueado esperando respuestas. Quedan 5 preguntas
de forma para la clienta (§7 del documento); el resto lo carga ella.

**Ojo con dos cosas del plan viejo que el documento cambia**: la renovación
automática choca con la regla de pago del 1 al 9, y el rol profesor en modo solo
consulta choca con que la profesora marque asistencia y agregue alumnas.

### Decisiones tomadas (05/09/2026)

Un solo local (no se modela multi-sede) · arrancamos por las prioridades 1 a 4 ·
los horarios fijos son días fijos de la semana · el plan es pago mensual por X
clases por semana · **todo lo que sea un número o un texto se configura desde el
sistema en vez de escribirse en el código**, así el estudio ajusta sus reglas sin
esperar un desarrollo y nosotros no quedamos bloqueados esperando respuestas.

### 🔄 Bloque 0 — La mesa de control (primer tramo hecho)

Migración **`0011_configurable.sql`** — *pendiente de correr en el SQL Editor
del dashboard de Supabase*. Hasta que corra, el sistema sigue andando igual con
los valores que tenía escritos en el código.

- Tabla `studio_settings`: 21 parámetros del negocio (plazo de cancelación,
  anticipación de cada aviso, ventana de pago del 1 al 9, cuándo se consume la
  clase…) con su etiqueta y su ayuda. La pantalla de Configuración se arma sola
  con esas filas, así que sumar un parámetro es un `INSERT`.
- Datos del estudio (nombre, dirección, WhatsApp, Instagram, email, horarios)
  fuera del código: la landing los lee de `public_studio_settings` con respaldo.
- Catálogo de **disciplinas** editable (color, descripción, renombrado en cascada
  a clases, planes y profesoras) — reemplaza las 6 constantes duplicadas.
- Catálogo de **medios de pago** editable.
- El cron diario lee los parámetros en vez de sus constantes.
- Arreglo: un pago anulado ya no suma al total adeudado ni dispara alertas.

### 🔄 Bloque 0 — Motor de permisos (migración 0012, en frío)

Requisito de la sección 11: permisos configurables por rol y por persona.
Precedido por un relevamiento de **116 puntos de control de acceso** (42 en
políticas de la base, 40 en la interfaz, 19 en endpoints, 15 en datos
sensibles) y tres diseños comparados.

La idea que lo hace seguro es el **modo sombra**: cada clave guarda en
`legacy_roles` lo que el sistema responde HOY, y mientras está en sombra
`can()` contesta con eso. Así reescribir una política de `app_role()` a
`can()` es un cambio sin efecto, verificable con `perm_diff()`. El encendido
después va grupo por grupo y se revierte con un UPDATE.

- Migración `0012_permisos.sql`: 5 tablas del motor, catálogo de **71 claves**
  con sus roles actuales, matriz derivada de `legacy_roles` (así arranca
  siendo por construcción lo que el sistema hace hoy), funciones
  `mis_permisos()` / `can()` / `perm_diff()`, `teachers.user_id` +
  `my_teacher_ids()` para el alcance "solo mis clases", bitácora de cambios,
  guardia anti auto-elevación e invariante de que nunca quede sin admin.
  Es atómica y **en frío**: nada la consume todavía.
- Deuda previa arreglada antes del motor (hoy inocua porque leer y escribir
  usan la misma condición, y el motor la activaría el primer día): el
  fallback muerto de las notas médicas contra una columna que 0008 eliminó,
  el guardado que las pisaba con vacío, y el borrado de suscripciones push
  que no filtraba por usuario.

Migración `0013_permisos_policies.sql` aplicada y verificada: las políticas
de la base ya preguntan al motor. Trae su propio bloque de vuelta atrás.

Migración `0014_fix_can.sql` — **arreglo**: `can()` traía un caché por
transacción que la rompía. Como la función declara `search_path` vacío,
Postgres restaura las variables al salir, y una variable personalizada no
vuelve a "no existe" sino a cadena vacía: desde la segunda llamada el
caché se leía vacío y `can()` respondía que no a todo. Síntoma: el staff
dejó de ver alumnas, membresías, reservas y pagos. El caché era una
optimización, no parte de la corrección — con la llamada envuelta en
`(select ...)` Postgres la resuelve igual una vez por consulta.

Verificado con sesión real de admin después del arreglo: los KPIs del
tablero vuelven a sus valores previos, y pasan marcar asistencia, cancelar
una reserva, dar de baja un plan, leer datos de salud, guardar un
parámetro y anular un pago (todo revertido después de probar).

Falta: probar el portal de la alumna (cancelar una reserva es lo que
ejercita la rama de aislamiento de la política restrictiva), tolerancia a
fallo del bundle en `lib/api.ts`, unificar los chequeos del servidor, la
pantalla de la matriz, y el encendido gradual. Después: baja lógica de usuarios, momento
exacto del cobro en huso argentino y reorganización de Configuración.

## Estado general

Sistema desplegado en Vercel y operativo con datos de ejemplo. Núcleo completo
(gestión + cobros + landing + autogestión + portal del alumno), ahora también
usable desde el celular, instalable como app y con notificaciones reales.
Lo que falta se divide en: trabajo nuestro (renovación automática, huecos del
portal, mostrador) y cosas bloqueadas por la clienta (cuenta MP, datos reales,
decisiones de negocio).

Desde el 26/08 **sí corre un proceso solo**: el cron diario de Vercel
(`/api/cron/diario`) genera las notificaciones de membresías por vencer /
vencidas y deudas, manda push al staff y emails a las alumnas (cuando Resend
esté configurado). Además los triggers de la base crean notificaciones al
acreditarse un pago y al darse de alta un alumno. Las alertas del tablero de
inicio siguen derivándose al leer (`buildAlerts` en `lib/api.ts`) — conviven:
el tablero muestra el estado, la campana muestra los eventos.

## Etapas

### ✅ Etapa 0 — Base (jul 2026)
Sistema de gestión completo: alumnos, planes, membresías, agenda, reservas,
pagos con comprobantes autonumerados. Auth con roles + RLS. Migración `0001`.

### ✅ Mercado Pago autogestionable (jul 2026)
Credenciales cargadas por el admin en Configuración, links de pago Checkout
Pro por deuda, acreditación automática al abrir Pagos + webhook para
producción. Migración `0002`.

### ✅ Landing pública (jul 2026)
Landing animada en `/` con planes y horarios en vivo desde la base (vistas
públicas). Sistema movido a `/sistema`. WhatsApp real en todos los CTA. Menú
mobile. Migración `0003`.

### ✅ Autogestión total (jul 2026)
ABM de clases desde la agenda; profesores, salas y usuarios del sistema desde
Configuración. Recordatorios de WhatsApp con un click (con link de pago
incluido) en deudas y alertas. Migración `0004`.

### ✅ Etapa 3 — Portal del alumno + PWA (04/08/2026, verificada)
- Portal mobile-first: membresía con clases restantes, reserva con cupos en
  vivo y lista de espera, cancelación, deudas con "Pagar online", historial.
- RLS por alumno (cada uno ve SOLO sus datos — verificado con intentos de
  fuga), cupo garantizado por trigger en la base, acceso creado desde la
  ficha por staff. PWA instalable con ícono de marca. Migración `0005`.
- Cuenta demo: `camila.portal@pilatestudio.com` (borrar o usar para demos).

### ✅ Rol profesor en modo solo consulta (24/08/2026)
La base ya lo protegía (las políticas de escritura son solo `admin` y
`recepcion`), pero la interfaz mostraba igual los botones de alta, edición y
cobro: un profesor los veía y al tocarlos recibía un error de permisos.
Ahora `canWrite` sale del contexto (`lib/data-context.tsx`) replicando esa
misma regla, y esconde las acciones en agenda, alumnos, ficha, planes,
reservas, pagos, configuración y los avisos de WhatsApp del inicio. El header
muestra el distintivo "Solo consulta". La base sigue siendo la que manda —
esto solo evita ofrecer acciones que iban a fallar.

### ✅ Bloque 26/08 — Seguridad, responsive, PWA, notificaciones y roles
- **Seguridad**: el trigger de perfiles ya no toma el rol de la metadata del
  registro (cualquiera con la anon key podía nacer admin si los signups
  públicos estaban habilitados — migración `0006`); checks explícitos de rol
  staff en los endpoints de MP.
- **Responsive**: sidebar drawer en mobile con hamburguesa (la causa del
  "se desconfigura todo"), agenda con vista por día, tabs de la ficha con
  scroll, modales que ya no cortan contenido, grids y paddings.
- **PWA**: invitación post-login a agregar la app al inicio (pasos de Safari
  en iPhone, diálogo nativo en Android; `pwa-debug`=`ios` en localStorage la
  fuerza para demos) + service worker con push.
- **Notificaciones** (migración `0007`): campana funcional con panel, leídas
  por usuario, Realtime, push por dispositivo (VAPID), cron diario de
  vencimientos, emails Resend (pago recibido, por vencer, deuda) — no-op sin
  `RESEND_API_KEY`.
- **Roles** (migración `0008`): profesor sin pagos ni datos médicos
  (`student_private`), credenciales MP legibles solo por admin (recepción
  opera vía service role), chip "Solo consulta" visible en mobile.

### 🔜 Etapa 2 — Cobranza que se cobra sola *(casi completa)*
- [x] **Renovación automática de membresías** (26/08, migración `0010`): el
      cron renueva las vencidas con `auto_renew` (mismo plan, precio actual
      del plan), genera la cuota pendiente a 5 días con link de MP si está
      conectado, avisa al staff y le manda el email a la alumna con el botón
      de pagar. Interruptor por membresía en la ficha (si una alumna deja,
      se apaga y listo). Los planes de prueba nunca se renuevan solos.
- [x] Avisos automáticos por email (26/08): código listo con Resend —
      arrancan solos al cargar `RESEND_API_KEY` en Vercel.
- [ ] Débito automático mensual (Suscripciones MP). Se puede **desarrollar y
      probar ya** con las credenciales de prueba de MP; solo el primer cobro
      real necesita la cuenta de la clienta. *(Evaluar si hace falta: la
      renovación + link de pago en el email ya cubre gran parte.)*

### ✅ Portal del alumno — acceso autogestionado (26/08)
- [x] **Auto-registro**: "Creá tu acceso" en el login. Valida email + DNI
      contra la ficha del estudio vía `/api/portal/registro` (service role)
      — los signups públicos de Supabase siguen deshabilitados, nadie puede
      registrarse sin ficha previa, y la cuenta nace vinculada y con rol
      alumno. Verificado E2E con casos negativos (DNI/email erróneos,
      duplicado → 409).
- [x] **Recuperar contraseña**: "¿Olvidaste tu contraseña?" en el login →
      email con enlace (mailer de Supabase, con límite de frecuencia hasta
      configurar SMTP propio) → `/sistema/recuperar` para elegir la nueva.
- [x] **Cambiar contraseña** desde el portal (ícono de llave en el header).

### ✅ Configuración por secciones plegables (09/09)
La pantalla juntaba quince bloques en un scroll de 15.000 px: para tocar un
parámetro de caja había que pasar por todo lo demás. Ahora cada bloque es una
sección que se despliega y se contrae (`components/ui/seccion-plegable.tsx`),
con la lista cerrada en 1.600 px.
- [x] Rótulos de grupo fijos (El estudio, Reglas del negocio, Catálogos,
      Equipo y espacios, Accesos, Integraciones) y, debajo, las secciones
      cerradas con su título, su ayuda y un chevron.
- [x] Sin abrirla, cada sección adelanta lo que tiene: el conteo (3
      disciplinas, 7 parámetros) y, cuando importa, una advertencia —
      "Sin guardar" si quedó algo tipeado, "En sombra" en Permisos,
      "Conectado / Sin conectar" en Mercado Pago. El conteo se esconde en
      pantalla angosta; la advertencia nunca.
- [x] Lo que se deja abierto se recuerda en el navegador (localStorage) y
      "Desplegar / Contraer todo" para revisar de una. Contraer no descarta
      lo tipeado: la sección se esconde, no se desmonta.
- [x] El estado no vive en cada sección sino en el contexto, y los modales
      salieron del cuerpo plegable — si no, "Agregar" con la sección cerrada
      abría un modal invisible.

### ✅ Volver a la pestaña ya no recarga el estudio (09/09)
Síntoma: con el sistema abierto, ir a otra pestaña y volver dejaba la
pantalla en "Cargando datos del estudio..." unos segundos.

Causa: Supabase reemite `SIGNED_IN` con la **misma** sesión (idéntico
`access_token`) cuando la pestaña vuelve al frente. `setSession` guardaba ese
objeto nuevo, el efecto de carga dependía del objeto y volvía a pedir el
bundle entero — catorce consultas — mientras `dataLoading` tapaba todo con el
loader a pantalla completa. Medido con una sonda: mientras la pestaña está
oculta esos eventos llegan **cada dos segundos**, o sea que también se
recargaba el estudio en segundo plano todo el tiempo.
- [x] `onAuthStateChange` conserva el objeto anterior cuando el usuario y el
      token no cambiaron, y la carga se dispara por `session.user.id` y no por
      el objeto: renovar el token ya no recarga nada.
- [x] El loader tapa la pantalla solo cuando no hay datos. Un refresco con
      datos en pantalla se hace por debajo.
- [x] Al volver, si hace más de un minuto de la última carga, se refrescan
      los datos en segundo plano (el estudio siguió operando). Con una
      bandera para que varios `visibilitychange` seguidos no disparen dos o
      tres bundles en paralelo.
- [x] Un refresco que falla ya no borra la pantalla: avisa en una tira con
      "Reintentar" y se sigue trabajando con la última versión cargada.

### ✅ Reservas ordenada por día (09/09)
Era una tabla plana de todo el histórico ordenada por fecha descendente: lo
de hoy —lo único que se toca en el mostrador— aparecía mezclado con lo de
hace dos meses.
- [x] Cuatro bloques plegables (`SeccionPlegable`, el mismo componente de
      Configuración): **Hoy** y **Mañana** abiertos, **Más adelante** —solo si
      hay— e **Historial** cerrados. Hoy y mañana van por hora ascendente (el
      orden en que pasan las clases); el historial, de lo más reciente a lo
      más viejo.
- [x] El encabezado de Hoy muestra **cuántas quedan sin marcar**, que es la
      tarea pendiente del mostrador, y no un conteo total.
- [x] En los bloques de un solo día la columna es la **hora**: la fecha se
      repetía en cada fila sin decir nada.
- [x] Buscar por nombre o filtrar por fecha/estado muestra **una lista sola**
      en vez de los bloques: lo buscado suele estar en el historial, que
      viene cerrado, y los bloques lo escondían.
- [x] La columna de acciones quedó fija a la derecha. En una pantalla de 800
      px la tabla pedía 558 y tenía 495, así que los botones de asistencia
      —justo los de esta pantalla— quedaban fuera del scroll.
- [x] **Hoy y mañana van agrupados por clase**, no en tabla: cada clase con
      su hora, su profesora, cómo viene la asistencia y sus anotadas en orden
      alfabético (las canceladas al final). Sin tabla no hay scroll
      horizontal, así que las acciones se ven siempre.
- [x] Cada clase de hoy tiene su botón **Tomar asistencia**, que abre el
      mismo modal de `tomar-asistencia.tsx` que se usa desde Inicio y desde
      la agenda. Mañana no lo tiene —la clase no pasó— y ahí el chip dice
      "N anotadas" en vez de "N sin marcar", que es una tarea pendiente.
- [x] De paso, el modal decía "1 presentes".
- [x] Marcar asistencia/ausente ahora se rige por `reservas.asistencia` (en
      sombra: sin efecto todavía, `perm_diff()` en cero). Cancelar y confirmar
      desde lista de espera siguen siendo de quien escribe.

Dónde se confirma la asistencia, para que quede escrito: en **Reservas** fila
por fila (mostrador), y en el modal por clase de `tomar-asistencia.tsx`, que
se abre desde **Inicio → Clases de Hoy** y desde el panel de la clase en
**Agenda** (profesora en la sala, con el celular). Los tres escriben lo mismo.

### ✅ Las respuestas del estudio, cargadas y verificadas (09/09)
El estudio contestó el pedido de datos. Lo que era configuración entró en la
`0033`; lo que era desarrollo quedó anotado en §8 de
[`REQUERIMIENTOS-CASA-FE.md`](REQUERIMIENTOS-CASA-FE.md).
- [x] **"Casa Fe" sin tilde** en la base y en los siete respaldos del código,
      incluido `public/sw.js`, que se sirve estático y es la única marca que no
      puede leer `studio_settings`.
- [x] **Dirección, Instagram, email y horario** reales. Y el WhatsApp de la demo
      **vaciado**: no era un campo pendiente, era un campo que mandaba a la
      gente a un teléfono ajeno. Igual el link de Maps, que apuntaba a otra
      dirección. Donde no hay dato, la pantalla esconde el elemento — y en
      Planes, que es donde alguien ya decidió venir, repliega al mail.
- [x] **Solo Pilates Reformer**, una sola sala, y los seis planes FE habilitando
      solo esa disciplina. Va **antes** de cargar la grilla: el formulario toma
      como default la primera disciplina y la primera sala activas, así que al
      revés se cargan sesenta clases con la disciplina y la sala equivocadas, y
      como `room` es texto libre sin clave foránea, nada se queja nunca.
- [x] **50 minutos y 8 lugares** como parámetros (`class_default_minutes`,
      `class_default_capacity`), no como literales del código.
- [x] **"cliente", en masculino**, en las 32 pantallas, en los títulos de columna
      del Excel, en las etiquetas y ayudas de permisos, en las ayudas de
      Configuración y en dos funciones de aviso. El grupo de permisos va por su
      **tercer** nombre: `Alumnos` → `Clientas` → `Clientes`.
      Las referencias que la `0026` no se animó a tocar —`ficha-alumno.tsx:328`,
      `alumnos.editar`, `'alumno'`— sobrevivieron intactas: se protegen como
      tokens antes de tocar la prosa. `perm_diff()` sigue en cero.
- [x] **Derogada la ventana de pago del 1 al 9**, que el estudio dio de baja por
      escrito. Nunca llegó a regir: la `0024` ya la había marcado `rige = false`.
- [x] **Datos de prueba borrados** (`0027`) y **las tres profesoras cargadas**
      (`0034`), con los datos incompletos tal como vinieron y un nombre
      provisorio para la del turno tarde.
- [x] **Encendido el motor de consumo** de la `0029`, con las tablas vacías, que
      es el momento en que el re-anclaje no tiene nada que perder.

**El redondeo NO se tocó.** El estudio contestó "al próximo múltiplo de $1.000"
a una pregunta que le decía que hoy los precios dan justos y cuya opción más
gruesa era $100. Esa regla cambia 8 de los 12 precios que él mismo publicó y
deja falso su propio "Efectivo 5% OFF" (pasa a 4,44% en FE START).
`price_rounding` queda en `cincuenta` hasta que confirme la tabla nueva.

### ✅ La grilla cargada (09/09)
Llegó la semana como el estudio la dicta y entró en la `0035`: **64 clases**
—12 por día de lunes a viernes (Ivana de 8 a 13, turno tarde de 14 a 19) y 4 el
sábado con Leandro—, todas Pilates Reformer, 50 minutos, 8 lugares, Sala
Reformer.
- [x] Va por migración y no por pantalla: son 64 formularios, y sobre todo
      `class_sessions` **no tiene ningún índice único**, así que cargarla dos
      veces duplicaría la grilla entera sin que nada avise. Con ids derivados
      del día y la hora (`ca5afe01-…-<día><hora>…`) y `on conflict do nothing`,
      correrla de nuevo no hace nada.
- [x] La duración, el cupo y el color no se escriben en la migración: salen de
      los parámetros y del catálogo, que es de donde los toma la pantalla. Así
      recolorear la disciplina no deja 64 clases con el color viejo.
- [x] Cuatro guardias que se plantan con el motivo en vez de fallar con un
      error de clave foránea: las tres profesoras, la disciplina, la sala y los
      dos parámetros.
- [x] **La tabla de precios no necesitó nada.** Los doce valores dan exactos
      contra lo cargado (45.000 × 0,95 = 42.750; × 1,25 = 56.250, y así los
      seis planes). Confirma de paso que el redondeo al millar rompería su
      propia lista.

Verificado en la Agenda con la sesión real: "64 clases esta semana", el lunes
con 12 y cupo 0/8, el sábado con 4 de Leandro de 9 a 12.

**Lo que falta para operar: nada del sistema.** Dar de alta a los clientes
reales y cobrar. Lo que sigue es desarrollo (vigencia mensual, renovación,
turno fijo) y los datos que el estudio todavía no dio.

### ✅ La vigencia de un mes, y el pago anticipado que se encola (09/09)
La respuesta del estudio eligió la fecha individual —lo que el sistema ya hacía— pero
le sumó dos reglas que no eran gratis. Migraciones `0036` (corrida) y `0037`
(correcciones, escrita).
- [x] **Un mes de calendario, no 30 días.** `plans.duration_months` y la función
      `vigencia_hasta`, que es la autoridad. Los 30 días acertaban solo cuando el
      mes tiene 31: con el ejemplo del estudio daban un día de más, y desde un
      15/02, tres.
- [x] **El cálculo bajó a la base.** Un trigger `BEFORE INSERT` que pisa lo que
      manda el navegador. Antes se calculaba en dos lugares con la misma fórmula
      duplicada, que es lo que la `0029` vino a terminar con el consumo de clases.
- [x] **El pago anticipado se encola** detrás del período en curso en vez de
      solaparse. A lo sumo una **mensualidad** cubre una fecha; el pase de prueba
      se solapa a propósito desde la `0037`, y ahí el desempate es la que tiene
      saldo y después la que primero se pierde. Sin ese desempate, arreglar el
      encolado del pase movía el problema en vez de sacarlo: el motor elegía el
      pase agotado y rechazaba la reserva con "Ya usó la clase de su plan"
      mientras la mensualidad tenía ocho clases sin tocar.
- [x] **Estado `futura`** para la membresía pagada que todavía no empezó, y la
      ficha pasó a elegir "la que cubre hoy" en vez de "la más reciente" — si no,
      a quien paga adelantado se le mostraba la del mes que viene como si fuera la
      suya, y el portal la dejaba reservar.
- [x] **Solo se encolan las mensualidades** (`0037`). El pase de prueba arranca el
      día que se compra: encolarlo rompía el embudo más común del estudio —probar y
      contratar el mismo día— dejando la mensualidad para la semana siguiente.

Verificado creando un cliente de prueba y asignándole el plan dos veces: la primera
quedó 09/09 → 08/10 y la segunda 09/10 → 08/11, encolada y con estado `futura`. El
cliente y sus dos membresías se borraron después.

**Verificado con la 0037 y la 0038 aplicadas**, ejerciendo el camino completo con
la sesión real: el pase de prueba arranca hoy junto a la mensualidad y termina a
los siete días contando el de inicio (`09/09 → 15/09`, antes daba 16/09); una
reserva en el día correcto **entra** —y esa es la prueba del arreglo de
`consumir_clase`, porque fue la primera reserva real desde que el motor está
encendido y es la que ejercita el `old.status` en un INSERT—; una en el día
equivocado se rechaza con *"Esa clase se dicta los lunes, y el 15/09/2026 es
martes"*; y la clase se descuenta del pase y no de la mensualidad, que es el
desempate nuevo funcionando: las dos tenían saldo y gana la que primero se
pierde. El cliente de prueba y sus dos membresías se borraron después.

**Lo que quedó sin resolver, y es una decisión del estudio:** "Cambiar plan" y
"Renovar membresía" son el mismo botón, así que un cambio de plan también se encola
— la clienta paga el plan grande hoy y lo empieza a usar el mes que viene.
Resolverlo obliga a decidir qué pasa con lo que le queda del plan viejo. Hasta
entonces la pantalla avisa cuándo va a arrancar antes de cobrar.

### ✅ No se reserva una clase que ya empezó (09/09)
El portal ofrecía "Reservar" en las clases de hoy que ya habían terminado, porque
la comparación era por fecha y no por fecha y hora. **El bug no cambió ese día;
cambió lo que cuesta**: hasta la mañana del 09/09 era un botón inútil —sin grilla
cargada y con el motor de consumo apagado— y a la tarde, con las 64 clases y el
motor encendido, anotarse a la noche en la clase de las 8:00 le descuenta la clase.
- [x] El freno va en **su propio trigger** y no dentro de `consumir_clase`, que era
      el lugar obvio: esa función arranca con `if not consumo_rige() then return
      new`, así que el freno de mano de la `0029` apagaría también esta regla y
      dejaría el sistema en el estado que produjo el problema. Reservar una clase
      que ya pasó está mal descuente o no descuente.
- [x] Se llama `reservations_agenda` para que corra **primero**: Postgres dispara
      los BEFORE por orden alfabético, y así el mensaje dice "esa clase ya empezó"
      en vez de "la clase ya está completa".
- [x] **Recepción sí puede anotar después** —el que llega sin reserva y se la
      cargan cuando terminó es el flujo normal del mostrador—, y el corte es por
      permiso (`reservas.crear`), no por `override_reason`: ese texto **lo lee la
      clienta**, porque RLS filtra filas y no columnas y el portal hace `select('*')`
      sobre sus reservas. El rastro ya existe sin agregar nada: `source = 'staff'`
      con `created_at` doce horas después de su `date` dice lo que pasó.
- [x] **No dispara al marcar asistencia**, para que una profesora con
      `reservas.asistencia` pueda corregir un ausente después de la clase — que es,
      por definición, después de que la clase empezó.
- [x] El margen es configurable (`booking_cutoff_minutes`, cero por defecto), toma
      la hora real de la clase de ese día si se corrió (`class_occurrences`) y
      compara en el huso del estudio: sin el `at time zone` serían tres horas de
      diferencia, justo la clase de la mañana.
- [x] De paso, **la fecha de la reserva tiene que caer en el día de la semana de su
      clase**. Antes se podía anotar a alguien en la clase de los lunes para un
      martes, y esa reserva no aparecía en ninguna lista hasta que la clienta
      reclamaba la clase que pagó. Acá no hay excepción por permiso: no es una
      excepción autorizada, es un dato que no cierra.
- [x] En el portal, el reloj **se refresca cada 30 segundos**. Con la comparación
      por fecha no hacía falta; por hora sí, porque la pantalla queda abierta en el
      teléfono y la clase de las 8:00 seguía con su botón a las 8:30 para quien
      entró a las 7:50.

Se escribió en una sesión aparte, numerada `0036`, y se renumeró al traerla.

Cuatro lentes más la revisaron junto con la `0037` después de que esta última
fallara al correrse, y encontraron siete cosas. Las que importan:
- El trigger leía `old.status` en un `BEFORE INSERT OR UPDATE`, y en un INSERT
  OLD no existe: es un registro sin asignar y leerle un campo levanta `record
  "old" is not assigned yet`. Lo único que lo salvaba era que el AND
  cortocircuitara, y el manual dice que ese orden no está definido. **La misma
  falla estaba en `consumir_clase` de la `0029`, que ya está aplicada y
  encendida** — si muerde no falla una reserva, fallan todas. Las dos se
  reestructuraron con una bandera, que es lo que la `0022` ya había dejado
  escrito para `stamp_reservation` con este mismo motivo.
- `inicio_de_clase` es `security definer` y no llevaba el `revoke ... from
  public, anon` que el resto del proyecto le pone a toda función definer. Lee
  `class_occurrences`, cuya RLS pide sesión, así que desde la landing sin login
  se podía pedir por RPC el horario corrido de una clase.
- En el camino de UPDATE validaba `new.class_id` y `new.date` —los que manda
  quien reactiva— en vez de los de la fila que va a quedar.
- El chequeo del día de la semana no tenía salida y aplicaba también a fechas
  pasadas: el día que el estudio mueva una clase de lunes a martes, cargar una
  reserva vieja se volvía imposible. Ahora rige solo de hoy en adelante.
- El escape por permiso miraba solo `reservas.crear`, pero el camino de UPDATE
  lo ejercen acciones de `reservas.editar` y `reservas.asistencia`: con el grupo
  en activo, una profesora con asistencia y sin crear quedaba trabada.

### ⏸️ Etapa 4 — Mostrador *(cuando el estudio opere con el sistema)*
- [ ] Inventario y venta de productos (POS) con stock.
- [ ] Metas de venta con tablero.
- [ ] Tiquetera (requiere impresora térmica comprada).

### ⏸️ Etapa 5 — Dependen de terceros *(lanzar trámites ya, integrar después)*
- [ ] Gympass (Wellhub) / Totalpass — falta que el estudio firme convenio.
- [ ] Factura electrónica ARCA — falta decisión de la clienta.
- [ ] WhatsApp Business API — cuando el volumen justifique el costo.

## Bloqueado por la clienta (checklist)

- [ ] Cuenta de Mercado Pago del negocio conectada en Configuración.
- [ ] Datos reales: planes y precios, grilla de horarios, profesores, salas,
      dirección, Instagram, fotos propias.
- [ ] Decisión sobre factura electrónica (¿desde el sistema o aparte?).
- [ ] Dominio propio elegido (conectar en Vercel).
- [ ] Cambiar la contraseña admin de prueba y pasar la lista del equipo real.

## Pendiente inmediato

- **Supabase → Authentication → URL Configuration → Redirect URLs**:
  agregar `https://<dominio-de-vercel>/sistema/recuperar` y
  `http://localhost:3000/sistema/recuperar` (sin esto, el enlace de
  "olvidé mi contraseña" cae en la home en vez de la pantalla de reset).
- Vercel → Environment Variables: **todas cargadas** ✅ (verificado
  05/09/2026): `RESEND_API_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` y `CRON_SECRET`.
- Resend en sandbox: sin dominio verificado solo entrega a
  `digitalamenitiessas@gmail.com`. Al tener el dominio del estudio:
  Resend → Domains → verificar DNS → `EMAIL_FROM` en Vercel, y los emails
  a las alumnas fluyen solos. (Opcional en ese momento: usar Resend
  también como SMTP de Supabase para los emails de reset, sin límite de
  frecuencia y con la marca del estudio.)

## Estado técnico

| Ítem | Estado |
|---|---|
| Migraciones aplicadas | `0001` a `0038` ✅ (verificadas 09/09 con las consultas de abajo y contra la aplicación andando). **Anotarlo acá cada vez**: entre el 26/08 y el 09/09 el registro quedó en `0009` con 24 migraciones corridas, y eso dejó a ciegas todo un relevamiento |
| Motor de consumo (`0029`) | ✅ **Encendido el 09/09**. `consumo_rige()` da `true`, `cancel_hours = 3`, `consumo_control()` cero descuadres. La base valida la membresía al reservar y descuenta la clase; el navegador ya no descuenta (se desplegó antes, así que no hubo cobro doble). Freno de mano: `update studio_settings set rige = false where key = 'class_consumption'` |
| Datos de prueba | ✅ **Borrados el 09/09** con la `0027`. Queda a mano en el dashboard: borrar `camila.portal@pilatestudio.com` de Authentication → Users, y decidir si `admin@pilatestudio.com` se queda con ese mail (**no borrarlo sin crear otro admin antes**) |
| Deploy | Vercel, auto-deploy desde `main` ✅ · npm (adiós pnpm) · cron diario en `vercel.json` |
| `SUPABASE_SERVICE_ROLE_KEY` | En `.env.local` ✅ · verificar en Vercel |
| VAPID / push | Claves generadas en `.env.local` · cargar en Vercel |
| Resend | ✅ Activo en sandbox (26/08, email real entregado) · key en `.env.local`, cargar en Vercel · dominio del estudio pendiente para emails a alumnas |
| Webhook MP | Programado; registrar URL en MP al conectar la cuenta real |
| Usuarios de prueba | `admin@pilatestudio.com` (cambiar clave) · `camila.portal@…` (demo) |
| Roles | admin y recepción escriben; profesor consulta sin pagos ni datos médicos; alumno → portal (UI + RLS) ✅ |
| Acceso enviado a la clienta | 24/08/2026, cuenta admin + demo del portal |

### Qué migraciones corrieron

Las migraciones se pegan a mano en el SQL Editor, así que el único registro es
este documento. Cuando queda atrasado, cada migración nueva es una apuesta sobre
si su `update` encuentra la fila. Estas dos consultas lo contestan sin tocar nada:

```sql
-- Qué existe en el esquema
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='consumo_rige')      as fn_consumo_rige_0029,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='reactivar_reserva') as fn_reactivar_0031,
  (select count(*) from information_schema.columns where table_name='studio_settings' and column_name='rige')        as col_rige_0024,
  (select count(*) from information_schema.columns where table_name='payment_methods' and column_name='ajuste_pct')  as col_ajuste_0028,
  (select count(*) from information_schema.columns where table_name='plans' and column_name='weekly_frequency')      as col_weekly_0025,
  (select count(*) from information_schema.columns where table_name='reservations' and column_name='membership_id')  as col_membership_id_0022,
  (select count(*) from information_schema.columns where table_name='plans' and column_name='duration_months')        as col_duration_months_0036,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='vigencia_hasta')  as fn_vigencia_hasta_0036,
  (select count(*) from pg_trigger where tgname='memberships_fechas' and not tgisinternal)                            as trg_membresia_fechas_0036,
  (select count(*) from information_schema.columns where table_name='public_plans' and column_name='duration_months') as vista_publica_0037,
  (select count(*) from pg_trigger where tgname='reservations_agenda' and not tgisinternal)                            as trg_reserva_en_hora_0038,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='inicio_de_clase') as fn_inicio_de_clase_0038;
```

```sql
-- Qué dicen los datos
select 'estudio' as bloque, key as dato, coalesce(nullif(value,''),'(vacío)') as valor from public.studio_settings where group_key = 'estudio'
union all select 'params', key, value || case when rige then '  [rige]' else '  [NO rige]' end from public.studio_settings where group_key <> 'estudio'
union all select 'disciplina', name, case when active then 'activa' else 'apagada' end from public.disciplines
union all select 'plan', name, case when active then 'activo' else 'apagado' end || ' · ' || duration_days || 'd · ' || class_count || ' clases · ' || array_to_string(disciplines, ' + ') from public.plans
union all select 'sala', name, case when active then 'activa' else 'apagada' end from public.rooms
union all select 'permisos', 'grupo ' || grupo, count(*)::text || ' claves' from public.permission_keys group by grupo
order by 1, 2;
```
