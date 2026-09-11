import { supabase } from './supabase'
import type {
  Teacher,
  Plan,
  Student,
  Membership,
  ClassSession,
  Reservation,
  Payment,
  Alert,
  AppNotification,
  MonthlyRevenue,
  Discipline,
  ClassKind,
  Profile,
  Role,
  Room,
  ClassOccurrence,
  DisciplineItem,
  PaymentMethod,
  StudioSetting,
  PermissionKey,
  PermissionMatrix,
  UserPermission,
} from './types'

// ---------------------------------------------------------------
// Helpers de fechas
//
// Hay dos cosas distintas y conviene no mezclarlas: FORMATEAR una fecha
// que ya se tiene, y averiguar QUÉ DÍA ES HOY. La primera no depende del
// huso; la segunda sí, y es la del estudio.
// ---------------------------------------------------------------

const HUSO_DEL_ESTUDIO = 'America/Argentina/Buenos_Aires'

/**
 * Formatea una fecha con sus componentes locales. Es un formateador PURO
 * y no convierte de huso, a propósito: `addDays` arma un Date con
 * componentes locales y se lo pasa a esta función, así que si acá adentro
 * se convirtiera a la hora del estudio, sumar un día correría la fecha
 * para siempre en todo navegador al este de Buenos Aires.
 */
export function localISO(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Qué día es hoy para el estudio, no para quien mira la pantalla. La
 * migración 0016 ya fijó este criterio para la plata —el día se deriva del
 * huso del estudio y no de quién escribe— y vale igual acá: una alumna
 * mirando el portal desde España a las dos de la mañana tiene que ver el
 * mismo "hoy" que recepción, o le aparecen las clases del día siguiente.
 */
export function hoyISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: HUSO_DEL_ESTUDIO })
}

/**
 * El ahora del estudio: qué día es y qué hora es, en el mismo huso.
 *
 * Las dos cosas juntas y de una sola lectura del reloj, a propósito.
 * Pedirlas por separado —hoyISO() y después la hora— abre una ventana de
 * un instante en la que las dos llamadas caen a los dos lados de la
 * medianoche, y ahí la fecha dice hoy y la hora dice 00:00 de mañana.
 * Pasa una vez cada nunca y sería imposible de reproducir.
 */
export function ahoraDelEstudio(): { fecha: string; hora: string } {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: HUSO_DEL_ESTUDIO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    // h23 y no hour12: false: con hour12 en false, algunos motores
    // devuelven "24:00" a la medianoche en vez de "00:00", y "24:00"
    // compara mal contra cualquier horario de clase.
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? '00'
  return {
    fecha: `${p('year')}-${p('month')}-${p('day')}`,
    hora: `${p('hour')}:${p('minute')}`,
  }
}

const enMinutos = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/**
 * ¿Ya cerró la reserva de esta clase?
 *
 * El bug que esto arregla: hasta acá la comparación era solo por fecha, y
 * entonces a las 20:00 el portal seguía ofreciendo "Reservar" en la clase
 * de las 8:00 de esa misma mañana. Desde que el motor de la 0029 está
 * encendido eso no es un botón inútil: la base acepta la reserva y le
 * descuenta la clase.
 *
 * `minutosDeCorte` es booking_cutoff_minutes (migración 0038): cuánto
 * antes del inicio se cierra. En cero cierra al empezar, que es el
 * default y lo que arregla el síntoma.
 *
 * Esto es lo que la pantalla muestra, no lo que decide: el reloj del
 * navegador lo maneja quien mira. El freno de verdad es el trigger
 * `reservations_agenda` de la 0038.
 */
export function reservaCerrada(
  fecha: string,
  hora: string,
  ahora: { fecha: string; hora: string } = ahoraDelEstudio(),
  minutosDeCorte = 0
): boolean {
  if (fecha !== ahora.fecha) return fecha < ahora.fecha
  return enMinutos(hora) - minutosDeCorte <= enMinutos(ahora.hora)
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d + days)
  return localISO(date)
}

/** Lunes de la semana que contiene esa fecha (dayOfWeek 0 = lunes). */
export function mondayOf(iso: string = hoyISO()): string {
  const [y, m, d] = iso.split('-').map(Number)
  const diff = (new Date(y, m - 1, d).getDay() + 6) % 7
  return addDays(iso, -diff)
}

/** Índice de día 0=lunes .. 6=domingo para hoy en el estudio. */
export function todayDayIndex(): number {
  const [y, m, d] = hoyISO().split('-').map(Number)
  return (new Date(y, m - 1, d).getDay() + 6) % 7
}

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export function initials(name: string): string {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('') || '?'
  )
}

// ---------------------------------------------------------------
// Estados derivados
// ---------------------------------------------------------------
/** Valor por defecto si la migración 0011 todavía no corrió. */
const EXPIRY_WARNING_DAYS = 5

// ---------------------------------------------------------------
// Parámetros configurables (studio_settings, migración 0011)
// ---------------------------------------------------------------
export type Settings = Record<string, string>

/**
 * El precio que se cobra según cómo paga el cliente.
 *
 * El ajuste vive en el medio de pago (0028) y no en el plan: es una
 * propiedad de cómo se paga, no de qué se compra. El redondeo es un
 * parámetro porque base × 0,95 da entero solo si la base es múltiplo de
 * 20 — con los precios de hoy nunca se nota, con el primer aumento sí.
 */
export function precioConAjuste(
  base: number,
  ajustePct: number,
  redondeo: string = 'cincuenta'
): number {
  const bruto = base * (1 + ajustePct / 100)
  switch (redondeo) {
    case 'cien':        return Math.round(bruto / 100) * 100
    case 'cien_arriba': return Math.ceil(bruto / 100) * 100
    case 'ninguno':     return Math.round(bruto * 100) / 100
    // 'cincuenta' es el default y el que deja intacta la lista de precios
    // publicada: sus doce valores son múltiplos de 50.
    default:            return Math.round(bruto / 50) * 50
  }
}

export function settingNum(settings: Settings, key: string, fallback: number): number {
  const n = Number(settings[key])
  return Number.isFinite(n) ? n : fallback
}

export function settingBool(settings: Settings, key: string, fallback = false): boolean {
  const v = settings[key]
  return v === undefined || v === '' ? fallback : v === 'true'
}

export function settingText(settings: Settings, key: string, fallback = ''): string {
  return settings[key]?.trim() || fallback
}

function deriveMembershipStatus(
  status: string,
  endDate: string,
  warningDays: number = EXPIRY_WARNING_DAYS,
  startDate?: string
): Membership['status'] {
  if (status === 'suspendida') return 'suspendida'
  const today = hoyISO()
  if (endDate < today) return 'vencida'
  // Con el encolado de la 0036 el pago anticipado ya no se solapa: crea una
  // membresía que arranca cuando muere la actual. Sin esta rama diría
  // "activa" un mes antes de empezar, y el portal le ofrecería reservar una
  // clase que la base va a rechazar: el motor de la 0029 descuenta de la
  // membresía que cubre la fecha de la clase, y esta todavía no cubre nada.
  if (startDate && startDate > today) return 'futura'
  if (endDate <= addDays(today, warningDays)) return 'por vencer'
  return 'activa'
}

/**
 * ¿Es una oferta de renovación sin tomar?
 *
 * La cuota de renovación (0041) se emite ANTES de que venza la membresía, y
 * la membresía nueva la crea el pago. Mientras no se paga, entonces, cobra
 * un período que todavía no existe: es lo que el estudio le OFRECIÓ, no lo
 * que la clienta debe. Por eso no suma a la deuda, no genera alerta de
 * cobranza y no entra en el reporte de deudas.
 *
 * Ya cobrada es un cobro como cualquier otro y se cuenta igual que siempre:
 * de ahí que el estado entre en la pregunta y no alcance la columna sola.
 *
 * Se pregunta por lo que NO es —cobrada ni anulada— en vez de comparar
 * contra 'pendiente': así cualquier estado futuro sin cobrar entra solo, en
 * lugar de contarse como deuda hasta que alguien se acuerde de sumarlo acá.
 *
 * Mientras la 0041 no haya corrido la columna no existe, así que esto
 * devuelve false siempre y todo se cuenta como se contaba hasta hoy.
 */
