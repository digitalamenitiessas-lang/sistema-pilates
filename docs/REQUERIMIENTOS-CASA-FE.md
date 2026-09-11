# Casa Fe — qué cubrimos del documento nuevo y cómo arrancamos

> Cruce del PDF **“Requerimientos y ajustes del sistema Casa Fé”** (18 páginas, 17
> secciones + 4 agregados de último momento) contra el código de este repo.
> Fecha del análisis: **05/09/2026**. Detalle ítem por ítem: [`requerimientos-casa-fe-detalle.md`](requerimientos-casa-fe-detalle.md).
> Estado de nuestro trabajo hasta acá: [`PLAN.md`](PLAN.md).

## 1. El titular

El sistema que tenemos cubre **la operación diaria del estudio**: alumnas, agenda,
reservas, membresías y cobros, con landing, portal de la alumna, avisos automáticos
y roles protegidos en la base. Eso está hecho, probado y en línea.

El documento nuevo pide **un ERP del negocio**: además de lo operativo, la plata
(caja diaria, cuentas, gastos, resultado neto), el personal (horas, sueldos,
liquidaciones), el mostrador (inventario y venta de productos), lo comercial
(cupones, beneficios, gift cards, email marketing), la landing autoadministrable
y un módulo de reportes exportables sobre todo lo anterior.

Los números del cruce:

| | Ítems | Qué significa |
|---|---|---|
| 🟢 Cubierto | 16 | Funciona hoy tal como lo pide el documento |
| 🟡 Parcial | 64 | Existe la base, falta una parte concreta |
| 🔴 Nuevo | 98 | No hay nada en el código |
| **Total relevado** | **178** | 16 secciones (la 14-15 se relevó a mano, ver §7) |

**Esfuerzo estimado: 210 a 250 días de desarrollo de una persona** (≈ 10 a 12
meses trabajando solo en esto). La suma cruda de los ítems da 291 días; baja a ese
rango porque varias piezas aparecen repetidas en distintas secciones y se
construyen una sola vez (sedes, permisos, categorías de clienta, instancias de
clase, cupones).

Esto no es una mala noticia, es la información que faltaba para decidir el alcance
de la primera versión. La sección §9 propone cómo cortarlo.

> **Leído desde el 10/09/2026:** ese estimado es contra el ERP completo, y el
> alcance ya se cortó (§7). Con cuatro secciones afuera, **lo que queda por
> construir de lo que se pidió son dos cosas** —Personal y remuneraciones, y los
> días y horarios fijos—, y el sistema se entrega al estudio para que lo use.
> El estado por sección está en **§3.1**.

## 2. Lo que ya está y conviene mostrarle a la clienta

Antes de la lista de faltantes, esto del documento **ya funciona hoy**:

- **Agenda semanal** con ABM de clases (nombre, disciplina, profesora, horario,
  duración, cupo, sala) y reserva manual por recepción desde la grilla.
- **Cupo garantizado por la base de datos**, no solo por pantalla: hay un trigger
  que impide sobrevender una clase aunque dos personas reserven al mismo tiempo.
- **Lista de espera** por clase y fecha, desde el portal y desde el sistema.
- **Asistencia** con estados presente / ausente / cancelada, y descuento de la
  clase de la membresía.
- **Planes y membresías**: alta y edición, cantidad de clases, vigencia, clases
  usadas y disponibles a la vista.
- **La vigencia ya se cuenta desde la activación**, que es lo que el estudio
  confirmó el 09/09. Pero corre por **días fijos** (30) y él pidió **un mes
  calendario**: no es lo mismo, y en un mes de 31 días el aniversario se corre
  (ver §8).
- **Cobros** en efectivo, transferencia, tarjeta y Mercado Pago, con comprobante
  autonumerado, link de pago por deuda y acreditación automática.
- **Renovación automática** de membresías con generación de la cuota y email a la
  alumna con el botón de pagar.
- **Avisos automáticos**: campana en vivo, push al celular del equipo, emails a las
  alumnas (por vencer, deuda, renovación, pago recibido) y un proceso que corre
  todas las mañanas.
- **Portal de la alumna** con auto-registro, reserva, cancelación, lista de espera,
  deudas con pago online e historial.
- **Roles protegidos en la base** (no solo escondidos en la pantalla): admin,
  recepción, profesora en modo consulta sin dinero ni datos médicos, y alumna que
  solo ve lo suyo.
- **Landing** con planes y grilla de horarios en vivo desde el sistema.

De las 10 prioridades que la clienta puso en la página 16, las **1, 2, 3, 4, 9 y
10 tienen el núcleo funcionando** y lo que falta son extensiones. Las **5, 6, 7 y
8** (caja/gastos, personal/sueldos, inventario, reportes) están sin empezar.

## 3. Estado por sección del documento

> Las dos columnas del medio son la **foto del análisis inicial** (05/09/2026)
> contra el documento de requerimientos, y no se actualizan: son la línea de
> base contra la que se mide el avance. **El estado de hoy está en §3.1.** El
> detalle bloque por bloque, en §9.
>
> Dos filas se editaron sobre la foto —los Agregados 3 y 4— cuando el estudio
> derogó una y nosotros terminamos la otra. Quedan así: perder esa información
> para mantener la foto intacta no le sirve a nadie.

