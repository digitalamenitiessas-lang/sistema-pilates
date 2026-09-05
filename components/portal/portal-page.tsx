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
  X,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useData, useStudio } from '@/lib/data-context'
import { disciplineStyle } from '@/lib/disciplines'
import {
  addDays,
  mondayOf,
  localISO,
  createReservation,
  updateReservationStatus,
  fetchWeekOccupancy,
  type Occupancy,
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
            <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">{error}</p>
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
  const pct = Math.round((ms.classesUsed / ms.classesTotal) * 100)
  const statusCfg =
    ms.status === 'activa'
      ? { label: 'Activa', class: 'bg-[#E8F2EB] text-[#2E6040]' }
      : ms.status === 'por vencer'
      ? { label: 'Por vencer', class: 'bg-amber-100 text-amber-700' }
      : ms.status === 'vencida'
      ? { label: 'Vencida', class: 'bg-red-100 text-red-700' }
      : { label: 'Suspendida', class: 'bg-gray-100 text-gray-600' }

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
          Te quedan <strong className="text-primary">{left}</strong> clase{left !== 1 ? 's' : ''}
        </span>
        <span>Vence el {pretty(ms.endDate)}</span>
      </div>
    </div>
  )
}

function UpcomingList({
  reservations,
  onCancel,
  busyId,
}: {
  reservations: Reservation[]
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
      {reservations.map((r) => (
        <div key={r.id} className="bg-card rounded-2xl border border-border px-4 py-3 flex items-center gap-3">
          <div
            className="w-1 self-stretch rounded-full shrink-0"
            style={{ backgroundColor: disciplineStyle(disciplines, r.discipline).dot }}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{r.className}</p>
            <p className="text-xs text-muted-foreground">
              {pretty(r.date)} · {r.time} · {r.teacherName}
            </p>
          </div>
          {r.status === 'lista de espera' && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">
              En espera
            </span>
          )}
          <button
            disabled={busyId === r.id}
            onClick={() => onCancel(r)}
            className="shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50"
          >
            {busyId === r.id ? '...' : 'Cancelar'}
          </button>
        </div>
      ))}
    </div>
  )
}