export function esOferta(pago: Pick<Payment, 'status' | 'renuevaMembresiaId'>): boolean {
  if (!pago.renuevaMembresiaId) return false
  return pago.status !== 'pagado' && pago.status !== 'anulado'
}

function derivePaymentStatus(
  status: string,
  dueDate: string,
  renuevaMembresiaId: string | null = null
): Payment['status'] {
  // 'anulado' es un estado propio: no es deuda, pero tampoco es plata
  // cobrada. Mostrarlo como pagado lo sumaba al total cobrado, que es
  // justo el número que la caja tiene que hacer coincidir con lo contado.
  if (status === 'anulado') return 'anulado'
  if (status === 'pagado') return 'pagado'
  // Una oferta de renovación no vence: pasada su fecha sigue siendo una
  // oferta que nadie tomó, por un período que el sistema ya decidió que no
  // existió. Derivarla a 'vencido' la pintaba de rojo en toda pantalla que
  // lee el estado derivado y le armaba la alerta de cobranza del tablero
  // (el `p.status === 'vencido'` de buildAlerts, en este mismo archivo).
  //
  // Y solo eso: acá no se arregla ninguna otra de las tres cuentas que la
  // oferta ensuciaba. Los totales de Pagos y del portal no dependen de esta
  // línea —la contaban igual, derivara 'pendiente' o 'vencido'— y los deja
  // afuera `esOferta()`. El mail "Tenés un pago pendiente" tampoco
  // pasa por acá: el proceso diario consulta la base por su cuenta
  // (status 'pendiente' con due_date pasado) y ahí la oferta se saltea
  // mirando la columna en la fila.
  //
  // Queda 'pendiente' hasta que renovacion_caducar() (0041) la anule, que
  // es lo que el proceso diario tiene que llamar todos los días: sin esa
  // llamada la oferta no se cierra nunca.
  if (renuevaMembresiaId) return 'pendiente'
  if (dueDate < hoyISO()) return 'vencido'
  return 'pendiente'
}

// ---------------------------------------------------------------
// Carga del paquete completo de datos del estudio
// ---------------------------------------------------------------
export interface StudioData {
  teachers: Teacher[]
  plans: Plan[]
  students: Student[]
  memberships: Membership[]
  classes: ClassSession[]
  reservations: Reservation[]
  payments: Payment[]
  monthlyRevenue: MonthlyRevenue[]
  alerts: Alert[]
  rooms: Room[]
  /** Excepciones por fecha: suspensiones y reemplazos (migración 0018) */
  occurrences: ClassOccurrence[]
  /** Catálogo editable desde Configuración (migración 0011) */
  disciplines: DisciplineItem[]
  paymentMethods: PaymentMethod[]
  /**
   * Claves de permiso del usuario logueado (migración 0012). Las resuelve
   * la base con mis_permisos(): rol → matriz → excepción por persona.
   * Vacío mientras la migración no corrió.
   */
  permisos: string[]
  /**
   * Colecciones que este rol NO puede ver. Las políticas de la base
   * devuelven cero filas cuando no hay permiso —no un error—, así que sin
   * esto "no tenés acceso" y "todavía no hay nada" se ven igual: un $0 que
   * miente. Las pantallas lo usan para decir cuál de las dos es.
   */
  denied: string[]
  /** Parámetros del negocio, listos para leer con settingNum/settingBool */
  settings: Settings
  /** Los mismos parámetros con su etiqueta y ayuda, para armar la pantalla */
  settingsMeta: StudioSetting[]
  /** true si el estudio ya cargó credenciales de Mercado Pago */
  mpConfigured: boolean
}

