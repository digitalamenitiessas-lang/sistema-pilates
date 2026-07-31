'use client'

import { useState } from 'react'
import {
  ArrowLeft,
  Phone,
  Mail,
  CalendarDays,
  User,
  BookOpen,
  ClipboardList,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Edit3,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Student, Reservation, Payment } from '@/lib/types'
import { AlumnoFormModal } from './alumno-form-modal'
import { AsignarPlanModal } from './asignar-plan-modal'

const TABS = [
  { key: 'resumen', label: 'Resumen', icon: User },
  { key: 'reservas', label: 'Reservas', icon: CalendarDays },
  { key: 'pagos', label: 'Pagos', icon: CreditCard },
  { key: 'membresia', label: 'Membresía', icon: BookOpen },
]

function ReservationStatusIcon({ status }: { status: Reservation['status'] }) {
  if (status === 'asistió') return <CheckCircle2 className="w-4 h-4 text-accent" />
  if (status === 'cancelada') return <XCircle className="w-4 h-4 text-muted-foreground" />
  if (status === 'lista de espera') return <Clock className="w-4 h-4 text-amber-500" />
  if (status === 'ausente') return <XCircle className="w-4 h-4 text-destructive" />
  return <CheckCircle2 className="w-4 h-4 text-primary" />
}

const RESERVATION_STATUS_LABEL: Record<string, string> = {
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
  'lista de espera': 'Lista de espera',
  asistió: 'Asistió',
  ausente: 'Ausente',
}

interface FichaAlumnoProps {
  student: Student
  reservations: Reservation[]
  payments: Payment[]
  onBack: () => void
}

