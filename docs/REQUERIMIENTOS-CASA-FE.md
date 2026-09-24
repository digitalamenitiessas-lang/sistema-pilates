# Casa Fe — qué cubrimos del documento nuevo y cómo arrancamos

> Cruce del PDF **“Requerimientos y ajustes del sistema Casa Fé”** (18 páginas, 17
> secciones + 4 agregados de último momento) contra el código de este repo.
> Fecha del análisis: **05/09/2026**. Detalle ítem por ítem: [`requerimientos-casa-fe-detalle.md`](requerimientos-casa-fe-detalle.md).
> Estado de nuestro trabajo hasta acá: [`PLAN.md`](PLAN.md).
>
> **¿Buscás qué falta? Está en la §0, acá abajo.** Es la única lista al día; el
> resto del documento es el análisis y la historia.

## 0. LO QUE FALTA — la lista viva  ·  al 24/09/2026

> **Esta es la única lista al día.** Las secciones de abajo son el análisis y la
> historia de cómo se llegó acá, y varias quedaron viejas a propósito: son la
> línea de base contra la que se mide el avance. Si algo de acá y algo de allá se
> contradicen, **manda esta sección** — y si una fila de acá dice algo que la base
> desmiente, manda la base.
>
> **Actualizar esta lista es parte de terminar algo, no un extra.**

### Dónde quedó todo, contra las 10 prioridades del estudio

**Nueve en verde.** La única afuera es Inventario, que Matías excluyó (§7).
El 15/09 entraron diez migraciones —`0046` a `0055`— y pasaron a verde la 3
(ficha), la 4 (tablero), la 6 (personal) y la 10 (notificaciones).

El **16 y 17/09** no se agregaron funciones: se probó el sistema con las
sesiones reales de una clienta y de una profesora, y eso encontró cosas que
ninguna lectura de código había encontrado. Entraron `0056` a `0060`. El
detalle está en `PLAN.md`; lo que importa acá es que **cuatro de los cinco
hallazgos eran agujeros, no faltantes**, y que se descubrieron ejerciendo el
sistema y no leyéndolo. Tres de ellos venían anotados por escrito en
migraciones viejas, esperando a que alguien mirara.

La **tarde del 17/09** entraron `0061` a `0068` y se cerró el alta de la
clienta: se carga con su mail y su documento, el último paso del formulario le
crea el acceso, le llega el mail con cómo entrar, y al ingresar el sistema le
exige elegir una contraseña propia. Cada clienta tiene además su número de
credencial (`0067`), con el formato que el estudio decide desde Configuración.

Y hay una lección de método que conviene no perder: **ese bloque se ejerció en
producción y no en desarrollo, y ahí estuvo todo lo que encontró**. El mail no
salía por una variable con comillas que en local no molestaban; el link de los
mails apuntaba a `localhost`; y el lector de configuración del servidor leía
una variable que sólo existe en `.env.local`, así que en producción devolvía
vacío **siempre** — y no se notaba porque su valor de respaldo era casualmente
el correcto. Ninguno de los tres se ve en la máquina de quien programa.

Del **18 al 22/09** entraron `0069` a `0073`. Tres cosas que el sistema no
sabía decir: que algo **se termina** (cancelar una membresía dejaba de
existir: sin cuándo, sin quién, sin por qué, y Reportes no mostraba ninguna),
que algo **fue un error** (deshacer una asignación equivocada, que no es lo
mismo que cancelarla, y que sólo se permite si no dejó huella), y que algo
**todavía no empezó** — el estudio abre el **29/09** y está dando de alta
ahora a las clientas que arrancan ese día, así que la membresía tiene fecha de
inicio y el portal habilita la reserva por fecha: eligen plan hoy, reservan
del 29 en adelante.

Y dos de seguridad. La `0072` cerró que **una clienta podía devolverse las
clases que ya había perdido** reescribiendo `cancel_kind` en sus propias
reservas; salió de una revisión y se reprodujo antes de arreglarla, porque un
hallazgo que nadie ejerció es una hipótesis. La `0073` es el segundo barrido
de la familia de la `0057`: cinco funciones `definer` contestaban con la llave
pública —**una de ellas escribe** en `memberships`—, los dos reportes de
ocupación le contestaban a cualquier cuenta logueada incluida una clienta, y
`class_occupancy` se leía sin sesión. Las seis cerradas y verificadas el 22/09
ejerciendo lo que podía romperse: los cinco cortes de Ocupación dan los mismos
números y el descuento de clases sigue andando.

La **tarde del 22/09** entró la `0074` y con ella el módulo de caja pasó a
ser configurable: el estudio puede **crear sus cuentas** —el cajón, los
bancos, las billeteras— y decirle a cada medio de pago a cuál va su plata,
desde Configuración. El modelo estaba entero en la base desde la `0020` y
no había por dónde tocarlo; el muro era un CHECK en `payments.method` con
cuatro valores escritos, que hacía que crear un medio nuevo no sirviera
para cobrar. Ahora manda el catálogo. Verificado cobrando con un "Débito"
creado desde la pantalla, cuya plata fue sola a la cuenta "Macro".