export async function fetchStudioData(): Promise<StudioData> {
  const [teachersRes, plansRes, studentsRes, membershipsRes, classesRes, reservationsRes, paymentsRes, revenueRes] =
    await Promise.all([
      supabase.from('teachers').select('*').eq('active', true).order('name'),
      supabase.from('plans').select('*').eq('active', true).order('price'),
      supabase.from('students').select('*').eq('active', true).order('name'),
      supabase.from('memberships').select('*, plans(name)').order('end_date', { ascending: false }),
      supabase.from('class_sessions').select('*, teachers(name)').eq('active', true).order('start_time'),
      supabase.from('reservations').select('*, students(name), class_sessions(title, discipline, start_time, teachers(name))').order('date', { ascending: false }),
      supabase.from('payments').select('*, students(name)').order('due_date', { ascending: false }),
      supabase.from('monthly_revenue').select('*'),
    ])

  // Antes acá había un throw con el primer error, y eso convertía el
  // problema de UNA tabla en la pantalla de error total. Ahora cada
  // colección aporta lo que pudo traer y el resto sigue andando.
  const colecciones: Array<[string, { error: unknown }]> = [
    ['teachers', teachersRes], ['plans', plansRes], ['students', studentsRes],
    ['memberships', membershipsRes], ['classes', classesRes],
    ['reservations', reservationsRes], ['payments', paymentsRes],
    ['monthlyRevenue', revenueRes],
  ]
  const fallaron = colecciones.filter(([, r]) => r.error).map(([k]) => k)

  // Si falló TODO, no es un problema de permisos: es la sesión o la
  // conexión, y ahí sí conviene el cartel de error. Se compara contra el
  // total real y no contra un número escrito a mano, que se desactualiza
  // en cuanto alguien suma una colección.
  if (fallaron.length === colecciones.length) {
    throw (teachersRes.error ?? new Error('No se pudieron cargar los datos'))
  }

  // Datos sensibles de la ficha (tabla aparte desde 0008; RLS: staff y la
  // propia alumna). Para el profesor viene vacío; si la migración no corrió
  // todavía, los campos siguen llegando en students.
  const privateMap = new Map<string, { medicalNotes?: string; emergencyContact?: string }>()
  const privRes = await supabase.from('student_private').select('*')
  for (const p of privRes.data ?? []) {
    privateMap.set(p.student_id, {
      medicalNotes: p.medical_notes || undefined,
      emergencyContact: p.emergency_contact || undefined,
    })
  }

  // ── Catálogos configurables (migración 0011) ────────────────────────────
  // Tolerantes: si la migración todavía no corrió, el sistema sigue andando
  // con los valores por defecto que tenía escritos en el código.
  let disciplines: DisciplineItem[] = []
  let paymentMethods: PaymentMethod[] = []
  let settings: Settings = {}
  let settingsMeta: StudioSetting[] = []
  let permisos: string[] = []
  let occurrences: ClassOccurrence[] = []
  try {
    const [discRes, methodRes, settingsRes, permisosRes] = await Promise.all([
      supabase.from('disciplines').select('*').eq('active', true).order('sort_order').order('name'),
      supabase.from('payment_methods').select('*').order('sort_order'),
      supabase.from('studio_settings').select('*').order('group_key').order('sort_order'),
      supabase.rpc('mis_permisos'),
    ])
    permisos = (permisosRes.data as string[] | null) ?? []

    // Solo las de un rango corto alrededor de hoy: son excepciones, no
    // hace falta traerse el historial entero.
    const desde = addDays(hoyISO(), -30)
    const hasta = addDays(hoyISO(), 60)
    const occRes = await supabase
      .from('class_occurrences')
      .select('*, teachers(name)')
      .gte('date', desde)
      .lte('date', hasta)
    occurrences = (occRes.data ?? []).map((o) => ({
      id: o.id,
      classId: o.class_id,
      date: o.date,
      status: o.status,
      teacherId: o.teacher_id,
      teacherName: (o.teachers as { name: string } | null)?.name ?? '',
      startTime: o.start_time ? String(o.start_time).slice(0, 5) : null,
      capacity: o.capacity,
      reason: o.reason ?? '',
    }))
    disciplines = (discRes.data ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      color: d.color,
      bgColor: d.bg_color,
      textColor: d.text_color,
      blurb: d.blurb ?? '',
      sortOrder: d.sort_order,
    }))
    paymentMethods = (methodRes.data ?? []).map((m) => ({
      code: m.code,
      name: m.name,
      isManual: m.is_manual,
      // ?? 0 mientras la 0028 no haya corrido: sin ajuste, el precio de lista.
      ajustePct: Number(m.ajuste_pct ?? 0),
      active: m.active,
      sortOrder: m.sort_order,
    }))
    settingsMeta = (settingsRes.data ?? []).map((r) => ({
      key: r.key,
      value: r.value,
      kind: r.kind,
      options: r.options ?? [],
      label: r.label,
      help: r.help ?? '',
      group: r.group_key,
      sortOrder: r.sort_order,
      isPublic: r.is_public,
      soloAdmin: r.solo_admin ?? false,
      // ?? true: si la 0024 no corrió, la columna no viene y todo rige,
      // que es exactamente lo que pasaba antes de que existiera la marca.
      rige: r.rige ?? true,
    }))
    settings = Object.fromEntries(settingsMeta.map((r) => [r.key, r.value]))
  } catch {
    // sin catálogos: valores por defecto
  }
  const warningDays = settingNum(settings, 'expiry_warning_days', EXPIRY_WARNING_DAYS)

  // Qué clave gobierna cada colección (migración 0013). Se deriva del
  // permiso y no del resultado vacío, porque una tabla sin filas y una
  // tabla vedada llegan igual.
  const CLAVE_POR_COLECCION: Record<string, string> = {
    students: 'alumnos.ver',
    memberships: 'membresias.ver',
    reservations: 'reservas.ver',
    payments: 'finanzas.ver',
    monthlyRevenue: 'finanzas.ver',
  }
  const denied = permisos.length
    ? [
        ...new Set([
          ...Object.entries(CLAVE_POR_COLECCION)
            .filter(([, clave]) => !permisos.includes(clave))
            .map(([coleccion]) => coleccion),
          ...fallaron,
        ]),
      ]
    : fallaron

  const teachers: Teacher[] = (teachersRes.data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    avatar: initials(t.name),
    disciplines: t.disciplines as Discipline[],
    phone: t.phone,
    email: t.email,
    color: t.color,
    // ?? null mientras la 0012 no haya corrido
    userId: t.user_id ?? null,
  }))

  const plans: Plan[] = (plansRes.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    price: Number(p.price),
    classCount: p.class_count,
    // ?? 0 mientras la 0025 no haya corrido
    weeklyFrequency: p.weekly_frequency ?? 0,
    durationDays: p.duration_days,
    durationMonths: p.duration_months ?? 0,
    disciplines: p.disciplines as Discipline[],
    description: p.description,
    color: p.color,
    popular: p.popular,
    isTrial: p.is_trial,
  }))

  const memberships: Membership[] = (membershipsRes.data ?? []).map((m) => ({
    id: m.id,
    studentId: m.student_id,
    planId: m.plan_id,
    planName: (m.plans as { name: string } | null)?.name ?? '',
    startDate: m.start_date,
    endDate: m.end_date,
    classesTotal: m.classes_total,
    classesUsed: m.classes_used,
    status: deriveMembershipStatus(m.status, m.end_date, warningDays, m.start_date),
    price: Number(m.price),
    autoRenew: m.auto_renew ?? true,
  }))

  // A cada cliente se le adjunta LA QUE CUBRE HOY, y si ninguna la cubre,
  // la de end_date más alto: la que tenga encolada si pagó adelantado, o la
  // última que se le venció.
  //
  // Antes era "la más reciente", que con la consulta ordenada por end_date
  // desc alcanzaba. Desde la 0036 no: el pago anticipado se encola en vez
  // de solaparse, así que el end_date más alto puede ser de una membresía
  // que arranca el mes que viene, y la ficha mostraría esa. La base elige
  // con el mismo criterio (membresia_para, 0036), y las dos tienen que
  // decir lo mismo o el mostrador informa un saldo que el motor no usa.
  const hoy = hoyISO()
  // Las mismas condiciones que membresia_para: activa, y la fecha entre
  // inicio y fin. El estado derivado dice 'suspendida' solo cuando la fila
  // lo dice —la columna admite 'activa' o 'suspendida', nada más—, así que
  // descartarlo es el mismo filtro que el `status = 'activa'` de la función.
  // Una suspendida no compite, porque el motor no la va a elegir para
  // descontar; pero puede quedar como último recurso abajo, que es lo que
  // hace que un cliente con una sola membresía suspendida siga mostrando la
  // suya en vez de parecer que nunca compró nada.
  const cubreHoy = (m: Membership) =>
    m.status !== 'suspendida' && m.startDate <= hoy && m.endDate >= hoy
  const latestMembership = new Map<string, Membership>()
  for (const m of memberships) {
    const previa = latestMembership.get(m.studentId)
    if (!previa) {
      latestMembership.set(m.studentId, m)
      continue
    }
    // La que cubre hoy manda. Entre dos que cubren hoy —posible desde la
    // 0037, que dejó a los pases de prueba arrancar el día que se compran en
    // vez de encolarse— la que primero se pierde, igual que membresia_para.
    if (cubreHoy(m) && (!cubreHoy(previa) || m.endDate < previa.endDate)) {
      latestMembership.set(m.studentId, m)
    }
  }

  const students: Student[] = (studentsRes.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    avatar: initials(s.name),
    email: s.email,
    phone: s.phone,
    dni: s.dni,
    birthdate: s.birthdate ?? '',
    joinDate: s.join_date,
    role: 'alumno',
    membership: latestMembership.get(s.id),
    observations: s.observations ?? undefined,
    medicalNotes: privateMap.get(s.id)?.medicalNotes,
    emergencyContact: privateMap.get(s.id)?.emergencyContact,
    userId: s.user_id ?? null,
  }))

  const studentName = (id: string) => students.find((s) => s.id === id)?.name ?? '—'

  const reservations: Reservation[] = (reservationsRes.data ?? []).map((r) => {
    const cls = r.class_sessions as {
      title: string
      discipline: string
      start_time: string
      teachers: { name: string } | null
    } | null
    return {
      id: r.id,
      studentId: r.student_id,
      studentName: (r.students as { name: string } | null)?.name ?? studentName(r.student_id),
      classId: r.class_id,
      className: cls?.title ?? '—',
      date: r.date,
      time: cls?.start_time?.slice(0, 5) ?? '',
      status: r.status,
      discipline: (cls?.discipline ?? 'Pilates Reformer') as Discipline,
      teacherName: cls?.teachers?.name ?? '—',
    }
  })

  // Cupos de la semana actual por clase (confirmadas + asistencias)
  const weekStart = mondayOf()
  const weekEnd = addDays(weekStart, 6)
  const classes: ClassSession[] = (classesRes.data ?? []).map((c) => {
    // Las especiales tienen su propia fecha; las regulares caen en el día
    // de la semana que les toca (migración 0017).
    const classDate = c.date ?? addDays(weekStart, c.day_of_week)
    const ofWeek = reservations.filter(
      (r) => r.classId === c.id && r.date >= weekStart && r.date <= weekEnd
    )
    return {
      id: c.id,
      title: c.title,
      discipline: c.discipline as Discipline,
      teacherId: c.teacher_id,
      teacherName: (c.teachers as { name: string } | null)?.name ?? '—',
      dayOfWeek: c.day_of_week,
      time: c.start_time.slice(0, 5),
      durationMinutes: c.duration_minutes,
      capacity: c.capacity,
      enrolled: ofWeek.filter((r) => r.status === 'confirmada' || r.status === 'asistió').length,
      waitlist: ofWeek.filter((r) => r.status === 'lista de espera').length,
      room: c.room,
      color: c.color ?? '#847164',
      kind: (c.kind ?? 'regular') as ClassSession['kind'],
      date: c.date ?? '',
      description: c.description ?? '',
      level: c.level ?? '',
      price: c.price === null || c.price === undefined ? null : Number(c.price),
      requirements: c.requirements ?? '',
      bookable: c.bookable ?? true,
      // fecha concreta de esta clase en la semana actual (para reservar)
      weekDate: classDate,
    } as ClassSession & { weekDate: string }
  })

  const payments: Payment[] = (paymentsRes.data ?? []).map((p) => {
    // ?? null mientras la 0041 no haya corrido: sin la columna no hay
    // ofertas de renovación, y cada cuota pendiente es deuda como antes.
    const renueva: string | null = p.renueva_membresia_id ?? null
    return {
      id: p.id,
      studentId: p.student_id,
      studentName: (p.students as { name: string } | null)?.name ?? studentName(p.student_id),
      membershipId: p.membership_id ?? '',
      planName: p.concept,
      amount: Number(p.amount),
      date: p.paid_date ?? '',
      dueDate: p.due_date,
      status: derivePaymentStatus(p.status, p.due_date, renueva),
      method: p.method ?? undefined,
      receiptNumber: p.receipt_number,
      mpLink: p.mp_link ?? null,
      renuevaMembresiaId: renueva,
    }
  })

  // Si Mercado Pago está conectado, sin leer el token.
  //
  // La tabla la lee solo el admin (0008), y con razón: el token no tiene
  // por qué viajar al navegador de recepción. Pero una consulta sin
  // permiso devuelve CERO FILAS, no un error, así que preguntando por la
  // tabla el sistema concluía "no está configurado" y le escondía a
  // recepción botones que el servidor le habría aceptado. La función de la
  // 0032 contesta el sí o el no sin mostrar el dato.
  let mpConfigured = false
  try {
    const { data, error } = await supabase.rpc('mp_configurado')
    if (error) {
      // PGRST202 = falta la 0032. Se cae al camino viejo, que anda para el
      // admin y deja a recepción como estaba.
      const { data: mpSetting } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'mp_access_token')
        .maybeSingle()
      mpConfigured = !!mpSetting?.value
    } else {
      mpConfigured = !!data
    }
  } catch {
    mpConfigured = false
  }

  // Catálogo de salas (vacío si aún no corrió la migración 0004)
  let rooms: Room[] = []
  try {
    const { data: roomRows } = await supabase
      .from('rooms')
      .select('id, name')
      .eq('active', true)
      .order('name')
    rooms = (roomRows ?? []).map((r) => ({ id: r.id, name: r.name }))
  } catch {
    rooms = []
  }

  const monthlyRevenue: MonthlyRevenue[] = (revenueRes.data ?? [])
    .slice(-6)
    .map((r) => {
      const [, month] = (r.month as string).split('-').map(Number)
      return { month: MONTH_LABELS[month - 1] ?? r.month, amount: Number(r.amount) }
    })

  const alerts = buildAlerts(students, memberships, payments, classes)

  return {
    teachers, plans, students, memberships, classes, reservations, payments,
    monthlyRevenue, alerts, rooms, occurrences, disciplines, paymentMethods, permisos, denied, settings, settingsMeta,
    mpConfigured,
  }
}

