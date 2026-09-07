# INFORME PARA EL DESARROLLADOR — Casa Fé, respuestas de la clienta + documento de políticas

Fuentes: `/Users/matiaslujanw/Desarrollo/sistema-pilates/docs/casa-fe-membresias-y-condiciones.txt` (6 páginas, 15 secciones) + las 20 respuestas. Cruce contra el código al 06/09/2026, rama `matias`, última migración aplicada `0022`.

---

# 1. LO QUE SE REHACE

Once decisiones ya construidas que las respuestas contradicen. Ordenadas por lo que cuesta descubrirlas tarde.

---

### 1.1 · La lista de espera con oferta y turno: la 0022 construyó el producto equivocado

**Qué se había hecho.** `supabase/migrations/0022_forma_de_la_reserva.sql:41-100` agregó el estado `'ofrecida'` al CHECK de `reservations.status`, `:200-203` la columna `offer_expires_at`, `:211-213` el índice parcial `reservations_oferta_idx` (indexa solo las filas `status = 'ofrecida'`), y `supabase/migrations/0011_configurable.sql:96` ya traía el parámetro `waitlist_offer_minutes = 120` con esta ayuda literal en pantalla:

> *"Cuando se libera un lugar se le ofrece a la primera de la lista de espera. Si no confirma en este tiempo, pasa a la siguiente."*

Las tres piezas modelan **una alumna por vez, con reloj**. La 0022 hasta dejó escrita la advertencia de qué faltaba para que el hold funcionara (`:75-82`: sumar `'ofrecida'` a `enforce_class_capacity` en `0018:118-123` y a `class_occupancy` en `0005:121`).

**Qué dice ahora la clienta.** Respuesta 12: avisar a **todas** a la vez, no de a una por orden. El documento §11 decía "notificar a las personas que estén esperando" — ambiguo; la respuesta lo cierra.

**Qué hacer con lo construido.**

| Pieza | Destino |
|---|---|
| `'ofrecida'` en el CHECK | **Dejarlo, no escribirlo nunca.** Sacarlo obliga a otra migración con el `drop constraint` que 0022 tuvo que descubrir por definición (`:88-104`), a cambio de nada: no hay ni va a haber filas en ese estado. Sí hay que **reescribirle el comentario**, o queda un valor del CHECK que nadie sabe por qué está |
| `offer_expires_at` + `reservations_oferta_idx` | **Borrar ambos.** Una fecha de vencimiento de oferta no tiene lectura posible sin turno. Dos líneas en la migración siguiente |
| `waitlist_offer_minutes` | **Borrar la fila o reescribirle `label` y `help`.** Hoy esa ayuda, tal como está, le contradice su propia política en la pantalla de Configuración (grupo "Reservas y clases", `components/configuracion/configuracion-page.tsx:869`) |

**Lo que cambia de significado, no de código.** Con "avisar a todas", el modelo pasa a ser *"el primero que confirma se lo lleva"*. Eso destapa dos cosas que el modelo con turno tapaba:

- **Las perdedoras quedan colgadas.** `reservations` tiene `unique (student_id, class_id, date)` (`supabase/migrations/0001_fase1.sql:133`). Si cinco están en `'lista de espera'` y una confirma, las otras cuatro se quedan en ese estado **para siempre**: nada las limpia, `class_occupancy.waitlist` (`0005:117-124`) las sigue contando, y esa fila le bloquea a cada una anotarse de nuevo a esa clase+fecha. Hay que decidir qué pasa con ellas (pasarlas a `'cancelada'`, borrarlas, o filtrarlas por fecha pasada).
- **Hace falta saber a quién ya se le avisó.** Con aviso masivo, si alguien cancela y vuelve a cancelar la misma clase, el sistema le manda cinco veces el mismo mail a la misma persona. Ese dato no existe hoy en ningún lado. Columna nueva (`notified_at` o una tabla de avisos), **no reciclar `offer_expires_at`**: es semánticamente otra cosa y confunde el diff.

**Y el bloqueo real, que aplica a los dos diseños y no lo resuelve ninguna respuesta:** la única política permisiva de UPDATE que tiene la alumna es `"alumno cancela"` (`supabase/migrations/0005_portal_alumno.sql:75-78`), con `with check (status = 'cancelada')`. **Una alumna no puede pasar su propia reserva a `'confirmada'` desde el portal, por ningún camino.** El comentario de `0022:71-74` afirma que `'ofrecida'` *"cae en la rama else de la política restrictiva… es exactamente lo que hace falta para que ella confirme su oferta desde el portal"* — **eso es incorrecto**: la restrictiva de `0013_permisos_policies.sql:264-279` solo resta permiso, nunca lo otorga. Sin una política permisiva nueva, "la primera que confirma gana" no se puede ejecutar. Corregir ese comentario también, o el próximo que lo lea repite el error.

---

### 1.2 · El descuento de la clase se muda de la pantalla a la base

**Qué se había hecho.** El descuento vive en **un solo lugar, en el navegador, sin trigger**: `lib/api.ts:802-823` (`markAttendance`) pone la reserva en `'asistió'` y hace `classes_used + 1`; `lib/api.ts:779-800` (`undoAttendance`) revierte. Ambos eligen la membresía con la misma consulta suelta (`status='activa'` + `end_date >= hoy` + `order end_date desc limit 1`, `lib/api.ts:808-812`). El parámetro `class_consumption` está en `0011_configurable.sql:97-100` con default `'asistencia'`, y la hoja de ruta lo dejó explícitamente diferido (`docs/REQUERIMIENTOS-CASA-FE.md`, §6, "Diferidas a propósito").

**Qué dice ahora la clienta.** Respuesta 1: se descuenta **al reservar** ("en el momento"). Respuesta 2: si falta sin avisar, **pierde** la clase.

**Qué hacer con lo construido.**

- **`class_consumption` y `absence_consumes_class` no las lee nadie.** Grep sobre todo el repo (`.ts`/`.tsx`/`.sql`): las tres claves de reservas (`cancel_hours`, `class_consumption`, `absence_consumes_class`) aparecen **solo** en el INSERT que las crea (`0011:95-101`), en una mención de texto de `0012_permisos.sql:367` y en la documentación. Cero ocurrencias ejecutables. **Cambiar `class_consumption` a `'reserva'` hoy no cambia absolutamente nada** — es una promesa, no un parámetro. Si la clienta entra a Configuración y lo mueve, queda convencida de que el sistema descuenta al reservar y el sistema le sigue descontando al asistir. **Hasta que exista el trigger, esas tres filas tienen que estar marcadas como pendientes en la pantalla** (hay precedente: los permisos en sombra avisan que todavía no rigen).
- **`markAttendance` / `undoAttendance` dejan de ser el lugar del descuento.** El descuento tiene que ser un **trigger sobre `reservations`**, no dos UPDATE sueltos desde el navegador: hoy el portal crea reservas por un camino (`components/portal/portal-page.tsx:322`) y el staff por otro (`components/agenda/agenda-page.tsx:490`), sin atomicidad.
- **`absence_consumes_class = true` también hay que construirlo.** La clave está en `true` desde `0011:101` y el comportamiento real es el contrario: marcar ausente **no descuenta nada** (`components/reservas/reservas-page.tsx:253` usa `updateReservationStatus` directo, sin tocar la membresía).

**Tres agujeros que ya están y hay que cerrar en la misma migración:**

1. `lib/api.ts:815-816` — si no hay membresía activa o si `classes_used >= classes_total`, `markAttendance` marca la asistencia y **no descuenta, en silencio**.
2. `lib/api.ts:782-789` — la devolución no usa `reservations.membership_id` (columna ya creada en `0022:163`, todavía vacía): si la alumna renovó en el medio, devuelve a la membresía equivocada. La 0022 lo dejó escrito: *"Sin esto, devolver una clase es adivinar"* (`0022:155-158`).
3. **Bug concreto:** `components/asistencia/tomar-asistencia.tsx:71` llama `undoAttendance` para cualquier salida de `'asistió'`, y `undoAttendance` fuerza `'confirmada'` (`lib/api.ts:780`). Pasar a una alumna de *presente* a *ausente* la deja en `'confirmada'` y la pantalla la vuelve a mostrar en "faltan marcar".

**Backfill: recomiendo NO hacerlo.** Dos caminos:

- *(a)* Recorrer las `'confirmada'` futuras, sellarles `membership_id` y descontar con tope `least(classes_total, …)`. Frágil.
- *(b) Corte limpio, recomendado.* El trigger descuenta `on insert` y sella `membership_id`; el camino de asistencia sigue descontando **solo si `membership_id is null`** (fila vieja). Las reservas anteriores terminan su ciclo con la regla vieja, las nuevas nacen con la nueva, ninguna se cobra dos veces, y `membership_id is null` es la marca de "esto es de antes" sin necesidad de guardar una fecha de corte.

---

### 1.3 · Suspender una fecha: la decisión de 0018 pasa de correcta a cobro indebido

**Qué se había hecho.** `supabase/migrations/0018_instancias_de_clase.sql:135-140` decidió **a propósito** que suspender una fecha NO cancela las reservas: *"eso es una decisión con consecuencias (¿se les devuelve la clase?, ¿se les avisa?) y la toma quien suspende, desde la pantalla."* `suspendClassDate` (`lib/api.ts:1431-1443`) hace **un solo upsert sobre `class_occurrences`** y no toca `reservations` ni `memberships`. La pantalla avisa (`components/agenda/agenda-page.tsx:713-717`):

> *"Hay {N} reservas para ese día. Suspender no las cancela: avisales vos y decidí si les devolvés la clase."*