El **23/09** entraron `0075` a `0080`, y son cinco cosas del lado de la
clienta más una del mostrador:

- **La devolución por cancelar tiene tope** (`0076`): con más de 3 horas la
  clase vuelve, pero sólo 2 veces por mes; de ahí en más se pierde. Lo
  difícil no era la regla sino **dónde contarla**: en la vista de consumo
  se podía reciclar el cupo infinito —cancelar, reservar, cancelar—, así
  que la decisión **se sella al cancelar**, con un tercer valor de
  `cancel_kind`. El tope nace sin regir. El recupero quedó apagado.
- **La clienta elige su horario fijo** (`0077`, `0078`): al reservar le
  pregunta si es por esta vez o fijo, y si es fijo le completa el período.
  **En la renovación vuelve a elegir.** El límite lo dice su plan.
- **Promociones y cupones** (`0079`, `0080`): el estudio crea sus
  descuentos desde Configuración —porcentaje o monto, siempre / entre
  fechas / ciertos días del mes, con o sin código, con topes de uso
  totales y por clienta—, y **el monto pasa a calcularlo la base**. Ahí
  está lo importante: hasta hoy el precio lo decidía el navegador, y con
  topes de uso eso no se puede hacer cumplir. Y el anuncio por mail a las
  clientas activas **es un botón, no un efecto de crearla**: un mail al
  padrón entero no se deshace.

El **24/09** entró la `0081`, que es chica y salió de un tropiezo. Para
prender el tope de devoluciones hubo que entrar al SQL Editor: la
pantalla decía "Todavía no rige" y no tenía con qué prenderlo. Al ir a
poner el botón apareció que ponerlo en todos habría sido peor —cinco de
los seis parámetros apagados **no los lee nadie**—, así que `rige` se
partió en dos: `encendible` marca los que el código ya honra y cuya
vigencia decide el estudio. Hoy son dos; los otros cinco pasan a avisar
que la regla no está construida.

**Y quedó rigiendo el tope de dos devoluciones por período**
(`cancel_free_max`), prendido el 24/09 desde la base. Cancelar con más de
tres horas devuelve la clase hasta dos veces por mes; de ahí en más se
pierde. No tuvo efecto retroactivo: no había ninguna cancelación en plazo
viva cuando se prendió.

### Lo que falta construir