export function FichaAlumno({ student, reservations, payments, onBack }: FichaAlumnoProps) {
  const [activeTab, setActiveTab] = useState('resumen')
  const [showEdit, setShowEdit] = useState(false)
  const [showAssignPlan, setShowAssignPlan] = useState(false)
  const ms = student.membership
  const classesLeft = ms ? ms.classesTotal - ms.classesUsed : 0
  const attended = reservations.filter((r) => r.status === 'asistió').length
  const upcoming = reservations.filter((r) => r.status === 'confirmada').length

  return (
    <div className="flex flex-col h-full">
      {/* Back header */}
      <div className="px-6 py-4 border-b border-border bg-card flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver a alumnos</span>
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {/* Profile header */}
        <div className="bg-card border-b border-border px-6 py-6">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-primary font-bold text-xl">{student.avatar}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <h2 className="text-xl font-bold text-foreground">{student.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    Alumno desde {new Date(student.joinDate).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
                  </p>
                </div>
                <button
                  onClick={() => setShowEdit(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Editar
                </button>
              </div>

              <div className="flex flex-wrap gap-3 mt-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Mail className="w-3.5 h-3.5" />
                  {student.email}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Phone className="w-3.5 h-3.5" />
                  {student.phone}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <User className="w-3.5 h-3.5" />
                  DNI {student.dni}
                </div>
              </div>
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-3 mt-5">
            <div className="bg-muted rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{attended}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Asistencias</p>
            </div>
            <div className="bg-muted rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-primary">{classesLeft}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Clases rest.</p>
            </div>
            <div className="bg-muted rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{upcoming}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Próximas</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-border bg-card px-6">
          <div className="flex gap-0 -mb-px">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                  activeTab === key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="p-6">
          {/* Resumen */}
          {activeTab === 'resumen' && (
            <div className="space-y-4 max-w-2xl">
              {/* Personal data */}
              <div className="bg-card rounded-2xl border border-border p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <User className="w-4 h-4 text-primary" />
                  Datos personales
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Nombre completo', value: student.name },
                    { label: 'Email', value: student.email },
                    { label: 'Teléfono', value: student.phone },
                    { label: 'DNI', value: student.dni },
                    { label: 'Fecha de nacimiento', value: student.birthdate ? new Date(`${student.birthdate}T00:00`).toLocaleDateString('es-AR') : '—' },
                    { label: 'Ingreso al estudio', value: new Date(`${student.joinDate}T00:00`).toLocaleDateString('es-AR') },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-0.5">{label}</p>
                      <p className="text-sm text-foreground">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Medical notes */}
              {student.medicalNotes && (
                <div className="bg-amber-50 rounded-2xl border border-amber-200 p-5">
                  <h3 className="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Observaciones médicas
                  </h3>
                  <p className="text-sm text-amber-700">{student.medicalNotes}</p>
                </div>
              )}

              {/* Observations */}
              {student.observations && (
                <div className="bg-card rounded-2xl border border-border p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-primary" />
                    Observaciones
                  </h3>
                  <p className="text-sm text-muted-foreground">{student.observations}</p>
                </div>
              )}
            </div>
          )}

          {/* Reservas */}
          {activeTab === 'reservas' && (
            <div className="max-w-2xl space-y-2">
              {reservations.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Sin reservas registradas</p>
                </div>
              ) : (
                reservations
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((r) => (
                    <div
                      key={r.id}
                      className="bg-card rounded-xl border border-border p-4 flex items-center gap-3"
                    >
                      <ReservationStatusIcon status={r.status} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{r.className}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.discipline} · {r.teacherName}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-medium text-foreground">{r.date}</p>
                        <p className="text-xs text-muted-foreground">{r.time}</p>
                      </div>
                      <span
                        className={cn(
                          'text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0',
                          r.status === 'asistió' && 'bg-[#E8F2EB] text-[#2E6040]',
                          r.status === 'confirmada' && 'bg-primary/10 text-primary',
                          r.status === 'cancelada' && 'bg-muted text-muted-foreground',
                          r.status === 'lista de espera' && 'bg-amber-100 text-amber-700',
                          r.status === 'ausente' && 'bg-red-100 text-red-700'
                        )}
                      >
                        {RESERVATION_STATUS_LABEL[r.status]}
                      </span>
                    </div>
                  ))
              )}
            </div>
          )}

          {/* Pagos */}
          {activeTab === 'pagos' && (
            <div className="max-w-2xl space-y-2">
              {payments.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CreditCard className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Sin pagos registrados</p>
                </div>
              ) : (
                payments.map((p) => (
                  <div
                    key={p.id}
                    className="bg-card rounded-xl border border-border p-4 flex items-center gap-3"
                  >
                    <div
                      className={cn(
                        'w-2 h-2 rounded-full shrink-0',
                        p.status === 'pagado' && 'bg-accent',
                        p.status === 'pendiente' && 'bg-amber-500',
                        p.status === 'vencido' && 'bg-destructive'
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{p.planName}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.status === 'pagado'
                          ? `Pagado el ${p.date} · ${p.method === 'mercadopago' ? 'Mercado Pago' : p.method ?? ''}`
                          : `Vence ${p.dueDate}`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-foreground">
                        ${p.amount.toLocaleString('es-AR')}
                      </p>
                      <span
                        className={cn(
                          'text-[10px] font-semibold',
                          p.status === 'pagado' && 'text-accent',
                          p.status === 'pendiente' && 'text-amber-600',
                          p.status === 'vencido' && 'text-destructive'
                        )}
                      >
                        {p.status === 'pagado' ? 'Pagado' : p.status === 'pendiente' ? 'Pendiente' : 'Vencido'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Membresía */}
          {activeTab === 'membresia' && (
            <div className="max-w-2xl space-y-4">
              {ms ? (
                <>
                  <div className="bg-card rounded-2xl border border-border p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-base font-bold text-foreground">{ms.planName}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {ms.startDate} — {ms.endDate}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'text-xs font-semibold px-3 py-1 rounded-full',
                          ms.status === 'activa' && 'bg-[#E8F2EB] text-[#2E6040]',
                          ms.status === 'por vencer' && 'bg-amber-100 text-amber-700',
                          ms.status === 'vencida' && 'bg-red-100 text-red-700'
                        )}
                      >
                        {ms.status === 'activa' ? 'Activa' : ms.status === 'por vencer' ? 'Por vencer' : 'Vencida'}
                      </span>
                    </div>

                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs text-muted-foreground">Clases utilizadas</span>
                        <span className="text-xs font-semibold text-foreground">
                          {ms.classesUsed} / {ms.classesTotal}
                        </span>
                      </div>
                      <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${(ms.classesUsed / ms.classesTotal) * 100}%` }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 mt-4">
                      <div className="bg-muted rounded-xl p-3 text-center">
                        <p className="text-xl font-bold text-foreground">{ms.classesTotal}</p>
                        <p className="text-[10px] text-muted-foreground">Total clases</p>
                      </div>
                      <div className="bg-muted rounded-xl p-3 text-center">
                        <p className="text-xl font-bold text-primary">{classesLeft}</p>
                        <p className="text-[10px] text-muted-foreground">Disponibles</p>
                      </div>
                      <div className="bg-muted rounded-xl p-3 text-center">
                        <p className="text-xl font-bold text-foreground">
                          ${ms.price.toLocaleString('es-AR')}
                        </p>
                        <p className="text-[10px] text-muted-foreground">Precio mensual</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowAssignPlan(true)}
                      className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
                    >
                      Cambiar plan
                    </button>
                    <button
                      onClick={() => setShowAssignPlan(true)}
                      className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
                    >
                      Renovar membresía
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-center py-12">
                  <BookOpen className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
                  <p className="text-sm text-muted-foreground mb-4">Sin membresía activa</p>
                  <button
                    onClick={() => setShowAssignPlan(true)}
                    className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
                  >
                    Asignar membresía
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showEdit && <AlumnoFormModal student={student} onClose={() => setShowEdit(false)} />}
      {showAssignPlan && <AsignarPlanModal student={student} onClose={() => setShowAssignPlan(false)} />}
    </div>
  )
}