**Qué dice ahora el documento.** §12: *"la alumna no perderá esa clase. La clase podrá recuperarse dentro del mismo período de vigencia"*. Y §13 lo vuelve rutina: feriado lunes = cerrado, contra un mes de 4 clases (respuesta 9) — a una alumna de FE START un lunes feriado le borra **el 25% del mes**.

**Qué hacer con lo construido.** Hoy §12 se cumple **por accidente**: como la clase se descuenta al marcar asistencia y a una fecha suspendida nadie le toma asistencia (`agenda-page.tsx:723` esconde el botón), la clase nunca se descontó y no hay nada que devolver. **La respuesta 1 rompe ese accidente**: con consumo al reservar, suspender un día le come la clase a cada anotada, en silencio.

Lo que hay que agregar en la misma migración del trigger de consumo:

- Trigger `after insert or update on class_occurrences`: al pasar a `'suspendida'`, devolver la clase a cada reserva `'confirmada'` de esa fecha (`classes_used - 1` **contra `reservations.membership_id`**, no contra "la membresía activa de hoy") y dejarla en un estado que diga que canceló el estudio. Al volver a `'normal'` (`clearClassDate`, `lib/api.ts:1473`), **no re-descontar automático**: las alumnas ya reacomodaron la semana.
- **`cancel_kind` necesita un tercer valor.** Hoy el CHECK admite solo `'en plazo'` / `'fuera de plazo'` (`0022:59-60`). Falta `'suspendida por el estudio'`, porque el documento las trata distinto: la del estudio **no consume el cupo de 2 recuperos por mes** (respuesta 5).
- Debe vivir **en la base, no en `suspendClassDate`**, por el mismo argumento de `0018:91-94`: la suspensión también puede entrar por un proceso automático de feriados, y ninguna pantalla tiene que acordarse de devolver nada.
- **Cambiar el texto de `agenda-page.tsx:713-717`.** Hoy le dice a la encargada que decida ella; con §12 la decisión ya está tomada.

**Tres consecuencias colaterales que ya existen y siguen:** las reservas fantasma cuentan en `class_occupancy` (`0005:117-124` cuenta `status in ('confirmada','asistió')`), el portal las sigue listando en "próximas" (`portal-page.tsx:265-275`) sin señal de que la clase no va — el aviso está en la grilla (`portal-page.tsx:577-581`), no en su lista —, y no queda rastro de que el estudio debe una clase.

---

### 1.4 · "Tres precios por plan" era el diseño equivocado: son dos porcentajes

**Qué se había hecho.** `docs/REQUERIMIENTOS-CASA-FE.md:80` y `:319` tienen *"Tres precios por plan según medio de pago"* como ítem del Bloque 3. `0011_configurable.sql:11-12` ya anunciaba `payment_methods` como *"base de los tres precios por plan"*.

**Qué dice el documento.** La tabla de §1 es **aritméticamente exacta en las 18 celdas**, sin una sola excepción:

| Plan | Base | Efectivo | base×0,95 | Tarjeta | base×1,25 |
|---|---|---|---|---|---|
| FE FIRST | 20.000 | 19.000 | 19.000 ✓ | 25.000 | 25.000 ✓ |
| FE START | 45.000 | 42.750 | 42.750 ✓ | 56.250 | 56.250 ✓ |
| FE FLOW | 65.000 | 61.750 | 61.750 ✓ | 81.250 | 81.250 ✓ |
| FE BALANCE | 80.000 | 76.000 | 76.000 ✓ | 100.000 | 100.000 ✓ |
| FE STRONG | 95.000 | 90.250 | 90.250 ✓ | 118.750 | 118.750 ✓ |
| FE FULL | 110.000 | 104.500 | 104.500 ✓ | 137.500 | 137.500 ✓ |

Cocientes `0,950000` y `1,250000` clavados. Ni redondeo, ni una fila retocada a mano.

**Qué hacer.** **Precio base + dos porcentajes configurables**, no tres columnas. Tres columnas serían 12 números a mantener sincronizados a mano, y la primera vez que suba la lista uno queda viejo. **Corregir esa línea de la hoja de ruta.**

La columna va en `payment_methods`: `ajuste_pct numeric(5,2) not null default 0`, firmada (`-5` efectivo, `+25` tarjeta, `0` transferencia). La tabla hoy tiene `code`, `name`, `is_manual`, `active`, `sort_order`, `created_at` (`0011:182-190`) más `default_account_id` y `liquidacion` (`0020_caja_y_gastos.sql:245-250`): **ninguna columna numérica**. Agregarla es seguro — `lib/api.ts:207` lee con `select('*')` y el mapper de `lib/api.ts:242-248` ignora columnas que no conoce, patrón que el propio `0020:233-237` documenta.

**El bloqueo no está en la tabla, está en el front.** `payments.method` sigue siendo un CHECK de cuatro literales (`0002_fase2_mercadopago.sql:37-39`), no una FK al catálogo, y la pantalla de Pagos tiene `METHOD_ICON` / `METHOD_LABEL` / `METHOD_COLORS` como objetos de cuatro claves a mano (`components/pagos/pagos-page.tsx:31-36`, `:38-43`, `:62-67`), con `MethodPicker` recorriendo el array hardcodeado `MANUAL_METHODS` (`:47`). **Orden correcto: derivar el picker del catálogo → agregar el porcentaje → recién después la FK.**

**Dónde engancha el recálculo, y por qué el hueco está libre.** El precio se congela **antes** de que exista medio de pago: `assignMembership` (`lib/api.ts:601-632`) copia `plan.price` a `memberships.price` (`:615`) y el mismo número a `payments.amount` (`:626`), de golpe. El cron lo repite calcado (`app/api/cron/diario/route.ts:159` y `:179`). Después, en `CobrarModal` (`components/pagos/pagos-page.tsx:299+`), el monto se muestra como **texto muerto** (`:352-354`) y `collectPayment` (`lib/api.ts:690-702`) hace `update({ status, method, paid_at })` — **`amount` no aparece en el update**. Ese es exactamente el punto donde el recálculo tiene que engancharse.

(El otro flujo, `RegistrarPagoModal` (`:144`), tiene el monto como `<input>` libre precargado con `student.membership.price` (`:165`): hoy el 5% y el 25% **se tipean a mano, y solo por ahí**.)

**Bug latente al pasar:** `createPaymentMethod` (`lib/api.ts:1043-1049`) ya deja crear un medio ("Cuenta DNI") cuyo `code` el CHECK de `payments.method` va a rechazar. Es inerte solo porque el picker ofrece tres fijos — se despierta el día que el picker lea el catálogo.

---

### 1.5 · Los seis planes sembrados no sirven, y a `plans` le falta una columna

**Qué se había hecho.** `0001_fase1.sql:64-77` define `plans` con `class_count` y `duration_days`. `0001_fase1.sql:238-244` siembra seis planes de demo: Básico Mat 18.000/8, Reformer Premium 32.000/8, Full Flex 42.000/12, Clínico Terapéutico 55.000/8, Yoga & Movimiento 22.000/10, Clase de Prueba 0/1/7d/`is_trial`.

**Qué dice el documento.** Seis planes FE, con **frecuencia semanal** además del total: 1/4, 2/8, 3/12, 4/16, 5/20.

**Contra el seed: cero coincidencias de nombre, cero de precio, una sola de cantidad** (y por casualidad).

**Qué hacer.**

- **Falta `weekly_frequency`.** Grep de `week|frecuencia|frequency|weekly` sobre todo `supabase/migrations/*.sql`: los únicos aciertos son `class_sessions.day_of_week` (`0001:115`) y nombres de clases de demo. No hay ningún `alter table public.plans` en ninguna migración posterior a la 0001. Todo el stack trata `class_count` como total mensual: `lib/types.ts:96`, un solo número en el formulario (`components/planes/planes-page.tsx:235`), "N clases por mes" en las dos vistas (`planes-page.tsx:82`, `landing-page.tsx:707`) y `price / class_count` para el precio por clase (`planes-page.tsx:93`, `landing-page.tsx:715`).

  No es presentación: **la frecuencia semanal es lo que define cuántos horarios fijos le corresponden a la alumna**, y el Bloque 2 (`docs/REQUERIMIENTOS-CASA-FE.md:313`) la necesita para saber si genera 1, 2, 3, 4 o 5 reservas por semana. Hoy tendría que deducirla de `class_count / 4` — que es exactamente el cálculo que la respuesta 9 rompe: *"un mes son 4 días, el quinto lunes no suma clase"* significa que `class_count` es siempre `frecuencia × 4` **fijo**, no la cantidad de veces que ese día cae en el mes.

  `alter table public.plans add column weekly_frequency int not null default 0` (0 = sin frecuencia fija, para FE FIRST y planes sueltos). `lib/api.ts:155` ya lee con `select('*')`, así que no rompe nada antes de correrla; hay que darle default en el mapeo de `lib/api.ts:298-309`.

- **`popular` no se puede setear desde la app.** `PlanInput` (`lib/api.ts:704-713`) no lo incluye, y ni `createPlan` (`:715-727`) ni `updatePlan` (`:729-744`) lo escriben. Se **lee** en cuatro lugares (`landing-page.tsx:684,687-691` "El más elegido"; `planes-page.tsx:37,40`). Si la clienta carga los seis planes FE desde la pantalla, **ninguno queda destacado y no hay forma de arreglarlo sin SQL**.

- **`plans.disciplines` es decorativo, y con los planes FE pasa a ser ruido.** Grepeé migraciones y código: no hay trigger ni validación que impida reservar una clase de una disciplina que el plan no habilita. Solo se muestra como chips (`planes-page.tsx:101-108`, `landing-page.tsx:720-731`) — pero el formulario **obliga a elegir al menos una** (`planes-page.tsx:165-168`). Con planes por frecuencia hay que marcar las tres en los seis para poder guardar.

