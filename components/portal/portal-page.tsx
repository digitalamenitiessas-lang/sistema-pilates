'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  KeyRound,
  Loader2,
  LogOut,
  MapPin,
  RefreshCw,
  X,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useData, useStudio } from '@/lib/data-context'
import { disciplineStyle } from '@/lib/disciplines'
import { NotificationsBell } from '@/components/layout/notifications-bell'
import {
  addDays,
  mondayOf,
  ahoraDelEstudio,
  reservaCerrada,
  createReservation,
  updateReservationStatus,
  fetchWeekOccupancy,
  type Occupancy,
  settingNum,
  settingText,
  esOferta,
} from '@/lib/api'
import type { Discipline, Reservation, Student } from '@/lib/types'

const DAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function pretty(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}`
}

function ChangePasswordModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const inputClass =
    'w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors'
  const labelClass = 'text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password !== password2) {
      setError('Las contraseñas no coinciden')
      return
    }
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (error) {
      setError(
        /same.*password|different from the old/i.test(error.message)
          ? 'La contraseña nueva tiene que ser distinta a la actual'
          : 'No se pudo cambiar la contraseña. Probá de nuevo.'
      )
      return
    }
    onDone()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-card rounded-2xl shadow-2xl w-full max-w-sm border border-border max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground">Cambiar contraseña</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-5 space-y-4">
          <div>
            <label className={labelClass}>Contraseña nueva</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              required
              minLength={6}
              autoComplete="new-password"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Repetir contraseña</label>
            <input
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              autoComplete="new-password"
              className={inputClass}
            />
          </div>
          {error && (
            <p className="text-sm text-destructive-fuerte bg-destructive/10 rounded-xl px-3 py-2">{error}</p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  )
}

function MembershipCard({ student }: { student: Student }) {
  const ms = student.membership
  if (!ms) {
    return (
      <div className="bg-card rounded-2xl border border-border p-5 text-center">
        <BookOpen className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-40" />
        <p className="text-sm font-semibold text-foreground mb-1">Sin membresía activa</p>
        <p className="text-xs text-muted-foreground">
          Consultá en recepción para activar tu plan y empezar a reservar.
        </p>
      </div>
    )
  }

  const left = ms.classesTotal - ms.classesUsed
  const pct = Math.min(100, Math.round((ms.classesUsed / ms.classesTotal) * 100))
  const statusCfg =
    ms.status === 'activa'
      ? { label: 'Activa', class: 'bg-exito-suave text-exito-fuerte' }
      : ms.status === 'por vencer'
      ? { label: 'Por vencer', class: 'bg-aviso-suave text-aviso-fuerte' }
      : ms.status === 'vencida'
      ? { label: 'Vencida', class: 'bg-destructive-suave text-destructive-fuerte' }
      : ms.status === 'futura'
      ? { label: 'Empieza después', class: 'bg-info-suave text-info-fuerte' }
      : { label: 'Suspendida', class: 'bg-muted text-muted-foreground' }

  return (
    <div className="bg-card rounded-2xl border border-border p-5">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-xs text-muted-foreground">Tu plan</p>
          <h2 className="text-lg font-bold text-foreground">{ms.planName}</h2>
        </div>
        <span className={cn('text-[10px] font-semibold px-2.5 py-1 rounded-full', statusCfg.class)}>
          {statusCfg.label}
        </span>
      </div>

      <div className="flex items-center gap-3 mb-1.5">
        <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs font-semibold text-foreground shrink-0">
          {ms.classesUsed}/{ms.classesTotal}
        </span>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Te quedan <strong className="text-primary-fuerte">{left}</strong> clase{left !== 1 ? 's' : ''}
        </span>
        {/* A un período que todavía no arrancó no se le dice cuándo vence:
            el dato que la clienta necesita es desde cuándo lo puede usar. */}
        <span>
          {ms.status === 'futura'
            ? `Arranca el ${pretty(ms.startDate)}`
            : `Vence el ${pretty(ms.endDate)}`}
        </span>
      </div>
    </div>
  )
}

function UpcomingList({
  reservations,
  suspendidas,
  onCancel,
  busyId,
}: {
  reservations: Reservation[]
  /** clase|fecha de los días que el estudio suspendió, con su motivo */
  suspendidas: Map<string, string>
  onCancel: (r: Reservation) => void
  busyId: string | null
}) {
  const { disciplines } = useStudio()
  if (reservations.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-4">
        No tenés clases reservadas. ¡Elegí una acá abajo!
      </p>
    )
  }
  return (
    <div className="space-y-2">
      {reservations.map((r) => {
        // Suspender una fecha no cancela las reservas —esa decisión la toma
        // el estudio—, así que la reserva seguía acá como si nada y el
        // cliente viajaba a una clase que no se dictaba.
        const motivo = suspendidas.get(`${r.classId}|${r.date}`)
        return (
        <div key={r.id} className="bg-card rounded-2xl border border-border px-4 py-3 flex items-center gap-3">
          <div
            className="w-1 self-stretch rounded-full shrink-0"
            style={{ backgroundColor: motivo !== undefined ? 'var(--secondary)' : disciplineStyle(disciplines, r.discipline).dot }}
          />
          <div className="flex-1 min-w-0">
            <p className={cn('text-sm font-semibold truncate', motivo !== undefined ? 'text-muted-foreground line-through' : 'text-foreground')}>
              {r.className}
            </p>
            <p className="text-xs text-muted-foreground">
              {pretty(r.date)} · {r.time} · {r.teacherName}
            </p>
            {motivo !== undefined && (
              <p className="text-xs text-destructive-fuerte font-medium mt-0.5">
                El estudio suspendió esta clase{motivo ? `: ${motivo}` : ''}
              </p>
            )}
          </div>
          {motivo !== undefined ? (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive-fuerte shrink-0">
              Suspendida
            </span>
          ) : r.status === 'lista de espera' ? (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-aviso-suave text-aviso-fuerte shrink-0">
              En espera
            </span>
          ) : null}
          {/* Si el estudio la suspendió no hay nada que cancelar, y con el
              consumo encendido esa clase no se le descuenta. */}
          {motivo === undefined && (
            <button
              disabled={busyId === r.id}
              onClick={() => onCancel(r)}
              className="shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive-fuerte transition-colors disabled:opacity-50"
            >
              {busyId === r.id ? '...' : 'Cancelar'}
            </button>
          )}
        </div>
        )
      })}
    </div>
  )
}

export function PortalPage() {
  const { profile, refresh, signOut } = useData()
  const { students, classes, reservations, payments, disciplines, occurrences, settings, memberships } =
    useStudio()

  // Con RLS, el cliente solo recibe su propia ficha
  const me = students.find((s) => s.userId === profile?.id) ?? students[0] ?? null

  const [weekOffset, setWeekOffset] = useState(0)
  const [day, setDay] = useState(Math.min((new Date().getDay() + 6) % 7, 5))
  const [occupancy, setOccupancy] = useState<Map<string, Occupancy>>(new Map())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [showChangePassword, setShowChangePassword] = useState(false)

  const weekStart = addDays(mondayOf(), weekOffset * 7)

  // El ahora del estudio, y se refresca solo. Leerlo una vez por render
  // alcanzaba mientras la comparación era por fecha; ahora que también es
  // por hora, no: el portal queda abierto en el teléfono, y si el reloj
  // se congela en el primer render, la clase de las 8:00 sigue con su
  // botón de reservar a las 8:30 para quien entró a las 7:50.
  const [ahora, setAhora] = useState(ahoraDelEstudio)
  useEffect(() => {
    const t = setInterval(() => setAhora(ahoraDelEstudio()), 30_000)
    return () => clearInterval(t)
  }, [])
  const today = ahora.fecha

  // Cuánto antes del inicio se cierra la reserva. Cero —el default de la
  // 0038— cierra justo al empezar; el estudio puede pedir margen sin que
  // haya que tocar código. Si la migración todavía no corrió, la clave no
  // existe y el fallback deja el mismo cero.
  const minutosDeCorte = settingNum(settings, 'booking_cutoff_minutes', 0)

  useEffect(() => {
    fetchWeekOccupancy(weekStart).then(setOccupancy)
  }, [weekStart, reservations])

  const ms = me?.membership
  const classesLeft = ms ? ms.classesTotal - ms.classesUsed : 0
  const canBook = !!ms && (ms.status === 'activa' || ms.status === 'por vencer') && classesLeft > 0

  // Las fechas que el estudio suspendió, con su motivo, para las clases
  // que le importan a este cliente.
  const suspendidas = useMemo(
    () =>
      new Map(
        occurrences
          .filter((o) => o.status === 'suspendida')
          .map((o) => [`${o.classId}|${o.date}`, o.reason ?? ''])
      ),
    [occurrences]
  )

  const myUpcoming = useMemo(
    () =>
      reservations
        .filter(
          (r) =>
            r.studentId === me?.id &&
            r.date >= today &&
            (r.status === 'confirmada' || r.status === 'lista de espera')
        )
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
    [reservations, me, today]
  )

  const misPagos = useMemo(
    () => payments.filter((p) => p.studentId === me?.id),
    [payments, me]
  )
  // La deuda se calcula sobre TODOS sus pagos y el corte es solo para
  // mostrar. Al revés —cortar en ocho y después filtrar— el cliente con
  // nueve pagos dejaba de ver que debía, y cuanto más antigua la deuda,
  // antes desaparecía: justo la que hay que cobrar.
  const myDebts = misPagos.filter(
    (p) => (p.status === 'pendiente' || p.status === 'vencido') && !esOferta(p)
  )
  // Una oferta cuya renovación ya se resolvió por otro camino —el mostrador
  // le asignó el período, o le cambió el plan— no se le ofrece: pagarla no
  // crea nada, porque `renovar_por_pago` (0041) corta con este mismo
  // predicado (`nueva.start_date > vieja.end_date`) y solo le deja una nota
  // al pago. La oferta vive hasta que el proceso diario la anula, y en esa
  // ventana el botón de pagar online le cobraría un mes que ya tiene, que
  // además viene con su propia cuota. Sin membresías a la vista —o sin la
  // 0041— nunca da true y el bloque se comporta como si esto no estuviera.
  const misMembresias = useMemo(
    () => memberships.filter((m) => m.studentId === me?.id),
    [memberships, me]
  )
  const yaResuelta = (renuevaId?: string | null) => {
    const vieja = misMembresias.find((m) => m.id === renuevaId)
    return !!vieja && misMembresias.some((m) => m.startDate > vieja.endDate)
  }
  // La renovación que el estudio le ofreció (0041) sale del bloque de
  // deudas y tiene el suyo: no es plata que deba, es el mes que viene, que
  // todavía no compró. Y como la cuota se emite antes de que venza la
  // membresía, dejarla ahí le reclamaba un pago pendiente a toda clienta
  // que está al día.
  const misRenovaciones = misPagos.filter((p) => esOferta(p) && !yaResuelta(p.renuevaMembresiaId))
  /** Alguna oferta todavía dentro de su plazo: es la que se puede tomar. */
  const renovacionATiempo = misRenovaciones.some((p) => p.dueDate >= today)
  const myPayments = misPagos.slice(0, 8)

  const dayClasses = useMemo(() => {
    const date = addDays(weekStart, day)
    return classes
      .filter((c) => c.dayOfWeek === day)
      // Un taller solo aparece el día que se dicta (migración 0017)
      .filter((c) => c.kind !== 'especial' || c.date === date)
      .map((c) => {
        const occ = occupancy.get(`${c.id}|${date}`) ?? { confirmed: 0, waitlist: 0 }
        const mine = reservations.find(
          (r) => r.studentId === me?.id && r.classId === c.id && r.date === date && r.status !== 'cancelada'
        )
        // Excepción de ese día: suspensión, reemplazo o cambio de horario
        // (migración 0018).
        const exc = occurrences.find((o) => o.classId === c.id && o.date === date)
        return {
          ...c,
          date,
          occ,
          mine,
          time: exc?.startTime ?? c.time,
          capacity: exc?.capacity ?? c.capacity,
          teacherName: exc?.teacherId ? exc.teacherName : c.teacherName,
          suspended: exc?.status === 'suspendida',
          suspendedReason: exc?.reason ?? '',
        }
      })
      .sort((a, b) => a.time.localeCompare(b.time))
  }, [classes, occupancy, occurrences, reservations, me, weekStart, day])

  const flash = (type: 'ok' | 'error', text: string) => {
    setNotice({ type, text })
    setTimeout(() => setNotice(null), 3500)
  }

  const book = async (classId: string, date: string, waitlist: boolean) => {
    if (!me) return
    setBusyId(classId)
    try {
      await createReservation(me.id, classId, date, waitlist ? 'lista de espera' : 'confirmada')
      await refresh()
      flash('ok', waitlist ? 'Quedaste en lista de espera' : '¡Reserva confirmada!')
    } catch (err) {
      flash('error', err instanceof Error ? err.message : 'No se pudo reservar')
    } finally {
      setBusyId(null)
    }
  }

  const cancel = async (r: Reservation) => {
    if (!window.confirm(`¿Cancelar tu reserva de ${r.className} del ${pretty(r.date)}?`)) return
    setBusyId(r.id)
    try {
      await updateReservationStatus(r.id, 'cancelada')
      await refresh()
      flash('ok', 'Reserva cancelada')
    } catch (err) {
      flash('error', err instanceof Error ? err.message : 'No se pudo cancelar')
    } finally {
      setBusyId(null)
    }
  }

  if (!me) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center gap-3">
        <XCircle className="w-10 h-10 text-muted-foreground opacity-40" />
        <p className="text-sm font-semibold text-foreground">Tu cuenta no está vinculada a una ficha de cliente</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Pedile a recepción que te genere el acceso desde tu ficha. Si ya lo hicieron, probá salir y volver a entrar.
        </p>
        <button
          onClick={() => signOut()}
          className="mt-2 px-5 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted"
        >
          Cerrar sesión
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shrink-0">
            <span className="text-primary-foreground font-serif font-bold text-base">{settingText(settings, 'studio_name', 'Casa Fe').trim().charAt(0)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">¡Hola, {me.name.split(' ')[0]}!</p>
            <p className="text-[10px] text-muted-foreground">{settingText(settings, 'studio_name', 'Casa Fe')}</p>
          </div>
          {/* La campana, con el mismo componente que usa el mostrador. No
              lleva `onNavigate` a propósito: sus destinos son pantallas del
              sistema que el portal no tiene, y acá el aviso se lee y se
              cierra. Lo que sí trae es el interruptor de notificaciones en el
              celular, que vive adentro de la campana — y es la razón por la
              que se monta esto y no una lista aparte.

              Qué avisos ve: los que la política de la 0007 le deja leer, o
              sea los suyos con `audience = 'alumno'`. El aislamiento no
              depende de este componente ni de un filtro en la consulta: lo
              decide la base. */}
          <NotificationsBell />
          <button
            onClick={() => setShowChangePassword(true)}
            aria-label="Cambiar contraseña"
            title="Cambiar contraseña"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <KeyRound className="w-4 h-4" />
          </button>
          <button
            onClick={() => signOut()}
            aria-label="Cerrar sesión"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {showChangePassword && (
        <ChangePasswordModal
          onClose={() => setShowChangePassword(false)}
          onDone={() => {
            setShowChangePassword(false)
            flash('ok', 'Contraseña actualizada')
          }}
        />
      )}

      <main className="max-w-lg mx-auto px-4 py-5 space-y-6 pb-16">
        {notice && (
          <div
            className={cn(
              'fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg',
              notice.type === 'ok' ? 'bg-exito-fuerte text-white' : 'bg-destructive text-white'
            )}
          >
            {notice.text}
          </div>
        )}

        <MembershipCard student={me} />

        {/* La renovación, como una invitación y no como un reclamo. Va
            pegada a la tarjeta del plan porque es su continuación: arriba
            dice cuándo vence, acá cómo sigue. */}
        {misRenovaciones.length > 0 && (
          <div className="bg-info-suave border border-info/40 rounded-2xl p-4">
            <p className="text-xs font-bold text-info-fuerte mb-2 flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
              {/* Con el plazo cumplido ya no se le puede decir "ya podés":
                  la oferta está por anularse y de acá en adelante lo
                  resuelve el mostrador. */}
              {!renovacionATiempo
                ? 'El plazo para renovar venció'
                : misRenovaciones.length === 1
                ? 'Ya podés renovar tu plan'
                : 'Ya podés renovar tus planes'}
            </p>
            {misRenovaciones.map((p) => {
              // Pasado el plazo no se le ofrece pagar sola: el estudio
              // decide con qué horarios sigue, así que la manda a
              // recepción. El sistema la anula sola ese mismo día.
              const aTiempo = p.dueDate >= today
              return (
                <div key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-info-fuerte truncate">{p.planName}</p>
                    {/* "No perder la prioridad" y no "conservar tus días y
                        horarios": el turno fijo no existe en el sistema
                        —una reserva es una fila por clase y fecha, no un
                        derecho recurrente— así que el lugar no se le puede
                        prometer. La prioridad sí es del estudio, y es la
                        palabra que usó. */}
                    <p className="text-[10px] text-info-fuerte">
                      {aTiempo
                        ? `Tenés hasta el ${pretty(p.dueDate)} para renovar y no perder la prioridad en tus días y horarios`
                        : `El plazo para renovar venció el ${pretty(p.dueDate)}: consultá en recepción`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-bold text-info-fuerte">
                      ${p.amount.toLocaleString('es-AR')}
                    </span>
                    {p.mpLink && aTiempo && (
                      <a
                        href={p.mpLink}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-[#009EE3] text-white text-[11px] font-bold hover:opacity-90"
                      >
                        Renovar online
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
            {/* Lo que pasa al pagar, dicho sin prometer de más: la fecha de
                arranque la decide el trigger de la 0036/0037 según cuándo
                entró el pago, así que esto solo vale para el caso de pagar
                a tiempo. Vencido el plazo, la línea desaparece y lo que
                queda dicho es que consulte en recepción. */}
            {renovacionATiempo && (
              <>
                <p className="text-[10px] text-info-fuerte mt-1">
                  Si renovás antes de que venza el plan que estás usando, el período nuevo arranca
                  recién cuando ese termina.
                </p>
                {!misRenovaciones.some((p) => p.mpLink) && (
                  <p className="text-[10px] text-info-fuerte mt-1">
                    Podés renovar en recepción o pedir el link de pago por WhatsApp.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* Deudas destacadas */}
        {myDebts.length > 0 && (
          <div className="bg-aviso-suave border border-aviso/40 rounded-2xl p-4">
            <p className="text-xs font-bold text-aviso-fuerte mb-2 flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5" />
              Tenés {myDebts.length} pago{myDebts.length !== 1 ? 's' : ''} pendiente{myDebts.length !== 1 ? 's' : ''}
            </p>
            {myDebts.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-aviso-fuerte truncate">{p.planName}</p>
                  <p className="text-[10px] text-aviso-fuerte">Vence {pretty(p.dueDate)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-bold text-aviso-fuerte">
                    ${p.amount.toLocaleString('es-AR')}
                  </span>
                  {p.mpLink && (
                    <a
                      href={p.mpLink}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-[#009EE3] text-white text-[11px] font-bold hover:opacity-90"
                    >
                      Pagar online
                    </a>
                  )}
                </div>
              </div>
            ))}
            {!myDebts.some((p) => p.mpLink) && (
              <p className="text-[10px] text-aviso-fuerte mt-1">
                Podés abonar en recepción o pedir el link de pago por WhatsApp.
              </p>
            )}
          </div>
        )}

        {/* Próximas clases */}
        <section>
          <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-primary-fuerte" />
            Tus próximas clases
          </h2>
          <UpcomingList reservations={myUpcoming} suspendidas={suspendidas} onCancel={cancel} busyId={busyId} />
        </section>

        {/* Reservar */}
        <section>
          <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary-fuerte" />
            Reservar una clase
          </h2>

          {!canBook && (
            <div className="bg-muted rounded-2xl px-4 py-3 mb-3">
              <p className="text-xs text-muted-foreground">
                {/* La rama de 'futura' va antes que la de las clases: a quien
                    pagó adelantado no se le puede decir que está vencida ni
                    que gastó un plan que todavía no empezó. */}
                {!ms
                  ? 'Necesitás una membresía activa para reservar.'
                  : ms.status === 'futura'
                  ? `Tu plan arranca el ${pretty(ms.startDate)}: desde ese día podés reservar. Para una clase de antes, consultá en recepción.`
                  : classesLeft === 0
                  ? 'Usaste todas las clases de tu plan. Consultá en recepción para renovar.'
                  : 'Tu membresía está vencida o suspendida. Consultá en recepción.'}
              </p>
            </div>
          )}

          {/* Navegación de semana */}
          <div className="flex items-center justify-between mb-2.5">
            <button
              onClick={() => setWeekOffset((w) => Math.max(0, w - 1))}
              disabled={weekOffset === 0}
              aria-label="Semana anterior"
              className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <p className="text-xs font-semibold text-foreground">
              Semana del {pretty(weekStart)} al {pretty(addDays(weekStart, 5))}
            </p>
            <button
              onClick={() => setWeekOffset((w) => w + 1)}
              aria-label="Semana siguiente"
              className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Días */}
          <div className="grid grid-cols-6 gap-1.5 mb-3">
            {DAYS_SHORT.map((d, i) => {
              const date = addDays(weekStart, i)
              const isPast = date < today
              return (
                <button
                  key={d}
                  onClick={() => setDay(i)}
                  disabled={isPast}
                  className={cn(
                    'py-2 rounded-xl text-center transition-all',
                    day === i
                      ? 'bg-primary text-primary-foreground shadow-md'
                      : isPast
                      // Deshabilitado, no invisible: a /40 el número del
                      // día quedaba en 1,79:1 y no se leía la fecha.
                      ? 'bg-muted/50 text-muted-foreground/70'
                      : 'bg-card border border-border text-foreground hover:border-primary/40'
                  )}
                >
                  <p className="text-[10px] font-semibold">{d}</p>
                  <p className="text-xs font-bold">{date.slice(8, 10)}</p>
                </button>
              )
            })}
          </div>

          {/* Clases del día */}
          <div className="space-y-2">
            {dayClasses.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">Sin clases este día.</p>
            )}
            {dayClasses.map((c) => {
              // Por fecha Y HORA. `c.time` ya es el horario efectivo de
              // ese día, con el cambio de la instancia aplicado (0018):
              // si la clase se corrió a la tarde, la reserva cierra a la
              // tarde.
              const isPast = reservaCerrada(c.date, c.time, ahora, minutosDeCorte)
              const isFull = c.occ.confirmed >= c.capacity
              const spotsLeft = Math.max(0, c.capacity - c.occ.confirmed)
              return (
                <div
                  key={c.id}
                  className={cn(
                    'bg-card rounded-2xl border border-border px-4 py-3 flex items-center gap-3',
                    (isPast || c.suspended) && 'opacity-60'
                  )}
                >
                  <div className="w-12 shrink-0 text-center">
                    <p className="text-sm font-bold text-foreground">{c.time}</p>
                    <p className="text-[9px] text-muted-foreground">{c.durationMinutes}min</p>
                  </div>
                  <div
                    className="w-1 self-stretch rounded-full shrink-0"
                    style={{ backgroundColor: disciplineStyle(disciplines, c.discipline).dot }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{c.title}</p>
                    <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                      {c.teacherName} · <MapPin className="w-2.5 h-2.5 inline" /> {c.room}
                    </p>
                    <p className={cn('text-[10px] font-medium', isFull ? 'text-destructive-fuerte' : 'text-exito-fuerte')}>
                      {isFull
                        ? `Completa${c.occ.waitlist > 0 ? ` · ${c.occ.waitlist} en espera` : ''}`
                        : `${spotsLeft} lugar${spotsLeft !== 1 ? 'es' : ''} libre${spotsLeft !== 1 ? 's' : ''}`}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {c.mine ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-exito-fuerte">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {c.mine.status === 'lista de espera' ? 'En espera' : 'Reservada'}
                      </span>
                    ) : c.suspended ? (
                      <span className="text-[10px] font-semibold text-muted-foreground text-right leading-tight block max-w-[92px]">
                        Suspendida
                        {c.suspendedReason ? `: ${c.suspendedReason}` : ''}
                      </span>
                    ) : isPast ? (
                      // Antes acá no iba nada, y con la comparación por
                      // fecha daba igual: un día pasado no se puede
                      // abrir. Pero hoy la lista mezcla clases que ya
                      // pasaron con las que faltan, y un renglón sin
                      // botón, sin explicación, se lee como un error.
                      c.date === today ? (
                        <span className="text-[10px] font-semibold text-muted-foreground text-right leading-tight block max-w-[92px]">
                          {reservaCerrada(c.date, c.time, ahora) ? 'Ya empezó' : 'Cerró la reserva'}
                        </span>
                      ) : null
                    ) : !canBook ? null : !c.bookable ? (
                      <span className="text-[10px] font-semibold text-muted-foreground text-right leading-tight block max-w-[92px]">
                        Reservás en recepción
                      </span>
                    ) : busyId === c.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-primary-fuerte" />
                    ) : isFull ? (
                      <button
                        onClick={() => book(c.id, c.date, true)}
                        className="px-3 py-1.5 rounded-lg bg-aviso-suave text-aviso-fuerte text-[11px] font-bold hover:bg-aviso/30 transition-colors"
                      >
                        Lista de espera
                      </button>
                    ) : (
                      <button
                        onClick={() => book(c.id, c.date, false)}
                        className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-bold hover:opacity-90 transition-opacity"
                      >
                        Reservar
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Historial de pagos */}
        <section>
          <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-primary-fuerte" />
            Tus pagos
          </h2>
          {myPayments.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Sin pagos registrados.</p>
          ) : (
            <div className="bg-card rounded-2xl border border-border divide-y divide-border">
              {myPayments.map((p) => {
                const oferta = esOferta(p)
                const anulada = p.status === 'anulado'
                // La oferta que no se tomó termina anulada, y así llega
                // acá. Sin esta rama caía en el "Vence ..." de abajo con
                // el monto en negrita: a la clienta le quedaba un cargo
                // pendiente en pantalla por un mes que no compró y que el
                // sistema ya dio por no vendido. Se pregunta por la
                // columna —`esOferta` descarta las anuladas— y se exige
                // que nunca se haya cobrado, porque una renovación
                // cobrada y anulada después es otra cosa.
                const ofertaCaducada = anulada && !!p.renuevaMembresiaId && !p.date
                return (
                <div key={p.id} className="px-4 py-3 flex items-center gap-3">
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
                    <p className="text-xs font-semibold text-foreground truncate">{p.planName}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {p.status === 'pagado'
                        ? `Pagado el ${pretty(p.date)}${p.receiptNumber ? ` · Comp. ${String(p.receiptNumber).padStart(6, '0')}` : ''}`
                        : ofertaCaducada
                        ? `Renovación no tomada · venció el ${pretty(p.dueDate)}`
                        : anulada
                        ? 'Anulado'
                        : oferta
                        ? p.dueDate >= today
                          ? `Renovación · hasta el ${pretty(p.dueDate)}`
                          : `Renovación · el plazo venció el ${pretty(p.dueDate)}`
                        : `Vence ${pretty(p.dueDate)}`}
                    </p>
                  </div>
                  <p
                    className={cn(
                      'text-sm font-bold shrink-0',
                      anulada ? 'text-muted-foreground line-through' : 'text-foreground'
                    )}
                  >
                    ${p.amount.toLocaleString('es-AR')}
                  </p>
                </div>
                )
              })}
            </div>
          )}
        </section>

        <p className="text-center text-[10px] text-muted-foreground pt-2">
          ¿Dudas? Escribinos por WhatsApp o consultá en recepción.
        </p>
      </main>
    </div>
  )
}