| Sección | Estado | Qué hay hoy | Lo grande que falta |
|---|---|---|---|
| 1 · Agenda, clases, reservas, asistencias | 🟡 | Grilla semanal, ABM de clases, reserva por recepción, cupo por trigger, estados de asistencia | Disciplinas como catálogo editable; clases especiales/talleres con fecha puntual; 5 campos de la clase (descripción, nivel, precio, requisitos, sede); que la profesora pueda marcar asistencia y agregar alumnas; cancelación dentro/fuera de plazo y clase recuperada; auditoría de quién registró |
| 2 · Planes, membresías, medios de pago | 🟡 | ABM de planes, membresías con clases usadas/disponibles, 4 medios de pago, renovación automática | Tres precios por plan según medio de pago; congelar membresía; historial de la membresía |
| 3 · Cupones de descuento | 🔴 | Nada | Todo: catálogo de cupones, validación, control de usos, aplicación al cobro y al link de MP, reporte |
| 4 · Beneficios, regalos y gift cards | 🔴 | Nada | Todo: beneficios de marcas aliadas, regalar clases/descuentos, extender membresía, gift cards, historial por alumna |
| 5 · Ficha integral de la clienta | 🟡 | Ficha con datos, membresía, reservas, pagos, notas médicas protegidas por rol | Datos físicos (estatura, peso, talles); salud en campos separados (lesiones, embarazo, cirugías, medicación); contacto de emergencia editable; bitácora de observaciones con autor y fecha; bloque de deuda con cobro desde la ficha; pagos parciales |
| 6 · Segmentación y seguimiento | 🟡 | Filtros por activa / por vencer / vencida / sin membresía | Baja de alumna con motivo y fecha; lista de “por recuperar” con estado de contacto; recuperadas; renovadas; cumpleaños del mes con beneficio asignado |
| 7 · Dashboard principal | 🟡 | 4 KPIs (activas, clases de hoy, ingresos del mes, pagos pendientes) + alertas | Ventas del día vs. cobrado vs. pendiente; egresos y resultado neto; saldos por cuenta; montos por medio de pago; contadores comerciales (prueba, renovadas, canceladas, cumpleaños) |
| 8 · Caja diaria y cuentas | 🔴 | Nada | Todo: apertura/cierre con arqueo, cuentas y billeteras con saldo, movimientos, transferencias internas |
| 9 · Gastos y egresos | 🔴 | Nada | Todo: gastos con categoría, proveedor, comprobante adjunto, cuenta de pago, filtros y totales |
| 10 · Productos e inventario | 🔴 | Nada (estaba planificado como etapa posterior) | Todo: productos con variantes, stock en tiempo real, POS de mostrador, ingresos de mercadería, ajustes, inventario físico, reportes |
| 11 · Personal, roles y permisos | 🟡 | Roles protegidos en base, ABM de profesoras y de usuarios | Ficha laboral (fechas, sede, datos de contratación); baja lógica de usuarios (hoy se borran); anulación de movimientos; permisos configurables por rol y por persona; historial de actividad |
| 12 · Horas trabajadas y remuneraciones | 🔴 | Nada | Todo: registro diario de horas, reemplazos, condiciones salariales con historial, liquidación por período |
| 13 · Landing administrable | 🟡 | Planes y horarios en vivo desde el sistema | Editor de textos, imágenes y banners; secciones fundadoras/profesoras/beneficios/promociones/productos; borrador, vista previa y publicación |
| 14 · Notificaciones y comunicaciones | 🟡 | Campana, push al staff, emails automáticos, cron diario | Avisos a la alumna al celular (el portal no tiene campana ni push); confirmación de reserva, recordatorio de clase, cambio de horario/profesora, clase suspendida, lugar liberado; notificaciones comerciales; panel para configurar canal, anticipación, texto y ver el historial de envíos |
| 15 · Email marketing | 🔴 | Solo emails transaccionales | Todo: campañas, plantillas, programación, métricas, baja de suscripción, segmentación |
| 16 · Catálogos y configuración | 🟡 | 4 catálogos reales (profesoras, salas, usuarios, Mercado Pago) | 15 catálogos más; disciplinas y medios de pago hoy están escritos en el código; sedes; etiquetas; plantillas de mensajes; parámetros de notificaciones |
| 17 · Reportes y exportación | 🔴 | Datos sueltos dentro de pantallas operativas | Todo: módulo propio, filtros con rango de fechas, exportación a Excel y PDF. La mitad de los reportes depende de módulos que aún no existen |
| **Agregado 1** · Lista de espera con aviso | 🟡 | La alumna se anota; recepción promueve a mano | Aviso automático al liberarse el lugar, oferta con tiempo límite, confirmación de la alumna y pase a la siguiente |
| **Agregado 2** · Días y horarios fijos | 🔴 | Nada (las reservas son de a una, por fecha) | Elección de horarios fijos del mes, materialización de reservas recurrentes, gestión desde administración |
| **Agregado 3** · Prioridad por pago del 1 al 9 | ⚫ **derogado** | Nada, y nunca hizo falta | El estudio lo dio de baja el 09/09: *"No existe un período general de pago del 1 al 9"*. La prioridad pasa a colgar de la fecha individual de vencimiento (§8) |
| **Agregado 4** · Vigencia desde la activación | 🟢 | **Hecho** (`0036` + `0037`): mes de calendario, cálculo en la base y pago anticipado encolado | Queda el día de gracia, que es parte del turno fijo, y la decisión sobre el cambio de plan (§8) |

## 3.1 Dónde está cada sección hoy (10/09/2026)

🟢 hecho · 🟡 parcial · 🔴 sin empezar · ⚫ derogado o fuera del alcance.

Cinco días después del relevamiento, cuatro secciones que la foto marca en
🔴 están construidas. Esta tabla existe para que el documento deje de
subdeclarar lo que el sistema hace.

