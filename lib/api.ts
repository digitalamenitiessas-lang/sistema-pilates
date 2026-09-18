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
  FixedSlot,
  StudentNote,
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

/**
 * Cuántos minutos faltan para que empiece esa clase, según el reloj del
 * estudio. Negativo si ya empezó.
 *
 * El día se pasa a minutos absolutos con `Date.UTC` —no con la fecha
 * local— porque lo único que hace falta es la distancia entre dos días, y
 * en UTC un día son 1440 minutos siempre. La hora del día ya viene del
 * huso del estudio (`ahoraDelEstudio`).
 */
function minutosHasta(
  fecha: string,
  hora: string,
  ahora: { fecha: string; hora: string } = ahoraDelEstudio()
): number {
  const dia = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    return Date.UTC(y, m - 1, d) / 60000
  }
  return dia(fecha) + enMinutos(hora) - (dia(ahora.fecha) + enMinutos(ahora.hora))
}

/**
 * Si cancelar esa clase AHORA devuelve la clase al plan, o si se pierde.
 *
 * Es la misma cuenta que hace la base al sellar `cancel_kind` (0029): en
 * plazo es `now() <= inicio - cancel_hours`. Acá está repetida porque el
 * cliente tiene que enterarse ANTES de apretar, no después: la base lo
 * clasifica bien y no devuelve la clase, y hasta el 16/09 el portal no
 * decía una palabra al respecto.
 *
 * Que sean dos cuentas separadas es una deuda conocida, y por eso esta
 * versión no puede ser más permisiva que la de la base: si alguna vez se
 * corren un minuto, tiene que avisar de más y no de menos.
 *
 * NO sirve `reservaCerrada` para esto: cruza el día devolviendo
 * `fecha < ahora.fecha` sin mirar el corte, así que con un plazo de más
 * de ocho horas —configurable— mentiría en las clases de la mañana
 * siguiente.
 */
export function cancelacionEnPlazo(
  fecha: string,
  hora: string,
  horasDePlazo: number,
  ahora: { fecha: string; hora: string } = ahoraDelEstudio()
): boolean {
  return minutosHasta(fecha, hora, ahora) >= horasDePlazo * 60
}

/**
 * Cuántos días faltan para una fecha, desde el hoy del estudio.
 *
 * Se arma con las partes del ISO y no con `new Date(iso)`, por lo mismo
 * que `addDays`: un ISO suelto se lee como UTC y en este huso eso corre la
 * fecha un día. El `round` cubre el cambio de hora: dos medianoches
 * locales pueden estar a 23 o 25 horas de distancia.
 */
export function diasHasta(hasta: string, desde: string = hoyISO()): number {
  const [ay, am, ad] = desde.split('-').map(Number)
  const [by, bm, bd] = hasta.split('-').map(Number)
  const ms = new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime()
  return Math.round(ms / 86_400_000)
}

/** "hoy", "mañana", "en 27 días", "hace 3 días". Sin verbo, para que sirva
 *  tanto para lo que vence como para lo que arranca. */
export function enDias(hasta: string, desde: string = hoyISO()): string {
  const d = diasHasta(hasta, desde)
  if (d < 0) return `hace ${-d === 1 ? 'un día' : `${-d} días`}`
  if (d === 0) return 'hoy'
  if (d === 1) return 'mañana'
  return `en ${d} días`
}

/**
 * La cuenta de días del vencimiento, en palabras.
 *
 * Dice "vence en N días" y no "te quedan N días" a propósito: el último
 * día de la membresía es inclusive —se puede usar—, así que "te quedan"
 * obligaría a decidir si hoy cuenta, y cualquiera de las dos respuestas
 * se lee como un error de uno. "Vence en N días" mide la distancia hasta
 * una fecha, que es lo que no admite discusión. Y la fecha queda al lado,
 * para quien quiera el dato exacto.
 */
