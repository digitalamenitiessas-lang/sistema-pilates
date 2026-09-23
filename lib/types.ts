export type Role = 'admin' | 'recepcion' | 'profesor' | 'alumno'

/**
 * El nombre de la disciplina. Desde la migración 0011 son un catálogo
 * editable desde Configuración, así que es texto libre y no una lista fija.
 */
export type Discipline = string

/**
 * Una clase en una fecha concreta, cuando ese día se aparta de la norma
 * (migración 0018). Si no hay instancia, la clase corre como siempre.
 */
export interface ClassOccurrence {
  id: string
  classId: string
  date: string
  status: 'normal' | 'suspendida'
  /** Quién la da ese día; vacío = la de siempre */
  teacherId: string | null
  teacherName: string
  startTime: string | null
  capacity: number | null
  reason: string
}

/** Disciplina del catálogo (tabla disciplines, migración 0011). */
export interface DisciplineItem {
  id: string
  name: string
  /** Color del punto/etiqueta */
  color: string
  bgColor: string
  textColor: string
  /** Texto breve que se muestra en la web */
  blurb: string
  sortOrder: number
}

/** Medio de pago del catálogo (tabla payment_methods, migración 0011). */
export interface PaymentMethod {
  code: string
  name: string
  /** false = lo acredita una integración (Mercado Pago), no se cobra a mano */
  isManual: boolean
  /**
   * Qué le hace este medio al precio de lista (0028): -5 es 5% de
   * descuento, 25 es 25% de recargo. Cero mientras la migración no corrió.
   */
  ajustePct: number
  /**
   * A qué cuenta entra —o de dónde sale— la plata de este medio. Es el
   * mismo dato con el que la base imputa los cobros sola desde la 0020,
   * y el que la pantalla de gastos tiene que usar para sugerir la cuenta.
   * Nulo mientras nadie lo haya configurado: ahí los cobros caen en
   * "A imputar" y un gasto no sugiere nada.
   */
  defaultAccountId: string | null
  active: boolean
  sortOrder: number
}

export type SettingKind = 'text' | 'number' | 'boolean' | 'time' | 'choice' | 'textarea'
/**
 * El grupo es texto libre, no una lista fija: un módulo nuevo agrega su
 * grupo con un INSERT y la pantalla lo muestra sin tocar código.
 */
export type SettingGroup = string

/**
 * Parámetro configurable del negocio (tabla studio_settings, migración 0011).
 * Trae su propia etiqueta y ayuda: la pantalla de Configuración se arma sola
 * a partir de estas filas, así que sumar un parámetro es un INSERT.
 */
export interface StudioSetting {
  key: string
  value: string
  kind: SettingKind
  /** Para kind 'choice': pares "Etiqueta visible|valor" */
  options: string[]
  label: string
  help: string
  group: SettingGroup
  sortOrder: number
  isPublic: boolean
  /** Solo el admin lo cambia; recepción lo ve en modo lectura */
  soloAdmin: boolean
  /**
   * false = la fila existe y todavía no hay código que la lea (0024). La
   * pantalla lo avisa, con el mismo criterio que los permisos en sombra:
   * se puede dejar armado, pero no rige. Por defecto true, para que el
   * sistema siga andando igual si la migración no corrió.
   */
  rige: boolean
}

export type MembershipStatus =
  | 'activa'
  | 'vencida'
  | 'por vencer'
  /** Cancelada a mano por el estudio (0069). No reserva, no consume, no encola. */
  | 'cancelada'
  /**
   * Pagada y con su período ya reservado, pero todavía sin empezar. Existe
   * desde la 0036: el pago anticipado no se solapa con la membresía en
   * curso, se encola detrás. No habilita reservar — la base tampoco la
   * elige para una clase de hoy.
   */
  | 'futura'
  | 'suspendida'

export type PaymentStatus = 'pagado' | 'pendiente' | 'vencido' | 'anulado'