- **FE FIRST no es la "Clase de Prueba" de hoy.** El semilla está en `$0` y 7 días, y la landing la muestra literalmente como *"Tu primera clase es gratis"* cuando `price === 0` (`components/landing/landing-page.tsx:652`). Ahora es un producto **pago de $20.000**. Y §14 dice *"acceder al estudio durante un día"*, que no es lo mismo que una clase: el modelo solo sabe contar clases. Tampoco hay ningún control de **una sola vez por persona** — grep de `is_trial`: nadie valida que no se asigne dos veces.

- **Desactivar los seis viejos apaga la renovación en silencio.** `app/api/cron/diario/route.ts:148`:
  ```ts
  if (!plan?.active || plan.is_trial || student?.active === false) continue
  ```
  Toda alumna con `auto_renew = true` sobre un plan desactivado **deja de renovar** el día que vence, sin notificación ni al staff ni a ella: el `continue` es mudo. Si la clienta desactiva los seis de demo para cargar los FE, todas las membresías vigentes dejan de renovarse y nadie se entera hasta que alguien mire la lista de vencidas. **Arreglar antes de sembrar los planes nuevos.**

- **Y "Asignar plan" falla con un error confuso.** `fetchStudioData` trae solo planes activos (`lib/api.ts:155`). El modal preselecciona el plan actual (`components/alumnos/asignar-plan-modal.tsx:18`), que ya no está en la lista: no se ve nada marcado, pero `planId` es truthy y el botón queda **habilitado** (`:112`). Al tocarlo, `assignMembership` tira `'Plan inexistente'` (`lib/api.ts:602-603`).

---

### 1.6 · Las seis disciplinas: el seed, la cascada frágil y la landing que dice "Seis"

**Qué se había hecho.** `0011_configurable.sql:126-137` creó el catálogo y `:159-165` sembró **seis**: `Pilates Mat`, `Pilates Reformer`, `Pilates Clínico`, `Yoga`, `Stretching`, `Funcional`. Las 23 clases del seed (`0001:272-301`) las usan, más `teachers.disciplines` (`0001:232-236`).

**Qué dice la clienta.** Respuesta 19: **solo tres** — pilates reformer, pilates embarazadas, pilates 3ra edad. Sobran cinco; **faltan dos que no existen en ninguna parte del repo**; coincide una sola.

**Qué hacer.** `update disciplines set active = false where …` **no alcanza**: hay 23 clases apuntando a esos nombres y quedarían despintadas. Recomiendo **renombrar para arrastrar**: `Pilates Mat` → `Pilates Embarazadas`, `Pilates Clínico` → `Pilates 3ra Edad`, y desactivar solo Yoga/Stretching/Funcional (revisando clase por clase de la grilla real cuál va a dónde).

**Ojo: renombrar en SQL NO dispara la cascada.** La cascada es código de la app (`lib/api.ts:987-1022`, `updateDiscipline`): las tres tablas guardan el nombre **como texto, no FK** (`0011:120-123` lo dice explícito), y la app lo reescribe desde el navegador en cuatro pasos **sin transacción** — `class_sessions.discipline` (`lib/api.ts:1000-1003`), `plans.disciplines` y `teachers.disciplines` fila por fila (`:1006-1021`). La migración tiene que actualizar las tres a mano dentro del mismo `begin/commit`.

**Y esa cascada tiene un agujero que conviene cerrar de paso:** exige **cuatro permisos distintos** — `catalogos.editar` para el catálogo, más `agenda.editar`, `planes.editar` y `profesores.editar` para los pasos siguientes (`0013_permisos_policies.sql:133-158`, `:188-205`). Un update rechazado por RLS devuelve `error: null` y cero filas, no lanza. Quien tenga `catalogos.editar` sin los otros **renombra la disciplina y deja las clases apuntando al nombre viejo, sin error visible**. Está anotado en `0012_permisos.sql:364`; hoy los cuatro `legacy_roles` son `{admin,recepcion}`, así que no se rompe con los roles por defecto — se rompe en cuanto alguien arme un rol a medida.

**Desactivar es peor que renombrar** (`deactivateDiscipline`, `lib/api.ts:1026-1029`), porque no hay cascada ninguna:

- `fetchStudioData` trae solo activas (`lib/api.ts:206`): `disciplineStyle` no la encuentra y cae a `DEFAULT_DISCIPLINE_STYLE` (`lib/disciplines.ts:23-33`) — **todas esas clases se vuelven terracota genérico** en agenda, portal y reservas, de golpe.
- `components/agenda/agenda-page.tsx:130` — `useState<Discipline>(cls?.discipline ?? 'Pilates Mat')`. **"Pilates Mat" está escrito a mano como default de clase nueva.** Con tres disciplinas y "Pilates Mat" fuera, crear una clase sin tocar el select guarda `discipline = 'Pilates Mat'` mientras la pantalla mostraba otra cosa.
- El `<select>` (`agenda-page.tsx:255-260`) **no tiene opción vacía y lista solo el catálogo activo**: editar una clase con disciplina fuera de catálogo muestra la primera opción mientras el estado sigue con el valor viejo.
- El chip de filtro (`agenda-page.tsx:870-890`) tampoco la lista: esas clases quedan sin poder filtrarse.
- El toggle del formulario de plan (`planes-page.tsx:263-281`) solo pinta activas: una disciplina desactivada que ya estaba en `plan.disciplines` **queda en el array, invisible, imposible de sacar**, y se reescribe en cada edición.
- El confirm dice *"Las clases que la usan no se tocan"* (`components/configuracion/configuracion-page.tsx:1198`): verdad literal, no dice que se despintan.

---

### 1.7 · La landing publica seis disciplinas que el estudio no dicta, y dice "Seis" a mano

`components/landing/landing-page.tsx:45-70` — `DISCIPLINE_FALLBACK` tiene **exactamente los mismos seis nombres, colores y blurbs** del seed de la 0011. Es el valor del `useState` (`:88-89`, `:1043-1044`), así que **en la primera pintura de cada carga la web pública muestra las seis viejas** —Yoga, Stretching, Funcional…— y recién al resolver el `Promise.all` (`:1059-1094`) se reemplazan. Y solo se reemplazan **si `discRows.length > 0`**: si la consulta a `public_disciplines` falla o tarda (RLS, red), el flash se vuelve permanente y la landing publica seis disciplinas inexistentes con blurbs inventados como si fueran oferta real.

**`landing-page.tsx:571`: `Seis maneras de volver al cuerpo`** está escrito a mano. Con tres disciplinas en el catálogo, la web va a decir "Seis maneras" arriba de tres tarjetas. **Es el error más visible de todo el frente y no lo arregla ninguna migración.** También `:576` (*"Todas combinables entre sí según tu plan"*) deja de ser cierto con planes por frecuencia.

**Qué hacer:** vaciar `DISCIPLINE_FALLBACK` a `{}`, cambiar los dos `?? DISCIPLINE_FALLBACK['Pilates Mat']` (`:583`, `:807`) por `DEFAULT_DISCIPLINE_STYLE` (`lib/disciplines.ts:23-28`, que es exactamente eso y no depende de ningún nombre), y derivar el título de `disciplineNames.length` o sacarle el número.

---

### 1.8 · La profesora "solo consulta" ya no puede seguir siendo solo consulta

**Qué se había hecho.** El 26/08 se recortó el rol profesor: no ve dinero ni datos médicos y no escribe nada. Lo sensible vive en tabla satélite (`student_private`, `0008:18`) precisamente porque **RLS filtra filas, no columnas**.

**Qué dice ahora la clienta.** Respuesta 6: la asistencia la toman **entre profesora y encargada**, hay que tildar la de cada clienta. Respuesta 8: **sí**, las profesoras tienen que ver **lesiones y limitaciones**.

**Qué hacer.** La mitad ya está: tomar asistencia desde el celular con su propia clave de permiso se construyó en el Bloque 1 (`docs/REQUERIMIENTOS-CASA-FE.md`, Bloque 1). Lo que falta es la **partición de la salud en dos niveles**: lo que sirve para dar la clase (lesiones, limitaciones, embarazo → visible a la profesora) y lo confidencial (solo admin y recepción). Como `student_private` es una tabla y no columnas, la partición es **una tabla más o una columna de clasificación con su propia clave de permiso**, no un cambio de política sobre lo que hay. Y `salud.editar` ya tiene su ayuda escrita en términos de "alumn…" (`0012_permisos.sql`), así que entra en el renombre del punto 1.9.

---

### 1.9 · El renombre "Alumnos" → "Clientes": barato en pantalla, prohibido en el esquema

**Qué dice la clienta.** Respuesta 20: renombrar "Alumnos" a "Clientes".

**El universo real.** 90 líneas con coincidencia en `components/` + `app/`, 111 tokens, 23 archivos: **50 líneas → 52 strings visibles**, 27 líneas de identificadores puros, 13 de comentarios. Sumando `lib/`, dos strings visibles más: `lib/api.ts:761` (`'El alumno ya tiene una reserva para esa clase.'`) y `lib/mp-server.ts:160` (`student?.name ?? 'Un alumno'`, que va al cuerpo de una notificación). **Total: 54 strings.**

