'use client'

import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  Phone,
  Mail,
  CalendarClock,
  CalendarDays,
  User,
  BookOpen,
  ClipboardList,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  History,
  XCircle,
  Clock,
  Edit3,
  Smartphone,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useData } from '@/lib/data-context'
import { createSystemUser, setMembershipAutoRenew, esOferta, hoyISO } from '@/lib/api'
import type { Membership, MembershipStatus, Student, Reservation, Payment } from '@/lib/types'
import { AlumnoFormModal } from './alumno-form-modal'
import { AsignarPlanModal } from './asignar-plan-modal'

/**
 * Los cinco estados, escritos una vez. 'futura' no está en la base —la
 * columna solo guarda 'activa' y 'suspendida'—: se deriva al leer, y existe
 * desde que la 0036 encola el pago anticipado en vez de solaparlo.
 */
const ESTADO_MEMBRESIA: Record<MembershipStatus, string> = {
  activa: 'Activa',
  'por vencer': 'Por vencer',
  futura: 'Empieza después',
  vencida: 'Vencida',
  suspendida: 'Suspendida',
}

/** El color de cada estado, para que la vigente y el historial coincidan. */
const COLOR_ESTADO: Record<MembershipStatus, string> = {
  activa: 'bg-exito-suave text-exito-fuerte',
  'por vencer': 'bg-aviso-suave text-aviso-fuerte',
  futura: 'bg-info-suave text-info-fuerte',
  vencida: 'bg-destructive-suave text-destructive-fuerte',
  suspendida: 'bg-muted text-muted-foreground',
}

/** El `T00:00` evita que un ISO suelto se lea como UTC y muestre el día anterior. */
const fecha = (iso: string) => new Date(`${iso}T00:00`).toLocaleDateString('es-AR')

/**
 * Cómo está la cuota de un período que todavía no empezó. Se dice solo si
 * la fila existe: sin permiso de finanzas los pagos llegan vacíos, y ahí
 * callar es lo correcto — "sin cobrar" sería una afirmación inventada.
 */
function textoCuota(p: Payment): string {
  const monto = `$${p.amount.toLocaleString('es-AR')}`
  if (p.status === 'pagado') return `cuota de ${monto} ya cobrada`
  if (p.status === 'vencido') return `cuota de ${monto} sin cobrar, venció el ${fecha(p.dueDate)}`
  return `cuota de ${monto} sin cobrar, vence el ${fecha(p.dueDate)}`
}

function PortalAccessModal({ student, onClose }: { student: Student; onClose: () => void }) {
  const { refresh } = useData()
  const [email, setEmail] = useState(student.email)
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createSystemUser({
        email,
        password,
        fullName: student.name,
        role: 'alumno',
        studentId: student.id,
      })
      await refresh()
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el acceso')
      setSaving(false)
    }
  }

  const inputClass =
    'w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors'
  const labelClass =
    'text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card rounded-2xl shadow-2xl w-full max-w-md border border-border max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <div className="px-6 py-8 text-center">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-exito-fuerte" />
            <h3 className="text-base font-bold text-foreground mb-1">Acceso creado</h3>
            <p className="text-sm text-muted-foreground mb-5">
              Pasale a {student.name.split(' ')[0]} el email y la contraseña. Entra desde el mismo
              login del sistema y ve su propio portal.
            </p>
            <button
              onClick={onClose}
              className="px-8 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90"
            >
              Listo
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <h2 className="text-base font-bold text-foreground">Acceso al portal</h2>
                <p className="text-xs text-muted-foreground">{student.name}</p>
              </div>
              <button type="button" onClick={onClose} className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className={labelClass}>Email de acceso *</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Contraseña inicial *</label>
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Mínimo 6 caracteres"
                  className={inputClass}
                />
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Se la compartís al cliente; con ella entra a su portal para reservar y ver sus pagos.
                </p>
              </div>
              {error && <p className="text-sm text-destructive-fuerte bg-destructive/10 rounded-xl px-3 py-2">{error}</p>}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-border">
              <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Crear acceso
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