export type ReservationStatus = 'confirmada' | 'cancelada' | 'lista de espera' | 'asistió' | 'ausente'

export interface Teacher {
  id: string
  name: string
  avatar: string
  disciplines: Discipline[]
  phone: string
  email: string
  color: string
  /**
   * La cuenta con la que entra al sistema (0012). Sin esto,
   * my_teacher_ids() no encuentra nada y "ver solo mis clases" no puede
   * funcionar por más permiso que se le dé: la base no sabe quién es.
   */
  userId?: string | null
  /** La ficha laboral (0053). Vacío mientras la migración no corrió. */
  laboral?: DatosLaborales
}

/**
 * La ficha laboral de una profesora (0053). Lo que NO es plata: eso vive
 * en `teacher_pay`, bajo su propia clave, porque RLS filtra filas y no
 * columnas.
 */
export interface DatosLaborales {
  fechaIngreso?: string | null
  /**
   * Cuándo dejó de trabajar. Distinta de `active = false`, que es la baja
   * del catálogo: quien se fue en marzo tiene que seguir apareciendo en
   * la liquidación de marzo.
   */
  fechaBaja?: string | null
  dni?: string
  notasLaborales?: string
}

/** Una condición salarial vigente desde una fecha (0053). */
export interface CondicionPago {
  id: string
  teacherId: string
  modalidad: 'por_clase' | 'por_hora' | 'mensual'
  monto: number
  desde: string
  notas: string
}

/** Horas que NO son clases: las clases se cuentan solas desde la agenda. */
export interface HorasTrabajadas {
  id: string
  teacherId: string
  fecha: string
  tipo: 'trabajo' | 'ausencia' | 'tardanza'
  horas: number
  detalle: string
}

/**
 * Un ajuste manual sobre la liquidación (0065, requerimiento 12.6): un
 * premio, un descuento, la corrección de un mes anterior. Lo que la
 * fórmula no captura.
 *
 * Entra en el período que contiene su `fecha`, igual que las horas. El
 * `motivo` es obligatorio y lo exige la base, no la pantalla: un ajuste de
 * sueldo sin explicación es lo que nadie va a poder reconstruir después.
 */
export interface AjusteLiquidacion {
  id: string
  teacherId: string
  fecha: string
  /** Positivo suma, negativo resta. Nunca cero. */
  monto: number
  motivo: string
}

/**
 * La liquidación de un período. **Se deriva, no se guarda**: cada clase
 * se paga con la tarifa que regía el día que se dictó.
 */
export interface FilaLiquidacion {
  teacherId: string
  profesora: string
  clases: number
  montoClases: number
  horas: number
  montoHoras: number
  mensual: number
  /** La suma de los ajustes manuales del período (0065) */
  ajustes: number
  ausencias: number
  tardanzas: number
  total: number
}

/**
 * Una liquidación **cerrada** (0054). Distinta de `FilaLiquidacion`, que
 * es el cálculo vivo: esta es la foto del día que se cerró, y no se
 * recalcula. Un total que cambia para atrás no es un registro.
 */
export interface LiquidacionCerrada {
  id: string
  teacherId: string
  profesora: string
  desde: string
  hasta: string
  clases: number
  horas: number
  /** Los ajustes manuales que entraron en este cierre (0065) */
  ajustes: number
  /** El congelado al cerrar: lo que se le liquidó */
  total: number
  /**
   * Lo que daría hoy el mismo período. Si difiere del congelado, es que
   * se cargó algo después de cerrar — y eso hay que mostrarlo, no
   * elegir por el estudio cuál de los dos vale.
   */
  totalHoy: number
  estado: 'cerrada' | 'pagada' | 'anulada'
  /** El gasto que la saldó; sin esto, "pagada" no movería un peso */
  expenseId?: string | null
  notas: string
  voidReason?: string | null
  createdAt: string
}