Los concentrados: `components/reportes/reportes-page.tsx` **9** (títulos de columna en 5 reportes — líneas 54, 71, 140, 153, 176 — **y esos títulos viajan al Excel exportado**, más `'Alumnas nuevas'` :134, `grupo: 'Alumnas'` :135,:149 y el array de grupos :239); `components/pagos/pagos-page.tsx` **5** (:221, :228, :480, :703, :752); `components/agenda/agenda-page.tsx` **5** (:391, :460, :486, :574, :748); `components/alumnos/alumnos-page.tsx` **4** (:130, :166, :174, :204); `components/alumnos/alumno-form-modal.tsx` **4** (:45, :67 ×2, :151); `components/configuracion/configuracion-page.tsx` **4** (:81, :689, :1424, :1619); `components/alumnos/ficha-alumno.tsx` **3** (:111, :194, :210); dos cada uno en `layout/header.tsx` (:11, :60), `layout/sidebar.tsx` (:27, :51), `auth/login-page.tsx` (:172, :318), `dashboard-page.tsx` (:161, :163), `planes-page.tsx` (:117, :304), `reservas-page.tsx` (:81, :158), `tomar-asistencia.tsx` (:95); y uno en `portal-page.tsx:353`, `caja-page.tsx:214`, `landing-page.tsx:550` (`alt=`), `app/sistema/layout.tsx:5` (`metadata.description`).

**Qué es barato (hacerlo).** Los 54 strings. Literales sueltos, sin tests que dependan de ellos, sin efecto en la base. Riesgo: cero. Única sutileza: la pluralización manual (`{n} alumno{s}` en `alumnos-page.tsx:174` y `planes-page.tsx:117`, y el ternario de `tomar-asistencia.tsx:95`).

**Barato pero con migración, en commit aparte.** Textos que vienen de la base: `permission_keys.etiqueta/ayuda/grupo` (7 etiquetas + 9 ayudas + el grupo `'Alumnos'`), los literales dentro de los triggers de notificación (`'Nuevo alumno'`, `'Un alumno pagó $…'`) y 3 `studio_settings.help`. Son `update` puros. **Ojo: no tocar `clave` ni `legacy_roles`, o `perm_diff()` deja de dar cero filas** — el invariante que la CLAUDE.md marca como innegociable.

**Estructural — NO tocar:**

- `public.students` (`0001:79`) y `public.student_private` (`0008:18`); la columna `student_id` en 5 tablas; `my_student_ids()` (`0005:20`, marcada como no configurable) y `notify_new_student()` (`0007:100`). Renombrarlas obliga a reescribir las 9 políticas del portal, las 4 de la 0013, la vista `class_occupancy`, `fetchStudioData` y `lib/reportes-api.ts` entero, con la base en producción. Ganancia visible: ninguna.
- Las **claves de permiso** `alumnos.ver/crear/editar/eliminar` y `usuarios.crear_alumno`. La clave es el contrato entre `permission_keys`, `role_permissions`, `person_permissions`, `can()` y las políticas. **Se renombra la etiqueta, no la clave.**
- El **rol `'alumno'`**: está en el CHECK de `profiles.role` (`0001:13-14`), en el default de `handle_new_user` (`0001:40`, `0004:55`, `0006:28` — que la CLAUDE.md marca explícitamente como no configurable), en el CHECK de `role_permissions.role` (`0012:62`), en `perm_diff` (`0012:292`, `0020:1322`), en el CHECK de `notifications.audience` (`0007:30`) y en el mapeo de `0022:264`. Y una fila de `profiles` que quede con el valor viejo **se queda sin permisos, en silencio**.
- Los nombres de componente y archivo (`AlumnosPage`, `ficha-alumno.tsx`): mecánico, ensucia el diff, no aporta. Si se hace, commit propio.

**Regla: el renombre es de vocabulario de pantalla, no de esquema.** La base sigue hablando de `students`/`alumno`; la pantalla dice "Clientes".

**Dato de idioma que hay que resolver antes de empezar (ver §6).** La clienta escribió "Clientes" en masculino. Su propio documento usa **"alumna/alumnas" 15 veces y "alumno/alumnos" 0**; la palabra "cliente" **no aparece ni una vez** en las 6 páginas. Y el código ya está partido: de los 52 strings de pantalla, **18 femeninos, 32 masculinos, 2 con la forma doble** — y la partición es por antigüedad, no por módulo (Reportes, Caja, Asistencia y Agenda hablan en femenino; Alumnos, Pagos, Reservas y Dashboard en masculino). Hay incoherencia dentro de un mismo archivo: `configuracion-page.tsx:81` etiqueta el rol `'Alumno/a'` y `:1424` del mismo archivo lo etiqueta `'Alumna'`. **Son tres decisiones metidas en una** (la palabra, el género, el número) y la clienta contestó solo la primera.

---

### 1.10 · `cancel_hours = 12` contra 3, y el documento contra sí mismo

`0011_configurable.sql:95` tiene `cancel_hours = '12'`. El documento §7 **propone 2 horas**. La respuesta 3 dice **3 horas**. El documento es más viejo: gana la respuesta. Y §7 tiene un "Punto a revisar" preguntándose si 2 horas alcanzan para volver a ocupar el reformer — que es exactamente la pregunta que un parámetro contesta sin desarrollo: se pone en 3 y ella lo mueve cuando vea cómo funciona la lista de espera.

Nada lee la clave hoy: `updateReservationStatus` (`lib/api.ts:766-772`) escribe `'cancelada'` sin mirar la hora, y la política `"alumno cancela"` (`0005:76-79`) solo exige `status = 'cancelada'`.

Otra contradicción del mismo tipo: §6 dice *"deberá cancelarla previamente desde la app"*, la respuesta 6 dice que la asistencia la tildan profesora y encargada. Son compatibles, pero implica que **el sistema tiene que aceptar cancelaciones por los dos caminos y sellar cuál fue** — para eso están `cancel_kind` y `cancelled_at` (`0022:57-62`), hoy creadas y vacías.

---

### 1.11 · La vigencia: tres agujeros que hoy no se ven y con el documento se van a ver

`memberships` tiene dos fechas sueltas: `start_date date not null default current_date`, `end_date date not null` (`0001:98-99`). El alta hace `start = localISO()` y `end_date = addDays(start, plan.durationDays)` (`lib/api.ts:611-612`); el cron, lo mismo (`route.ts:149-160`).

1. **`end_date` no está en ninguna política, ningún trigger ni ninguna vista.** Grep sobre las 22 migraciones: aparece solo en la definición de la tabla y en el seed. La vigencia se aplica **en el navegador** (`deriveMembershipStatus`, `lib/api.ts:88-100`; `canBook` del portal, `portal-page.tsx:266`). El trigger `enforce_class_capacity` (`0018:96-128`) mira cupo y suspensión, nunca la membresía; la política `"alumno reserva"` (`0005:69-75`) solo mira que sea su propio `student_id`; y **recepción reservando desde la agenda (`agenda-page.tsx:484-500`) no valida ni membresía ni clases restantes**. El documento repite "dentro del período de vigencia" en §4, §5, §7 y §12: si va a ser regla, **tiene que bajar a la base**.
2. **La renovación pierde los días del hueco.** Arranca `start_date: today` y el catch-up mira 7 días atrás: una membresía que venció el 3 y se renueva el 5 empieza el 5 — dos días evaporados. Con vigencia encadenada debería ser `end_date anterior + 1`.
3. **`start_date` sale del reloj del navegador.** `localISO()` (`lib/api.ts:30-32`) usa `getFullYear/getMonth/getDate` del cliente, no el huso del estudio. La migración `0016` unificó el día **para la plata**; la vigencia quedó afuera. En la misma línea, `due_date: addDays(start, 5)` está **hardcodeado** en `lib/api.ts:627` e ignora `payment_grace_days`, que el cron sí respeta (`route.ts:96`): **dos definiciones del mismo plazo**.

Y `duration_days = 30` no es "un mes de 4 semanas" ni un mes calendario: con `class_count = 4`, una FE START que arranca un lunes tiene ventana para 4 **o 5** lunes según el mes — justo lo que la respuesta 9 dice que no debe pasar.

---

# 2. LO QUE QUEDA DECIDIDO

## 2.1 · Parámetros con valor definitivo

**Ya existen en `studio_settings` — es un `update` de una fila:**

| Clave | Valor hoy | Valor definitivo | Origen |
|---|---|---|---|
| `cancel_hours` | `12` | **`3`** | Q3 (gana sobre las 2h de §7) |
| `class_consumption` | `asistencia` | **`reserva`** | Q1 |
| `absence_consumes_class` | `true` | **`true`** (confirmado, pero **hay que implementarlo**: hoy hace lo contrario) | Q2 |
| `priority_pay_from_day` | `1` | **`1`** | §3 confirmado |
| `priority_pay_to_day` | `9` | **`9`** | §3 confirmado |
| `slot_release_day` | `10` | **`10`** | §3 + Q10 confirmado |

⚠ **Los tres primeros no los lee nadie.** Cambiarlos hoy no cambia ningún comportamiento. **Cambiarlos recién junto con el código que los consume**, o marcar esas filas como pendientes en la pantalla.

**Se borran o se reescriben:**

| Clave | Qué pasa |
|---|---|
| `waitlist_offer_minutes` (`0011:96`) | **Borrar la fila**, o reescribirle `label` y `help`: su texto actual contradice la política de Q12 en la propia pantalla |
| `recovery_after_days` (`0011:106`) | Se queda, pero **hay que renombrarle la etiqueta**: hoy dice `'Pasa a "por recuperar" (días)'` con la ayuda "entra en la lista de recuperación", y ese es exactamente el vocabulario que hizo que la clienta no entendiera la pregunta 15. **"Recuperar" queda reservado para la clase perdida, en toda la interfaz.** Propuesta: *"Días sin renovar para ponerla en la lista de contacto"*. Es un `update` de una fila |