| Sección | Hoy | Qué cambió desde la foto — y qué falta |
|---|---|---|
| 1 · Agenda, clases, reservas, asistencias | 🟡 | **Avanzó mucho**: talleres con fecha propia y los cinco campos (`0017`); suspender un día y cambiar la profesora (`0018`); asistencia desde el celular; el consumo de la clase en la base, con la cancelación clasificada dentro o fuera de plazo (`0022`+`0029`, **encendido el 09/09**); no se reserva una clase que ya empezó (`0038`); el plan decide qué disciplina puede reservar (`0040`); volver a anotarse después de cancelar (`0031`); y la grilla real de Casa Fe, 64 clases (`0035`). **Falta**: que la profesora agregue a una clienta que llega sin reserva; el tope de recuperos por mes; la pantalla del cambio de horario por fecha; y quién registró cada reserva (no hay `created_by` en `reservations`) |
| 2 · Planes, membresías, medios de pago | 🟡 | Los seis planes FE (`0026`); **tres precios por plan** según el medio de pago (`0028`); la vigencia como mes de calendario, calculada en la base, con el pago anticipado encolado (`0036`+`0037`); y la renovación que se cobra primero, sin cuota fantasma (`0041`). **Falta**: congelar la membresía (espera su respuesta) y el historial completo de la membresía |
| 3 · Cupones de descuento | ⚫ | **Fuera del alcance** que definió Matías (§7) |
| 4 · Beneficios, regalos y gift cards | ⚫ | **Fuera del alcance** (§7) |
| 5 · Ficha integral de la clienta | 🟡 | Sin cambios de fondo: la ficha muestra datos, membresía, reservas, pagos y las notas médicas protegidas por rol. **Falta**: datos físicos; la salud en campos separados; el contacto de emergencia editable (la columna existe en `student_private`, no la pantalla); la bitácora con autor y fecha; el bloque de deuda con cobro desde la ficha —hoy se cobra desde Pagos— y los pagos parciales |
| 6 · Segmentación y seguimiento | 🟡 | Sin cambios. **Falta**: la baja con motivo y fecha (los `students` no tienen esas columnas: la `0015` dio de baja los **accesos**, no las clientas); la lista de las que dejaron de venir (`recovery_after_days` espera su respuesta); y los cumpleaños del mes |
| 7 · Dashboard principal | 🟡 | **La mitad de plata entró** (`0020`): lo que entró y salió en el mes, el gasto de hoy, el resultado y el saldo cuenta por cuenta, con "Sin acceso" cuando al rol le falta un permiso en vez de un cero que miente. **Falta**: los contadores comerciales —pases de prueba, renovadas, canceladas, cumpleaños |
| 8 · Caja diaria y cuentas | 🟢 | **Hecho** (`0020`): cuentas con saldo, apertura y cierre con arqueo, movimientos y transferencias internas. El libro se deriva de los cobros: no hay dos verdades para la misma plata |
| 9 · Gastos y egresos | 🟢 | **Hecho** (`0020`): los catorce campos, los siete filtros y el total del filtro a la vista. **Queda** adjuntar la foto del comprobante, que es el primer uso de Storage |
| 10 · Productos e inventario | ⚫ | **Fuera del alcance** (§7) |
| 11 · Personal, roles y permisos | 🟡 | El motor de permisos por rol y por persona, con las políticas de la base preguntándole (`0012`–`0014`); la baja lógica de accesos (`0015`); anular un movimiento con motivo. **Falta**: la ficha laboral y el historial de actividad, que van con la sección 12 |
| 12 · Horas trabajadas y remuneraciones | 🔴 | **Sin empezar, y está DENTRO del alcance**: es lo único nuevo que Matías aprobó (§7, Paso 10 de §9). `teachers` no tiene una sola columna laboral. Junto con el Agregado 2, es la deuda real del proyecto |
| 13 · Landing administrable | 🟡 | Los datos del estudio salen de la base y los cargó el estudio (`0011`+`0033`), así que la web ya muestra los reales. **Falta** todo el editor: textos, imágenes, banners, las secciones nuevas, y borrador con vista previa y publicación |
| 14 · Notificaciones y comunicaciones | 🟡 | **El canal hacia la clienta se abrió hoy (10/09)**: el portal tiene campana y la clienta recibe push en el celular con los avisos de vencimiento y renovación. Antes `pushToUser` estaba escrita y nadie la llamaba. **Falta**: confirmación de reserva y recordatorio de clase; cambio de horario o profesora; clase suspendida; lugar liberado; y el panel para configurar canal, anticipación y texto, con el historial de envíos. **Y falta afuera del código**: verificar el dominio en Resend — hasta entonces el mail solo llega a la cuenta dueña |
| 15 · Email marketing | ⚫ | **Fuera del alcance** (§7): de lo nuevo entra solo Personal y remuneraciones |
| 16 · Catálogos y configuración | 🟡 | Siete secciones editables en Configuración —disciplinas, medios de pago, profesoras, salas, usuarios, permisos, Mercado Pago— más los parámetros del negocio, que se arman solos desde la tabla, y los que todavía no rigen lo dicen en pantalla (`0024`). **Falta**: cuentas y categorías de gasto tienen tabla pero no pantalla (las siembra la `0020`); y siguen faltando sedes, etiquetas y plantillas de mensajes |
| 17 · Reportes y exportación | 🟢 | **Hecho** (`0021`): nueve reportes por rango de fechas, contra la base y no filtrando en memoria, con descarga a Excel y a PDF. Los dos que faltan esperan los módulos que los alimentan: personal y mostrador |
| **Agregado 1** · Lista de espera con aviso | 🟡 | La clienta se anota y recepción promueve a mano. **Falta** el aviso automático al liberarse el lugar. El parámetro `waitlist_offer_minutes` quedó sin regir a propósito: tal como está redactado contradice su política, que es avisarles a todas a la vez |
| **Agregado 2** · Días y horarios fijos | 🔴 | **Sin empezar, y es lo que ella pidió explícitamente.** Con el Agregado 4 hecho, el bloqueo ya no es técnico: son tres definiciones suyas (qué es un turno fijo, cómo se cuenta el mes de cinco lunes, y qué pasa con el lugar cuando no renueva) |
| **Agregado 3** · Prioridad por pago del 1 al 9 | ⚫ | **Derogado** por el estudio el 09/09. La prioridad cuelga de la fecha individual de vencimiento |
| **Agregado 4** · Vigencia desde la activación | 🟢 | **Hecho** (`0036`+`0037`) |

**El recuento, sobre 17 secciones más 4 agregados:**

- 🟢 **4 terminadas** — Caja, Gastos, Reportes y el Agregado 4.
- 🟡 **10 parciales, con el núcleo operativo andando** — 1, 2, 5, 6, 7, 11, 13,
  14, 16 y el Agregado 1. Lo que les falta son funciones sueltas, no cimientos.
- ⚫ **4 afuera por decisión de Matías** (3, 4, 10 y 15) **+ 1 derogada por el
  estudio** (Agregado 3).
- 🔴 **2 de deuda real** — la sección **12** (Personal y remuneraciones, lo único
  nuevo que entró al alcance) y el **Agregado 2** (los días y horarios fijos).

Es decir: **lo que queda por construir de lo que se pidió son dos cosas**, y
ninguna de las dos bloquea que el estudio empiece a usar el sistema.

## 4. Los choques con lo que ya funciona

Esto es lo más importante del análisis: **algunas cosas del documento no se suman a
lo que hay, lo cambian**. Conviene resolverlas antes de escribir código.

**1. La renovación automática contra la regla del 1 al 9.** ⚫ *Resuelto el 09/09: el estudio derogó la regla del 1 al 9. Queda un choque distinto y más chico, en §8: la renovación automática renueva sin exigir el pago, y la regla nueva dice que el que no paga pierde la prioridad.*

Hoy el sistema renueva la membresía *al vencer* (fecha individual de cada alumna) y
genera la cuota con 5 días de gracia, sin exigir el pago para seguir reservando. El
Agregado 3 pide lo inverso: pago *anticipado* entre el 1 y el 9 del mes anterior, y
el que no paga pierde el lugar el día 10. Son dos ciclos distintos conviviendo:
hay que separar **vigencia de la membresía** (individual) de **ciclo de cobro del
horario fijo** (mes calendario). Es la decisión de negocio más pesada del documento.

**2. La profesora “solo consulta” contra la profesora que opera.**
El 26/08 recortamos al rol profesor: no ve dinero ni datos médicos y no puede
escribir nada. El documento pide que la profesora **agregue alumnas que llegan sin
reserva** y **marque asistencia**, y habla de **observaciones de las profesoras**.
Además, para dar una clase de Pilates la profesora normalmente necesita saber
lesiones, limitaciones y embarazo — hoy está bloqueado a propósito. Probablemente
haya que partir la información de salud en dos niveles: lo que sirve para dar la
clase (visible a la profesora) y lo confidencial (solo admin y recepción).

**3. Cuándo se descuenta la clase.**
Hoy la clase se descuenta **al marcar asistencia**. El documento pide descontarla
**al agregar/reservar**. Cambia el saldo de clases, qué pasa con un ausente y si una
cancelación devuelve la clase. Es una regla de negocio, no un detalle técnico.

**4. La lista de espera pasiva contra la oferta con tiempo límite.**
Hoy la alumna se anota y **recepción la promueve a mano**. El documento pide aviso
automático al liberarse el lugar, con tiempo para confirmar y pase a la siguiente.
Para eso la alumna necesita recibir avisos en el celular, y hoy **el portal no tiene
campana ni notificaciones push** (la infraestructura existe, pero solo la usa el
staff). WhatsApp automático es aparte: necesita la API de Meta, con costo por
conversación y plantillas aprobadas.

**5. Los usuarios se borran.**
Dar de baja un usuario del sistema hoy hace un **borrado físico**. El documento
dice expresamente que los perfiles inactivos no deben eliminarse para conservar
clases, asistencias y movimientos. Hay que cambiarlo por desactivación.