export interface Plan {
  id: string
  name: string
  price: number
  classCount: number
  /** Veces por semana (0025). 0 = no aplica, como el pase de un día. */
  weeklyFrequency: number
  durationDays: number
  /**
   * Meses de calendario que dura (0036). 0 = manda durationDays. Con 1,
   * arrancar el 20/09 vence el 19/10 inclusive, que es lo que pidió el
   * estudio; 30 días fijos daban un día de más y se corrían en los meses
   * de 31.
   */
  durationMonths: number
  disciplines: Discipline[]
  description: string
  color: string
  popular?: boolean
  isTrial?: boolean
}

export interface Membership {
  id: string
  studentId: string
  planId: string
  planName: string
  startDate: string
  endDate: string
  classesTotal: number
  classesUsed: number
  status: MembershipStatus
  price: number
  /**
   * El interruptor de la renovación automática (0010). Con la 0041 cambió lo
   * que hace, y conviene tenerlo escrito acá: ya no dice "al vencer se le
   * crea el período nuevo y su cuota" sino "unos días antes de vencer se le
   * emite la cuota del siguiente"; el período lo crea el pago. Apagado, la
   * renovación la arma el mostrador a mano. Mientras la 0041 no esté
   * aplicada el proceso diario saltea ese bloque entero, así que la marca no
   * dispara nada.
   */
  autoRenew: boolean
  /**
   * Por qué se movió el vencimiento (0047). Vacío en la enorme mayoría:
   * solo lo tienen los períodos que alguien corrió a mano. Lo lee la
   * clienta desde su portal, así que se escribe pensando en eso.
   */
  endDateMotivo?: string | null
}

/**
 * Un turno fijo: el derecho de un cliente sobre un día y hora de la
 * grilla mientras mantenga la prioridad (0048).
 *
 * No es una reserva ni un montón de reservas. Las reservas de cada
 * fecha, cuando existan, se apoyan en esto — no al revés.
 */
/** Una promoción del catálogo (0079). El monto lo resuelve la base. */
export interface Promocion {
  id: string
  nombre: string
  tipo: 'porcentaje' | 'monto'
  valor: number
  ventana: 'siempre' | 'fechas' | 'dias_mes'
  desde: string | null
  hasta: string | null
  diaDesde: number | null
  diaHasta: number | null
  /** Null = automática: se aplica sola. Con código, hay que escribirlo. */
  codigo: string | null
  usosMax: number | null
  usosPorCliente: number | null
  /** Vacío = todos los planes. */
  planes: string[]
  active: boolean
  /** Cargada pero sin regir todavía: no descuenta nada. */
  rige: boolean
}

export interface FixedSlot {
  id: string
  studentId: string
  studentName: string
  classId: string
  classTitle: string
  discipline: Discipline
  dayOfWeek: number
  /** "18:00" */
  time: string
  capacity: number
  room: string
  estado: 'activo' | 'liberado' | 'pausado'
  desde: string
  /** Por qué se liberó o se pausó. Lo lee el cliente desde su portal. */
  motivo?: string | null
  /**
   * Hasta cuándo conserva el lugar. Sale del vencimiento de su membresía
   * más los días de gracia, y **no se guarda**: si se copiara, al segundo
   * mes diría una cosa distinta que la membresía. Nulo = sin membresía,
   * o sea sin prioridad sobre nada.
   */
  prioridadHasta?: string | null
  /** Si el lugar sigue siendo suyo hoy. Lo resuelve la base. */
  conPrioridad: boolean
}

export interface Student {
  id: string
  name: string
  avatar: string
  email: string
  phone: string
  dni: string
  birthdate: string
  joinDate: string
  role: Role
  membership?: Membership
  observations?: string
  /** Lo de salud que no entra en ninguno de los cuatro campos (0050) */
  medicalNotes?: string
  emergencyContact?: string
  /**
   * Los cuatro campos de salud (0050). Viven en `student_private`, así
   * que los gobiernan `salud.ver` y `salud.editar` — y la clienta los
   * lee desde su portal, como el resto de esa tabla.
   */
  lesiones?: string
  embarazo?: string
  cirugias?: string
  medicacion?: string
  /** id del usuario de Auth vinculado (acceso al portal), si tiene */
  userId?: string | null
  /**
   * El número de credencial (0067). Identifica, no autoriza: se dice en
   * voz alta en el mostrador y la clienta lo ve en su portal. Es null
   * mientras la 0067 no haya corrido.
   */
  memberNo?: number | null
}