**Claves nuevas que hay que crear (`INSERT`, la pantalla se arma sola con lo que trae la tabla — `configuracion-page.tsx:883-905`):**

| Clave propuesta | Valor | Qué resuelve |
|---|---|---|
| `recoveries_per_month` | `2` | Q4 + Q5: 2 recuperos por mes, dentro del mes |
| `weeks_per_month` | `4` | Q9: el quinto lunes no suma clase. `class_count = weekly_frequency × weeks_per_month` |
| `price_rounding` | por definir (§6) | Redondeo cuando la base no sea múltiplo de 20 |

**Columnas nuevas con valor definitivo:**

| Tabla | Columna | Valores |
|---|---|---|
| `payment_methods` | `ajuste_pct numeric(5,2) not null default 0` | transferencia `0`, efectivo `-5`, tarjeta `+25` |
| `plans` | `weekly_frequency int not null default 0` | FE FIRST `0`, START `1`, FLOW `2`, BALANCE `3`, STRONG `4`, FULL `5` |
| `reservations` | `cancel_kind` — ampliar el CHECK | agregar `'suspendida por el estudio'` |

**Datos definitivos:**

- **Disciplinas: tres.** `Pilates Reformer`, `Pilates Embarazadas`, `Pilates 3ra Edad` (Q19).
- **Planes: los seis FE** con precio base = transferencia (tabla en §1.4), `class_count` 1/4/8/12/16/20, `is_trial` solo en FE FIRST (y ahora **pago**, $20.000, no $0), `popular = true` en uno (FE FLOW es el candidato natural).

## 2.2 · Reglas que ya se pueden construir sin preguntar nada más

1. **La clase se descuenta al insertar la reserva**, por trigger, sellando `reservations.membership_id` (Q1).
2. **Faltar sin avisar pierde la clase**; cancelar con ≥3h la devuelve y habilita recupero (Q2, Q3).
3. **Cancelar con <3h = clase perdida, sin recupero** (§6 + Q3). El trigger clasifica en `cancel_kind` comparando `cancelled_at` contra el horario de la clase menos `cancel_hours`.
4. **Máximo 2 recuperos por mes, dentro del mes de la membresía, sujetos a disponibilidad** (Q4, Q5). El puntero ya está: `recovers_reservation_id` (`0022:177`), y los pendientes se **derivan** (canceladas en plazo sin fila que las apunte) en vez de guardarse — criterio ya escrito en `0022:170-175`.
5. **Suspender una fecha devuelve la clase a todas las anotadas**, con `cancel_kind = 'suspendida por el estudio'`, y ese recupero **no consume el cupo de 2** (§12 + Q5).
6. **Lista de espera: se avisa a todas, la primera que confirma se lo lleva** (Q12). Requiere la política permisiva nueva del punto 1.1.
7. **Si llega sin reserva y hay lugar, toma la clase** (Q7). Las columnas de la excepción autorizada ya están: `override_by` / `override_reason` (`0022:194-196`), con la nota de privacidad de `0022:186-192` (la alumna lee sus propias reservas con `select('*')`, así que va a ver su propio `override_reason`).
8. **La asistencia se tilda una por una, y la marcan profesora o encargada** (Q6). La pantalla existe (`tomar-asistencia.tsx`) con su clave de permiso; falta arreglar el bug de "presente → ausente" (punto 1.2).
9. **La profesora ve lesiones y limitaciones** (Q8), partiendo `student_private` en dos niveles.
10. **Al vencer sin pagar se pierde el horario fijo** (Q10 + §3), con `slot_release_day = 10`. Y §3 agrega el matiz: **renovar después no garantiza recuperarlo** — la pantalla tiene que poder decírselo.
11. **Precio base + `ajuste_pct`, recalculado en `CobrarModal`** donde ya se elige el medio (Q13).
12. **La caja cierra por día y controla efectivo, transferencia y tarjetas** (Q16, Q17). **Ya está hecho** — migración `0020`, apertura/cierre con arqueo. Q16/Q17 confirman el diseño, no piden nada. Único detalle a verificar contra su expectativa: Mercado Pago vive en su propia cuenta y **esa plata no entra al arqueo del cajón** (decisión de `0020`).
13. **"Clientes" en la pantalla, `students` en la base** (Q20), con el género por definir (§6).

---

# 3. LO QUE SIGUE ABIERTO

## 3.1 · Lo que bloquea de verdad

### A. La vigencia de la membresía (§4, "PENDIENTE DE CONFIRMACIÓN")

**Es la única pregunta abierta que cambia la *forma* del dato.** Las cinco opciones y su compatibilidad:

| Opción | ¿Entra? | Qué cuesta |
|---|---|---|
| **A. Corrida desde la asignación, N días** (lo de hoy) | ✅ Total | Cero. Ya está en producción |
| **B. Corrida, "un mes exacto"** (20/09→20/10; 31/01→28/02) | ✅ Alta | Chico: una columna `duration_unit` (día/mes) en `plans` y dos lugares que calculan — `lib/api.ts:612` y `route.ts:149`. `end_date` sigue siendo una fecha: **nada más se entera** |
| **C. Corrida desde el pago** | ⚠ Media | Requiere mover `start_date`/`end_date` después de creada la fila y que el webhook de MP las escriba — hoy **nada arranca una vigencia al pagar** (grep sobre `app/api/**`: solo el cron escribe `memberships`). Más definir qué puede hacer entre la asignación y el pago |
| **D. Mes calendario** (1 al último día) | ⚠ Media | Las columnas aguantan, pero necesita igual el cambio de B, y abre dos preguntas nuevas (la que entra el 20, ¿paga entero o proporcional? ¿con cuántas clases arranca?). A cambio, **es la única que hace coincidir vigencia con el ciclo de cobro del 1 al 9** de §3 — hoy son dos relojes distintos y es el choque más pesado del análisis |
| **E. Atada a las clases** ("dura hasta que uses las 4") | ❌ | §5 lo prohíbe explícitamente: las no usadas vencen |

**De qué depende:** los horarios fijos del mes (Bloque 2), el ciclo 1-9 y la liberación del día 10, y la regla "recuperás dentro del mes" (Q4/Q5) — porque *"el mes"* no significa lo mismo en B que en D.

**Recomendación: B como default configurable por plan, y dar la conversación de D recién al construir los horarios fijos.** B no cierra ninguna puerta: si mañana elige D, `end_date` no cambia de forma. Y la pregunta que decide entre las dos es una sola (§6, pregunta 1).

### B. Congelamiento de membresía (§9 + Q14 no entendida)

"Si existirá" es un sí/no, y de ahí cuelga una tabla nueva. **No bloquea el resto; bloquea el módulo.** `freeze_max_days = 30` ya existe (`0011:105`) y faltarían dos parámetros más (veces por año, si pide justificación).

**Y bloquea algo más:** §8 (ausencias prolongadas) y §9 son **dos respuestas distintas a la misma situación** — §8 dice "si te vas de viaje y no pagás, perdés el lugar"; §9 pregunta si va a existir congelar. Si congelar existe, §8 queda a medias escrito. **Hay que resolverlo antes de construir cualquiera de los dos.**

### C. El género y el número del renombre (Q20)

Bloquea el commit del renombre, que si no se hace de una queda a medio camino y duplica el trabajo. Es una pregunta de una línea (§6, pregunta 5).

### D. FE FLOW: ¿combina disciplinas? (§1 vs Q19)

Los seis planes del documento no nombran ninguna disciplina: son "X veces por semana". Con tres disciplinas, queda sin contestar si FE FLOW deja combinar reformer y embarazadas, o si la disciplina se elige al contratar. **No lo contesta ninguna de las 20 preguntas ni el documento.** Bloquea qué se hace con `plans.disciplines` (hoy obligatorio en el formulario y decorativo en la base).

### E. El redondeo de precios

Que las seis filas den entero es una propiedad de *estas* bases, no de la regla: `base×0,95` es entero solo si la base es múltiplo de 20, `base×1,25` solo si es múltiplo de 4. Un aumento a $47.010 escupe $44.659,50. **Bloquea cerrar el módulo de precios**, aunque no impide arrancarlo.

## 3.2 · Lo que se puede parametrizar y arrancar igual

- **§7 recuperación** — ya contestado por Q3/Q4/Q5. El "punto a revisar" (¿2 horas alcanzan?) lo resuelve `cancel_hours` sin desarrollo.
- **§13 feriados** — es operación diaria, no una definición. Regla general escrita (feriado lunes = cerrado) y decisión por fecha desde la agenda. Falta la herramienta, no la respuesta.
- **§15 promociones** — **fuera del alcance definido.** No se construye.
- **Q11 (ventana 21-31 para elegir horario del mes siguiente)** y **Q18 (qué significa "facturado")** — quedaron pendientes de la clienta, pero ninguna bloquea el alcance actual: Q11 es del Bloque de horarios fijos y Q18 es de nomenclatura de reportes, que ya está hecho.

## 3.3 · Mercado Pago: dos cosas que el código no puede resolver solo

