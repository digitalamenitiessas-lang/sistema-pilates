# Mercado Pago — el estado real y lo que falta

> **Este documento existe para no volver a relevar lo mismo.** Matías pidió
> el 24/09 aislar Mercado Pago: prenderlo de una sola vez, con todo lo que
> tiene que estar resuelto ya resuelto, en vez de irlo tocando de a pedazos.
> Acá está lo que hay hoy, verificado leyendo el código y preguntándole a
> la base — no de memoria.
>
> Cuando se retome el tema, se trabaja **desde acá**.

Relevado el **24/09/2026**. Si pasó tiempo, lo primero es volver a correr
las consultas de la sección "Cómo saber en qué estado está" — el documento
puede haber envejecido, la base no.

---

## 0. Estado al 24/09/2026: no funciona nada, y es esperable

```
mp_public_key     VACÍO
mp_access_token   VACÍO
cuotas con link de Mercado Pago generado:  0
```

**Todo el circuito está construido y esperando esas dos credenciales.** No
es que esté roto: nunca se prendió. El medio de pago `mercadopago` existe
en el catálogo, activo y con `is_manual = false` —o sea que no aparece
entre los que se cobran a mano, y está bien que así sea—.

---

## 1. Las piezas, y dónde están

| Archivo | Qué hace | Permiso que exige |
|---|---|---|
| [`lib/mp-server.ts`](../lib/mp-server.ts) | El token, `mpFetch`, `applyApprovedPayment`, `findApprovedMpPayment`, los avisos | — |
| [`app/api/mp/create-link/route.ts`](../app/api/mp/create-link/route.ts) | Crea la preferencia y guarda el link | `pagos.link_mp` |
| [`app/api/mp/webhook/route.ts`](../app/api/mp/webhook/route.ts) | Recibe el aviso de MP y acredita | ninguno (lo llama MP) |
| [`app/api/mp/sync/route.ts`](../app/api/mp/sync/route.ts) | Le pregunta a MP por las pendientes | `pagos.acreditar` |
| [`app/api/mp/test/route.ts`](../app/api/mp/test/route.ts) | Probar la conexión | `integraciones.probar` |

Son 402 líneas en total. Es chico; lo que cuesta no es el código.

---

## 2. Cómo funciona hoy, de punta a punta

### 2.1 El link se genera por dos caminos

**A mano**, desde Pagos: en una cuota pendiente, el botón abre `MpLinkModal`,
que llama a `create-link`. El link queda guardado en `payments.mp_link` y
en `payments.mp_preference_id`, así que **pedirlo dos veces devuelve el
mismo** ([`create-link:38-40`](../app/api/mp/create-link/route.ts)) — no se
crean preferencias duplicadas.

**Solo**, en el proceso diario: al emitir la cuota de renovación, si hay
token, le crea el link en el acto y lo mete en el mail
([`cron/diario:505-516`](../app/api/cron/diario/route.ts)). Esa es la mitad
del motivo de emitir la cuota antes del vencimiento: que la clienta tenga
el link mientras la membresía todavía le sirve.

### 2.2 Qué se le manda a Mercado Pago

```
items: [{ title: "<concepto> — <nombre>", quantity: 1,
          unit_price: <payments.amount>, currency_id: "ARS" }]
external_reference: <uuid de la cuota>      <- la clave de todo
statement_descriptor: <nombre del estudio>  <- lo que sale en el resumen
```

`external_reference` es el uuid del pago interno
([`create-link:55`](../app/api/mp/create-link/route.ts)). Es lo único que
después permite saber **qué** se pagó. Sin eso, un pago aprobado es plata
sin dueño.

Se guarda `init_point`, no `sandbox_init_point`
([`create-link:68,77`](../app/api/mp/create-link/route.ts)): el link es
siempre el de producción, así que con credenciales de prueba habría que
revisar esto.

### 2.3 El webhook no le cree a la notificación

Mercado Pago pega en `/api/mp/webhook`. El sistema **no confía en lo que le
mandan**: toma el id y **vuelve a consultarle el pago a la API de MP con el
token del estudio**. Recién si ese pago existe, está `approved` y trae
`external_reference`, acredita
([`webhook:43-47`](../app/api/mp/webhook/route.ts)).

Está bien hecho: una notificación falsa no puede acreditar nada, porque la
verdad se la pregunta a MP y no al que golpea la puerta.

Al acreditar escribe `status = 'pagado'`, el medio, `mp_payment_id` y
`paid_at` con **el instante que informa MP**, no el de nuestro servidor
([`mp-server.ts:123-135`](../lib/mp-server.ts)). Y sólo toca la fila si
está `pendiente` — ahí está la idempotencia: una notificación repetida no
acredita dos veces.