/** 'regular' se repite cada semana; 'especial' es un evento con su fecha. */
export type ClassKind = 'regular' | 'especial'

export interface ClassSession {
  id: string
  title: string
  discipline: Discipline
  teacherId: string
  teacherName: string
  dayOfWeek: number // 0=Mon, 6=Sun
  time: string
  durationMinutes: number
  capacity: number
  enrolled: number
  waitlist: number
  room: string
  color: string
  kind: ClassKind
  /** Fecha del evento; vacío en las regulares (migración 0017) */
  date: string
  description: string
  /** Nivel o público: "Inicial", "Embarazadas", "Mayores de 60" */
  level: string
  /** null = incluida en la membresía; con valor = se cobra aparte */
  price: number | null
  requirements: string
  /** false = se muestra pero la alumna no la reserva sola */
  bookable: boolean
}

export interface Reservation {
  id: string
  studentId: string
  studentName: string
  classId: string
  className: string
  date: string
  time: string
  status: ReservationStatus
  discipline: Discipline
  teacherName: string
  /**
   * Si canceló dentro o fuera del plazo de `cancel_hours` (0022, la
   * escribe el trigger de la 0029). En plazo la clase vuelve al
   * contador; fuera de plazo la perdió, y es lo único que se puede
   * recuperar. Nulo si no está cancelada, o si el estudio suspendió.
   */
  /**
   * Cómo se clasificó la cancelación. Lo sella la base al cancelar y la
   * clienta no lo puede escribir (0072). 'en plazo sin cupo' entró con la
   * 0076: avisó a tiempo pero ya había gastado las devoluciones del
   * período, así que la clase se cobra igual. Null = el estudio suspendió
   * la clase.
   */
  cancelKind?: 'en plazo' | 'en plazo sin cupo' | 'fuera de plazo' | null
  /**
   * A qué membresía se le cobró esta clase (0029). La sella la base al
   * reservar y no se mueve más: es lo que hace que renovar en el medio
   * no le devuelva la clase al período equivocado. Nulo en las reservas
   * anteriores a la 0029 y en las que entraron por excepción.
   */
  membershipId?: string | null
  /**
   * La clase perdida que esta reserva repone (0046). Una reserva con
   * esto no descuenta: la clase ya se descontó cuando se perdió.
   */
  recoversReservationId?: string | null
  /**
   * El motivo de la excepción autorizada (0046). Con esto cargado la
   * reserva entró aunque la membresía estuviera vencida o sin clases, y
   * no se descuenta de ningún plan. Lo lee la clienta desde su portal.
   */
  overrideReason?: string | null
}

export interface Payment {
  id: string
  studentId: string
  studentName: string
  membershipId: string
  planName: string
  amount: number
  date: string
  dueDate: string
  status: PaymentStatus
  /**
   * El `code` del medio con el que se cobró, tal como está en
   * `payment_methods`. Texto libre y no una unión de cuatro: el catálogo
   * lo edita el estudio, y un cobro viejo tiene que poder seguir
   * mostrándose aunque ese medio ya no exista. Para el nombre que se
   * muestra, se busca en el catálogo — el código crudo no es para leer.
   */
  method?: string
  receiptNumber?: number | null
  mpLink?: string | null
  /**
   * La membresía que esta cuota renueva (0041). Mientras no se cobra es una
   * OFERTA y no una deuda: cobra un período que todavía no existe —lo crea
   * el pago— así que no se puede exigir. Vacío en las cuotas de siempre, y
   * también mientras la migración no haya corrido. Se pregunta con
   * `esOferta()` de lib/api.ts, no a mano.
   */
  renuevaMembresiaId?: string | null
}

