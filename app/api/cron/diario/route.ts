import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createMpCheckoutLink, getMpAccessToken, supabaseAdmin } from '@/lib/mp-server'
import { pushToStaff } from '@/lib/push-server'
import { sendEmail, emailLayout } from '@/lib/email-server'

// Cron diario (vercel.json lo dispara todas las mañanas):
//   1. Renueva las membresías vencidas con auto_renew: mismo plan a precio
//      actual, cuota del mes como pago pendiente (con link de MP si está
//      conectado), aviso al staff y email a la alumna.
//   2. Genera las notificaciones de membresías por vencer / vencidas y
//      deudas vencidas, con push al staff y email a las alumnas.
// Es idempotente — el dedupe_key y el control de "membresía más reciente"
// garantizan que correrlo N veces no duplica nada — así que también se
// puede invocar a mano para probar.

export const dynamic = 'force-dynamic'

// Valores por defecto: los usa si la migración 0011 todavía no corrió o si
// la clave está vacía. Los reales los edita el estudio desde Configuración.
const EXPIRY_WARNING_DAYS = 5
const RENEWAL_CATCHUP_DAYS = 7
const PAYMENT_GRACE_DAYS = 5

/** Parámetros del negocio (tabla studio_settings, migración 0011). */
async function loadSettings(admin: SupabaseClient): Promise<Record<string, string>> {
  try {
    const { data } = await admin.from('studio_settings').select('key, value')
    return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))
  } catch {
    return {}
  }
}