Después dispara los avisos —push al staff, mail a la clienta— en
best-effort: si eso falla **no deshace la acreditación**
([`mp-server.ts:142`](../lib/mp-server.ts)).

### 2.4 La red de abajo: el sync

Cada vez que se abre la pantalla de Pagos
([`pagos-page.tsx:968`](../components/pagos/pagos-page.tsx)), el sistema
toma **todas** las cuotas pendientes que tengan preferencia generada y le
pregunta una por una a Mercado Pago si ya se pagaron
([`sync/route.ts:23-39`](../app/api/mp/sync/route.ts)).

**Esto es lo que en la práctica va a hacer que la plata aparezca**, incluso
sin webhook. La diferencia es cuándo: con webhook, en el momento; con sync,
cuando alguien abra Pagos.

### 2.5 Dónde lo ve la clienta

- En **su portal**, pestaña Pagos, sin que nadie se lo mande
  ([`portal-page.tsx:1774,1853`](../components/portal/portal-page.tsx)).
- En el **mail** de renovación, como botón "Pagar online"
  ([`cron/diario:670`](../app/api/cron/diario/route.ts)).
- Por **WhatsApp**, con el mensaje ya armado, desde Pagos.

---

## 3. Lo que hay que hacer para prenderlo

### 3.1 Configuración (no es desarrollo)

1. **Cargar las credenciales** en Configuración → Integraciones: *access
   token* y *public key* de la cuenta del estudio. Sólo el admin las ve
   (RLS desde la `0008`); recepción ve el estado de conexión y nada más.
2. **Probar la conexión** con el botón, que dice a nombre de quién quedó.
3. **Registrar la URL del webhook en el panel de Mercado Pago**:
   `https://<dominio>/api/mp/webhook`, para el evento de pagos. Ver 3.2:
   hoy esto es obligatorio, y no debería serlo.

### 3.2 EL HUECO PRINCIPAL: nadie le dice a MP a dónde notificar

**`notification_url` no aparece en ninguna parte del proyecto.** Se buscó
en todo `app/` y `lib/`: no está. La preferencia se crea sin ella
([`create-link:50-58`](../app/api/mp/create-link/route.ts)).

Consecuencia: **el webhook sólo suena si alguien lo registró a mano en el
panel de Mercado Pago.** Si no, el endpoint existe y nunca lo llaman — y
como el sync tapa el agujero, nadie se entera de que el webhook nunca
funcionó. Es la forma de error que este proyecto ya conoce: no falla,
miente.

**Arreglo:** mandar `notification_url` al crear la preferencia. La URL sale
de la configuración del estudio o de Vercel, **nunca** de
`new URL(request.url).origin` — eso ya mordió el 17/09 y mandó mails con
links a `localhost`. Usar `urlDelPortal()` de [`lib/estudio.ts`](../lib/estudio.ts)
sin fallback al origen del pedido, como hace
[`app/api/admin/promos/anunciar/route.ts`](../app/api/admin/promos/anunciar/route.ts).

### 3.3 Los otros huecos, por orden de lo que duele

| | Qué pasa | Por qué importa |
|---|---|---|
| **A** | **La clienta paga y se queda en Mercado Pago.** No se mandan `back_urls` ni `auto_return`: después de pagar no vuelve al portal ni ve una confirmación nuestra | Es lo primero que va a preguntar. Y sin `back_urls`, `auto_return` ni siquiera se puede usar |
| **B** | **El link ignora promociones y el ajuste del medio.** Se arma con `payments.amount` crudo ([`create-link:48`](../app/api/mp/create-link/route.ts)), sin pasar por `cobrar_cuota()` (0079). El cupón que el estudio reparte **no sirve online** | Rompe la promesa de la pantalla de Promociones, que dice que el descuento lo calcula la base |
| **C** | **Pagó dos veces y no queda registro.** Si la cuota ya se cobró en efectivo o se anuló, el update no toca ninguna fila, `applyApprovedPayment` devuelve `false`, el webhook **ignora ese valor** y contesta `ok: true` ([`webhook:47-48`](../app/api/mp/webhook/route.ts)). Entra plata real a la cuenta y no queda asentada en ningún lado ni avisa a nadie | Plata que existe en MP y no en el sistema. La caja nunca va a cerrar y nadie va a saber por qué |
| **D** | **El link no vence.** No se manda expiración, así que un link de una cuota de septiembre sigue cobrable en diciembre | Se paga una cuota vieja y hay que decidir a mano qué período es |
| **E** | **`mp_link` no se borra al anular ni al cobrar.** La cuota deja de estar pendiente pero el link sigue vivo en el mail que ya salió | Es la causa concreta de **C** |
| **F** | **Credenciales de prueba vs producción.** Se guarda `init_point` siempre; con credenciales `TEST-` habría que usar `sandbox_init_point`. Y nada en la pantalla avisa con cuál de las dos está conectado | Se prueba con datos falsos creyendo que es real, o al revés |