- **Tarjeta por MP cobraría el precio base, no base+25%.** `app/api/mp/create-link/route.ts:50` manda `unit_price: Number(payment.amount)` — el monto guardado, que salió de `plan.price`, o sea transferencia. Y **el recargo no se puede aplicar aunque quisiéramos**: al generar el link no sabemos con qué va a pagar, y al acreditarse `mapMpMethod` (`lib/mp-server.ts:63-66`) **descarta `payment_type_id`** y devuelve siempre `'mercadopago'` — justo el dato que dice si fue crédito, débito o dinero en cuenta. Se tira. **Consecuencia comercial: tarjeta en el mostrador paga +25%, tarjeta por el link paga base.** La clienta va a perder plata por esa puerta.
- **Trampa adicional:** el link se genera una vez y se cachea (`create-link/route.ts:38-40` devuelve el `mp_link` viejo). Si el monto cambia por un recargo, el link reusado sigue cobrando el importe anterior. **Cualquier recálculo tiene que invalidar el link.**
- **Las 3 cuotas no están topeadas en ningún lado.** Cero coincidencias de `installment`, `payer_cost`, `max_installments`, `differential_pricing` en `lib`, `app`, `components` y `supabase`. La preferencia (`create-link/route.ts:44-53`, `lib/mp-server.ts:86-93`) manda `items`, `external_reference` y `statement_descriptor`, nada más: **hoy Checkout Pro ofrece las cuotas que la tarjeta permita, no tres.** Si el +25% está calculado para 3 cuotas, alguien pagando en 12 le sale más caro al estudio. Es un campo en el JSON que nadie puso. Tampoco se registra en cuántas cuotas se pagó: `payments` no tiene la columna.

## 3.4 · El dato incómodo: once parámetros declarados que nadie lee

Verificado por grep. El único consumidor de `settingNum` es `lib/api.ts:265` (`expiry_warning_days`); el cron lee tres claves propias (`route.ts:102-104`); del lado SQL, `public.param()` (`0020:129-138`) tiene tres llamadores, todos de caja (`0020:975`, `:976`, `:1122`).

Quedan **once declarados y sin código**: `cancel_hours`, `waitlist_offer_minutes`, `class_consumption`, `absence_consumes_class`, `freeze_max_days`, `recovery_after_days`, `priority_pay_from_day`, `priority_pay_to_day`, `slot_release_day`, `debt_reminder_days`, `priority_reminder_days`.

**Parametrizar destrabó la conversación, pero cada parámetro sigue necesitando su código.** Y mientras tanto la pantalla de Configuración le promete a la clienta comportamientos que no existen.

---

# 4. LO NUEVO DEL DOCUMENTO

Requerimientos que no estaban en las 20 preguntas ni en el análisis anterior.

| § | Requerimiento | Estado | Evidencia |
|---|---|---|---|
| **10** | **La alumna cambia de plan desde la app**, sujeto a disponibilidad, frecuencia y **diferencia económica** | 🔴 **Nada** | El portal no tiene ninguna pantalla de plan: `portal-page.tsx:167-168` solo muestra el vigente y deriva a recepción (`:146`, `:481`). Cambiar plan existe **solo para el staff**, y es un botón que abre el mismo modal que "Renovar": `ficha-alumno.tsx:552-566` — los dos llaman `setShowAssignPlan(true)`, o sea que **un cambio de plan hoy es indistinguible de una renovación**. Y no hay proceso de compra en el portal: la alumna solo paga deudas que recepción ya generó. El prorrateo entre planes no existe |
| **13** | **Feriados** con criterio general (lunes = cerrado) y decisión por fecha | 🟡 **La pieza existe, la operación no** | `class_occurrences` guarda la excepción con motivo que la alumna lee (`0018:22-47`) y el trigger rechaza reservas ese día (`0018:107-109`). Pero se suspende **una clase por vez** desde el detalle (`agenda-page.tsx:458-464`, `:700-707`): **un lunes feriado con 8 clases son 8 clics**. Falta cerrar el día entero de una, y un calendario de feriados |
| **8** | **Ausencias prolongadas y vacaciones** | 🔴 **Nuevo, y es la contracara de §9** | Nada en el código. Ver §3.1.B: §8 y §9 son dos respuestas distintas a la misma situación |
| **14** | **FE FIRST: pase por 1 día, pago ($20.000)** | 🟡 **La marca existe, el producto no** | `plans.is_trial` existe (`0001:74`), el semilla es **gratis y de 7 días** (`:244`), el cron no la renueva (`route.ts:147`), la landing la muestra aparte (`landing-page.tsx:623-624`) y la pantalla de planes la etiqueta (`planes-page.tsx:46`, `:299`). Lo nuevo: ahora es **pago**, y *"acceder al estudio durante un día"* no es *"una clase"* — el modelo solo sabe contar clases. **Y no hay control de una sola vez por persona**: grep de `is_trial`, nadie valida que no se asigne dos veces |
| **2** | **Tarjeta en hasta 3 cuotas** | 🔴 **Nuevo y silencioso** | Ver §3.3 |
| **3** | *"Si posteriormente desea renovar, podrá, sujeto a disponibilidad"* | 🔴 **Nuevo (matiz del Agregado 3)** | El análisis previo tenía la liberación del día 10; no tenía el estado siguiente: la que perdió la prioridad y vuelve. **Renovar no siempre alcanza para recuperar el horario**, y la pantalla tiene que poder decírselo |
| **1** | **Los planes son por frecuencia, no por disciplina** | 🔴 **Choque de modelo** | `plans.disciplines text[]` (`0001:70`), obligatorio en el formulario (`planes-page.tsx:165-168`), decorativo en la base. Ver §3.1.D |
| **5** | Las clases **vencen, no se acumulan, no se transfieren, no generan saldo** | 🟢 **Se cumple, por accidente** | Cada membresía es una fila nueva con `classes_total` copiado del plan y `classes_used = 0` (`lib/api.ts:613-614`; `route.ts:157-158`). Nada lee el sobrante de la anterior. **Pero se cumple por construcción, no por regla**: como `end_date` no lo hace cumplir nadie (§1.11), una alumna puede seguir reservando después del vencimiento desde la agenda del staff. Y "no genera saldo a favor" se vuelve delicado con el consumo al reservar |
| **12** | Si cancela Casa Fe, la alumna no pierde la clase | 🟡 **Hoy zafa, mañana no** | Ver §1.3 |
| **11** | Lista de espera "gestionada por la app y la encargada" | 🟡 **Pasiva** | Ver §1.1 y §5 abajo |

**Y una omisión del propio documento:** la página final resume **cuatro** pendientes, pero el cuerpo tiene **seis** — se le caen §11 (lista de espera) y §13 (feriados). Conviene no perderlos.

---

# 5. EL ORDEN

Alcance definido: **terminar lo que hay + de lo nuevo, solo Personal y remuneraciones.** Afuera: promociones, cupones, beneficios, gift cards, productos e inventario. **Reportes ya está hecho** (migración `0021`, verificado contra la base: cobros 58 filas / $1.793.000, deudas 5 / $165.000, resultado 6 meses, cuadrado con el tablero).

Corregido por dependencias: lo de más abajo se apoya en lo de más arriba, y cambiarlo de orden obliga a rehacer.

---

### Paso 0 — Los arreglos que hay que hacer antes de tocar nada (chicos, independientes)

Todos son bugs vivos o trampas que se despiertan con los cambios de abajo. Ninguno depende de una respuesta de la clienta.

- `app/api/cron/diario/route.ts:148` — el `continue` mudo sobre `!plan.active` tiene que dejar rastro (notificación al staff o contador en el resumen). **Bloqueante para sembrar los planes FE**, o desactivar los viejos apaga la renovación de todas en silencio.
- `components/asistencia/tomar-asistencia.tsx:71` — pasar de presente a ausente deja `'confirmada'` en vez de `'ausente'`.
- `components/alumnos/asignar-plan-modal.tsx:18` — si el plan preseleccionado no está en `plans`, arrancar en `''`; hoy el botón queda habilitado apuntando a un id que `lib/api.ts:603` rechaza.
- `components/layout/notifications-bell.tsx:19-44` — los tres `Record<NotificationType, …>` de **seis** claves escritos a mano. Un tipo desconocido deja `TYPE_ICON[t]` en `undefined` y **React tira la campana entera**. La `0020:1224-1230` ya lo dejó anotado: hay tres tipos de caja permitidos por el CHECK y todavía no emitidos justamente por esto, y `membresia_renovada` está así desde la 0010. **El fallback se arregla antes del primer aviso de lista de espera.**
- `lib/api.ts:627` — `due_date: addDays(start, 5)` hardcodeado; usar `payment_grace_days`.
- `lib/api.ts:30-32` — `localISO()` usa el reloj del navegador; la vigencia tiene que derivar el día del huso del estudio, como ya hace la plata desde la `0016`.
- Marcar como **pendientes en la pantalla** las claves que nadie lee (`class_consumption`, `absence_consumes_class`, `cancel_hours`, `waitlist_offer_minutes`), con el mismo criterio que los permisos en sombra.

---

### Paso 1 — Catálogo: disciplinas, planes y el renombre (migración `0023` + código)

Va primero porque **es la cara que la clienta ve** y porque el resto se apoya en `weekly_frequency`.

**Migración:**
1. `alter table public.plans add column weekly_frequency int not null default 0`.
2. Renombrar disciplinas para arrastrar (`Pilates Mat`→`Pilates Embarazadas`, `Pilates Clínico`→`Pilates 3ra Edad`), desactivar Yoga/Stretching/Funcional, **y actualizar a mano `class_sessions.discipline`, `plans.disciplines` y `teachers.disciplines` en el mismo `begin/commit`** — la cascada de `lib/api.ts:987` es código de la app, un `update` en SQL no la dispara.
3. Sembrar los seis planes FE con precio base, `class_count`, `weekly_frequency`, `is_trial` en FE FIRST y `popular` en FE FLOW; desactivar los seis de demo (**después** del arreglo del cron).
4. Los `update` de vocabulario: `permission_keys.etiqueta/ayuda/grupo`, `studio_settings.label/help` (incluida la de `recovery_after_days`), literales de los triggers de notificación. **Sin tocar `clave` ni `legacy_roles`.** Verificar después: `select * from public.perm_diff()` tiene que seguir dando cero filas.

