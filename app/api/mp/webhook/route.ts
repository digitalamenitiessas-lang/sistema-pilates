import { NextResponse } from 'next/server'
import { applyApprovedPayment, getMpAccessToken, mpFetch, supabaseAdmin } from '@/lib/mp-server'

// Webhook de Mercado Pago para acreditación automática en producción.
// Requiere SUPABASE_SERVICE_ROLE_KEY en el entorno del servidor (al
// desplegar). Sin esa variable responde 200 y no hace nada — la
// acreditación queda cubierta por /api/mp/sync al abrir Pagos.
//
// La seguridad del flujo: el id notificado se verifica SIEMPRE contra la
// API de MP con el access token del estudio; solo un pago realmente
// aprobado en la cuenta del estudio puede acreditar el comprobante cuyo
// uuid figura como external_reference.
export async function POST(request: Request) {
  const supabase = supabaseAdmin()
  if (!supabase) return NextResponse.json({ ok: true, skipped: 'sin service role' })

  const url = new URL(request.url)
  const body = (await request.json().catch(() => null)) as {
    type?: string
    action?: string
    data?: { id?: string | number }
  } | null

  const topic = body?.type ?? url.searchParams.get('topic') ?? url.searchParams.get('type')
  const mpPaymentId = body?.data?.id ?? url.searchParams.get('id') ?? url.searchParams.get('data.id')
  if (topic !== 'payment' || !mpPaymentId) {
    return NextResponse.json({ ok: true, skipped: 'no es notificación de pago' })
  }

  const accessToken = await getMpAccessToken(supabase)
  if (!accessToken) return NextResponse.json({ ok: true, skipped: 'MP sin configurar' })

  const { ok, body: payment } = await mpFetch(accessToken, `/v1/payments/${mpPaymentId}`)
  if (!ok) return NextResponse.json({ ok: true, skipped: 'pago inexistente en MP' })

  const mp = payment as {
    id: number
    status: string
    external_reference?: string
    date_approved: string | null
    payment_type_id: string
  }
  if (mp.status !== 'approved' || !mp.external_reference) {
    return NextResponse.json({ ok: true, skipped: 'no aprobado' })
  }

  await applyApprovedPayment(supabase, mp.external_reference, mp)
  return NextResponse.json({ ok: true })
}

// MP hace un GET de prueba al registrar la URL del webhook.
export async function GET() {
  return NextResponse.json({ ok: true })
}