function buildAlerts(
  students: Student[],
  memberships: Membership[],
  payments: Payment[],
  classes: ClassSession[]
): Alert[] {
  const alerts: Alert[] = []
  const name = (id: string) => students.find((s) => s.id === id)?.name
  const today = hoyISO()

  for (const m of memberships) {
    // Solo la que la ficha muestra como suya genera alerta: la que cubre
    // hoy, o la de end_date más alto si ninguna la cubre —que es la que
    // dispara el aviso de vencida de acá abajo—. No es "la más reciente"
    // desde el encolado de la 0036: una que arranca el mes que viene no
    // tiene por qué avisar nada todavía, y de hecho su estado 'futura' no
    // entra en ninguna de las tres ramas.
    if (students.find((s) => s.id === m.studentId)?.membership?.id !== m.id) continue
    if (m.status === 'vencida' && m.endDate >= addDays(today, -30)) {
      alerts.push({
        id: `mv-${m.id}`, type: 'danger',
        message: `Membresía vencida el ${m.endDate}`,
        studentId: m.studentId, studentName: name(m.studentId),
      })
    } else if (m.status === 'por vencer') {
      alerts.push({
        id: `mp-${m.id}`, type: 'warning',
        message: `Membresía vence el ${m.endDate}`,
        studentId: m.studentId, studentName: name(m.studentId),
      })
    } else if (m.status === 'activa' && m.classesTotal - m.classesUsed <= 1) {
      const left = m.classesTotal - m.classesUsed
      alerts.push({
        id: `mc-${m.id}`, type: 'warning',
        message: left === 0 ? 'No le quedan clases disponibles' : 'Solo le queda 1 clase disponible',
        studentId: m.studentId, studentName: name(m.studentId),
      })
    }
  }

  for (const p of payments) {
    // La oferta de renovación queda afuera: no es plata que alguien deba,
    // así que no hay a quién reclamarle. Se pregunta explícito y no se
    // confía en que su estado nunca sea 'vencido': el día que la derivación
    // cambie, esta alerta de cobranza no tiene que volver con ella.
    if (esOferta(p)) continue
    if (p.status === 'vencido') {
      alerts.push({
        id: `pv-${p.id}`, type: 'danger',
        message: `Pago vencido desde ${p.dueDate} — $${p.amount.toLocaleString('es-AR')}`,
        studentId: p.studentId, studentName: p.studentName,
      })
    }
  }

  for (const c of classes) {
    if (c.enrolled >= c.capacity && c.waitlist > 0) {
      alerts.push({
        id: `cf-${c.id}`, type: 'info',
        message: `Clase ${c.title} completa — ${c.waitlist} en lista de espera`,
      })
    }
  }

  return alerts.slice(0, 12)
}

// ---------------------------------------------------------------
// Mutaciones (Fase 1: operación manual del estudio)
// ---------------------------------------------------------------
export interface NewStudentInput {
  name: string
  email: string
  phone: string
  dni: string
  birthdate?: string
  observations?: string
  medicalNotes?: string
  planId?: string
}

/**
 * Lo médico vive en student_private (0008, el profesor no lo lee).
 *
 * El error sube: antes caía a students.medical_notes, una columna que la
 * migración 0008 eliminó, así que el fallback fallaba en silencio y la
 * nota se perdía sin avisar.
 */
async function saveMedicalNotes(studentId: string, medicalNotes: string): Promise<void> {
  const { error } = await supabase
    .from('student_private')
    .upsert({ student_id: studentId, medical_notes: medicalNotes, updated_at: new Date().toISOString() })
  if (error) throw error
}

const PAYMENT_GRACE_DAYS = 5

export async function createStudent(
  input: NewStudentInput,
  plans: Plan[],
  settings: Settings = {}
): Promise<void> {
  const { data: student, error } = await supabase
    .from('students')
    .insert({
      name: input.name,
      email: input.email,
      phone: input.phone,
      dni: input.dni,
      birthdate: input.birthdate || null,
      observations: input.observations || null,
    })
    .select()
    .single()
  if (error) throw error

  if (input.medicalNotes) await saveMedicalNotes(student.id, input.medicalNotes)

  if (input.planId) {
    await assignMembership(student.id, input.planId, plans, settings)
  }
}

export async function updateStudent(id: string, input: Omit<NewStudentInput, 'planId'>): Promise<void> {
  const { error } = await supabase
    .from('students')
    .update({
      name: input.name,
      email: input.email,
      phone: input.phone,
      dni: input.dni,
      birthdate: input.birthdate || null,
      observations: input.observations || null,
    })
    .eq('id', id)
  if (error) throw error
  // Solo se toca si el formulario la trajo. Con permisos por rol, quien
  // edite una ficha sin poder ver lo médico manda undefined y la nota
  // queda intacta en vez de guardarse vacía.
  if (input.medicalNotes !== undefined) await saveMedicalNotes(id, input.medicalNotes)
}

