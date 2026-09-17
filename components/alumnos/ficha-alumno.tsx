'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
  HeartPulse,
  X,
} from 'lucide-react'
import { cn, nombreDelDia } from '@/lib/utils'
import { useData } from '@/lib/data-context'
import {
  createSystemUser,
  reenviarAcceso,
  setMembershipAutoRenew,
  esOferta,
  hoyISO,
  formaDeLaReserva,
  fetchStudentNotes,
  addStudentNote,
} from '@/lib/api'
import type {
  Membership,
  MembershipStatus,
  Student,
  StudentNote,
  Reservation,
  Payment,
} from '@/lib/types'
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

/**
 * Volver a mandar el mail de acceso.
 *
 * Hasta el 17/09 la ficha con cuenta sólo mostraba "Activo", así que
 * cuando el mail no salía —y pasó la primera vez que se usó en
 * producción— la única salida era borrar la cuenta y crearla de nuevo.
 *
 * El botón aparece siempre que haya cuenta, sin preguntarle antes a la
 * base si el reenvío corresponde: eso lo decide el servidor, que sabe si
 * la clienta ya eligió su contraseña, y si dice que no, su motivo es lo
 * que se muestra. Esconder el botón adivinando sería esconderlo mal —la
 * pantalla no tiene la metadata de la cuenta— y el reenvío no es una
 * acción que haya que temerle: manda el mismo mail al mismo lugar.
 */
function ReenviarAcceso({ student }: { student: Student }) {
  const [estado, setEstado] = useState<'listo' | 'mandando' | 'ok' | 'falla'>('listo')
  const [motivo, setMotivo] = useState<string | null>(null)

  const reenviar = async () => {
    setEstado('mandando')
    setMotivo(null)
    try {
      const r = await reenviarAcceso(student.id)
      setEstado(r.mailEnviado ? 'ok' : 'falla')
      setMotivo(r.mailMotivo)
    } catch (err) {
      setEstado('falla')
      setMotivo(err instanceof Error ? err.message : 'No se pudo reenviar')
    }
  }

  return (
    <div className="flex flex-col items-end gap-2 w-full sm:w-auto sm:max-w-[26rem]">
      <div className="flex items-center gap-2 justify-end">
        {estado === 'ok' ? (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-exito-fuerte">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Mail reenviado a {student.email}
          </span>
        ) : (
          <button
            onClick={reenviar}
            disabled={estado === 'mandando'}
            className="px-3 py-1.5 rounded-xl border border-border text-xs font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-60 flex items-center gap-1.5"
          >
            {estado === 'mandando' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Mail className="w-3.5 h-3.5" />
            )}
            {estado === 'mandando' ? 'Mandando...' : 'Reenviar el mail de acceso'}
          </button>
        )}
      </div>
      {estado === 'falla' && motivo && (
        <p className="w-full text-left text-xs text-aviso-fuerte bg-aviso-suave rounded-xl px-3 py-2">
          {motivo}
        </p>
      )}
    </div>
  )
}

/**
 * Crear el acceso de una clienta.
 *
 * Ya no se elige una contraseña: el acceso nace con el DOCUMENTO de la
 * ficha (decisión del estudio, 17/09) y la clienta recibe un mail con
 * cómo entrar. El mostrador no inventa ni dicta nada.
 *
 * El documento lo lee el servidor de la ficha, así que acá no se manda: si
 * la ficha no lo tiene, el pedido vuelve con el motivo y este formulario
 * lo muestra en vez de adivinarlo.
 */