export function cuentaDeDias(hasta: string, desde: string = hoyISO()): string {
  return `${diasHasta(hasta, desde) < 0 ? 'venció' : 'vence'} ${enDias(hasta, desde)}`
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

/**
 * El número de credencial, como se muestra (0067).
 *
 * En la base es un entero; el prefijo y el relleno los pone el estudio
 * desde Configuración, porque son un texto y los textos no se escriben en
 * el código. Se deriva en cada lugar donde se muestra en vez de guardarse
 * armado: si mañana cambian el prefijo, cambian los de todas, incluidas
 * las clientas que ya estaban.
 *
 * Los dígitos se acotan a 8 — alguien que escriba 500 en Configuración no
 * puede llenar la pantalla de ceros.
 */
export function credencial(
  memberNo: number | null | undefined,
  settings: Settings
): string {
  if (!memberNo) return ''
  const digitos = Math.max(0, Math.min(8, Math.trunc(settingNum(settings, 'credencial_digitos', 4))))
  return `${settingText(settings, 'credencial_prefijo', 'CF-')}${String(memberNo).padStart(digitos, '0')}`
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
  // Antes que cualquier cosa derivada de las fechas: una cancelada (0069)
  // puede tener fechas futuras, y sin esta rama diría 'futura' y seguiría
  // apareciendo como el próximo período — que es exactamente lo que se
  // canceló.
  if (status === 'cancelada') return 'cancelada'
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
  /**
   * Los turnos fijos vivos (0048). Vacío mientras la migración no corrió,
   * y también para el rol que no tiene `turnos.ver` — ahí la política
   * devuelve cero filas, como todas.
   */
  turnosFijos: FixedSlot[]
}

export async function fetchStudioData(): Promise<StudioData> {
  // La ventana de los cupos: la semana en curso, que es lo que muestran la
  // agenda y el tablero.
  const semanaDesde = mondayOf()
  const semanaHasta = addDays(semanaDesde, 6)

  const [teachersRes, plansRes, studentsRes, membershipsRes, classesRes, reservationsRes, paymentsRes, revenueRes, cuposRes, privadoRes] =
    await Promise.all([
      supabase.from('teachers').select('*').eq('active', true).order('name'),
      supabase.from('plans').select('*').eq('active', true).order('price'),
      supabase.from('students').select('*').eq('active', true).order('name'),
      supabase.from('memberships').select('*, plans(name)').order('end_date', { ascending: false }),
      supabase.from('class_sessions').select('*, teachers(name)').eq('active', true).order('start_time'),
      supabase.from('reservations').select('*, students(name), class_sessions(title, discipline, start_time, teachers(name))').order('date', { ascending: false }),
      supabase.from('payments').select('*, students(name)').order('due_date', { ascending: false }),
      supabase.from('monthly_revenue').select('*'),
      // Cuántas hay anotadas en cada clase, contado por la base.
      //
      // `class_occupancy` (0005) es una vista SIN `security_invoker`, así
      // que corre con los permisos del dueño y cuenta TODAS las reservas,
      // no sólo las que quien pregunta puede leer. Es la misma vista con
      // la que el portal de la clienta muestra "8 lugares libres" sin
      // enterarse de quién ocupa los otros.
      //
      // Hasta acá el cupo se derivaba de la lista de reservas que volvía
      // en este mismo paquete, y eso funcionaba sólo porque todos los
      // roles leían todas las reservas. En el momento en que un rol ve
      // menos —la profesora con `reservas.ver.propio`— esa cuenta pasa a
      // mentir: las clases de la otra profesora aparecerían en 0/8. Un
      // cupo equivocado es peor que un cupo escondido; con este número la
      // grilla sigue diciendo la verdad para todos.
      supabase
        .from('class_occupancy')
        .select('class_id, date, confirmed, waitlist')
        .gte('date', semanaDesde)
        .lte('date', semanaHasta),
      // El DNI y las notas laborales de las profesoras (0061). Viven
      // aparte de `teachers` porque esa tabla la lee cualquiera logueado
      // y las políticas filtran filas, no columnas. Sin
      // `personal.ver` esto vuelve con CERO FILAS —no con un error—, y
      // los dos campos quedan vacíos: es lo mismo que veía quien no
      // tenía acceso antes, y el formulario sólo se le abre a quien puede.
      supabase.from('teacher_private').select('teacher_id, dni, notas_laborales'),
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
  const privateMap = new Map<
    string,
    {
      medicalNotes?: string
      emergencyContact?: string
      lesiones?: string
      embarazo?: string
      cirugias?: string
      medicacion?: string
    }
  >()
  const privRes = await supabase.from('student_private').select('*')
  for (const p of privRes.data ?? []) {
    privateMap.set(p.student_id, {
      medicalNotes: p.medical_notes || undefined,
      emergencyContact: p.emergency_contact || undefined,
      // Los cuatro de la 0050. Llegan con el select('*') y quedan en
      // undefined mientras la migración no haya corrido.
      lesiones: p.lesiones || undefined,
      embarazo: p.embarazo || undefined,
      cirugias: p.cirugias || undefined,
      medicacion: p.medicacion || undefined,
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
  let turnosFijos: FixedSlot[] = []
  try {
    const [discRes, methodRes, settingsRes, permisosRes] = await Promise.all([
      supabase.from('disciplines').select('*').eq('active', true).order('sort_order').order('name'),
      supabase.from('payment_methods').select('*').order('sort_order'),
      supabase.from('studio_settings').select('*').order('group_key').order('sort_order'),
      supabase.rpc('mis_permisos'),
    ])
    permisos = (permisosRes.data as string[] | null) ?? []

    // Los turnos fijos van en su propia consulta y en su propio try: la
    // vista no existe hasta que la 0048 corra, y el sistema entero tiene
    // que seguir andando igual hasta entonces.
    try {
      const { data } = await supabase
        .from('turnos_fijos')
        .select('*')
        .neq('estado', 'liberado')
        .order('day_of_week')
        .order('start_time')
      turnosFijos = (data ?? []).map((t) => ({
        id: t.id,
        studentId: t.student_id,
        studentName: t.student_name ?? '—',
        classId: t.class_id,
        classTitle: t.class_title ?? '—',
        discipline: (t.discipline ?? '') as Discipline,
        dayOfWeek: t.day_of_week,
        time: t.start_time?.slice(0, 5) ?? '',
        capacity: t.capacity ?? 0,
        room: t.room ?? '',
        estado: t.estado,
        desde: t.desde,
        motivo: t.motivo ?? null,
        prioridadHasta: t.prioridad_hasta ?? null,
        conPrioridad: !!t.con_prioridad,
      }))
    } catch {
      // sin la 0048: el sistema anda igual, sin turnos fijos
    }

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
      defaultAccountId: m.default_account_id ?? null,
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

  // Sin `personal.ver` esto llega vacío, y los dos campos quedan en ''.
  const privados = new Map<string, { dni: string; notasLaborales: string }>()
  for (const r of (privadoRes.data ?? []) as Array<{
    teacher_id: string
    dni: string | null
    notas_laborales: string | null
  }>) {
    privados.set(r.teacher_id, {
      dni: r.dni ?? '',
      notasLaborales: r.notas_laborales ?? '',
    })
  }

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
    // La ficha laboral (0053), partida en dos desde la 0061: las fechas
    // siguen en `teachers` —`fecha_baja` la usan `liquidacion()` y
    // `sesiones_dictadas()` por dentro— y el DNI y las notas vienen de la
    // satélite, que no todos leen.
    laboral: {
      fechaIngreso: t.fecha_ingreso ?? null,
      fechaBaja: t.fecha_baja ?? null,
      dni: privados.get(t.id)?.dni ?? '',
      notasLaborales: privados.get(t.id)?.notasLaborales ?? '',
    },
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
    // Llega solo con el select('*'), y queda en undefined mientras la
    // 0047 no haya corrido.
    endDateMotivo: m.end_date_motivo ?? null,
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
    m.status !== 'suspendida' &&
    // Y la cancelada tampoco compite (0069): la base no la va a elegir para
    // descontar, porque `membresia_para` filtra por status = 'activa'.
    m.status !== 'cancelada' &&
    m.startDate <= hoy &&
    m.endDate >= hoy
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
    lesiones: privateMap.get(s.id)?.lesiones,
    embarazo: privateMap.get(s.id)?.embarazo,
    cirugias: privateMap.get(s.id)?.cirugias,
    medicacion: privateMap.get(s.id)?.medicacion,
    emergencyContact: privateMap.get(s.id)?.emergencyContact,
    userId: s.user_id ?? null,
    // `select('*')`, así que antes de la 0067 la columna no viene y esto
    // queda en null: la pantalla esconde la credencial en vez de inventar
    // un número.
    memberNo: s.member_no ?? null,
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
      // Las tres salen del select('*') de arriba, así que llegan solas
      // cuando la migración corre y quedan en undefined mientras no.
      cancelKind: r.cancel_kind ?? null,
      membershipId: r.membership_id ?? null,
      recoversReservationId: r.recovers_reservation_id ?? null,
      overrideReason: r.override_reason ?? null,
    }
  })

  // Cupos de la semana actual por clase (confirmadas + asistencias)
  const weekStart = semanaDesde
  const weekEnd = semanaHasta

  // Lo que dijo la base, sumado por clase dentro de la semana. Se suma en
  // vez de tomar la fila del día para reproducir exactamente lo que hacía
  // la cuenta anterior: una clase regular tiene una sola fecha en la
  // semana, pero una especial puede tener la suya fuera del rango y ahí
  // las dos dan cero.
  //
  // Si la vista no contesta —no existe, o el día que alguien le ponga
  // `security_invoker`— el mapa queda vacío y abajo se cae a la cuenta
  // vieja. Eso no es un modo degradado silencioso: la cuenta vieja es la
  // correcta mientras el rol lea todas las reservas, que es el caso de
  // recepción y del admin.
  const cupos = new Map<string, { confirmed: number; waitlist: number }>()
  for (const row of (cuposRes.data ?? []) as Array<{
    class_id: string
    date: string
    confirmed: number | string
    waitlist: number | string
  }>) {
    const previo = cupos.get(row.class_id) ?? { confirmed: 0, waitlist: 0 }
    cupos.set(row.class_id, {
      confirmed: previo.confirmed + Number(row.confirmed),
      waitlist: previo.waitlist + Number(row.waitlist),
    })
  }
  const hayCupos = (cuposRes.data ?? []).length > 0 || !cuposRes.error
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
      enrolled: hayCupos
        ? cupos.get(c.id)?.confirmed ?? 0
        : ofWeek.filter((r) => r.status === 'confirmada' || r.status === 'asistió').length,
      waitlist: hayCupos
        ? cupos.get(c.id)?.waitlist ?? 0
        : ofWeek.filter((r) => r.status === 'lista de espera').length,
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
    monthlyRevenue, alerts, rooms, occurrences, disciplines, paymentMethods, permisos, denied, settings, settingsMeta, turnosFijos,
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
  /**
   * Quién avisar si le pasa algo en clase. La columna existe desde la
   * 0008 y hasta el 15/09 **nadie la escribía ni la mostraba**: se leía
   * en `fetchStudioData` y ahí moría. Vive en `student_private` con las
   * notas médicas, así que el profesor no la ve — que es una decisión a
   * revisar, porque en una emergencia el profesor es quien está.
   */
  emergencyContact?: string
  /** Los cuatro campos de salud de la 0050 */
  lesiones?: string
  embarazo?: string
  cirugias?: string
  medicacion?: string
  planId?: string
}

/**
 * Lo médico vive en student_private (0008, el profesor no lo lee).
 *
 * El error sube: antes caía a students.medical_notes, una columna que la
 * migración 0008 eliminó, así que el fallback fallaba en silencio y la
 * nota se perdía sin avisar.
 */
async function savePrivateData(
  studentId: string,
  datos: {
    medicalNotes?: string
    emergencyContact?: string
    lesiones?: string
    embarazo?: string
    cirugias?: string
    medicacion?: string
  }
): Promise<void> {
  // Solo lo que vino. Un `upsert` con la columna ausente no la pisa, así
  // que editar la ficha sin traer las notas médicas ya no las borra — el
  // modo de falla que la 0008 tuvo y que costó notas reales.
  const fila: Record<string, unknown> = {
    student_id: studentId,
    updated_at: new Date().toISOString(),
  }
  if (datos.medicalNotes !== undefined) fila.medical_notes = datos.medicalNotes
  if (datos.emergencyContact !== undefined) fila.emergency_contact = datos.emergencyContact
  if (datos.lesiones !== undefined) fila.lesiones = datos.lesiones
  if (datos.embarazo !== undefined) fila.embarazo = datos.embarazo
  if (datos.cirugias !== undefined) fila.cirugias = datos.cirugias
  if (datos.medicacion !== undefined) fila.medicacion = datos.medicacion
  if (Object.keys(fila).length === 2) return

  const { error } = await supabase.from('student_private').upsert(fila)

  // 42703 = la 0050 no corrió. Se reintenta sin los cuatro campos nuevos
  // en vez de perder la edición entera: guardar las notas médicas no
  // puede depender de una migración que agrega otra cosa.
  if (error?.code === '42703') {
    for (const c of ['lesiones', 'embarazo', 'cirugias', 'medicacion']) delete fila[c]
    if (Object.keys(fila).length === 2) return
    const { error: e2 } = await supabase.from('student_private').upsert(fila)
    if (e2) throw errorDeLaBase(e2, 'No se pudieron guardar los datos reservados')
    return
  }
  if (error) throw errorDeLaBase(error, 'No se pudieron guardar los datos reservados')
}

const PAYMENT_GRACE_DAYS = 5

/**
 * Devuelve el id de la ficha creada, que es lo que hace falta para
 * seguir: el alta puede terminar creándole el acceso, y para eso hay que
 * poder nombrar la ficha que se acaba de guardar.
 */
export async function createStudent(
  input: NewStudentInput,
  plans: Plan[],
  settings: Settings = {}
): Promise<string> {
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

  await savePrivateData(student.id, {
    medicalNotes: input.medicalNotes || undefined,
    emergencyContact: input.emergencyContact || undefined,
    lesiones: input.lesiones || undefined,
    embarazo: input.embarazo || undefined,
    cirugias: input.cirugias || undefined,
    medicacion: input.medicacion || undefined,
  })

  if (input.planId) {
    await assignMembership(student.id, input.planId, plans, settings)
  }

  return student.id as string
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
  await savePrivateData(id, {
    medicalNotes: input.medicalNotes,
    emergencyContact: input.emergencyContact,
    lesiones: input.lesiones,
    embarazo: input.embarazo,
    cirugias: input.cirugias,
    medicacion: input.medicacion,
  })
}

/** Prende o apaga la renovación automática de una membresía. */
/**
 * Cancelar un período (0069).
 *
 * El motivo lo exige la base, no esta función: queda escrito en la cuota
 * que se anula. Devuelve qué se canceló y cuánta cuota se fue con ella,
 * para que la pantalla lo diga en vez de dar por hecho que salió bien.
 *
 * Si la cuota ya estaba cobrada, la base rechaza con su propio texto
 * —nombrando el comprobante— y eso es lo que hay que mostrar: la plata
 * que entró se devuelve desde Pagos.
 */
export async function cancelarMembresia(
  membershipId: string,
  motivo: string
): Promise<{ plan: string; desde: string; hasta: string; clasesUsadas: number; cuotaAnulada: number }> {
  const { data, error } = await supabase.rpc('cancelar_membresia', {
    p_id: membershipId,
    p_motivo: motivo,
  })
  if (error?.code === '42883' || error?.code === 'PGRST202') {
    throw new Error('Para cancelar una membresía falta correr la migración 0069.')
  }
  if (error) throw errorDeLaBase(error, 'No se pudo cancelar la membresía')
  const f = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined
  return {
    plan: String(f?.plan ?? '—'),
    desde: String(f?.desde ?? ''),
    hasta: String(f?.hasta ?? ''),
    clasesUsadas: Number(f?.clases_usadas ?? 0),
    cuotaAnulada: Number(f?.cuota_anulada ?? 0),
  }
}

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

/**
 * Qué membresía paga una clase de ese día.
 *
 * Espeja `membresia_para` de la 0029: la del día de la CLASE y no la de
 * hoy, y si hay más de una, la que vence antes — se usa primero la que
 * primero se pierde. Acá es solo para que la pantalla ofrezca lo mismo
 * que la base va a aceptar; quien decide sigue siendo la base.
 */
export function membresiaQueCubre(
  memberships: Membership[],
  studentId: string,
  date: string
): Membership | undefined {
  return memberships
    .filter(
      (m) =>
        m.studentId === studentId &&
        m.status === 'activa' &&
        date >= m.startDate &&
        date <= m.endDate
    )
    .sort((a, b) => a.endDate.localeCompare(b.endDate))[0]
}

/**
 * Las clases que perdió y puede reponer en la fecha pedida (0046).
 *
 * Espeja `recupero_elegible`: se recupera lo que consumió y no usó —
 * canceló fuera de plazo, o faltó sin avisar cuando la ausencia
 * consume—, una sola vez, y dentro del mismo período que la pagó.
 *
 * Lo único que la pantalla no puede comprobar es si el estudio suspendió
 * ese día: las excepciones por fecha no viajan en la reserva. Esa la
 * descarta la base, que es la que manda; acá sobraría un candidato que
 * el mostrador va a ver rechazado con su motivo.
 */
export function clasesRecuperables(
  reservations: Reservation[],
  memberships: Membership[],
  studentId: string,
  date: string,
  settings: Settings,
  settingsMeta: StudioSetting[]
): Reservation[] {
  // Mientras el tope no rija, la base rechaza el recupero con su motivo
  // (`recupero_rige`, 0046). Ofrecerlo igual sería mostrar un camino que
  // termina en un error: la pantalla esconde lo que la base va a
  // rechazar, que es la misma regla de los permisos en sombra.
  const tope = settingsMeta.find((s) => s.key === 'recovery_max')
  if (!tope?.rige) return []

  const mem = membresiaQueCubre(memberships, studentId, date)
  if (!mem) return []

  const laAusenciaConsume = settingBool(settings, 'absence_consumes_class', true)
  const yaRepuestas = new Set(
    reservations.map((r) => r.recoversReservationId).filter(Boolean) as string[]
  )

  return reservations
    .filter(
      (r) =>
        r.studentId === studentId &&
        r.membershipId === mem.id &&
        !r.recoversReservationId &&
        !yaRepuestas.has(r.id) &&
        ((r.status === 'cancelada' && r.cancelKind === 'fuera de plazo') ||
          (r.status === 'ausente' && laAusenciaConsume))
    )
    .sort((a, b) => b.date.localeCompare(a.date))
}

// ---------------------------------------------------------------
// La bitácora del cliente (0050)
//
// No viaja en `fetchStudioData`: se lee al abrir la ficha. Es historia
// que crece sin techo y que solo mira quien está parado en esa ficha —
// traerla entera en cada ingreso es el error que la 0021 vino a corregir
// para los reportes.
// ---------------------------------------------------------------

export async function fetchStudentNotes(studentId: string): Promise<StudentNote[]> {
  const { data, error } = await supabase
    .from('student_notes')
    .select('*, profiles:author_id(full_name)')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })

  // Sin la 0050 no hay bitácora, y la ficha tiene que abrir igual.
  if (error?.code === '42P01' || error?.code === 'PGRST205') return []
  if (error) throw errorDeLaBase(error, 'No se pudo leer la bitácora')

  return (data ?? []).map((n) => ({
    id: n.id,
    studentId: n.student_id,
    kind: n.kind,
    body: n.body,
    // Un autor sin perfil es una cuenta dada de baja: se dice, no se
    // inventa un nombre ni se deja el renglón vacío.
    authorName: (n.profiles as { full_name: string } | null)?.full_name ?? 'Cuenta dada de baja',
    createdAt: n.created_at,
  }))
}

export async function addStudentNote(
  studentId: string,
  body: string,
  kind: StudentNote['kind'] = 'profesora'
): Promise<void> {
  const texto = body.trim()
  if (!texto) throw new Error('Escribí la nota antes de guardarla')

  // `author_id` no se manda: lo sella la base. Mandarlo desde acá sería
  // dejar elegir quién firma, que es lo contrario de una bitácora.
  const { error } = await supabase
    .from('student_notes')
    .insert({ student_id: studentId, body: texto, kind })

  if (error?.code === '42P01' || error?.code === 'PGRST205') {
    throw new Error('Para usar la bitácora falta correr la migración 0050.')
  }
  if (error) throw errorDeLaBase(error, 'No se pudo guardar la nota')
}

export async function deleteStudentNote(id: string): Promise<void> {
  // Un delete que la política rechaza devuelve `error: null` y no borra
  // nada, así que se cuenta lo que volvió en vez de confiar en el error.
  const { data, error } = await supabase
    .from('student_notes')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) throw errorDeLaBase(error, 'No se pudo borrar la nota')
  if (!data || data.length === 0) {
    throw new Error('No tenés permiso para borrar notas de la bitácora.')
  }
}

// ---------------------------------------------------------------
// Turnos fijos (0048)
//
// Un turno fijo es el derecho de un cliente sobre un día y hora de la
// grilla, no una reserva ni un conjunto de reservas. Por eso acá no se
// crea ni se cancela nada de `reservations`: se escribe una fila de
// `fixed_slots` y listo.
// ---------------------------------------------------------------

/** El aviso de que la 0048 todavía no corrió, dicho una sola vez. */
function sinTurnosFijos(error: { code?: string } | null): boolean {
  // 42P01 = la tabla no existe. PGRST205 = PostgREST no la conoce todavía.
  return error?.code === '42P01' || error?.code === 'PGRST205'
}

export async function asignarTurnoFijo(studentId: string, classId: string): Promise<void> {
  const { error } = await supabase
    .from('fixed_slots')
    .insert({ student_id: studentId, class_id: classId })

  if (sinTurnosFijos(error)) {
    throw new Error('Para usar los turnos fijos falta correr la migración 0048.')
  }
  // El índice parcial: ya tiene un turno vivo en esa clase.
  if (error?.code === '23505') {
    throw new Error('Ese cliente ya tiene un turno fijo en esa clase.')
  }
  if (error) throw errorDeLaBase(error, 'No se pudo asignar el turno fijo')
}

/**
 * Cambiarle el horario sin perder el historial: se libera el que tenía y
 * se le da el nuevo. Dos filas y no un `update` del `class_id`, porque
 * "quién ocupaba este horario antes" es justamente lo que explica por qué
 * hoy está libre — y con un update esa respuesta se pierde.
 *
 * Si el turno nuevo no entra por cupo, el viejo ya quedó liberado. Es el
 * orden correcto igual: al revés, mover a alguien dentro de una clase
 * llena fallaría siempre contra su propio lugar.
 */
export async function moverTurnoFijo(
  slotId: string,
  studentId: string,
  nuevaClaseId: string
): Promise<void> {
  await liberarTurnoFijo(slotId, 'Cambio de horario')
  await asignarTurnoFijo(studentId, nuevaClaseId)
}

export async function liberarTurnoFijo(slotId: string, motivo: string): Promise<void> {
  const texto = motivo.trim()
  if (!texto) throw new Error('Escribí por qué se libera el turno')

  const { error } = await supabase
    .from('fixed_slots')
    .update({ estado: 'liberado', motivo: texto })
    .eq('id', slotId)

  if (sinTurnosFijos(error)) {
    throw new Error('Para usar los turnos fijos falta correr la migración 0048.')
  }
  if (error) throw errorDeLaBase(error, 'No se pudo liberar el turno')
}

/** Lo conserva sin usarlo: nadie más se lo puede tomar, pero no ocupa cupo. */
export async function pausarTurnoFijo(slotId: string, motivo: string): Promise<void> {
  const { error } = await supabase
    .from('fixed_slots')
    .update({ estado: 'pausado', motivo: motivo.trim() || null })
    .eq('id', slotId)
  if (error) throw errorDeLaBase(error, 'No se pudo pausar el turno')
}

export async function reactivarTurnoFijo(slotId: string): Promise<void> {
  const { error } = await supabase
    .from('fixed_slots')
    .update({ estado: 'activo', motivo: null })
    .eq('id', slotId)
  if (error) throw errorDeLaBase(error, 'No se pudo reactivar el turno')
}

/**
 * Mover el vencimiento de un período (0047).
 *
 * Se puede porque el trigger de la 0036 calcula la vigencia al crear el
 * período y no la vuelve a pisar. La base sella quién lo movió y cuándo,
 * y rechaza un vencimiento anterior al inicio.
 *
 * El motivo es obligatorio de este lado: la columna lo admite en nulo
 * —hay filas viejas sin él— pero un vencimiento corrido sin explicación
 * no se distingue de un error de tipeo, y la clienta lo lee en su portal.
 */
export async function moverVencimiento(
  membershipId: string,
  endDate: string,
  motivo: string
): Promise<void> {
  const texto = motivo.trim()
  if (!texto) throw new Error('Escribí por qué se mueve el vencimiento')

  const { error } = await supabase
    .from('memberships')
    .update({ end_date: endDate, end_date_motivo: texto })
    .eq('id', membershipId)

  if (error?.code === '42703') {
    throw new Error('Para mover el vencimiento falta correr la migración 0047.')
  }
  if (error) throw errorDeLaBase(error, 'No se pudo mover el vencimiento')
}

/**
 * El error de la base, convertido en uno que la pantalla sepa leer.
 *
 * Supabase devuelve un objeto plano —`{ message, code, details, hint }`—
 * y no una instancia de `Error`. Las pantallas lo reciben con
 * `err instanceof Error ? err.message : 'No se pudo…'`, así que la rama
 * que corre siempre es la del texto genérico: **ningún mensaje que
 * escribe la base llega nunca al mostrador.**
 *
 * Y son los mensajes que más falta hacen. La 0029 los redactó uno por
 * uno para quien está atendiendo — "No tiene una membresía vigente para
 * el 15/09 — asignale un plan antes de reservarle esa clase" — y en
 * pantalla se lee "No se pudo crear la reserva", que no dice qué hacer.
 *
 * Descubierto al probar la reserva de un cliente sin membresía (15/09).
 */
function errorDeLaBase(error: { message?: string } | null, sino: string): Error {
  const msg = error?.message?.trim()
  if (!msg) return new Error(sino)

  // Un rechazo de RLS no tiene mensaje escrito por nadie: Postgres dice
  // "new row violates row-level security policy \"nombre\" for table
  // \"tabla\"". Eso apareció en pantalla el 17/09, a una profesora que
  // quiso deshacer una marca de asistencia. Cuando la base tiene un motivo
  // escrito —"Ya usó las 2 clases de su plan"— hay que mostrarlo; cuando
  // lo que hay es el texto interno del motor, no: no le dice nada a nadie
  // y encima nombra políticas y tablas.
  //
  // La pantalla igual no tendría que haber ofrecido la acción. Esto es la
  // red de abajo, para cuando se nos escape otra.
  if (/row-level security policy/i.test(msg)) {
    return new Error('Tu rol no tiene permiso para esta acción.')
  }
  return new Error(msg)
}

/**
 * Cómo se apartó esta reserva de la común, en una etiqueta.
 *
 * El estudio pidió distinguir "claramente" la clase habitual de la
 * recuperada, la cancelada y el no show. El estado solo no alcanza:
 * dos reservas canceladas se leen igual en pantalla y una perdió la
 * clase y la otra no. Esto es lo que va al lado del estado.
 *
 * Devuelve null para la reserva de todos los días, que es la mayoría y
 * no necesita que le expliquen nada.
 */
/**
 * Qué pasó con una clase reservada, y si le contó del plan.
 *
 * ESPEJA `consumo_contadas` (0046, sobre la 0029), que es la función con
 * la que la base calcula `classes_used`. Si mañana cambia qué consume,
 * **las dos tienen que cambiar juntas**: es la misma advertencia que la
 * 0046 le dejó escrita a `recupero_elegible`, y acá importa más, porque
 * esto es lo que la clienta va a usar para auditar su propio contador. Una
 * lista que no suma lo que dice el número de arriba es peor que no tener
 * lista.
 *
 * La regla, tal cual está en la base:
 *
 *   cuenta si  membership_id = ese período
 *         y    no es un recupero
 *         y    el estudio no suspendió ese día
 *         y    (confirmada | asistió
 *               | ausente y la ausencia consume
 *               | cancelada fuera de plazo)
 *
 * Las que entraron por excepción no aparecen en ningún período: la base
 * las deja con `membership_id` nulo, así que el filtro del período las
 * excluye solo.
 */
export interface SuerteDeLaClase {
  /** Si esta clase le descontó del plan. */
  conto: boolean
  etiqueta: string
  detalle?: string
}

export function suerteDeLaReserva(
  r: Reservation,
  opts: { suspendida: boolean; ausenciaConsume: boolean; hoy?: string }
): SuerteDeLaClase {
  if (opts.suspendida) {
    return {
      conto: false,
      etiqueta: 'Suspendida',
      detalle: 'El estudio suspendió la clase, así que no te la contamos',
    }
  }
  if (r.recoversReservationId) {
    return {
      conto: false,
      etiqueta: 'Recuperada',
      detalle: 'Es la recuperación de una clase que ya habías perdido, no te contó de nuevo',
    }
  }
  if (r.overrideReason) {
    return { conto: false, etiqueta: 'Excepción', detalle: 'Entró por excepción y no se descontó de ningún plan' }
  }
  if (r.status === 'cancelada') {
    return r.cancelKind === 'fuera de plazo'
      ? { conto: true, etiqueta: 'Cancelada tarde', detalle: 'Fuera del plazo, así que la clase se perdió' }
      : { conto: false, etiqueta: 'Cancelada', detalle: 'Cancelaste a tiempo y la clase volvió a tu plan' }
  }
  if (r.status === 'asistió') return { conto: true, etiqueta: 'Viniste' }
  if (r.status === 'ausente') {
    return opts.ausenciaConsume
      ? { conto: true, etiqueta: 'No viniste', detalle: 'Sin avisar, así que la clase se contó' }
      : { conto: false, etiqueta: 'No viniste', detalle: 'No te la contamos' }
  }
  if (r.status === 'lista de espera') {
    return { conto: false, etiqueta: 'En espera', detalle: 'Todavía no tenés lugar, así que no se descontó' }
  }
  if (r.status === 'confirmada') {
    // Cuenta desde que reservó. Si la fecha ya pasó y nadie la marcó, se
    // dice: es información de ella y explica el contador.
    const hoy = opts.hoy ?? hoyISO()
    return r.date < hoy
      ? { conto: true, etiqueta: 'Sin marcar', detalle: 'Ese día no se tomó asistencia' }
      : { conto: true, etiqueta: 'Reservada', detalle: 'La clase se descuenta al reservar' }
  }
  // Un estado que el tipo no conoce. La base admite 'ofrecida' (0022) y
  // `ReservationStatus` no la lista, así que para el compilador esto no
  // pasa nunca — pero si pasa, no se cuenta: inventar "Reservada" acá
  // sería sumarle una clase que la base no sumó.
  return { conto: false, etiqueta: 'Sin definir' }
}

export function formaDeLaReserva(
  r: Reservation
): { texto: string; tono: 'info' | 'aviso' | 'neutro' } | null {
  if (r.recoversReservationId) return { texto: 'Recuperada', tono: 'info' }
  if (r.overrideReason) return { texto: 'Excepción autorizada', tono: 'aviso' }
  if (r.status === 'cancelada' && r.cancelKind === 'fuera de plazo')
    return { texto: 'Fuera de plazo · perdió la clase', tono: 'aviso' }
  if (r.status === 'cancelada' && r.cancelKind === 'en plazo')
    return { texto: 'En plazo · se le devolvió', tono: 'neutro' }
  return null
}

/**
 * Cómo entra esta reserva, cuando no es la de todos los días (0046).
 *
 * Las dos son excluyentes y la base lo hace cumplir: un recupero repone
 * una clase ya cobrada y una excepción entra sin plan, así que pedir las
 * dos juntas no quiere decir nada.
 */
export interface ReservationOptions {
  /** La clase perdida que esta reserva repone. Pide `reservas.crear`. */
  recovers?: string
  /**
   * El motivo por el que se la anota igual con la membresía vencida o
   * sin clases. Pide `reservas.excepcion`, y la clienta lo lee desde su
   * portal: se escribe pensando en eso.
   */
  overrideReason?: string
}

export async function createReservation(
  studentId: string,
  classId: string,
  date: string,
  status: 'confirmada' | 'lista de espera' = 'confirmada',
  opts: ReservationOptions = {}
): Promise<void> {
  const { error } = await supabase.from('reservations').insert({
    student_id: studentId,
    class_id: classId,
    date,
    status,
    // Van solo si vienen: mandar la columna en null contra una base sin
    // la 0046 corrida da error de columna inexistente, y el resto del
    // sistema tiene que seguir andando igual hasta que se aplique.
    ...(opts.recovers ? { recovers_reservation_id: opts.recovers } : {}),
    ...(opts.overrideReason ? { override_reason: opts.overrideReason } : {}),
  })
  if (!error) return

  // La 0046 todavía no corrió y alguien pidió un recupero o una
  // excepción. Se dice qué pasa en vez de dejar el error crudo de
  // Postgres, que habla de una columna que nadie escribió a mano.
  if (error.code === '42703' && (opts.recovers || opts.overrideReason)) {
    throw new Error(
      opts.recovers
        ? 'Para registrar una recuperación falta correr la migración 0046.'
        : 'Para autorizar una excepción falta correr la migración 0046.'
    )
  }
  // Acá viven los rechazos del trigger de consumo (0029 + 0046): sin
  // membresía vigente, sin clases, sin permiso para la excepción. Van
  // con su texto, que es el que le dice al mostrador qué hacer.
  if (error.code !== '23505') throw errorDeLaBase(error, 'No se pudo crear la reserva')

  // Un recupero o una excepción sobre una clase donde ya tiene una
  // reserva cancelada no se resuelve reactivando: reactivar_reserva solo
  // cambia el estado y perdería en silencio el motivo o el puntero a la
  // clase perdida, que es justo lo que la hace distinta.
  if (opts.recovers || opts.overrideReason) {
    throw new Error(
      'Ya tiene una reserva en esa clase. Elegí otro horario para la recuperación.'
    )
  }

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
    if (reError) throw errorDeLaBase(reError, 'No se pudo reactivar la reserva')
    return
  }

  throw new Error('Ese cliente ya tiene una reserva para esa clase.')
}

