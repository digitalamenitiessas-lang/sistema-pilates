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
}

export type MembershipStatus = 'activa' | 'vencida' | 'por vencer' | 'suspendida'

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
}

export interface Plan {
  id: string
  name: string
  price: number
  classCount: number
  durationDays: number
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
  /** Al vencer, el cron la renueva y genera la cuota (migración 0010) */
  autoRenew: boolean
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
  medicalNotes?: string
  emergencyContact?: string
  /** id del usuario de Auth vinculado (acceso al portal), si tiene */
  userId?: string | null
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
  method?: 'efectivo' | 'transferencia' | 'tarjeta' | 'mercadopago'
  receiptNumber?: number | null
  mpLink?: string | null
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

export type NotificationType =
  | 'pago_acreditado'
  | 'nuevo_alumno'
  | 'membresia_por_vencer'
  | 'membresia_vencida'
  | 'deuda_vencida'
  | 'membresia_renovada'

/** Notificación persistida (tabla notifications, migración 0007). */
export interface AppNotification {
  id: string
  type: NotificationType
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