function PortalAccessModal({ student, onClose }: { student: Student; onClose: () => void }) {
  const { refresh } = useData()
  const [email, setEmail] = useState(student.email)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [mailEnviado, setMailEnviado] = useState(false)
  const [mailMotivo, setMailMotivo] = useState<string | null>(null)

  const dni = (student.dni ?? '').replace(/\D/g, '')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const r = await createSystemUser({
        email,
        fullName: student.name,
        role: 'alumno',
        studentId: student.id,
      })
      setMailEnviado(r.mailEnviado)
      setMailMotivo(r.mailMotivo)
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
            {/* Si el mail salió, no hay nada que dictar. Si no salió —falta
                verificar el dominio en Resend—, hay que decirlo: el
                mostrador tiene que pasar el acceso a mano y sin este
                cartel se iría creyendo que la clienta ya fue avisada. */}
            <p className="text-sm text-muted-foreground mb-5">
              {mailEnviado ? (
                <>
                  Le mandamos un mail a <span className="font-semibold">{email}</span> con cómo
                  entrar. La contraseña es su documento y al entrar le vamos a pedir que la cambie.
                </>
              ) : (
                <>
                  <span className="font-semibold text-aviso-fuerte">El mail no salió.</span>{' '}
                  {mailMotivo && <span className="block mt-1.5 mb-1.5 text-left">{mailMotivo}</span>}
                  Pasale el acceso a mano: entra con <span className="font-semibold">{email}</span>{' '}
                  y su documento como contraseña. Al entrar le vamos a pedir que la cambie.
                </>
              )}
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
              {/* El documento no se edita acá: se arregla en la ficha, que
                  es donde vive. Mostrarlo editable invitaría a "arreglarlo
                  para pasar" y la cuenta quedaría con una clave que no es
                  la que la clienta sabe. */}
              {dni.length >= 6 ? (
                <div className="rounded-xl bg-muted px-3.5 py-3">
                  <p className="text-sm text-foreground">
                    La contraseña inicial es su documento:{' '}
                    <span className="font-bold">{dni}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Le llega un mail con cómo entrar, y al ingresar le vamos a pedir que elija una
                    contraseña propia — el documento no es un secreto, así que sirve una sola vez.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl bg-aviso-suave px-3.5 py-3">
                  <p className="text-sm font-semibold text-aviso-fuerte">
                    Falta el DNI en la ficha
                  </p>
                  <p className="text-[11px] text-aviso-fuerte/90 mt-1">
                    La contraseña inicial es el documento, así que hay que cargarlo primero en los
                    datos de {student.name.split(' ')[0]}.
                  </p>
                </div>
              )}
              {error && <p className="text-sm text-destructive-fuerte bg-destructive/10 rounded-xl px-3 py-2">{error}</p>}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-border">
              <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={saving || dni.length < 6} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
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
  // Las dos de la 0050. 'Salud' separa lo que hasta ahora era un párrafo
  // suelto; 'Notas' es la bitácora, lo único que la profesora escribe.
  { key: 'salud', label: 'Salud', icon: HeartPulse },
  { key: 'notas', label: 'Notas', icon: ClipboardList },
  { key: 'pagos', label: 'Pagos', icon: CreditCard },
  { key: 'membresia', label: 'Membresía', icon: BookOpen },
]

/** Un campo de salud, o nada si está vacío: la ficha no lista renglones vacíos. */
function CampoSalud({ label, value }: { label: string; value?: string }) {
  if (!value?.trim()) return null
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-0.5">
        {label}
      </p>
      <p className="text-sm text-foreground whitespace-pre-line">{value}</p>
    </div>
  )
}

/**
 * La bitácora. Se lee al abrir la pestaña y no con el paquete del
 * estudio: es historia que crece sin techo y que solo mira quien está
 * parado en esta ficha.
 */
