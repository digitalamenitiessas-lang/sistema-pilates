# Lo que falta preguntarle al estudio — 10/09/2026

Este es el mensaje que se le manda por WhatsApp cuando se le entrega el sistema
para que lo use. Va **aparte del PDF** a propósito: el PDF dice cómo se usa y no
tiene pendientes; esto se contesta mientras lo usan.

El orden no es casual. Las dos primeras cuestan plata todos los días que pasan
sin respuesta, así que van antes que las definiciones y que los datos.

Queda registrado acá igual que las dos rondas anteriores
([`casa-fe-impacto-de-las-respuestas.md`](casa-fe-impacto-de-las-respuestas.md),
§6), para poder cruzar después lo que contestó contra lo que se le preguntó.

---

## El mensaje

> Ya pueden usar el sistema. Les mando aparte un PDF con cómo se usa, pantalla
> por pantalla y por rol.
>
> Mientras lo van usando, nos quedan estas cosas por definir. **Las dos primeras
> son las que más apuran, porque hoy son plata que se está perdiendo.**
>
> **1 · El recargo del 25% en el link de pago.** Cuando le mandás el link de
> Mercado Pago a una clienta, ella elige adentro cómo paga: tarjeta, débito o
> saldo de Mercado Pago. Nosotros no sabemos de antemano qué va a elegir, así que
> el link tiene que llevar un solo precio — y hoy lleva el de transferencia. O
> sea que **si paga con tarjeta por el link, no le estás cobrando el 25%.** Tres
> caminos:
>
> - Dejarlo así, y el 25% lo cobrás solo cuando pasan la tarjeta en el estudio.
> - Ponerle el 25% al link, sabiendo que también lo van a pagar las que eligen
>   débito o saldo, que hoy pagarían el precio base.
> - No ofrecer más el link para tarjeta: por el link, solo transferencia.
>
> **2 · Las 3 cuotas.** Tu documento dice "hasta 3 cuotas", pero eso no está
> puesto en ningún lado: **hoy el link le ofrece a la clienta todas las cuotas
> que su tarjeta permita**, pueden ser 6 o 12. Y a más cuotas, más comisión te
> descuenta Mercado Pago. ¿Lo dejamos topeado en 3, como dice tu documento?
>
> ---
>
> **3 · Cambiar de plan en medio del mes.** Una clienta con FE START que el día 5
> quiere pasarse a FE FULL. Hoy paga el plan nuevo y lo empieza a usar el mes que
> viene, porque el sistema no le corta el mes que ya pagó. La pregunta es qué
> querés que pase con lo que le queda del plan viejo:
>
> - Se pierde, y el plan nuevo arranca ya.
> - Se le descuenta la parte que no usó del precio del plan nuevo.
> - Le queda a favor para el mes siguiente.
>
> **4 · Congelar la membresía.** ¿Existe? Si una clienta se va tres semanas de
> vacaciones, ¿le podés frenar el reloj —no le corren los días ni pierde las
> clases— y cuando vuelve retoma donde estaba? Si la respuesta es no, listo, no
> lo armamos. Si es sí, necesitamos cuatro cosas, y todas las vas a poder cambiar
> vos después desde el sistema: por qué motivos se lo permitís, cuántos días como
> máximo, cuántas veces al año a la misma clienta, y si le pedís algo que lo
> justifique. Y la que más cambia las cosas: **mientras está en pausa, ¿le seguís
> guardando su día y horario, o ese lugar lo largás?**
>
> **5 · Las clientas que dejan de venir.** A una se le termina el mes y no vuelve
> a pagar. La primera semana no te preocupa. Pero llega un momento en que decís
> "a esta la perdimos, hay que llamarla". **¿Cuántos días dejás pasar hasta ese
> momento?** Lo que nos digas es el día en que el sistema te la pone sola en una
> lista aparte, con el teléfono al lado. Y si vuelve a pagar, sale de la lista
> sola.
>
> **6 · Pilates 3ra Edad.** Nos dijiste que la membresía de Reformer no se
> combina con las clases de embarazadas, y eso ya está funcionando. De 3ra Edad
> no nos dijiste nada: ¿una clienta con FE FLOW puede hacer un día Reformer y el
> otro 3ra Edad, o también es una modalidad aparte con su propia membresía?
>
> **7 · Los precios redondos.** Nos dijiste que redondeemos siempre para arriba
> al próximo $1.000. Antes de aplicarlo queremos que lo veas, porque **te cambia
> 8 de los 12 precios que publicaste**: FE START en efectivo pasa de $42.750 a
> $43.000, FE FLOW de $61.750 a $62.000, en tarjeta $56.250 pasa a $57.000. Y
> hay un detalle: con ese redondeo el descuento de FE START deja de ser 5% y pasa
> a ser 4,44%, así que el "Efectivo 5% OFF" de tu tabla dejaría de ser exacto.
> ¿Lo aplicamos igual, o preferís redondear a los $100 y que los precios de tu
> tabla queden como están?
>
> ---
>
> **Y estas son cortas, para completar el sistema:**
>
> - **El WhatsApp del estudio.** Hoy no está cargado, así que la web no muestra
>   el botón. Solo números, con código de país.
> - **El link de Google Maps** del estudio, para que al tocar la dirección en la
>   web se abra ahí.
> - **Nombre completo, teléfono y email de Ivana y de Leandro.** El email es el
>   que más falta: **la cuenta con la que cada profesora entra al sistema se crea
>   con su mail**, así que hasta que lleguen no podemos darles acceso.
> - **Quién es la profesora del turno tarde.** Está cargada con un nombre
>   provisorio y se le cambia en un segundo cuando se sepa.
> - **El logo en alta calidad, la paleta de colores, las tipografías y fotos del
>   estudio.** No frena nada: el sistema arranca con lo que hay y el diseño se
>   cambia después sin tocar el funcionamiento.

---

## Para nosotros: qué desbloquea cada respuesta

| | Qué habilita |
|---|---|
| 1 · El 25% del link | Es la única que no se puede parametrizar sola: hay que elegir qué precio lleva el link |
| 2 · Las 3 cuotas | Ya está decidido en su propio documento. Se puede construir sin esperar: es un tope configurable |
| 3 · Cambio de plan | Separar "Cambiar plan" de "Renovar", que hoy son el mismo botón |
| 4 · Congelamiento | Si dice no, es cero trabajo. `freeze_max_days` ya existe y no lo lee nadie |
| 5 · Días hasta llamar | `recovery_after_days` ya existe y no lo lee nadie |
| 6 · 3ra Edad | Si es modalidad aparte, es cargar un plan. Si combina, es un update de los planes FE |
| 7 · Redondeo | `price_rounding` está en "cincuenta" a propósito, esperando esto |

Lo único que queda por construir de todo lo que ya contestó son **los días y
horarios fijos**, y no depende de ninguna de estas respuestas.