| | Qué | Tamaño |
|---|---|---|
| 🔴 | **28 lugares donde una falla se vuelve un booleano y nadie puede saber por qué**, once graves. Salió de barrer el proyecto el 17/09 buscando la forma que tuvo el mail que no salía. Los dos peores no son incomodidades: el proceso diario **inserta la notificación antes de mandar el mail** y sólo cuenta los que salieron (`cron/diario:911`), así que la campana dice "cuota emitida", la clienta no recibió nada y pierde el turno fijo por no renovar; y el webhook de Mercado Pago responde `ok: true` aunque no haya acreditado (`mp/webhook:47`), así que MP no reintenta y el pago queda pendiente para siempre sin un aviso. Después: el `$0` que miente en el tablero si falla `resultado_mensual` (`caja-api:527`), el cupo que vuelve a mentirle a la profesora si `fetchWeekOccupancy` falla (`api:2341`), el mail de "tu membresía venció" saliéndole a quien está al día si falla una lectura (`cron/diario:273`), y el sistema entero sin botones si `mis_permisos` da error (`api:480`) | mediano |
| 🔴 | **La plata "diferida" figura disponible el mismo día.** `payment_methods.liquidacion` distingue lo que acredita al toque (efectivo, transferencia) de lo que no (tarjeta, Mercado Pago), y **no la lee nadie**: ni el tipo `PaymentMethod` la trae. Así que el saldo de "Tarjetas a acreditar" dice que hay plata que el posnet todavía no depositó, y no hay ningún paso de acreditación ni pantalla para barrerla al banco. Salió del relevamiento del 22/09 | mediano |
| 🔴 | **"A imputar" acusa y no se puede vaciar.** Un cobro con un medio sin cuenta cae en la cuenta transitoria —eso está bien, es visible y no se pierde— pero **no hay pantalla para imputarlo ni para reasignarle la cuenta a un cobro ya hecho**, y la cuenta está excluida del modal de movimientos, así que ni con una transferencia manual se la puede vaciar. El tablero la denuncia y no lleva a ningún lado | mediano |
| — | **Una cuenta dada de baja sigue mostrando su saldo.** La vista `account_balances` no filtra por `active` y `fetchBalances` descarta la columna, así que aparece en Caja, en el tablero y en el selector de movimientos como si estuviera viva | chico |
| — | **El arqueo sabe de una sola caja**: toma la primera con `arquea = true` y sobre esa abre, cierra y lista el día. Con dos cajas —el mostrador y una de la profesora, por ejemplo— la segunda no se puede arquear, y la pantalla no lo dice | mediano |
| — | **El pago dentro del alta.** Es lo que falta de la idea del estudio del 17/09: "cuando creamos el cliente, tomamos esos datos, el plan que elige y ponemos **si paga ahí y cómo paga** para que se acredite". Hoy el alta crea la membresía y deja la cuota **pendiente** en Pagos, y cobrarla es un segundo paso en otra pantalla. El manual del mostrador ya lo dice así | chico |
| — | **Resend como SMTP de Supabase.** "Olvidé mi contraseña" es el único camino que le queda a una clienta que ya eligió su clave y la olvidó, y **no pasa por Resend**: usa el mailer de Supabase, que en el plan gratis manda desde una dirección de Supabase, permite unos pocos por hora y cae en spam. Con el dominio ya verificado es configuración, no desarrollo | chico |
| **§2** | **Que las reservas del turno fijo se creen solas cada semana.** Es lo último de §2. Ya no depende de ninguna respuesta: Matías definió el 15/09 que manda la cantidad de clases del plan | chico |
| **§2** | **Ventana de fechas en `fetchStudioData`.** Va en el mismo paso, no después: hoy trae **todas** las reservas sin filtro ni límite en cada ingreso. Con 8 filas no se nota; con turnos fijos reservando cada semana son miles en meses | chico |
| — | **Los otros 40 lugares donde el mensaje de la base no llega a la pantalla.** El mismo arreglo de una línea que el de la `0046`, pero toca todos los módulos y va con su propia verificación. El 17/09 se le puso una red abajo: cualquier rechazo de RLS ahora se traduce a "Tu rol no tiene permiso para esta acción" en vez de mostrar el texto interno de Postgres | mediano |
| — | **15 acciones siguen pidiendo confirmación con un cartel nativo** (8 `confirm` y 7 `prompt`). Los navegadores embebidos los descartan solos: el botón no hace nada y no hay error. El del portal ya se cambió por uno propio el 17/09; los 15 que quedan son pantallas internas, que se usan en un navegador normal. Los 7 `prompt` son el grupo peor: son la única forma de escribir el motivo de una anulación | mediano |
| — | **La profesora no ve nada de lo suyo como trabajadora.** No tiene Personal —bien, ahí hay sueldos— pero tampoco puede ver cuántas clases dio en el mes, que es un dato suyo y sin plata | chico |
| — | **Marcar asistencia no filtra por clase propia en la base.** La permisiva de update mira la clave y no el `class_id`, así que en teoría una profesora podría marcar en la clase de otra; en la práctica no tiene por dónde, porque desde la `0058` no lee esas filas y para escribir hace falta el uuid. No se cerró con la `0059` a propósito: esa pareja de políticas es la más delicada del sistema —la restrictiva alcanza también a la cancelación de la alumna— y se prueba con tiempo | chico |
| — | **El cupón no se puede usar desde el portal.** La clienta que recibe un código sólo puede canjearlo en el mostrador: el pago por Mercado Pago no pasa por `cobrar_cuota()`, así que el link se arma con el precio de lista. Falta también publicar las promociones vigentes en la web y el reporte de uso | mediano |
| — | **`reactivar_reserva` no revalida el saldo de clases.** Lo hace en el INSERT y no en el UPDATE, así que volver a una reserva cancelada puede pasar por encima del contador. Viene de antes, pero el turno fijo lo dispara más seguido: reserva de a siete fechas | chico |
| **§1** | Cambio de horario por fecha. La tabla lo soporta desde la `0018`; falta la pantalla | chico |
| — | Foto del comprobante de gasto (primer uso de Storage) · avisos de caja en el proceso diario | chico |
| — | **Fichaje de entrada y salida** de las profesoras. Se apoya en `staff_work_logs` sin rehacer nada, pero necesita que tengan cuenta | chico |
| — | Congelar la membresía (`freeze_max_days` existe y no rige) · baja de clienta con motivo · cumpleaños del mes | mediano |

### Lo que falta encender, y no es desarrollo

