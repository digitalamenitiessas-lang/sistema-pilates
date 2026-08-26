import { NextResponse } from 'next/server'
import {
  applyApprovedPayment,
  findApprovedMpPayment,
  getMpAccessToken,
  requireStaff,
  supabaseAdmin,
  supabaseForRequest,
} from '@/lib/mp-server'

// Revisa en Mercado Pago los pagos pendientes que tienen link generado
// y acredita los que ya fueron aprobados. Se llama al abrir Pagos.
export async function POST(request: Request) {
  const supabase = supabaseForRequest(request)
  if (!supabase) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  const denied = await requireStaff(supabase)
  if (denied) {
    return NextResponse.json({ error: denied }, { status: 403 })
  }

  // El token se lee con service role: desde 0008 recepción no lee app_settings
  const accessToken = await getMpAccessToken(supabaseAdmin() ?? supabase)
  if (!accessToken) {
    return NextResponse.json({ updated: 0, configured: false })
  }

  const { data: pending, error } = await supabase
    .from('payments')
    .select('id')
    .eq('status', 'pendiente')
    .not('mp_preference_id', 'is', null)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let updated = 0
  for (const p of pending ?? []) {
    const approved = await findApprovedMpPayment(accessToken, p.id)
    if (approved) {
      const applied = await applyApprovedPayment(supabase, p.id, approved)
      if (applied) updated++
    }
  }

  return NextResponse.json({ updated, configured: true, checked: pending?.length ?? 0 })
}