**6. Toda la plata se calcula en el navegador.**
El sistema trae todos los pagos, reservas y membresías al cliente y suma ahí. Para
caja diaria, saldos por cuenta y reportes con rango de fechas sobre años de
historial eso no alcanza: hay que mover los cálculos a vistas de la base. Además el
“día” hoy está definido de cuatro maneras distintas (fecha del navegador, fecha del
cron en huso argentino, fecha UTC de Mercado Pago, fecha del servidor). Para una
caja con apertura y cierre eso tiene que ser uno solo.

**7. Un bug que ya existe.** Un pago anulado se sigue contando como deuda pendiente
en el tablero y en las alertas. Es chico y conviene arreglarlo antes de construir
caja y reportes encima.

## 5. Buenas noticias del cruce

- **Vigencia desde la activación (Agregado 4): ya lo hacemos.** El sistema calcula
  el vencimiento como fecha de inicio + días del plan. Solo falta ofrecer “1 mes”
  exacto (20/09 → 20/10) en lugar de 30 días, y permitir que arranque al pagar.
- **Regalar clases y extender una membresía** son cambios chicos: todo lo demás
  (clases restantes, alertas, permiso para reservar) ya se calcula sobre esos dos
  números, así que un ajuste alcanza.
- **Cumpleaños del mes, clientas de prueba y contadores comerciales** salen de datos
  que ya tenemos cargados: es trabajo de pantalla, sin tocar la base.
- **Toda la infraestructura de avisos ya está construida** (campana, push, emails,
  proceso diario, deduplicación). Agregar un evento nuevo es barato; lo que falta es
  encender el canal hacia la alumna y el panel para configurarlos.
- El sistema ya tiene el patrón repetible para catálogos nuevos (tabla + permisos +
  ABM en Configuración + vista pública para la landing). Los 15 catálogos que faltan
  se hacen con ese molde.

## 6. Decisiones estructurales

Estas definen la forma de los datos. Tomarlas después obliga a reescribir.

**Resueltas (05/09/2026, con Matías):**

| Decisión | Definición | Consecuencia |
|---|---|---|
| Sedes | **Un solo local** por ahora | No se modela multi-sede. Las columnas quedan previstas, sin pantalla. Ahorra semanas |
| Alcance de la primera versión | **Prioridades 1 a 4** (agenda, membresías y cobros, ficha, tablero) | Inventario, sueldos y marketing van a segunda etapa |
| Horarios fijos | **Días fijos de la semana** (ej. lunes y jueves 9hs), no fechas sueltas | Un horario fijo es (alumna, clase de la grilla); las reservas del mes se generan a partir de eso |
| Planes | **Pago mensual por X clases por semana** | El plan puede expresarse en clases semanales; el mes con 5 lunes queda como parámetro |
| Disciplinas | **Catálogo editable** ✅ implementado | Migración 0011 |
| Medios de pago | **Catálogo editable** ✅ implementado | Migración 0011. Los tres precios por plan van en el Bloque 3 |
| Parámetros del negocio | **Todo lo que es un número se configura desde el sistema** ✅ implementado | Migración 0011. Ver §6.1 |

**Pendientes, para el segundo tramo del Bloque 0:**

- **Permisos**: matriz configurable por rol y por persona, en vez de roles fijos. Resuelve solo la discusión de qué puede hacer la profesora, y cada módulo nuevo lo necesita desde el inicio.
- **Auditoría "quién hizo qué"**: columna y disparador repetidos en reservas, asistencias, cobros y anulaciones.
- **Baja lógica de usuarios**: hoy se borran físicamente, contra lo que pide el documento.
- **Fecha y hora únicas**: guardar el momento exacto del cobro y calcular el día siempre en huso argentino, antes de construir la caja.

**Diferidas a propósito** (no bloquean, se deciden al construir el bloque):

- **Cuándo se consume la clase** (al reservar o al asistir) y si la ausencia la consume: el parámetro ya existe en Configuración con el comportamiento actual como valor por defecto. Se define al hacer el Bloque 1.
- **Vigencia contra horario fijo a fin de mes**: se define al hacer el Bloque 2, que es cuando existen los horarios fijos.

### 6.1 El criterio: parametrizar en vez de preguntar

Lo que es un número o un texto no se escribe en el código, se configura desde el
sistema. Así el estudio ajusta sus reglas sin esperar un desarrollo, y nosotros no
quedamos bloqueados esperando respuestas.

Ya configurable desde Configuración (migración 0011): datos del estudio (nombre,
dirección, WhatsApp, Instagram, email, horarios), plazo de cancelación, tiempo para
confirmar un lugar liberado, cuándo se descuenta la clase, si la ausencia la
consume, días de aviso de vencimiento, tope de congelamiento, días para pasar a
"por recuperar", vencimiento de la cuota y anticipación de cada recordatorio.
Los cuatro parámetros de la ventana de pago del 1 al 9 se borraron en la 0033,
cuando el estudio derogó esa regla.

Lo mismo valía para la estética, y se cumplió: el manual llegó el 11/09 y se
aplicó sin tocar una regla de negocio. Los tres colores y las dos tipografías
son tokens, así que un cambio de paleta es editar `app/globals.css`, no repintar
pantallas.

## 7. Lo que la clienta contestó (06/09/2026)

Contestó las 20 preguntas y mandó **"Casa Fé — Membresías y Condiciones"**, seis
páginas de política del estudio. El texto está en
[`casa-fe-membresias-y-condiciones.txt`](casa-fe-membresias-y-condiciones.txt) y
el cruce completo contra el código, con evidencia archivo:línea, en
[`casa-fe-impacto-de-las-respuestas.md`](casa-fe-impacto-de-las-respuestas.md).

### Lo que quedó decidido

| Tema | Decisión | Dónde vive |
|---|---|---|
| Cuándo se descuenta la clase | **Al reservar** | `class_consumption = 'reserva'` |
| Faltar sin avisar | **Pierde la clase** | `absence_consumes_class = true` |
| Plazo de cancelación | **3 horas** | `cancel_hours = 3` |
| Recuperos | **2 por mes, dentro del mes**, sujetos a disponibilidad | `recoveries_per_month = 2` (nueva) |
| El mes | **4 semanas.** El quinto lunes no suma clase | `weeks_per_month = 4` (nueva) |
| Precios | Transferencia base, **efectivo −5%, tarjeta +25%** (hasta 3 cuotas) | `payment_methods.ajuste_pct` (nueva) |
| Lista de espera | **Se avisa a todas**, la primera que confirma se lo lleva | — |
| Sin reserva | Si hay lugar, **toma la clase** | `override_by` / `override_reason` (ya están, 0022) |
| Asistencia | La tildan **profesora y encargada**, una por una | Ya está |
| Lesiones | **La profesora las ve** | Partir `student_private` en dos niveles |
| Horario fijo | **Se pierde al vencer sin pagar**; renovar después no garantiza recuperarlo | Colgaba de `slot_release_day = 10`; desde el 09/09 cuelga de `memberships.end_date` |
| Caja | **Cierra por día**, controla efectivo, transferencia y tarjetas | Ya está (0020) |
| Disciplinas | **Tres**: Reformer, Embarazadas, 3ra Edad | Catálogo (0011) |
| Planes | **Seis FE**, por frecuencia semanal | `plans.weekly_frequency` (nueva) |
| Cómo se llaman | **"Cliente"**, en masculino, en pantalla; `students` en la base | Decidido el 09/09 · migración `0033` |

