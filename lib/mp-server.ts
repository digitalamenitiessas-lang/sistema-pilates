// Utilidades server-side para la integración con Mercado Pago.
// Solo se importa desde app/api/** — el access token de MP nunca
// llega al navegador.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

export const MP_API = 'https://api.mercadopago.com'

/**
 * Cliente Supabase que actúa EN NOMBRE del usuario logueado: recibe el
 * header Authorization (Bearer JWT) del request y deja que RLS decida
 * qué puede leer/escribir según su rol.
 */
export function supabaseForRequest(request: Request): SupabaseClient | null {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Cliente con service role para el webhook (sin sesión de usuario). */
export function supabaseAdmin(): SupabaseClient | null {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return null
  return createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Lee el access token de MP guardado por el admin en app_settings. */
export async function getMpAccessToken(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'mp_access_token')
    .maybeSingle()
  return data?.value || null
}

export async function mpFetch(
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(`${MP_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  const body = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, body }
}

/** Mapea el tipo de pago de MP a nuestros métodos. */
export function mapMpMethod(_paymentTypeId: string): string {
  return 'mercadopago'
}

interface MpSearchResult {
  results?: Array<{
    id: number
    status: string
    date_approved: string | null
    payment_type_id: string
  }>
}

/**
 * Busca en MP un pago aprobado para el comprobante interno dado
 * (external_reference = uuid de public.payments).
 */
export async function findApprovedMpPayment(accessToken: string, paymentId: string) {
  const { ok, body } = await mpFetch(
    accessToken,
    `/v1/payments/search?external_reference=${encodeURIComponent(paymentId)}&sort=date_created&criteria=desc`
  )
  if (!ok) return null
  const results = (body as MpSearchResult)?.results ?? []
  return results.find((r) => r.status === 'approved') ?? null
}

/**
 * Marca como pagado un pago pendiente a partir de un cobro aprobado en MP.
 * Devuelve true si actualizó la fila.
 */
export async function applyApprovedPayment(
  supabase: SupabaseClient,
  paymentId: string,
  mp: { id: number; date_approved: string | null; payment_type_id: string }
): Promise<boolean> {
  const { data, error } = await supabase
    .from('payments')
    .update({
      status: 'pagado',
      method: mapMpMethod(mp.payment_type_id),
      mp_payment_id: String(mp.id),
      paid_date: (mp.date_approved ?? new Date().toISOString()).slice(0, 10),
    })
    .eq('id', paymentId)
    .eq('status', 'pendiente')
    .select()
  if (error) throw error
  return (data?.length ?? 0) > 0
}
