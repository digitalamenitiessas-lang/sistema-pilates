import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createMpCheckoutLink, getMpAccessToken, supabaseAdmin } from '@/lib/mp-server'
import { pushToStaff } from '@/lib/push-server'
import { sendEmail, emailLayout } from '@/lib/email-server'
import { NOMBRE_POR_DEFECTO } from '@/lib/estudio'

// Cron diario (vercel.json lo dispara a las 9 UTC, las 6 de la mañana acá):
//
//   1. Emite la CUOTA de renovación de las membresías que vencen dentro de
//      renewal_invoice_days, con el link de Mercado Pago si está conectado.
//      No crea la membresía nueva.
//   2. Los recordatorios de vencimiento: uno por cada escalón de
//      expiry_reminder_days, con catch-up si el cron no corrió ese día.
//   3. Las membresías que vencieron sin renovarse, y en el mismo momento la
//      caducidad de las ofertas que nadie tomó.
//   4. Las deudas vencidas, que no son lo mismo que las ofertas.
//
// EL ORDEN INVERTIDO ES EL PUNTO (migración 0041). Hasta acá el bloque 1
// renovaba al día siguiente de vencer: insertaba la membresía nueva y
// recién después generaba la cuota como pendiente, así que quien no pagaba
// quedaba con membresía vigente — y desde el motor de consumo de la 0029,
// gastando clases de un mes que no compró. El estudio pidió lo contrario:
// "debe renovarla, como maximo, el 20 de octubre. Si no paga ese dia, el 21
// de octubre pierde la prioridad sobre sus dias y horarios fijos". Así que
// acá se emite la cuota y la membresía la crea el trigger payments_renueva
// cuando el pago entra. Ninguna fecha se calcula dos veces: el trigger
// memberships_fechas (0036/0037) ya encola el período detrás del que está
// en curso si el pago llegó hasta el vencimiento, y lo arranca el día del
// pago si llegó después.
//
// Y LA REGLA QUE ATA LOS CUATRO BLOQUES: una cuota con renueva_membresia_id
// y status 'pendiente' es una OFERTA, no una deuda. Emitirla antes del
// vencimiento es lo que le pone el link de pago en la mano mientras la
// membresía todavía le sirve, pero una pendiente que nadie paga es deuda
// falsa. Acá eso significa dos cosas concretas: no dispara el mail de
// cobranza del bloque 4, y caduca en el bloque 3. Ya pagada es un cobro
// como cualquier otro.
//
// Idempotente: el dedupe_key de cada aviso, el índice único parcial de la
// 0041 sobre la oferta viva y el salteo de las membresías que ya tienen un
// período posterior hacen que correrlo N veces no duplique nada. Pero manda
// mails de verdad a las clientas, así que probarlo a mano no es gratis.

export const dynamic = 'force-dynamic'

// Valores por defecto: los usa si la migración que trajo la clave todavía no
// corrió, o si el estudio la dejó vacía. Los reales se editan desde
// Configuración.
const EXPIRY_WARNING_DAYS = 5 // 0011
const RENEWAL_CATCHUP_DAYS = 7 // 0011
const RENEWAL_INVOICE_DAYS = 7 // 0041

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

/**
 * Los escalones de aviso: "5,2,0" → [5, 2, 0]. Ordenados de mayor a menor
 * porque el que corresponde emitir es el de MENOR anticipación entre los que
 * ya llegaron. El 0 —el día del vencimiento, el último en que todavía puede
 * pagar sin perder nada— es un valor válido, así que `num`, que exige > 0, no
 * sirve para leer esta clave.
 */
function escalones(valor: string | undefined, fallback: number[]): number[] {
  const leidos = (valor ?? '')
    .split(',')
    .map((parte) => parte.trim())
    // Las partes vacías se van ANTES de pasar por Number, que convierte ''
    // en 0: sin este filtro una clave ausente daba [0] —un recordatorio el
    // día del vencimiento y ninguno antes— en vez de caer en el fallback.
    .filter((parte) => parte !== '')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0)
  return [...new Set(leidos.length > 0 ? leidos : fallback)].sort((a, b) => b - a)
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

/** Días de calendario entre dos fechas ISO (hasta − desde). */
function diasEntre(desde: string, hasta: string): number {
  const [ay, am, ad] = desde.split('-').map(Number)
  const [by, bm, bd] = hasta.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('es-AR', { timeZone: 'UTC' })
}

function formatAmount(n: number): string {
  return `$${Number(n).toLocaleString('es-AR')}`
}

const BOTON_PAGAR =
  'display:inline-block;background:#A9552F;color:#fff;text-decoration:none;padding:10px 20px;border-radius:10px;font-weight:600;'

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

/**
 * La cuota de renovación del período siguiente (columna renueva_membresia_id,
 * migración 0041), indexada por la membresía que renueva.
 */