### 3.4 Decisiones que no son técnicas y hay que preguntarle al estudio

- **¿El recargo de Mercado Pago lo absorbe el estudio o se le traslada a la
  clienta?** Hoy el medio `mercadopago` tiene su `ajuste_pct` en el
  catálogo y el link **no lo aplica** (hueco B). Antes de arreglar B hay
  que saber qué número va.
- **¿Se acepta pago en cuotas?** Cambia lo que se manda en la preferencia
  y cuánto entra neto.
- **¿Qué pasa con un pago aprobado de una cuota ya cobrada?** (hueco C).
  Las opciones razonables: dejarlo como saldo a favor de la clienta, o
  asentarlo como un cobro sin cuota y que el mostrador decida. La segunda
  necesita una pantalla que hoy no existe.

---

## 4. Cómo saber en qué estado está, sin creerle a este documento

Con la clave de servicio, desde la raíz del proyecto:

```bash
set -a && source .env.local && set +a && python3 - <<'PY'
import os,json,urllib.request
U=os.environ['NEXT_PUBLIC_SUPABASE_URL']; K=os.environ['SUPABASE_SERVICE_ROLE_KEY']
def q(p):
    r=urllib.request.Request(U+'/rest/v1/'+p, headers={'apikey':K,'Authorization':f'Bearer {K}'})
    with urllib.request.urlopen(r) as x: return json.loads(x.read().decode())
for s in q('app_settings?select=key,value'):
    v=s['value'] or ''
    estado = ('VACÍO' if not v else
              'PRUEBA' if v.startswith('TEST-') else
              'PRODUCCIÓN' if v.startswith('APP_USR-') else f'{len(v)} caracteres')
    print(f"{s['key']:20} {estado}")
print("con link:", len(q('payments?select=id&mp_link=not.is.null')))
print("acreditados por MP:", len(q('payments?select=id&mp_payment_id=not.is.null')))
PY
```

## 5. Cómo verificar cuando se prenda

El criterio de siempre: **ejercer, no leer.** Y acá hay una restricción
propia — no se puede probar el webhook desde la máquina de quien programa,
porque Mercado Pago necesita una URL pública. O sea que **este módulo se
verifica en producción o no se verifica.**

1. Cargar credenciales y probar la conexión. Anotar si son de prueba o de
   producción.
2. Generar un link desde Pagos sobre una cuota real y chequear que
   `mp_link` y `mp_preference_id` quedaron guardados.
3. Pedirlo de nuevo: tiene que devolver **el mismo** link, no crear otro.
4. Pagarlo de verdad (monto chico) y mirar, **en este orden**:
   - ¿Llegó el webhook? En Vercel → Runtime Logs tiene que figurar el POST
     a `/api/mp/webhook`. **Si no figura, el hueco de 3.2 es real y no
     teórico** — y la acreditación que veas después vino del sync, no del
     webhook. Es la única forma de distinguirlos.
   - `payments`: status, `mp_payment_id`, `paid_at`, `account_id`.
   - Que la clienta haya recibido su mail y su aviso en el portal.
5. Probar el camino feo: cobrar una cuota en efectivo **y después** pagar
   su link. Hoy eso no queda asentado (hueco C). Hacerlo con monto chico y
   saber de antemano que la plata va a quedar sin registrar.
6. Revertir lo que se pueda: anular el cobro de prueba. **La plata en
   Mercado Pago no se revierte sola** — hay que devolverla desde el panel.

---

## 6. Por dónde empezar cuando se retome

El orden que tiene sentido, y por qué:

1. **3.2 (`notification_url`) y A (`back_urls`)** juntos: los dos se tocan
   en el mismo lugar, son chicos, y sin ellos el módulo funciona "de
   casualidad".
2. **E y luego C**: son el mismo problema visto de los dos lados. E es
   prevención y C es qué hacer cuando igual pasó.
3. **B**, después de que el estudio conteste lo del recargo (3.4).
4. **D y F** al final: molestan, no sangran.

Nada de esto se empezó. **Ninguna línea de Mercado Pago se tocó desde que
se relevó**, así que el documento y el código dicen lo mismo.