export interface Profile {
  id: string
  fullName: string
  email: string
  role: Role
  /** false = acceso dado de baja; el perfil se conserva (migración 0015) */
  active: boolean
}

export interface Room {
  id: string
  name: string
}

export interface MonthlyRevenue {
  month: string
  amount: number
}

export interface Alert {
  id: string
  type: 'warning' | 'info' | 'danger'
  message: string
  studentName?: string
  studentId?: string
  date?: string
}

/**
 * Los tipos de aviso a los que la campana les da icono, color y destino
 * propios. La lista de verdad NO es esta: es el CHECK de `notifications`
 * (0007, ampliado en la 0010 y otra vez en la 0020), y la base se migra a
 * mano, sin desplegar el front. Por eso estar acá es una mejora sobre el
 * genérico, no un requisito: un tipo que falte se dibuja igual.
 */
export type NotificationType =
  | 'pago_acreditado'
  | 'nuevo_alumno'
  | 'membresia_por_vencer'
  | 'membresia_vencida'
  | 'deuda_vencida'
  | 'membresia_renovada'
  // Los tres de caja los admite el CHECK desde la 0020 y todavía no los
  // emite nadie: quedan listos para el día que el cron los mande.
  | 'caja_sin_cerrar'
  | 'caja_diferencia'
  | 'saldo_sin_imputar'
  | 'renovacion_omitida'
  /** Turnos fijos que perdieron la prioridad (0049) */
  | 'turno_liberado'
  // Los cinco que van A LA CLIENTA (0052). Los escribe la base con un
  // trigger, así que salen igual desde la agenda, el portal, la pantalla
  // de asistencia o cualquier camino que venga después.
  | 'reserva_confirmada'
  | 'clase_recordatorio'
  | 'clase_suspendida'
  | 'clase_cambio_profesora'
  | 'lugar_liberado'

/**
 * Una entrada de la bitácora del cliente (0050). No se edita: si algo
 * cambió, se agrega otra. La clienta no las lee.
 */
export interface StudentNote {
  id: string
  studentId: string
  /** 'profesora' la ve todo el equipo; 'interna' no la ve la profesora */
  kind: 'profesora' | 'interna'
  body: string
  authorName: string
  createdAt: string
}

/** Notificación persistida (tabla notifications, migración 0007). */
export interface AppNotification {
  id: string
  /**
   * Texto plano y no la unión de arriba, a propósito. Tiparlo como unión
   * era prometer una exhaustividad que solo la base puede garantizar, y esa
   * promesa terminaba en pantalla como un icono `undefined` que tira el
   * árbol de React entero. Quien lo dibuja resuelve con `estiloDeAviso()`,
   * que nunca devuelve nada vacío.
   */
  type: string
  title: string
  body: string
  studentId?: string | null
  paymentId?: string | null
  createdAt: string
  read: boolean
}

// ---------------------------------------------------------------
// Motor de permisos (migración 0012)
// ---------------------------------------------------------------

/**
 * Cómo se comporta una clave:
 * - 'permiso'     configurable desde la pantalla
 * - 'fija'        la tiene todo usuario logueado (el portal depende de ella)
 * - 'estructural' existe, pero tildarla sería una escalada de privilegios
 * - 'servicio'    identidad de máquina (cron, webhook), no se asigna
 * - 'futuro'      el módulo todavía no existe
 */
export type PermissionKind = 'permiso' | 'fija' | 'estructural' | 'servicio' | 'futuro'

/**
 * 'sombra' = la clave todavía responde con lo que el rol podía hacer antes
 * del motor, así que tildarla o destildarla no cambia nada todavía.
 * 'activo' = manda la matriz.
 */
export type PermissionMode = 'sombra' | 'activo'