const TABS = [
  { key: 'resumen', label: 'Resumen', icon: User },
  { key: 'reservas', label: 'Reservas', icon: CalendarDays },
  { key: 'pagos', label: 'Pagos', icon: CreditCard },
  { key: 'membresia', label: 'Membresía', icon: BookOpen },
]

function ReservationStatusIcon({ status }: { status: Reservation['status'] }) {
  if (status === 'asistió') return <CheckCircle2 className="w-4 h-4 text-exito-fuerte" />
  if (status === 'cancelada') return <XCircle className="w-4 h-4 text-muted-foreground" />
  if (status === 'lista de espera') return <Clock className="w-4 h-4 text-aviso-fuerte" />
  if (status === 'ausente') return <XCircle className="w-4 h-4 text-destructive-fuerte" />
  return <CheckCircle2 className="w-4 h-4 text-primary-fuerte" />
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
  const { canWrite, refresh, data } = useData()
  const [activeTab, setActiveTab] = useState('resumen')
  const [showEdit, setShowEdit] = useState(false)
  const [showAssignPlan, setShowAssignPlan] = useState(false)
  const [showPortalAccess, setShowPortalAccess] = useState(false)
  const [savingAutoRenew, setSavingAutoRenew] = useState(false)
  const ms = student.membership

  // `student.membership` es la que cubre hoy —lib/api.ts elige con el mismo
  // criterio que membresia_para— y solo si ninguna cubre hoy cae, como
  // último recurso, en la de end_date más alto. O sea que mientras haya una
  // vigente, los períodos encolados por pago anticipado —los que la 0036
  // dejó en 'futura'— no están ahí, y ese es el caso normal. Hay que ir a
  // buscarlos al paquete del estudio o el mostrador no tiene forma de saber
  // que el mes que viene ya está vendido.
  const misMembresias = useMemo(() => {
    const propias = (data?.memberships ?? []).filter((m) => m.studentId === student.id)
    return propias.sort((a, b) => b.startDate.localeCompare(a.startDate) || b.endDate.localeCompare(a.endDate))
  }, [data, student.id])
  const futuras = misMembresias.filter((m) => m.status === 'futura')
  // Las renovaciones que le ofrecimos y todavía no pagó (0041). Es el
  // estado anterior a `futuras`: la misma plata, pero el período todavía
  // no existe porque lo crea el cobro.
  const ofertas = payments.filter((p) => esOferta(p))
  // Si la renovación de esa oferta ya se resolvió por otro camino —el
  // mostrador le asignó el período, o le cambió el plan—, cobrarla no crea
  // nada: `renovar_por_pago` (0041) corta con este mismo predicado
  // (`nueva.start_date > vieja.end_date`) y solo le deja una nota al pago.
  // Hace falta decirlo porque los dos bloques de abajo conviven hasta que
  // el proceso diario anula la oferta, y este es el bloque que existe para
  // no cobrarle dos veces el mismo mes.
  const ofertaYaResuelta = (p: Payment) => {
    const vieja = misMembresias.find((m) => m.id === p.renuevaMembresiaId)
    return !!vieja && misMembresias.some((m) => m.startDate > vieja.endDate)
  }
  // La 0041 invirtió el orden: la cuota primero, el período cuando el pago
  // entra. El parámetro que ella misma inserta sirve para saber si ya
  // corrió, y a diferencia de mirar las cuotas contesta también para la
  // clienta que no tiene ninguna oferta. Hace falta porque el texto de la
  // renovación automática describe lo que el sistema hace, y sin la 0041 no
  // hace ninguna de las dos cosas: el proceso diario necesita la columna
  // para marcar la cuota como oferta, así que saltea el bloque entero y al
  // vencer no pasa nada.
  const renuevaCobrandoPrimero = data?.settings?.renewal_invoice_days !== undefined
  // 'activa' y 'por vencer' son exactamente los dos estados que cubren hoy:
  // el estado derivado ya descartó antes la suspendida, la vencida y la
  // futura. Hace falta porque `ms` puede ser el último recurso de arriba, y
  // ahí decirle "es la que corre hoy" a una vencida sería falso.
  const correHoy = (m: Membership) => m.status === 'activa' || m.status === 'por vencer'

  const toggleAutoRenew = async () => {
    if (!ms || savingAutoRenew) return
    setSavingAutoRenew(true)
    try {
      await setMembershipAutoRenew(ms.id, !ms.autoRenew)
      await refresh()
    } finally {
      setSavingAutoRenew(false)
    }
  }
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
          <span>Volver a clientes</span>
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {/* Profile header */}
        <div className="bg-card border-b border-border px-4 md:px-6 py-6">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-primary-fuerte font-bold text-xl">{student.avatar}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <h2 className="text-xl font-bold text-foreground">{student.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    Cliente desde {new Date(student.joinDate).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
                  </p>
                </div>
                {canWrite && (
                  <button
                    onClick={() => setShowEdit(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Editar
                  </button>
                )}
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
              <p className="text-2xl font-bold text-primary-fuerte">{classesLeft}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Clases rest.</p>
            </div>
            <div className="bg-muted rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{upcoming}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Próximas</p>
            </div>
          </div>

          {/* Lo que le ofrecimos y todavía no pagó. Va antes del bloque de
              abajo porque es el estado anterior —y el único de los dos que
              pide hacer algo—, y se distingue por el borde punteado: el
              período no está asignado todavía, lo crea el cobro. Sin eso
              los dos avisos se leerían igual y son cosas opuestas: uno
              dice que el mes que viene está cerrado, este que no. */}
          {ofertas.length > 0 && (
            <div className="mt-4 rounded-xl border border-dashed border-info/40 bg-card p-3.5">
              <p className="text-xs font-bold text-info-fuerte flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                {ofertas.length === 1
                  ? 'Le ofrecimos la renovación y todavía no la pagó'
                  : `Le ofrecimos ${ofertas.length} renovaciones y todavía no las pagó`}
              </p>
              <div className="mt-1.5 space-y-1">
                {ofertas.map((p) => (
                  <p key={p.id} className="text-[11px] text-info-fuerte/90 leading-relaxed">
                    <span className="font-semibold">{p.planName}</span> · $
                    {p.amount.toLocaleString('es-AR')} ·{' '}
                    {ofertaYaResuelta(p)
                      ? 'su renovación ya está asignada'
                      : p.dueDate < hoyISO()
                      ? `el plazo para renovar venció el ${fecha(p.dueDate)}`
                      : `puede renovarla hasta el ${fecha(p.dueDate)}`}
                  </p>
                ))}
              </div>
              <p className="text-[10px] text-info-fuerte mt-1.5">
                No es deuda: se cobra desde Pagos y ahí nace el período nuevo. Si no la paga, el
                sistema anula la oferta y el período no existe.
              </p>
              {/* La excepción, y es la única que cuesta plata: con el período
                  ya asignado, cobrar la oferta no crea nada —el pago queda
                  registrado con una nota— así que el mes se le cobraría dos
                  veces si además se cobra la cuota del período nuevo. */}
              {ofertas.some(ofertaYaResuelta) && (
                <p className="text-[10px] font-semibold text-aviso-fuerte mt-1">
                  Con el período ya asignado, la oferta no se cobra: el sistema la anula sola y lo
                  que se cobra es la cuota de ese período.
                </p>
              )}
            </div>
          )}

          {/* Va acá, junto al nombre y fuera de las pestañas, porque es lo que
              evita cobrarle dos veces el mismo mes: si está escondido en una
              pestaña, quien atiende el teléfono no lo va a ver. */}
          {futuras.length > 0 && (
            <div className="mt-4 rounded-xl border border-info/40 bg-info-suave p-3.5">
              <p className="text-xs font-bold text-info-fuerte flex items-center gap-1.5">
                <CalendarClock className="w-3.5 h-3.5 shrink-0" />
                {futuras.length === 1
                  ? 'El próximo período ya está asignado'
                  : `Tiene ${futuras.length} períodos ya asignados por adelantado`}
              </p>
              <div className="mt-1.5 space-y-1">
                {futuras.map((m) => {
                  const cuota = payments.find((p) => p.membershipId === m.id && p.status !== 'anulado')
                  return (
                    <p key={m.id} className="text-[11px] text-info-fuerte/90 leading-relaxed">
                      <span className="font-semibold">{m.planName}</span> · arranca el{' '}
                      {fecha(m.startDate)} y llega hasta el {fecha(m.endDate)} · {m.classesTotal} clase
                      {m.classesTotal !== 1 ? 's' : ''}
                      {cuota ? ` · ${textoCuota(cuota)}` : ''}
                    </p>
                  )
                })}
              </div>
              <p className="text-[10px] text-info-fuerte mt-1.5">
                Asignar el mismo plan otra vez no reemplaza esto: suma un período más detrás, con su
                propia cuota.
              </p>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="border-b border-border bg-card px-4 md:px-6 overflow-x-auto">
          <div className="flex gap-0 -mb-px min-w-max">
            {TABS.filter((t) => t.key !== 'pagos' || canWrite).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={cn(
                  'flex items-center gap-2 px-3 md:px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0',
                  activeTab === key
                    ? 'border-primary text-primary-fuerte'
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
        <div className="p-4 md:p-6">
          {/* Resumen */}
          {activeTab === 'resumen' && (
            <div className="space-y-4 max-w-2xl">
              {/* Personal data */}
              <div className="bg-card rounded-2xl border border-border p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <User className="w-4 h-4 text-primary-fuerte" />
                  Datos personales
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

              {/* Acceso al portal */}
              <div className="bg-card rounded-2xl border border-border p-5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Smartphone className="w-4.5 h-4.5 text-primary-fuerte" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Acceso al portal</h3>
                      <p className="text-xs text-muted-foreground">
                        {student.userId
                          ? 'Tiene cuenta activa: reserva y ve sus pagos desde el celular.'
                          : 'Todavía no tiene cuenta para reservar por su cuenta.'}
                      </p>
                    </div>
                  </div>
                  {student.userId ? (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-exito-fuerte bg-exito-suave px-2.5 py-1 rounded-full">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Activo
                    </span>
                  ) : canWrite ? (
                    <button
                      onClick={() => setShowPortalAccess(true)}
                      className="px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
                    >
                      Crear acceso
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Medical notes */}
              {student.medicalNotes && (
                <div className="bg-aviso-suave rounded-2xl border border-aviso/40 p-5">
                  <h3 className="text-sm font-semibold text-aviso-fuerte mb-2 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Observaciones médicas
                  </h3>
                  <p className="text-sm text-aviso-fuerte">{student.medicalNotes}</p>
                </div>
              )}

              {/* Observations */}
              {student.observations && (
                <div className="bg-card rounded-2xl border border-border p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-primary-fuerte" />
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
                          r.status === 'asistió' && 'bg-exito-suave text-exito-fuerte',
                          r.status === 'confirmada' && 'bg-primary/10 text-primary-fuerte',
                          r.status === 'cancelada' && 'bg-muted text-muted-foreground',
                          r.status === 'lista de espera' && 'bg-aviso-suave text-aviso-fuerte',
                          r.status === 'ausente' && 'bg-destructive-suave text-destructive-fuerte'
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
                payments.map((p) => {
                  const oferta = esOferta(p)
                  const anulada = p.status === 'anulado'
                  // Una oferta anulada es la renovación que nadie tomó, y
                  // con la 0041 ese es el final normal de toda oferta que
                  // no se paga. Se pregunta por la columna y no por
                  // `esOferta` —que descarta las anuladas a propósito— y
                  // se exige que nunca se haya cobrado: una renovación
                  // cobrada y después anulada desde el mostrador sí se
                  // tomó, y decirle "no tomada" sería falso.
                  const ofertaCaducada = anulada && !!p.renuevaMembresiaId && !p.date
                  // 'anulado' no tenía rama: caía en el último tramo del
                  // ternario y decía "Vencido" —sin color, porque tampoco
                  // había clase para su estado— o sea una deuda que ya
                  // nadie debe. Con la 0041 esa fila pasa a ser común.
                  const detalle = p.status === 'pagado'
                    ? `Pagado el ${p.date} · ${p.method === 'mercadopago' ? 'Mercado Pago' : p.method ?? ''}`
                    : ofertaCaducada
                    ? `Renovación no tomada · vencía el ${fecha(p.dueDate)}`
                    : anulada
                    ? 'Anulado'
                    : oferta
                    ? p.dueDate < hoyISO()
                      ? `Renovación · el plazo venció el ${fecha(p.dueDate)}`
                      : `Renovación · puede pagarla hasta el ${fecha(p.dueDate)}`
                    : `Vence ${p.dueDate}`
                  return (
                  <div
                    key={p.id}
                    className="bg-card rounded-xl border border-border p-4 flex items-center gap-3"
                  >
                    <div
                      className={cn(
                        'w-2 h-2 rounded-full shrink-0',
                        p.status === 'pagado' && 'bg-exito',
                        oferta && 'bg-info',
                        anulada && 'bg-muted-foreground/40',
                        p.status === 'pendiente' && !oferta && 'bg-aviso',
                        p.status === 'vencido' && 'bg-destructive'
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{p.planName}</p>
                      <p className="text-xs text-muted-foreground">{detalle}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className={cn(
                          'text-sm font-bold',
                          anulada ? 'text-muted-foreground line-through' : 'text-foreground'
                        )}
                      >
                        ${p.amount.toLocaleString('es-AR')}
                      </p>
                      <span
                        className={cn(
                          'text-[10px] font-semibold',
                          p.status === 'pagado' && 'text-exito-fuerte',
                          oferta && 'text-info-fuerte',
                          anulada && 'text-muted-foreground',
                          p.status === 'pendiente' && !oferta && 'text-aviso-fuerte',
                          p.status === 'vencido' && 'text-destructive-fuerte'
                        )}
                      >
                        {oferta
                          ? 'Renovación'
                          : p.status === 'pagado'
                          ? 'Pagado'
                          : anulada
                          ? 'Anulado'
                          : p.status === 'pendiente'
                          ? 'Pendiente'
                          : 'Vencido'}
                      </span>
                    </div>
                  </div>
                  )
                })
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
                          {fecha(ms.startDate)} — {fecha(ms.endDate)}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'text-xs font-semibold px-3 py-1 rounded-full',
                          COLOR_ESTADO[ms.status]
                        )}
                      >
                        {ESTADO_MEMBRESIA[ms.status]}
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
                          style={{ width: `${Math.min(100, (ms.classesUsed / ms.classesTotal) * 100)}%` }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
                      <div className="bg-muted rounded-xl p-3 text-center">
                        <p className="text-xl font-bold text-foreground">{ms.classesTotal}</p>
                        <p className="text-[10px] text-muted-foreground">Total clases</p>
                      </div>
                      <div className="bg-muted rounded-xl p-3 text-center">
                        <p className="text-xl font-bold text-primary-fuerte">{classesLeft}</p>
                        <p className="text-[10px] text-muted-foreground">Disponibles</p>
                      </div>
                      <div className="bg-muted rounded-xl p-3 text-center">
                        <p className="text-xl font-bold text-foreground">
                          ${ms.price.toLocaleString('es-AR')}
                        </p>
                        {/* No "Precio mensual": desde la 0036 la vigencia
                            puede ser en meses o en días, y FE FIRST vale
                            siete días. */}
                        <p className="text-[10px] text-muted-foreground">Precio del plan</p>
                      </div>
                    </div>

                    {/* Renovación automática */}
                    <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-border">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">Renovación automática</p>
                        {/* Dos textos porque la 0041 cambia lo que hace el
                            interruptor, no solo cuándo: antes creaba el
                            período y después la cuota; ahora emite la cuota
                            antes de vencer y el período lo crea el pago.
                            Y el segundo texto es el de HOY: sin la columna
                            de la 0041 el proceso diario no puede marcar la
                            cuota como oferta, así que saltea la renovación
                            entera y al vencer no pasa nada. Dejar acá el
                            texto de antes —"el sistema renueva el plan y
                            genera la cuota"— manda a recepción a esperar
                            una renovación que ya no llega. */}
                        <p className="text-xs text-muted-foreground">
                          {renuevaCobrandoPrimero
                            ? 'Unos días antes de vencer, el sistema le genera la cuota del período siguiente. El período nuevo se crea cuando esa cuota se cobra.'
                            : 'Todavía no rige: hasta que se aplique el cambio pendiente en la base, al vencer no se emite ninguna cuota. El período nuevo se arma a mano con «Renovar membresía».'}
                        </p>
                      </div>
                      {canWrite ? (
                        <button
                          onClick={toggleAutoRenew}
                          disabled={savingAutoRenew}
                          role="switch"
                          aria-checked={ms.autoRenew}
                          aria-label="Renovación automática"
                          className={cn(
                            'relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-60',
                            ms.autoRenew ? 'bg-primary' : 'bg-muted border border-border'
                          )}
                        >
                          <span
                            className={cn(
                              'absolute top-0.5 w-5 h-5 rounded-full bg-card shadow transition-transform',
                              ms.autoRenew ? 'translate-x-[22px]' : 'translate-x-0.5'
                            )}
                          />
                        </button>
                      ) : (
                        <span className="text-xs font-semibold text-muted-foreground shrink-0">
                          {ms.autoRenew ? 'Activada' : 'Desactivada'}
                        </span>
                      )}
                    </div>
                  </div>

                  {canWrite && (
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
                  )}
                </>
              ) : (
                <div className="text-center py-12">
                  <BookOpen className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
                  <p className="text-sm text-muted-foreground mb-4">Sin membresía activa</p>
                  {canWrite && (
                    <button
                      onClick={() => setShowAssignPlan(true)}
                      className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
                    >
                      Asignar membresía
                    </button>
                  )}
                </div>
              )}

              {/* Un período por fila, las encoladas y las vencidas incluidas.
                  La pestaña mostraba solo la vigente, así que lo que tuvo
                  antes —y lo que ya pagó para después— no se podía consultar
                  en ningún lado. */}
              {misMembresias.length > 0 && (
                <div className="bg-card rounded-2xl border border-border p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
                    <History className="w-4 h-4 text-primary-fuerte" />
                    Historial de membresías
                  </h3>
                  <p className="text-xs text-muted-foreground mb-2">
                    Cada período es una fila: renovar no reemplaza la anterior, la deja atrás.
                  </p>
                  <div className="divide-y divide-border">
                    {misMembresias.map((m) => (
                      <div key={m.id} className="flex items-center gap-3 py-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{m.planName}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {fecha(m.startDate)} — {fecha(m.endDate)} · {m.classesUsed}/{m.classesTotal}{' '}
                            clases
                            {ms?.id !== m.id
                              ? ''
                              : correHoy(m)
                              ? ' · es la que corre hoy'
                              : ' · es la que la ficha muestra arriba'}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0',
                            COLOR_ESTADO[m.status]
                          )}
                        >
                          {ESTADO_MEMBRESIA[m.status]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showEdit && <AlumnoFormModal student={student} onClose={() => setShowEdit(false)} />}
      {showAssignPlan && <AsignarPlanModal student={student} onClose={() => setShowAssignPlan(false)} />}
      {showPortalAccess && (
        <PortalAccessModal student={student} onClose={() => setShowPortalAccess(false)} />
      )}
    </div>
  )
}
