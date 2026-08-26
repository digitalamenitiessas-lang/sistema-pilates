// Envío de emails vía Resend (API REST, sin SDK). Solo desde app/api/**.
// Sin RESEND_API_KEY configurada es un no-op: nada se rompe, no se envía.
//
// Para activarlo: crear cuenta en resend.com, generar una API key y setear
// RESEND_API_KEY (+ EMAIL_FROM con dominio verificado) en Vercel/.env.local.
// En sandbox (sin dominio) Resend solo entrega al email del dueño de la
// cuenta — suficiente para probar.

const BRAND = 'PilatesStudio'

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY
  if (!key || !to) return false
  const from = process.env.EMAIL_FROM || `${BRAND} <onboarding@resend.dev>`
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
    })
    return res.ok
  } catch {
    return false
  }
}

/** Plantilla mínima con la estética del estudio. */
export function emailLayout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="es"><body style="margin:0;background:#f5ece3;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:32px 16px;">
    <div style="text-align:center;margin-bottom:16px;">
      <span style="display:inline-block;width:40px;height:40px;line-height:40px;border-radius:12px;background:#A9552F;color:#fff;font-weight:700;font-size:18px;">P</span>
      <p style="margin:8px 0 0;font-weight:700;color:#3d2c23;">${BRAND}</p>
    </div>
    <div style="background:#fff;border-radius:16px;padding:24px;color:#3d2c23;">
      <h1 style="font-size:18px;margin:0 0 12px;">${title}</h1>
      ${bodyHtml}
    </div>
    <p style="text-align:center;font-size:11px;color:#8a7a6d;margin-top:16px;">
      Este es un aviso automático de ${BRAND}.
    </p>
  </div>
</body></html>`
}