export interface PermissionKey {
  clave: string
  etiqueta: string
  ayuda: string
  grupo: string
  orden: number
  tipo: PermissionKind
  /** Los roles que la tienen hoy, antes del motor */
  legacyRoles: Role[]
  modo: PermissionMode
}

/** Excepción para una persona puntual (tabla user_permissions). */
export interface UserPermission {
  userId: string
  clave: string
  allow: boolean
  motivo: string
  expiresAt: string | null
}

/** El catálogo con su matriz, listo para pintar la pantalla. */
export interface PermissionMatrix {
  keys: PermissionKey[]
  /** "rol|clave" de cada permiso concedido */
  granted: Set<string>
  overrides: UserPermission[]
}

// ---------------------------------------------------------------
// Caja, cuentas y gastos (migración 0020)
//
// Nada de esto entra en StudioData: son colecciones que crecen todos los
// días y se consultan por rango desde su propia pantalla.
// ---------------------------------------------------------------

/** Dónde está la plata. 'transitoria' es la cuenta "A imputar". */
export type AccountKind = 'caja' | 'banco' | 'billetera' | 'pasarela' | 'transitoria'

export interface Account {
  id: string
  name: string
  kind: AccountKind
  /** true = se cuenta con la mano al cierre */
  arquea: boolean
  isSystem: boolean
  active: boolean
  sortOrder: number
  bankName: string
  cbu: string
  alias: string
  holder: string
  notes: string
}

/** Cuenta con su saldo, de la vista account_balances. */
export interface AccountBalance {
  accountId: string
  name: string
  kind: AccountKind
  arquea: boolean
  isSystem: boolean
  saldo: number
  ultimoMovimiento: string | null
  movimientos: number
  /**
   * El saldo se calcula con lo que este rol puede ver. Si le falta alguna
   * de las dos, la pantalla lo avisa en vez de mostrar un número corto
   * como si fuera el saldo real.
   */
  veCobros: boolean
  veGastos: boolean
}

/** Una línea del libro: un cobro, un gasto o un movimiento manual. */
export interface LedgerEntry {
  origen: 'cobro' | 'gasto' | 'movimiento'
  refId: string
  accountId: string
  at: string
  dia: string
  sentido: 'ingreso' | 'egreso'
  monto: number
  concepto: string
  medio: string | null
  contraparte: string | null
  comprobante: string | null
}

/** Lo que payments no sabe expresar. */
export type MovementKind =
  | 'transferencia'
  | 'retiro'
  | 'aporte'
  | 'devolucion'
  | 'apertura'
  | 'ajuste'

export interface AccountMovement {
  id: string
  at: string
  dia: string
  kind: MovementKind
  fromAccountId: string | null
  toAccountId: string | null
  amount: number
  concept: string
  status: 'vigente' | 'anulado'
  notes: string
}

/** El arqueo: lo esperado y lo contado, congelados. */
export interface CashSession {
  id: string
  accountId: string
  fecha: string
  desde: string
  hasta: string | null
  openedAt: string
  openedBy: string | null
  closedAt: string | null
  closedBy: string | null
  saldoInicial: number
  ingresos: number
  egresos: number
  saldoEsperado: number
  saldoReal: number | null
  diferencia: number | null
  totalesPorMedio: Record<string, number>
  notas: string
}

export type ExpenseStatus = 'pendiente' | 'pagado' | 'anulado'
export type DocType =
  | 'factura'
  | 'recibo'
  | 'ticket'
  | 'nota de credito'
  | 'orden de pago'
  | 'sin comprobante'

export interface ExpenseCategory {
  id: string
  name: string
  parentId: string | null
  nature: 'fijo' | 'variable'
  active: boolean
  sortOrder: number
}

export interface Expense {
  id: string
  fecha: string
  categoryId: string | null
  categoryName: string
  detail: string
  amount: number
  supplier: string
  docType: DocType
  docNumber: string
  method: string | null
  accountId: string | null
  paidAt: string | null
  paidDate: string | null
  status: ExpenseStatus
  tags: string[]
  notes: string
  voidReason: string
}