**Código:**
- `lib/api.ts:704-744` — agregar `popular` a `PlanInput`, `createPlan` y `updatePlan`, y su toggle en el formulario. Sin esto los seis FE nacen sin destacado y la landing pierde "El más elegido" para siempre.
- `lib/api.ts:298-309` — default para `weekly_frequency` en el mapeo.
- `components/landing/landing-page.tsx:45-70` — vaciar `DISCIPLINE_FALLBACK` a `{}`; `:583` y `:807` → `DEFAULT_DISCIPLINE_STYLE`; `:571` "Seis maneras" → derivado de `disciplineNames.length` o sin número; revisar `:576`; y el `price === 0` de `:652` deja de aplicar a FE FIRST.
- `components/agenda/agenda-page.tsx:130` — sacar el `'Pilates Mat'` hardcodeado (`disciplines[0]?.name ?? ''`) y agregar `<option value="">` al select de `:255-260`.
- **El renombre: los 54 strings, en su propio commit**, una vez contestada la pregunta de género.
- (Aparte, si se quiere: `updateDiscipline` en una función SQL con `security definer` en vez de cuatro updates desde el navegador. Cierra el agujero de los cuatro permisos y da atomicidad.)

**Depende de:** la respuesta D de §3.1 (¿FE FLOW combina disciplinas?) para saber qué hacer con `plans.disciplines`, y la de género para el renombre. **Todo lo demás se puede hacer ya.**

---

### Paso 2 — El consumo de la clase, en la base (migración `0024`)

El corazón del cambio. Va antes que la lista de espera y antes que los precios porque **redefine qué significa una reserva**.

- Trigger de consumo `on insert on reservations`: descuenta y sella `membership_id`. Corte limpio, **sin backfill**: el camino de asistencia descuenta solo si `membership_id is null`.
- Trigger de clasificación de cancelación: llena `cancel_kind` y `cancelled_at` comparando contra el horario menos `cancel_hours`. Devuelve la clase si fue en plazo; no la devuelve si fue fuera de plazo o ausente (`absence_consumes_class`).
- Trigger sobre `class_occurrences`: al suspender, devolver la clase a cada `'confirmada'` **contra su `membership_id`**, con `cancel_kind = 'suspendida por el estudio'` (ampliar el CHECK de `0022:59-60`). Al volver a normal, no re-descontar.
- Recuperos: tope `recoveries_per_month = 2`, dentro del mes, sujeto a disponibilidad; los del estudio **no consumen el cupo**. Usar `recovers_reservation_id` (`0022:177`) y derivar los pendientes.
- La excepción autorizada de Q7 (`override_by`/`override_reason`, `0022:194-196`) con su clave de permiso.
- Sacar el descuento de `lib/api.ts:802/779` y arreglar los tres agujeros de §1.2.
- **La vigencia baja a la base**: el trigger de validación tiene que mirar la membresía, no solo el cupo — hoy no la mira nadie (`0018:96-128`), y recepción reservando desde la agenda no valida nada.
- Cambiar el texto de `agenda-page.tsx:713-717`.

**Depende de:** la respuesta A de §3.1 (vigencia) **solo para el punto de "dentro del mes"** del recupero. El resto se puede construir con la vigencia actual y ajustar después: `end_date` no cambia de forma entre A, B y D.

---

### Paso 3 — Los precios (migración `0025`)

- `payment_methods.ajuste_pct` + la UI en Configuración (`configuracion-page.tsx:1282+`, que hoy expone solo nombre, activo y alta).
- **Primero derivar `MethodPicker` del catálogo** (`pagos-page.tsx:47`, más `METHOD_ICON`/`METHOD_LABEL`/`METHOD_COLORS` de `:31-43` y `:62-67`), después aplicar el porcentaje, y recién después considerar la FK de `payments.method`. En ese orden, o el porcentaje guardado nunca llega al cobro.
- El recálculo engancha en `CobrarModal` (`pagos-page.tsx:299+` / `collectPayment`, `lib/api.ts:690-702`): hoy `amount` no está en el update, el hueco está libre.
- Invalidar `mp_link` cuando el monto cambia (`create-link/route.ts:38-40`).
- Regla de redondeo desde `studio_settings`.
- Mercado Pago: decidir con la clienta (§6, pregunta 4) y, si corresponde, mandar `payment_methods.installments` en la preferencia y dejar de tirar `payment_type_id` en `mapMpMethod` (`lib/mp-server.ts:63-66`).

**Depende de:** la respuesta E (redondeo) para cerrarlo, y la de MP para el alcance.

---

### Paso 4 — Lista de espera y avisos a la alumna (migración `0026`)

- Borrar `offer_expires_at` y `reservations_oferta_idx`; borrar o reescribir `waitlist_offer_minutes`; corregir los comentarios de `0022:63-82`.
- **La política permisiva nueva** para que la alumna confirme desde el portal. Es el bloqueo real (§1.1).
- Decidir qué pasa con las que pierden (el `unique (student_id, class_id, date)` de `0001:133`).
- Registro de a quién se le avisó (columna o tabla nueva).
- Tipo de notificación `lugar_liberado` — **después** del fallback de la campana (Paso 0).
- **Encender el canal hacia la alumna.** Lo que ya existe: `pushToUser(admin, userId, payload)` en `lib/push-server.ts:65`, **escrita y hoy sin ningún llamador** — es exactamente lo que hace falta; la política `"alumno ve sus notificaciones"` (`0007:44-47`) viva y nunca usada; y el **email a la alumna ya probado en producción** vía Resend (`lib/email-server.ts`, envíos desde `route.ts:308-311`), que es el camino de menor fricción. Falta el botón de activar push en el portal: hoy está **solo** en la campana del staff (`notifications-bell.tsx:79-95`), y ese header lo monta únicamente `app/sistema/page.tsx`.
- **El cron diario no alcanza**: una cancelación a 3 horas del plazo hay que avisarla en minutos. O trigger que inserta + cron corto que despacha, o disparar el envío desde el endpoint que cancela.
- **WhatsApp: no hay una sola línea de código.** Grep de `whatsapp|wa.me|twilio` sobre `.ts/.tsx/.sql`: solo documentación, el parámetro `studio_whatsapp` (el número del estudio para la landing) y links `wa.me` armados a mano para que la encargada los mande (`dashboard-page.tsx:243`, `:393`, `pagos-page.tsx`). Automático requiere la API de Meta: **costo por conversación y plantillas aprobadas** — y con "avisar a todas" ese costo se multiplica por el largo de la lista en cada cancelación. **Decirlo antes de prometerlo.**

---

### Paso 5 — Feriados y suspensión masiva

Chico y de alto valor operativo una vez que existe el trigger del Paso 2. Cerrar el día entero de una (hoy son 8 clics para un lunes de 8 clases, `agenda-page.tsx:458-464`, `:700-707`) y un calendario de feriados con la regla general "lunes = cerrado".

---

### Paso 6 — Vigencia y horarios fijos (Bloque 2)

Acá recién entra la respuesta A. `duration_unit` en `plans`, encadenar la renovación (`route.ts:149-160`), y sobre eso los horarios fijos del mes, el ciclo 1-9, los recordatorios y la liberación del día 10 — todo lo cual necesita `weekly_frequency` del Paso 1 y "dentro del mes" del Paso 2.

Aquí también: §3 "renovar no garantiza recuperar el horario", y Q11 (la ventana 21-31), si para entonces contestó.

---

### Paso 7 — Congelamiento + ausencias prolongadas (§8 y §9 juntos)

Solo si la respuesta a la pregunta 2 de §6 es sí. Se construyen **juntos o ninguno**: son dos respuestas a la misma situación.

---

### Paso 8 — Cambio de plan desde la app (§10)

Necesita el prorrateo, que necesita los precios (Paso 3) y la vigencia (Paso 6). Y necesita separar "cambiar plan" de "renovar", que hoy son literalmente el mismo botón (`ficha-alumno.tsx:552-566`).

---

### Paso 9 — Cerrar lo que quedó abierto de bloques anteriores

- Adjuntar la foto del comprobante de gasto (primer uso de Storage, migración aparte) — Bloque 4.
- Avisos de caja en el proceso diario: caja sin cerrar, diferencia — Bloque 4 (los tipos ya están permitidos por el CHECK desde `0020:1232-1239`, faltan por el fallback de la campana).
- Instancias con cambio de horario por fecha: la tabla ya lo soporta, falta la pantalla — Bloque 1.
- Encendido gradual de permisos, grupo por grupo, empezando por Catálogos — Bloque 0.
- Probar el portal de la alumna cancelando una reserva (ejercita la rama de aislamiento de la restrictiva nueva) — Bloque 0.

---

### Paso 10 — Personal y remuneraciones (lo único nuevo del alcance)

**Estado: 🔴 nada.** `public.teachers` (`0001:53-62`) tiene `name`, `disciplines`, `phone`, `email`, `color`, `active`, `created_at`. **Ninguna columna laboral.** Grep de `teacher_private|horas_trabajadas|remuneracion|salario|sueldo` sobre migraciones, `lib/`, `components/` y `app/`: cero.

Lo que hay que construir: ficha laboral (fechas, datos de contratación), registro diario de horas, reemplazos (la pieza de reemplazo de profesora por fecha ya existe en `class_occurrences`, `0018`), condiciones salariales **con historial**, y liquidación por período.

**Dos criterios de la casa que aplican de entrada:**
- **Los sueldos van en `teacher_private`, no como columnas de `teachers`** — RLS filtra filas, no columnas. Es literalmente el ejemplo que da la CLAUDE.md.
- **Las cifras se derivan, no se copian** — el mismo criterio de `0020` con el libro de caja: la liquidación se calcula desde las horas y las condiciones vigentes, no se duplica en una tabla que se desincroniza.

