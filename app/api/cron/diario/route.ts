import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/mp-server'
import { pushToStaff } from '@/lib/push-server'
import { sendEmail, emailLayout } from '@/lib/email-server'

// Cron diario (vercel.json lo dispara todas las mañanas): genera las
// notificaciones de vencimientos y avisa por push al staff y por email
// a las alumnas. Es idempotente — dedupe_key en la base garantiza que
// correrlo N veces no duplica nada — así que también se puede invocar
// a mano para probar.

export const dynamic = 'force-dynamic'

const EXPIRY_WARNING_DAYS = 5

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

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const admin = supabaseAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY' }, { status: 501 })
  }

  const today = todayAR()
  const rows: NotificationRow[] = []
  const emails: Array<{ to: string; subject: string; html: string; key: string }> = []

  // ── Membresías por vencer (ventana de aviso) ──────────────────────────
  const { data: expiring } = await admin
    .from('memberships')
    .select('id, end_date, student_id, students(name, email), plans(name)')
    .eq('status', 'activa')
    .gte('end_date', today)
    .lte('end_date', addDaysISO(today, EXPIRY_WARNING_DAYS))

  for (const m of expiring ?? []) {
    const student = m.students as unknown as { name: string; email: string } | null
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

  // ── Membresías recién vencidas (últimos 7 días) ───────────────────────
  const { data: expired } = await admin
    .from('memberships')
    .select('id, end_date, student_id, students(name, email), plans(name)')
    .eq('status', 'activa')
    .lt('end_date', today)
    .gte('end_date', addDaysISO(today, -7))

  for (const m of expired ?? []) {
    const student = m.students as unknown as { name: string; email: string } | null
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

  // ── Deudas vencidas (últimos 30 días, una sola vez por pago) ──────────
  const { data: overdue } = await admin
    .from('payments')
    .select('id, amount, concept, due_date, mp_link, student_id, students(name, email)')
    .eq('status', 'pendiente')
    .lt('due_date', today)
    .gte('due_date', addDaysISO(today, -30))

  for (const p of overdue ?? []) {
    const student = p.students as unknown as { name: string; email: string } | null
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
    evaluated: rows.length,
    created: created.length,
    emailsSent,
    pushSent,
  })
}