export function PortalPage() {
  const { profile, refresh, signOut } = useData()
  const { students, classes, reservations, payments, disciplines } = useStudio()

  // Con RLS, el alumno solo recibe su propia ficha
  const me = students.find((s) => s.userId === profile?.id) ?? students[0] ?? null

  const [weekOffset, setWeekOffset] = useState(0)
  const [day, setDay] = useState(Math.min((new Date().getDay() + 6) % 7, 5))
  const [occupancy, setOccupancy] = useState<Map<string, Occupancy>>(new Map())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [showChangePassword, setShowChangePassword] = useState(false)

  const weekStart = addDays(mondayOf(), weekOffset * 7)
  const today = localISO()

  useEffect(() => {
    fetchWeekOccupancy(weekStart).then(setOccupancy)
  }, [weekStart, reservations])

  const ms = me?.membership
  const classesLeft = ms ? ms.classesTotal - ms.classesUsed : 0
  const canBook = !!ms && (ms.status === 'activa' || ms.status === 'por vencer') && classesLeft > 0

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

  const myPayments = useMemo(
    () => payments.filter((p) => p.studentId === me?.id).slice(0, 8),
    [payments, me]
  )
  const myDebts = myPayments.filter((p) => p.status === 'pendiente' || p.status === 'vencido')

  const dayClasses = useMemo(() => {
    const date = addDays(weekStart, day)
    return classes
      .filter((c) => c.dayOfWeek === day)
      .map((c) => {
        const occ = occupancy.get(`${c.id}|${date}`) ?? { confirmed: 0, waitlist: 0 }
        const mine = reservations.find(
          (r) => r.studentId === me?.id && r.classId === c.id && r.date === date && r.status !== 'cancelada'
        )
        return { ...c, date, occ, mine }
      })
      .sort((a, b) => a.time.localeCompare(b.time))
  }, [classes, occupancy, reservations, me, weekStart, day])

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
        <p className="text-sm font-semibold text-foreground">Tu cuenta no está vinculada a una ficha de alumno</p>
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
            <span className="text-primary-foreground font-serif font-bold text-base">P</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">¡Hola, {me.name.split(' ')[0]}!</p>
            <p className="text-[10px] text-muted-foreground">PilatesStudio</p>
          </div>
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
              notice.type === 'ok' ? 'bg-[#2E6040] text-white' : 'bg-destructive text-white'
            )}
          >
            {notice.text}
          </div>
        )}

        <MembershipCard student={me} />

        {/* Deudas destacadas */}
        {myDebts.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-xs font-bold text-amber-800 mb-2 flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5" />
              Tenés {myDebts.length} pago{myDebts.length !== 1 ? 's' : ''} pendiente{myDebts.length !== 1 ? 's' : ''}
            </p>
            {myDebts.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-amber-900 truncate">{p.planName}</p>
                  <p className="text-[10px] text-amber-700">Vence {pretty(p.dueDate)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-bold text-amber-900">
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
              <p className="text-[10px] text-amber-700 mt-1">
                Podés abonar en recepción o pedir el link de pago por WhatsApp.
              </p>
            )}
          </div>
        )}

        {/* Próximas clases */}
        <section>
          <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-primary" />
            Tus próximas clases
          </h2>
          <UpcomingList reservations={myUpcoming} onCancel={cancel} busyId={busyId} />
        </section>

        {/* Reservar */}
        <section>
          <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            Reservar una clase
          </h2>

          {!canBook && (
            <div className="bg-muted rounded-2xl px-4 py-3 mb-3">
              <p className="text-xs text-muted-foreground">
                {!ms
                  ? 'Necesitás una membresía activa para reservar.'
                  : classesLeft === 0
                  ? 'Usaste todas las clases de tu plan este mes. Consultá en recepción para renovar.'
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
                      ? 'bg-muted/50 text-muted-foreground/40'
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
              const isPast = c.date < today
              const isFull = c.occ.confirmed >= c.capacity
              const spotsLeft = Math.max(0, c.capacity - c.occ.confirmed)
              return (
                <div
                  key={c.id}
                  className={cn(
                    'bg-card rounded-2xl border border-border px-4 py-3 flex items-center gap-3',
                    isPast && 'opacity-50'
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
                    <p className={cn('text-[10px] font-medium', isFull ? 'text-destructive' : 'text-[#2E6040]')}>
                      {isFull
                        ? `Completa${c.occ.waitlist > 0 ? ` · ${c.occ.waitlist} en espera` : ''}`
                        : `${spotsLeft} lugar${spotsLeft !== 1 ? 'es' : ''} libre${spotsLeft !== 1 ? 's' : ''}`}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {c.mine ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-[#2E6040]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {c.mine.status === 'lista de espera' ? 'En espera' : 'Reservada'}
                      </span>
                    ) : isPast || !canBook ? null : busyId === c.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    ) : isFull ? (
                      <button
                        onClick={() => book(c.id, c.date, true)}
                        className="px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 text-[11px] font-bold hover:bg-amber-200 transition-colors"
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
            <CreditCard className="w-4 h-4 text-primary" />
            Tus pagos
          </h2>
          {myPayments.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Sin pagos registrados.</p>
          ) : (
            <div className="bg-card rounded-2xl border border-border divide-y divide-border">
              {myPayments.map((p) => (
                <div key={p.id} className="px-4 py-3 flex items-center gap-3">
                  <div
                    className={cn(
                      'w-2 h-2 rounded-full shrink-0',
                      p.status === 'pagado' && 'bg-accent',
                      p.status === 'pendiente' && 'bg-amber-500',
                      p.status === 'vencido' && 'bg-destructive'
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{p.planName}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {p.status === 'pagado'
                        ? `Pagado el ${pretty(p.date)}${p.receiptNumber ? ` · Comp. ${String(p.receiptNumber).padStart(6, '0')}` : ''}`
                        : `Vence ${pretty(p.dueDate)}`}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-foreground shrink-0">
                    ${p.amount.toLocaleString('es-AR')}
                  </p>
                </div>
              ))}
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