Va último porque **no bloquea nada** y porque el reporte de personal que lo acompaña ya tiene su molde hecho en la `0021`.

---

# 6. LAS PREGUNTAS QUE FALTAN

Siete, listas para copiar y pegar. Las dos primeras son las que no se entendieron.

---

### 1 · Congelar la membresía (reescribe la pregunta 14)

> Nos quedó una duda de la sección 9 del documento, y en realidad es una sola pregunta bien concreta.
>
> Pensá en una clienta que te avisa que se va tres semanas de vacaciones. Hoy, por lo que dice el documento, tiene dos caminos: paga el mes completo igual y le guardás el día y horario, o no paga y pierde el lugar.
>
> **La pregunta es si querés que exista un tercer camino: dejarle el mes "en pausa".** Es decir: el día que se va, le frenás el reloj. No le corren los días que le quedaban de vigencia ni pierde las clases que no usó. Cuando vuelve, retoma justo donde estaba, con esos mismos días y esas mismas clases.
>
> Si la respuesta es **no**, listo, no lo armamos y queda como dice hoy el documento.
>
> Si la respuesta es **sí**, necesitamos cuatro números o reglas tuyas, y todos los vas a poder cambiar vos después desde el sistema:
>
> 1. ¿Por qué motivos se lo permitís? ¿Solo viaje o enfermedad, o cualquier motivo que te digan?
> 2. ¿Cuántos días como máximo puede quedar en pausa? (nosotros dejamos puesto 30 hasta que nos digas)
> 3. ¿Cuántas veces al año se lo podés dar a la misma clienta?
> 4. ¿Le pedís algo que lo justifique (por ejemplo un certificado médico) o alcanza con que te avise?
>
> Y una última, que es la que más cambia las cosas: **mientras está en pausa, ¿le seguís guardando su día y horario fijo, o ese lugar lo largás y cuando vuelve entra donde haya?**

---

### 2 · Las clientas que dejaron de venir (reescribe la pregunta 15)

> Acá la culpa fue nuestra: usamos la palabra "recuperar" para dos cosas distintas y se mezcló todo. En este sistema "recuperar" significa que una clienta **recupera una clase** que se le perdió (eso ya nos lo contestaste: dos por mes, dentro del mes). Esta pregunta es de otra cosa, y no tiene nada que ver con las clases. Es sobre **las clientas que dejan de venir**.
>
> Pensalo así: a una clienta se le termina el mes y no vuelve a pagar. La primera semana no te preocupa, seguro se atrasó, ya va a aparecer. Pero llega un momento en que decís "a esta la perdimos, hay que llamarla".
>
> **¿Cuántos días dejás pasar desde que se le vence el mes hasta que decís eso? ¿Una semana? ¿Quince días? ¿Un mes?**
>
> Lo que nos digas es el día en que el sistema te la va a poner sola en una lista aparte, con el teléfono al lado, para que la llames o le escribas. Nadie tiene que acordarse ni ir a buscarla: aparece ahí. Y si vuelve a pagar, sale de la lista sola.
>
> Si te resulta más fácil pensarlo al revés: **¿cuántos días sin pagar tiene que pasar una clienta para que te empiece a preocupar?** Ese es el número.

*(Nota para nosotros: la colisión de vocabulario está escrita en la base. El parámetro se llama `recovery_after_days` y su etiqueta en Configuración dice literalmente `'Pasa a "por recuperar" (días)'` con la ayuda "entra en la lista de recuperación" — `0011_configurable.sql:106`. Si le mostramos esa pantalla tal cual está, la confusión se repite. Renombrar la etiqueta y reservar "recuperar" exclusivamente para la clase perdida, en toda la interfaz. Es un `update` de una fila.)*

---

### 3 · Desde cuándo y hasta cuándo vale una membresía (la que el documento dejó pendiente en la sección 4)

> Esta es la única que nos falta para poder armar bien los horarios fijos del mes, así que es la más importante de todas.
>
> Hoy el sistema hace lo más simple: **el mes le arranca el día que se la das y le dura un mes desde ahí.** Si la anotás un 20 de septiembre, le vale hasta el 20 de octubre. Si la anotás un 3, le vale hasta el 3.
>
> Eso funciona bien, pero choca con una cosa que vos misma pusiste en el documento: **el cobro es del 1 al 9 de cada mes.** O sea que tenés dos calendarios andando al mismo tiempo — el de cada clienta, que arranca cuando se anotó, y el del estudio, que va del 1 al 9.
>
> Entonces la pregunta es cuál de los dos manda:
>
> **Opción A — cada una tiene su propia fecha.** Como ahora. La que se anotó un 20 renueva un 20, la que se anotó un 3 renueva un 3. Es lo más justo para la que entra a mitad de mes, pero significa que todos los días del mes hay alguien renovando.
>
> **Opción B — todas van del 1 al último día del mes.** El mes de todas empieza el 1 y termina el 30 o 31, y todas pagan entre el 1 y el 9. Es mucho más ordenado para vos y encaja perfecto con la regla del 1 al 9. Pero abre una pregunta: **la que se anota un 20, ¿te paga el mes entero igual, o le cobrás solo lo que queda?**
>
> Y una situación concreta que nos ayuda a entender qué querés, sea cual sea la que elijas: **si a una clienta se le termina el mes el 20, y ya te pagó del 1 al 9 el mes siguiente, ¿su mes nuevo le arranca el 21 o le arranca el 1 del mes que viene?**

---

### 4 · Tarjeta por Mercado Pago

> Dos cosas de la tarjeta que el sistema no puede resolver solo y necesitamos que decidas vos.
>
> **Primera: el recargo del 25% por el link de pago.** Cuando le mandás a una clienta el link de Mercado Pago, ella entra y elige ahí adentro cómo paga: con tarjeta de crédito, con débito, o con la plata que tenga en la cuenta de Mercado Pago. **Nosotros no sabemos de antemano cuál va a elegir**, así que cuando armamos el link tenemos que poner un solo precio.
>
> Hoy el link manda el precio de transferencia. O sea que **si paga con tarjeta por el link, no le estamos cobrando el 25%** — te lo estás perdiendo. Tenés tres caminos:
>
> - Dejarlo así, y el 25% de tarjeta lo cobrás solo cuando pasan la tarjeta en el estudio.
> - Ponerle el 25% al link. Pero ojo: **también se lo van a comer las que pagan con débito o con saldo de Mercado Pago**, que hoy pagarían el precio base.
> - No ofrecer más el link para tarjeta, y que por el link solo se pague transferencia.
>
> **Segunda: las 3 cuotas.** El documento dice "hasta 3 cuotas", pero eso hoy no está puesto en ningún lado: **el link de Mercado Pago le ofrece a la clienta todas las cuotas que su tarjeta permita**, pueden ser 6 o 12. Y cuantas más cuotas, más comisión te descuenta Mercado Pago. ¿Querés que lo dejemos topeado en 3, como dice el documento?

---

### 5 · Cómo las llamamos

> Nos pediste cambiar "Alumnos" por "Clientes" en todo el sistema. Lo hacemos, pero necesitamos que nos digas exactamente cómo, porque una vez que lo cambiamos queda así en las 54 pantallas y en los reportes que bajás a Excel.
>
> Vos escribiste "Clientes", en masculino. Pero **en tu documento de condiciones escribiste "alumna" quince veces y "alumno" ninguna** — está todo en femenino. Y hoy el sistema está mezclado: algunas pantallas dicen "Alumna" y otras "Alumno".
>
> Elegí una y la dejamos igual en todos lados:
>
> - **"Cliente / Clientes"** — en masculino, como nos lo escribiste.
> - **"Clienta / Clientas"** — en femenino, como habla tu documento.
> - **"Cliente / Clientes"** para el menú y los títulos, pero **"la clienta"** cuando el sistema le habla a alguien en una frase (por ejemplo: "avisale a la clienta que la clase se suspendió").
>
> La tercera es la que más natural suena, pero es la que menos ordenada queda en los reportes. Vos decidís.

---

### 6 · Los planes y las tres disciplinas

> Tus seis membresías (FE START, FE FLOW, etc.) están armadas por **cuántas veces por semana** viene la clienta, no por qué clase toma. Y las disciplinas ahora son tres: reformer, embarazadas y tercera edad.
>
> La pregunta es cómo se cruzan esas dos cosas:
>
> **¿Una clienta con FE FLOW (2 veces por semana) puede hacer un día reformer y el otro día embarazadas?** ¿O cuando contrata elige una sola disciplina y todas sus clases del mes son de esa?
>
> Es una pregunta de una línea pero cambia cómo se arma la pantalla de los planes, así que preferimos preguntártela antes de cargarlos.

---

### 7 · Cuando los precios no den redondos

> Un detalle chico ahora, pero que se vuelve un problema el día que subas los precios.
>
> Los seis precios que nos pasaste dan justo: 45.000 menos 5% son 42.750, más 25% son 56.250. Ni un centavo de resto. Eso pasa porque los seis números que elegiste son "amigables".
>
> Pero el día que aumentes y pongas, por ejemplo, **$47.010**, el 5% de descuento da **$44.659,50**. Con cincuenta centavos.
>
> **¿Qué querés que haga el sistema en ese caso?**
>
> - Mostrarlo tal cual, con los centavos.
> - Redondear a los $100 más cercanos (quedaría $44.700).
> - Redondear a los $50 (quedaría $44.650).
> - Redondear siempre para arriba, a los $100 (quedaría $44.700).
>
> Lo que elijas lo vas a poder cambiar después desde el sistema, sin pedirnos nada.