export async function updateReservationStatus(
  reservationId: string,
  status: Reservation['status']
): Promise<void> {
  const { error } = await supabase.from('reservations').update({ status }).eq('id', reservationId)
  // Cancelar dispara la clasificación en plazo / fuera de plazo (0029) y
  // marcar asistencia toca el consumo: los dos pueden rechazar con un
  // texto propio, y ese texto es el que tiene que ver el mostrador.
  if (error) throw errorDeLaBase(error, 'No se pudo cambiar el estado de la reserva')
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
  /**
   * Los cuatro de la ficha laboral (0053). Opcionales porque la columna
   * puede no existir: la migración se corre a mano, y hasta entonces
   * guardar una profesora tiene que seguir funcionando.
   */
  fechaIngreso?: string | null
  fechaBaja?: string | null
  dni?: string
  notasLaborales?: string
}

/**
 * Las fechas laborales van aparte del resto: si la 0053 no corrió, la
 * columna no existe y el insert entero falla. Se separa para poder
 * reintentar sin ellas en vez de perder el alta.
 *
 * El DNI y las notas ya no están acá: desde la 0061 viven en
 * `teacher_private`, y se guardan con `guardarFichaPrivada`.
 */
function filaTeacher(input: TeacherInput, conLaboral: boolean) {
  const base = {
    name: input.name,
    disciplines: input.disciplines,
    phone: input.phone,
    email: input.email,
    color: input.color,
  }
  if (!conLaboral) return base
  return {
    ...base,
    fecha_ingreso: input.fechaIngreso || null,
    fecha_baja: input.fechaBaja || null,
  }
}