| | |
|---|---|
| ✅ **Tomar asistencia la profesora** | Hecho el 17/09 (`0059`). Y la nota que estaba acá era **equivocada en un punto**: `reservas.editar` NO hace falta para marcar. Hace falta para *desmarcar*, que es otra cosa — la restrictiva de la `0013` manda a `editar` el volver a 'confirmada'. Se resolvió en la pantalla: quien no puede desmarcar cambia la marca entre presente y ausente, que es lo que la base sí le deja |
| **17 de 22 grupos siguen en sombra** | Rigen **Caja, Gastos, Reportes, Datos sensibles y Reservas** (este último desde la `0058`). El resto responde el legado: tildar un permiso ahí **no hace nada** hasta encender su grupo. Contado contra la base el 17/09 — la cuenta que estaba acá decía 19 y no cerraba con los grupos que listaba |
| **Encender un grupo lo saca de la red** | `perm_diff()` compara **solo las claves en sombra** desde la `0020`. Lo que protege es lo que todavía no rige, así que de Reservas en adelante el control de esas 8 claves es la verificación que se hizo antes de encenderlas, no la función |
| **Acotar lo que la profesora ve de las clientas** | Ve las 12 con DNI, teléfono y ficha de salud, incluidas las que nunca pisan sus clases. Quedó incoherente después de acotarle las reservas. **No es un tilde**: `reservas.ver.propio` es la única clave acotada del catálogo, así que hay que crear la clave y la política. Y hay una decisión del estudio en el medio: la ficha de salud tiene sentido para la clienta que está en SU clase, que es quien está ahí si alguien se descompone |

### Del lado de la clienta, lo que el portal todavía no hace

Salió de probar el portal con una sesión real el 16/09. Ninguno rompe nada:
son cosas que la clienta esperaría poder hacer y hoy pasan por el mostrador.

Dos filas se fueron de esta tabla entre el 19 y el 22/09. El portal pasó a ser
una app con **cinco pestañas abajo** —Reservar · Mis clases · Inicio · Pagos ·
Perfil—, y ahí entró **el historial del mes**, que era lo que le faltaba para
poder auditar su propio contador: ahora ve contra qué clases se le fue
descontando el plan, no sólo cuántas le quedan. También ve **cuántos días** le
faltan y no sólo la fecha de vencimiento, y los avisos y el "agregar al
inicio" quedaron dentro de Perfil.

| | |
|---|---|
| **No puede tomar el lugar que se liberó** | El aviso de la `0052` le dice "entrá a reservarlo" y en el portal encuentra el renglón "En espera" sin ningún botón. La base sí lo permitiría |
| **El recupero no existe del lado de ella** | Desde el 17/09 el cartel de cancelar le dice cuántas recuperaciones le quedan y hasta cuándo, pero pedirla sigue siendo ir al mostrador |
| ✅ **El turno fijo lo elige y lo ve** | `0077` y `0078` (23/09). Al reservar le pregunta si es por esta vez o fijo; si es fijo le completa el período, y lo ve en Inicio con hasta cuándo lo conserva y un botón para soltarlo. **En la renovación vuelve a elegir** |
| **Los domingos no existen** | La base admite `day_of_week = 6`; el portal tiene seis días y recorta el índice a 5 |
| **Un pago en mostrador no le avisa nada** | `pago_acreditado` es de staff, y el mail "Recibimos tu pago" sale solo por el camino de Mercado Pago |
| **No puede corregir ni un dato propio** | Ni el teléfono. Y sus datos de salud le viajan al navegador aunque la pantalla no los use |

### Y del lado de la profesora

| | |
|---|---|
| ✅ **Ve la ocupación de cada clase** | Con barra y número, en Agenda y en Inicio. Desde la `0058` ese número lo cuenta la base (`class_occupancy`) y no las reservas legibles, así que sigue siendo verdadero aunque ella no pueda leer las reservas de las demás |
| ✅ **Ve solo las reservas de sus clases** | `0058`. Pasó de 13 a 7 con los datos de hoy |
| ✅ **Pasa lista** | `0059` |
| ✅ **Le avisan si le suspenden una clase o le cambian la profesora** | `0060`. Y el aviso de suspensión **no** cuelga de que alguien haya reservado: es la diferencia entre ir al estudio y no ir |
| 🟡 **El teléfono no le vibra** | La campana de adentro sí; el push reparte por roles escritos a mano en el código y `avisos.recibir_push` no gobierna nada. Anotado desde la `0012` |
| 🟡 **Su ficha no tiene mail** | Las tres tienen `teachers.email` vacío, aunque Ivana y Leandro ya tengan cuenta: crear el acceso **no** escribe el mail en la ficha. Cualquier mail a las profesoras hoy no llega a ninguna parte. Es el mismo desfasaje que con las clientas |

### Los documentos, y para quién es cada uno

| | Para | Qué dice |
|---|---|---|
| `Casa-Fe-que-hace-el-sistema.pdf` | **el estudio** | Todo lo que funciona, y al final **lo que todavía no**. Se generó el 15/09 con `que-hace-el-sistema.py`. Es el que se manda antes de que empiecen |
| `Casa-Fe-manual-del-mostrador.pdf` | **el estudio** | Las tareas del día a día, paso por paso. **Del 10/09: no tiene nada de las diez migraciones del 15/09** — recuperos, excepción, turnos fijos, la ficha rápida, Personal, la bitácora |
| `Casa-Fe-manual-de-uso.pdf` | **el estudio** | El manual con capturas. Del 12/09, **igual de viejo**. Se regenera con `manual-de-uso.py`, que necesita la sonda `?p=agenda` |
| **Esta §0** | **nosotros** | Lo que falta. Es la lista de trabajo, no un instructivo |
| `PLAN.md` | **nosotros** | Lo construido, migración por migración, con lo verificado |