**El precio no son tres números, son dos porcentajes.** Verificado sobre las seis
filas del documento: efectivo es exactamente base × 0,95 y tarjeta base × 1,25,
sin una sola excepción. Se modela como precio base más un porcentaje por medio de
pago — el día que cambie el descuento se toca un número, no doce.

### Lo que contradice algo ya construido

- **La lista de espera de la 0022 modela el producto equivocado.** El estado
  `'ofrecida'`, la columna `offer_expires_at` y el parámetro
  `waitlist_offer_minutes` suponen una oferta secuencial con reloj. Con "avisar a
  todas" eso sobra. Y el comentario de `0022:71-74` **está mal**: afirma que la
  alumna podría confirmar desde el portal, y no puede — su única política
  permisiva de update es `"alumno cancela"` (`0005:78`), con
  `with check (status = 'cancelada')`. La restrictiva de `0013:264` solo resta
  permiso, nunca lo otorga. Sin una política nueva, "la primera que confirma
  gana" no se puede ejecutar.
- **Suspender una fecha pasa de correcto a cobro indebido.** Hoy la pantalla dice
  "decidí si les devolvés la clase" porque nadie descuenta al reservar. Cuando el
  consumo sea al reservar, suspender sin devolver le cobra la clase a la alumna
  por algo que decidió el estudio — y el documento (§12) dice explícitamente que
  no la pierde.
- **Los seis planes y las seis disciplinas sembradas son de demo** y no se parecen
  a los de ella. Desactivarlos toca la renovación automática y el respaldo de la
  landing.

### Lo que sigue abierto

**Bloquea de verdad:** la **vigencia de la membresía** (§4 del documento, marcada
"PENDIENTE DE CONFIRMACIÓN"). De ella cuelgan las clases que vencen (§5), la
ventana de recupero (§7), la reposición cuando cancela el estudio (§12) y la
pregunta 11. Hoy corre desde la asignación por N días, y eso choca con el ciclo
de cobro del 1 al 9: son dos relojes distintos.

**No bloquea, se puede parametrizar:** congelamiento (§9), feriados (§13), el
redondeo de precios, la ventana del 21 al 31 (P11) y qué significa "facturado"
(P18). Promociones (§15) queda fuera del alcance.

**Las preguntas 14 y 15 no se entendieron, y la culpa es nuestra.** La 15 hablaba
de alumnas "por recuperar", y en este proyecto *recuperar* significa dos cosas:
recuperar una clase perdida y recuperar una alumna que dejó de venir. La colisión
está escrita en la base: `recovery_after_days` tiene por etiqueta
`'Pasa a "por recuperar" (días)'` (`0011:106`). **"Recuperar" queda reservado para
la clase perdida en toda la interfaz**, y ese parámetro se renombra.

### Las siete preguntas que faltan

Congelar la membresía · las clientas que dejaron de venir · desde cuándo y hasta
cuándo vale una membresía · la tarjeta por Mercado Pago (el recargo y el tope de
cuotas) · el género de "clienta" · si un plan combina disciplinas · el redondeo de
precios. Redactadas en castellano llano en
[`casa-fe-impacto-de-las-respuestas.md`](casa-fe-impacto-de-las-respuestas.md), §6.

### El alcance que definió Matías

Terminar lo que hay, y de lo nuevo **solo Personal y remuneraciones**. Afuera:
promociones, cupones, beneficios, gift cards, productos e inventario. **Reportes
ya está hecho** (migración `0021`).

## 8. Lo que el estudio contestó (09/09/2026)

Se le pidió la grilla, las profesoras, las salas, los datos del estudio, el
material de diseño y cuatro definiciones que habían quedado abiertas. Contestó
todo menos la grilla, que es justamente lo que apura: **la lista de días y horas
no llegó** (la captura vino cortada). Lo que sí llegó de la grilla es que en una
primera instancia se dicta **únicamente Pilates Reformer**, con clases de **50
minutos** y **8 lugares** en la **Sala Reformer**, que tiene 8 reformers.

### Lo que se aplicó (migración `0033`)

| Respuesta | Qué se hizo |
|---|---|
| El nombre es **"Casa Fe", sin tilde** | `studio_name`, más los siete respaldos del código y el service worker, que no puede leer la base |
| Dirección, Instagram, email y horario | Cargados. El WhatsApp de la demo se **vació**: hasta hoy la web mandaba a un teléfono que no es del estudio |
| Solo Reformer, una sola sala | Apagadas las cinco disciplinas de demo, las dos que todavía no se dictan y las tres salas de demo. Va **antes** de cargar la grilla: el formulario toma como default la primera disciplina y la primera sala activas |
| Clases de 50 min y 8 lugares | `class_default_minutes` y `class_default_capacity`. Venían escritos en el código como 55 y 10 |
| Reformer **no** se combina con embarazadas | Los seis planes FE habilitan solo Reformer, y desde la `0040` **rige**: el trigger de reserva rechaza una clase cuya disciplina el plan no incluye. Hoy no muerde —hay una sola disciplina activa— y muerde el día que se cargue la grilla de embarazadas |
| En pantalla se dice **"cliente"**, en masculino | Etiquetas y ayudas de permisos, ayudas de Configuración, dos funciones de aviso y el texto de las 19 pantallas. El grupo de permisos va por su **tercer** nombre: `Alumnos` → `Clientas` → `Clientes` |
| **No existe** el período de pago del 1 al 9 | Borrados `priority_pay_from_day`, `priority_pay_to_day`, `slot_release_day` y `priority_reminder_days`. Nunca llegaron a regir: la `0024` ya los había marcado `rige = false` |

### La vigencia, que era la que bloqueaba

Eligió la **fecha individual**, que es lo que el sistema ya hace: un mes desde la
fecha de inicio. Pero le sumó cinco reglas, y tres no son gratis.

Su ejemplo, textual: paga e inicia el **20/09**, la usa hasta el **19/10**
inclusive, debe renovar **como máximo el 20/10**, y el **21/10** pierde la
prioridad sobre sus días y horarios fijos.

1. **Un mes calendario, no 30 días.** Hoy `end_date = start + plan.duration_days`
   y los seis planes FE tienen 30. Coincide por casualidad en septiembre y falla
   en los meses de 31: el aniversario se corre hacia adelante.
2. **El 20/10 es un día de hueco que nadie modeló.** Conserva la prioridad pero
   `membresia_para` compara `between start_date and end_date`, así que ese día
   **no puede reservar**. Es coherente con su regla, pero el mostrador lo va a
   reportar como un bug si no está escrito. La liberación va en `end_date + 2`,
   no en `+ 1`.
