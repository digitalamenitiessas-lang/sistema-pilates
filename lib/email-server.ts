// Envío de emails vía Resend (API REST, sin SDK). Solo desde app/api/**.
// Sin RESEND_API_KEY configurada es un no-op: nada se rompe, no se envía.
//
// Para activarlo: crear cuenta en resend.com, generar una API key y setear
// RESEND_API_KEY (+ EMAIL_FROM con dominio verificado) en Vercel/.env.local.
// En sandbox (sin dominio) Resend solo entrega al email del dueño de la
// cuenta — suficiente para probar.
//
// POR QUÉ ESTO DEVUELVE UN MOTIVO Y NO UN BOOLEANO
//
// El 17/09, creando una clienta en producción, la pantalla dijo "el mail no
// se pudo enviar" y nadie —ni el estudio ni nosotros— podía saber por qué:
// `sendEmail` devolvía `false` y tiraba a la basura la respuesta de Resend.
// Las causas posibles eran cuatro y se arreglan de maneras distintas (falta
// la API key en el entorno, el remitente es inválido, el dominio no está
// verificado, el destinatario está suprimido), así que un `false` pelado
// obligaba a adivinar y redeployar para probar la próxima hipótesis.
//
// Ahora el motivo viaja hasta la pantalla y además queda en los logs del
// servidor (Vercel → Runtime Logs). `sendEmail` sigue existiendo con su
// firma de antes para el proceso diario y el webhook de Mercado Pago, que
// mandan muchos mails y solo cuentan cuántos salieron.

// El remitente y la firma de cada mail que recibe el cliente salen del
// sistema, no del código. Se resuelve una vez por instancia y se guarda:
// el proceso diario manda varios mails seguidos y no tiene sentido
// preguntarle a la base el nombre del estudio en cada uno.
import { nombreDelEstudio } from './estudio'

let marcaCache: string | null = null

