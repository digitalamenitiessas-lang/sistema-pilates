import { NextResponse } from 'next/server'
import { supabaseForRequest } from '@/lib/mp-server'

// Alta y baja de suscripciones Web Push del dispositivo del usuario
// logueado. RLS garantiza que cada uno solo toca sus propias filas.

export async function POST(request: Request) {
  const supabase = supabaseForRequest(request)
  if (!supabase) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 })
  }

  const { subscription } = await request.json().catch(() => ({}))
  const endpoint = subscription?.endpoint
  const p256dh = subscription?.keys?.p256dh
  const auth = subscription?.keys?.auth
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Suscripción incompleta' }, { status: 400 })
  }

  const { error } = await supabase.from('push_subscriptions').upsert(
    { user_id: userData.user.id, endpoint, p256dh, auth },
    { onConflict: 'endpoint' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const supabase = supabaseForRequest(request)
  if (!supabase) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { endpoint } = await request.json().catch(() => ({}))
  if (!endpoint) return NextResponse.json({ error: 'Falta endpoint' }, { status: 400 })

  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // Acotado al dueño: borrar solo por endpoint dependía de que la política
  // de la base filtrara por usuario. Si algún día esta ruta pasa por el
  // service role, sin este filtro cualquiera desuscribiría a cualquiera.
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', userData.user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