/**
 * El DNI y las notas laborales, en su tabla aparte (0061).
 *
 * Se escribe siempre que el formulario los mande —también vacíos, que es
 * cómo se borra un dato cargado—, y no se escribe nada si el formulario
 * no los trae, para no crear una fila vacía por cada profesora.
 *
 * Si la tabla todavía no existe (42P01 / PGRST205) se sigue sin ella: el
 * resto del alta ya se guardó y no tiene por qué caerse con esto.
 */
async function guardarFichaPrivada(teacherId: string, input: TeacherInput): Promise<void> {
  if (input.dni === undefined && input.notasLaborales === undefined) return
  const { error } = await supabase.from('teacher_private').upsert(
    {
      teacher_id: teacherId,
      dni: input.dni ?? '',
      notas_laborales: input.notasLaborales ?? '',
    },
    { onConflict: 'teacher_id' }
  )
  if (!error) return
  if (error.code === '42P01' || error.code === 'PGRST205') return
  throw errorDeLaBase(error, 'Se guardó la profesora, pero no el DNI ni las notas laborales')
}

export async function createTeacher(input: TeacherInput): Promise<void> {
  // Con `select`: hace falta el id para escribir la ficha privada.
  let { data, error } = await supabase
    .from('teachers')
    .insert(filaTeacher(input, true))
    .select('id')
    .single()
  // 42703 = la 0053 no corrió: se reintenta sin las fechas laborales.
  if (error?.code === '42703') {
    ;({ data, error } = await supabase
      .from('teachers')
      .insert(filaTeacher(input, false))
      .select('id')
      .single())
  }
  if (error) throw errorDeLaBase(error, 'No se pudo guardar la profesora')
  if (data?.id) await guardarFichaPrivada(data.id, input)
}