3. **El pago anticipado se encola.** Hoy `assignMembership` arranca siempre hoy y
   no mira la membresía anterior, así que quedan dos vigentes solapadas y
   `membresia_para` elige la nueva: lo que quedaba de la vieja queda huérfano.
4. **Las clases no usadas vencen y no se acumulan.** Ya se cumple.
5. **Recordatorios antes del vencimiento.** Ya se manda uno, con anticipación
   configurable (`expiry_warning_days`). Ella habla en plural y sin números.

**Y el choque que abre:** la renovación automática hace lo contrario de lo que
pidió. `auto_renew` nace en `true` y el proceso diario renueva **sin exigir el
pago** — inserta la membresía vigente y después genera la cuota como pendiente.
Su regla es que el que no paga pierde la prioridad. Hay que decidir si
`auto_renew` sigue existiendo antes de escribir los avisos.

### El turno fijo: no existe el sujeto de la frase

Pidió *"liberar automáticamente los turnos fijos"*. Hoy una reserva es una fila
por **(cliente, clase, fecha)**, no un derecho recurrente sobre un día y hora. No
hay turno fijo que liberar. Es el Agregado 2, y antes de escribir la tabla hay
tres cosas que decidir:

- **Qué significa liberar.** Si es pasar la reserva a `'cancelada'`, el cliente
  entra al portal, toca la clase de siempre y **se la lleva de vuelta**:
  `reactivar_reserva` es `security definer`, la puede llamar cualquier usuario
  sobre sus propias reservas y solo valida que la fila esté cancelada — y
  `createReservation` la llama sola cuando choca con el unique. Hace falta borrar
  la fila, un estado que se niegue a reactivarse, o una política restrictiva.
- **El conteo contra el mes calendario.** En el período 20/09–19/10 uno o dos
  días de la semana caen **cinco** veces, y el plan trae cuatro clases por
  semana. Un materializador generaría 5 reservas donde hay 4 clases, y
  `consumir_clase` **lanza excepción**. O topea en `weekly_frequency × 4`, o
  `classes_total` se calcula por período, o el turno fijo no materializa nada.
- **Si materializa, `fetchStudioData` se rompe antes que nada.** Trae
  `reservations` completa, sin filtro de fecha y sin `limit`, en cada login. Con
  turnos fijos materializados son ~1.250 reservas por mes, acumulativas. La
  ventana de fechas va en el mismo bloque, no después.

### El redondeo: la respuesta excede la pregunta

Se le preguntó qué hacer **el día que aumente los precios**, aclarando que hoy
los seis dan justos, y la opción más gruesa que se le ofreció era $100. Contestó
**al próximo múltiplo de $1.000**, que cambia **8 de los 12 precios que ella
misma publicó** y deja falso el título de su propia tabla: el "Efectivo 5% OFF"
de FE START pasa a ser 4,44% ($45.000 → $43.000).

`price_rounding` **no se tocó**, y queda en `cincuenta`, que deja los doce
valores intactos. Se cambia cuando confirme la tabla nueva.

### Lo que sigue faltando

**Datos:** la lista de días y horas de la grilla · si las clases arrancan en hora
redonda o corridas · cómo se llama cada clase (el título es obligatorio y se ve
en el portal) · nombre completo, teléfono y email de Ivana y de Leandro · quién
es la profesora del turno tarde (se puede arrancar con un nombre provisorio:
`teacher_id` es `NOT NULL`) · el WhatsApp · el link de Google Maps · si la web
sigue mostrando ciudad y Facebook · las preguntas del FAQ, que su propio mockup
pone en la barra y nadie puede escribir por ella.

El material de diseño —logo, paleta, tipografías y fotos— **llegó el 11/09** y
está aplicado. De eso queda pendiente el logo en vectorial y saber si tiene
licencia webfont de Bauer Bodoni: mientras tanto se usa Bodoni Moda, que es un
revival del mismo Bodoni.

**Decisiones:** las cuatro preguntas de la ronda anterior que quedaron sin
contestar — congelamiento, los días hasta la lista de contacto
(`recovery_after_days`), las **dos** de Mercado Pago (el 25% del link y el tope
de 3 cuotas, que hoy no está puesto en ningún lado) y si **3ra Edad** combina con
Reformer — más qué es un turno fijo, el conteo del mes de cinco lunes, cuántos
recordatorios y a cuántos días, y la tabla de precios con el redondeo nuevo.

## 9. Cómo arrancamos

Propuesta de orden. Respeta las prioridades de la clienta, pero corregida por
dependencias técnicas: hay cosas que si no van primero, obligan a rehacer lo que
venga después.

### Bloque 0 — Los cimientos  🔄 casi cerrado
Nada de esto se "ve" como una función nueva, pero todo lo demás se apoya acá, y
es lo que permite que el estudio ajuste sus reglas sin pedirnos un desarrollo.

**Hecho y verificado contra la base real (05/09/2026):**

| | Migración |
|---|---|
| ✅ **21 parámetros del negocio configurables** — plazos, anticipaciones, cuándo se consume la clase (los cuatro de la ventana del 1 al 9 se borraron en la `0033`). La pantalla se arma sola con lo que trae la tabla: sumar un parámetro es un `INSERT`, no un deploy | `0011` |
| ✅ **Datos del estudio fuera del código** — nombre, dirección, mapa, WhatsApp, Instagram, email, horarios. La web los lee de una vista pública, con respaldo | `0011` |
| ✅ **Catálogo de disciplinas** editable con color y descripción, con renombrado en cascada. Reemplazó seis constantes duplicadas en el código | `0011` |
| ✅ **Catálogo de medios de pago** editable | `0011` |
| ✅ **Motor de permisos** por rol y por persona: 71 claves, matriz configurable, excepciones por persona con vencimiento, bitácora, guardias anti auto-elevación e invariante de que nunca quede sin admin | `0012` |
| ✅ **Las políticas de la base preguntan al motor** — 13 políticas reescritas, los `for all` abiertos en crear/editar/borrar, y el corte real de "anular movimientos" | `0013` |
| ✅ **Pantalla de la matriz** de permisos en Configuración | — |
| ✅ **El cron lee los parámetros** en vez de sus constantes | — |

**Arreglos que salieron del camino:**

- El cron diario quedaba abierto si faltaba su variable de entorno (`if (secret && ...)`). Ahora es fail-closed.
- Las notas médicas se podían **perder en silencio**: la función que las guarda caía a una columna que la migración 0008 había eliminado y se tragaba el error, y además se guardaban vacías cada vez que alguien editaba la ficha sin traer ese campo.
- Un pago anulado se contaba como deuda en el tablero.
- El borrado de suscripciones push no filtraba por usuario.
- `can()` traía un caché que la rompía (migración `0014`): la función declara `search_path` vacío, y al salir Postgres restaura las variables — pero una variable personalizada no vuelve a "no existe" sino a cadena vacía. Desde la segunda llamada el caché se leía vacío y respondía que no a todo.

