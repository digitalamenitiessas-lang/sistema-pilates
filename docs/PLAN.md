# Plan de avance — PilatesStudio

> Documento vivo. Se actualiza con cada bloque de trabajo.
> Última actualización: **22/09/2026** (la `0073` corrida y verificada; antes, la
> devolución de la clienta sobre el diseño, resuelta salvo lo que espera
> archivos de ella).
> Para entregarle al estudio:
> [`Casa-Fe-manual-del-mostrador.pdf`](Casa-Fe-manual-del-mostrador.pdf) — el
> manual **por tarea**, que es el que sirve para usar el sistema: las 12 cosas
> de todos los días en pocos pasos, los avisos que manda solo, y qué hacer
> cuando la base rechaza algo. El script que lo genera es
> [`manual-del-mostrador.py`](manual-del-mostrador.py): el PDF se regenera
> corriéndolo, así que se edita el script y no el PDF.
>
> [`Casa-Fe-como-se-usa.pdf`](Casa-Fe-como-se-usa.pdf) — el pantalla por
> pantalla **sin la sección de pendientes**, para que el PDF diga cómo se usa y
> nada más. La versión completa, con lo que falta, es
> [`casa-fe-pantalla-por-pantalla.html`](casa-fe-pantalla-por-pantalla.html), que
> además está publicada como página con link propio.
>
> Y lo que falta va por mensaje, aparte:
> [`casa-fe-lo-que-falta-preguntar.md`](casa-fe-lo-que-falta-preguntar.md) — las
> siete definiciones y los cinco datos, ordenados por lo que cuesta plata
> primero, para que los contesten mientras usan el sistema.

> Guía de testeo por rol (para Matías, no para la clienta):
> [`Casa-Fe-guia-de-testeo.pdf`](Casa-Fe-guia-de-testeo.pdf) — qué hacer en cada
> rol y qué tiene que pasar, más los ocho casos donde la base rechaza a
> propósito. Se acompaña con la migración `0039`, que carga diez clientes de
> prueba y trae su propia vuelta atrás.

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

Sistema desplegado en Vercel, **con los datos reales de Casa Fe cargados** y
entregado al estudio el 10/09/2026 para que lo use. Núcleo completo (gestión +
cobros + caja + gastos + reportes + landing + portal de la clienta), usable
desde el celular, instalable como app y con notificaciones reales al mostrador
y a la clienta.

Del documento de requerimientos queda por construir **dos cosas**: Personal y
remuneraciones (sección 12) y los días y horarios fijos (Agregado 2). El estado
por sección está en
[`REQUERIMIENTOS-CASA-FE.md`](REQUERIMIENTOS-CASA-FE.md) §3.1; lo que sigue
esperando una definición del estudio, en
[`casa-fe-lo-que-falta-preguntar.md`](casa-fe-lo-que-falta-preguntar.md).

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

### ✅ El plan dice qué disciplina, y ahora rige (09/09) — `0040` **corrida**
*(El encabezado decía "sin correr" hasta el 12/09 y era falso: se verificó contra
la base —existe `payments.renueva_membresia_id`, que agrega la `0041`, o sea que
todo lo anterior corrió—. Importa porque con ese dato viejo se le dijo dos veces
a Matías que la disciplina del plan no rige, y sí rige.)*
De la respuesta 6c casi todo ya funcionaba sin construir nada: día, hora, cupo y
profesora son columnas de cada clase, y "grilla separada" se resuelve cargando
las clases. Lo único que faltaba era **el impedimento**: la `0033` dejó los seis
planes FE habilitando solo Reformer, pero nada lo validaba al reservar — ni el
trigger de consumo, ni el de cupo, ni las políticas. El formulario rotulaba
"Disciplinas habilitadas *", no dejaba guardar sin elegir una, y detrás no había
nada.
- [x] El chequeo va en `reserva_en_hora` (el trigger de la `0038`) y **no** en
      `consumir_clase`, que era el lugar obvio porque ahí ya se resuelve la
      membresía: esa función arranca con el interruptor de pánico de la `0029`, y
      qué disciplina puede tomar un cliente no tiene nada que ver con si el
      descuento de clases está funcionando.
- [x] Sin membresía no dice nada: de eso se ocupa `consumir_clase`. Duplicar el
      mensaje sería contestar dos veces la misma pregunta con palabras distintas.
- [x] Sin salida por permiso, y queda escrito para poder revisarlo: el estudio lo
      dijo en términos categóricos y las clases de embarazadas tienen cupo y
      profesora propios, así que meter a alguien de Reformer no es una excepción
      del mostrador. Si hiciera falta, la salida es darle el plan que
      corresponde.

**Hoy no cambia ni una reserva** —hay una sola disciplina activa y todos los
planes la habilitan—, y muerde el día que se cargue la grilla de embarazadas,
que es justo el día en que nadie va a estar mirando esto.

**Lo que queda pendiente y está anotado en la migración:** la pantalla todavía
ofrece lo que la base va a rechazar. El portal muestra todas las clases del día
sin mirar el plan del cliente. Con una disciplina es invisible; con dos hay que
filtrar. El orden correcto es este: primero el freno, después el filtro.

### ✅ La renovación se cobra primero (09/09) — `0041` **corrida** (verificado el 12/09: la columna `renueva_membresia_id` existe)
Hasta acá el proceso diario, al vencer una membresía, **insertaba la nueva** y
recién después generaba la cuota: quien no pagaba seguía vigente y —con el motor
de la `0029` encendido— gastando clases de un mes que no compró. Lo contrario de
lo que pidió el estudio.

Se invierte el orden: la renovación emite **la cuota**, y **la membresía la crea
el pago**, desde un trigger sobre `payments`. Sale bien por algo que ya estaba
construido: `memberships_fechas` (`0036`/`0037`) encola detrás del período en
curso si el pago entra antes del vencimiento, y arranca el día del pago si entra
después. **Las dos reglas del estudio, sin calcular una sola fecha acá.**

El diseño salió de un panel: tres propuestas independientes desde ángulos
incompatibles y tres jueces con criterios distintos —el mostrador, el
mantenimiento, y el daño del peor caso—. Ganó la más chica (24 puntos contra 20 y
17), y se le sumó de las otras dos lo que le faltaba.

**Lo que el panel encontró y ninguna de las tres propuestas había visto: la cuota
fantasma.** Emitir la cuota antes del vencimiento parece inofensivo. No lo es: una
cuota pendiente que nadie paga se muestra vencida, dispara el mail "Tenés un pago
pendiente" con link de Mercado Pago por un mes, arma una alerta en el tablero y
suma al total por cobrar. O sea que el bloque que viene a matar dos mails
contradictorios **creaba un par nuevo** — "tu membresía venció" y "tenés un pago
pendiente", el mismo día, sobre la misma plata. Y desde el día de la oferta, toda
clienta al día figuraba "Pendiente".
- [x] Por eso `payments.renueva_membresia_id` no es plumbing: **distingue "debe"
      de "le ofrecimos"**. Una oferta no se cuenta como deuda, no dispara
      cobranza, y **caduca sola** cuando pasa su fecha límite.
- [x] También caduca la oferta de una membresía que ya tiene período posterior.
      Sin eso, pagar una oferta vieja **acuñaba una tercera membresía** con el
      plan viejo, encolada detrás de todo — el peor daño que tenía el diseño.
- [x] **Cobrar no puede fallar, pero tampoco fallar callado.** Si la creación de
      la membresía se cae, el pago se registra igual y aparece un aviso en la
      campana: "No se pudo crear el período pagado", con el motivo.
- [x] **Recordatorios plurales con catch-up.** `expiry_reminder_days` = "5,2,0",
      con el escalón en el `dedupe_key`. Si el cron no corre un día, al siguiente
      emite el escalón pendiente de menor anticipación: la regla deja de depender
      de que corra un día exacto. Reusa `membresia_por_vencer`, sin tipos nuevos.
- [x] `renovacion_control()` tiene que dar cero filas, como `perm_diff()`,
      `caja_control()` y `consumo_control()`. Una fila es plata cobrada sin
      entregar el mes.

**Y algo que hay que saber antes de desplegar:** mientras la `0041` no esté
aplicada, el bloque de renovación **se saltea entero y nadie se renueva**. Es
deliberado —emitir la cuota sin poder marcarla como oferta es exactamente el daño
de arriba— pero no puede pasar en silencio, así que el proceso diario avisa al
mostrador una vez por día mientras dure.

### ✅ La campana en el portal, y el push a la clienta (10/09)
Con la renovación nueva **el mecanismo es avisarle**: tres recordatorios y el
link de pago. Pero al revisar por dónde le llegaban, eran **solo mails** — y los
tres canales estaban cortados a la vez: a la clienta no le llegaba push (existía
`pushToUser` y no la llamaba nadie), el portal no tenía campana, y los mails no
salen en producción porque Resend está en sandbox y `sendEmail` devuelve `false`
en silencio. O sea: el recordatorio de renovar no le llegaba por ningún canal, y
el sistema no se rompía ni avisaba.
- [x] El proceso diario emite ahora los avisos con `audience: 'alumno'` para los
      tres momentos —la cuota emitida, cada recordatorio y el vencimiento— y le
      manda push a sus dispositivos. Un helper, no cuatro copias del mismo
      código.
- [x] **El push sale solo por los avisos que el upsert devolvió como nuevos**,
      igual que los mails: si no, el cron corriendo dos veces le vibra el
      teléfono dos veces por la misma noticia.
- [x] En el recordatorio, la campana y el push van **antes** del corte por
      email, que es el motivo de todo esto: quien no tiene mail cargado se
      enteraba de nada. En el aviso de vencimiento van después, con la misma
      condición que el mail, porque sin la `0041` aplicada ese aviso es falso y
      decir por tres canales algo que no pasó es peor que no decirlo.
- [x] **La campana del portal es el mismo componente del mostrador**, montado
      sin `onNavigate` porque sus destinos son pantallas que el portal no tiene.
      Y trae adentro el interruptor de avisos en el celular, que es la razón por
      la que se monta esto y no una lista aparte.
- [x] El aislamiento no lo hace el componente ni un filtro en la consulta:
      `fetchNotifications` no filtra por audiencia y **lo decide la política de
      la `0007`**, que ya existía y ya era correcta.
- [x] `pushClientas` va separado de `pushSent` en el resumen del proceso diario:
      si queda en cero corrida tras corrida mientras los avisos crecen, es que
      nadie tiene el push activado o faltan las claves VAPID.

**Sin verificar todavía, y hace falta la sesión de una clienta:** ver la campana
en el portal y que el push llegue de verdad. Lo verificado es que compila, que la
campana tolera no tener navegación, que su texto no es del mostrador y que los
dos tipos de aviso que usa ya están en el CHECK de la `0023`.

### ✅ La identidad de Casa Fé, aplicada (11/09)
Llegó el material de marca: el manual de diseño (`MOVIMIENTO. PAUSA. BALANCE`),
las dos tipografías, los tres colores y las fotos del estudio. Hasta ahora la
paleta era una interpretación nuestra —terracota, arena, salvia— con DM Sans y
Playfair, y las fotos eran de banco de imágenes.
- [x] **Las imágenes salieron del PDF a resolución nativa** y quedaron en
      `public/marca/`: el hero, el tríptico del estudio, las dos disciplinas, la
      acuarela del pie y la textura de óxido. Recortadas como en el manual
      —el hero es el mismo encuadre, calculado desde la geometría del PDF—,
      redimensionadas y comprimidas: de 14 MB a 1,5 MB. `next.config` tiene
      `images.unoptimized = true`, así que el peso que sale de acá es el que
      baja la clienta; por eso el hero tiene además una versión de celular que
      sirve un `<picture>`.
- [x] **Bodoni Moda en lugar de Bauer Bodoni.** La del manual es comercial y no
      se puede servir como webfont sin licencia. Bodoni Moda (Google Fonts, OFL)
      es un revival del mismo Bodoni, y con el eje `opsz` en 96 da la misma
      hairline fina de los titulares. Montserrat es la del manual tal cual.
      Como `--font-serif` apunta a la nueva, las cinco pantallas que ya usaban
      `font-serif` cambiaron de tipografía sin tocar una línea.
- [x] **Los tres colores como tokens en oklch**, y todo lo demás derivado de
      ahí. Medido sobre el manual: la Montserrat en mayúsculas va con 0.12em de
      tracking y la Bodoni con interlínea 0.88.
- [x] **Los estados dejaron de ser ámbar, celeste y rojo de Tailwind**, que al
      lado del natural se veían de otra marca. Ahora son cuatro familias de tres
      tonos —`aviso`, `info`, `exito`, `destructive`— con una regla: **el tono
      pleno pinta, el `-fuerte` escribe**. Migradas 17 pantallas; el grep de
      colores crudos de Tailwind da cero.
- [x] El mismo corte para el marrón de la marca: como texto chico sobre fondo
      claro da 3,49:1 y no pasa AA, así que se agregó `--primary-fuerte` para
      texto y el pleno quedó para rellenos y titulares.
- [x] **Auditoría de contraste real, en el navegador**, resolviendo cada color
      con canvas —`getComputedStyle` devuelve `lab()` y `oklch()`, no rgb— sobre
      las diez pantallas del mostrador: de 145 supuestos fallos (el auditor
      estaba mal) a **cero reales**. Los que aparecieron eran de verdad:
      `text-destructive-foreground` no existía como token y el "9+" de la
      campana era invisible; y el color del catálogo de disciplinas se estaba
      usando como color de texto, que a 10px daba 2,2:1 según qué tono hubiera
      elegido el estudio. Ahora el color del catálogo pinta el punto y el fondo,
      y la letra va en negro.
- [x] **La landing rehecha sobre el mockup**, sección por sección: el logotipo
      sobre la foto con la textura encima, la bajada de la clienta palabra por
      palabra, el tríptico, la retícula de planes en verde claro con filete, el
      bloque OPEN STUDIO, las disciplinas con su foto y la acuarela del cierre.
      **Todo el cableado de datos quedó igual**: los planes, la grilla, las
      disciplinas y los datos del estudio siguen saliendo de las vistas
      públicas, y lo que el estudio no cargó sigue sin dibujarse.
- [x] **Los íconos de la app salen del logotipo real**, no de una tipografía
      parecida: se renderizó la región del PDF con las fotos tapadas y se
      recortó al tinte. `CASA / FE` para los íconos grandes y `FE` solo para el
      favicon, donde el lockup entero no se lee. Antes eran los del andamio de
      Vercel. Se borraron once archivos muertos de `public/` (las tres fotos de
      banco y los placeholders).
- [x] Los mails también: el hexadecimal va escrito a mano porque en un mail no
      hay variables CSS, pero son los valores de la marca.
- [x] **El logotipo reemplazó a la inicial en cuadrito** (11/09) en la sidebar,
      el login, la recuperación de contraseña y el encabezado del portal. Se
      dibuja con la tipografía a partir del nombre que el estudio cargó en
      Configuración, no como imagen fija: escala sin pixelarse, hereda el color
      del contexto y un estudio con otro nombre no ve el logo de Casa Fé. En un
      cuadro chico —sidebar plegada, avatar del portal— usa la última palabra
      del nombre, que es la mitad distintiva: "FE". La imagen solo existe donde
      el sistema operativo exige un archivo: favicon e íconos de la PWA.
- [x] El favicon pasó de "FE" al logotipo completo. A 48 px se lee perfecto; a
      **16 px, que es la pestaña del navegador, las dos líneas de Bodoni son
      una mancha**. Es lo que la clienta pidió ver, y queda anotado: si quiere
      que se lea en la pestaña, hay que volver a "FE" o a una sola letra.

**Decisiones que conviene que la clienta confirme:** el reemplazo de Bauer
Bodoni por Bodoni Moda (o que mande la licencia webfont si la tiene); el
monograma del ícono; y que el manual escribe "DICIPLINAS" en la barra —en la
web dice "Disciplinas". El manual también tiene **FAQ** en la barra y no hay
sección: hace falta que ella mande las preguntas, no se inventan.

### ✅ La devolución de la clienta sobre el diseño (11-12/09) — `0044` corrida y verificada
*(De paso apareció que la `0043` **también había corrido** y el registro decía que
no. Es la segunda vez que esa tabla queda atrás de la realidad, y las dos veces se
notó consultando la base en vez de leer el documento. Vale como método: antes de
escribir "sin correr", preguntarle a la base.)*
Once puntos sobre la landing recién aplicada. **Los once resueltos** — los
cuatro textos que faltaban llegaron el 12/09. Cuatro de los diez no se tocaron en el código sino en la
base, que es donde tenían que estar: la dirección, el horario y las dos
descripciones de disciplina son datos que el estudio edita.
- [x] **Las tres fotos del tríptico, verticales.** Estaban en `h-[30rem]`, que
      en una pantalla de 1440 daba una celda de 480×480: cuadrada, justo lo que
      pidió cambiar. Ahora el alto sale del ancho (`aspect-3/4`), así que el
      recorte se mantiene vertical en cualquier pantalla. Las fotos son
      1200×1800, o sea que la relación sale del original sin estirar nada.
- [x] **El serif, más legible.** Marcó que los trazos finos desaparecen. El
      `opsz` estaba clavado en 96 —el corte de titular del Bodoni— para *todo*
      lo serif, así que el `CASA FE` de 176 px y el nombre de un plan de 24 se
      escribían con el mismo pelo. Ahora va `font-optical-sizing: auto` y el
      navegador mueve el eje según el tamaño real; el hero conserva el 96 a
      mano. **Es la misma fuente**: si ella manda su Bodoni con licencia
      webfont, se cambia la familia y este ajuste sigue valiendo.
- [x] **La clase de prueba, en el marrón de la marca** y no en negro. El texto
      chico de adentro pasó a blanco pleno: atenuado sobre el marrón no llega a
      4,5:1.
- [x] **Open Studio, con aire.** El horario en dos bloques —el día arriba, la
      hora abajo— y la dirección en tres renglones, empezando por "Mercato
      Shopping Viejo", que es la referencia que la gente de Yerba Buena conoce.
      Los saltos de línea **viven en el dato, no en el diseño**: el estudio los
      edita desde Configuración. Por eso la dirección pasó de `text` a
      `textarea` (con un input no se puede escribir un salto) y el campo de
      Configuración pasó de 2 a 4 renglones.
- [x] **Pilates Embarazadas encendida.** La `0033` la había apagado con el
      motivo escrito —"todavía no tienen grilla ni profesora"— y avisó que
      arranca con horario propio. Queda segunda, al lado de Reformer, con la
      foto que mandó y las tres líneas de su referencia, textuales. **El nombre
      no se tocó**: lo llamó "Pilates para embarazadas" en el mensaje y "Pilates
      Prenatal" en la referencia, y el nombre viaja como texto a clases, planes
      y profesoras — renombrar es una cascada que elige ella desde
      Configuración, no nosotros en una migración.
- [x] **Google Maps en el pie.** Sin link propio cargado, la web arma la
      búsqueda con el nombre y la dirección, que es lo que haría a mano
      cualquiera. El día que el estudio pegue el link de su ficha, ese manda.
      También quedó en Open Studio, que es donde ya estaba previsto.
- [x] **El barquito de la acuarela, entero.** Está al 70% del alto de una
      imagen de 1600×800 y el recorte centrado se lo comía en pantalla ancha.
      Con el foco en `50% 72%` se ve completo de 375 a 2560 px, medido contra
      la caja real y no a ojo.
- [x] **El pie, en natural y no en negro.** El diseño es el mismo; lo que
      cambia es de qué lado está el contraste, y por eso las opacidades
      subieron: sobre el natural el negro recién pasa AA desde el 60%, y sobre
      el negro el blanco pasaba al 45%.
- [x] **El logo, el de ella.** Mandó el archivo y se aplicó: el logotipo deja
      de dibujarse con Bodoni Moda y pasa a ser el PNG que hizo su diseñadora,
      que es **Bauer Bodoni** — puestas una al lado de la otra se nota que no
      son la misma letra. Va en el hero, en la barra, en la sidebar, en el
      login, en la recuperación de contraseña y en el portal.
      **No se usa como imagen sino como máscara**: el PNG viene en un solo
      color plano sobre transparente, así que el archivo aporta la forma y el
      color lo pone el contexto. Con eso un solo archivo sirve para el negro
      sobre el natural y para el natural sobre la foto del hero; usado como
      `<img>` habría quedado invisible en media pantalla.
      Se mide en `em`, así que ninguna pantalla cambió: el `text-4xl` del
      login y el `text-xl` de la sidebar siguen decidiendo el tamaño y la
      imagen entra justo donde entraba el texto. Y **alcanza de sobra**: el
      lugar más grande es el hero, donde "CASA" mide 468 px y no crece porque
      el tamaño está fijo en `lg`, contra los 908 px que trae el archivo.
      Queda pedido, sin apuro, el SVG en curvas, para el día que lo quieran
      más grande que eso.
      El logo sigue siendo **de Casa Fe y de nadie más**: si el estudio se
      llama de otra manera —el sistema está hecho para eso— se vuelve a
      dibujar el nombre con la tipografía de la marca.
- [x] **Los cuatro textos, puestos** (12/09). Llegaron y se reemplazaron:
      la bajada de "Bienestar & Movimiento", la descripción de Planes, la
      frase sobre la foto y el título y la bajada de Contacto —que pasó de
      "Vení a conocernos" a "Empezá por una clase"—. Tres decisiones que se
      tomaron al escribirlos y conviene que la clienta vea:
      · **Se fue la firma "Joseph Pilates"** de debajo de la frase sobre la
        foto. Era de la cita anterior; su frase nueva es de ella, y dejar la
        firma habría sido atribuirle a él algo que no dijo. Las comillas
        también: sin autor no es una cita.
      · **El "8 alumnas por clase" no está escrito a mano**, sale de la
        grilla publicada (se verificó: las 64 clases tienen cupo 8). Si el
        estudio abre clases de otro cupo, la web deja de afirmarlo en vez de
        mentir. Mismo criterio que el bloque de números de esa sección.
      · Dos arreglos de puntuación sobre el mensaje de ella, por si los
        quiere de vuelta: "Definí" con mayúscula en Planes, y el título de
        Contacto sin el punto final —ningún otro titular lo lleva, y en la
        Bodoni en mayúsculas de 60 px un punto suelto se lee como un error.

**Queda anotado para preguntarle:** la bajada de embarazadas dice "Movimientos
consciente", en singular, y pidió usarla "exactamente". Se cargó tal cual. Si
era un tipeo, se corrige desde Configuración sin migración.

**Y queda anotado para no repetirlo:** con el logo llegaron las fotos del
estudio a 2121x3000, contra las de 1200 que tenemos, y la tentación era
reemplazarlas todas. Se midió antes: bajar esos archivos a 1200 y volver a
subirlos a 2121 los devuelve casi idénticos (RMSE 1,2 a 1,6 sobre 255), o sea
que **arriba de 1200 no hay detalle real, hay tamaño**. Son fotos de foco corto
y luz suave, blandas de origen. Reemplazarlas habría sumado medio mega para que
nada se vea mejor. La única que sí se cambió es la del embarazo, y no por
tamaño sino por origen: la que teníamos venía de un JPEG de WhatsApp ya
recomprimido y esta sale del PNG limpio — **de 143 KB a 94 KB, con un poco más
de ancho (1000 px) y la misma nitidez**.