/** Prende o apaga la renovación automática de una membresía. */
export async function setMembershipAutoRenew(membershipId: string, autoRenew: boolean): Promise<void> {
  const { error } = await supabase
    .from('memberships')
    .update({ auto_renew: autoRenew })
    .eq('id', membershipId)
  if (error) throw error
}

/**
 * Crea la membresía y deja generada la deuda (pago pendiente).
 *
 * `settings` va por parámetro y no se consulta acá adentro porque el
 * paquete del estudio ya los trae cargados: pedirlos de nuevo sería un
 * viaje a la base por cada alta. Con el objeto vacío cae al default, que es
 * lo mismo que hacía antes de que el parámetro existiera.
 */
export async function assignMembership(
  studentId: string,
  planId: string,
  plans: Plan[],
  settings: Settings = {}
): Promise<void> {
  const plan = plans.find((p) => p.id === planId)
  if (!plan) throw new Error('Plan inexistente')

  // Las dos fechas las decide la base (trigger memberships_fechas, 0036 y
  // 0037): corre el inicio detrás de la mensualidad que le quede viva —los
  // pases de prueba no encolan ni empujan— y calcula el fin con
  // vigencia_hasta. Lo de acá viaja igual por una sola razón: si esas
  // migraciones no corrieron no hay trigger que pise nada y estos son los
  // valores que quedan escritos. Por eso cuenta como la rama de DÍAS de
  // vigencia_hasta —la única que puede regir sin la 0036, que es la que
  // trajo duration_months—: son días de USO y end_date es inclusivo, así
  // que 7 días arrancando el 20 llegan hasta el 26 y no hasta el 27.
  const start = hoyISO()
  const { data: membership, error } = await supabase
    .from('memberships')
    .insert({
      student_id: studentId,
      plan_id: planId,
      start_date: start,
      end_date: addDays(start, plan.durationDays - 1),
      classes_total: plan.classCount,
      classes_used: 0,
      price: plan.price,
    })
    .select()
    .single()
  if (error) throw error

  if (plan.price > 0) {
    // El vencimiento se cuenta desde que arranca el período, no desde hoy:
    // con el encolado, un período pagado el 5/10 que empieza el 20/10 dejaba
    // la cuota vencida el 10/10, o sea que pagarla el día que la membresía
    // empieza ya figuraba como deuda atrasada en Pagos. El start_date que
    // vuelve del insert es el que puso el trigger; si la fila no volviera
    // con fecha, se cae a hoy, que es el arranque que se pidió.
    const inicio: string = membership?.start_date ?? start
    const desde = inicio > start ? inicio : start
    const { error: payError } = await supabase.from('payments').insert({
      student_id: studentId,
      membership_id: membership.id,
      concept: plan.name,
      amount: plan.price,
      // El plazo lo pone el estudio desde Configuración. Estaba escrito en
      // el código mientras el parámetro ya existía y nadie lo leía: la
      // estudio lo cambiaba y la cuota seguía venciendo a los cinco días.
      due_date: addDays(desde, settingNum(settings, 'payment_grace_days', PAYMENT_GRACE_DAYS)),
      status: 'pendiente',
    })
    if (payError) throw payError
  }
}

export interface NewPaymentInput {
  studentId: string
  membershipId?: string
  concept: string
  amount: number
  method: 'efectivo' | 'transferencia' | 'tarjeta'
}

/** Registra un cobro; devuelve el número de comprobante asignado. */
export async function registerPayment(input: NewPaymentInput): Promise<number> {
  const { data, error } = await supabase
    .from('payments')
    .insert({
      student_id: input.studentId,
      membership_id: input.membershipId || null,
      concept: input.concept,
      amount: input.amount,
      due_date: hoyISO(),
      // El día lo deriva la base del instante, en el huso del estudio
      // (migración 0016). Una sola definición de "día" para todos.
      paid_at: new Date().toISOString(),
      status: 'pagado',
      method: input.method,
    })
    .select()
    .single()
  if (error) throw error
  return data.receipt_number
}

/**
 * Anula un cobro. No se borra ni se toca el comprobante: el número emitido
 * queda, el pago pasa a 'anulado' y deja de contar como plata entrada.
 *
 * Si el cobro era de un día que ya se arqueó, ese arqueo NO cambia — dice
 * lo que se contó ese día y sigue siendo cierto. Lo que haya que devolver
 * se registra hoy, como movimiento de caja.
 */
export async function voidPayment(paymentId: string, motivo: string): Promise<void> {
  const { data: actual } = await supabase
    .from('payments')
    .select('notes')
    .eq('id', paymentId)
    .single()
  const previo = (actual?.notes ?? '').trim()
  const { error } = await supabase
    .from('payments')
    .update({
      status: 'anulado',
      notes: [previo, `Anulado: ${motivo.trim()}`].filter(Boolean).join(' · '),
    })
    .eq('id', paymentId)
  if (error) throw error
}

/** Cobra un pago pendiente existente; devuelve el número de comprobante. */
/**
 * Cobra el pago. `amount` viaja porque el monto puede haber cambiado al
 * elegir el medio: lo que se guarda es lo que entró de verdad a la caja,
 * no el precio de lista. Sin monto, se cobra lo que ya estaba.
 */
export async function collectPayment(
  paymentId: string,
  method: 'efectivo' | 'transferencia' | 'tarjeta',
  amount?: number
): Promise<number> {
  const cambios: Record<string, unknown> = {
    status: 'pagado',
    method,
    paid_at: new Date().toISOString(),
  }
  if (amount !== undefined) cambios.amount = amount

  const { data, error } = await supabase
    .from('payments')
    .update(cambios)
    .eq('id', paymentId)
    .select()
    .single()
  if (error) throw error
  return data.receipt_number
}

export interface PlanInput {
  name: string
  price: number
  classCount: number
  /** Veces por semana. 0 = no aplica, como el pase de un día. */
  weeklyFrequency: number
  durationDays: number
  /** Meses de calendario (0036). 0 = manda durationDays. */
  durationMonths: number
  disciplines: Discipline[]
  description: string
  color: string
  isTrial: boolean
  /** El que la web destaca como "el más elegido" */
  popular: boolean
}

function planRow(input: PlanInput) {
  return {
    name: input.name,
    price: input.price,
    class_count: input.classCount,
    weekly_frequency: input.weeklyFrequency,
    duration_days: input.durationDays,
    duration_months: input.durationMonths,
    disciplines: input.disciplines,
    description: input.description,
    color: input.color,
    is_trial: input.isTrial,
    popular: input.popular,
  }
}

/**
 * La columna que la base dice no conocer, si el error la nombró.
 *
 * PostgREST la escribe entre comillas simples ("Could not find the
 * 'duration_months' column of 'plans' in the schema cache") y Postgres entre
 * dobles ("column \"duration_months\" of relation \"plans\" does not
 * exist"), así que se aceptan las dos.
 */
function columnaDesconocida(mensaje: string): string | null {
  const enCache = /could not find the ['"]([^'"]+)['"] column/i.exec(mensaje)
  if (enCache) return enCache[1]
  const enTabla = /column ['"]([^'"]+)['"].*does not exist/i.exec(mensaje)
  return enTabla?.[1] ?? null
}

/**
 * Escribe el plan tolerando que una migración de columna no haya corrido:
 * si la base dice que no conoce una columna, se reintenta sin ella.
 *
 * Antes miraba solo el nombre weekly_frequency (0025), y con duration_months
 * (0036) en el row eso ya no alcanzaba: el mensaje no matcheaba, el error
 * subía y guardar un plan fallaba en la pantalla. Se parsea el nombre que
 * trae el mensaje en vez de mantener una lista, que hay que ampliar en cada
 * migración y falla justo el día que alguien se olvida.
 */