**Falta para cerrar el bloque — solo lo que depende del estudio:**

- [ ] Probar el portal de la alumna: **cancelar una reserva** es lo que ejercita la rama de aislamiento de la política restrictiva nueva.
- [x] **Unificar los chequeos del servidor** (05/09): los endpoints preguntan al motor con la misma clave que la pantalla, vía `lib/permisos-server.ts`. Antes verificaban el rol a mano, así que un permiso destildado desaparecía del navegador pero el endpoint lo seguía aceptando. De paso se cerró una filtración: `/api/mp/test` devuelve el alias y el email de la cuenta de Mercado Pago del estudio, y con el chequeo viejo recepción los veía sin tener acceso a las credenciales — ahora exige su propia clave.
- [ ] Encendido gradual de los permisos, grupo por grupo, empezando por Catálogos.
- [x] **Distinguir "sin acceso" de "vacío"** (05/09): las políticas devuelven cero filas cuando no hay permiso, no un error, así que un rol sin acceso al dinero veía un $0 que miente. El tablero ahora dice "Sin acceso". Además, el error de una tabla ya no tira la pantalla entera.
- [x] **Baja lógica de accesos** (05/09, migración `0015`): se marca el perfil inactivo y se bloquea el ingreso, con reversión si una de las dos falla, y se puede reactivar. Antes se borraba la cuenta y el perfil se iba en cascada, contra lo que pide el documento.
- [x] **Un solo "día" para el dinero** (05/09, migración `0016`): el cobro guarda el instante exacto y el día se deriva del huso del estudio. Antes se calculaba de cuatro maneras distintas según quién escribiera; para un arqueo de caja eso significa cobros en el cierre equivocado.

### Bloque 1 — Agenda y asistencias  🔄 en curso

**Hecho (05/09/2026):**

- [x] **Clases especiales y talleres con fecha propia** (migración `0017`).
      Antes una clase era solo una plantilla semanal: un taller del sábado 12
      no se podía representar.
- [x] **Los cinco campos que faltaban**: descripción, nivel o público,
      precio (vacío = la cubre la membresía), requisitos y "la alumna puede
      reservarla sola" — que el portal respeta.
- [x] **Suspender un día y cambiar la profesora** sin tocar la clase entera
      (migración `0018`). La suspensión la hace cumplir la base: rechaza
      reservas nuevas en esa fecha.
- [x] **Tomar asistencia desde el celular**, con su propia clave de permiso
      para que la profesora pueda marcar sin poder tocar nada más.
- [x] Arreglo: deshacer un "presente" ahora devuelve la clase a la alumna.
- [x] Arreglo (migración `0019`): `reservas.eliminar` y `membresias.eliminar`
      no existían en el catálogo, así que nadie podía borrar esas filas y el
      borrado fallaba en silencio.

**Falta, y depende de las respuestas de la clienta:**

- [ ] Estados de cancelación dentro y fuera de plazo, y clase recuperada.
      El plazo ya es un parámetro configurable; falta definir si la ausencia
      consume la clase y cuántos recuperos se permiten.
- [ ] Que la profesora agregue a una alumna que llega sin reserva, con
      validación de membresía y excepción autorizada.
- [ ] Instancias con cambio de horario por fecha (la tabla ya lo soporta,
      falta la pantalla).

### Bloque 1 — resto (prioridad 1 de la clienta)
- Clases especiales y talleres con fecha puntual; instancia de clase por fecha
  (suspender un día, reemplazo de profesora).
- Campos que faltan en la clase: descripción, nivel, precio, requisitos.
- La profesora marca asistencia y agrega alumnas, con validación de membresía y
  clases disponibles, y excepción autorizada.
- Estados de cancelación dentro/fuera de plazo y clase recuperada, con plazo
  configurable.

### Bloque 2 — Lista de espera y horarios fijos (Agregados 1, 2 y 3, ≈ 3 semanas)
- Avisos a la alumna en el celular (encender la campana y el push en el portal).
- Oferta automática del lugar liberado con tiempo límite y confirmación.
- Horarios fijos del mes y su gestión desde administración.
- Liberación de los lugares al día siguiente de la fecha de gracia individual, y
  los recordatorios previos al vencimiento. (El ciclo del 1 al 9 quedó derogado.)

### Bloque 3 — Membresías y ficha (prioridades 2 y 3, ≈ 3 semanas)
- Tres precios por plan según medio de pago.
- Congelar membresía e historial completo de la membresía.
- Ficha integral: datos físicos, salud en campos separados, contacto de emergencia,
  bitácora de observaciones, bloque de deuda con cobro desde la ficha.
- Baja de alumna con motivo, “por recuperar” y cumpleaños del mes.

### Bloque 4 — Plata (prioridades 4 y 5)  🔄 en curso

**Hecho (05/09/2026, migración `0020`):**

- [x] **Cuentas y saldos**: cajas, cuentas bancarias, billeteras y pasarelas.
      Cada medio de pago apunta a una, y Mercado Pago vive en la suya: esa
      plata NO entra al arqueo del cajón.
- [x] **El libro se deriva, no se copia.** Los cobros se leen de donde ya
      estaban; no hay dos verdades para la misma plata, ni un disparador que
      pueda tumbar un cobro real.
- [x] **Caja diaria** con apertura, cierre y arqueo. El cierre pide un solo
      dato: cuánto contaste. La diferencia se calcula mientras se escribe.
- [x] **Movimientos** que los cobros no saben expresar: transferencias entre
      cuentas, retiros, aportes, devoluciones y saldo de apertura.
- [x] **Gastos** con los catorce campos de la sección 9, los siete filtros y
      el total del filtro siempre a la vista. Un gasto pendiente no mueve un
      peso hasta que se paga.
- [x] Nueve parámetros configurables que resuelven doce decisiones de
      negocio sin tener que preguntarlas.

**Falta para cerrar el bloque:**

- [x] **Los parámetros nuevos en Configuración** (05/09): las secciones ya no
      están escritas a mano — salen del catálogo, así que el próximo módulo
      agrega la suya con un `INSERT` y aparece sola. Los tres parámetros que
      aflojan el control del arqueo solo los cambia el admin, y la pantalla
      explica por qué.
- [x] **Bloque de plata en el tablero** (05/09): entró y salió en el mes, el
      gasto de hoy, el resultado y dónde está la plata cuenta por cuenta. Si
      al rol le falta ver cobros o gastos, lo dice en vez de mostrar un
      resultado que no incluye lo que no puede ver.
- [x] **Anular un cobro desde Pagos** (05/09): pide el motivo y explica qué
      va a pasar antes de hacerlo. El comprobante emitido queda, el cobro
      deja de contar como plata entrada y baja el saldo de su cuenta. Si ese
      día ya se arqueó, el cierre firmado no cambia.
- [ ] Adjuntar la foto del comprobante (primer uso de Storage, en migración
      aparte).
- [ ] Avisos de caja en el proceso diario: caja sin cerrar, diferencia.

### Bloque 5 — Reportes (prioridad 8)  ✅ hecho

