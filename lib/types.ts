export type Role = 'admin' | 'recepcion' | 'profesor' | 'alumno'

export type Discipline =
  | 'Pilates Mat'
  | 'Pilates Reformer'
  | 'Pilates Clínico'
  | 'Yoga'
  | 'Stretching'
  | 'Funcional'

export type MembershipStatus = 'activa' | 'vencida' | 'por vencer' | 'suspendida'

export type PaymentStatus = 'pagado' | 'pendiente' | 'vencido'

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
