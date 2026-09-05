import { NextResponse } from 'next/server'
import { getMpAccessToken, mpFetch, supabaseAdmin } from '@/lib/mp-server'
import { esDenegado, exigir } from '@/lib/permisos-server'

// Prueba credenciales de Mercado Pago: las recibidas en el body
// (antes de guardar) o las ya guardadas en la configuración.
export async function POST(request: Request) {
  // Devuelve el alias y el email de la cuenta de Mercado Pago del estudio,
  // así que exige su propia clave y no la de cobrar: con el chequeo viejo,
  // recepción veía esos datos sin tener acceso a las credenciales.
  const caller = await exigir(request, 'integraciones.probar')
  if (esDenegado(caller)) return caller.error
  const supabase = caller.supabase

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
