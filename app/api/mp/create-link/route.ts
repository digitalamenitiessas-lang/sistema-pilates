import { NextResponse } from 'next/server'
import { getMpAccessToken, mpFetch, requireStaff, supabaseForRequest } from '@/lib/mp-server'

// Genera un link de pago (Checkout Pro) para un pago pendiente.
// external_reference = uuid del pago interno, para poder acreditarlo después.
export async function POST(request: Request) {
  const supabase = supabaseForRequest(request)
  if (!supabase) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  const denied = await requireStaff(supabase)
  if (denied) {
    return NextResponse.json({ error: denied }, { status: 403 })
  }

  const { paymentId } = await request.json().catch(() => ({}))
  if (!paymentId) {
    return NextResponse.json({ error: 'Falta paymentId' }, { status: 400 })
  }

  const accessToken = await getMpAccessToken(supabase)
  if (!accessToken) {
    return NextResponse.json(
      { error: 'Mercado Pago no está configurado. Cargá las credenciales en Configuración.' },
      { status: 400 }
    )
  }

  const { data: payment, error } = await supabase
    .from('payments')
    .select('id, concept, amount, status, mp_link, students(name)')
    .eq('id', paymentId)
    .single()
  if (error || !payment) {
    return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })
  }
  if (payment.status !== 'pendiente') {
    return NextResponse.json({ error: 'El pago ya no está pendiente' }, { status: 400 })
  }
  if (payment.mp_link) {
    return NextResponse.json({ link: payment.mp_link, reused: true })
  }

  const studentName = (payment.students as unknown as { name: string } | null)?.name ?? ''
  const { ok, status, body } = await mpFetch(accessToken, '/checkout/preferences', {
    method: 'POST',
    body: JSON.stringify({
      items: [
        {
          title: `${payment.concept || 'Pago'}${studentName ? ` — ${studentName}` : ''}`,
          quantity: 1,
          unit_price: Number(payment.amount),
          currency_id: 'ARS',
        },
      ],
      external_reference: payment.id,
      statement_descriptor: 'PILATESSTUDIO',
    }),
  })

  if (!ok) {
    const detail = (body as { message?: string } | null)?.message
    return NextResponse.json(
      { error: `Mercado Pago rechazó la creación del link (${status})${detail ? `: ${detail}` : ''}` },
      { status: 400 }
    )
  }

  const preference = body as { id: string; init_point: string }
  const { error: updateError } = await supabase
    .from('payments')
    .update({ mp_preference_id: preference.id, mp_link: preference.init_point })
    .eq('id', payment.id)
  if (updateError) {
    return NextResponse.json({ error: 'No se pudo guardar el link generado' }, { status: 500 })
  }

  return NextResponse.json({ link: preference.init_point })
}