export async function updateTeacher(id: string, input: TeacherInput): Promise<void> {
  let { error } = await supabase.from('teachers').update(filaTeacher(input, true)).eq('id', id)
  if (error?.code === '42703') {
    ;({ error } = await supabase.from('teachers').update(filaTeacher(input, false)).eq('id', id))
  }
  if (error) throw errorDeLaBase(error, 'No se pudo guardar la profesora')
  await guardarFichaPrivada(id, input)
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

/**
 * Los endpoints de administración, con el token al día.
 *
 * Estos pedidos arman el `Authorization` a mano, así que —al revés que
 * las consultas normales, que las renueva el cliente de Supabase solo—
 * mandaban el token guardado tal como estuviera. Una pantalla que lleva
 * horas abierta tiene el token vencido, el servidor contesta 401 y la
 * persona veía **"No autenticado"**: jerga nuestra, en medio de un
 * formulario, sin decirle qué hacer. Le pasó al estudio el 17/09
 * intentando crear el acceso de una clienta.
 *
 * Ahora, ante un 401, se renueva la sesión y se reintenta una vez. Si
 * sigue rechazando, el mensaje dice lo único que sirve: volver a entrar.
 */
async function adminApi<T>(
  body: object,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'POST'
): Promise<T> {
  const VENCIDA = 'Tu sesión venció. Cerrá sesión, volvé a entrar y probá de nuevo.'

  const pedir = (token: string) =>
    fetch('/api/admin/users', {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error(VENCIDA)

  let res = await pedir(session.access_token)
  if (res.status === 401) {
    // Un reintento y no más: si el refresh token también venció, insistir
    // sólo demora el cartel que le dice qué hacer.
    const { data: renovada } = await supabase.auth.refreshSession()
    if (renovada.session) res = await pedir(renovada.session.access_token)
  }

  const json = await res.json().catch(() => null)
  if (!res.ok) {
    if (res.status === 401) throw new Error(VENCIDA)
    throw new Error(json?.error ?? `Error del servidor (${res.status})`)
  }
  return json as T
}

export async function createSystemUser(input: {
  email: string
  /**
   * Opcional para una clienta: desde el 17/09 su acceso nace con el DNI de
   * la ficha como contraseña, y el servidor lo lee de ahí —no de acá— para
   * que el navegador no pueda elegir la clave de una cuenta ajena. Para el
   * staff sigue siendo obligatoria.
   */
  password?: string
  fullName: string
  role: Role
  /** si se pasa, vincula la cuenta creada con esta ficha de alumno */
  studentId?: string
  /**
   * si se pasa, vincula la cuenta con esta profesora. Sin el vínculo la
   * cuenta entra pero el sistema no sabe qué clases son suyas, así que
   * "ver solo mis clases" no puede funcionar por más permiso que se le dé.
   */
  teacherId?: string
}): Promise<ResultadoAcceso> {
  const r = await adminApi<{ ok: boolean; mailEnviado?: boolean; mailMotivo?: string | null }>(input)
  return { mailEnviado: Boolean(r?.mailEnviado), mailMotivo: r?.mailMotivo ?? null }
}

/**
 * Qué pasó con el mail, y por qué cuando no pasó.
 *
 * `mailEnviado: false` con `mailMotivo: null` no puede existir: si el mail
 * no salió, el servidor siempre dice por qué. Sin eso, el mostrador sólo
 * veía "no se pudo enviar" y el arreglo —que puede estar en Vercel, en
 * Resend o en la ficha— había que adivinarlo (17/09).
 */
export interface ResultadoAcceso {
  mailEnviado: boolean
  mailMotivo: string | null
}

/**
 * Volver a mandarle el mail de acceso a una clienta que ya tiene cuenta.
 *
 * El servidor rechaza el reenvío si ella ya eligió su contraseña, porque
 * el mail dice que la clave es su documento. Ese rechazo llega con su
 * texto y es lo que hay que mostrar.
 */
export async function reenviarAcceso(studentId: string): Promise<ResultadoAcceso> {
  const r = await adminApi<{ ok: boolean; mailEnviado?: boolean; mailMotivo?: string | null }>(
    { studentId },
    'PUT'
  )
  return { mailEnviado: Boolean(r?.mailEnviado), mailMotivo: r?.mailMotivo ?? null }
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
  // Pasa por adminApi como el resto: armaba su propio fetch y mandaba un
  // token vacío cuando no había sesión, o sea el mismo 401 con el mismo
  // texto interno en pantalla.
  await adminApi({ userId }, 'PATCH')
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

/**
 * El service worker, con un límite de paciencia.
 *
 * `navigator.serviceWorker.ready` es una promesa que **no resuelve nunca**
 * si el registro falló: no se rechaza, se queda esperando. Y el registro
 * se hace con un `catch` vacío (`install-prompt.tsx`), así que un `/sw.js`
 * que no se pudo registrar dejaba el botón de "Activar avisos" girando
 * para siempre, sin éxito, sin error y sin nada que mirar. Lo encontró el
 * barrido de silencios del 17/09.
 *
 * Diez segundos es mucho más de lo que tarda un registro que va a andar, y
 * mucho menos que "para siempre".
 */
async function serviceWorkerListo(): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              'No se pudo preparar este dispositivo para los avisos. Recargá la página y probá de nuevo.'
            )
          ),
        10_000
      )
    ),
  ])
}

/** true si este dispositivo ya está suscripto a push. */
export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const reg = await serviceWorkerListo()
  return reg.pushManager.getSubscription()
}

/** Pide permiso, suscribe el dispositivo y lo registra en el servidor. */
export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error('Este navegador no soporta notificaciones push')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Permiso de notificaciones denegado')
  }
  const reg = await serviceWorkerListo()
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
