import { NextResponse } from 'next/server'
import { getMpAccessToken, mpFetch, requireStaff, supabaseAdmin, supabaseForRequest } from '@/lib/mp-server'

// Prueba credenciales de Mercado Pago: las recibidas en el body
// (antes de guardar) o las ya guardadas en la configuración.
export async function POST(request: Request) {
  const supabase = supabaseForRequest(request)
  if (!supabase) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  const denied = await requireStaff(supabase)
  if (denied) {
    return NextResponse.json({ error: denied }, { status: 403 })
  }

  const { accessToken: candidate } = await request.json().catch(() => ({}))
  const accessToken = candidate || (await getMpAccessToken(supabaseAdmin() ?? supabase))
  if (!accessToken) {
    return NextResponse.json(
      { error: 'Mercado Pago no está configurado todavía' },
      { status: 400 }
    )
  }

  const { ok, status, body } = await mpFetch(accessToken, '/users/me')
  if (!ok) {
    return NextResponse.json(
      {
        error:
          status === 401 || status === 403
            ? 'El access token no es válido. Revisá que sea el de producción y esté completo.'
            : `Mercado Pago respondió con error (${status})`,
      },
      { status: 400 }
    )
  }

  const user = body as { nickname?: string; email?: string; site_id?: string }
  return NextResponse.json({
    ok: true,
    nickname: user.nickname ?? '',
    email: user.email ?? '',
    site: user.site_id ?? '',
  })
}