function num(settings: Record<string, string>, key: string, fallback: number): number {
  const n = Number(settings[key])
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** Fecha de hoy en el huso del estudio (el server corre en UTC). */
function todayAR(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return date.toISOString().slice(0, 10)
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('es-AR', { timeZone: 'UTC' })
}

function formatAmount(n: number): string {
  return `$${Number(n).toLocaleString('es-AR')}`
}

interface NotificationRow {
  type: string
  title: string
  body: string
  student_id: string | null
  payment_id?: string | null
  membership_id?: string | null
  audience: string
  dedupe_key: string
}

interface StudentRef {
  name: string
  email: string
  active?: boolean
}

export async function GET(request: Request) {
  // Sin CRON_SECRET en producción el endpoint queda CERRADO, no abierto:
  // dispara renovaciones, genera cuotas y manda emails a las alumnas, así
  // que nadie de afuera tiene que poder invocarlo. Vercel manda el header
  // solo si la variable está cargada — si el cron dejó de correr, es esto.
  // En desarrollo local se puede llamar a mano sin secreto para probarlo.
  const secret = process.env.CRON_SECRET
  const isProd = process.env.NODE_ENV === 'production'
  if (!secret) {
    if (isProd) {
      return NextResponse.json(
        { error: 'Falta CRON_SECRET: cargala en las variables de entorno' },
        { status: 503 }
      )
    }
  } else if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const admin = supabaseAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY' }, { status: 501 })
  }

  const settings = await loadSettings(admin)
  const expiryWarningDays = num(settings, 'expiry_warning_days', EXPIRY_WARNING_DAYS)
  const renewalCatchupDays = num(settings, 'renewal_catchup_days', RENEWAL_CATCHUP_DAYS)
  const paymentGraceDays = num(settings, 'payment_grace_days', PAYMENT_GRACE_DAYS)

  const today = todayAR()
  const rows: NotificationRow[] = []
  const emails: Array<{ to: string; subject: string; html: string; key: string }> = []

  // Fin de membresía más reciente por alumna: solo esa genera renovación o
  // avisos (las anteriores ya fueron reemplazadas y no son noticia).
  const { data: allMems } = await admin.from('memberships').select('student_id, end_date')
  const maxEnd = new Map<string, string>()
  for (const m of allMems ?? []) {
    if ((maxEnd.get(m.student_id) ?? '') < m.end_date) maxEnd.set(m.student_id, m.end_date)
  }
  const isLatest = (m: { student_id: string; end_date: string }) =>
    maxEnd.get(m.student_id) === m.end_date

  // ── 1. Renovación automática ──────────────────────────────────────────
  let renewed = 0
  const mpToken = await getMpAccessToken(admin)
  const { data: toRenew, error: renewError } = await admin
    .from('memberships')
    .select(
      'id, student_id, end_date, auto_renew, students(name, email, active), plans(id, name, price, class_count, duration_days, active, is_trial)'
    )
    .eq('status', 'activa')
    .eq('auto_renew', true)
    .lt('end_date', today)
    .gte('end_date', addDaysISO(today, -renewalCatchupDays))

  // renewError = migración 0010 pendiente: se saltea la renovación pero el
  // resto del cron sigue andando.
  for (const m of renewError ? [] : toRenew ?? []) {
    const student = m.students as unknown as StudentRef | null
    const plan = m.plans as unknown as {
      id: string
      name: string
      price: number
      class_count: number
      duration_days: number
      active: boolean
      is_trial: boolean
    } | null
    if (!isLatest(m)) continue
    if (!plan?.active || plan.is_trial || student?.active === false) continue

    const endDate = addDaysISO(today, plan.duration_days)
    const { data: newMembership, error: memError } = await admin
      .from('memberships')
      .insert({
        student_id: m.student_id,
        plan_id: plan.id,
        start_date: today,
        end_date: endDate,
        classes_total: plan.class_count,
        classes_used: 0,
        price: plan.price,
        auto_renew: true,
      })
      .select('id')
      .single()
    if (memError || !newMembership) continue
    renewed++
    maxEnd.set(m.student_id, endDate) // la vieja deja de ser "la más reciente"

    // Cuota del mes (igual que la asignación manual: pendiente, 5 días)
    let paymentId: string | null = null
    let mpLink: string | null = null
    const dueDate = addDaysISO(today, paymentGraceDays)
    if (Number(plan.price) > 0) {
      const { data: payment } = await admin
        .from('payments')
        .insert({
          student_id: m.student_id,
          membership_id: newMembership.id,
          concept: plan.name,
          amount: plan.price,
          due_date: dueDate,
          status: 'pendiente',
        })
        .select('id')
        .single()
      paymentId = payment?.id ?? null

      // Link de pago listo en el email si MP está conectado (best-effort)
      if (paymentId && mpToken) {
        const pref = await createMpCheckoutLink(mpToken, {
          id: paymentId,
          title: `${plan.name}${student?.name ? ` — ${student.name}` : ''}`,
          amount: Number(plan.price),
        })
        if (pref) {
          await admin
            .from('payments')
            .update({ mp_preference_id: pref.preferenceId, mp_link: pref.link })
            .eq('id', paymentId)
          mpLink = pref.link
        }
      }
    }

    rows.push({
      type: 'membresia_renovada',
      title: 'Membresía renovada',
      body: `${student?.name ?? '—'}: ${plan.name} renovada, cuota de ${formatAmount(plan.price)} generada`,
      student_id: m.student_id,
      membership_id: newMembership.id,
      payment_id: paymentId,
      audience: 'staff',
      dedupe_key: `renov-${m.id}`,
    })
    if (student?.email) {
      emails.push({
        to: student.email,
        key: `renov-${m.id}`,
        subject: `Renovamos tu membresía ${plan.name}`,
        html: emailLayout(
          `¡Hola ${student.name.split(' ')[0]}!`,
          `<p>Tu membresía <strong>${plan.name}</strong> se renovó automáticamente hasta el <strong>${formatDate(endDate)}</strong>.</p>
           ${Number(plan.price) > 0 ? `<p>La cuota es de <strong>${formatAmount(plan.price)}</strong> y vence el <strong>${formatDate(dueDate)}</strong>.</p>` : ''}
           ${mpLink ? `<p><a href="${mpLink}" style="display:inline-block;background:#A9552F;color:#fff;text-decoration:none;padding:10px 20px;border-radius:10px;font-weight:600;">Pagar online</a></p>` : ''}
           <p>Si no querés renovarla, avisanos en el estudio y la damos de baja. ¡Nos vemos en clase!</p>`
        ),
      })
    }
  }

  // ── 2. Membresías por vencer (ventana de aviso) ───────────────────────
  const { data: expiring } = await admin
    .from('memberships')
    .select('id, end_date, student_id, students(name, email), plans(name)')
    .eq('status', 'activa')
    .gte('end_date', today)
    .lte('end_date', addDaysISO(today, expiryWarningDays))

  for (const m of expiring ?? []) {
    if (!isLatest(m)) continue
    const student = m.students as unknown as StudentRef | null
    const plan = (m.plans as unknown as { name: string } | null)?.name ?? 'membresía'
    rows.push({
      type: 'membresia_por_vencer',
      title: 'Membresía por vencer',
      body: `La membresía ${plan} de ${student?.name ?? '—'} vence el ${formatDate(m.end_date)}`,
      student_id: m.student_id,
      membership_id: m.id,
      audience: 'staff',
      dedupe_key: `venc-${m.id}-${m.end_date}`,
    })
    if (student?.email) {
      emails.push({
        to: student.email,
        key: `venc-${m.id}-${m.end_date}`,
        subject: `Tu membresía vence el ${formatDate(m.end_date)}`,
        html: emailLayout(
          `¡Hola ${student.name.split(' ')[0]}!`,
          `<p>Te recordamos que tu membresía <strong>${plan}</strong> vence el <strong>${formatDate(m.end_date)}</strong>.</p>
           <p>Podés renovarla en el estudio o consultar tus opciones desde el portal. ¡Te esperamos!</p>`
        ),
      })
    }
  }

  // ── 3. Membresías recién vencidas y sin renovar (últimos 7 días) ──────
  const { data: expired } = await admin
    .from('memberships')
    .select('id, end_date, student_id, students(name, email), plans(name)')
    .eq('status', 'activa')
    .lt('end_date', today)
    .gte('end_date', addDaysISO(today, -renewalCatchupDays))

  for (const m of expired ?? []) {
    if (!isLatest(m)) continue // renovada (recién o antes): no es noticia
    const student = m.students as unknown as StudentRef | null
    const plan = (m.plans as unknown as { name: string } | null)?.name ?? 'membresía'
    rows.push({
      type: 'membresia_vencida',
      title: 'Membresía vencida',
      body: `La membresía ${plan} de ${student?.name ?? '—'} venció el ${formatDate(m.end_date)}`,
      student_id: m.student_id,
      membership_id: m.id,
      audience: 'staff',
      dedupe_key: `mvenc-${m.id}-${m.end_date}`,
    })
  }

  // ── 4. Deudas vencidas (últimos 30 días, una sola vez por pago) ───────
  const { data: overdue } = await admin
    .from('payments')
    .select('id, amount, concept, due_date, mp_link, student_id, students(name, email)')
    .eq('status', 'pendiente')
    .lt('due_date', today)
    .gte('due_date', addDaysISO(today, -30))

  for (const p of overdue ?? []) {
    const student = p.students as unknown as StudentRef | null
    rows.push({
      type: 'deuda_vencida',
      title: 'Pago vencido',
      body: `${student?.name ?? '—'} debe ${formatAmount(p.amount)}${p.concept ? ` — ${p.concept}` : ''} desde el ${formatDate(p.due_date)}`,
      student_id: p.student_id,
      payment_id: p.id,
      audience: 'staff',
      dedupe_key: `deuda-${p.id}`,
    })
    if (student?.email) {
      emails.push({
        to: student.email,
        key: `deuda-${p.id}`,
        subject: 'Tenés un pago pendiente en el estudio',
        html: emailLayout(
          `¡Hola ${student.name.split(' ')[0]}!`,
          `<p>Tenés pendiente el pago de <strong>${p.concept || 'tu cuota'}</strong> por <strong>${formatAmount(p.amount)}</strong>.</p>
           ${p.mp_link ? `<p><a href="${p.mp_link}" style="display:inline-block;background:#A9552F;color:#fff;text-decoration:none;padding:10px 20px;border-radius:10px;font-weight:600;">Pagar online</a></p>` : ''}
           <p>Si ya lo abonaste, ignorá este aviso. ¡Gracias!</p>`
        ),
      })
    }
  }

  // ── Insertar (idempotente) y avisar solo por lo NUEVO ─────────────────
  let created: Array<{ dedupe_key: string; type: string }> = []
  if (rows.length > 0) {
    const { data, error } = await admin
      .from('notifications')
      .upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true })
      .select('dedupe_key, type')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    created = data ?? []
  }

  const newKeys = new Set(created.map((c) => c.dedupe_key))

  let emailsSent = 0
  for (const e of emails) {
    if (newKeys.has(e.key) && (await sendEmail(e.to, e.subject, e.html))) emailsSent++
  }

  let pushSent = 0
  if (created.length > 0) {
    const byType = (t: string) => created.filter((c) => c.type === t).length
    const parts = [
      byType('membresia_renovada') && `${byType('membresia_renovada')} renovada(s)`,
      byType('membresia_por_vencer') && `${byType('membresia_por_vencer')} por vencer`,
      byType('membresia_vencida') && `${byType('membresia_vencida')} vencida(s)`,
      byType('deuda_vencida') && `${byType('deuda_vencida')} deuda(s) vencida(s)`,
    ].filter(Boolean)
    pushSent = await pushToStaff(admin, {
      title: 'PilatesStudio — avisos del día',
      body: `Membresías y pagos: ${parts.join(', ')}.`,
      url: '/sistema',
    })
  }

  return NextResponse.json({
    date: today,
    renewed,
    renewalsSkipped: renewError ? 'migración 0010 pendiente' : undefined,
    evaluated: rows.length,
    created: created.length,
    emailsSent,
    pushSent,
  })
}