**Los dos manuales del estudio quedaron viejos el 15/09** y hay que regenerarlos
cuando la semana de prueba decante: lo de ese día cambia cómo se trabaja en
Agenda, que es donde el mostrador pasa el día.

### Lo que espera al estudio

| | |
|---|---|
| 🔴 | **Mail de Giuliana**, la profesora del turno tarde. El nombre ya llegó —la agenda la muestra— pero no tiene mail ni cuenta, así que no puede entrar ni recibir los avisos de la `0060` |
| 🔴 | **Decidir si la clase de prueba sigue generando deuda.** Pasó a $0 el 16/09, pero las membresías vendidas antes guardan su precio: hay cuotas de $20.000 de pruebas pendientes de cobro que quizá haya que anular |
| 🔴 | **El WhatsApp de la web está roto.** `studio_whatsapp` quedó cargado como `3815727352`, sin el 54 y el 9, así que los **nueve** botones de la landing apuntan a un número que `wa.me` lee como de otro país. Debería ser `5493815727352`, pero el número hay que confirmarlo: antes había otro cargado |
| 🟡 | Conectar la cuenta de **Mercado Pago** (verificado: sin conectar) |
| 🟡 | Verificar el **dominio en Resend** + `EMAIL_FROM` en Vercel. Hasta entonces el mail a las clientas **solo llega a la casilla dueña** |
| 🟡 | Probar el portal desde una **cuenta de clienta**: es lo único que ejercita el aislamiento por cliente, y no se puede verificar desde adentro del sistema |

### Seguridad — lo que se cerró y lo que queda

Todo esto salió de probar con sesiones reales el 16 y 17/09, no de leer.

| | |
|---|---|
| ✅ | **Seis funciones `security definer` le contestaban a quien no debía** (`0057`). `liquidacion()` le devolvía a un alumno logueado el nombre y los montos de cada profesora; `consumo_control()` y `renovacion_control()` contestaban **sin sesión**, con la llave pública. Daban vacío por casualidad —sin tarifas cargadas, sin inconsistencias—, no por diseño |
| ✅ | **El auto-registro del portal convertía email + DNI en credenciales.** Ahora tiene interruptor y **nace apagado** (`0057`). Se le arregló además el `ilike` del email, donde `_` es comodín, y el update del vínculo, que no miraba cuántas filas tocó |
| 🟡 | **Para encenderlo hace falta confirmar el mail**, y eso necesita Resend con dominio verificado. Hasta entonces el acceso lo crea el mostrador desde la ficha |
| 🔴 | **`teachers.dni` y `notas_laborales`** — ver "lo que falta construir" |
| 🟡 | **La clienta y la profesora leen toda la configuración del estudio** (38 parámetros) y `param()` desde la API. Es deliberado en parte —`config.ver` es clave fija porque el portal necesita `cancel_hours`— pero le llega la tabla entera, no lo que necesita |
| 🟡 | **Sin ejercer**: dos huecos de escritura razonados con las políticas en la mano y no probados, porque probarlos era escribir sobre datos de otra persona: reescribir `cancel_kind` con un segundo update, y colgar una reserva de lista de espera de la membresía de otra clienta |

### Lo que se cotiza aparte

| | Días | Por qué |
|---|---|---|
| Pestaña **Beneficios** de la ficha (§3) | 10-12 | Sección 4 del documento original, **excluida por Matías** (§7). No hay una sola tabla |
| Pestaña **Compras** de la ficha (§3) | 15-20 | Sección 10 (inventario/POS), **excluida** (§7) |

De los 69 pedidos de la devolución del 15/09, **solo estos dos dan pie a cobrar**.
Todo lo demás o funciona, o era deuda del proyecto.

### Preguntas al estudio — ninguna frena nada

Todas tienen un valor por defecto andando y se ajustan desde Configuración.

- **Mercado Pago**: si el link se paga con tarjeta, ¿lleva el +25%? Hoy está en 0%. Y el tope de cuotas, que no está puesto en ningún lado.
- **Congelamiento** de membresía: `freeze_max_days` existe y no rige.
- **El redondeo**: contestó "al próximo múltiplo de $1.000", que cambia 8 de los 12 precios que ella publicó. `price_rounding` quedó en `cincuenta`, que los deja intactos.
- Si **3ra Edad** combina con Reformer · las preguntas del FAQ de la web.