**Hecho (05/09/2026, migración `0021`):**

- [x] **Nueve reportes** en tres grupos. *Plata*: cobros, deudas con la
      antigüedad de cada una, egresos, resultado por mes y cobrado por medio.
      *Alumnas*: altas del período y membresías que vencen. *Clases*:
      asistencias y ocupación por clase sobre el cupo.
- [x] **Todos por rango de fechas y contra la base**, nunca filtrando en
      memoria el paquete del estudio: un reporte tiene que poder mirar años de
      historia sin traérsela entera al navegador.
- [x] **Descarga a Excel** (CSV con BOM y punto y coma, así los acentos y los
      montos no se rompen en un Excel en español) y a PDF por impresión. El
      nombre del archivo lleva el período adentro.
- [x] **Los montos bajan como número**, no como texto: se pueden sumar.
- [x] `reportes.ver` dejó de ser una clave `futuro` y pasó a configurable,
      tildada para admin y recepción. Cada número de adentro lo sigue
      gobernando su propio permiso: un rol sin `finanzas.ver` entra y no ve un
      peso, y la pantalla lo dice en vez de mostrar cero.

**Verificado contra la base** (rango 2026-01-01 a 2026-12-31): cobros 58 filas
por $1.793.000, deudas 5 por $165.000, resultado 6 meses, cobrado por medio
$1.793.000 — los tres totales cuadran entre sí y con el tablero.

**Falta, cuando existan los módulos que los alimentan:** reportes de personal y
remuneraciones, y de inventario y ventas de mostrador.

### El orden corregido con las respuestas (06/09/2026)

Reemplaza al plan por bloques de arriba, que se armó cuando faltaban las
respuestas. Lo de más abajo se apoya en lo de más arriba: cambiarlo de orden
obliga a rehacer. El detalle con evidencia archivo:línea está en
[`casa-fe-impacto-de-las-respuestas.md`](casa-fe-impacto-de-las-respuestas.md), §5.

**Paso 0 — Los arreglos previos.** Se lleva las migraciones `0023`
(el tipo de aviso `renovacion_omitida`) y `0024` (marcar los parámetros que
todavía no rigen), así que el resto corre dos números más abajo de lo que
decía el plan original. Bugs vivos y trampas que se despiertan con lo
de abajo. Ninguno depende de la clienta.

- El `continue` mudo del cron sobre un plan inactivo
  (`app/api/cron/diario/route.ts:148`) tiene que dejar rastro. **Bloqueante para
  sembrar los planes FE**: desactivar los viejos apagaría la renovación de todas
  en silencio.
- `tomar-asistencia.tsx:71` — pasar de presente a ausente deja `'confirmada'`.
- **El fallback de la campana** (`notifications-bell.tsx:19-44`): tres mapas de
  seis claves escritos a mano. Un tipo desconocido deja el icono en `undefined` y
  React tira la campana entera. Se arregla **antes** del primer aviso de lista de
  espera. Ya hay tres tipos de caja permitidos por el CHECK y no emitidos por
  esto.
- `lib/api.ts:627` usa 5 días fijos en vez de `payment_grace_days`.
- `localISO()` (`lib/api.ts:30`) usa el reloj del navegador; la vigencia tiene que
  derivar el día del huso del estudio, como la plata desde la `0016`.
- Marcar en pantalla como pendientes los parámetros que **nadie lee todavía**
  (`class_consumption`, `absence_consumes_class`, `cancel_hours`,
  `waitlist_offer_minutes`), con el criterio de los permisos en sombra. Son once
  en total los declarados sin código.

**Paso 1 — Catálogo: disciplinas, planes y el renombre** (`0025`). Las tres
disciplinas con renombrado en cascada hecho en SQL, los seis planes FE con
`weekly_frequency`, y el vocabulario. El renombre a "Clientes" va en su propio
commit, después de la respuesta de género.

**Paso 2 — El consumo de la clase, en la base** (`0026`). El corazón del cambio:
redefine qué significa una reserva. Trigger que descuenta al insertar y sella
`membership_id`; clasificación de la cancelación contra `cancel_hours`;
devolución al suspender una fecha con `cancel_kind = 'suspendida por el estudio'`;
tope de recuperos; la excepción autorizada. Corte limpio, **sin backfill**: el
camino de asistencia descuenta solo si `membership_id is null`.

**Paso 3 — Los precios** (`0027`). `payment_methods.ajuste_pct`, el recálculo en
el modal de cobro, y la invalidación del link de Mercado Pago cuando cambia el
monto.

**Paso 4 — Lista de espera y avisos** (`0028`). Borrar lo que sobra de la 0022,
**la política permisiva nueva** para que la alumna confirme, el registro de a
quién se le avisó, y encender el canal hacia la alumna: `pushToUser`
(`lib/push-server.ts:65`) está escrita y **sin un solo llamador**, y el email por
Resend ya anda en producción. El cron diario no alcanza: una cancelación a 3
horas del plazo hay que avisarla en minutos.

**Paso 5 — Feriados y suspensión masiva.** Hoy un lunes feriado con 8 clases son
8 clics.

**Paso 6 — Vigencia y horarios fijos.** Acá entra la respuesta que falta.

**Paso 7 — Congelamiento y ausencias prolongadas.** Solo si la respuesta es sí.
Se construyen juntos o ninguno: §8 y §9 del documento son dos respuestas a la
misma situación.

**Paso 8 — Cambio de plan desde la app.** Necesita el prorrateo, y separar
"cambiar plan" de "renovar", que hoy son el mismo botón
(`ficha-alumno.tsx:552-566`).

**Paso 9 — Cerrar lo pendiente de bloques anteriores.** Foto del comprobante de
gasto, avisos de caja, cambio de horario por fecha, y el encendido gradual de
permisos.

**Paso 10 — Personal y remuneraciones.** Lo único nuevo del alcance. Hoy
`teachers` no tiene una sola columna laboral. Dos criterios de la casa aplican de
entrada: los sueldos van en `teacher_private` —RLS filtra filas, no columnas— y
la liquidación se **deriva** de las horas y las condiciones vigentes, no se copia
a una tabla que se desincroniza. Va último porque no bloquea nada, y el reporte
que lo acompaña ya tiene su molde en la `0021`.

**Fuera del alcance:** promociones, cupones, beneficios, gift cards, productos e
inventario.

## 10. Lo que este análisis no cubre

- La sección 14-15 (notificaciones y email marketing) se relevó a mano: su auditoría
  automática se cortó por límite de uso de la sesión. El estado está en la tabla de
  §3 y es confiable, pero no tiene el detalle ítem por ítem del anexo.
- De los nueve grupos auditados, dos (dashboard/caja/gastos e inventario) pasaron
  además por una segunda revisión que verificó la evidencia contra el código. Los
  otros siete son de una sola pasada: los estados 🟡/🔴 son sólidos, pero algún ítem
  marcado como cubierto podría estar un escalón más abajo.
- Las estimaciones son de desarrollo, sin contar reuniones con la clienta, carga de
  datos reales ni pruebas del estudio operando.
