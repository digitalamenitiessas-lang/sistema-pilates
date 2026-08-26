// Envío de Web Push desde el servidor. Solo se importa desde app/api/**.
// Sin claves VAPID configuradas, todo es un no-op silencioso: el sistema
// funciona igual, solo que sin push.
import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface PushPayload {
  title: string
  body: string
  url?: string
}

function vapidReady(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return false
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:avisos@pilatestudio.com', pub, priv)
  return true
}

interface SubscriptionRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

async function sendToSubscriptions(admin: SupabaseClient, subs: SubscriptionRow[], payload: PushPayload): Promise<number> {
  let sent = 0
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload)
        )
        sent++
      } catch (err) {
        // 404/410 = el navegador dio de baja la suscripción: limpiarla
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          await admin.from('push_subscriptions').delete().eq('id', s.id)
        }
      }
    })
  )
  return sent
}

/** Push a todos los dispositivos del staff (admin y recepción). */
export async function pushToStaff(admin: SupabaseClient, payload: PushPayload): Promise<number> {
  if (!vapidReady()) return 0
  const { data: staff } = await admin.from('profiles').select('id').in('role', ['admin', 'recepcion'])
  const ids = (staff ?? []).map((p) => p.id)
  if (ids.length === 0) return 0
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', ids)
  if (!subs?.length) return 0
  return sendToSubscriptions(admin, subs, payload)
}

/** Push a los dispositivos de un usuario puntual (p. ej. una alumna). */
export async function pushToUser(admin: SupabaseClient, userId: string, payload: PushPayload): Promise<number> {
  if (!vapidReady()) return 0
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)
  if (!subs?.length) return 0
  return sendToSubscriptions(admin, subs, payload)
}