### Contestadas, para no volver a preguntarlas

- **El mes de cinco martes** (15/09): manda la cantidad de clases del plan. Ver §8.2.
- **La profesora ve la ficha de salud** (15/09): sí — en una emergencia en clase es quien está. Se resolvió tildando `salud.ver`, sin migración.
- **La vigencia** (09/09): mes de calendario desde la fecha individual. Hecho.
- **El ciclo de pago del 1 al 9**: derogado el 09/09.
- **El plazo de cancelación**: 3 horas. Ya rige.
- **Los tres precios por medio de pago**: −5% / base / +25%. Cargados y andando.

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
| 3 · Cupones de descuento | 🟡 | Catálogo, validación, topes de uso, aplicación al cobro y anuncio por mail (`0079`, `0080`) | Cupón desde el portal · publicarlos en la web · reporte de uso · aplicarlos al link de Mercado Pago |
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
| 1 · Agenda, clases, reservas, asistencias | 🟡 | **Avanzó mucho**: talleres con fecha propia y los cinco campos (`0017`); suspender un día y cambiar la profesora (`0018`); asistencia desde el celular; el consumo de la clase en la base, con la cancelación clasificada dentro o fuera de plazo (`0022`+`0029`, **encendido el 09/09**); no se reserva una clase que ya empezó (`0038`); el plan decide qué disciplina puede reservar (`0040`); volver a anotarse después de cancelar (`0031`); y la grilla real de Casa Fe, 64 clases (`0035`). **El 15/09 entraron** (`0046`) el recupero con su tope configurable —y sin volver a descontar la clase—, la excepción autorizada con clave propia, y los cuatro estados distinguidos en pantalla. **Falta**: que la profesora agregue a una clienta que llega sin reserva —que es **configuración, no código**: hay que tildarle `reservas.crear` y `reservas.asistencia` y encender el grupo— y la pantalla del cambio de horario por fecha. *(Dos afirmaciones de esta fila eran falsas y se corrigieron el 15/09 consultando la base: `created_by` **sí existe** en `reservations` y lo sella un trigger de la `0022` —los nulos son las filas sembradas, y la migración decidió a propósito no inventar autoría—, y el tope de recuperos no era "por mes" sino por período de membresía.)* |
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
`teacher_id` es `NOT NULL`) · si la web sigue mostrando ciudad y Facebook · las
preguntas del FAQ, que su propio mockup pone en la barra y nadie puede escribir
por ella.

El **WhatsApp** salió de esta lista el 11/09 (migración `0045`) y era el que más
costaba: sin número, el botón del hero **no se dibujaba** y los siete botones de
contacto de la landing caían al correo. Con el número cargado, la web entera
pasa a WhatsApp con el mensaje ya escrito, sin tocar una línea de código.

El **link de Google Maps** salió de esta lista el 11/09: sin link cargado la web
arma la búsqueda con la dirección, así que ya no bloquea nada. Sigue siendo
mejor el link de su ficha de Google, y se pega desde Configuración.

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

## 8.1 La devolución sobre el diseño (11/09/2026)

Con la identidad ya aplicada, la clienta mandó once correcciones sobre la
landing. **Las once están resueltas** (las últimas, el 12/09). El detalle de
cómo se resolvió cada una está en [`PLAN.md`](PLAN.md); acá queda lo que cambia
el estado del proyecto.

### Lo que se resolvió

| # | Pidió | Dónde quedó |
|---|-------|-------------|
| 1 | El logo de ellos, no reconstruido con otra fuente | Código: el PNG como máscara, tintado por contexto |
| 2 | Las tres fotos, verticales y no cuadradas | Código (`aspect-3/4`) |
| 3 | El serif se lee mal, trazos que desaparecen | Código: `opsz` automático por tamaño |
| 5 | La clase de prueba en marrón y no en negro | Código |
| 6 | El horario con más aire, en dos bloques | **Dato** (`studio_hours`, migración `0044`) |
| 7 | La dirección en tres renglones y en su orden | **Dato** (`studio_address`, `0044`) |
| 8 | Pilates para embarazadas, al lado de Reformer | **Dato** (catálogo de disciplinas, `0044`) + la foto que mandó |
| 9 | Google Maps en el pie, con link que abra la dirección | Código, con el link propio configurable |
| 10 | El barquito de la acuarela queda cortado en escritorio | Código (encuadre a `50% 72%`) |
| 11 | El fondo del cierre, en el natural exacto de la paleta | Código |