La foto que mandó con el logotipo ya compuesto encima tampoco se usa. Un texto
quemado en una imagen no se reacomoda, no escala entre tamaños de pantalla y no
lo lee un lector de pantalla; el logotipo real dibujado sobre la foto da lo
mismo a la vista y se comporta bien en las tres cosas.

### ✅ El WhatsApp del estudio (11/09) — `0045` corrida y verificada
Llegó el número y con eso la landing cambia de canal. **No es código**: el
enlace con el mensaje ya escrito existe desde la `0011`, lo que faltaba era el
dato, que la `0033` había vaciado a propósito porque tenía el de la demo.
- [x] Lo que destrabó, que era más de lo que parecía: el botón del hero
      **"Reservá tu clase de prueba" no se dibujaba** —sin número no hay a
      dónde mandar a nadie—, y "Reservar mi lugar", los cinco "Consultar" de
      los planes y el cierre abrían el cliente de correo. Ahora los ocho van a
      WhatsApp, y el pie suma su enlace.
- [x] **Los mensajes se reescribieron para que se lean en un chat.** Estaban
      pensados como asunto de un mail —"Quiero reservar mi clase de prueba",
      sin saludo— porque el mismo texto servía para los dos canales y ganaba
      la forma del mail, que es el canal que casi nadie usa. Ahora
      `useContacto` recibe dos: el mensaje para WhatsApp y el asunto para el
      correo.
- [x] El formato es el de `wa.me` y no el de la agenda: `54` + `9` + `381` +
      abonado. **Sin el 9 el link abre un chat que no existe y no da error**,
      que es el modo de falla que la `0033` vino a cerrar. El `help` del campo
      lo explica, porque el estudio va a cambiar el número alguna vez.
- [x] **El link se abrió a mano y el chat es el del estudio** (Matías,
      11/09). No es un detalle que se pueda saltear: una consulta SQL no
      distingue un número bien escrito de uno con un dígito de más, porque los
      dos abren. Es la única verificación de esta migración que no se puede
      hacer desde la base.

### ✅ El recupero y la excepción autorizada (15/09) — `0046` **corrida y verificada**

Primera entrega sobre la devolución del estudio del 15/09
(`SISTEMA INTERNO.pdf`, §1 Agenda). De los seis puntos de esa sección, **cuatro
ya andaban** y no se tocó nada: el plazo de 3 horas (`cancel_hours`, que la
`0029` compara para clasificar cada cancelación), perder la clase al cancelar
tarde, registrar el tipo de cancelación, y el no show — que se cumple por un
camino distinto al que ella imagina: la clase se descuenta **al reservar**, así
que la que no viene y no avisa ya la perdió, sin que nadie tenga que marcarla.

Lo que faltaba eran dos columnas que la `0022` dejó preparadas y **nadie escribió
nunca**: `recovers_reservation_id` y `override_by` / `override_reason`.

- [x] **El tope de recuperos es un parámetro**, no un número en el código:
      `recovery_max = 2`, grupo Reservas, entre la regla de la ausencia y los
      valores por defecto de la clase. El día que sean 3 es un campo.
- [x] **Un recupero no vuelve a descontar.** `consumo_contadas` lo excluye: la
      clase ya se descontó cuando se perdió, y contarla otra vez sería el doble
      cobro que la `0029` se propuso hacer imposible. Verificado con datos
      reales: Lourdes fue a tres clases y le contaron dos.
- [x] **Una clase perdida se repone una sola vez.** El índice de la `0022` sobre
      esa columna **no era único**, así que dos reservas podían apuntar a la
      misma clase perdida. Ahora lo es.
- [x] **Qué se puede recuperar no es configurable, a propósito:** lo que perdió
      por cancelar tarde o faltar sin avisar. Cancelar en plazo ya le devuelve la
      clase al contador, así que permitir recuperar eso sería regalarle una. El
      tope es una preferencia del estudio; esto es una invariante del motor.
- [x] **El recupero cae dentro del período que pagó esa clase.** Las clases no se
      acumulan de un mes al otro (respuesta del estudio del 09/09), así que
      reponerla en el período siguiente sería revivir una vencida.
- [x] **La excepción autorizada no consume.** Con la clave nueva
      `reservas.excepcion` y el motivo escrito, entra aunque la membresía esté
      vencida o sin clases, y **no se sella contra ninguna membresía**. Si
      consumiera con el plan agotado, la ficha mostraría clases restantes en
      negativo; así el contador sigue diciendo "usó 4 de 4" y al lado queda la
      clase de más con quién la autorizó. `override_by` lo pone la base con
      `auth.uid()`, nunca lo que mande el cliente.
- [x] **El update pinea las tres columnas nuevas.** La política "alumno cancela"
      (`0005:75-78`) deja a la clienta escribir sus propias filas sin restringir
      columnas: sin esto, desde el portal podía mandarse un recupero o una
      excepción junto con la cancelación. Mismo motivo por el que la `0029`
      pinea `student_id`, `class_id` y `date`.
- [x] **Los cuatro estados se distinguen en pantalla** (ficha y Reservas):
      *Recuperada*, *Excepción autorizada*, *Fuera de plazo · perdió la clase*,
      *En plazo · se le devolvió*. Dos canceladas se leían igual y no son lo
      mismo.
- [x] **La pantalla no ofrece el recupero mientras el tope no rija**, con el
      criterio de los permisos en sombra: la base lo rechaza igual, y ofrecer un
      camino que termina en error es peor que no ofrecerlo.