function Bitacora({ student }: { student: Student }) {
  const { can } = useData()
  const [notas, setNotas] = useState<StudentNote[] | null>(null)
  const [texto, setTexto] = useState('')
  const [kind, setKind] = useState<StudentNote['kind']>('profesora')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const puedeEscribir = can('notas.escribir')
  const puedeInterna = can('alumnos.editar')

  const cargar = useCallback(() => {
    // El error NO se traga. Antes esto era `.catch(() => setNotas([]))` y
    // la pantalla decía "sin notas todavía" con las notas guardadas en la
    // base: el modo de falla más caro que tiene este sistema, porque el
    // dato está y nadie lo sabe. Se descubrió probando la 0050.
    setNotas(null)
    setError(null)
    fetchStudentNotes(student.id)
      .then(setNotas)
      .catch((err) => {
        setNotas([])
        setError(err instanceof Error ? err.message : 'No se pudo leer la bitácora')
      })
  }, [student.id])

  useEffect(cargar, [cargar])

  const guardar = async () => {
    setSaving(true)
    setError(null)
    try {
      await addStudentNote(student.id, texto, kind)
      setTexto('')
      cargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la nota')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      {puedeEscribir && (
        <div className="bg-card rounded-2xl border border-border p-4 space-y-2">
          <textarea
            rows={3}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Qué se observó hoy…"
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary resize-none"
          />
          <div className="flex items-center gap-2">
            {puedeInterna && (
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as StudentNote['kind'])}
                className="px-3 py-2 rounded-xl border border-border bg-background text-xs text-foreground outline-none focus:border-primary"
              >
                <option value="profesora">La ve todo el equipo</option>
                <option value="interna">Solo mostrador</option>
              </select>
            )}
            <button
              disabled={saving || !texto.trim()}
              onClick={guardar}
              className="ml-auto px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Agregar
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Queda tu nombre y la fecha. Una nota no se edita: si algo cambió, se agrega otra.
          </p>
          {error && <p className="text-xs text-destructive-fuerte">{error}</p>}
        </div>
      )}

      {error && !saving && (
        <p className="text-xs text-destructive-fuerte bg-destructive/10 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      {notas === null ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Cargando…</p>
      ) : notas.length === 0 && !error ? (
        <div className="text-center py-12 text-muted-foreground">
          <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Sin notas todavía</p>
        </div>
      ) : (
        notas.map((n) => (
          <div key={n.id} className="bg-card rounded-xl border border-border p-4">
            <p className="text-sm text-foreground whitespace-pre-line">{n.body}</p>
            <p className="text-[11px] text-muted-foreground mt-2">
              {n.authorName} ·{' '}
              {/* Fijo al huso del estudio y no al del navegador. Es la
                  misma decisión de la 0016 para la plata: si el mostrador
                  abre desde una tablet mal configurada, la nota tiene que
                  seguir diciendo la hora a la que se escribió en el
                  estudio, no la que cree ese aparato. */}
              {new Date(n.createdAt).toLocaleString('es-AR', {
                timeZone: 'America/Argentina/Buenos_Aires',
              })}
              {n.kind === 'interna' && (
                <span className="ml-2 font-semibold text-aviso-fuerte">solo mostrador</span>
              )}
            </p>
          </div>
        ))
      )}
    </div>
  )
}

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
  const { canWrite, refresh, data, can } = useData()
  // Lo pregunta al motor y no al dato: sin la clave, `student_private`
  // llega vacío y "no hay" se confunde con "no podés ver".
  const veSalud = can('salud.ver')
  const [activeTab, setActiveTab] = useState('resumen')
  const [showEdit, setShowEdit] = useState(false)
  const [showAssignPlan, setShowAssignPlan] = useState(false)
  const [showPortalAccess, setShowPortalAccess] = useState(false)
  const [savingAutoRenew, setSavingAutoRenew] = useState(false)
  const ms = student.membership

  // Sus turnos fijos (0048), ordenados como los lee el mostrador: por día
  // y hora, no por cuándo se los asignaron. Vacío mientras la migración
  // no corrió, y también si al rol le falta `turnos.ver`.
  const turnos = (data?.turnosFijos ?? [])
    .filter((t) => t.studentId === student.id)
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.time.localeCompare(b.time))

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
  /**
   * "¿Cuándo vuelve?" — una de las seis preguntas que el estudio pidió
   * que la ficha conteste de un vistazo (§3 del 15/09).
   *
   * Hasta hoy esto era el CONTADOR de reservas confirmadas, y mentía:
   * una reserva vieja que nadie marcó como asistida o ausente sigue en
   * 'confirmada' para siempre, así que el número crecía con el descuido
   * del mostrador en vez de con las clases que vienen. Ahora se filtra
   * por fecha y lo que se muestra es la próxima, que es la pregunta.
   */
  const proximas = reservations
    .filter((r) => r.status === 'confirmada' && r.date >= hoyISO())
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
  const proxima = proximas[0]

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
              {proxima ? (
                <>
                  <p className="text-2xl font-bold text-foreground leading-none">
                    {new Date(`${proxima.date}T00:00`).toLocaleDateString('es-AR', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Vuelve · {proxima.time}
                    {proximas.length > 1 ? ` (+${proximas.length - 1})` : ''}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold text-muted-foreground leading-none">—</p>
                  <p className="text-[11px] text-muted-foreground mt-1">Sin reservas</p>
                </>
              )}
            </div>
          </div>

          {/* Los turnos fijos (0048). Es un pedido textual del estudio y
              está en su §3: la ficha tiene que contestar "¿qué turnos
              fijos tiene?" sin entrar a ningún lado. La prioridad no sale
              de acá: la deriva la base del vencimiento de su membresía. */}
          {turnos.length > 0 && (
            <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-1.5">
                Turnos fijos
              </p>
              <div className="space-y-0.5">
                {turnos.map((t) => (
                  <p key={t.id} className="text-sm text-foreground">
                    {nombreDelDia(t.dayOfWeek)} {t.time}
                    {t.estado === 'pausado' && (
                      <span className="ml-2 text-[10px] font-semibold text-muted-foreground">
                        en pausa{t.motivo ? ` · ${t.motivo}` : ''}
                      </span>
                    )}
                  </p>
                ))}
              </div>
              {/* La fecha sola no dice nada si ya pasó: el mostrador tiene
                  que ver de un vistazo si el lugar sigue siendo suyo. */}
              <p
                className={cn(
                  'text-xs mt-2',
                  turnos[0].conPrioridad ? 'text-muted-foreground' : 'text-destructive-fuerte font-semibold'
                )}
              >
                {turnos[0].prioridadHasta
                  ? turnos[0].conPrioridad
                    ? `Prioridad hasta: ${fecha(turnos[0].prioridadHasta)}`
                    : `Perdió la prioridad el ${fecha(turnos[0].prioridadHasta)} — sus horarios se pueden liberar`
                  : 'Sin membresía: no conserva la prioridad sobre estos horarios'}
              </p>
            </div>
          )}

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
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-exito-fuerte bg-exito-suave px-2.5 py-1 rounded-full">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Activo
                      </span>
                      {canWrite && <ReenviarAcceso student={student} />}
                    </div>
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

              {/* El contacto de emergencia (15/09). Va con el teléfono en
                  vivo: si hay que usarlo es porque alguien está buscando a
                  quién llamar, y en ese momento un dato que hay que
                  transcribir no sirve. */}
              {student.emergencyContact && (
                <div className="bg-card rounded-2xl border border-border p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                    <Phone className="w-4 h-4 text-destructive-fuerte" />
                    Contacto de emergencia
                  </h3>
                  <p className="text-sm text-foreground">{student.emergencyContact}</p>
                  {(() => {
                    // El primer número largo del texto. El campo es libre
                    // —"Mamá, Ana, 381 555 1234"— así que se busca en vez
                    // de suponer un formato que nadie prometió.
                    const tel = student.emergencyContact.replace(/[^0-9+]/g, '')
                    if (tel.replace(/\D/g, '').length < 8) return null
                    return (
                      <a
                        href={`tel:${tel}`}
                        className="text-xs font-semibold text-primary-fuerte hover:underline mt-1.5 inline-block"
                      >
                        Llamar
                      </a>
                    )
                  })()}
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
                        {/* Por qué esta reserva no es como las demás (0046):
                            si repuso una perdida, si entró por excepción, o
                            si al cancelar se quedó sin la clase. Dos
                            canceladas se leen igual y no son lo mismo. */}
                        {(() => {
                          const forma = formaDeLaReserva(r)
                          if (!forma) return null
                          return (
                            <p
                              className={cn(
                                'text-[10px] font-semibold mt-0.5',
                                forma.tono === 'info' && 'text-info-fuerte',
                                forma.tono === 'aviso' && 'text-aviso-fuerte',
                                forma.tono === 'neutro' && 'text-muted-foreground'
                              )}
                            >
                              {forma.texto}
                              {r.overrideReason ? ` · ${r.overrideReason}` : ''}
                            </p>
                          )
                        })()}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-medium text-foreground">{r.date}</p>
                        <p className="text-xs text-muted-foreground">{r.time}</p>
                      </div>
                      <span
                        className={cn(
                          'text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0',
                          r.status === 'asistió' && 'bg-exito-suave text-exito-fuerte',
                          // Relleno pleno y no tinte: en tinte, `primary-fuerte` quedaba a
                          // ΔEok 0.02 de `muted-foreground`, que es el de 'cancelada'.
                          r.status === 'confirmada' && 'bg-primary text-primary-foreground',
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
          {activeTab === 'salud' && (
            <div className="max-w-2xl space-y-4">
              {/* Los cuatro campos de la 0050 más el texto libre de antes.
                  Si no hay nada cargado se dice, en vez de mostrar cinco
                  renglones vacíos que parecen un error de la pantalla. */}
              {/* "No tenés acceso" y "no hay nada cargado" se ven iguales:
                  `student_private` devuelve CERO FILAS cuando falta
                  `salud.ver`, no un error. Y acá confundirlas tiene
                  consecuencia física — una profesora que lee "sin datos de
                  salud" da la clase creyendo que esa clienta no tiene
                  lesiones ni está embarazada. Se pregunta por el permiso,
                  nunca por el resultado vacío. */}
              {!veSalud ? (
                <div className="rounded-2xl border border-aviso/40 bg-aviso-suave p-5">
                  <h3 className="text-sm font-semibold text-aviso-fuerte mb-1 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Tu rol no ve los datos de salud
                  </h3>
                  <p className="text-sm text-aviso-fuerte/90">
                    Puede haber lesiones, embarazo, cirugías o medicación cargadas y esta pantalla no
                    te las muestra. <span className="font-semibold">No quiere decir que no haya.</span>{' '}
                    Si necesitás saberlo antes de una clase, preguntale a administración.
                  </p>
                </div>
              ) : !student.lesiones &&
              !student.embarazo &&
              !student.cirugias &&
              !student.medicacion &&
              !student.medicalNotes ? (
                <div className="text-center py-12 text-muted-foreground">
                  <HeartPulse className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Sin datos de salud cargados</p>
                  {canWrite && (
                    <button
                      onClick={() => setShowEdit(true)}
                      className="text-xs font-semibold text-primary-fuerte hover:underline mt-2"
                    >
                      Cargarlos ahora
                    </button>
                  )}
                </div>
              ) : (
                <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
                  <CampoSalud label="Lesiones" value={student.lesiones} />
                  <CampoSalud label="Embarazo" value={student.embarazo} />
                  <CampoSalud label="Cirugías" value={student.cirugias} />
                  <CampoSalud label="Medicación" value={student.medicacion} />
                  <CampoSalud label="Otras observaciones" value={student.medicalNotes} />
                </div>
              )}
              {veSalud && (
                <p className="text-[11px] text-muted-foreground">
                  Estos datos los protege la base: el rol sin acceso a salud no los recibe. El
                  cliente los ve desde su portal.
                </p>
              )}
            </div>
          )}

          {activeTab === 'notas' && <Bitacora student={student} />}

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