Cuatro de las nueve se arreglaron **en la base y no en el código**, que es el
criterio de la casa (ver [6.1](#61-el-criterio-parametrizar-en-vez-de-preguntar)):
la dirección, el horario y las dos descripciones de disciplina son textos que el
estudio edita desde Configuración. La próxima corrección de esos textos no
necesita un desarrollo.

### Lo que espera algo de ella

- ~~**El logo en PNG** (punto 1)~~ — **llegó y está aplicado.** Es la Bauer
  Bodoni de verdad, no una parecida. Se usa como máscara para que un solo
  archivo sirva sobre fondo claro y sobre la foto. Queda pedido sin apuro el
  **SVG en curvas**, solo para el día que lo necesiten más grande que el hero.
  Conviene decirles que pedir el logo *en curvas* saca de la ecuación la
  licencia de Bauer Bodoni **para el logo**: un logotipo vectorizado es un
  dibujo, no una fuente. La licencia webfont sigue haciendo falta, pero para
  otra cosa — el resto de los textos del sitio, que es el punto de abajo.
- **Su Bodoni** (punto 3). Dijo que va a intentar pasarla. Mientras tanto la
  legibilidad ya mejoró sin cambiar de fuente: el problema no era la familia sino
  el eje óptico clavado en el corte de titular.
- ~~**Los cuatro textos** (punto 4)~~ — **llegaron el 12/09 y están puestos.**

  Se evaluó moverlos a `studio_settings` —viven en el código, así que cada
  ajuste de copy es un deploy— y **Matías decidió que no, el 12/09**: la
  clienta dio la landing por buena y no espera seguir cambiándola. No es una
  tarea pendiente, es una decisión tomada. **Lo que la haría revisarse** es que
  pida una segunda ronda de textos: ahí el costo de parametrizar (unas siete
  claves y una migración) se paga con el primer cambio que no necesite deploy.

  Si ese día llega, el único que tiene truco es el segundo párrafo de
  "Bienestar & Movimiento", porque lleva el cupo derivado de la grilla: el
  campo tendría que aceptar un marcador tipo `{cupo}` en vez de que el estudio
  escriba el número, o se pierde esa garantía.

### Lo que hay que preguntarle

La bajada de embarazadas de su referencia dice **"Movimientos consciente"**, en
singular, y pidió usar "exactamente" ese texto. Se cargó tal cual. Si era un
tipeo, se corrige desde Configuración y no hace falta migración.

Y el nombre de la disciplina: lo escribió **"Pilates para embarazadas"** en el
mensaje y **"Pilates Prenatal"** en la referencia. La fila del catálogo se llama
"Pilates Embarazadas" desde la `0026` y no se tocó, porque el nombre viaja como
texto a clases, planes y profesoras: renombrar es una cascada que conviene que
elija ella, desde Configuración.

### Lo que esto destraba

Que **Pilates Embarazadas** se encienda no es solo la web: la disciplina vuelve a
aparecer en el formulario de clase, así que el horario especial que ella anunció
se puede cargar. Queda en pie lo que ya dejó anotado la `0033` y sigue sin
construirse: **que un plan diga "solo Pilates Reformer" es configuración, no una
regla que rija**. Hoy nada valida la disciplina al reservar, ni el trigger de
consumo ni las políticas. Si la membresía de Reformer no tiene que poder gastar
una clase de embarazadas, eso es desarrollo aparte — y ahora que hay dos
disciplinas activas, es la primera vez que la diferencia se puede notar.

## 8.2 La devolución sobre la gestión interna (15/09/2026)

El estudio probó el sistema y mandó `SISTEMA INTERNO.pdf`: cinco secciones,
**69 pedidos**. Es la primera devolución que sale de usarlo, no de leerlo, y eso
se nota — varios pedidos son más precisos que el documento original y tres son
respuestas a preguntas que estaban abiertas.

### El cruce, contra el código y la base (no contra este documento)

| | Pedidos | Qué significa |
|---|---|---|
| 🟢 **Hecho** | 32 | Funciona hoy. Se le muestra y listo |
| 🟡 **Está, falta una parte** | 11 | Retoques, ninguno grande |
| 🔴 **No está, lo pidió y no lo hicimos** | 20 | Deuda del proyecto. **No se cotiza** |
| ⚫ **Lo pidió, y quedó fuera del alcance** | 2 | Beneficios y Compras. **Se cotiza, y hay que avisarle** |
| 🆕 **Nunca lo había pedido** | 4 | El panel de gestión desde Agenda |

**Lo que esto significa para la cotización: de 69 pedidos, solo 6 dan pie a
cobrar.** Todo lo demás o está, o era deuda. Los turnos fijos —el bloque más
caro, 12 a 15 días— **entran como deuda**: son el Agregado 2, que ella ya había
pedido. Conviene tenerlo escrito porque la primera lectura sugiere lo contrario.

### §1 Agenda, reservas y asistencias — ✅ cerrada el 15/09

Cuatro de los seis puntos ya andaban y no se tocó nada: el plazo de 3 horas, la
pérdida de la clase al cancelar tarde, el registro del tipo de cancelación y el
no show. Este último se cumple por un camino distinto al que ella imagina —la
clase se descuenta al reservar, así que la que no viene ya la perdió— y eso hay
que decírselo, porque va a buscar un botón que no existe.

Los otros dos entraron con la `0046`: el recupero con tope configurable y sin
doble descuento, y la excepción autorizada. El detalle está en
[`PLAN.md`](PLAN.md).

**El panel de Agenda entró el mismo día** (`0047`): con el cliente elegido, la
recepción ve su plan, hasta cuándo, cuántas clases le quedan y si debe, y puede
renovar, cobrar y mover el vencimiento sin cambiar de pantalla. Era el único
pedido 🆕 del documento, y resultó ser el más barato: las cinco acciones ya
existían, faltaba el lugar. Mover el vencimiento fue lo único que necesitó código
de base — no por la fecha, que siempre se pudo editar, sino porque no quedaba
registro de quién la había movido.

**§1 queda cerrada, los 21 pedidos.**

### Las tres definiciones que tomamos nosotros, y ella puede corregir

Ninguna frenó el trabajo. Las tres se eligieron con el criterio de la casa —si
es un número o un texto, se configura— y las tres se pueden dar vuelta:

1. **Se recupera solo lo que perdió** (canceló tarde o faltó sin avisar).
   Cancelar en plazo ya le devuelve la clase, así que dejar recuperar eso sería
   regalarle una. Es lo único de esto que **no** se configura.
2. **El recupero cae dentro del período que pagó esa clase**, porque las clases
   no se acumulan — regla que ella misma fijó el 09/09.
3. **La recepción carga el recupero, no la clienta desde el portal**: el tope es
   una regla del estudio.

### El mes con cinco martes — contestado (Matías, 15/09)

Era la única pregunta que frenaba §2. **La respuesta es que manda la cantidad de
clases del plan**: si ya hizo las cuatro que pagó, el quinto martes del mes no lo
cubre la membresía.

Y es lo que la base ya hace: `consumir_clase` rechaza cuando no quedan clases. No
hubo nada que construir. Lo que sí hay que saber es la consecuencia, porque el
mostrador la va a ver todos los meses:

| Plan | Clases | Por semana | Cubre | Un mes entero pide | Falta |
|---|---|---|---|---|---|
| FE START | 4 | 1 | 4 semanas | 4 | — |
| FE FLOW | 8 | 2 | 4 semanas | 9 | 1 |
| FE BALANCE | 12 | 3 | 4 semanas | 13 | 1 |
| FE STRONG | 16 | 4 | 4 semanas | 17 | 1 |
| FE FULL | 20 | 5 | 4 semanas | 22 | 2 |

Los planes traen **cuatro semanas** de clases y el período es un **mes de
calendario**, que tiene 4,35. Así que todos menos FE START quedan una o dos
clases cortos de asistir a todos sus turnos fijos del mes. No es un mes raro de
cinco martes: pasa casi todos los meses.

**Con el turno fijo sin materializar, eso no le cuesta el horario.** El turno es
el derecho al lugar y no las reservas de cada fecha, así que se queda sin clases
las últimas semanas del período pero su martes a las 18 sigue siendo suyo. Si el
estudio quiere cubrir el mes entero, es subir `class_count` del plan desde la
pantalla — un campo, no un desarrollo.

Lo demás que parecía pregunta se resolvió parametrizando: las 3 horas, los 2
recuperos, el −5% y el +25%, la anticipación de los avisos. Todo eso lo mueve
ella desde Configuración.

### Lo que contestó sin que se le preguntara

- **La prioridad del turno fijo cuelga de su fecha de vencimiento**, y se libera
  al día siguiente. Cierra dos de las tres definiciones que faltaban del
  Agregado 2 (§8).
- **Los tres precios por medio de pago** confirman lo que la `0028` ya hace:
  transferencia base, efectivo −5%, tarjeta +25%. Están cargados y andando.
- **Ocupación es "la métrica fundamental"**, y dice para qué la quiere: decidir
  qué horarios potenciar, reducir o promocionar. Eso ordena el reporte, que hasta
  ahora era una tabla más.

### Lo que hay que decirle, y no es cómodo

Las pestañas **Beneficios** y **Compras** que pide en la ficha (§3) no son
pestañas: son las secciones 4 y 10 del documento original —gift cards y
productos/inventario—, que quedaron **explícitamente fuera del alcance** (§7). No
hay una sola tabla ni una línea de código de ninguna de las dos. Sumarlas en
silencio sería regalar dos módulos; ignorarlas, dejar la ficha a medias de lo que
pidió. Va dicho de frente, con su costo al lado.

## 9. Cómo arrancamos — **histórico**

> El plan por bloques con el que se arrancó. Se deja entero porque explica por
> qué las cosas se hicieron en ese orden, pero **no es la lista de pendientes**:
> esa es la §0. Varias cosas de acá ya están hechas.

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
