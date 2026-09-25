import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { supabaseForRequest } from '@/lib/mp-server'

// Manda un aviso de prueba a ESTE dispositivo, desde el servidor de
// producción.
//
// Existe porque no había forma de saber si los avisos al celular andaban:
// el push sólo sale del proceso diario, y hasta el 25/09 no le había tocado
// ningún aviso a ningún celular suscripto, así que el silencio no decía
// nada. La clave privada VAPID vive sólo en Vercel y no se puede leer:
// la única prueba de que es la pareja de la pública es que un push firmado
// con ella llegue. Y si falla, el motivo vuelve a la pantalla en vez de
// quedar en un log.
//
// Sólo al dispositivo que lo pide, por su endpoint y acotado a quien llama
// (con su propia sesión, así la política de push_subscriptions filtra):
// no puede usarse para hacerle vibrar el teléfono a nadie más.

export async function POST(request: Request) {
  const supabase = supabaseForRequest(request)
  if (!supabase) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { endpoint } = await request.json().catch(() => ({}))
  if (!endpoint) return NextResponse.json({ error: 'Falta el dispositivo' }, { status: 400 })

  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) {
    return NextResponse.json(
      {
        error:
          'Faltan las claves de los avisos en el servidor: NEXT_PUBLIC_VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY en las variables de Vercel.',
      },
      { status: 501 }
    )
  }

  const { data: sub, error: leerError } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('endpoint', endpoint)
    .eq('user_id', userData.user.id)
    .maybeSingle()
  if (leerError) {
    return NextResponse.json({ error: `No se pudo leer el dispositivo: ${leerError.message}` }, { status: 500 })
  }
  if (!sub) {
    return NextResponse.json(
      { error: 'Este dispositivo no figura con los avisos activos. Desactivalos y volvé a activarlos.' },
      { status: 404 }
    )
  }

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:casafe.pilates@gmail.com', pub, priv)
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({
        title: 'Prueba de avisos',
        body: 'Si ves esto, los avisos llegan a este dispositivo.',
        url: '/sistema',
      })
    )
    return NextResponse.json({ ok: true })
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode
    // 404/410: el navegador dio de baja la suscripción. Se limpia, igual que
    // en el envío de todos los días, y se dice qué hacer.
    if (status === 404 || status === 410) {
      await supabase.from('push_subscriptions').delete().eq('id', sub.id)
      return NextResponse.json(
        { error: 'Este dispositivo ya no acepta los avisos. Volvé a activarlos.' },
        { status: 410 }
      )
    }
    // 401/403: el servicio rechazó la firma. Es el síntoma de una clave
    // privada que no es la pareja de la pública.
    if (status === 401 || status === 403) {
      return NextResponse.json(
        {
          error:
            'El servicio de avisos rechazó la firma: la clave privada del servidor no corresponde a la pública. Revisá VAPID_PRIVATE_KEY en Vercel.',
        },
        { status: 502 }
      )
    }
    return NextResponse.json(
      { error: `El servicio de avisos no lo aceptó${status ? ` (respondió ${status})` : ''}. Probá de nuevo en un rato.` },
      { status: 502 }
    )
  }
}
