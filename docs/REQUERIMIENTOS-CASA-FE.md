# Casa Fé — qué cubrimos del documento nuevo y cómo arrancamos

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
de la primera versión. La sección §8 propone cómo cortarlo.

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
- **La vigencia ya se cuenta desde la activación, no por mes calendario** — el
  Agregado 4 del documento está prácticamente resuelto de fábrica (ver §5).
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
| **Agregado 3** · Prioridad por pago del 1 al 9 | 🔴 | Nada | Cuota anticipada del mes siguiente, marca de prioridad, recordatorios antes del 9, liberación automática de lugares el día 10 |
| **Agregado 4** · Vigencia desde la activación | 🟢 | Ya funciona así (start + días del plan) | Solo dos ajustes: “1 mes” exacto en vez de 30 días y arrancar al pagar; más mostrar en la ficha la diferencia entre vigencia y horario fijo |

## 4. Los choques con lo que ya funciona

Esto es lo más importante del análisis: **algunas cosas del documento no se suman a
lo que hay, lo cambian**. Conviene resolverlas antes de escribir código.

**1. La renovación automática contra la regla del 1 al 9.**
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
"por recuperar", vencimiento de la cuota, ventana de pago del 1 al 9, día de
liberación de lugares y anticipación de cada recordatorio.

Lo mismo vale para la estética: tipografía, textos y fotos se cargan cuando la
clienta los tenga, sin frenar la lógica.

## 7. Preguntas para la clienta

Las cinco preguntas de forma quedaron respondidas del lado nuestro (§6) salvo las
que dependen del estudio. El mensaje enviado a la clienta el 05/09/2026 pide:

1. **Alcance**: confirmar que arrancamos por agenda, membresías, cobros y ficha, y
   que inventario, sueldos y marketing van a segunda etapa.
2. **Horarios fijos**: qué pasa en un mes con cinco lunes — ¿esa quinta clase entra
   en el plan o queda afuera?
3. **Cuándo se descuenta la clase**: al reservar o al venir, y si la ausencia sin
   aviso la consume.
4. **Vigencia contra horario fijo**: si la membresía vence el 20 y ya pagó del 1 al
   9 para el mes siguiente, qué pasa con sus horarios fijos del 21 al 31.
5. **Profesoras**: si tienen que poder tomar asistencia desde el celular, anotar a
   una alumna que llega sin reserva y ver lesiones o limitaciones.

El resto (plazos, anticipaciones, precios, disciplinas, textos, fotos, tipografía)
lo carga ella misma cuando lo tenga: son parámetros, no desarrollo.

## 8. Cómo arrancamos

Propuesta de orden. Respeta las prioridades de la clienta, pero corregida por
dependencias técnicas: hay cosas que si no van primero, obligan a rehacer lo que
venga después.

### Bloque 0 — Los cimientos  🔄 casi cerrado
Nada de esto se "ve" como una función nueva, pero todo lo demás se apoya acá, y
es lo que permite que el estudio ajuste sus reglas sin pedirnos un desarrollo.

**Hecho y verificado contra la base real (05/09/2026):**

| | Migración |
|---|---|
| ✅ **21 parámetros del negocio configurables** — plazos, anticipaciones, ventana de pago del 1 al 9, cuándo se consume la clase. La pantalla se arma sola con lo que trae la tabla: sumar un parámetro es un `INSERT`, no un deploy | `0011` |
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

### Bloque 1 — Agenda y asistencias (prioridad 1 de la clienta, ≈ 3 semanas)
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
- Ciclo de pago 1 al 9, recordatorios y liberación de lugares el día 10.

### Bloque 3 — Membresías y ficha (prioridades 2 y 3, ≈ 3 semanas)
- Tres precios por plan según medio de pago.
- Congelar membresía e historial completo de la membresía.
- Ficha integral: datos físicos, salud en campos separados, contacto de emergencia,
  bitácora de observaciones, bloque de deuda con cobro desde la ficha.
- Baja de alumna con motivo, “por recuperar” y cumpleaños del mes.

### Bloque 4 — Plata (prioridades 4 y 5, ≈ 4 semanas)
- Cuentas y cajas con saldo; cada cobro imputado a una cuenta.
- Caja diaria con apertura, cierre, arqueo y diferencias.
- Gastos con categoría, proveedor, comprobante adjunto y filtros.
- Tablero financiero completo: ventas, cobrado, pendiente, egresos, resultado neto.

### Bloque 5 — Reportes (prioridad 8, ≈ 2 semanas para lo construible)
Módulo propio con filtros por rango de fechas y exportación a Excel y PDF. Se hace
acá porque ya existirían caja y gastos; los reportes de personal e inventario
quedan para cuando existan esos módulos.

### Después, según lo que decida la clienta
- **Comercial** (cupones, beneficios, gift cards, promociones): ≈ 4 semanas.
- **Personal y remuneraciones** (prioridad 6): ≈ 4 semanas.
- **Inventario y mostrador** (prioridad 7): ≈ 5 semanas.
- **Landing administrable y email marketing**: el documento mismo los admite como
  segunda etapa; ≈ 5 semanas.

### Lo primero, esta semana
1. Pasarle a la clienta las **7 preguntas bloqueantes** de §7 y la conversación de
   alcance: si las 10 prioridades entran en la primera versión o cortamos.
2. Con esas respuestas, cerrar las **8 decisiones estructurales** de §6.
3. Arrancar el **Bloque 0**, que no depende de ninguna respuesta y destraba todo lo
   demás.

## 9. Lo que este análisis no cubre

- La sección 14-15 (notificaciones y email marketing) se relevó a mano: su auditoría
  automática se cortó por límite de uso de la sesión. El estado está en la tabla de
  §3 y es confiable, pero no tiene el detalle ítem por ítem del anexo.
- De los nueve grupos auditados, dos (dashboard/caja/gastos e inventario) pasaron
  además por una segunda revisión que verificó la evidencia contra el código. Los
  otros siete son de una sola pasada: los estados 🟡/🔴 son sólidos, pero algún ítem
  marcado como cubierto podría estar un escalón más abajo.
- Las estimaciones son de desarrollo, sin contar reuniones con la clienta, carga de
  datos reales ni pruebas del estudio operando.