async function marca(): Promise<string> {
  if (marcaCache) return marcaCache
  marcaCache = await nombreDelEstudio()
  return marcaCache
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

export type ResultadoMail = { ok: true } | { ok: false; motivo: string }

/**
 * El remitente, tolerante a las comillas.
 *
 * En `.env.local` el valor TIENE que ir entre comillas —`EMAIL_FROM="Casa
 * Fe <avisos@…>"`— porque si no, bash lee el `<` como una redirección y no
 * se puede hacer `source` del archivo. Next.js las saca al parsear el
 * dotenv, así que en local anda. **Vercel no parsea nada**: guarda el valor
 * literal, comillas incluidas, y Resend responde 422 "Invalid `from`
 * field" — que es exactamente la forma que tiene de fallar sólo en
 * producción y sólo con el mail.
 *
 * Sacarlas acá es más honesto que pedirle a quien configura que recuerde en
 * cuál de los dos lugares van: el mismo valor pegado en los dos funciona.
 */
function remitente(raw: string | undefined): string {
  return String(raw ?? '')
    .trim()
    .replace(/^(['"])([\s\S]*)\1$/, '$2')
    .trim()
}

/**
 * Traduce el rechazo de Resend a algo que sirva en el mostrador.
 *
 * El criterio es que el cartel diga **qué hay que ir a arreglar y dónde**,
 * no que repita el error. Por eso el remitente aparece en el texto: cuando
 * el problema es el remitente, verlo escrito es todo el diagnóstico.
 */
function motivoDelRechazo(status: number, cuerpo: string, from: string): string {
  let mensaje = cuerpo.slice(0, 300)
  try {
    const j = JSON.parse(cuerpo)
    if (typeof j?.message === 'string') mensaje = j.message
  } catch {
    // Resend siempre devuelve JSON, pero si un proxy se mete en el medio
    // el cuerpo crudo recortado sigue siendo mejor que "error".
  }

  if (status === 401 || status === 403) {
    if (/domain is not verified|not verified/i.test(mensaje)) {
      return `Resend dice que el dominio del remitente (${from}) no está verificado. Verificalo en resend.com → Domains.`
    }
    if (/testing emails|own email/i.test(mensaje)) {
      return `Resend está en modo prueba y solo entrega a la casilla del dueño de la cuenta. Falta verificar un dominio propio y poner EMAIL_FROM con una dirección de ese dominio.`
    }
    return `Resend rechazó la API key (${status}). Revisá RESEND_API_KEY en el servidor: ${mensaje}`
  }
  if (status === 422 && /from/i.test(mensaje)) {
    return `Resend rechazó el remitente: "${from}". Tiene que ser Nombre <mail@dominio> y sin comillas alrededor — revisá EMAIL_FROM en Vercel. (${mensaje})`
  }
  if (status === 429) {
    return `Resend frenó el envío por límite de la cuenta. Volvé a intentar en un rato. (${mensaje})`
  }
  return `Resend respondió ${status}: ${mensaje}`
}

/**
 * Manda el mail y dice por qué no salió cuando no sale.
 *
 * Nunca lanza: el mail es siempre lo último y lo menos importante de la
 * operación que lo dispara —la cuenta ya está creada, el pago ya se
 * acreditó—, así que una falla acá no puede tumbar nada de eso.
 */
export async function enviarMail(
  to: string,
  subject: string,
  html: string
): Promise<ResultadoMail> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    return {
      ok: false,
      motivo:
        'Falta RESEND_API_KEY en el servidor, así que el sistema no manda mails. En Vercel: Settings → Environment Variables, con el entorno Production marcado, y redeploy.',
    }
  }
  if (!to) return { ok: false, motivo: 'No hay dirección a la que mandarlo: la ficha no tiene email.' }

  const from = remitente(process.env.EMAIL_FROM) || `${await marca()} <onboarding@resend.dev>`

  let res: Response
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
    })
  } catch (err) {
    const detalle = err instanceof Error ? err.message : 'error de red'
    console.error('[mail] no se pudo llegar a Resend:', detalle)
    return { ok: false, motivo: `No se pudo llegar a Resend: ${detalle}` }
  }

  if (res.ok) return { ok: true }

  const cuerpo = await res.text().catch(() => '')
  // El log es para nosotros y queda en Vercel → Runtime Logs: ahí va el
  // cuerpo entero, que es más de lo que tiene sentido mostrar en pantalla.
  console.error(`[mail] Resend rechazó el envío a ${to} — HTTP ${res.status} — from=${JSON.stringify(from)} — ${cuerpo}`)
  return { ok: false, motivo: motivoDelRechazo(res.status, cuerpo, from) }
}

/** Para quien manda muchos y solo cuenta cuántos salieron. El motivo de
 *  cada uno queda igual en los logs del servidor. */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  return (await enviarMail(to, subject, html)).ok
}

/**
 * Plantilla mínima con la estética del estudio. Async porque el nombre lo
 * pone el estudio desde Configuración: la inicial del recuadro y la firma
 * del pie salen de ahí.
 *
 * Los colores van en hexadecimal y no como tokens: en un mail no hay hoja
 * de estilos ni variables CSS, cada cliente de correo lee el `style=` de
 * cada etiqueta y nada más. Son los mismos valores de la marca —natural
 * #e1dfdb, marrón #847164, negro— escritos a mano porque acá no hay otra.
 */
export async function emailLayout(title: string, bodyHtml: string): Promise<string> {
  const nombre = await marca()
  return `<!doctype html>
<html lang="es"><body style="margin:0;background:#e1dfdb;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:32px 16px;">
    <div style="text-align:center;margin-bottom:16px;">
      <span style="display:inline-block;width:40px;height:40px;line-height:40px;border-radius:12px;background:#847164;color:#fff;font-weight:700;font-size:18px;">${nombre.trim().charAt(0).toUpperCase()}</span>
      <p style="margin:8px 0 0;font-weight:700;color:#000;">${nombre}</p>
    </div>
    <div style="background:#fff;border-radius:16px;padding:24px;color:#000;">
      <h1 style="font-size:18px;margin:0 0 12px;">${title}</h1>
      ${bodyHtml}
    </div>
    <p style="text-align:center;font-size:11px;color:#615953;margin-top:16px;">
      Este es un aviso automático de ${nombre}.
    </p>
  </div>
</body></html>`
}