async function escribirPlan(
  escribir: (row: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>,
  row: Record<string, unknown>
): Promise<void> {
  const fila = { ...row }
  // Termina siempre: solo reintenta cuando saca una columna que el row
  // tenía, así que cada vuelta lo deja más chico. Y cualquier otro error
  // —un CHECK, un permiso, la conexión— sube tal cual, como antes.
  for (;;) {
    const { error } = await escribir(fila)
    if (!error) return
    const columna = columnaDesconocida(error.message)
    if (!columna || !(columna in fila)) throw error
    delete fila[columna]
  }
}

export async function createPlan(input: PlanInput): Promise<void> {
  await escribirPlan((row) => supabase.from('plans').insert(row), planRow(input))
}

export async function updatePlan(id: string, input: PlanInput): Promise<void> {
  await escribirPlan((row) => supabase.from('plans').update(row).eq('id', id), planRow(input))
}

export async function deactivatePlan(id: string): Promise<void> {
  const { error } = await supabase.from('plans').update({ active: false }).eq('id', id)
  if (error) throw error
}

export async function createReservation(
  studentId: string,
  classId: string,
  date: string,
  status: 'confirmada' | 'lista de espera' = 'confirmada'
): Promise<void> {
  const { error } = await supabase
    .from('reservations')
    .insert({ student_id: studentId, class_id: classId, date, status })
  if (!error) return
  if (error.code !== '23505') throw error

  // La restricción única de (cliente, clase, fecha) no mira el estado, así
  // que una reserva cancelada bloquea anotarse de nuevo en esa misma
  // clase. Pasa todo el tiempo: cancela, se le libera la tarde y quiere
  // volver. Se reactiva la fila que ya está, que además conserva su
  // historia (0031).
  const { data: previa } = await supabase
    .from('reservations')
    .select('id, status')
    .eq('student_id', studentId)
    .eq('class_id', classId)
    .eq('date', date)
    .maybeSingle()

  if (previa?.status === 'cancelada') {
    const { error: reError } = await supabase.rpc('reactivar_reserva', {
      p_reserva: previa.id,
      p_estado: status,
    })
    // PGRST202 = falta correr la 0031. Se avisa qué pasa, no se calla.
    if (reError?.code === 'PGRST202') {
      throw new Error(
        'Ya tiene una reserva cancelada en esa clase. Para reactivarla falta correr la migración 0031.'
      )
    }
    if (reError) throw reError
    return
  }

  throw new Error('Ese cliente ya tiene una reserva para esa clase.')
}

export async function updateReservationStatus(
  reservationId: string,
  status: Reservation['status']
): Promise<void> {
  const { error } = await supabase.from('reservations').update({ status }).eq('id', reservationId)
  if (error) throw error
}

/**
 * El descuento de la clase ya no vive acá.
 *
 * Hasta la 0029 lo hacía el navegador: markAttendance sumaba uno a
 * classes_used y undoAttendance restaba. Elegían la membresía con una
 * consulta suelta —la más reciente que siguiera vigente— así que si la
 * cliente renovaba en el medio, la clase se le devolvía a la membresía
 * equivocada. Y como reservar no descontaba nada, se podía reservar de
 * más sin que ningún lado avisara.
 *
 * Ahora lo hace la base: descuenta al reservar, valida el saldo antes de
 * aceptar y recalcula el contador en vez de sumar y restar, que es lo que
 * hace imposible el doble cobro. Marcar asistencia pasó a ser lo que
 * dice: un cambio de estado, con updateReservationStatus.
 */

// ---------------------------------------------------------------
// Mercado Pago (las llamadas a la API de MP pasan por /api/mp/*
// del servidor; acá solo viaja el JWT del usuario logueado)
// ---------------------------------------------------------------
async function mpApi<T>(path: string, body?: object): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Sesión expirada, volvé a ingresar')

  const res = await fetch(`/api/mp/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body ?? {}),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(json?.error ?? `Error del servidor (${res.status})`)
  }
  return json as T
}

export interface MpSettings {
  accessToken: string
  publicKey: string
}

export async function getMpSettings(): Promise<MpSettings> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['mp_access_token', 'mp_public_key'])
  if (error) throw error
  const map = new Map((data ?? []).map((r) => [r.key, r.value]))
  return {
    accessToken: map.get('mp_access_token') ?? '',
    publicKey: map.get('mp_public_key') ?? '',
  }
}

export async function saveMpSettings(settings: MpSettings): Promise<void> {
  const { error } = await supabase.from('app_settings').upsert([
    { key: 'mp_access_token', value: settings.accessToken.trim(), updated_at: new Date().toISOString() },
    { key: 'mp_public_key', value: settings.publicKey.trim(), updated_at: new Date().toISOString() },
  ])
  if (error) throw error
}

export interface MpAccountInfo {
  nickname: string
  email: string
  site: string
}

/** Valida credenciales contra MP; si no se pasa token usa el guardado. */
export async function testMpConnection(accessToken?: string): Promise<MpAccountInfo> {
  return mpApi<MpAccountInfo>('test', accessToken ? { accessToken } : {})
}

/** Genera (o recupera) el link de pago de un pago pendiente. */
export async function createMpLink(paymentId: string): Promise<string> {
  const { link } = await mpApi<{ link: string }>('create-link', { paymentId })
  return link
}

/** Acredita en la base los links ya pagados en MP. Devuelve cuántos acreditó. */
export async function syncMpPayments(): Promise<number> {
  const { updated } = await mpApi<{ updated: number }>('sync')
  return updated
}

// ---------------------------------------------------------------
// Profesores
// ---------------------------------------------------------------
export interface TeacherInput {
  name: string
  disciplines: Discipline[]
  phone: string
  email: string
  color: string
}

export async function createTeacher(input: TeacherInput): Promise<void> {
  const { error } = await supabase.from('teachers').insert(input)
  if (error) throw error
}

export async function updateTeacher(id: string, input: TeacherInput): Promise<void> {
  const { error } = await supabase.from('teachers').update(input).eq('id', id)
  if (error) throw error
}

export async function deactivateTeacher(id: string): Promise<void> {
  const { error } = await supabase.from('teachers').update({ active: false }).eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------
// Salas
// ---------------------------------------------------------------
export async function createRoom(name: string): Promise<void> {
  const { error } = await supabase.from('rooms').insert({ name: name.trim() })
  if (error) {
    if (error.code === '23505') throw new Error('Ya existe una sala con ese nombre')
    throw error
  }
}

/** Renombra la sala y actualiza en cascada las clases que la usan. */
export async function renameRoom(id: string, oldName: string, newName: string): Promise<void> {
  const { error } = await supabase.from('rooms').update({ name: newName.trim() }).eq('id', id)
  if (error) {
    if (error.code === '23505') throw new Error('Ya existe una sala con ese nombre')
    throw error
  }
  const { error: cascadeError } = await supabase
    .from('class_sessions')
    .update({ room: newName.trim() })
    .eq('room', oldName)
  if (cascadeError) throw cascadeError
}

export async function deactivateRoom(id: string): Promise<void> {
  const { error } = await supabase.from('rooms').update({ active: false }).eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------
// Disciplinas (catálogo editable — migración 0011)
// ---------------------------------------------------------------
export interface DisciplineInput {
  name: string
  color: string
  bgColor: string
  textColor: string
  blurb: string
}

function disciplineRow(input: DisciplineInput) {
  return {
    name: input.name.trim(),
    color: input.color,
    bg_color: input.bgColor,
    text_color: input.textColor,
    blurb: input.blurb.trim(),
  }
}

export async function createDiscipline(input: DisciplineInput): Promise<void> {
  const { error } = await supabase.from('disciplines').insert(disciplineRow(input))
  if (error) {
    if (error.code === '23505') throw new Error('Ya existe una disciplina con ese nombre')
    throw error
  }
}

/**
 * Renombra la disciplina y arrastra el cambio a clases, planes y profesores.
 * Las tres tablas guardan el nombre como texto (igual que las salas), así que
 * la cascada la hace la app.
 */
/**
 * Renombrar una disciplina arrastra el nombre a class_sessions, plans y
 * teachers, porque los catálogos guardan texto y no una clave foránea.
 *
 * Desde la 0025 eso lo hace una función en la base, en una transacción: o
 * cambia todo o no cambia nada. El camino de abajo es el de antes, y
 * queda solo para el rato en que la migración todavía no corrió — hace
 * las mismas cuatro escrituras sueltas, con el mismo riesgo de dejar la
 * disciplina renombrada y las clases apuntando al nombre viejo.
 */
export async function updateDiscipline(
  id: string,
  oldName: string,
  input: DisciplineInput
): Promise<void> {
  const row = disciplineRow(input)

  const { error: rpcError } = await supabase.rpc('editar_disciplina', {
    p_id: id,
    p_nombre: row.name,
    p_color: row.color,
    p_bg_color: row.bg_color,
    p_text_color: row.text_color,
    p_blurb: row.blurb,
  })
  if (!rpcError) return
  if (rpcError.code === '23505') throw new Error('Ya existe una disciplina con ese nombre')
  // PGRST202 = la función no existe todavía. Cualquier otro error es real.
  if (rpcError.code !== 'PGRST202') throw rpcError

  const { error } = await supabase.from('disciplines').update(row).eq('id', id)
  if (error) {
    if (error.code === '23505') throw new Error('Ya existe una disciplina con ese nombre')
    throw error
  }
  if (row.name === oldName) return

  const { error: classError } = await supabase
    .from('class_sessions')
    .update({ discipline: row.name })
    .eq('discipline', oldName)
  if (classError) throw classError

  // plans.disciplines y teachers.disciplines son arrays de texto: se
  // reemplaza el valor viejo en las filas que lo contienen.
  for (const table of ['plans', 'teachers'] as const) {
    const { data: rows, error: readError } = await supabase
      .from(table)
      .select('id, disciplines')
      .contains('disciplines', [oldName])
    if (readError) throw readError
    for (const r of rows ?? []) {
      const next = (r.disciplines as string[]).map((d) => (d === oldName ? row.name : d))
      const { error: writeError } = await supabase
        .from(table)
        .update({ disciplines: next })
        .eq('id', r.id)
      if (writeError) throw writeError
    }
  }
}

/** Baja lógica: las clases y los planes que la usan siguen intactos. */
export async function deactivateDiscipline(id: string): Promise<void> {
  const { error } = await supabase.from('disciplines').update({ active: false }).eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------
// Medios de pago (catálogo editable — migración 0011)
// ---------------------------------------------------------------
export async function createPaymentMethod(code: string, name: string): Promise<void> {
  const clean = code
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
  if (!clean) throw new Error('El código no puede quedar vacío')
  const { error } = await supabase
    .from('payment_methods')
    .insert({ code: clean, name: name.trim(), is_manual: true, sort_order: 99 })
  if (error) {
    if (error.code === '23505') throw new Error('Ya existe un medio de pago con ese código')
    throw error
  }
}

export async function renamePaymentMethod(code: string, name: string): Promise<void> {
  const { error } = await supabase.from('payment_methods').update({ name: name.trim() }).eq('code', code)
  if (error) throw error
}

/**
 * El descuento o recargo del medio de pago (0028). Si la migración no
 * corrió, la base no conoce la columna y se avisa en vez de fallar mudo.
 */
export async function setPaymentMethodAjuste(code: string, ajustePct: number): Promise<void> {
  const { error } = await supabase
    .from('payment_methods')
    .update({ ajuste_pct: ajustePct })
    .eq('code', code)
  if (error) {
    if (/ajuste_pct/.test(error.message)) {
      throw new Error('Falta correr la migración 0028 para poder ajustar precios por medio de pago')
    }
    throw error
  }
}

export async function setPaymentMethodActive(code: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('payment_methods').update({ active }).eq('code', code)
  if (error) throw error
}

// ---------------------------------------------------------------
// Parámetros del negocio (studio_settings — migración 0011)
// ---------------------------------------------------------------
/** Guarda solo las claves que cambiaron. */
export async function saveSettings(changes: Record<string, string>): Promise<void> {
  const entries = Object.entries(changes)
  if (!entries.length) return
  for (const [key, value] of entries) {
    const { error } = await supabase.from('studio_settings').update({ value }).eq('key', key)
    if (error) throw error
  }
}

// ---------------------------------------------------------------
// Clases (agenda semanal)
// ---------------------------------------------------------------
export interface ClassInput {
  title: string
  discipline: Discipline
  teacherId: string
  dayOfWeek: number
  startTime: string // HH:MM
  durationMinutes: number
  capacity: number
  room: string
  color: string
  kind?: ClassKind
  /** Fecha del evento; solo para las especiales (migración 0017) */
  date?: string | null
  description?: string
  level?: string
  price?: number | null
  requirements?: string
  bookable?: boolean
}

/** Las columnas de 0017 se mandan solo si vienen, así el alta sigue
 *  funcionando aunque la migración todavía no haya corrido. */
function classExtras(input: ClassInput): Record<string, unknown> {
  const extras: Record<string, unknown> = {}
  if (input.kind !== undefined) extras.kind = input.kind
  if (input.date !== undefined) extras.date = input.date || null
  if (input.description !== undefined) extras.description = input.description
  if (input.level !== undefined) extras.level = input.level
  if (input.price !== undefined) extras.price = input.price
  if (input.requirements !== undefined) extras.requirements = input.requirements
  if (input.bookable !== undefined) extras.bookable = input.bookable
  return extras
}

function classRow(input: ClassInput) {
  return {
    title: input.title,
    discipline: input.discipline,
    teacher_id: input.teacherId,
    day_of_week: input.dayOfWeek,
    start_time: input.startTime,
    duration_minutes: input.durationMinutes,
    capacity: input.capacity,
    room: input.room,
    color: input.color,
    ...classExtras(input),
  }
}

export async function createClassSession(input: ClassInput): Promise<void> {
  const { error } = await supabase.from('class_sessions').insert(classRow(input))
  if (error) throw error
}

export async function updateClassSession(id: string, input: ClassInput): Promise<void> {
  const { error } = await supabase.from('class_sessions').update(classRow(input)).eq('id', id)
  if (error) throw error
}

/** La clase deja de aparecer en la agenda; el historial de reservas se conserva. */
export async function deactivateClassSession(id: string): Promise<void> {
  const { error } = await supabase.from('class_sessions').update({ active: false }).eq('id', id)
  if (error) throw error
}

/**
 * Vincula una profesora con la cuenta que usa para entrar. Es lo que hace
 * que my_teacher_ids() y my_class_ids() (0012) devuelvan algo, y por lo
 * tanto lo que permite que "ver solo mis clases" signifique algo. Nulo
 * desvincula.
 */
export async function setTeacherUser(teacherId: string, userId: string | null): Promise<void> {
  const { error } = await supabase
    .from('teachers')
    .update({ user_id: userId })
    .eq('id', teacherId)
  if (error) {
    // La columna es unique: una cuenta no puede ser dos profesoras.
    if (error.code === '23505') throw new Error('Esa cuenta ya está vinculada a otra profesora')
    throw error
  }
}

// ---------------------------------------------------------------
// Usuarios del sistema (solo admin)
// ---------------------------------------------------------------
export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    // select('*') y no una lista de columnas: así no se rompe si la
    // migración 0015 (columna active) todavía no corrió.
    .select('*')
    .order('created_at')
  if (error) throw error
  return (data ?? []).map((p) => ({
    id: p.id,
    fullName: p.full_name,
    email: p.email ?? '',
    role: p.role as Role,
    // Si la migración 0015 no corrió todavía, todos figuran activos
    active: p.active ?? true,
  }))
}

async function adminApi<T>(body: object, method: 'POST' | 'DELETE' = 'POST'): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Sesión expirada, volvé a ingresar')
  const res = await fetch('/api/admin/users', {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.error ?? `Error del servidor (${res.status})`)
  return json as T
}

export async function createSystemUser(input: {
  email: string
  password: string
  fullName: string
  role: Role
  /** si se pasa, vincula la cuenta creada con esta ficha de alumno */
  studentId?: string
}): Promise<void> {
  await adminApi(input)
}

// ---------------------------------------------------------------
// Portal del alumno
// ---------------------------------------------------------------
export interface Occupancy {
  confirmed: number
  waitlist: number
}

/** Ocupación por clase para una semana; clave `${classId}|${date}`. */
export async function fetchWeekOccupancy(weekStart: string): Promise<Map<string, Occupancy>> {
  const map = new Map<string, Occupancy>()
  try {
    const { data } = await supabase
      .from('class_occupancy')
      .select('*')
      .gte('date', weekStart)
      .lte('date', addDays(weekStart, 6))
    for (const row of data ?? []) {
      map.set(`${row.class_id}|${row.date}`, {
        confirmed: Number(row.confirmed),
        waitlist: Number(row.waitlist),
      })
    }
  } catch {
    // vista inexistente (migración 0005 pendiente): cupos desconocidos
  }
  return map
}

export async function reactivateSystemUser(userId: string): Promise<void> {
  const { data } = await supabase.auth.getSession()
  const res = await fetch('/api/admin/users', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ userId }),
  })
  if (!res.ok) throw new Error((await res.json()).error ?? 'No se pudo reactivar')
}

/** Da de baja el acceso: el perfil se conserva y el login queda bloqueado. */
export async function deleteSystemUser(userId: string): Promise<void> {
  await adminApi({ userId }, 'DELETE')
}

export async function updateUserRole(userId: string, role: Role): Promise<void> {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId)
  if (error) throw error
}

// ---------------------------------------------------------------
// Notificaciones (migración 0007)
// ---------------------------------------------------------------

/** Últimas notificaciones visibles para el usuario, con su estado de lectura. */
export async function fetchNotifications(userId: string): Promise<AppNotification[]> {
  const [notifRes, readsRes] = await Promise.all([
    supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(30),
    supabase.from('notification_reads').select('notification_id').eq('user_id', userId),
  ])
  if (notifRes.error) throw notifRes.error
  const readSet = new Set((readsRes.data ?? []).map((r) => r.notification_id))
  return (notifRes.data ?? []).map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    studentId: n.student_id,
    paymentId: n.payment_id,
    createdAt: n.created_at,
    read: readSet.has(n.id),
  }))
}

export async function markNotificationsRead(userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase.from('notification_reads').upsert(
    ids.map((id) => ({ notification_id: id, user_id: userId })),
    { onConflict: 'notification_id,user_id', ignoreDuplicates: true }
  )
  if (error) throw error
}

// ---------------------------------------------------------------
// Web Push: suscripción del dispositivo actual
// ---------------------------------------------------------------

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)
  )
}

async function pushApi(body: object, method: 'POST' | 'DELETE'): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Sesión expirada, volvé a ingresar')
  const res = await fetch('/api/push/subscribe', {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const json = await res.json().catch(() => null)
    throw new Error(json?.error ?? `Error del servidor (${res.status})`)
  }
}

/** true si este dispositivo ya está suscripto a push. */
export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

/** Pide permiso, suscribe el dispositivo y lo registra en el servidor. */
export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error('Este navegador no soporta notificaciones push')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Permiso de notificaciones denegado')
  }
  const reg = await navigator.serviceWorker.ready
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) as BufferSource,
    }))
  await pushApi({ subscription: subscription.toJSON() }, 'POST')
}

/** Da de baja el push de este dispositivo (navegador y servidor). */
export async function disablePush(): Promise<void> {
  const subscription = await getPushSubscription()
  if (!subscription) return
  await pushApi({ endpoint: subscription.endpoint }, 'DELETE')
  await subscription.unsubscribe()
}

// ---------------------------------------------------------------
// Motor de permisos (migración 0012)
//
// No entra en fetchStudioData a propósito: solo lo necesita la pantalla de
// Configuración, y las políticas de la base lo reservan al admin.
// ---------------------------------------------------------------
export async function fetchPermissionMatrix(): Promise<PermissionMatrix> {
  const [keysRes, rolesRes, usersRes] = await Promise.all([
    supabase.from('permission_keys').select('*').order('grupo').order('orden'),
    supabase.from('role_permissions').select('role, clave'),
    supabase.from('user_permissions').select('*'),
  ])
  const firstError = keysRes.error || rolesRes.error || usersRes.error
  if (firstError) throw firstError

  const keys: PermissionKey[] = (keysRes.data ?? []).map((k) => ({
    clave: k.clave,
    etiqueta: k.etiqueta,
    ayuda: k.ayuda ?? '',
    grupo: k.grupo,
    orden: k.orden,
    tipo: k.tipo,
    legacyRoles: k.legacy_roles ?? [],
    modo: k.enforce_mode,
  }))

  const granted = new Set((rolesRes.data ?? []).map((r) => `${r.role}|${r.clave}`))

  const overrides: UserPermission[] = (usersRes.data ?? []).map((u) => ({
    userId: u.user_id,
    clave: u.clave,
    allow: u.allow,
    motivo: u.motivo ?? '',
    expiresAt: u.expires_at ?? null,
  }))

  return { keys, granted, overrides }
}

/** Tildar es insertar la fila; destildar es borrarla. */
export async function setRolePermission(
  role: string,
  clave: string,
  granted: boolean
): Promise<void> {
  if (granted) {
    const { error } = await supabase.from('role_permissions').insert({ role, clave })
    if (error && error.code !== '23505') throw error
  } else {
    const { error } = await supabase
      .from('role_permissions')
      .delete()
      .eq('role', role)
      .eq('clave', clave)
    if (error) throw error
  }
}

/** Excepción para una persona: allow true suma, false resta. */
export async function setUserPermission(
  userId: string,
  clave: string,
  allow: boolean,
  motivo: string
): Promise<void> {
  const { error } = await supabase
    .from('user_permissions')
    .upsert({ user_id: userId, clave, allow, motivo }, { onConflict: 'user_id,clave' })
  if (error) throw error
}

/** Saca la excepción: vuelve a mandar el rol. */
export async function clearUserPermission(userId: string, clave: string): Promise<void> {
  const { error } = await supabase
    .from('user_permissions')
    .delete()
    .eq('user_id', userId)
    .eq('clave', clave)
  if (error) throw error
}

// ---------------------------------------------------------------
// Excepciones por fecha (migración 0018)
//
// La fila existe solo cuando ese día se aparta de la norma. Volver a lo
// normal es borrarla.
// ---------------------------------------------------------------
export async function suspendClassDate(
  classId: string,
  date: string,
  reason: string
): Promise<void> {
  const { error } = await supabase
    .from('class_occurrences')
    .upsert(
      { class_id: classId, date, status: 'suspendida', reason: reason.trim() },
      { onConflict: 'class_id,date' }
    )
  if (error) throw error
}

/**
 * Reemplazo de profesora por un día. teacherId nulo quita el reemplazo.
 *
 * Manda SOLO su propia columna. Antes mandaba también status 'normal' y
 * reason, y como el upsert pisa cada columna que viaja en el cuerpo, poner
 * un reemplazo sobre una fecha suspendida la desuspendía en silencio —la
 * clase volvía a aceptar reservas sin que nadie se enterara— y le escribía
 * 'Reemplazo' encima del motivo que la alumna lee en el portal.
 *
 * Al crear la fila, status toma el default 'normal' de la tabla (0018); al
 * actualizarla, queda el que ya tenía. Para volver a dictar una fecha
 * suspendida está clearClassDate, que es explícito.
 */
export async function setClassDateTeacher(
  classId: string,
  date: string,
  teacherId: string | null
): Promise<void> {
  const { error } = await supabase
    .from('class_occurrences')
    .upsert(
      { class_id: classId, date, teacher_id: teacherId },
      { onConflict: 'class_id,date' }
    )
  if (error) throw error
}

/** Saca la excepción: ese día vuelve a ser una clase común. */
export async function clearClassDate(classId: string, date: string): Promise<void> {
  const { error } = await supabase
    .from('class_occurrences')
    .delete()
    .eq('class_id', classId)
    .eq('date', date)
  if (error) throw error
}