interface Oferta {
  id: string
  amount: number
  due_date: string
  status: string
  mp_link: string | null
}

export async function GET(request: Request) {
  // Sin CRON_SECRET en producción el endpoint queda CERRADO, no abierto:
  // emite cuotas, anula ofertas y manda emails a las clientas, así que nadie
  // de afuera tiene que poder invocarlo. Vercel manda el header solo si la
  // variable está cargada — si el cron dejó de correr, es esto. En
  // desarrollo local se puede llamar a mano sin secreto para probarlo.
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
  const renewalInvoiceDays = num(settings, 'renewal_invoice_days', RENEWAL_INVOICE_DAYS)
  const renewalCatchupDays = num(settings, 'renewal_catchup_days', RENEWAL_CATCHUP_DAYS)
  // Si la 0041 todavía no corrió, la clave no existe y queda un recordatorio
  // solo, con los días que el estudio ya tenía configurados para la pantalla:
  // exactamente lo que este bloque hacía antes.
  const recordatorios = escalones(settings.expiry_reminder_days, [
    num(settings, 'expiry_warning_days', EXPIRY_WARNING_DAYS),
  ])

  const today = todayAR()
  const rows: NotificationRow[] = []
  const emails: Array<{ to: string; subject: string; html: string; key: string }> = []

  // Los avisos de renovación omitida van en su propia tanda porque su tipo lo
  // habilita el CHECK de la 0023. Si esa migración todavía no corrió, la base
  // rechaza la fila — y en un upsert único ese rechazo se llevaría puesta la
  // tanda entera, o sea los avisos y los emails de las cuotas que SÍ se
  // emitieron. Y esos no vuelven: la clave está puesta y la corrida siguiente
  // la saltea como duplicada.
  const omitidas: NotificationRow[] = []

  // ¿Esta membresía ya tiene un período posterior? Es la pregunta que dice si
  // la renovación se resolvió por otro camino —el mostrador le asignó el plan
  // a mano, o se lo cambió— y entonces no hay nada que ofrecer ni que avisar
  // sobre el período que se termina.
  //
  // El predicado es el MISMO que usan renovar_por_pago() y
  // renovacion_caducar() en la 0041 (`nueva.start_date > vieja.end_date`), y
  // eso es lo que importa: si acá dijera otra cosa, el cron emitiría de
  // mañana una oferta que la base anula esa misma mañana. Reemplaza al mapa
  // de "fin más reciente por clienta", que contestaba otra pregunta —¿es esta
  // la última?— y la contestaba comparando fechas por igualdad, así que había
  // que corregirlo a mano con el fin real de cada membresía que este bloque
  // creaba. Ya no crea ninguna, y la pregunta que hace falta es esta.
  const { data: allMems } = await admin
    .from('memberships')
    .select('student_id, start_date, end_date')
  const inicios = new Map<string, string[]>()
  for (const m of allMems ?? []) {
    const propios = inicios.get(m.student_id)
    if (propios) propios.push(m.start_date)
    else inicios.set(m.student_id, [m.start_date])
  }
  const tienePeriodoPosterior = (m: { student_id: string; end_date: string }) =>
    (inicios.get(m.student_id) ?? []).some((inicio) => inicio > m.end_date)

  // Las ofertas vivas, por la membresía que renuevan. Sirven tres veces: el
  // bloque 1 no vuelve a emitir la que ya está, y los bloques 2 y 3 mandan el
  // link de pago de la cuota que existe en vez de un "pasá por el estudio"
  // que la ignora.
  //
  // select('*') y no la columna suelta, para que la lista de columnas no
  // cambie cuando la 0041 corra. El filtro sí la nombra, y ahí está la
  // gracia: si la columna no existe la base contesta un error, que es la
  // señal de que la migración está pendiente. En ese caso no hay ofertas que
  // buscar y el bloque 1 se saltea entero — emitir la cuota sin poder
  // marcarla como renovación la dejaría siendo una deuda cualquiera, que es
  // el daño que este commit viene a evitar.
  const ofertas = new Map<string, Oferta>()
  const { data: ofertasVivas, error: ofertaError } = await admin
    .from('payments')
    .select('*')
    .not('renueva_membresia_id', 'is', null)
    .neq('status', 'anulado')
    // La oferta de una membresía todavía en juego vence el día siguiente al
    // fin del período, y la más vieja que este proceso mira es la del bloque
    // 3, que llega hasta renewal_catchup_days atrás. Más viejo que eso son
    // ofertas pagadas de meses anteriores, que solo harían pesar la consulta.
    .gte('due_date', addDaysISO(today, -renewalCatchupDays))
  for (const o of ofertasVivas ?? []) {
    if (o.renueva_membresia_id) {
      ofertas.set(o.renueva_membresia_id, {
        id: o.id,
        amount: Number(o.amount),
        due_date: o.due_date,
        status: o.status,
        mp_link: o.mp_link ?? null,
      })
    }
  }

  // ── 1. La cuota de renovación ─────────────────────────────────────────
  //
  // `auto_renew` cambió de significado y sigue siendo el interruptor: ya no
  // dice "a esta clienta se le renueva la membresía sola" sino "a esta
  // clienta se le emite la cuota sola". A quien lo tiene apagado le arma la
  // renovación el mostrador.
  //
  // Los motivos de salteo comparten un `continue` pero no son la misma cosa.
  // La clase de prueba y la clienta dada de baja son decisiones tomadas: se
  // cuentan y no molestan a nadie. El plan desactivado y el plan sin precio
  // no son decisiones sobre esta clienta, son el efecto de un switch o de un
  // campo vacío en Planes, y esos sí dejan aviso.
  let ofertasEmitidas = 0
  let ofertasYaEstaban = 0
  const ofertasFallidas: string[] = []
  const salteadas = { planApagado: 0, planSinPrecio: 0, planDePrueba: 0, clientaInactiva: 0 }
  // Las que se emitieron en ESTA corrida: el bloque 2 no le manda dos mails
  // el mismo día a la misma clienta si el estudio configuró el día de la
  // cuota y un escalón de recordatorio en el mismo número.
  const ofertaRecienEmitida = new Set<string>()
  const mpToken = await getMpAccessToken(admin)
  const { data: porRenovar, error: renewError } = await admin
    .from('memberships')
    .select(
      'id, student_id, end_date, auto_renew, students(name, email, active), plans(id, name, price, active, is_trial)'
    )
    .eq('status', 'activa')
    .eq('auto_renew', true)
    .gte('end_date', today)
    .lte('end_date', addDaysISO(today, renewalInvoiceDays))

  // renewError = la consulta no se pudo hacer (0010 pendiente, por ejemplo);
  // ofertaError = no se pudieron leer las ofertas, y la 0041 sin correr es el
  // caso normal. En los dos casos se saltea el bloque y el resto del cron
  // sigue andando.
  //
  // Y se avisa al mostrador, no solo en el JSON de la respuesta. Saltear
  // este bloque significa que NADIE se renueva: es el único lugar donde se
  // emite la cuota del período siguiente, y sin cuota no hay pago que cree
  // la membresía. Emitirla igual sin poder marcarla como oferta sería peor
  // —cada renovación pendiente pasaría a contarse como deuda y a recibir
  // mails de cobranza—, así que saltear es lo correcto; lo que no puede ser
  // es que se saltee en silencio y alguien lo descubra por una clienta que
  // se quedó sin poder anotarse.
  //
  // La clave lleva el día para que avise una vez por día y no una sola vez
  // en la vida: mientras la migración no se aplique, el problema sigue.
  if ((renewError || ofertaError) && (porRenovar ?? []).length > 0) {
    // Va en `omitidas` y no en `rows` por el mismo motivo que el resto de los
    // `renovacion_omitida`: su tipo lo habilita el CHECK de la 0023, y en la
    // tanda única un rechazo se llevaría puestos los avisos que sí entraron.
    omitidas.push({
      type: 'renovacion_omitida',
      title: 'No se están emitiendo las renovaciones',
      body:
        `Hay ${(porRenovar ?? []).length} membresía(s) por vencer y el sistema no pudo ` +
        'emitir la cuota de renovación, así que nadie se va a renovar. ' +
        (ofertaError?.code === '42703' || /renueva_membresia_id/.test(ofertaError?.message ?? '')
          ? 'Falta aplicar la migración 0041 en el SQL Editor.'
          : `Motivo: ${(renewError ?? ofertaError)?.message}`),
      // No es de nadie en particular: es el sistema el que dejó de emitir.
      student_id: null,
      audience: 'staff',
      dedupe_key: `renovoff-${today}`,
    })
  }

  for (const m of (renewError || ofertaError) ? [] : (porRenovar ?? [])) {
    const student = m.students as unknown as StudentRef | null
    const plan = m.plans as unknown as {
      id: string
      name: string
      price: number
      active: boolean
      is_trial: boolean
    } | null

    // Ya lo resolvió el mostrador. Ofrecerle la renovación del período que se
    // termina dejaría una cuota que, el día que alguien la pague, acuñaría un
    // mes de más encolado detrás de todo.
    if (tienePeriodoPosterior(m)) continue

    // La oferta ya está emitida. No es un error ni un salteo: es el estado
    // normal desde el segundo día de la ventana hasta el vencimiento.
    if (ofertas.has(m.id)) {
      ofertasYaEstaban++
      continue
    }

    // Los deliberados van primero, y el orden importa: cuando se apaguen los
    // planes de demo, una clienta ya dada de baja que lo tenía no tiene que
    // generar un "no se ofreció" que nadie va a ir a arreglar.
    if (student?.active === false) {
      salteadas.clientaInactiva++
      continue
    }
    if (plan?.is_trial) {
      salteadas.planDePrueba++
      continue
    }
    // Plan apagado, o fila de plan ausente, que entra por el mismo lado.
    // Ahora el aviso llega ANTES de que la membresía venza —la ventana se
    // abre renewal_invoice_days antes—, así que al estudio le queda tiempo de
    // reactivar el plan y que la clienta no se entere de nada.
    if (!plan?.active) {
      salteadas.planApagado++
      omitidas.push({
        type: 'renovacion_omitida',
        title: 'No se ofreció la renovación: plan desactivado',
        body: `${student?.name ?? '—'}: el plan ${plan?.name ?? 'de la membresía'} está desactivado, así que no se le emitió la cuota y la membresía vence el ${formatDate(m.end_date)}. Reactivá el plan o asignale otro.`,
        student_id: m.student_id,
        membership_id: m.id,
        audience: 'staff',
        dedupe_key: `renovom-${m.id}`,
      })
      // A la clienta no se le manda nada: es un problema de configuración del
      // estudio, no una noticia suya, y el mail le llegaría antes de que haya
      // alguien del otro lado que sepa qué contestarle.
      continue
    }
    // Sin precio no hay cuota, y sin cuota no hay pago que cree la membresía:
    // la renovación se quedaría esperando para siempre. Ningún plan del
    // catálogo de Casa Fe vale cero, pero un precio borrado en Planes apaga
    // la renovación de todas sus clientas y sin aviso nadie lo ata a esto.
    if (!(Number(plan.price) > 0)) {
      salteadas.planSinPrecio++
      omitidas.push({
        type: 'renovacion_omitida',
        title: 'No se ofreció la renovación: plan sin precio',
        body: `${student?.name ?? '—'}: el plan ${plan.name} no tiene precio, así que no hay cuota de renovación que emitir y la membresía vence el ${formatDate(m.end_date)}. Ponele precio al plan o asignale el período nuevo a mano.`,
        student_id: m.student_id,
        membership_id: m.id,
        audience: 'staff',
        dedupe_key: `renovsp-${m.id}`,
      })
      continue
    }

    // La fecha límite, que es la que el estudio puso en palabras: "debe
    // renovarla, como maximo, el 20 de octubre". El día siguiente al fin del
    // período es el primero que la membresía nueva tendría que cubrir, así
    // que es el último que la oferta sirve — renovacion_caducar() (0041)
    // anula recién cuando due_date quedó ATRÁS, o sea que pagarla ese mismo
    // día todavía vale y el período arranca ahí.
    const limite = addDaysISO(m.end_date, 1)
    const { data: cuota, error: cuotaError } = await admin
      .from('payments')
      .insert({
        student_id: m.student_id,
        // membership_id queda vacío a propósito: la membresía que esta cuota
        // cobra todavía no existe. La sella el trigger de la 0041 cuando la
        // crea, y eso es lo que hace verificable a renovacion_control().
        concept: `${plan.name} — renovación`,
        // El precio de lista de hoy, que es lo que sale renovar hoy. Si el
        // estudio le hace otro precio, cobra por otro monto y la membresía
        // nace con el monto cobrado (renovar_por_pago usa payments.amount).
        amount: plan.price,
        due_date: limite,
        status: 'pendiente',
        renueva_membresia_id: m.id,
      })
      .select('id')
      .single()

    if (cuotaError || !cuota) {
      // 23505 = el índice único parcial de la 0041: ya hay una oferta viva
      // para esta membresía. Llega acá cuando se emitió a mano después de que
      // este proceso leyó el mapa, o si dos corridas se pisan. La idempotencia
      // no hay que inventarla, hay que leer bien este error: no es un fallo.
      if (cuotaError?.code === '23505') ofertasYaEstaban++
      else ofertasFallidas.push(`${m.id}: ${cuotaError?.message ?? 'sin detalle'}`)
      continue
    }
    ofertasEmitidas++

    // Link de pago listo en el email si MP está conectado (best-effort). Es
    // la mitad del motivo de emitir la cuota antes del vencimiento: que lo
    // tenga en la mano mientras la membresía todavía le sirve.
    let mpLink: string | null = null
    if (mpToken) {
      const pref = await createMpCheckoutLink(mpToken, {
        id: cuota.id,
        title: `${plan.name}${student?.name ? ` — ${student.name}` : ''}`,
        amount: Number(plan.price),
      })
      if (pref) {
        await admin
          .from('payments')
          .update({ mp_preference_id: pref.preferenceId, mp_link: pref.link })
          .eq('id', cuota.id)
        mpLink = pref.link
      }
    }

    // Al mapa, para que los bloques 2 y 3 de esta misma corrida hablen de la
    // cuota que acaba de nacer.
    ofertas.set(m.id, {
      id: cuota.id,
      amount: Number(plan.price),
      due_date: limite,
      status: 'pendiente',
      mp_link: mpLink,
    })
    ofertaRecienEmitida.add(m.id)

    rows.push({
      // Reusa 'membresia_por_vencer', que es lo que esta membresía es, en vez
      // de 'membresia_renovada': ya no se renovó nada, todavía. Un tipo nuevo
      // obliga a reescribir el CHECK de notifications.type, y este proyecto
      // ya se equivocó una vez contando esos tipos.
      type: 'membresia_por_vencer',
      title: 'Cuota de renovación emitida',
      body: `${student?.name ?? '—'}: ${plan.name} vence el ${formatDate(m.end_date)}. Cuota de ${formatAmount(plan.price)} emitida, con plazo hasta el ${formatDate(limite)}. El período nuevo se crea cuando la pague.`,
      student_id: m.student_id,
      membership_id: m.id,
      payment_id: cuota.id,
      audience: 'staff',
      dedupe_key: `oferta-${m.id}`,
    })
    if (student?.email) {
      emails.push({
        to: student.email,
        key: `oferta-${m.id}`,
        subject: `Tu renovación de ${plan.name} ya está lista`,
        html: await emailLayout(
          `¡Hola ${student.name.split(' ')[0]}!`,
          `<p>Tu membresía <strong>${plan.name}</strong> vence el <strong>${formatDate(m.end_date)}</strong>. Te dejamos lista la cuota del período siguiente: <strong>${formatAmount(plan.price)}</strong>, y la podés pagar hasta el <strong>${formatDate(limite)}</strong>.</p>
           ${mpLink ? `<p><a href="${mpLink}" style="${BOTON_PAGAR}">Pagar online</a></p>` : '<p>Podés abonarla en el estudio.</p>'}
           <p>Pagarla antes no te quita días: el período nuevo arranca el ${formatDate(limite)}, cuando termina el que estás usando.</p>
           <p>Si no la pagás, el período nuevo no se crea: hasta que renueves no podemos anotarte en clases nuevas, y los días y horarios que venís usando quedan disponibles para quien los reserve primero.</p>`
        ),
      })
    }
  }

  // ── 2. Recordatorios de vencimiento (uno por escalón) ─────────────────
  //
  // Hasta acá era un aviso solo: la ventana entera de expiry_warning_days con
  // un dedupe_key sin el día de anticipación, así que se emitía el primer día
  // que la membresía entraba en la ventana y nunca más. Ahora el estudio pone
  // la lista (expiry_reminder_days, "5,2,0") y cada escalón es un aviso
  // distinto porque su día va en la clave.
  //
  // EL CATCH-UP: el cron corre una vez por día y puede no correr. Si el día
  // de un escalón pasó sin que se emitiera, se emite igual — el de MENOR
  // anticipación entre los que ya llegaron, uno por corrida. O sea que el de
  // 5 días no se manda el día que faltan 2: para eso está el de 2, y el de 5
  // ya sería mentira. Los textos van con fechas absolutas y no con "faltan N
  // días" justamente porque un recordatorio puede salir tarde.
  const maxAnticipacion = recordatorios[0] ?? 0
  const { data: porVencer } = await admin
    .from('memberships')
    .select('id, end_date, student_id, students(name, email, active), plans(name)')
    .eq('status', 'activa')
    .gte('end_date', today)
    .lte('end_date', addDaysISO(today, maxAnticipacion))

  for (const m of porVencer ?? []) {
    if (tienePeriodoPosterior(m)) continue
    const faltan = diasEntre(today, m.end_date)
    // Los escalones vienen de mayor a menor, así que los que ya llegaron son
    // los que anticipan más de lo que falta, y el último de esos es el de
    // menor anticipación: el que corresponde hoy.
    const llegados = recordatorios.filter((d) => d >= faltan)
    const escalon = llegados[llegados.length - 1]
    if (escalon === undefined) continue

    const student = m.students as unknown as StudentRef | null
    const plan = (m.plans as unknown as { name: string } | null)?.name ?? 'membresía'
    const oferta = ofertas.get(m.id)
    const pagable = oferta?.status === 'pendiente' ? oferta : null
    const clave = `venc-${m.id}-${m.end_date}-${escalon}`
    rows.push({
      type: 'membresia_por_vencer',
      title: 'Membresía por vencer',
      body: `La membresía ${plan} de ${student?.name ?? '—'} vence el ${formatDate(m.end_date)}${
        pagable
          ? `, con la cuota de renovación emitida y plazo hasta el ${formatDate(pagable.due_date)}`
          : // "Pendiente" y no "emitida": la oferta puede existir y estar ya
            // pagada sin que el período naciera (el trigger de la 0041 avisa
            // aparte cuando eso pasa), y ahí "no tiene cuota" sería falso.
            ' y no tiene cuota de renovación pendiente'
      }`,
      student_id: m.student_id,
      membership_id: m.id,
      payment_id: pagable?.id ?? null,
      audience: 'staff',
      dedupe_key: clave,
    })

    // A quien el estudio dio de baja no se le recuerda que renueve: ya
    // avisó que no sigue. El aviso al mostrador queda igual, que es el que
    // sirve para entender por qué la membresía se apaga.
    if (!student?.email || student.active === false) continue
    // Y si la cuota se emitió recién, en esta misma corrida, el mail ya salió
    // arriba: dos mails el mismo día sobre la misma plata es exactamente lo
    // que este bloque viene a dejar de hacer. El aviso ya quedó pusheado, así
    // que el escalón queda marcado y no vuelve mañana.
    if (ofertaRecienEmitida.has(m.id)) continue

    const cierre = pagable
      ? `<p>La cuota del período siguiente es de <strong>${formatAmount(pagable.amount)}</strong> y la podés pagar hasta el <strong>${formatDate(pagable.due_date)}</strong>.</p>
         ${pagable.mp_link ? `<p><a href="${pagable.mp_link}" style="${BOTON_PAGAR}">Pagar online</a></p>` : '<p>Podés abonarla en el estudio.</p>'}
         <p>Si no la pagás, el período nuevo no se crea: hasta que renueves no podemos anotarte en clases nuevas, y los días y horarios que venís usando quedan disponibles para quien los reserve primero.</p>`
      : `<p>Para seguir reservando después de esa fecha hay que renovarla. Pasá por el estudio o escribinos y la dejamos lista.</p>`
    emails.push({
      to: student.email,
      key: clave,
      subject:
        faltan === 0
          ? `Hoy vence tu membresía ${plan}`
          : `Tu membresía vence el ${formatDate(m.end_date)}`,
      html: await emailLayout(
        `¡Hola ${student.name.split(' ')[0]}!`,
        `<p>Te recordamos que tu membresía <strong>${plan}</strong> vence el <strong>${formatDate(m.end_date)}</strong>${faltan === 0 ? ' — o sea, hoy' : ''}.</p>
         ${cierre}`
      ),
    })
  }

  // ── 3. Vencidas sin renovar, y la caducidad de las ofertas ────────────
  //
  // Las dos cosas en el mismo momento, y no es casualidad: el día que el
  // sistema da por vencido el período es el día en que la oferta de
  // renovación dejó de tener sentido. renovacion_caducar() (0041) anula las
  // que pasaron su plazo y las de una membresía que ya tiene un período
  // posterior; sin eso, una oferta sin pagar se queda pendiente para siempre
  // y vuelve a ser la deuda falsa que este diseño vino a evitar.
  //
  // Si la 0041 no corrió, la función no existe y la base contesta un error:
  // se saltea y se reporta, igual que el bloque 1. El otro motivo por el que
  // puede contestar un error es el permiso: la 0041 le revoca el execute a
  // public, anon y authenticated y no se lo concede a nadie, y este endpoint
  // llama con el service role. Cualquiera de los dos casos sale en
  // `caducarSalteado` del JSON — mirar ahí antes de concluir que no había
  // ofertas para anular, porque cero anuladas y no poder anular se parecen.
  let ofertasCaducadas: number | null = null
  let caducarError: string | null = null
  try {
    const { data: caducadas, error: errCaducar } = await admin.rpc('renovacion_caducar')
    if (errCaducar) caducarError = errCaducar.message
    else ofertasCaducadas = Number(caducadas ?? 0)
  } catch (e) {
    caducarError = e instanceof Error ? e.message : String(e)
  }

  const { data: expired } = await admin
    .from('memberships')
    .select('id, end_date, student_id, students(name, email, active), plans(name)')
    .eq('status', 'activa')
    .lt('end_date', today)
    .gte('end_date', addDaysISO(today, -renewalCatchupDays))

  for (const m of expired ?? []) {
    if (tienePeriodoPosterior(m)) continue // renovada (recién o antes): no es noticia
    const student = m.students as unknown as StudentRef | null
    const plan = (m.plans as unknown as { name: string } | null)?.name ?? 'membresía'
    const oferta = ofertas.get(m.id)
    // La oferta sigue viva el día que este aviso sale: el plazo es el día
    // siguiente al fin del período y renovacion_caducar() anula recién cuando
    // ese día quedó atrás. Así que hoy no es solo la mala noticia, es la
    // última oportunidad — y por eso el mail la nombra en vez de darla por
    // perdida.
    const pagable =
      oferta?.status === 'pendiente' && oferta.due_date >= today ? oferta : null
    // "Hasta hoy" es lo que corresponde en la corrida del día siguiente al
    // vencimiento, que es cuando este aviso sale siempre. Pero una oferta
    // cargada a mano puede tener otro plazo, y ahí la palabra sería falsa.
    const ultimoDia = pagable?.due_date === today
    const plazo = !pagable
      ? ''
      : ultimoDia
        ? 'hasta hoy'
        : `hasta el ${formatDate(pagable.due_date)}`
    rows.push({
      type: 'membresia_vencida',
      title: 'Membresía vencida',
      body: `La membresía ${plan} de ${student?.name ?? '—'} venció el ${formatDate(m.end_date)}${
        pagable ? `, y la cuota de renovación se puede pagar ${plazo}` : ' y no se renovó'
      }`,
      student_id: m.student_id,
      membership_id: m.id,
      payment_id: pagable?.id ?? null,
      audience: 'staff',
      dedupe_key: `mvenc-${m.id}-${m.end_date}`,
    })

    // Ahora no renovar tiene consecuencia, así que corresponde que se
    // entere: hasta la 0041 el sistema le renovaba la membresía sola y este
    // aviso era asunto del mostrador. Es UN mail —la clave lleva el fin del
    // período y se emite una sola vez— y a quien el estudio dio de baja no le
    // llega, porque ya avisó que no sigue.
    if (!student?.email || student.active === false) continue
    // Y no sale mientras la 0041 no esté aplicada, que es el estado de hoy.
    // Sin la columna el bloque 1 no emite ninguna oferta, así que TODA
    // membresía con auto_renew llega a este punto — y este mail le diría a
    // una clienta al día que su membresía "no se renovó" y que sus días
    // quedan para quien los reserve primero, cuando lo único que pasó es que
    // el código se desplegó antes que la migración. El aviso al mostrador
    // queda: ahí es donde el estudio tiene que ver que las renovaciones se
    // detuvieron. El mail se pierde para ese período (la clave ya quedó
    // puesta), y eso es exactamente lo que el sistema hacía antes de este
    // commit: no le mandaba nada.
    if (ofertaError) continue
    emails.push({
      to: student.email,
      key: `mvenc-${m.id}-${m.end_date}`,
      subject: !pagable
        ? `Tu membresía ${plan} venció`
        : ultimoDia
          ? `Último día para renovar tu membresía ${plan}`
          : `Todavía podés renovar tu membresía ${plan}`,
      html: await emailLayout(
        `¡Hola ${student.name.split(' ')[0]}!`,
        pagable
          ? `<p>Tu membresía <strong>${plan}</strong> venció el <strong>${formatDate(m.end_date)}</strong>, y sin una membresía vigente no podemos anotarte en clases nuevas.</p>
             <p>La cuota de renovación —<strong>${formatAmount(pagable.amount)}</strong>— se puede pagar <strong>${plazo}</strong>. El período nuevo arranca el día que la pagues.</p>
             ${pagable.mp_link ? `<p><a href="${pagable.mp_link}" style="${BOTON_PAGAR}">Pagar online</a></p>` : '<p>Podés abonarla en el estudio.</p>'}
             <p>Pasado el ${formatDate(pagable.due_date)} la cuota se da de baja y hay que armar la renovación de nuevo en el estudio. Y tené en cuenta que los días y horarios que venías usando quedan disponibles para quien los reserve primero.</p>`
          : `<p>Tu membresía <strong>${plan}</strong> venció el <strong>${formatDate(m.end_date)}</strong> y no se renovó, y sin una membresía vigente no podemos anotarte en clases nuevas.</p>
             <p>Para volver a anotarte hay que renovarla: pasá por el estudio o escribinos y la dejamos lista. Tené en cuenta que los días y horarios que venías usando quedan disponibles para quien los reserve primero.</p>
             <p>Y si decidiste no seguir, avisanos así dejamos tu ficha en orden. ¡Gracias por este tiempo!</p>`
      ),
    })
  }

  // ── 4. Deudas vencidas (últimos 30 días, una sola vez por pago) ───────
  //
  // Acá es donde la cuota fantasma cobraba: una oferta emitida antes del
  // vencimiento es una pendiente como cualquier otra para esta consulta, así
  // que desde el día que pasa su plazo le llegaría "tenés un pago pendiente"
  // con el link de MP a TODA clienta al día. Y le llegaría el mismo día en
  // que el bloque 3 le avisa que la membresía venció: un mail cobrándole el
  // período que el otro le acaba de decir que no existió.
  //
  // select('*') para que renueva_membresia_id venga cuando la 0041 esté
  // aplicada, y el salteo se decide con el dato de la fila y no con un filtro
  // en la consulta: sin la columna el valor es undefined, no se saltea nada y
  // el bloque se comporta como el de siempre.
  const { data: overdue } = await admin
    .from('payments')
    .select('*, students(name, email)')
    .eq('status', 'pendiente')
    .lt('due_date', today)
    .gte('due_date', addDaysISO(today, -30))

  let deudasQueEranOfertas = 0
  for (const p of overdue ?? []) {
    // Una oferta pendiente no es una deuda: nadie prometió pagarla. La que
    // ya está pagada nunca llega acá —esta consulta pide 'pendiente'— y se
    // cuenta como el cobro normal que es.
    if (p.renueva_membresia_id) {
      deudasQueEranOfertas++
      continue
    }
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
        html: await emailLayout(
          `¡Hola ${student.name.split(' ')[0]}!`,
          `<p>Tenés pendiente el pago de <strong>${p.concept || 'tu cuota'}</strong> por <strong>${formatAmount(p.amount)}</strong>.</p>
           ${p.mp_link ? `<p><a href="${p.mp_link}" style="${BOTON_PAGAR}">Pagar online</a></p>` : ''}
           <p>Si ya lo abonaste, ignorá este aviso. ¡Gracias!</p>`
        ),
      })
    }
  }

  // ── Insertar (idempotente) y avisar solo por lo NUEVO ─────────────────
  const insertarAvisos = async (tanda: NotificationRow[]) => {
    if (tanda.length === 0) return { creados: [] as Array<{ dedupe_key: string; type: string }>, error: null as string | null }
    const { data, error } = await admin
      .from('notifications')
      .upsert(tanda, { onConflict: 'dedupe_key', ignoreDuplicates: true })
      .select('dedupe_key, type')
    return { creados: data ?? [], error: error?.message ?? null }
  }

  const principal = await insertarAvisos(rows)
  if (principal.error) return NextResponse.json({ error: principal.error }, { status: 500 })

  // Aparte y sin cortar: si falta la 0023 la base rechaza el tipo, y eso no
  // puede tumbar los avisos que ya entraron. Queda dicho en el resumen.
  const extra = await insertarAvisos(omitidas)

  const created = [...principal.creados, ...extra.creados]

  const newKeys = new Set(created.map((c) => c.dedupe_key))

  let emailsSent = 0
  for (const e of emails) {
    if (newKeys.has(e.key) && (await sendEmail(e.to, e.subject, e.html))) emailsSent++
  }

  // Se cuenta por prefijo de la clave y no por tipo: la cuota emitida y el
  // recordatorio comparten el tipo 'membresia_por_vencer' —a propósito, para
  // no tocar el CHECK de la 0023— y para el mostrador son dos noticias
  // distintas.
  const porPrefijo = (p: string) => created.filter((c) => c.dedupe_key.startsWith(p)).length
  const nuevas = {
    ofertas: porPrefijo('oferta-'),
    porVencer: porPrefijo('venc-'),
    vencidas: porPrefijo('mvenc-'),
    deudas: porPrefijo('deuda-'),
  }

  let pushSent = 0
  if (created.length > 0) {
    const parts = [
      nuevas.ofertas && `${nuevas.ofertas} cuota(s) de renovación`,
      nuevas.porVencer && `${nuevas.porVencer} por vencer`,
      nuevas.vencidas && `${nuevas.vencidas} vencida(s)`,
      nuevas.deudas && `${nuevas.deudas} deuda(s) vencida(s)`,
    ].filter(Boolean)
    // Puede haber avisos creados y ninguna de las cuatro noticias: los de
    // renovación omitida se cuentan aparte. Sin esto el push salía con la
    // frase cortada en el dos puntos.
    if (parts.length === 0) parts.push(`${created.length} aviso(s) nuevo(s)`)
    pushSent = await pushToStaff(admin, {
      title: `${settings.studio_name || NOMBRE_POR_DEFECTO} — avisos del día`,
      body: `Membresías y pagos: ${parts.join(', ')}.`,
      url: '/sistema',
    })
  }

  return NextResponse.json({
    date: today,
    ofertasEmitidas,
    ofertasYaEstaban,
    ofertasFallidas: ofertasFallidas.length > 0 ? ofertasFallidas : undefined,
    // La causa se distingue por el error y no se da por sentada: 42703 (o el
    // nombre de la columna en el mensaje) es la 0041 sin correr, y mandar a
    // correr una migración ya aplicada es la peor pista que este JSON puede
    // dar el día que la consulta falle por otra cosa.
    ofertasSalteadas: ofertaError
      ? `${
          ofertaError.code === '42703' || /renueva_membresia_id/.test(ofertaError.message)
            ? 'migración 0041 pendiente (payments.renueva_membresia_id)'
            : 'no se pudieron leer las ofertas de renovación'
        }: ${ofertaError.message}`
      : renewError
        ? `no se pudieron leer las membresías: ${renewError.message}`
        : undefined,
    salteadas,
    ofertasCaducadas,
    caducarSalteado: caducarError ?? undefined,
    recordatorios: { escalones: recordatorios, nuevos: nuevas.porVencer },
    deudasQueEranOfertas,
    avisoOmitidasRechazado: extra.error ?? undefined,
    evaluated: rows.length,
    created: created.length,
    emailsSent,
    pushSent,
  })
}