**El bug que apareció probando, y es el de mayor alcance:** Supabase devuelve el
error como objeto plano, no como instancia de `Error`. Las **41** pantallas lo
reciben con `err instanceof Error ? err.message : 'No se pudo…'`, así que la rama
que corre siempre es la del texto genérico: **ningún mensaje que escribe la base
llegaba nunca al mostrador.** Y son los que más falta hacen — la `0029` los
redactó uno por uno para quien atiende ("No tiene una membresía vigente para el
15/09 — asignale un plan antes de reservarle esa clase") y en pantalla se leía
"No se pudo crear la reserva", que no dice qué hacer. Arreglado en el camino de
reservas con `errorDeLaBase()`. **Sigue pasando en los otros 40 lugares** (pagos,
caja, planes, gastos): es el mismo arreglo de una línea, pero toca todos los
módulos y va con su propia verificación.

**Verificado contra la base el 15/09**, con el sistema andando y sesión real:
`perm_diff()` cero filas · la excepción quedó con `membership_id` en nulo y
`override_by` sellado por la base · el recupero no movió `classes_used` (2/8
antes y después) · la clase repuesta dejó de ofrecerse · el tope rechazó el
segundo con su motivo. **Los datos de prueba se revirtieron**: 8 reservas, las
mismas de antes, cero filas con recupero o excepción.

### ✅ Resolver la clienta sin salir de Agenda (15/09) — `0047` **corrida y verificada**

El cierre de §1 del pedido del 15/09, y textual: *"La recepción no debería tener
que salir de Agenda y recorrer varios módulos para resolver una alumna que está
físicamente en el estudio."*

**Las cinco cosas que pidió poder hacer ahí ya existían todas** —renovar, cambiar
plan, registrar pago, actualizar vencimiento y consultar clases disponibles—,
repartidas entre Alumnos, Planes y Pagos. Faltaba el lugar, no las funciones. Es
el único pedido del documento que ella **no** había hecho antes.

- [x] **Ficha rápida sobre la clase**: elegido el cliente, el mostrador ve su
      plan, hasta cuándo, cuántas clases le quedan y si debe — las cuatro cosas
      que hay que poder contestar con la clienta parada adelante.
- [x] **No reimplementa nada.** Monta `AsignarPlanModal` y los dos modales de
      cobro, que se exportaron de Pagos. Un panel con su propia versión del
      ajuste por medio de pago o del encolado de períodos son dos verdades para
      la misma regla — y ese bug ya pasó una vez, entre cobrar una deuda y
      registrar un pago a mano.
- [x] **La deuda que muestra es deuda de verdad**, no la oferta de renovación:
      esa cobra un período que todavía no existe (`0041`) y no se puede exigir.
- [x] **Mover el vencimiento deja rastro** (`0047`). Se podía desde siempre —el
      trigger de la `0036` es `before insert` y no vuelve a pisar la fecha— pero
      **no quedaba registro de nada**: `memberships` no tenía una sola columna de
      autoría, y correr un vencimiento es regalar días de un período que se cobró
      por un plazo fijo.
- [x] **El sello mira si `end_date` cambió de verdad.** Un `before update` pelado
      sellaría la membresía en cada reserva: desde la `0029` `consumo_recalcular`
      actualiza `classes_used` con cada reserva y corre como el usuario logueado.
      El registro diría que la recepción editó la membresía cuarenta veces por
      mes sin haberla tocado, y un registro que miente es peor que ninguno.
- [x] **La pantalla dice la consecuencia antes de guardar**: "le da 7 días más
      para usar las clases que le quedan; no suma clases, el plan es el mismo".
      Y el motivo es obligatorio: un vencimiento corrido sin explicación no se
      distingue de un error de tipeo. La clienta lo lee desde su portal.

**Verificado el 15/09** con sesión real: el panel mostró plan, vigencia, clases y
deuda de una clienta; el vencimiento se movió del 04/10 al 11/10 y la base selló
"Administración" con la fecha; **1 de 12** membresías quedó con sello, o sea que
reservar no ensucia la auditoría. **Revertido**: 8 reservas, cero sellos, el
vencimiento de vuelta en su fecha.

Con esto **§1 queda cerrada**: seis de sus pedidos ya andaban, cuatro entraron
con la `0046` y este es el quinto y último.

### ✅ El turno fijo (15/09) — `0048` y `0049` **corridas y verificadas**

§2 de la devolución del estudio, y lo primero que dice es lo que importa:
*"Los turnos fijos deben funcionar como una funcionalidad propia y no simplemente
como una reserva repetida."* Tiene razón, y por eso hasta hoy no se podía hacer
nada de lo que pide: una reserva es una fila por (cliente, clase, FECHA), así que
existe el martes 15 pero no existe "los martes a las 18". No había sujeto.

**LA DECISIÓN QUE ORDENA TODO: el turno fijo no materializa reservas.**

Es un derecho sobre un día y hora mientras mantenga la prioridad. Nada más. La
versión que crea el mes de reservas por adelantado arrastra tres problemas que
esta no tiene:

- **el mes de cinco martes.** Con 4 clases por semana y 5 martes, el
  materializador genera una reserva que `consumir_clase` rechaza y el proceso se
  corta a la mitad del mes de alguien.
- **la escala.** `fetchStudioData` trae `reservations` entera, sin filtro de
  fecha y sin límite, en cada ingreso.
- **liberar.** Si liberar fuera cancelar reservas ya creadas, la clienta entra al
  portal, toca la clase de siempre y **se la lleva de vuelta**:
  `reactivar_reserva` es `security definer` y solo valida que la fila esté
  cancelada.

Sin materializar, los tres desaparecen: no hay fila que sobre, no hay fila que
pese, y liberar es cambiar un estado de una tabla que la clienta no puede
escribir. **Ocho de los diez pedidos de §2 se resuelven así**, y bajó el bloque de
12-15 días a dos tardes.

**La prioridad no se guarda, se deriva** (`prioridad_hasta`). El estudio la
definió con un ejemplo —*"vence el 20/10, hasta el 20/10 conserva prioridad,
desde el 21/10 se libera"*— o sea que cuelga del vencimiento de la membresía más
un día de gracia, configurable. Guardarla sería copiar un dato que cambia solo
cada vez que renueva: al segundo mes dirían cosas distintas. Mismo criterio del
libro de caja de la `0020` y del recupero de la `0046`.

- [x] **Tabla `fixed_slots`** que apunta a la clase de la grilla y no a un día y
      hora sueltos: si el estudio mueve esa clase de las 18 a las 18:30, el turno
      se mueve con ella y no queda apuntando a un horario que no se dicta.
- [x] **El cupo lo hace cumplir la base.** Ocho reformers son ocho lugares fijos.
      Si se pudieran asignar nueve, el noveno se entera la primera vez que viene.
- [x] **Estado `pausado`**, que el estudio no pidió: conserva el lugar sin
      ocuparlo (viaje, lesión). Sin esto, a quien vuelve en tres semanas hay que
      liberarle el horario igual. **La liberación automática no lo toca**, y la
      pantalla lo dice con esas palabras.
- [x] **Cambiar de horario libera el viejo y asigna el nuevo**, dos filas y no un
      `update` del `class_id`: "quién ocupaba este horario antes" es justo lo que
      explica por qué hoy está libre, y un update esa respuesta la borra.
- [x] **Liberación automática** (`0049`) en el proceso diario, **apagada de
      fábrica**. El aviso va siempre y la acción solo si el estudio la enciende:
      saber a quién se le venció el derecho es información que el mostrador
      necesita igual —para llamarlo antes de soltarle el lugar— y soltarlo es una
      decisión que puede querer tomar a mano.
- [x] **Libera todo lo que ya venció, no lo que venció hoy.** Si el cron no corre
      un día, al siguiente se pone al día solo. Mismo criterio que
      `renewal_catchup_days` de la `0041`.
- [x] **El permiso lo exige la función, no el cron.** El proceso entra con el
      service role, que no pasa por las políticas: escrito del lado del cron, el
      chequeo no se verificaría nunca. `null` de actor es la única excepción, y
      está escrita.

**Verificado el 15/09 contra la base, con sesión real:** `perm_diff()` cero filas ·
la prioridad da `end_date + 1` para los cinco clientes mirados · **el noveno turno
fijo en una sala de ocho lo rechaza la base**, con su mensaje · un pausado
desaparece de la lista de liberables y deja entrar a otro en su lugar · con el
interruptor apagado `liberar_turnos_vencidos()` devuelve 0, y encendido liberó
**exactamente 1** —la única sin prioridad que no estaba pausada— con el motivo
escrito · en pantalla, "7 de 8 lugares con dueño" y la fecha de prioridad de cada
uno. **Revertido**: cero turnos, 8 reservas, el interruptor apagado.

**Falta de §2**: que las reservas de cada semana se creen solas. Ya no depende de
ninguna respuesta —Matías definió el 15/09 que manda la cantidad de clases del
plan— y se apoya entero en esto.

**Lo que no se pudo verificar acá**: que la clienta vea solo sus turnos desde el
portal. La política está escrita (`can('turnos.ver')` o `my_student_ids()`) y el
anónimo queda afuera, pero ejercerla pide entrar con una cuenta de clienta. Es el
mismo pendiente que arrastra el Bloque 0.

### ✅ El tablero comercial y la ficha (15/09) — `0050` **corrida y verificada**

Lo amarillo de las prioridades del estudio: la #3 (ficha integral) y la mitad de
la #4 (tablero comercial). Va en dos tandas porque **los contadores no
necesitaron ninguna migración**: los cinco se derivan del paquete que el tablero
ya tenía en el navegador.

**Los contadores (sin migración).** Lugares libres hoy, en lista de espera, de
prueba, por recuperar y cobrado hoy. Verificados contra la base uno por uno: 12
clases × 8 − 2 reservas = 94 libres; dos clientes con FE FIRST; Belén, que venció
el 26/08 contra un corte del 31/08. **`recovery_after_days` pasó de declarado sin
código a leído** — era uno de los once parámetros que la `0024` marcó como que no
rigen.

**"¿Cuándo vuelve?" mentía.** Era el contador de reservas en estado
'confirmada', y una reserva vieja que nadie marcó como asistida o ausente sigue
en 'confirmada' para siempre: el número crecía con el descuido del mostrador en
vez de con las clases que vienen. Ahora es la fecha de la próxima.

**El contacto de emergencia existía desde la `0008` y nadie lo escribía.** Se
leía en `fetchStudioData` y ahí moría: ni formulario ni pantalla. Es el dato que
hace falta el día que alguien se descompone en clase, y no estaba cargado para
nadie. De paso `saveMedicalNotes` pasó a `savePrivateData` y **escribe solo lo
que recibe**: guardar el contacto ya no puede pisar las notas médicas, que es
exactamente lo que la `0008` hizo una vez.

**La salud, en cuatro campos** (`0050`): lesiones, embarazo, cirugías y
medicación, en `student_private` —RLS filtra filas, no columnas— bajo las claves
`salud.ver` y `salud.editar` que ya existían. **El texto viejo NO se repartió
solo**: separar "Embarazo - 6 MESES" por palabras clave acierta en los casos
fáciles y escribe datos falsos en los difíciles, justo en el campo donde un dato
falso importa. Lo pasa el mostrador.

**La bitácora** (`student_notes`): filas con autor y fecha en vez de un texto que
se pisa. Es **lo único que la profesora puede escribir en todo el sistema**, y
por eso la clave es propia: se le puede dar sin darle la ficha. Las notas
internas del mostrador no las ve, y eso lo decide `alumnos.editar` en vez de una
clave nueva. La clienta no lee la bitácora — no hay política que se lo permita, a
diferencia de `student_private`.

**EL BUG QUE APARECIÓ PROBANDO, y es el caro.** `author_id` salió apuntando a
`auth.users`. PostgREST resuelve el nombre del autor por la clave foránea y
contra ese esquema **no puede** —no está expuesto—, así que la consulta fallaba
con `PGRST200`… y el `.catch(() => setNotas([]))` de la pantalla la convertía en
**"Sin notas todavía"**. Las dos notas de prueba estaban guardadas, con su autor
sellado, y la ficha decía que no había ninguna.

Es el mismo modo de falla que la `0008` tuvo con las notas médicas, y el que este
repo persigue desde entonces: el dato está y nadie lo sabe. Se arregló de las dos
puntas — la clave foránea apunta a `profiles`, con el porqué escrito para que
nadie lo "corrija" de vuelta, y **la pantalla ya no se traga el error**. Y la
migración se hizo idempotente (las políticas se sueltan antes de crearse) para
poder re-pegarla entera.

**La hora de la nota va fija al huso del estudio**, no al del navegador: misma
decisión que la `0016` tomó para la plata. Si el mostrador abre desde una tablet
mal configurada, la nota sigue diciendo la hora a la que se escribió acá.

**Verificado el 15/09:** `perm_diff()` cero filas · los cinco contadores cuadran
con la base · "Vuelve · 15 sept 16:00 (+1)" contra las dos reservas reales de esa
clienta · el contacto de emergencia se guarda **y las notas médicas sobreviven** ·
los cuatro campos de salud nacen vacíos y el texto viejo sigue entero · la nota
se guarda con `author_id` puesto por la base y se lee con el nombre resuelto.
**Revertido**: cero notas, cero turnos, 8 reservas, salud vacía.

**No se pudo verificar acá**: que la profesora no vea las notas internas. La
política está escrita; ejercerla pide entrar con una cuenta de profesora, y
ninguna de las tres tiene.

### ✅ La ocupación, bien contada (15/09) — `0051` **corrida y verificada**

El estudio la llamó *"la métrica fundamental"* y dijo para qué la quiere: *"definir
qué horarios potenciar, reducir o promocionar"*. Pidió mirarla por **mes, día,
franja horaria, clase y profesora**.

**EL REPORTE QUE HABÍA DABA MAL.** `reporteOcupacion` dividía las reservas de
TODO el rango por el cupo de UNA sesión. Una clase de 8 lugares dictada cuatro
veces en el mes y llena siempre daba **400%**. Solo acertaba si el rango era de
una semana, que es justo lo que un reporte por rango de fechas no es. **Nadie lo
había visto porque el sistema todavía no tiene un mes de historia** — habría
aparecido el primer día que el estudio abriera un reporte mensual.

El divisor correcto es **cupo × veces que se dictó**. Y para saber cuántas veces
se dictó hay que generar las fechas: la grilla es semanal, así que una clase de
los martes no tiene filas propias por fecha. Eso no se puede resolver filtrando
en memoria el paquete del estudio, y por eso va a la base.

- [x] **Una fecha suspendida no es una clase vacía.** Si el estudio no dictó el
      lunes feriado, contarlo como 0% hunde el promedio de ese horario y lleva a
      cerrar un turno que andaba bien. **Verificado**: suspender tres fechas bajó
      las sesiones de 22 a 19 y **subió** la ocupación de 1,1% a 1,3%.
- [x] **El cupo de esa fecha**, no el de la clase (`class_occurrences`, 0018).
- [x] **La profesora de ese día.** Con reemplazo, una ocupación "por profesora"
      que mire la titular le imputa clases que no dio.
- [x] **Las franjas las define el estudio** (`franjas_horarias`), con las que
      quiera: "mañana" no termina a la misma hora en todos lados.
- [x] Los cinco cortes salen de **una sola función**. Escribirlos como cinco
      sería cinco lugares donde arreglar el divisor la próxima vez.

**Los dos errores que aparecieron probando, y son del mismo tipo:** suponer algo
que el estudio no dijo.

1. Los días salían **"Monday"** y los meses **" September 2026"** con el relleno
   de Postgres adentro: `to_char(..., 'TMDay')` usa el locale de la BASE, que es
   inglés. Los nombres pasaron a estar escritos en el SQL.
2. El corte por clase **juntaba el lunes con el martes**. Las 64 clases de la
   grilla se llaman todas "Pilates Reformer", así que agrupar por título y hora
   mezclaba los días: el reporte decía "22 veces" de una clase que en el mes se
   dictó cuatro. Una clase de la grilla es un día **y** una hora.

**Verificado el 15/09**: 64 filas en el corte por clase, cada una dictada 4 o 5
veces, que es lo que tiene un mes · ninguna fila por encima de 100% en los cinco
cortes sobre todo 2026 · los días en castellano y en orden de semana · las
franjas salen de Configuración (09:00 → Mañana, 15:00 → Tarde, 20:00 → Noche) ·
la prueba de la suspensión revertida exacto.

`reporteOcupacion` queda marcada `@deprecated` y sin llamadores: se borra cuando
la `0051` esté en producción.

### ✅ Los avisos a la clienta (15/09) — `0052` **corrida y verificada**

Los cinco de la sección 14 que el estudio volvió a marcar: confirmación de
reserva, recordatorio de clase, clase suspendida, cambio de profesora y lugar
liberado. Con esto **se cierra lo amarillo de sus diez prioridades**.

**Los escribe la base, no el navegador**, porque el mismo hecho pasa desde cuatro
lados: una reserva nace desde la agenda, desde el portal, desde la pantalla de
asistencia y desde cualquier proceso que venga después. Escrito en cada pantalla,
el aviso sale cuatro veces —y falta la quinta, cuando alguien agregue un camino
nuevo y no se acuerde—. Mismo motivo por el que la `0022` puso el sellado de la
reserva en la base.

**No hizo falta cañería nueva.** La `0007` ya deja que la clienta lea sus propios
avisos y el portal monta la misma campana que el mostrador, con realtime: una
fila insertada por el trigger **le aparece en el momento**.

- [x] Cuatro son triggers. El quinto —el recordatorio— **no puede serlo**: no lo
      dispara nada que alguien escriba, lo dispara que llegue el día. Lo llama el
      proceso diario, y es idempotente por reserva.
- [x] **No se le confirma la reserva que se hizo ella misma** desde el portal.
      Confirmarle lo que acaba de tocar es ruido; el aviso existe para cuando la
      anota el mostrador.
- [x] **Al liberarse un lugar se le avisa a TODA la lista de espera**, no a la
      primera. Es la política que el estudio dejó dicha, y el motivo por el que
      `waitlist_offer_minutes` sigue sin regir: describe una oferta por turno,
      que es lo contrario.
- [x] **El cambio de profesora avisa solo si cambió de verdad.** El trigger corre
      también al tocar el cupo o el horario, y avisar "la da Ivana" cuando ya la
      daba Ivana es el tipo de aviso que hace que dejen de leerlos.
- [x] La suspensión avisa a las confirmadas **y a la lista de espera**; el cambio
      de profesora, solo a las confirmadas. A quien espera no le cambió quién da
      una clase que todavía no tiene.
- [x] **Cómo se nombra una clase está escrito una sola vez**
      (`texto_de_la_clase`): los cinco avisos la nombran igual, y si cada uno
      armara su frase habría cinco lugares donde cambiarla.

**Lo que esto NO hace, y va escrito en la migración**: el push al celular y el
mail salen del servidor, no de un trigger. El aviso **existe y llega al portal**;
que además le suene el teléfono queda para cuando se decida cuáles lo merecen.
"Le avisamos" y "le sonó el teléfono" no son lo mismo, y prometer lo segundo sin
hacerlo es lo peor de los dos.

**Verificado el 15/09 contra la base**: anotar desde el mostrador avisa · liberar
un lugar avisa a quien espera · cambiar la profesora avisa a las dos confirmadas
y **volver a guardar sin cambiarla no vuelve a avisar** · suspender avisa a las
tres (confirmadas y lista de espera) y **suspender de nuevo no repite** · el
recordatorio corrido dos veces devuelve 0 la segunda. **Revertido**: 8 reservas,
cero instancias, y los 10 avisos de prueba borrados uno por uno —el `delete` con
`type=in.(…)` devolvió cero filas sin error, que es exactamente contra lo que
avisa el criterio de la casa.

**Lo que no se pudo verificar acá**: que a la clienta que se anota desde el
portal NO se le confirme. `stamp_reservation` deriva `source` de `auth.uid()` y
el service role no tiene sesión, así que toda alta de prueba queda en `'sistema'`.
La rama solo se ejerce entrando con una cuenta de clienta.

### ✅ Personal, horas y remuneraciones (15/09) — `0053` **corrida y verificada**

La sección 12 y la prioridad 6 del estudio. **Era lo único nuevo que entró al
alcance** (§7), y la última de las diez que faltaba empezar.

**Lo caro ya estaba, y por accidente.** El documento marcaba como bloqueo que no
se puede pagar por clase con seguridad, porque no se sabe qué clases se dictaron
de verdad, con qué profesora y descontando feriados. Eso lo resolvió
`sesiones_dictadas()` de la `0051`, escrita el mismo día para la ocupación: qué
horarios potenciar y a quién pagarle cuánto salen del mismo dato.

- [x] **El sueldo en su tabla, no como columna de `teachers`.** RLS filtra filas,
      no columnas: ahí lo vería cualquiera que pueda leer la grilla. Es el
      criterio que CLAUDE.md dejó escrito antes de que existieran los sueldos.
- [x] **Tres claves separadas.** Ver quién trabaja no es ver cuánto gana, y
      recepción puede cargar horas sin enterarse de un sueldo.
      `personal.remuneracion` nace **solo para admin**: el permiso que más se le
      parece, `finanzas.ver`, es de recepción, y esa decisión es del estudio.
- [x] **Las condiciones llevan historial**, y es lo único que si falla cuesta
      plata. Cada clase se paga con la tarifa que regía **el día que se dictó**,
      fila por fila. Con un campo único en la ficha, subirle la tarifa hoy
      cambiaría la liquidación del mes pasado.
- [x] **Una condición no se edita**: se carga la que rige desde una fecha. La
      base tampoco tiene política de update, para que no se pueda ni por atrás.
- [x] **La liquidación se deriva**, no se guarda. Copiarla sería una segunda
      verdad sobre la misma plata, que es lo que el libro de la `0020` evita.
- [x] **Las clases dictadas no se cargan a mano.** Pedirle al mostrador que copie
      un dato que el sistema ya tiene es abrir la puerta a que los dos números no
      coincidan.
- [x] **`fecha_baja` es distinta de `active = false`**, que es la baja del
      catálogo: quien se fue en marzo tiene que seguir apareciendo en la
      liquidación de marzo.
- [x] La pantalla dice **"liquidar no es pagar"**: el pago entra al libro como
      cualquier gasto de la `0020`.

**Lo que NO hace, y va escrito**: no hay fichaje de entrada y salida, porque
**ninguna profesora tiene cuenta todavía**. Las clases se derivan solas; las
horas que no son clase las carga el mostrador. El día que tengan cuenta, el
fichaje se apoya en `staff_work_logs` sin rehacer nada.

**Verificado el 15/09 contra la base**: `perm_diff()` cero filas · sin
condiciones cargadas la liquidación **cuenta las clases y no inventa plata** · el
historial rige — 132 clases de Ivana con $5.000 hasta el 19/09 y $6.000 desde el
20 dan **$708.000**, ni $792.000 (tarifa de hoy) ni $660.000 (la vieja): son 84
clases a una y 48 a la otra, justo las que caen de cada lado · una ausencia no
suma horas ni plata y se cuenta aparte · el mensual se cuenta una vez y no se
multiplica · quien tiene `fecha_baja` en marzo **no** aparece en septiembre y
**sí** en marzo. Datos de prueba revertidos, y borrados **por id**: el filtro por
columna ya había devuelto cero filas sin error más temprano el mismo día.

### ✅ Cerrar y saldar la liquidación (15/09) — `0054` **corrida y verificada**

Lo que le faltaba a la `0053`, y lo marcó Matías: el cálculo estaba, pero
**cerrar un período y saldarlo es otra cosa**.

**El cálculo se deriva y el cierre se guarda, y no se contradicen.** Mientras el
período está abierto el total tiene que moverse solo: si el lunes se carga una
clase que faltaba, la liquidación la refleja sin que nadie recalcule. El día que
se cierra, **el número se congela** — si después alguien carga algo o corrige una
tarifa, la plata que ya se pagó no puede cambiar sola. Un total que se recalcula
para atrás no es un registro.

**Y como se congela, hay que avisar cuando se separan.** El riesgo del congelado
es el opuesto: que se cargue algo después de cerrar y nadie se entere. Por eso la
vista devuelve **las dos cifras** —la congelada y la que daría hoy— y la pantalla
muestra la diferencia. El sistema no elige por el estudio.

**Pagar es un gasto y entra por la misma puerta.** Saldar crea un gasto en
"Sueldos y honorarios" —la categoría la siembra la `0020`—, así que baja del
saldo de la cuenta, entra al libro y aparece en el resultado del mes. Un módulo
de personal con su propia caja sería una segunda verdad sobre la misma plata.

- [x] **El pago y el cambio de estado van en una sola función.** Una liquidación
      marcada "pagada" sin su gasto es plata que salió del estudio y no está en
      ningún lado.
- [x] **El total no lo manda el navegador**: lo calcula la base con la misma
      función que muestra la pantalla. Si lo mandara el cliente, cerrar sería
      escribir el número que uno quiera.
- [x] **Pide las dos claves para pagar**: la de remuneraciones porque toca un
      sueldo, y la de gastos porque mueve el saldo de una cuenta.
- [x] **La tabla es de solo lectura desde el cliente.** Sin políticas de
      escritura no hay forma de marcar algo como pagado sin que salga el gasto.
- [x] **Una pagada no se anula desde acá**: el mensaje manda a Gastos, que es
      donde vive la plata y donde la `0020` ya dejó el camino con su motivo.
- [x] **La categoría se busca por nombre** y no por un id escrito en el SQL: la
      siembra la `0020` y el estudio puede renombrarla. Si no la encuentra, no se
      inventa una — se avisa.

**Verificado el 15/09, por el camino real y con sesión de admin** (el service
role no puede: `can('personal.remuneracion')` lo rechaza, que es el permiso
funcionando): se cerró un período de $10.000 · se cargaron 4 horas **dentro** de
ese período después de cerrar y el congelado quedó en $10.000 mientras el vivo
subió a $18.000, con el aviso de los $8.000 de diferencia en pantalla · el pago
creó el gasto en "Sueldos y honorarios", lo enlazó, y **entró al libro como
egreso** · una pagada deja de ofrecer Anular y Pagar. Todo revertido.

**Dos veces la prueba estuvo mal y el código bien**, y las dos quedan anotadas
porque son la misma trampa: el 17/09 era jueves y la clase es de martes (la base
lo rechazó con su motivo), y las horas de la diferencia se cargaron el 25/09
cuando el período cerrado terminaba el 15 — porque la pantalla cierra hasta HOY,
no hasta fin de mes.

### ✅ Los períodos no se pisan, y la ficha laboral se carga (15/09) — `0055`

Dos cosas que salieron de preguntas de Matías sobre la `0053` y la `0054`.

**EL AGUJERO DE LOS PERÍODOS.** La `0054` puso un índice único sobre
`(teacher_id, desde, hasta)`, que impide cerrar dos veces **el mismo** período.
Pero dos que **se pisan** sin ser idénticos entraban los dos: cerrar 01/09–15/09
por $10.000 y después 01/09–30/09 por $18.000 daba **$28.000 liquidados donde
correspondían $18.000**, y nada avisaba. Probado contra la base antes de escribir
la migración.

Ahora un trigger lo frena y dice **con cuál choca y por cuánto**. Y `anulada` no
reserva días: si se cerró mal, anularla libera esas fechas.

- [x] **Un trigger y no `exclude using gist`**: la forma canónica necesita la
      extensión `btree_gist`, y una migración que se corre a mano no es lugar
      para agregar una extensión. El trigger además puede decir cuál es el
      período que choca, que es lo que quien cierra necesita leer.
- [x] **`ultimos_cierres()`** para que la pantalla proponga el período siguiente:
      el agujero no era solo técnico, nada le decía al mostrador dónde terminó el
      último cierre.
- [x] **Cerrar todas las del período de una.** Las que chocan **se saltean** en
      vez de cortar el proceso: que a una le falte corregir algo no puede impedir
      cerrarle a las otras nueve. Se devuelven con su motivo.
- [x] En la tabla, cada fila dice **"liquidada hasta el …"** en vez de ofrecer
      cerrar. La base lo rechaza igual; esto lo dice antes de apretar.

**Y EL MISMO CABO SUELTO DE SIEMPRE.** Las cuatro columnas laborales que la
`0053` agregó a `teachers` —fecha de ingreso, fecha de baja, DNI y notas—
**existían en la base y ningún formulario las escribía**. Es el cuarto caso del
mismo día: `override_by` y `recovers_reservation_id` (0022), el contacto de
emergencia (0008), y ahora estas. Se descubrió contestando qué se puede cargar en
la pantalla de profesoras.

- [x] Los cuatro campos entraron al formulario de Configuración → Profesoras, y
      lo laboral va **aparte del resto del insert**: si la `0053` no corrió la
      columna no existe y el alta entera fallaría, así que se reintenta sin ella.
- [x] **"Quién trabaja y qué horarios tiene"** en Personal. Los horarios estaban
      en la grilla desde la `0035` pero repartidos entre 64 clases: *"¿qué da
      Ivana?"* no se podía contestar de un vistazo. Se arman de `classes`, que el
      paquete del estudio ya trae.
- [x] Cada ficha avisa lo que le falta para trabajar: **sin condición de pago
      cargada** y **sin cuenta para entrar al sistema**.

**Verificado el 15/09**: el período que se pisa se rechaza nombrando al otro · el
que arranca al día siguiente entra · una anulada libera los días · la ficha
laboral se guarda y **el resto de los datos de la profesora sobreviven** ·
en pantalla, Ivana con sus 30 clases semanales agrupadas por día. Revertido.

### ✅ La profesora ve la ficha de salud (15/09) — **decisión del estudio, sin migración**

Matías lo pidió con el argumento que el propio relevamiento había dejado planteado
y sin contestar: *"¿La profesora debe poder ver el contacto de emergencia? En una
emergencia en clase es quien está."*

La `0008` había decidido que no —"profesora en modo consulta sin dinero ni datos
médicos"— y se revierte a propósito. **No hizo falta ninguna migración**: es
tildar una clave y encender su grupo, que es exactamente para lo que el motor de
la `0012` existe.

  update role_permissions: profesor → salud.ver
  update permission_keys set enforce_mode = 'activo' where grupo = 'Datos sensibles'

**Ver sí, cargar no**, y no por una decisión sino por cómo está armado: el botón
Editar de la ficha está detrás de `canWrite`, así que darle `salud.editar` sería
inerte — no podría llegar al formulario. Y lo que una profesora observa en clase
pertenece a la **bitácora**, que ya puede escribir y que guarda autor y fecha; un
campo de salud se pisa, una nota se suma.

**Verificado con la sesión real de Leandro**: ve "Embarazo - 6 MESES" en la
pestaña Salud, la ficha **sigue sin pestaña Pagos**, y el tablero sigue sin
mostrar un peso.

**Y una corrección sobre el invariante.** Al encender el grupo, `perm_diff()`
siguió dando cero y lo leí como un bug del motor. No lo es: la `0020` la redefinió
a propósito para mirar **solo las claves que siguen en sombra**, con el
razonamiento escrito ahí mismo — comparar contra el legado para siempre convierte
el primer cambio legítimo en un falso positivo eterno. La consecuencia que sí
conviene tener presente: **una vez encendido un grupo, sus claves salen de esa red
de seguridad.** Lo que protege es lo que todavía no rige.

**Para volver atrás**, si el estudio cambia de opinión:

  delete from role_permissions where role = 'profesor' and clave = 'salud.ver';

### ✅ La web publica el descuento por efectivo (16/09) — `0056`

El estudio pidió que debajo de los planes diga **"-5% OFF Efectivo"**.

**EL NÚMERO YA EXISTÍA Y YA RIGE.** `payment_methods.ajuste_pct` tiene el
efectivo en `-5` desde la `0028` —transferencia en 0, tarjeta en +25—, es con lo
que el sistema cobra, y la clienta lo edita en Configuración → Medios de pago.
Escribirlo en la web sería el mismo dato dos veces: el día que lo mueva a 8, la
página seguiría prometiendo 5. **Cobrar una cosa y publicar otra es peor que no
publicar nada.**

**POR QUÉ HIZO FALTA UNA MIGRACIÓN PARA UNA LÍNEA DE TEXTO.** La landing entra
sin login y `payment_methods` no le contesta: con la anon key devuelve `[]` y
ningún error, porque las políticas filtran filas. De ahí
`public_payment_discounts`, la quinta vista pública. Publica **solo descuentos**
—`ajuste_pct < 0`— y solo de medios activos: el +25 de la tarjeta se queda
adentro, porque anunciar un recargo es una decisión del estudio y no algo que
pase solo porque la fila está al lado.

**Sin respaldo en el código, a propósito.** Un respaldo acá sería un descuento
que el sistema no aplica, y con `pick` —que usa el respaldo cuando el valor está
vacío, ver el comentario de `studio_parking`— la clienta no podría apagarlo
nunca.

**VERIFICADO EJERCIÉNDOLO, no consultando el esquema.** Corrió el 16/09:

| Qué se probó | Resultado |
| --- | --- |
| La vista con la **anon key** (el caso real de la web) | una fila: `efectivo · Efectivo · -5.00` |
| `payment_methods` con la anon key | `[]` — la tabla sigue cerrada |
| La tarjeta en la vista | `[]` — el recargo no se publica |
| Antes de correrla | la página entera igual, los 5 planes, sin línea y sin romperse |
| La página | **"-5% OFF EFECTIVO"** centrado debajo de la grilla, en 375 y en 1440 |
| Se movió el descuento a **-8** | la web dijo `-8% OFF EFECTIVO` |
| Se puso en **0** | la línea desapareció y los 5 planes quedaron intactos |
| Se devolvió a **-5** | la web volvió a decir `-5% OFF EFECTIVO`; la tabla quedó como estaba (efectivo -5, transferencia 0, tarjeta 25, MP 0) |

Las cinco consultas de la landing responden 200, incluida la nueva.

En Configuración, al lado del porcentaje, ahora avisa que **los descuentos se
publican en la web y los recargos no**: quien lo edita toca los dos lados, que
es justamente el punto.

### ✅ Seis funciones le contestaban a quien no debía (16/09) — `0057`

Salió de probar el portal con la sesión real de un alumno. Todas
`security definer` —se saltean las políticas a propósito, lo necesitan para
cruzar tablas— y con el EXECUTE que Supabase le da por defecto a todo el mundo.
Ninguna preguntaba adentro quién llamaba. `caja_control()` de la `0020` sí lo
hace, y fue el molde.

**Lo que se ejerció**, con el token de un alumno y con la anon key:

| Función | Antes | Qué devolvía |
| --- | --- | --- |
| `liquidacion()` | 200, 3 filas | nombre de cada profesora, clases dictadas y montos |
| `consumo_control()` | **200 sin sesión** | nombre de clienta, uuid de membresía, contadores |
| `renovacion_control()` | **200 sin sesión** | nombre, monto cobrado, fecha |
| `turnos_sin_prioridad()` | 200 | el padrón con día y hora de cada clienta |
| `recordar_clases_de_hoy()` | granteada | disparar los avisos del día de todo el estudio |
| `tarifa_vigente()` | granteada | la tarifa de una profesora |

Daban vacío **por casualidad**: no hay tarifas cargadas, no se asignó ningún
turno fijo y no hay inconsistencias. El día que la clienta use la pantalla de
Personal, cada alumna podía leer los sueldos.

Las cuatro que el navegador no llama se cerraron con `revoke`, sin tocar su
cuerpo —verificado una por una quién las llama—. Las dos que la pantalla sí
llama llevan el candado adentro con `personal.remuneracion`, y pasaron a
`plpgsql` para poder cortar con un motivo en vez de devolver vacío: una
liquidación de $0 que miente es peor que un "no tenés acceso".

Un grant por columna no servía: **admin y alumno son el mismo rol de Postgres**
y lo que los distingue son las políticas, que filtran filas y no columnas.

**El auto-registro** del portal (`/api/portal/registro`) convertía email + DNI
en credenciales: creaba la cuenta con el mail ya confirmado y la contraseña que
eligiera quien entrara. Ahora tiene interruptor en `studio_settings`, con
`solo_admin`, y **nace apagado**; falla cerrado si la clave no está. La clave
`portal.autoregistro` de la `0012` no servía de interruptor: es tipo 'servicio'
con `legacy_roles` vacío, así que `can()` le contesta false a todos. Se le
arregló además el `ilike` del email —donde `_` es comodín, así que
`m_ria@gmail.com` matcheaba la ficha de `maria@gmail.com`— y el update del
vínculo, que no miraba cuántas filas tocó.

**Verificado después de correr**: las siete rebotan (400 con motivo las dos del
candado, 403 las cinco de la reja), la anon key pasó de 200 a 401, el cron
sigue pudiendo con el service role, y el endpoint devuelve 403 con un email y un
DNI que hasta ese momento creaban la cuenta.

**Corrió dos veces**: la primera abortó porque el `group_key` del parámetro
nuevo no existe en la lista cerrada de la `0020`. La envoltura `begin/commit`
hizo su trabajo y no quedó nada a medias.

### ✅ La profesora ve las reservas de sus clases (16/09) — `0058`

Verificado con la sesión de Ivana: de las 13 reservas del estudio veía las 13, y
**seis eran de clases que no dicta**, con nombre y apellido de cada clienta.

No era un agujero del motor: es la clave que tenía. `reservas.ver` es la amplia
y la acotada existe desde la `0012` sin usarse.

**La `0012` ya tenía escrito lo que había que hacer primero.** La ayuda de
`reservas.ver.propio` decía, textual: *"ANTES de encenderla, arreglar el cálculo
de cupos de lib/api.ts o las clases aparecen vacías"*. Era exacto: `enrolled` se
derivaba de las reservas legibles, así que las clases de la otra profesora
habrían aparecido en 0/8. **No escondidas: mentidas.** Y un cupo falso es peor
que un cupo escondido, porque quien mira la grilla para saber si entra una
clienta más necesita el número real.

Ahora sale de `class_occupancy`, la vista de la `0005` que —sin
`security_invoker`— corre con los permisos del dueño y cuenta todas las
reservas. Es la misma con la que el portal le muestra "8 lugares libres" a una
clienta que no ve a las demás.

**Y hubo que corregirlo dos veces.** Arreglar `fetchStudioData` no alcanzó: la
Agenda recalcula el cupo por semana visible —lo necesita, porque ahí se navega
de semana en semana— y ese es el número que se dibuja. La primera verificación
comparó los números antes y después del cambio y daban iguales; **daban iguales
porque la Agenda nunca usaba el valor que se cambió**. Una prueba que pasa por
el camino equivocado es peor que no probar.

Encender el grupo Reservas fue el no-op que promete el motor, **verificado clave
por clave antes de escribir la migración**: en las ocho, la matriz reproducía el
legado exactamente.

**Verificado después**: la ocupación de las clases ajenas volvió a ser la real
(lunes 18:00 y 19:00, martes 16:00 y 19:00, sábado 11:00, todas en 1/8) y el pie
de la agenda volvió de 4 a 9 reservas confirmadas; las nueve coinciden una por
una con `class_occupancy`. En Reservas pasó de 13 registros a 7, y la única
profesora que aparece es ella. `perm_diff()` en cero filas.

### ✅ La profesora pasa lista (17/09) — `0059`

Un solo tilde, y no por suerte: la `0058` dejó el grupo Reservas rigiendo, así
que la matriz manda. En sombra, tildar `reservas.asistencia` no habría hecho
nada.

Ni una línea de código: las cuatro pantallas que ofrecen pasar lista ya
preguntaban `can('reservas.asistencia') || canWrite`, y `canWrite` es
`role in (admin, recepcion)`.

**Ejercido con su token**: 'asistió' 200, 'ausente' 200, 'cancelada' **403**,
'confirmada' **403**. O sea que puede marcar y corregir, y no puede cancelar ni
desmarcar.

**Y probarlo encontró un agujero de pantalla.** El botón de deshacer se le
ofrecía igual —deshacer es volver a 'confirmada', que la restrictiva manda a
`reservas.editar`— y mostraba el texto interno de Postgres: *"new row violates
row-level security policy..."*. Dos cosas mal: ofrecer una acción que la base va
a rechazar, y mostrarle las vísceras del motor a una profesora.

Se arregló sin darle `editar`: quien no puede deshacer **cambia la marca** entre
presente y ausente, que es lo que la base sí le deja y lo que una lista de
asistencia más necesita. Y de paso, cualquier rechazo de RLS ahora se traduce a
"Tu rol no tiene permiso para esta acción" en las 40 pantallas.

Lo que **no** cierra: la permisiva de update no filtra por clase propia. Está
anotado en §0 con su razón — esa pareja de políticas alcanza también a la
cancelación de la alumna.

**Corregido el 27/09 (T37) — `0085` corrida y verificada el 27/09.** La prueba en
producción con la sesión de Ivana encontró que se podía marcar **una clase
que no pasó**: tocó "Marcar ausente" en una reserva del 22/10 desde "Más
adelante" y la base lo aceptó. La ausencia consume la clase y libera el
lugar, y ella no lo podía deshacer. Ahora 'asistió' y 'ausente' se ponen
**desde `attendance_open_minutes` antes del inicio** de ESE día (30 por
defecto, en Configuración → Reservas; `inicio_de_clase`, así que una clase
corrida de horario corre la lista con ella). Vale para **todos los roles**
—no es un permiso sino un dato que no puede ser cierto; para "no viene"
está cancelar—, y lo que entra sin sesión queda afuera, como en la `0038`.
Ninguna función del servidor escribe esos estados. Deshacer una marca no
tiene horario, pero sí cupo: si otra persona tomó el lugar que liberó el
ausente, volver a 'confirmada' rebota con "La clase ya está completa" y lo
que queda es cancelarla (la consulta y el paso están en la migración).

De paso, **la profesora no podía marcar presente una reserva por
excepción**: `consumir_clase` revalidaba la excepción como nueva y le pedía
`reservas.excepcion`; y a quien la tiene, si la persona había comprado un
plan en el medio, le pasaba la clase a ese plan. Ya no revalida al marcar
una excepción **ya validada** que tenía su lugar. "Ya validada" es la firma
`override_by`, y para que la firma signifique eso la base ahora la borra en
todo alta —en las que no pasaban por la validación quedaba la que mandara
el navegador: la espera, el alta ya marcada, el motor apagado— y un motivo
de excepción pide `reservas.excepcion` en cualquier estado. Sin eso, el
atajo habría regalado clases con una firma inventada. `consumir_clase` **se redefine entera**, copia de
la `0084` con dos cambios marcados: va después de la `0084`, que ya corrió
el 27/09 (corrida al revés, la `0084` deshace el arreglo y hay que volver a
correr la `0085`). De ausente a presente sigue sin mirar el cupo, a
propósito: si estuvo, estuvo.

En pantalla, con el mismo número: Reservas esconde los botones de marcar
fuera de la ventana, y la Agenda, el tablero y el "Tomar asistencia" de Hoy
pasan a "Ver la lista" y dicen desde cuándo se marca; "sin marcar" cuenta
sólo las clases con la lista abierta, y el encabezado de la lista muestra la
hora de ese día. Probado en un Postgres local con las funciones de
producción (las de la `0084`) y las políticas de la `0013`: 69 casos con
sesión de profesora, admin, alumna, recepción sin `reservas.excepcion` y sin
sesión; las lecturas raras del parámetro, dos corridas seguidas, las tres
guardas y la vuelta atrás. La misma batería sin la `0085` reproduce los
errores. **La reserva del 22/10 sigue en 'ausente'** —la migración no toca
datos—. Falta ejercerlo en la pantalla con la sesión de la profesora.

### ✅ A la profesora también se le avisa (17/09) — `0060`

Su campana no sonaba nunca. El camino corto era darle `avisos.ver`, y no servía
por dos razones que hubo que ir a mirar:

De los avisos de staff cargados, **dos son plata** (`pago_acreditado`,
`deuda_vencida`) y esa clave es todo o nada. Y sobre todo: los avisos que le
importan **no existían para el staff**. `avisar_instancia` insertaba una fila por
ALUMNA reservada, con `audience = 'alumno'`. Nadie le avisaba nunca a la
profesora que no tenía que venir.

**No era un permiso que faltaba: era un aviso que no existía.**

La tabla sólo sabía dirigirse a una alumna. Se le agregó `teacher_id` y la
audiencia `'profesor'`, y lee lo suyo con el mismo criterio que la alumna.
**Sin clave de permiso, a propósito**: que cada uno vea lo suyo es aislamiento,
no configuración —la razón por la que `my_student_ids` nunca fue configurable—.
Una clave permitiría apagarle el aviso de que su clase se suspendió, y eso no es
una preferencia del estudio: es información de su trabajo.

Tres avisos: suspensión a quien la iba a dar, "te asignaron" a la que entra y
"te reemplazan" a la que sale. El de suspensión a la profesora **no cuelga de
que alguien haya reservado**, al revés del de las alumnas: le importa igual con
la sala vacía.

**Cero código.** `fetchNotifications` hace `select('*')` sin filtrar por
audiencia y `notification_reads` ya se gobierna con `user_id = auth.uid()`.

**Verificado suspendiendo su clase de las 12:00 con ella logueada**: se
escribieron los dos avisos (el de ella sin la línea de "no se te descuenta", que
es cosa de la alumna), la campana le marcó **1 sin recargar** —el realtime ya
estaba— y sigue viendo **0 avisos de staff y 0 de alumnas**. Después se le
cambió la profesora y salieron los otros dos. Los cinco avisos y la ocurrencia
quedaron borrados.

**Una sospecha propia que resultó falsa, anotada para no repetirla**: se escribió
el cálculo de "quién la iba a dar" con un `if` explícito creyendo que nombrar
`old` en una expresión rompía en los INSERT —que es lo que hace la agenda al
suspender— y que la `0052` tenía una bomba ahí. Se probó antes de decir nada:
suspender por INSERT con el trigger viejo devuelve 201. En INSERT `old` es un
registro nulo y leerle un campo da nulo, sin error.

**De paso**: el nombre de Giuliana tenía un espacio al final y eso salía en el
aviso que lee la clienta ("la da Giuliana ."). Se corrigió el dato.

### ✅ El acceso de la clienta, de punta a punta (17/09) — `0061` a `0068`

El bloque más largo del día y el primero que se ejerció **en producción y no
en desarrollo**, que es lo que lo hizo valer: cuatro de los cinco problemas
sólo existían ahí.

**Las migraciones.** `0061` sacó el DNI y las notas laborales de `teachers` a
la satélite `teacher_private` —la deuda 🔴 que la §0 arrastraba desde la
`0053`—. `0062` (`ultimos_cierres`) para que Personal proponga el período
siguiente. `0063` borró las 10 clientas de prueba y con ellas $365.000 de
plata fantasma. `0064` prorrateó el sueldo mensual, que se pagaba entero en
cada cierre: dos cierres en un mes eran dos sueldos. `0065` sumó los ajustes
manuales con motivo exigido por la base. `0066` arregló que **un cierre de
caja correcto se denunciara a sí mismo para siempre** —el ajuste del arqueo
cae dentro del turno que lo creó, así que había que comparar contra lo
contado y no contra lo esperado—. `0067` le dio a cada clienta su número de
credencial. `0068` sacó la dirección del portal del pedido HTTP.

**Y tres errores que sólo se ven en producción.**

1. *El mail que no salía sin decir por qué.* `sendEmail` devolvía `false` y
   tiraba a la basura la respuesta de Resend. Las cuatro causas posibles
   —falta la API key, remitente inválido, dominio sin verificar,
   destinatario suprimido— se arreglan en lugares distintos, así que había
   que adivinar una y redeployar para probar la siguiente. Ahora el motivo
   llega a la pantalla y el cuerpo entero a los logs. La causa concreta de
   ese día fue **`EMAIL_FROM` con las comillas de `.env.local` pegadas
   literales en Vercel**: en el archivo TIENEN que estar —si no, bash lee el
   `<` como redirección— y Next las saca al parsear; Vercel no parsea nada.
   Resend responde 422. El remitente ahora se normaliza, así que el mismo
   valor pegado en los dos lugares funciona.

2. *No había forma de reintentar.* La ficha con cuenta sólo mostraba
   "Activo": si el mail no salía, la única salida era borrar la cuenta y
   crearla de nuevo. Se sumó "Reenviar el mail de acceso", que **se niega si
   la clienta ya eligió su contraseña** —el mail promete que la clave es su
   documento, y sobre una clave propia sería mentira, además de que para
   hacerlo verdad habría que pisarle la que eligió—.

3. *El link del mail apuntaba a `localhost:3000`.* Los cuatro mails que se
   habían mandado ese día lo tenían, uno a una clienta real. Se armaba con
   `new URL(request.url).origin`, que coincide con la dirección pública sólo
   por casualidad. Y al arreglarlo apareció el error de abajo, que es el más
   interesante de los tres.

**El respaldo que tapaba una falla.** Después de cargar `portal_url` y
desplegar, el mail siguió saliendo con el dominio de Vercel. La cronología no
dejaba dudas —el valor 10 minutos antes, el deploy 5 minutos antes—, así que
el parámetro no se estaba leyendo. La causa: **`lib/estudio.ts` era el único
archivo del proyecto que leía `NEXT_PUBLIC_SUPABASE_ANON_KEY`**, y todo el
resto usa `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. En `.env.local` están las
dos, así que en desarrollo andaba; en Vercel está sólo la que usa el resto.
Esa lectura devolvía vacío **siempre** en producción. Y no se notaba porque
el otro valor que lee es el nombre del estudio, cuyo respaldo escrito en el
código es `'Casa Fe'` — exactamente lo que dice la base. O sea que el nombre
de los mails, del manifest y de la metadata venía del código desde que esa
función existe, y se iba a descubrir el día que lo cambiaran desde
Configuración y los mails siguieran diciendo lo de antes.

**Qué quedó verificado en producción**, contra Resend y contra la base, no
contra la pantalla: el alta crea la cuenta y manda el mail en 1 segundo; el
link sale con el dominio que el estudio cargó (sin `www`, que es la señal de
que el parámetro se lee); el ingreso con el documento y el cambio obligatorio
de contraseña; la credencial `CF-0002` en la lista, en la ficha y en la
búsqueda —que encuentra por `42` y por `CF-0042`—; el reenvío aceptado sobre
una cuenta que nunca entró y rechazado sobre una que ya eligió su clave, con
`updated_at` sin moverse para probar que el rechazo corta antes de escribir.

**Lo que NO se verificó**: el header del portal con la credencial, porque esa
pantalla sólo existe con sesión de alumna.

**Un barrido que dejó tarea.** Buscando los otros lugares con esta misma
forma —una falla que se vuelve un booleano y nadie puede saber por qué—
salieron **28, once graves**. Los dos peores: el proceso diario inserta la
notificación **antes** de mandar el mail y sólo cuenta los que salieron, así
que la campana dice "cuota emitida" y la clienta no recibió nada; y el
webhook de Mercado Pago responde `ok: true` aunque no haya acreditado, así
que MP no reintenta y el pago queda pendiente sin que nadie se entere. Están
en la §0.

**Un bug de verdad, encontrado de paso**: en `app/api/cron/diario/route.ts`
los avisos `turno_liberado` se arman en la línea 1002, **después** del único
insert (línea 898), se cuentan en `evaluated` y se tiran. El aviso "Turno
fijo sin prioridad" nunca llegó a la campana, ni una vez.

### ✅ Cancelar, deshacer, y arrancar el día que el estudio diga (18-22/09) — `0069` a `0073`

Cuatro días de la misma pregunta hecha de cuatro maneras: **el sistema tenía
que poder decir que algo se termina, que algo fue un error, y que algo todavía
no empezó.** Sabía hacer lo primero a medias y no sabía hacer las otras dos.

**Cancelar dejaba de existir.** Cancelar una membresía le ponía
`status = 'cancelada'` y ahí moría: no quedaba cuándo, ni quién, ni por qué, y
Reportes —que tiene un corte llamado "Membresías canceladas"— no mostraba
ninguna. La `0069` puso la operación en una función con permiso propio, y la
`0070` le sumó el motivo **exigido por la base**, no por la pantalla. El
período cancelado queda en la ficha con su motivo: es historia, no basura.

**Y deshacer no era cancelar.** Lo preguntó Matías el 18/09 —"quizás sin
querer le creé una y era otra"— y tenía razón en que faltaba. Cancelar un
dedazo de treinta segundos antes llena la ficha de "canceladas" que no
significan nada y ensucia justamente el reporte de bajas reales. La `0071`
agregó **borrar de verdad, y sólo lo que no dejó huella**: si nadie usó una
clase, nadie reservó contra ese período y nadie pagó la cuota, borrarlo no
pierde nada. Si algo de eso pasó, la base se niega y nombra el motivo. Sin
ventana de tiempo: un "dentro de los 10 minutos" es arbitrario y frustra a
quien se da cuenta a los veinte.

**Un agujero que encontró una revisión y que hubo que ir a verificar.** La
`0072` cerró que **una clienta podía devolverse las clases que ya había
perdido**: `cancel_kind` es lo que distingue una cancelación a tiempo de una
fuera de plazo, y nada impedía que reescribiera ese campo en sus propias
reservas. La política la dejaba pasar, el trigger de consumo leía el valor
nuevo y le devolvía la clase. Se verificó ejerciéndolo antes de escribir el
arreglo, porque un hallazgo de revisión que nadie reprodujo es una hipótesis.
Ahora el campo lo fija la base y el pinneo ocurre **antes** de que corra
`consumo_rige()`, que era el orden que faltaba.

**El segundo barrido de funciones sin candado.** La `0073` es de la familia
que empezó la `0057`. Cinco funciones `security definer` contestaban con la
llave pública —que viaja en el bundle del navegador— y **una de ellas
escribe**: `consumo_recalcular` hace un `update` sobre `memberships`. El daño
estaba acotado por accidente y no por diseño, porque recalcula el valor
correcto. Otras dos, `reporte_ocupacion` y `sesiones_dictadas`, sí tenían
revocado el `anon` pero no chequeaban nada adentro: le daban el reporte de
ocupación completo del estudio, para cualquier rango, **a cualquier cuenta
logueada, incluida una clienta del portal**. Y `class_occupancy` se leía sin
sesión, o sea que se podía saber desde afuera qué horarios se llenan.

**Verificado el 22/09, y por partida doble.** Las seis puertas cerradas con la
llave pública (`permission denied` en las seis, contra las tres que antes
contestaban). Los dos reportes rechazando en castellano incluso llamados sin
`auth.uid()`, que es la forma de probar que el cuerpo nuevo está vivo y no el
de la `0051`. Los cinco cortes de Ocupación dando **los mismos números** —2240
lugares, 0,2%— con la sesión de admin, que es el control de que envolver el
cuerpo no lo cambió. Y lo que más podía romperse: se reservó una clase desde
la Agenda y `classes_used` pasó de 3 a 4, o sea que la cadena de descuento
—`consumo_rige`, `membresia_para`, `consumo_contadas` y `consumo_recalcular`,
las cuatro revocadas— sigue funcionando, porque quien las llama son funciones
`definer` y un trigger no chequea `EXECUTE` sobre su propia función. La
reserva de prueba se borró y el contador volvió a 3.

**El portal pasó a ser una app.** Cinco pestañas abajo —Reservar · Mis clases ·
Inicio · Pagos · Perfil—, con el historial del mes que le faltaba para poder
auditar su propio contador, los días que le quedan en vez de sólo la fecha, y
los avisos y el "agregar al inicio" dentro de Perfil. La barra respeta
`env(safe-area-inset-bottom)`, que es la diferencia entre una web y algo que
se siente una app en el teléfono.

**Y la membresía puede arrancar el día que el estudio diga.** El estudio abre
el **29/09** y esta semana está dando de alta a las clientas que van a empezar
ese día. Hasta ahora la membresía arrancaba el día de la carga, así que se les
iban ocho días de vigencia antes de la primera clase. Ahora el alta y la
asignación tienen "Arranca el", y el portal habilita la reserva **por fecha**:
puede elegir su plan hoy y reservar del 29 en adelante, no antes. El campo se
deshabilita solo cuando la clienta ya tiene un período vivo, porque ahí el
trigger `membresia_fechas` encola el nuevo detrás y la fecha elegida no se
respetaría — y decirlo es mejor que dejar elegir algo que la base va a
ignorar.

### ✅ Las cuentas y los medios de pago se administran desde el sistema (22/09) — `0074` **corrida y verificada**

Lo pidió Matías: *"necesito poder crear cuentas, como efectivo,
transferencia, credito, y ligarla a un metodo de pago ... que se vea
reflejado en la caja los montos de las cuentas, y esas serian opciones de
pago cuando me pagan"*.

**Casi todo estaba construido y no se podía tocar.** El modelo entero vivía
en la base desde la `0020`: `accounts` con su tipo y sus datos bancarios,
`payment_methods.default_account_id`, y un trigger que imputa cada cobro a
la cuenta de su medio. Hasta las funciones estaban escritas en
`lib/caja-api.ts` —`createAccount`, `updateAccount`, `setMethodAccount`— y
**no las llamaba nadie**. Las cinco cuentas que sembró esa migración eran
las únicas cinco que podía haber.

**El muro que había atrás.** `payments.method` tenía un CHECK con los
cuatro valores escritos en la base (`0002:37-39`). O sea que el botón
"Nuevo medio de pago" —que existe desde la `0011`— creaba una fila que
después **no servía para cobrar**: la palabra no estaba en la lista y el
INSERT rebotaba. Estaba anotado como deuda en dos migraciones.

**Y el orden lo dejó escrito la `0020`**, que es lo que evitó romper la
pantalla de Pagos: *"Primero se derivan del catálogo en el front, después
la FK, en su propia migración"*. Los tres objetos de cuatro claves
escritos a mano (`METHOD_ICON`, `METHOD_LABEL`, `METHOD_COLORS`) dejaban
el icono en `undefined` con un código desconocido, y eso en React es una
pantalla en blanco. Se hizo en ese orden.

Quedó: el nombre sale del catálogo, el icono tiene uno genérico para lo
que no conoce, el color se deriva de una paleta por posición, y los medios
que se ofrecen al cobrar son los activos y manuales — que hoy dan las
mismas tres de siempre. Los mismos cuatro valores estaban copiados además
en `lib/types.ts` y en dos firmas de `lib/api.ts`.

**La pantalla que faltaba.** Configuración → Catálogos suma **Cuentas**,
con el tipo en las palabras del mostrador, los datos bancarios cuando
corresponde, y "se arquea" ofrecido sólo para una caja —contar la plata
con la mano no se puede hacer con un saldo de banco—. Y cada medio de pago
tiene su **selector de cuenta**. Dos cosas no se ofrecen porque la base las
rechaza: la cuenta "A imputar" no muestra botones, y a un medio automático
no se le ofrecen las cuentas que se arquean. El permiso es
`can('caja.cuentas')`, que RIGE: recepción ve la lista y no la toca.

**Verificado ejerciendo el circuito entero**, con la sesión de admin y
después de correr la `0074`:

- Un cobro con un medio inventado rebota con **`23503`** —clave ajena— y
  no con `23514`, que sería el CHECK viejo.
- Se creó la cuenta "Macro" y apareció al instante en los selectores.
- Se creó el medio "Débito" y se le asignó esa cuenta.
- El selector de cobro pasó de tres opciones a **cuatro**, con Débito.
- Se cobraron $70.000 con Débito: **entró** —antes la base lo rechazaba— y
  la plata fue sola a Cuenta Macro, que en Caja quedó en **$70.000 · 1
  movimiento** con el resto en cero.

Todo revertido: la cuota volvió a `pendiente` campo por campo contra la
foto previa, y se borraron el medio, la cuenta y el sello del cobrador.

**De paso**: el comprobante salió `00000002`. El bloque que devuelve
`receipt_seq` no se había aplicado al borrar la ficha de prueba, así que
el 1 estaba consumido desde antes.

**Lo que este bloque NO toca**, y quedó relevado aparte: la plata
`diferida` (tarjeta, Mercado Pago) figura disponible el mismo día aunque
no haya acreditado; "A imputar" acusa y no se puede vaciar —no hay
pantalla para reasignar un cobro—; una cuenta dada de baja sigue
mostrando su saldo; y el arqueo sabe de una sola caja. Mercado Pago no se
tocó: el webhook y los links quedan como estaban.

### ✅ El día se lee entero, y el cobro dice de dónde sale el monto (22-23/09) — `0075`

`account_ledger` mostraba el código del medio (`efectivo`) y no su
nombre, y Caja no tenía dónde ver el día completo. Ahora el libro del día
cruza todas las cuentas, el cierre muestra el desglose por medio y el
total del turno, y el modal de cobro dice **por qué** ese número: el
precio de lista tachado al lado del que se cobra, y el ajuste en su
propio recuadro. Salió de que Matías cobró $80.750 sobre una cuota de
$85.000 y no encontró de dónde salía la diferencia.

### ✅ La devolución por cancelar tiene tope (23/09) — `0076` **corrida y verificada**

La regla que dictó el estudio: cancelar con más de 3 horas devuelve la
clase, **pero sólo 2 veces por mes**. De ahí en más —o cancelando tarde,
o no yendo— la clase se pierde, y no hay recupero desde el mostrador.

Lo que costó decidir fue **dónde se cuenta**. Contarlo en
`consumo_contadas` —la vista que dice cuántas clases lleva usadas—
parecía lo natural y es un agujero: esa vista lee **estado actual**, así
que cancelar, volver a reservar y cancelar de nuevo reciclaba el cupo
para siempre. Y `cancelled_at` lo escribe la clienta. Entonces la
decisión **se sella en el momento de cancelar**: el trigger cuenta las
devoluciones ya dadas en esa membresía y escribe `cancel_kind` con el
tercer valor nuevo, `'en plazo sin cupo'` — canceló a tiempo, pero la
clase no vuelve. Escrito una vez, no recalculable después.

El tope vive en `cancel_free_max` y **nace sin regir**: el sistema se
comporta como antes hasta que el estudio lo enciende. El recupero se
apagó con dos updates, el valor **y** el `rige`.

### ✅ La clienta elige su horario fijo (23/09) — `0077` y `0078` **corridas y verificadas**

Al reservar por primera vez un horario, el portal le pregunta si es por
esta vez o si lo quiere fijo; si lo quiere fijo, le completa el resto del
período con ese día y hora. **En la renovación vuelve a elegir**: un
turno fijo que se hereda solo es un turno que nadie sabe cuándo se soltó.
La `0078` le pone el límite que dice su plan (`weekly_frequency`), con un
trigger y no con una validación de pantalla.

Y el turno fijo dejó de ser invisible: se ve en Inicio, con hasta cuándo
lo conserva y un botón para soltarlo.

**Corregido el 27/09 (T27) — `0082` corrida el 27/09, falta ejercerla en pantalla.** Tenía
tres agujeros, y los tres le caían a la tanda de la apertura, que entra con
planes del 29:

- **El portal no le ofrecía el fijo** con un plan que todavía no arrancó:
  el fin del período se leía del plan de hoy y con un plan 'futura' daba
  nulo, así que la hoja no se abría. Ahora el período es el del plan que
  va a pagar las semanas de ese horario (`periodoDelTurno`, `lib/api.ts`:
  el que cubre la fecha o el próximo en arrancar, con el pase de prueba
  último). No es exactamente "el que paga la clase": con un pase sin usar
  que cubre la primera fecha, `membresia_para` (0037) cobra ésa del pase
  y las demás del plan. Las fechas van desde la que eligió —si reservó el
  06/10 y no el 29/09, el 29 no se le anota: le gastaba una clase y, para
  deshacerlo, una de sus dos devoluciones (0076)— hasta que vence el
  período, sin las que ya tiene en cualquier estado, sin las suspendidas,
  sin las que ya cerraron y sin las completas (`fechasPorCompletar`, con
  la ocupación de `class_occupancy` para el período entero). Nunca hasta
  `prioridad_hasta`, que se mete en el período encolado.
- **La base se lo rechazaba igual**: `turno_fijo_propio` pedía una
  membresía que cubriera hoy. La `0082` pide "vigente o por empezar". Y
  arregla junto el tope de la `0078`, que sin membresía de hoy no tenía
  plan que leer — o sea que a una clienta con plan del 29 no la limitaba
  nada, ni desde el portal ni desde el mostrador. El plan que pone el
  tope sale de `plan_de_los_fijos`, y el portal ya no lo calcula: se lo
  pregunta a la base con `mi_tope_de_fijos()`. Que esa función exista es
  además cómo el portal sabe que la `0082` corrió; sin ella no le ofrece
  el fijo a quien tiene un plan por empezar, igual que antes. De paso el
  trigger rechaza un fijo sobre un taller, que hasta acá sólo lo frenaba
  la pantalla del mostrador.
- **"Darle este horario fijo" en la Agenda no reservaba nada.** Escribía el
  derecho y el lugar de cada martes quedaba libre: el cupo lo cuenta
  `enforce_class_capacity`, sobre reservas. Y encima apagaba el portal,
  que no le ofrecía completar un horario que ya era suyo. Ahora la Agenda
  muestra antes qué fechas le va a anotar —desde la que está abierta— y
  cuántas clases le descuenta, las anota de a una por el mismo insert que
  "Reservar", y dice cuál no entró y por qué. Pide `turnos.asignar` para
  el horario y `reservas.crear` para las fechas. Si el plan no llega a la
  fecha abierta, lo dice ("vence el 14/10, antes de esta fecha") en vez de
  "no tiene plan".
- **Completar lo que falta**, para el horario que ya es suyo: en la Agenda,
  en el renglón de cada dueña (el selector saca a las ya anotadas en esa
  fecha, así que ahí no servía); en el portal, en la tarjeta de Inicio y al
  reservar a mano una clase de ese horario. La cuenta es lo que entra, no
  lo que falta, y arranca en la primera fecha de ese horario que ya tiene
  en el período —completar es llenar huecos, no volver para atrás: a la
  que lo hizo fijo desde el 06/10 no se le ofrece el 29/09—. Y mira
  también el período encolado (`turnoPorCompletar`): después de renovar,
  el mes nuevo aparece para completar en cuanto se paga, no el día que
  arranca.

Verificado sin tocar la base de producción:

- Las funciones puras, extraídas del código tal cual, contra los casos del
  revisor: la del FE START que reservó el 06/10 recibe 13 y 20/10 y no el
  29/09; la del FE FLOW agotado con la renovación encolada ve los cuatro
  martes del período nuevo el 10/10; mirando el 20/10 a la de FE FLOW
  hasta el 14/10 la Agenda encuentra su plan; la fecha llena va aparte,
  con el cupo del día si el estudio lo cambió.
- La `0082` en un Postgres local descartable, con un esqueleto de las
  tablas, la `0077` y la `0078` tal cual y todo creado por una dueña que no
  es superusuaria, llamando como `authenticated`. Antes: la del plan del
  29 rechazada y el mostrador le daba horarios sin tope; la del pase de
  hoy más FE FLOW del 29, trabada en 1; el taller entraba por el
  mostrador. Después: la del 29 toma el suyo y su FE START la frena en el
  segundo, por el portal y por el mostrador; la del pase más FE FLOW
  llega a 2; sin plan, con la futura cancelada o vencida ayer sigue el
  rechazo con el texto nuevo; el taller rebota por los dos lados, y el
  que ya existía se puede pausar y liberar pero no reactivar;
  `mi_tope_de_fijos` da 1, 2, null, null, 2, 1, null para las siete, y
  `plan_de_los_fijos` le niega el permiso a `authenticated`. La guarda
  corta sin la `0077`, la migración se puede correr dos veces, y la vuelta
  atrás (0077 + 0078 + los dos drops) deja todo como antes y admite
  volver a correrla.

**No se ejerció en el navegador**: tomar un fijo escribe reservas, y la
consigna era no tocar la base. Queda para después de correr la `0082`,
con la sesión de una clienta y con la del mostrador:

1. **La migración.** Las dos consultas de "CÓMO VERIFICAR" al final de la
   `0082`: cuatro funciones, `plan_de_los_fijos` sin `authenticated`, y el
   plan que pone el tope — Marco Rossi FE BALANCE (no el pase), Lourdes
   Bobba FE FLOW (no el FE STRONG cancelado), Test 1 FE START y Test 3
   FE FLOW, los dos del 29/09.
2. **Completar desde la Agenda (Test 2 Cobro Agenda).** Tiene el lunes
   10:00 que le dio el mostrador hoy, sin fechas, con el 28/09 cancelado.
   Abrir cualquier lunes 10:00: su renglón tiene que decir "Le faltan 4
   fechas de su plan FE FLOW: 05/10 · 12/10 · 19/10 · 26/10" — sin el 28.
   "Anotarla" y mirar `reservations` de esa ficha y esa clase: cuatro
   confirmadas con el `membership_id` del FE FLOW, y `classes_used` +4.
3. **Dar desde la Agenda con tope (Test 1 Alta Efectivo, FE START del
   29/09, 1 vez por semana).** Abrir el martes 06/10 18:00, elegirla: la
   previa dice "desde el 06/10" y no nombra el 29/09. Darlo. Después, el
   jueves: tiene que rebotar con "Tu plan FE START es de 1 vez por semana".
   Antes de la `0082` ése entraba.
4. **El plan que no llega a la fecha (Lourdes Bobba).** Abrir un martes
   del 20/10 en adelante y elegirla, sin apretar nada: "Su plan FE FLOW
   vence el 14/10, antes de esta fecha", no "no tiene plan".
5. **El portal, con una clienta de plan por empezar.** Ninguna de las
   cuentas de prueba tiene uno: hace falta un alta con un plan que arranque
   más adelante y acceso con un mail de Matías. Reservar el segundo martes
   de su plan, no el primero: la hoja lista las fechas desde ése, sin el
   primero, y "Hacerlo fijo" deja la fila en `fixed_slots` y las reservas.
   Inicio no tiene que ofrecer el martes que salteó.
6. **Volver atrás los datos**: liberar los turnos de prueba desde la
   Agenda y cancelar o borrar las reservas creadas.

### ✅ Promociones y cupones (23/09) — `0079` y `0080`

Lo pidió el estudio: "poder crear descuentos: por ejemplo los diez
primeros días del mes tanto por ciento, tal cupón, tantas limitaciones de
uso, y que lo gestione desde admin".

**La decisión que ordena todo: el monto pasa a calcularlo la base.** Antes
lo decidía el navegador —`precioConAjuste` no tenía equivalente en la
base, `payments.amount` no tenía ningún CHECK y `collectPayment` era un
update directo—, y con promociones, cupones y topes de uso eso ya no se
puede hacer cumplir: cualquiera con la consola abierta se cobraba lo que
quisiera. Ahora cobra `cobrar_cuota()`, que resuelve la promo, aplica el
redondeo una sola vez y escribe `precio_lista`, `promocion_id` y
`descuento` junto al monto. Esas tres columnas son nuevas porque
`payments.amount` **se pisa al cobrar**: sin ellas, el precio de lista se
perdía y nadie podía reconstruir de dónde salió la diferencia.

Una promo **reemplaza** al ajuste del medio de pago, no se suma: son dos
motivos distintos para tocar el mismo precio y aplicarlos juntos descuenta
dos veces. Lo decidió Matías el 23/09.

Sin código es **automática** —se aplica sola a quien cumpla—; con código
hay que escribirlo al cobrar, y eso es lo que la hace repartible. Los
topes son dos y distintos: cuántas veces en total y cuántas por clienta.

La `0080` agrega el tipo de aviso `promocion`, que es lo único que la
base necesita para que el anuncio exista. **El envío es un botón, no un
trigger**: un mail a todo el padrón no se deshace, y una promo recién
cargada se corrige dos o tres veces antes de quedar como va. Por eso
también hay un "probar conmigo" que manda uno solo, y por eso sólo se
puede anunciar una promo que ya rige — anunciar un descuento que la base
todavía no aplica es prometer algo que el mostrador va a tener que
desdecir.

**Verificado el 23/09 por el camino de la pantalla**, no por la función:
promo del 20 al 25 de cada mes al 15%, creada desde Configuración, nacida
apagada, encendida a mano. El modal de cobro de una cuota de $85.000
mostró $72.250 antes de elegir medio; al elegir efectivo (−5%) siguió en
$72.250 y lo dijo con todas las letras. La base guardó `amount` 72.250,
`precio_lista` 85.000, `descuento` 12.750 y de qué promo salió. La prueba
del mail volvió 200. Todo revertido después: el pago, sus satélites y la
promo borrados, contando las filas que volvieron.

### ✅ Las reglas se encienden desde el sistema (24/09) — `0081` **corrida y verificada**

Prender el tope de devoluciones obligó a entrar al SQL Editor: la
pantalla avisaba que no regía y no tenía con qué prenderlo.

Lo interesante apareció al ir a hacerlo. El plan —un botón al lado de
cada "Todavía no rige"— habría sido peor que nada: de los seis
parámetros apagados, **cinco no los lee nadie**. `freeze_max_days`,
`waitlist_offer_minutes`, `debt_reminder_days` y los dos de adjuntos de
gastos aparecen sólo en su propia alta y en la lista de la `0024`. Un
botón junto a "Congelamiento máximo" habría dicho que congelar
membresías funciona, y no existe.

Porque `rige` tapaba dos cosas: *el código todavía no lo lee* —un hecho
nuestro— y *el código lo respeta y el estudio decide*. `encendible` marca
las segundas, que son las únicas con interruptor. Prender va en un paso;
apagar en dos, porque deja de aplicarse en el momento y nadie lo ve.

Verificado por la pantalla sobre `recovery_max`, que vale 0 y por eso
prenderla un rato no le cambia nada a nadie: encendida, la base pasó a
`rige = true`; apagada con su confirmación, volvió. Terminó como empezó.

### ✅ Las dos trampas del cobro en el mostrador (25/09) — sin migración

Salieron de auditar el sistema antes del arranque del lunes 28/09, y las
dos tocaban plata.

**El "Cobrar" del panel de la Agenda cobraba suelto.** Abría "Registrar
pago", que inserta un cobro nuevo y no toca ninguna cuota: con la clienta
parada adelante y la cuota del alta pendiente, la plata entraba y la deuda
seguía abierta, con mail de cobranza incluido; cobrarla otra vez era
cobrar dos veces. Con la oferta de renovación era peor, porque el período
lo crea el pago *de esa cuota* (`0041`). Ahora "Cobrar" abre "Cobrar
pago" sobre la deuda más vieja o, si no debe, sobre la oferta; el cobro
suelto queda como "Otro cobro", un link chico para lo que se cobra aparte.
El formulario del cobro suelto, que en Pagos pasó a llamarse "Otro
cobro", avisa si el cliente tiene cuotas abiertas —con monto y
vencimiento— y ofrece "Cobrar esta".

La revisión adversarial del arreglo encontró lo grave: después de
"Renovar" y cobrar la cuota nueva, la oferta vieja seguía viva hasta el
proceso diario y el botón volvía a apuntarle. Cobrarla no crea nada y el
mes se paga dos veces. `ofertaYaResuelta` (`lib/api.ts`) es el mismo
predicado que `renovar_por_pago`, y "Cobrar pago" se niega a cobrar esas
ofertas: la guarda va en el modal porque por ahí pasan todos los caminos,
también la fila de Pagos, que ya tenía el hueco.

**El alta duplicaba.** Terminaba con un cartel y "Crear cliente y
avisarle" activo, tanto al cobrar bien como ante cualquier falla, y la base
no tiene unicidad por DNI ni por mail. Ahora el formulario recuerda lo que
ya creó: el botón nunca vuelve a crear la ficha, sigue con lo que faltó
("Cobrar ahora", "Crear el acceso") o queda "Listo", recién cuando terminó
de verdad. Los datos se traban, nada se cierra mientras guarda, y
`createStudent` avisa con `AltaIncompleta` si la ficha se guardó y lo de
después no. El id de la ficha lo elige el formulario, así que un reintento
tras perder la respuesta choca con la clave primaria en vez de duplicar. Y
"Paga ahora" sin medio elegido ya no cierra como si hubiera cobrado.

Verificado en el navegador con tres altas de prueba, sin mail para que no
se creara acceso ni saliera correo. El cobro se forzó a fallar con un
cupón inexistente, así no se gastó un comprobante ni se tocó la caja
abierta. Reintentar dejó **1 ficha, 1 membresía y 1 cuota** en la base;
destildar "Paga ahora" dejó un solo botón, "Listo"; mientras guardaba, la
X y "Cancelar" estaban apagados. El choque de clave primaria se probó
contra una ficha existente: `23505` sobre `students_pkey`, sin insertar
nada. En la Agenda, "Cobrar" abrió la cuota de $45.000 y, sin deuda, el
botón dijo "Otro cobro". `ofertaYaResuelta` se probó aparte con cinco
casos, sobre el código real. Las tres fichas se borraron; la cascada se
llevó sus membresías, cuotas y avisos. Las pruebas gastaron números de
credencial: después de borrarlas hay que devolver la secuencia con
`select setval('public.member_seq', (select max(member_no) from public.students), true);`.

Queda sin hacer, anotado en §0: la promo limitada a un plan no se aplica a
la renovación (`promociones_para` no encuentra el plan de la oferta).

### ✅ El domingo del portal, el WhatsApp con 549 y blanquear contraseñas (25/09) — sin migración

Tres arreglos más de la auditoría, más un botón y un dato.

**El portal abría el domingo en la semana terminada.** Arrancaba en "esta
semana, hoy" con el domingo recortado al sábado: todo deshabilitado y sin
decir por qué, justo el domingo 27/09 en que la tanda de la apertura entra
a reservar. Ahora abre en el primer día, de hoy al sábado de la semana que
viene, en que ella puede reservar alguna clase que todavía no empezó
—mirando su plan y las suspensiones—, y si no hay, en el primero con
clases por delante. La semana quedó como fecha y no como desplazamiento:
con un desplazamiento, el portal abierto del domingo al lunes saltaba una
semana de más.

**Los links de WhatsApp iban a Serbia.** Sacaban lo que no era dígito y
nada más, y un 381… de diez dígitos es +381. `numeroDeWhatsApp`
(`lib/utils.ts`) completa el 54 y el 9, saca el 0 y el 15, respeta el
código de otro país sólo si viene con + o 00, y devuelve null si no queda
una característica argentina real: sin número posible no hay botón. Lo
usan Pagos, el tablero y los nueve botones de la web.

**Blanquear una contraseña no existía.** Una clienta que ya eligió su
clave y no puede usar su mail, o una profesora que se la olvidó, quedaban
afuera hasta que alguien entrara a Supabase. En la ficha, si el reenvío
dice que ya eligió su clave, aparece "Blanquear la contraseña": vuelve a
ser su documento, con el cambio obligatorio, y deja una línea en la
bitácora —antes de tocar la clave: si la base no la deja escribir, no se
blanquea—. Al staff lo blanquea el admin desde Usuarios con una clave
temporal. La revisión adversarial encontró lo delicado: la primera versión
también movía el **mail de ingreso** de la cuenta al de la ficha, y con eso
alguien que llamara "cambié de mail" se quedaba con la cuenta. Blanquear
ya no toca el mail. Tampoco blanquea cuentas dadas de baja ni cuentas que
no sean de clienta, aunque una ficha apunte a ellas.

**"Mandar un aviso de prueba".** El push sólo sale del proceso diario, y
hasta hoy no le había tocado ningún aviso a ningún celular suscripto: no
había forma de saber si la clave privada de Vercel era la pareja de la
pública. El botón, en el mismo lugar donde se activan los avisos, le pide
al servidor de producción que firme un aviso para ese dispositivo.

**El link de "Cómo llegar" era de Bing.** La web decía "Ver en Google
Maps" y abría Bing. Quedó una búsqueda de Google Maps del Mercato. El link
que mandó el estudio era de "Cómo llegar" y traía fijo el punto de
partida —la ubicación de quien lo compartió—, así que no se usó tal cual.

Verificado: el portal se probó reproduciendo la regla sobre la grilla real
en cinco momentos (viernes 20:30 → sábado, sábado 14:00 y domingo → lunes
siguiente, martes 07:00 → martes). `numeroDeWhatsApp` pasó 24 casos,
incluidos los que la revisión encontró mal. El blanqueo, en la pantalla
(el 409 hace aparecer el botón y la confirmación se cancela sin tocar la
cuenta, comprobado contra Auth) y en el servidor por sus rechazos: a uno
mismo, clave corta, una clienta por el camino del staff, sin sesión. Un
blanqueo real no se ejerció. El push se probó a mano con las claves de
`.env.local` contra el iPhone de la cuenta de prueba y llegó; el endpoint
de prueba se niega a mandarle a un dispositivo de otra cuenta. Falta
tocarlo en producción, que es lo que prueba la clave de Vercel.

### ✅ Lo que salió de probar cada rol el 27/09 — `0084` **corrida y verificada**

El domingo antes de abrir se ejerció el sistema por flujo, en producción y
con la sesión de cada rol —el admin haciendo de mostrador, una clienta, la
profesora Ivana y la dueña—, comprobando cada paso contra la base. Lo que
tocaba plata anduvo: el alta con cobro, el Cobrar de la Agenda, el tope de
devoluciones, el arqueo con faltante, la promoción (la pantalla dijo
$63.000 y la base asentó $63.000 con su descuento y su comprobante) y el
cambio de precio, que llega a la web pública. Lo que salió, arreglado acá:

**Cancelar desde Reservas era un toque.** Sin confirmar y sin decir que la
clase se iba a perder: el "perdió la clase" aparecía recién después. Ahora
la cruz abre un cartel en la página —no nativo: el navegador de Instagram
los descarta— que dice qué le pasa a esa clase, con la misma cuenta que usa
la base (`consecuenciaDeCancelar`, compartida con el portal).

**La plata en los avisos salía en formato inglés** ("$42,750") y el cierre
de caja decía "-1000.00". La `0084` agrega `pesos(numeric)`, que no depende
del locale de la base, y la usan los cuatro textos que llevan montos.

**"Quedaste anotada" y otros textos en femenino para todos.** La misma
`0084` los pasa a neutro en la base ("Tu lugar quedó reservado en…",
"Cambió quién da tu clase"), y en la pantalla se cambiaron los que se ven:
la web pública decía "8 alumnas por clase" y ahora "8 lugares por clase".
La regla: un texto sobre una persona no tiene género; sobre los clientes en
grupo, "cliente", que es la palabra que eligió el estudio el 09/09.

**El domingo.** La Agenda del staff abría en la semana terminada, como le
pasaba al portal hasta el 25/09. Y a quien cobra por hora se le podían
cargar horas en domingo, que la liquidación paga sin mirar el día: ahora no
se puede guardar, y una clase especial con fecha en domingo tampoco.

**La caja abierta varios días.** El cierre describía mal el "saldo al
abrir", y el proceso diario mandaba todos los días "el arqueo va a juntar
la plata de todos esos días". La caja se abre y se cierra cuando la dueña
quiere: el cierre ahora dice qué período cubre ("Turno del mié 23/09 10:58
a hoy 13:48") con la misma cuenta que `cerrar_caja`, y el recordatorio
diario se sacó.

**El portal nombraba el WhatsApp y no daba cómo llegar.** "Escribinos por
WhatsApp" y "pedí el link de pago por WhatsApp" eran texto suelto. Ahora
son links con el mensaje escrito —nombre, credencial y, en la deuda, plan y
monto—, con el número de `studio_whatsapp`. Si el parámetro está vacío no
se inventa uno: queda "consultá en recepción". **Hoy está vacío** (se vació
el 25/09 desde la cuenta admin), así que el link aparece cuando se cargue.

**Fechas en crudo** ("2026-10-22") en la ficha, en Reservas y en Pagos.

**El formulario de planes y el del alta se rompían en el celular.** La
grilla es de una columna en pantallas chicas y el primer campo pedía
`col-span-2`: eso crea una segunda columna implícita y todo lo que sigue se
acomoda en dos, la primera de ancho cero. La dueña no veía el precio desde
el teléfono. Ahora es `sm:col-span-2`.

Verificado en producción, con cada sesión: el aislamiento de la clienta y
de la profesora (la profesora lee cero filas de plata; ve sólo las reservas
de sus clases; desmarcar le da 403; marcar una reserva de otra clase o
borrar una reserva no toca ninguna fila), las reservas y cancelaciones del
portal con el tope, el fijo, los pagos, el perfil y la campana. Lo de este
bloque se verificó por `tsc`, `next build` y la `0084` en un Postgres
local con el locale que se equivoca como producción; en pantalla falta
verlo cuando se despliegue. Quedó anotado y no se tocó: la profesora lee
las fichas de todas las clientas (decisión del 27/09: queda así por
ahora), y un "ausente" mal puesto no se puede volver a "sin marcar" desde
ninguna pantalla.

### ✅ Las vistas no se escriben (27/09) — `0088` **corrida y verificada**

Lo encontró la revisión adversarial de la `0087` y se confirmó en
producción el mismo día: con la llave pública —la que viaja en el
navegador de cualquiera que abra la web— y sin sesión, un `PATCH` sobre
`public_plans` o `public_studio_settings` volvía 200. Se probó con un id
que no existe, así que no tocó nada; con uno real habría cambiado el
precio de un plan o un dato del estudio, y por `public_payment_discounts`
el ajuste con que se cobra cada medio de pago.

Por qué: son vistas simples, que Postgres deja escribir pasando la
escritura a la tabla; no tienen `security_invoker`, así que corren como su
dueño y la RLS no se mira; y Supabase les da a `anon` y `authenticated`
todos los privilegios por defecto. Estaba abierto desde la `0003`.

El sistema no escribe nunca sobre una vista (se revisó todo `app/`, `lib/`
y `components/`), así que la `0088` les saca la escritura **a todas las
del esquema**, sin tocar quién las lee: un `grant select` parejo le habría
dado lectura a `anon` sobre vistas que la `0073` cerró. No hay rastros de
que se haya usado: precios, ajustes y datos del estudio están como el
estudio los dejó, y las filas de `studio_settings` sin autor coinciden con
las corridas de migraciones.

Verificado en un Postgres local: antes, `anon` escribía por la vista aunque
la tabla tuviera RLS; después, `anon` y `authenticated` reciben
"permission denied for view", `anon` sigue leyendo `public_plans` y sigue
sin leer `account_ledger`, corre dos veces y la comprobación final corta si
queda una vista abierta. Falta correrla y repetir el `PATCH` desde afuera.

**Lección para las próximas vistas**: toda vista nueva en `public` nace
escribible para el navegador. O se crea con `security_invoker`, o se le
deja sólo `select`.

### ✅ Los planes y los parámetros los cambia el admin (27/09) — `0087` **corrida**, falta probarla con una cuenta de recepción

Decisión de Matías del 27/09: **recepción deja de crear, modificar y dar de
baja planes, y de cambiar los parámetros del negocio** —plazos, ventanas de
pago, avisos, los datos del estudio y prender o apagar una regla—. Son
`planes.crear`, `planes.editar`, `planes.eliminar` y `config.editar`.
Destildarlas en la matriz no hacía nada: los grupos `Planes` y
`Configuración` estaban en sombra, y en sombra `can()` responde el legado.
La `0087` borra esas cuatro filas de recepción y **enciende los dos
grupos**. Recepción sigue viendo planes y parámetros, entrando a
Configuración y cobrando.

**Lo que encontró la revisión: las vistas públicas se podían escribir.**
`public_plans`, `public_studio_settings`, `public_disciplines` y
`public_payment_discounts` son vistas simples sin `security_invoker`, con
todos los privilegios por defecto para `anon` y `authenticated`. Postgres
deja escribirlas solas, y la escritura toca la tabla con los permisos del
dueño, sin RLS. O sea que **con la llave pública y sin sesión** se podía
cambiar el precio de un plan, crear o borrar planes, reescribir los datos
del estudio, prender `portal_autoregistro` o mover el `ajuste_pct` con que
`cobrar_cuota` cobra. Venía de antes de esta migración, pero sin cerrarlo
apagar las claves no frenaba a nadie. La `0087` les deja **sólo SELECT**,
explícito, a las cinco `public_*` (la de horarios también, aunque con su
join no se pueda escribir). La landing sigue leyendo igual. No se vuelve
atrás con la vuelta atrás de las claves.

Encender cambia sólo lo pedido porque **la migración lo comprueba adentro**
en vez de suponerlo: compara matriz contra legado en cada clave en sombra
de los dos grupos y rol por rol, mira las excepciones por persona (que
encendidas pasan a regir), verifica que cada clave esté en el grupo por el
que se la enciende, que toda política permisiva de escritura de `plans` y
`studio_settings` sea **exactamente** su `can()` —una con la clave y un
`or` al costado también corta— y que ninguna función `SECURITY DEFINER`
abierta escriba esas tablas salvo `editar_disciplina`. Al final compara la
tabla entera de la decisión y corta si queda alguna vista escribible sin
`security_invoker` sobre `plans` o `studio_settings`, directa o a través de
otra vista. `config.ver` y `planes.ver` quedan para los cuatro roles. La
vuelta atrás va **por clave y no por grupo**: `promos.administrar` es de
Planes, rige desde la `0079` con legado vacío, y devolver el grupo entero a
sombra la dejaba sin nadie, ni el admin. El freno de mano
(`modo = 'emergencia'`) le devuelve a recepción las cuatro claves, no la
escritura por las vistas.

En la pantalla, Planes y Configuración preguntan por la clave con
`permisosReady ? can(...) : canWrite` —no `can(...) || canWrite`, que para
recepción da siempre sí— y dicen en una línea que son de sólo lectura. La
papelera de un plan pide `planes.editar` **y** `planes.eliminar`, porque la
base pide las dos para una baja. Guardar un plan, darlo de baja o guardar
parámetros ahora mira cuántas filas tocó: una pestaña abierta desde antes
de correr la migración mostraba "Guardado" sin guardar. Y tres textos que
le pedían a quien los leyera crear o reactivar un plan —la ventana de
asignar plan y los dos avisos de renovación omitida— ya no lo piden:
reactivar un plan dado de baja no existe en ninguna pantalla.

**Verificado** en un Postgres local con las 84 migraciones del repo y los
privilegios por defecto de Supabase, no contra Supabase: antes de la
`0087` los cinco roles, `anon` incluido, escribían por las vistas; después
todos rebotan con `42501` y siguen leyendo lo mismo. Con una sesión por
rol, lo único que cambia en todo `mis_permisos()` son esas cuatro claves de
recepción, y recepción pasa a rebotar en insertar (42501), modificar, dar
de baja y borrar planes, y en cambiar valores, vigencias, datos del estudio
e insertar o borrar parámetros (cero filas); el admin, todo como antes.
Corre dos veces; corta sin dejar nada en 19 casos armados a propósito
(matriz distinta del legado, excepción que cambiaría algo, grupo
renombrado, política vieja, `FOR ALL`, la clave con un `or`, un `WITH
CHECK` abierto, una función definer nueva, otra vista escribible sobre
`plans` o sobre `public_plans`, sin el motor) y pasa en los que no cambian
nada; la vuelta atrás deja `mis_permisos()` idéntico al de antes y
`perm_diff()` en cero. **Falta** correrla, mirar la landing sin sesión, y
cuando exista la primera cuenta de recepción, entrar con ella: el paso a
paso está al final de la migración.

### 🟡 Anular un cobro no borra la deuda (27/09) — `0083` **corrida**, falta ejercerla en pantalla

Salió de la auditoría del 25/09 (T26). **Anular desde Pagos tachaba el
cobro y ahí terminaba**: la cuota no volvía a abrirse, la membresía seguía
sin deuda en todas las pantallas y el proceso diario no la reclamaba
nunca. El caso que va a pasar la primera semana —cobrar con el medio
equivocado y anular para corregir— dejaba el mes cobrado sin plata
adentro. Con una renovación, el período que creó el cobro quedaba vivo y
sin nada que lo cobre.

**Qué cambia.** Anular pregunta qué queda después, y lo hace la base
(`anular_cobro()`):

- **Vuelve a deber**: una cuota pendiente *gemela* del mismo período, al
  precio de lista —lo cobrado ya traía el −5% o el +25%, y cobrarlo otra
  vez lo aplicaba dos veces—, con la promo con que se había cobrado y el
  vencimiento de siempre, nunca antes de hoy. Es lo que viene elegido en
  una cuota.
- **No queda debiendo**: se tacha, como hasta hoy.
- **Deshacer la renovación**, sólo en el cobro de una oferta: borra el
  período que creó —si no tiene clases usadas, reservas ni otras cuotas, y
  con el permiso de eliminar membresías— y le devuelve la oferta si todavía
  está en fecha. En una renovación **no viene nada elegido**: cada salida
  deja algo distinto y la elige quien sabe qué pasó.

La base no reabre, aunque se pida, lo que no tiene deuda que reabrir: un
**"Otro cobro"** (desde ahora `payments.origen = 'suelto'`; los que ya
había se deducen), un cobro sin período, un período cancelado, uno que
sigue pago con otra cuota, o uno que ya tiene su cuota pendiente. Y lo
dice. Para lo que sí se reabrió y no correspondía hay **"No correspondía:
deshacerla"** en la misma pantalla, y **cualquier cuota pendiente que no
sea oferta se puede anular** desde su fila (`anular_cuota()`), sin
cancelar el período. Sirve también para las cuotas de la clase de prueba
de antes del 16/09. Quién anuló queda en `payment_staff`.

De yapa, porque es la misma función: `promociones_para` busca el plan de
la oferta de renovación por la membresía que renueva, así que **una promo
limitada a un plan ya alcanza a la renovación**, que era la fila de la §0.

**La revisión adversarial** del primer borrador encontró lo que cambió el
diseño: con el tilde prendido de entrada, anular una remera inventaba una
deuda de "Remera" con mail y promo automática; el control de duplicados
comparaba conceptos dentro de una membresía que el "Otro cobro" no respeta
(se cuelga de la que cubre hoy); en una renovación convertía una oferta en
una deuda más un período no aceptado; la gemela perdía la promo si se
anulaba fuera de su ventana; y una gemela equivocada no tenía cómo
deshacerse. Todo eso es lo de arriba. Lo que quedó para Mercado Pago —el
link viejo de un cobro anulado sigue cobrable y la plata no se asienta—
está en [`MERCADO-PAGO.md`](MERCADO-PAGO.md), huecos C y E.

**Verificado** en un Postgres local con los disparadores reales de la
`0016`, `0020` y `0041` y las funciones de la `0079`, no contra Supabase:
la migración corre dos veces seguidas, y sin la `0079` corta en la guarda
sin dejar nada. Veinte casos, entre ellos: tarjeta → gemela de $70.000 y
cobrarla en efectivo da $66.500; el cobro suelto y el cobro sin período no
reabren; con una suelta del mismo nombre al lado, la cuota sí reabre; la
cuota de antes de la `0079` reabre al precio del período y no a lo
cobrado; la promo apagada y fuera de ventana se respeta en la gemela
($56.000) y no se le ofrece a una pendiente común; deshacer la renovación
frena con una reserva, con una clase usada y sin permiso —y en los tres el
cobro sigue `pagado`—, y cuando pasa, deja una sola membresía, la oferta
devuelta con el vencimiento original, `renovacion_control()` en cero y la
oferta cobrable otra vez. El relleno de `origen` se probó sobre filas
fabricadas antes de correrla. **Falta** correrla y ejercerla con la sesión
de recepción, por la pantalla. El paso a paso:

1. **Antes de tocar nada**, en el SQL Editor: `select * from
   public.renovacion_control();` y `select * from public.perm_diff();` en
   cero. Correr la `0083` entera. Después:
   `select origen, status, count(*) from public.payments group by 1, 2;`
   — con los datos del 27/09 tienen que salir todas `cuota` (hoy no hay
   ningún "Otro cobro"). Y las dos funciones rechazan sin sesión:
   `select * from public.anular_cobro((select id from public.payments where status='pagado' limit 1), 'x', 'nada');`
   → *No tenés permiso para anular cobros*.
2. **Una clienta de prueba nueva** desde el alta, sin mail (así no se crea
   acceso ni sale correo), con FE FLOW desde hoy y **"Paga ahora" en
   tarjeta**: $87.500. En Pagos, anular ese cobro: tiene que venir elegido
   "Vuelve a deber la cuota" y decir $70.000. Anular. La pantalla dice
   *Vuelve a deber $70.000, con vencimiento el …*. En la base:
   `select status, amount, precio_lista, due_date, origen, reabre_pago_id is not null as reabre, notes from public.payments where student_id = '<id>' order by created_at;`
   → la anulada (87.500, lista 70.000) y la pendiente (70.000, `reabre`
   true, vencimiento = inicio + `payment_grace_days`). Y
   `select anulado_por, anulado_at from public.payment_staff where payment_id = '<el cobro>';`
   con el uuid de recepción.
3. **Cobrar la gemela en efectivo** desde su fila: $66.500, y en la base
   `precio_lista` 70.000 y `descuento` 3.500.
4. **Anular ese cobro otra vez, y "No correspondía: deshacerla"** en la
   pantalla de resultado: la pendiente nueva queda `anulado` con la nota
   *Anulada: No correspondía reabrirla…*, y la ficha no muestra deuda.
5. **"Otro cobro"** a la misma clienta por una remera de $15.000: en la base
   `origen = 'suelto'`. Anularlo: el modal no ofrece elegir y dice que no
   queda nada pendiente; en la base, ninguna fila nueva.
6. **La renovación.** A la clienta de prueba, emitirle la oferta a mano
   como en la `0041` (su bloque CÓMO VERIFICAR, paso 1, filtrando por su
   nombre) y cobrarla desde Pagos. Anular ese cobro: no tiene que venir
   nada elegido. Elegir "Deshacer la renovación". En la base: una sola
   membresía de ella, el cobro `anulado` con `membership_id` nulo y la nota
   *Se deshizo la renovación…*, una oferta pendiente nueva con
   `due_date` = fin del período + 1 y `reabre_pago_id` apuntando al cobro,
   y `select * from public.renovacion_control();` en cero.
7. **La promo**, si se quiere ejercer: en Configuración, una "Prueba 0083"
   del 20% para los días de hoy, encendida; cobrar una cuota ($56.000);
   cambiarle la ventana a otros días y apagarla; anular con "vuelve a
   deber". La pendiente tiene `promocion_id`, "Cobrar" muestra la promo con
   *Es la del cobro que se anuló* y cobra $56.000. Ese último cobro,
   anularlo con "No queda debiendo" para que no quede plata de prueba en
   la caja.
8. **Limpiar**: borrar la clienta de prueba (la cascada se lleva
   membresías, cuotas, sellos y avisos), después la promo de prueba desde
   el SQL Editor (`delete from public.promociones where nombre = 'Prueba 0083';`),
   y devolver la secuencia de credenciales como el 25/09 (los números de
   comprobante gastados no vuelven). `caja_control()`
   va a listar el arqueo como desactualizado sólo si la caja del día ya
   estaba cerrada cuando se anuló.

### ✅ La promo respeta el recargo de la tarjeta (27/09) — `0086` **corrida y verificada**

Visto en producción el 27/09: FE FLOW de $70.000 con una promo automática
del 10% cobraba **$63.000 con tarjeta**, igual que en efectivo, cuando sin
promo con tarjeta son $87.500. La regla de la `0079` ("la promo reemplaza
al ajuste del medio") se comía el recargo, que existe para pagar la
comisión. Decisión de Matías: **que respete el recargo**.

> **Orden: primero el deploy, después la `0086`.** La pantalla de antes
> anticipa la regla vieja sin preguntar: con la `0086` corrida mostraría
> $63.000 con tarjeta y la base cobraría $78.750, y con tarjeta lo que dice
> la pantalla es lo que se marca en el posnet. La pantalla nueva anda con
> las dos bases. Mergear, esperar el deploy de Vercel, **recargar las
> pestañas abiertas del mostrador** y recién ahí correrla.

**La regla nueva**, en la base (`cobrar_cuota` hace la cuenta con
`precio_de_cobro()`, una función pura):

- **Recargo del medio**: va encima del precio con la promo. $70.000 →
  $63.000 → **$78.750**. Con monto fijo igual: $65.000 → $81.250.
- **Descuento del medio**: no se suman, queda el mayor. Con el 20% en
  efectivo sigue siendo $56.000, como decidió el estudio el 23/09.
- **Se corrigió un caso que la `0079` cobraba mal**: una promo más chica
  que el efectivo (3% contra −5%) cobraba $67.900, **más** que los $66.500
  sin promo, y encima gastaba el uso. Ahora cobra $66.500 y la promo no se
  aplica ni gasta el uso. En el empate (5% contra −5%) también gana el medio.
- **Un cupón que no gana no tapa a la automática**: con un cupón del 3%
  escrito y una automática del 10%, en efectivo se aplica la del 10%
  ($63.000) y el cupón queda sin usar. Antes, escribir el cupón salía más
  caro que no escribirlo. Si el cupón gana, sigue siendo el que se aplica.
- **La promo que no ganó queda anotada** (`payments.promocion_ofrecida_id`,
  que no cuenta como uso) y `anular_cobro` se la pasa a la cuota reabierta.
  Sin eso, la promesa de la `0083` se rompía: cobrado en efectivo con una
  de pago temprano del 5%, anulado para corregir y vuelto a cobrar con
  tarjeta fuera de la ventana, salía $87.500 en vez de $83.150.
- El redondeo, una sola vez y al final, como siempre.

**Qué guarda el cobro.** `precio_lista` igual que antes. `descuento`, con
promo, es **lo que descontó la promo** (7.000 en el ejemplo, en cualquier
medio); sin promo, lo que hizo el medio, como hasta hoy. El recargo que va
encima de una promo se lee como `amount − (precio_lista − descuento)`
(15.750). No tiene columna propia: habría que rellenar hacia atrás cobros
de arqueos cerrados, y ninguno de los viejos combina promo con recargo.

**La pantalla.** El "Cobrar" (el de Pagos, el de la Agenda y el de "Otro
cobro" cuando salda una cuota) muestra la promo y el recargo en dos
recuadros que suman el total, y nombra la promo o el cupón que no se
aplica. La cuenta y la elección salieron a `lib/precios.ts` y se hacen en
enteros, como `numeric`: la de coma flotante daba distinto que la base en
25 de las 15.708 combinaciones probadas. De paso, la pantalla ahora
redondea también sin ajuste, como la base. **Para saber qué regla
anticipar** le pregunta a `regla_del_cobro()`, que la deduce del cuerpo de
`cobrar_cuota`: sin la `0086` anticipa la de la `0079`, y si alguien vuelve
`cobrar_cuota` a la vieja, también. Si no puede preguntar, dice "A
confirmar" en vez de un número. El alta con "Paga ahora" no anticipa el
monto (nunca lo hizo) y avisa si el cupón no se usó. Configuración →
Promociones dice la regla que rige (y nada mientras pregunta). El anuncio
por mail y campana agrega, con la regla nueva, que con efectivo no se suman
y se aplica el mayor.

**La guarda** compara el código entero de `cobrar_cuota` y `anular_cobro`
(md5 sin comentarios ni espacios) contra el de la `0079`/`0083` y el de
esta: si alguien las tocó después, corta. El SQL para mirarlo antes, sólo
lectura, está en su punto 0.

**Verificado** en un Postgres local con los archivos enteros de la `0079`
y la `0083` y los disparadores reales del cobro (`0016`, `0020`, `0041`,
`0084`), no contra Supabase. Por `cobrar_cuota`, antes y después de la
`0086`: sin promo en los tres medios ($66.500 / $87.500 / $70.000,
iguales), 10% ($63.000 / **$78.750** / $63.000), 3% en efectivo ($67.900
→ **$66.500**, sin promo), $5.000 con tarjeta ($81.250), el 20% en
efectivo ($56.000), 71.230 con los tres redondeos, un cupón de un uso que
en efectivo no se gasta y con tarjeta sí, cupón 3% + automática 10%
($67.900 → $63.000 en efectivo), y una renovación cobrada con promo y
tarjeta (la membresía nace con $78.750). Anular para corregir con la de
pago temprano al 5%, al 3% y con cupón: la cuota reabierta hereda la promo
y con tarjeta cobra $83.150 / $84.900 / $84.900. La pantalla contra la
base: las 15.708 combinaciones de `precio_de_cobro` y los cobros hechos en
las tres bases (antes, después, y con la `cobrar_cuota` de la `0079` vuelta
a pegar) dan igual, centavo por centavo y con la misma promo elegida. La
`0086` corre dos veces seguidas; corta sin la `0079`, sin la `0083`, sobre
una `cobrar_cuota` o una `anular_cobro` tocadas después (también fuera de
las líneas que cambia) y sobre un arreglo posterior que siga usando
`precio_de_cobro`; pasa si sólo cambió un comentario. La vuelta atrás de
su final deja la `0079` y la `0083` como estaban y la `0086` vuelve a
correr. **Falta** correrla y ejercerla por la pantalla con la sesión de
recepción: el paso a paso está en el CÓMO VERIFICAR de la migración, y va
con un cupón para no tocar los cobros de verdad.

### ✅ Lo que pidió el estudio al abrir (29/09) — `0089` **corrida y verificada**

Tres pedidos de la dueña del primer día:

**"Ingresar" en la web.** Estaba escondido desde el 16/09, para no ofrecer
la puerta a un sistema que todavía no se usaba. Volvió el botón de la barra
y el "Acceso al sistema" del pie.

**El ícono de WhatsApp.** Un botón redondo fijo en la esquina, en la web y
en el portal (arriba de la barra de pestañas). Usa el mismo número y la
misma normalización que los demás botones, y sin número cargado no aparece.
El logo es el de Simple Icons, CC0.

**A dónde transferir.** Los campos de alias y CBU existían desde la `0020`
y no los veía nadie más que el staff. El estudio tiene dos cuentas, Galicia
(`casafe.galicia`) y BBVA (`casafe.bbva`), y cada medio de pago deposita en
una cuenta fija, así que Matías eligió dos medios: la `0089` renombra la
"Cuenta bancaria" a Banco Galicia (conserva su id y sus cobros), agrega
Banco BBVA, renombra "Transferencia" a "Transferencia Galicia" (el código
sigue siendo `transferencia`) y agrega "Transferencia BBVA". Y crea la vista
`cuentas_para_transferir`: nombre, banco, titular, alias y CBU de las
cuentas de banco y billetera que tengan alguno de los dos cargado. Sin
`security_invoker` a propósito —la clienta no lee `accounts`, que tiene
saldos— y sólo `select`, sólo para `authenticated` (la lección de la
`0088`). El portal la muestra, con botón de copiar, donde decía "pedí el
link de pago", y los mails de cuota del proceso diario suman el bloque "También
podés pagar por transferencia". En Configuración → Cuentas un aviso dice
que ese dato sale para afuera. Con cuatro medios, el cobro los pone de a dos
por fila en el celular.

Verificado: `tsc` y `next build`; la `0089` en un Postgres local (dos
corridas, la vista con las dos cuentas, los dos medios con su cuenta,
`authenticated` lee y no escribe, `anon` no lee, la tabla sigue cerrada).
Falta correrla y verlo en pantalla. Queda aparte lo que pidió como
"asistencia personal": se le preguntó qué quiere decir.

### ✅ Un cambio de plan antes de arrancar, a mano (30/09) — arreglo de datos, sin migración

Patricia Prieto quería otro plan antes de empezar. La ficha tenía dos FE
START: una del 05/11 al 04/12, cargada con la fecha mal y ya cancelada
("Eligio mal el plan"), y otra del 30/09 al 29/10. El estudio pidió
borrarle todo y asignarle de cero un FE START desde el 08/10, para que ella
elija su horario fijo desde el portal.

La pantalla no alcanzaba. El mostrador le había dado el fijo del jueves
19:00 cuando su único plan era el de noviembre, así que las cuatro reservas
(05, 12, 19 y 26/11) salieron contra ese plan. Al cancelarlo, **las reservas y
el fijo siguieron vivos**: ocupaban cupo real en esa clase, y el fijo le
llenaba el tope de 1 por semana al plan siguiente. "Deshacer" la rechazaba
por las reservas.

Se hizo con un script en el SQL Editor, con guardas por id y por conteo:
borra las 4 reservas, las 2 cuotas (una anulada y otra pendiente, ninguna
cobrada) y las 2 membresías, y libera el fijo (no lo borra, `0048`).
Verificado contra la base: la ficha y el acceso intactos, nada de ella
salvo el fijo `liberado`, y Lucía y Carolina Prieto, que comparten la
clase, sin cambios. El plan nuevo lo asigna la dueña desde la ficha,
**después** del script: con la membresía de octubre viva, el modal encolaba
el nuevo al 30/10.

El defecto de fondo quedó en la §0 de `REQUERIMIENTOS-CASA-FE.md`: cancelar
y deshacer no sueltan las reservas futuras ni el fijo.

### ✅ La liquidación dice por qué no deja cerrar (30/09) — sin migración

La dueña quiso cerrar el período para pagar los primeros días y "no me
deja". La causa: `teacher_pay` estaba vacía, así que las tres daban $0. El
"Cerrar" de cada fila se apagaba en $0 sin explicar nada, y "Cerrar el
período de todos" mostraba "Se cerraron 0.", porque `cerrar_liquidaciones`
(`0055`) saltea los totales en cero sin anotarlos.

- **Cada fila en $0 dice por qué** donde estaba el botón: sin tarifa
  cargada, la tarifa rige desde una fecha posterior al período, tiene
  clases y no tarifa por clase (o horas y no tarifa por hora), no trabajó,
  o da negativo por los ajustes. Si a alguna le falta la tarifa, un
  recuadro abajo de la tabla dice dónde se carga y que el "desde" tiene que
  ser el primer día que se le paga o uno anterior (`tarifa_vigente` no
  cubre los días previos).
- **"Cerrar el período de todos"** mira antes de llamar a la base. Si todas
  dan $0 lo dice y no pregunta. Si cierra algunas, nombra a las que quedaron
  afuera por $0, además de las que ya salteaba la base.
- **La tabla se recalcula sola** al cargar una tarifa, unas horas o un
  ajuste. Antes seguía en $0 hasta que alguien cambiara las fechas: justo el
  primer paso que se le pide a quien la ve en cero.

Además apareció otro problema: con el período 01/09–30/09 la tabla decía
**132 clases** para Giuliana y para Ivana. `sesiones_dictadas` cuenta toda
la grilla no suspendida y no sabe que el estudio abrió el 29/09. Cerrar
septiembre entero les habría pagado un mes de clases que no se dieron. Se
le indicó a la dueña cerrar desde el 29/09 y pagar las horas de
pre-apertura del 28/09 con un ajuste. El parámetro de fecha de inicio quedó
en la §0.

Verificado en local contra la base, con la sesión del admin. El período
29/09–30/09 da 12 clases y 3 horas a Giuliana e Ivana, y 0 a Leandro, las
tres con "Sin tarifa cargada". "Cerrar el período de todos" da el mensaje
nuevo y no crea ninguna liquidación. Una hora de prueba a Leandro cambió su
fila sin tocar las fechas y, borrada, volvió a 0; las 4 horas de septiembre
quedaron como estaban. `tsc` y `next build` pasan. No se ejercieron los
motivos que necesitan una tarifa cargada, porque una tarifa no se borra.

### ✅ La Agenda no pide elegir a quien ya está anotada (05/10) — sin migración

El mostrador reportó: "nos sale seleccionar cliente pero ya está
seleccionado, no podemos reservar". No era un error de datos. Florencia
Lobos ya tenía los cinco martes reservados: darle el horario fijo desde el
panel de la clase la anota en esa fecha. Pero después de anotar a alguien
el selector vuelve a vacío, el recuadro verde con su nombre y un tilde se
leía como "la elegida", y "Reservar lugar" se dejaba apretar y contestaba
"Seleccioná un cliente primero".

- El recuadro verde dice **"Ya está en la clase"** (o "Ya están") arriba de
  los nombres.
- Sin cliente elegido, el botón queda **apagado y dice "Elegí a quién
  anotar"** en vez de "Reservar lugar". Lo mismo "Lista de espera" con la
  clase completa.

Verificado en local contra producción con la sesión del admin y **sin
escribir nada**. En la clase del martes 06/10 a las 17:00, con el selector
vacío el botón dice "Elegí a quién anotar" y está apagado; con una clienta
elegida pasa a "Reservar lugar" con su color, y al vaciarlo vuelve. Florencia
no figura en el selector porque ya tiene lugar. Contra la base no se creó
ninguna reserva durante la prueba. El rótulo verde no se vio en pantalla: sólo
aparece después de anotar a alguien, y eso es una reserva real que le avisa a
la clienta. `tsc` y `next build` pasan.

### 🟡 Productos en consignación (04/10) — `0090` **escrita, sin correr**

Lo pidió el estudio: vende difusores y sprays que deja un proveedor, y de
cada venta el 30% es del estudio y el 70% del proveedor. Hay que saber
cuánto se le debe. Los precios son por medio de pago y los dio el estudio
(Difusor $30.000 / $31.500 / $37.500 en 3 cuotas; Spray $18.500 / $19.500 /
$23.200): **no** salen de los ajustes del medio.

**La plata.** Tabla propia, `ventas_productos`, y una **quinta rama
`'venta'` en `account_ledger`**: la caja entera sale de ese libro, así que
una venta en efectivo suma en "Caja del mostrador", en `saldo_cuenta`, en
`caja_dia`, en el turno y en el esperado del cierre, sin tocar ninguna de
esas funciones. Además suma en `resultado_mensual` y `monthly_revenue`. Se
descartó `payments` (`student_id` NOT NULL, se anularía desde Pagos sin
devolver stock, la clienta lo lee, dispara el aviso de pago) y
`account_movements` (no entra al resultado, su CHECK obligaba a mentir). La
venta guarda la foto del precio, del % y del reparto. El 30% es **sobre lo
cobrado** y configurable por proveedor; la comisión de la tarjeta la
absorbe el estudio. Al rendir, la parte del proveedor sale como **gasto**
en "Rendiciones a proveedores" (el patrón de `pagar_liquidacion`). La plata
sale el día que se registra (`paid_at`), pero la fecha del comprobante del
gasto es la de la **última venta** que cubre: con el resultado
"devengado", rendir el 4/10 lo de septiembre deja el 70% en septiembre y
ese mes queda con el 30%. Con el resultado "por lo pagado", septiembre
muestra el 100% como ingreso y octubre el 70% como egreso: el 30% queda en
el mes sólo si se rinde dentro del mismo mes. Si una rendición junta dos
meses, el costo entero cae en el de la última venta (la hoja lo avisa).
`monthly_revenue` y `resultado_mensual` suman las ventas sólo para quien
tiene `finanzas.ver`, la clave que ya gobernaba esas dos vistas.

**Las tres vistas existentes** se recrean con la huella comparada contra
la versión del repo (si producción no coincide, corta y pide la
definición), con foto antes y después comparada con `except all` en los dos
sentidos —hoy no hay ventas, así que cualquier diferencia aborta— y con
`set local lock_timeout = '5s'` para no colgar la Caja de nadie.

**Lo que hace la pantalla** (Productos, después de Pagos, para quien tiene
`inventario.ver` o `inventario.vender`): arriba las tarjetas para vender con
stock y precios; la venta pide cantidad, **aroma obligatorio** (con los
aromas que carga el admin y los ya vendidos como sugerencia, que se copian
tal cual), medio y, opcional, la ficha o el nombre de quien compra. Ventas
del período con su estado (a rendir, rendida, anulada, todo del estudio);
rendir por proveedor con casillas y "Registrar el pago al proveedor"; pagos
anteriores con "Anular este pago"; productos y precios, cargar mercadería,
devolver al proveedor y ajustar con motivo; movimientos de stock;
proveedores. Ninguna confirmación es un cartel nativo. Reporte "Ventas de
productos" y bloque "Compras de productos" en la pestaña Pagos de la ficha.
La descripción del reporte "Cobros" dejó de decir "Todo lo que entró".

**Lo que protege la base.** Todo se escribe por funciones `security
definer` que piden su clave: `vender_producto` (stock con la fila
bloqueada, idempotente con una llave del navegador que nunca viaja nula, y
la misma llave con otro producto se rechaza), `anular_venta` (sólo
`status`, así que se comporta como anular un cobro en un turno cerrado:
arqueo desactualizado en `caja_control`; no se anula lo ya rendido),
`rendir_proveedor`, `anular_rendicion` (anula el gasto; "rendida" se
calcula del gasto vivo, así que las ventas vuelven solas a pendientes),
`mover_stock`, `guardar_producto` y `guardar_proveedor`. Un disparador
nuevo en `expenses` (`expenses_rendicion_fija`) impide cambiarle el monto o
pasar a pendiente el gasto de una rendición —recepción tiene
`gastos.editar` y el formulario de Gastos reescribe el monto—; para
cualquier otro gasto no hace nada. Las siete tablas con RLS y sólo SELECT
para `authenticated`; la secuencia de `numero` cerrada; las dos vistas
nuevas `security_invoker` y sólo SELECT.

**Permisos.** `inventario.ver` y `inventario.vender` para admin y
recepción; `gestionar`, `anular` y `rendir` sólo admin. Las cinco nacen
en `activo` con el legado igual a la matriz (en modo emergencia el
mostrador sigue vendiendo). `ver_costos` queda `futuro`, sólo cambia su
ayuda. `perm_diff()` no suma filas: se compara contra una foto tomada al
empezar.

**Se siembran** Difusor y Spray con sus cuatro precios ("3 cuotas" =
Tarjeta; las dos transferencias, el mismo), stock 0 y **sin proveedor**: no
se pueden vender hasta que el admin cargue el proveedor y la mercadería.

**Lo que corrigió la revisión** (antes de correrla):

- **El precio cobrado y el registrado podían ser distintos.** La pantalla
  leía la lista al abrirse y la venta tomaba la de ese momento: si el admin
  cambiaba un precio desde otro lado, se le cobraba a quien compra el viejo
  y la base registraba el nuevo (el cajón no cuadraba y el 70% salía de
  plata que no entró). Ahora `vender_producto` recibe el precio que se vio
  (`p_precio_esperado`, un control y no la fuente) y corta si no coincide;
  la hoja relee la lista al abrirse y después de cualquier error.
- **La llave de la venta vivía en la hoja**: con la respuesta perdida,
  cerrar y volver a abrir armaba otra y se podía cobrar dos veces. Ahora la
  llave pendiente de cada producto vive fuera de la hoja hasta que una
  venta se confirma, y un error sin respuesta dice que no se sabe si quedó
  y que volver a tocar "Cobrar" no cobra dos veces.
- **El NIVEL 1 de la vuelta atrás se deshacía con el freno de mano**:
  borraba la matriz, pero en emergencia rige el legado, que la `0090` deja
  igual a la matriz. Ahora vacía también el legado.
- **Sin `finanzas.ver`, "Ingresos" mostraba sólo lo de productos** (las
  ventas también se abren con `caja.ver`): la rama de ventas de
  `monthly_revenue` y `resultado_mensual` pide `finanzas.ver`. La caja no
  lleva ese filtro, porque la lee `cerrar_caja`.
- La ayuda de `inventario.ver` avisa que las ventas también las ve quien
  tiene la caja o la información financiera. El candado de las claves
  `futuro` dice "Todavía no tiene efecto en el sistema" (decía "El módulo
  todavía no existe", falso para `ver_costos`).
- **Pantalla:** el error y lo que falta van en el pie de la hoja, junto a
  los botones (en el teléfono quedaban fuera de la vista y el botón
  parecía muerto); las hojas releen la lista cuando la base dice que no
  ("La lista cambió" ya no es un bucle); el reporte de ventas no se ofrece
  a quien no tiene `inventario.ver` y la ficha no muestra el bloque hasta
  tener respuesta; la tarjeta de Pagos dice "Cobros y ventas de
  productos"; recepción ve lo pendiente de rendir sin casillas; y al admin
  la tarjeta le dice qué falta ("elegir el proveedor y cargar la
  mercadería") con los botones ahí mismo.

Verificado en un Postgres 17 local con `0001`–`0089` y datos previos:

- Sin las previas corta en la guarda con su mensaje y no deja nada (bases
  hasta `0011`, `0019` y `0073`).
- El ensayo con `rollback` no deja nada y el `select` final muestra las
  tres claves en sombra y `modulo = f`; la de verdad, seis claves con cinco
  en `activo`, `perm_diff = 0` y `modulo = t`; la segunda corrida enciende
  0 y no cambia nada. Libro, resultado, ingresos y saldos idénticos antes y
  después; lo que ven admin, recepción, profesora y clienta de esas vistas,
  idéntico (anon da error antes y después).
- Recepción vende en los cuatro medios: Difusor $30.000 en efectivo → $9.000
  / $21.000 a Caja del mostrador; $31.500 por Galicia y por BBVA → $9.450 /
  $22.050 a cada banco; $37.500 con tarjeta → $11.250 / $26.250 a Tarjetas a
  acreditar. Mercado Pago, aroma vacío o en blanco, cantidad 0 o más que el
  stock: rechazados. El reintento con la misma llave devuelve la misma venta.
- Recepción no anula, no rinde, no carga precios, stock ni proveedores, y no
  escribe ninguna tabla directo. Profesora y clienta leen 0 filas y no
  venden. Las vistas nuevas no se escriben ni con sesión; `anon` no lee.
- Dos ventas a la vez de la última unidad: la segunda espera y responde
  "Quedan 0 de Spray".
- La caja: `saldo_cuenta`, `caja_dia`, el libro del turno y `cerrar_caja`
  (ingresos $120.000, esperado $115.000) incluyen las ventas; las filas
  previas del libro, iguales una por una. `resultado_mensual` y
  `monthly_revenue` dan lo mismo.
- Anular una venta de un turno cerrado devuelve el stock, la saca del libro
  y `caja_control` marca "arqueo desactualizado" por $30.000. Lo rendido no
  se anula. Rendir tres ventas creó el gasto por $70.350 (el 70% de
  $100.500) en "Rendiciones a proveedores"; recepción no pudo cambiarle el
  monto ni pasarlo a pendiente desde Gastos, sí las notas; anularlo desde el
  módulo devolvió las ventas a "a rendir" y se volvió a rendir.
- La vuelta atrás de nivel 2 (comentada al pie) corta con ventas cobradas y,
  sin ventas, deja las vistas como la plantilla, `perm_diff = 0` y la `0090`
  se vuelve a aplicar limpia.
- Lo de la revisión, en otra base limpia: con el precio cambiado por el
  admin, cobrar con el viejo corta ("ahora es $33.000") y no graba nada; con
  el nuevo y la misma llave pasa, y repetir la llave con el viejo devuelve
  la venta ya hecha. Una venta llevada al 30/09 y rendida el 4/10: gasto con
  fecha 30/09 y `paid_date` 4/10, septiembre con ingreso $99.000 y
  devengado $69.300. Recepción sin `finanzas.ver`: `monthly_revenue` 0
  filas, `resultado_mensual` 0 (antes de la revisión, $66.000 de puros
  productos). El NIVEL 1 tal cual el pie y después emergencia: recepción no
  vende, el admin no ajusta stock; restituidos matriz y legado vuelve a
  andar, `perm_diff = 0`.
- `tsc --noEmit` y `next build` pasan. La pantalla se miró a 375 px contra
  un Supabase de mentira (sin tocar producción): el admin sin la `0090` ve
  el cartel de que falta; recepción sin la `0090` no ve el ítem; la
  profesora nunca; recepción con la `0090` vende y ve, sin anular ni
  cargar; sin scroll horizontal.

**Falta**: correrla (ensayo con `rollback`, después `commit`), mergear,
que el admin cargue el proveedor real, su % y los aromas, y la mercadería.
La primera venta real se verifica contra la base (`ventas_productos_estado`
y el libro por `origen = 'venta'`). Avisarle al estudio el cambio de
"Ingresos" en Pagos y el tablero, y que conviene rendir mes por mes.

### 🟡 La clase sin nadie anotado no se paga (05/10) — `0091` **escrita, sin correr**

Desde el 01/10 las tres profesoras cobran $10.000 por clase, y `liquidacion()`
contaba como dictada toda clase activa de la grilla que no estuviera
suspendida, hubiera o no alguien anotado. En el estudio, por ahora, se va
sólo si hay alguien: del 01/10 al 03/10 la grilla tiene 28 clases ($280.000)
y hubo reservas sólo el 01/10 (5) y el 03/10 (1). Decisión de Matías: "hacé
lo de la liquidación".

- **Es un parámetro**: `payroll_only_booked_classes`, "Pagar sólo las clases
  con alguien anotado", booleano, **prendido**, `solo_admin`, en un grupo
  nuevo (`personal`, "Personal y liquidación" en Configuración → Reglas del
  negocio). La lista de grupos es cerrada desde la `0020` y se le suma ése.
  Apagado —o sin la fila— se paga toda la grilla, como hasta hoy.
- **Qué arma una clase**: una reserva confirmada, asistió, ausente o
  cancelada fuera de plazo (recuperos y excepciones incluidos). No cuentan
  la lista de espera, el lugar ofrecido, las canceladas en plazo ni las
  suspendidas.
- **`sesiones_dictadas` no se tocó**: la usa `reporte_ocupacion`, y sacarle
  las clases vacías inflaría la ocupación. Función nueva
  `clases_a_pagar(desde, hasta)` —cada clase, sus reservas, si se paga y por
  qué— y `liquidacion()` es la de la `0065` con el `from` de las clases
  cambiado. Reemplazos, horas, mensual y ajustes, igual.
- **Un período se cierra cuando terminó**: con la regla, el número de hoy
  depende de las reservas del momento (antes sólo de la grilla, que no
  cambia en el día). Cerrar a mediodía hasta hoy dejaba afuera las clases de
  la tarde y pagaba reservas que después se cancelan a tiempo, y ese día ya
  no se puede volver a liquidar (`0055`). Mientras rige, un disparador nuevo
  sobre `teacher_settlements` (`guard_liquidacion_terminada`, sólo al
  insertar) rechaza un cierre cuyo "hasta" sea hoy o después, en el día del
  estudio. Es un disparador aparte y no un cambio en `cerrar_liquidacion` /
  `cerrar_liquidaciones`, que son de la familia de la `0054` y la `0055`
  —fuera del registro—: no pisa nada y frena por los dos caminos.
- **Las reservas que caen fuera de la grilla**: `sesiones_dictadas` arma las
  fechas con el día de la semana *actual* de cada clase activa. Si una clase
  se cambia de día o se da de baja, sus fechas viejas desaparecen; con la
  regla, una clase que se dio con gente dejaría de pagarse sin que nadie lo
  vea. `clases_a_pagar` las devuelve aparte (`en_grilla = false`, nunca se
  pagan solas: una reserva vieja que quedó en un día al que la clase ya no
  va también cae ahí) y Personal las muestra; si se dieron, van como
  ajuste. El arreglo de fondo —la historia de la grilla— quedó en la §0.
- **Guarda por huella** (la de la `0086`) sobre `liquidacion` (0065 o 0091),
  `sesiones_dictadas` (0073, se usa sin pisar), `clases_a_pagar` y
  `guard_liquidacion_terminada` (nuevas) y la lista de grupos (0020): si no
  coincide, corta y dice qué consulta de sólo lectura mandar. Hay además un
  **prevuelo** de una sola consulta, que también dice si falta alguna tabla,
  columna o función de las que la `0091` necesita.
- **Se comprueba sola**: saca una foto de `liquidacion()` antes de pisarla
  (01/09–hoy, el mes con dos para adelante y el año) y con el parámetro
  apagado la nueva tiene que dar lo mismo fila por fila; si no, corta. Para
  calcular usa la sesión de una cuenta admin, `set_config(..., true)`. Al
  final muestra un resumen por profesora: grilla, se pagan, sin nadie,
  reservas fuera de la grilla, y los montos pagando toda la grilla y con la
  regla.
- **Lo cerrado no cambia**: ningún `insert` ni `update` sobre
  `teacher_settlements`. Sólo se mueve el "hoy daría" de
  `liquidaciones_cerradas`, que se calcula al leer.
- **Pantalla**: Personal dice la regla que rige (y lo de siempre si la `0091`
  no corrió); la columna Clases agrega "N sin nadie" y "N fuera de la
  grilla"; cada fila tiene "Ver clases" con las que se pagan y las que no,
  por día y con el motivo de la base; la fila en $0 por clases vacías dice
  "Clases sin nadie anotado" y no "Sin trabajo" (y mientras el detalle no
  llegó, o si falló, "Sin clases que se paguen", sin afirmar ninguna de las
  dos). Con la regla y un período que llega hasta hoy, la fila dice "El
  período no terminó", "Cerrar el período de todos" no se ofrece y hay un
  botón "Llevarlo hasta ayer". El detalle se pide de a mil filas (PostgREST
  corta ahí). Los dos `window.confirm` de cerrar pasaron a la página, y
  "Cerrar el período de todos" vuelve a mirar quién da $0 justo antes de
  cerrar. Configuración titula el grupo y el candado dice el motivo de cada
  grupo (antes decía "afloja el control del arqueo" en cualquiera).

Verificado en un Postgres 17 local con `0001`–`0090` y datos armados, sin
tocar producción:

- Del 01/10 al 03/10, prendido: 27 clases, se pagan 8. Cuentan dos
  asistencias, una ausente, una cancelada fuera de plazo, una confirmada, un
  recupero, una excepción y el reemplazo con gente (a Leandro, no a Ivana);
  no cuentan la cancelada en plazo, la "en plazo sin cupo", la lista de
  espera, la ofrecida ni el reemplazo vacío; la suspendida no aparece.
  Ivana $30.000, Leandro $20.000, turno tarde $30.000 (antes $90.000,
  $60.000 y $120.000).
- Apagado, y también sin la fila: la liquidación idéntica a la de antes en
  los cuatro períodos probados. Prendido: horas, por horas, mensual,
  ajustes, ausencias, tardanzas y el total sin las clases, idénticos.
  `reporte_ocupacion` idéntico en los cinco cortes.
- Lo cerrado intacto fila por fila (md5 de cada fila); la de octubre
  cerrada con la regla vieja sigue en $120.000 y "hoy daría" $30.000.
- Corre dos veces; la segunda no pisa el valor que eligió el estudio ni el
  sello de la fila. Corta sin dejar nada sin la `0065`, con la
  `sesiones_dictadas` de la `0051`, con `liquidacion` o `sesiones_dictadas`
  tocadas a mano, con otra lista de grupos, con otra `clases_a_pagar` y sin
  ninguna cuenta admin. La vuelta atrás del pie deja `liquidacion`
  byte por byte como la `0065`, y la `0091` se vuelve a aplicar limpia.
- `anon` no la ejecuta; alumna, profesora y recepción reciben "No tenés
  permiso para ver las remuneraciones". Profesora y recepción leen el
  parámetro y no lo cambian (0 filas); el admin sí.
- Cerrar hasta hoy, o hasta el 31/10, con la regla prendida: rechazado con
  el motivo, por una persona y por "todas" (cerradas 0, el motivo en
  salteadas), y también un `insert` directo sin sesión. Hasta ayer entra;
  apagada la regla, o sin la fila, hasta hoy entra como antes; una cerrada
  hasta hoy con la regla apagada se anula igual después de prenderla.
- Una clase pasada de los jueves a los miércoles: su jueves 01/10 con dos
  asistencias aparece `en_grilla = false`, no se paga, y con la regla
  apagada no aparece. Una dada de baja con una reserva, igual; una dada de
  baja y suspendida ese día, no aparece.
- El orden de `clases_a_pagar` es total: de a mil filas, como la pantalla, y
  con 104 pares de clases a la misma fecha, hora y título, las páginas
  juntas dan las 3.391 filas del año sin repetir ni saltear.
- El prevuelo da `ok` en todo antes y después, y `NO COINCIDE` con la
  definición en cada caso de los de arriba, con la base en sólo lectura. En
  una base hasta la `0080` dice "faltan: studio_settings.encendible" (antes
  daba `ok` en todo y la migración cortaba igual).
- `tsc --noEmit` y `next build` pasan. La tabla de liquidación se renderizó
  con `react-dom/server` en once estados (sin la `0091`, prendida, apagada,
  cargando, con error, hasta hoy, con clases fuera de la grilla) y el botón
  de cerrar todas en tres; **la pantalla entera no se miró en un
  navegador** (el servidor de desarrollo apunta a producción).

**Falta**: mergear y esperar el deploy, correr el prevuelo, correrla y
verificar en producción que del 01/10 al 03/10 queden sólo las clases con
reservas. **No cerrar liquidaciones de octubre antes**: quedarían congeladas
con toda la grilla.

### 🟡 El precio por letra y la parte del estudio sobre el efectivo (06/10) — `0092` **escrita, sin correr**

Llega un proveedor nuevo, **Accesorios Chini**: aros, collares, anillos y
pulseras. Cada pieza trae una **letra** (A..K), que define el precio según el
medio (efectivo / transferencia +10% / tarjeta +30%), y un **código**. Al
vender se elige la letra y se escribe el código, "para tener registrado bien
qué aro vendo". Y sobre la plata: el estudio **confirmó el 06/10 que con los
difusores el 30% es sobre el precio de efectivo** ("Sí, desde ese valor el
30% es del estudio"), y para Chini venía en el pedido ("la comisión
siempre sobre precio de efectivo"). Igual es configurable por proveedor.

- **Una fórmula, dos bases**: `proveedor = base − round(base × % / 100, 2)` y
  `estudio = cobrado − proveedor`. Con base = lo cobrado es exactamente la
  `0090`. La cuenta vive en `reparto_de_venta` (pura, cerrada al navegador),
  y la migración la prueba con los números del estudio antes del `commit`
  (aro A con tarjeta: $20.280 → proveedor $10.920, estudio $9.360; difusor
  con tarjeta: $37.500 → $21.000 / $16.500, antes $26.250 / $11.250).
- **Sobre qué se calcula es del proveedor** (`proveedores.comision_sobre`:
  `efectivo` | `cobrado`), nace en `efectivo` para todos. Nivel 0 de la
  vuelta atrás: ponerle `cobrado` desde la pantalla.
- **La letra es del proveedor**, no del producto: tabla nueva
  `proveedor_letras` (proveedor × letra × medio → precio), RLS, sólo
  `select` para `authenticated` (con `inventario.ver`, `vender` o
  `gestionar`), nada para `anon`; se escribe sólo desde `guardar_proveedor`.
  El producto dice si su precio sale de ahí (`productos.precio_por_letra`) y
  cómo se llama el dato que se escribe al vender (`productos.dato_venta`:
  "Aroma", "Código"). El dato se sigue guardando en `ventas_productos.aroma`
  (el libro de la caja arma su concepto con esa columna: "Venta: Aros ·
  AR-0012", sin la letra; aceptado).
- **La foto de la venta suma** `letra`, `dato_nombre`, `precio_base` y
  `comision_sobre`, y un CHECK nuevo (`venta_reparto_regla`) exige que el
  reparto salga de esa foto. Las ventas viejas quedan con esas columnas en
  null y la vista `ventas_productos_estado` las completa (`'Aroma'`, lo
  cobrado): es exacto, antes de la `0092` siempre fue así. **Las ventas ya
  hechas no se recalculan**, y no hace falta: al 06/10 no había ninguna
  venta en producción (consulta de sólo lectura que corrió Matías; la misma
  está en el pie de la migración, CÓMO VERIFICAR 5).
- **Funciones**: `vender_producto` (10 parámetros, `p_letra` al final; el
  `returns table` suma letra, dato, dato_nombre, precio_base y
  comision_sobre **al final**), `guardar_producto` (10: `p_precio_por_letra`,
  `p_dato_venta`), `guardar_proveedor` (8: `p_comision_sobre`, `p_letras`,
  que cambia sólo lo que viene). Las firmas viejas se borran en la misma
  transacción (una sola por nombre: PostgREST no queda con dos candidatas) y
  las llamadas viejas con argumentos con nombre caen en las nuevas.
  - Venta: letra normalizada (`" c "` → `C`); sin letra, letra que no está
    en la lista, letra en un producto de precio fijo y dato vacío cortan con
    su mensaje; con proveedor sobre el efectivo y sin precio de efectivo,
    corta; si en un medio sale menos que el 70% del efectivo (al proveedor
    le tocaría más de lo cobrado), corta.
  - **Reintento con la misma llave**: devuelve la venta ya hecha, como la
    `0090`, **aunque ahora lleguen otra letra, otro código, otro medio u otra
    cantidad** (una llave, una venta como mucho). Cortar con error —como
    estaba en el primer borrador— invitaba a cobrar dos veces la misma pieza
    después de corregir un código mal escrito, y dejaba trabada la pestaña
    vieja. El comprobante sale de lo que devolvió la base, y si no coincide
    con lo elegido avisa qué quedó registrado y que corregirlo es anular esa
    venta.
  - Guardar un producto de precio fijo sin precio en efectivo, una letra sin
    efectivo, o pasar un proveedor a `efectivo` con productos sin ese precio:
    se rechaza al guardar, no en el mostrador.
- **Siembra**: Accesorios Chini (id fijo `d0…921`, 30%, sobre el efectivo)
  con las 44 letras (11 × 4 medios; las dos transferencias, el mismo
  precio), y Aros, Collares, Anillos y Pulseras (`b0…921`–`924`) por letra,
  pidiendo "Código", stock 0. Si ya hay un proveedor con "Chini" como
  palabra se usa ése; con dos o más, corta. Si ya hay un producto con ese
  nombre, no lo toca y lo informa. Las letras se siembran sólo si Chini no
  tiene ninguna: otra corrida no devuelve lo que el admin borró.
- **Guardas** (todas cortan sin dejar nada): huella de las tres funciones
  (la de la `0090` del repo o la de esta) y ninguna otra sobrecarga, la
  vista de ventas viva (`0090` o `0092`), columnas que usan las funciones,
  medio `efectivo` existente y manual, Chini ambiguo, `proveedor_letras`
  ajena, y **ningún producto activo de precio fijo con precios y sin el de
  efectivo** (con la regla nueva dejaría de venderse sin que nadie lo
  decida). Foto de las ventas y del libro (con control de filas): idénticos
  después. `perm_diff()` sin filas nuevas. Lock de las cuatro tablas de una
  vez, en el orden de la venta, para no trabarse con una venta en curso.
- **Ayuda de los permisos**: `inventario.vender` ("completa el dato…, la
  letra…") e `inventario.gestionar` ("…sobre qué precio se calcula y su lista
  de precios por letra"), sólo si el texto era el de la `0090`. Ninguna
  clave nueva.
- **Pantalla**: el front anda con las dos bases (sabe si corrió leyendo
  `proveedor_letras`: 42P01/PGRST205 = no). Vender un aro: grilla de letras
  con el precio del medio elegido, código obligatorio (sin sugerir códigos
  vendidos; avisa si el código ya se vendió en ese producto), de a una pieza,
  vista previa "para el estudio $9.360 · para Accesorios Chini $10.920 (70%
  del precio de efectivo)". Proveedor: "sobre el precio de efectivo / lo que
  se cobró" con un ejemplo vivo, y la tabla de letras (sólo se desplaza la
  tabla; las dos transferencias se escriben juntas mientras coincidan; viaja
  sólo lo que cambió). Producto: "Un precio por medio de pago / Por letra" y
  el nombre del dato. Ventas, rendir, anular, compras de la ficha y el
  reporte muestran "Letra A · AR-0012" y sobre qué se calculó (del lado del
  proveedor: "70% de $15.600 en efectivo"; la parte del estudio con
  recargo no es "el 30%" de nada en pantalla); el reporte pasa la columna
  "Aroma" a "Detalle" y suma "Letra" y "Base". La regla, las letras y el
  dato **viajan sólo si cambiaron**: guardar un precio o un nombre anda igual
  con las funciones de la `0090`. Si las letras no se pudieron leer, los
  formularios no afirman ninguna regla. "Otra venta" conserva quién compra.

Verificado en un Postgres 17 local con `0001`–`0091`, datos de antes hechos
con las funciones de la `0090` (proveedor al 30%, tres ventas, una rendida) y
sin tocar producción (161 comprobaciones: 104 en una misma base y 57 que
necesitan una base propia cada una):

- Ensayo con `rollback`: nada aplicado. Dos y tres corridas: mismos
  proveedores, letras (44) y productos; la K borrada no vuelve.
- Ventas viejas intactas (montos y reparto), en la vista con `cobrado` /
  `Aroma` / base = precio; el libro idéntico.
- Difusor en efectivo, Galicia, BBVA y tarjeta (admin y recepción): 9.000 /
  10.500 / 10.500 / 16.500 para el estudio, siempre 21.000 al proveedor. Aro A
  con tarjeta: 20.280 → 9.360 / 10.920, letra A, "Código", stock 5 → 4, libro
  "Venta: Aros · AR-0012". Letra " c " con BBVA ×2: C, 44.000 → 16.000 /
  28.000. Con el proveedor en `cobrado`: 11.250 / 26.250 (la `0090`).
- Los errores, cada uno con su mensaje y sin escribir nada: sin letra, letra
  Z, letra en el difusor, código vacío, código de 61, precio esperado viejo
  (con y sin letra), stock que no alcanza, medio a menos del 70% del
  efectivo, misma llave con otro producto. Misma llave con otra letra, otro
  código, otro medio u otra cantidad: devuelve la venta hecha (la A con
  tarjeta por $20.280, el difusor por 1) y no graba otra.
- La llamada del front viejo (9 argumentos con nombre) vende con la regla
  nueva; un reintento de una venta de la `0090` devuelve la misma. Las
  firmas viejas de `guardar_*` (6 y 8 con nombre) no tocan la regla, las
  letras, `precio_por_letra` ni el dato.
- `guardar_proveedor`: agrega "l" como L, borra K, saca la tarjeta de A;
  rechaza "a" y "A" juntas, Mercado Pago, letra sin efectivo, "A B",
  negativos, un `p_letras` que no es objeto y una regla inválida. Pasar a
  `cobrado` acepta una letra sin efectivo; volver a `efectivo` con ella, o
  con un producto sin efectivo, se rechaza.
- Recepción lee las 44 letras y no las escribe (ni por función ni directo).
  Profesora y alumna leen 0; `anon` recibe "permission denied" en la tabla,
  la vista y las cuatro funciones; `reparto_de_venta` ni con sesión.
- Anular un aro devuelve el stock y lo saca del libro; rendir A + C×2 a
  Chini: gasto de $38.920 ("Cobrado $64.280, parte del estudio $25.360");
  anular la rendición las devuelve a "a rendir". `perm_diff()` en 0.
- Cortan sin dejar nada: `vender_producto` con un cambio de código (un
  comentario de más NO corta), otra sobrecarga de `guardar_proveedor`, la
  vista de ventas tocada, dos "chini", Spray sin precio en efectivo,
  `efectivo` no manual. Con un "Chini Accesorios" a mano lo usa; con "Aro"
  a mano no crea Aros y lo dice; "Bochini" no es Chini; un Chini dado de
  baja no recibe nada; sin BBVA manual siembra 33.
- Una sesión que vendió y anuló antes de la `0092` sigue vendiendo (con la
  regla nueva) y anulando después, sin reconectar.
- **Volver a correr la `0090` encima de la `0092` aborta** con "cannot drop
  columns from view" y no deja nada (una sobrecarga por nombre). Es lo que
  se quiere: **no "arreglarlo" borrando la vista**. La vuelta atrás nivel 1
  del pie (corrida tal cual sale del comentario) deja las tres funciones con
  la huella de la `0090`, la vista con `security_invoker`, la llamada de 9
  argumentos vendiendo sobre lo cobrado, **todos los proveedores y el
  default en `cobrado`** y las dos ayudas de vuelta en la de la `0090`
  (`perm_diff()` en 0); guardar un proveedor sin los parámetros nuevos anda;
  y la `0092` se vuelve a correr limpia sin volver a sembrar letras (el
  default vuelve a `efectivo`; los proveedores quedan en `cobrado` hasta que
  se los cambie desde Proveedores).
- El prevuelo largo (aparte, sólo lectura) corre antes y después de la
  `0092`, y marca Spray sin efectivo, dos "Chini" y una vista ajena sobre la
  de ventas.
- `tsc --noEmit` y `next build` pasan. **La pantalla se miró contra
  producción SIN la 0092** (sesión de admin, sólo lectura, 06/10): Productos
  carga, el proveedor CASADEY dice "sobre lo cobrado" y no ofrece letras, el
  Difusor se edita como siempre y la hoja de venta con tarjeta muestra
  $11.250 / $26.250, que es lo que la base vieja registraría. El único error
  es el 404 de `proveedor_letras`, que es justamente cómo la pantalla sabe
  que la 0092 no corrió. **Con la 0092 corrida falta mirarla**.

**Falta**: mergear y esperar el deploy; correr el prevuelo del encabezado
(si lista un producto "sin precio en efectivo", cargárselo antes); correr
la `0092` fuera del horario del mostrador; verificar en pantalla con la
sesión del admin (Proveedores → Chini con su tabla, Aros con la letra) y
con la de recepción (vender sin poder tocar la tabla); y que el estudio
cargue la mercadería de Chini.

### ⏸️ Etapa 4 — Mostrador *(cuando el estudio opere con el sistema)*
- [ ] Inventario y venta de productos (POS) con stock. *(La consignación —sin variantes ni inventario físico— es la `0090`.)*
- [ ] Metas de venta con tablero.
- [ ] Tiquetera (requiere impresora térmica comprada).

### ⏸️ Etapa 5 — Dependen de terceros *(lanzar trámites ya, integrar después)*
- [ ] Gympass (Wellhub) / Totalpass — falta que el estudio firme convenio.
- [ ] Factura electrónica ARCA — falta decisión de la clienta.
- [ ] WhatsApp Business API — cuando el volumen justifique el costo.

## Bloqueado por la clienta (checklist)

- [ ] Cuenta de Mercado Pago del negocio conectada en Configuración.
- [x] **Datos reales cargados** (09/09, migraciones `0033` a `0035`): datos del
      estudio, los seis planes FE con sus precios, las tres profesoras y la
      grilla de 64 clases. **Falta** el WhatsApp, el link de Maps, y el nombre
      completo, teléfono y email de Ivana y de Leandro —sin el mail no se les
      puede crear la cuenta.
- [ ] Decisión sobre factura electrónica (¿desde el sistema o aparte?).
- [ ] Dominio propio elegido (conectar en Vercel).
- [ ] Cambiar la contraseña admin de prueba y pasar la lista del equipo real.
- [x] **El material de diseño llegó y está aplicado** (11/09): manual, dos
      tipografías, tres colores y ocho fotos. **Falta** el logo como archivo
      vectorial —el que se usa salió recortado del PDF— y saber si tiene
      licencia webfont de Bauer Bodoni.
- [ ] Las siete definiciones de
      [`casa-fe-lo-que-falta-preguntar.md`](casa-fe-lo-que-falta-preguntar.md).
      Las dos primeras —el 25% del link de pago y el tope de 3 cuotas— son
      plata que se pierde cada día que pasan sin contestar.

## Pendiente inmediato

> **Lo que falta del producto no está acá**: está en la §0 de
> [`REQUERIMIENTOS-CASA-FE.md`](REQUERIMIENTOS-CASA-FE.md), que es la única lista
> al día. Este bloque es solo la infraestructura —variables de entorno, DNS,
> paneles de terceros— que no se resuelve escribiendo código.

- **Supabase → Authentication → URL Configuration → Redirect URLs**:
  agregar `https://<dominio-de-vercel>/sistema/recuperar` y
  `http://localhost:3000/sistema/recuperar` (sin esto, el enlace de
  "olvidé mi contraseña" cae en la home en vez de la pantalla de reset).
- Vercel → Environment Variables: `RESEND_API_KEY`,
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`,
  `CRON_SECRET` y **`EMAIL_FROM`** ✅ (esta última cargada y verificada el
  17/09). Ojo con el valor: va **sin comillas**. En `.env.local` las lleva
  porque bash necesita que se cite el `<` de `Casa Fe <avisos@…>`, y Next las
  saca al parsear; Vercel guarda el literal y Resend responde 422. Desde el
  17/09 el código las normaliza, así que el mismo valor sirve en los dos
  lados — pero el que está cargado es el correcto.
- Resend ✅ **dominio `casafepilates.com.ar` verificado el 17/09** (región
  `sa-east-1`), y el circuito del mail de acceso ejercido en producción. Lo
  que sigue abierto de acá es lo de abajo, entre paréntesis: usar Resend como
  SMTP de Supabase. Hoy **"olvidé mi contraseña" no pasa por Resend** —usa el
  mailer propio de Supabase, que en el plan gratis manda desde una dirección
  de Supabase, tiene límite de unos pocos por hora y cae en spam seguido—, y
  es el único camino que le queda a una clienta que ya eligió su contraseña y
  la olvidó. El registro de abajo queda como historia:
- Resend en sandbox: sin dominio verificado solo entrega a
  `digitalamenitiessas+1@gmail.com` —con el `+1`, así lo contesta la propia API de Resend al rechazar un envío; el registro decía la dirección sin el sufijo—. Al tener el dominio del estudio:
  Resend → Domains → verificar DNS → `EMAIL_FROM` en Vercel, y los emails
  a las alumnas fluyen solos. (Opcional en ese momento: usar Resend
  también como SMTP de Supabase para los emails de reset, sin límite de
  frecuencia y con la marca del estudio.)

## Estado técnico

| Ítem | Estado |
|---|---|
| Migraciones aplicadas | `0001` a **`0089`** ✅. La **`0089` corrió el 29/09** y se verificó contra la base: la vista `cuentas_para_transferir` devuelve Banco Galicia (`casafe.galicia`) y Banco BBVA (`casafe.bbva`), y los medios quedaron Transferencia Galicia y Transferencia BBVA. **El 27/09 a la tarde corrieron la `0088`, la `0085` y la `0087`, y después del deploy del PR #58 la `0086`**, en ese orden: la `0088` primero porque cerraba un agujero abierto, y la `0086` después del deploy porque con la pantalla vieja el cobro habría anticipado otro número. Verificado en producción: escribir en las vistas `public_*` con la llave pública da 401 y leerlas sigue en 200 (`0088`); el admin no puede marcar ausente una clase del 22/10 y sí una del 25/09 (`0085`); Planes y Configuración rigen con las cuatro claves sólo para admin (`0087`); y una cuota de $70.000 con promo del 10% se cobró $78.750 con tarjeta, por la pantalla y en la base (`0086`). La **`0082`, la `0083` y la `0084` corrieron el 27/09**, en ese orden. Verificado contra la base con la sesión del admin: existen `mi_tope_de_fijos` (0082) y `anular_cuota` (0083, rechaza un id inexistente con "Esa cuota no existe."), los diez cobros tienen `origen = 'cuota'`, y `pesos()` (0084) da "$42.750", "-$1.000", "$1.234,50" y "$0". **La `0084` cortó en el primer intento**, y el chequeo inicial hizo su trabajo: la versión viva de `guard_periodo_liquidacion` no es la de la `0055` del repo —no dice `FM999,999,999`—, así que esa migración se corrió desde otra copia o la función se tocó a mano. Se sacó de la `0084`, que no tenía nada que arreglarle, y la segunda corrida pasó. Ojo que **la `0054` y la `0055` no figuraban en este registro**: la que está en producción no es necesariamente la del repo, y conviene compararla antes de volver a redefinirla. Las `0076` a `0081` corrieron entre el 23 y el 24/09, cada una anotada en su bloque. La **`0075` corrió el 22/09** y se verificó en los tres puntos de su bloque: la vista conserva sus once columnas, sigue siendo `security_invoker` —sin sesión la lectura muere en `permission denied for function can`, que sólo pasa si la política corre como quien pregunta— y el medio sale con su nombre: se cargó un gasto con `method = 'efectivo'` y el libro mostró **Efectivo**. El gasto de prueba se borró. La **`0074` corrió el 22/09** y se verificó ejerciendo lo que venía a habilitar: un medio inventado rebota con `23503` (clave ajena) y no con `23514` (el CHECK viejo), y con la cuenta "Macro" y el medio "Débito" creados desde Configuración se cobraron $70.000 que fueron solos a esa cuenta. Todo revertido. La **`0073` corrió el 22/09** y se verificó de las dos maneras que hacían falta: las seis puertas cerradas con la llave pública, y con sesión de admin los cinco cortes de Ocupación dando los mismos números y el descuento de clases todavía andando (se reservó una clase, `classes_used` pasó de 3 a 4, se borró la reserva y volvió a 3). La **`0072` corrió el 22/09**; el agujero que cierra se reprodujo antes de escribir el arreglo. La **`0071` corrió el 19/09** y se verificó por los tres rechazos, que es lo que importa de esa función. La **`0070` y la `0069` corrieron el 18/09**. La **`0068` a la `0061` corrieron el 17/09**. La **`0060` corrió el 17/09** y se verificó suspendiendo una clase con la profesora logueada: le llegó a la campana sin recargar y siguió sin ver los avisos de staff. La **`0059` corrió el 17/09**; probarla encontró que la pantalla ofrecía deshacer una marca sin permiso. La **`0058` corrió el 16/09** y hubo que corregir el cupo dos veces: la Agenda tenía su propia cuenta y era la que se veía. La **`0057` corrió el 16/09 en el segundo intento** —la primera abortó por un `group_key` inexistente, y la envoltura `begin/commit` no dejó nada a medias—. La **`0056` corrió el 16/09** y se verificó moviendo el descuento a -8 y a 0 con la web abierta: la línea siguió al número y desapareció al apagarlo; el dato quedó restaurado en -5. La **`0053` corrió el 15/09**. La **`0052` corrió el 15/09** y se corrigió una redacción; es idempotente. La **`0051` corrió el 15/09** y se corrigió dos veces sobre la marcha —los nombres en castellano y el día en el corte por clase—; es idempotente, todo `create or replace`. La **`0050` corrió el 15/09**, se corrigió la clave foránea del autor y se volvió a correr; es idempotente a propósito. La **`0048` y la `0049` corrieron el 15/09** y se verificaron ejerciéndolas: el cupo rechazó el noveno turno fijo, un pausado quedó fuera de la liberación automática, y el interruptor encendido liberó exactamente uno. La **`0047` corrió el 15/09** y se verificó moviendo un vencimiento desde Agenda: la base selló quién y cuándo, y las otras once membresías siguieron sin sello pese a tener reservas nuevas. La **`0046` corrió el 15/09** y se verificó ejerciéndola desde el sistema, no consultando el esquema: se anotó un cliente por excepción (quedó con `membership_id` nulo, o sea sin descontar) y se repuso una clase perdida (`classes_used` no se movió). El tope nace en `rige = false` y **se encendió el 15/09** al terminar de verificar. La `0043` **corrió el 11/09 y nadie lo anotó**: se descubrió el mismo día consultando la base, no el documento — `studio_parking` aparece en `public_studio_settings`, y esa vista es una proyección pelada (`select key, value ... where is_public`), así que si la fila está es porque existe. La **`0044` corrió el 11/09** y se verificó igual, contra la vista pública: `studio_address` vuelve con sus dos saltos de línea en el orden que pidió la clienta, `studio_hours` con la línea en blanco que separa los dos bloques, y `public_disciplines` devuelve **dos** filas — Pilates Reformer (10) y Pilates Embarazadas (20), cada una con la bajada textual de su referencia. La **`0045` corrió el 11/09**: `studio_whatsapp` vuelve `5493816249107` —trece dígitos, 54 / 9 / 381 / 6249107— y el link se abrió a mano contra el chat real del estudio, que es lo único de esa migración que la base no puede verificar sola. **La `0090` (04/10) está escrita y sin correr**, y **la `0091` (05/10) también**: va después del deploy y con su prevuelo | **Anotarlo acá cada vez**: entre el 26/08 y el 09/09 el registro quedó en `0009` con 24 migraciones corridas, y eso dejó a ciegas todo un relevamiento |
| Motor de consumo (`0029`) | ✅ **Encendido el 09/09**. `consumo_rige()` da `true`, `cancel_hours = 3`, `consumo_control()` cero descuadres. La base valida la membresía al reservar y descuenta la clase; el navegador ya no descuenta (se desplegó antes, así que no hubo cobro doble). Freno de mano: `update studio_settings set rige = false where key = 'class_consumption'` |
| Datos de prueba | ✅ **Borrados el 09/09** con la `0027`. Queda a mano en el dashboard: borrar `camila.portal@pilatestudio.com` de Authentication → Users, y decidir si `admin@pilatestudio.com` se queda con ese mail (**no borrarlo sin crear otro admin antes**) |
| Deploy | Vercel, auto-deploy desde `main` ✅ · npm (adiós pnpm) · cron diario en `vercel.json` |
| `SUPABASE_SERVICE_ROLE_KEY` | En `.env.local` ✅ · verificar en Vercel |
| VAPID / push | Claves generadas en `.env.local` y **cargadas en Vercel** (11/09, reportado por Matías; sin ellas el push es un no-op silencioso). Desde el 10/09 el push va también **a la clienta**, no solo al mostrador. Se confirma mirando `pushClientas` en el JSON del proceso diario: si crece, están andando |
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
