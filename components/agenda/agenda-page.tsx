'use client'

import { useMemo, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Users,
  Clock,
  X,
  MapPin,
  User,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Sparkles,
  UserCheck,
  CalendarOff,
  ClipboardCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useData, useStudio } from '@/lib/data-context'
import { disciplineStyle } from '@/lib/disciplines'
import { TomarAsistencia } from '@/components/asistencia/tomar-asistencia'
import {
  addDays,
  mondayOf,
  createReservation,
  clearClassDate,
  localISO,
  createClassSession,
  setClassDateTeacher,
  suspendClassDate,
  updateClassSession,
  deactivateClassSession,
  type ClassInput,
} from '@/lib/api'
import type { ClassSession, Discipline } from '@/lib/types'

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const DAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']


/** Clase con cupos calculados para una semana determinada. */
type WeekClass = ClassSession & {
  date: string
  /** Ese día no se dicta (migración 0018) */
  suspended?: boolean
  /** Ese día la da otra profesora */
  substitute?: boolean
  /** La profesora de siempre, para saber a quién se vuelve */
  titularName?: string
  occurrenceReason?: string
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTH_NAMES[m - 1].slice(0, 3)}`
}

function ClassCard({ cls, onClick }: { cls: WeekClass; onClick: () => void }) {
  const { disciplines } = useStudio()
  const colors = disciplineStyle(disciplines, cls.discipline)
  const isFull = cls.enrolled >= cls.capacity
  const pct = (cls.enrolled / cls.capacity) * 100

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-xl p-2.5 mb-1.5 border transition-all hover:shadow-md hover:-translate-y-0.5 group',
        'border-transparent hover:border-current/20'
      )}
      style={{
        backgroundColor: cls.suspended ? undefined : colors.bg,
        borderLeftColor: cls.suspended ? '#9CA3AF' : colors.dot,
        borderLeftWidth: '3px',
      }}
    >
      <div className="flex items-start justify-between gap-1 mb-1">
        <p
          className={cn(
            'text-xs font-semibold leading-tight line-clamp-2',
            cls.suspended && 'line-through'
          )}
          style={{ color: cls.suspended ? '#6B7280' : colors.text }}
        >
          {cls.kind === 'especial' && <Sparkles className="w-3 h-3 inline-block mr-1 -mt-0.5" />}
          {cls.substitute && <UserCheck className="w-3 h-3 inline-block mr-1 -mt-0.5" />}
          {cls.title}
        </p>
        {isFull && (
          <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive">
            LLENA
          </span>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground mb-1.5 truncate">
        {cls.time} · {cls.teacherName}
      </p>
      {/* Occupancy bar */}
      <div className="flex items-center gap-1.5">
        <div className="flex-1 h-1 rounded-full bg-black/10 overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(pct, 100)}%`,
              backgroundColor: pct >= 100 ? '#EF4444' : pct >= 80 ? '#F59E0B' : colors.dot,
            }}
          />
        </div>
        <span className="text-[10px] font-medium" style={{ color: colors.dot }}>
          {cls.enrolled}/{cls.capacity}
        </span>
      </div>
      {cls.waitlist > 0 && (
        <p className="text-[9px] text-amber-600 mt-0.5">+{cls.waitlist} en espera</p>
      )}
    </button>
  )
}

function ClassFormModal({ cls, onClose }: { cls?: ClassSession; onClose: () => void }) {
  const { refresh } = useData()
  const { teachers, rooms, disciplines } = useStudio()
  const isEdit = !!cls

  const [title, setTitle] = useState(cls?.title ?? '')
  const [discipline, setDiscipline] = useState<Discipline>(cls?.discipline ?? 'Pilates Mat')
  const [teacherId, setTeacherId] = useState(cls?.teacherId ?? '')
  const [dayOfWeek, setDayOfWeek] = useState(cls?.dayOfWeek ?? 0)
  const [startTime, setStartTime] = useState(cls?.time ?? '09:00')
  const [duration, setDuration] = useState(String(cls?.durationMinutes ?? 55))
  const [capacity, setCapacity] = useState(String(cls?.capacity ?? 10))
  const [room, setRoom] = useState(cls?.room ?? (rooms[0]?.name ?? ''))
  const [kind, setKind] = useState<'regular' | 'especial'>(cls?.kind ?? 'regular')
  const [date, setDate] = useState(cls?.date ?? '')
  const [description, setDescription] = useState(cls?.description ?? '')
  const [level, setLevel] = useState(cls?.level ?? '')
  const [price, setPrice] = useState(cls?.price != null ? String(cls.price) : '')
  const [requirements, setRequirements] = useState(cls?.requirements ?? '')
  const [bookable, setBookable] = useState(cls?.bookable ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inputClass =
    'w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors'
  const labelClass =
    'text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!teacherId) {
      setError('Seleccioná profesor/a')
      return
    }
    if (kind === 'especial' && !date) {
      setError('Una clase especial necesita su fecha')
      return
    }
    setSaving(true)
    setError(null)
    // En una especial el día de la semana se deriva de la fecha, así la
    // grilla la ubica igual que a cualquier otra.
    const diaDeLaFecha = (iso: string) => {
      const [y, m, d] = iso.split('-').map(Number)
      return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
    }

    const input: ClassInput = {
      title,
      discipline,
      teacherId,
      dayOfWeek: kind === 'especial' ? diaDeLaFecha(date) : dayOfWeek,
      startTime,
      durationMinutes: Number(duration) || 55,
      capacity: Number(capacity) || 10,
      room,
      color: disciplineStyle(disciplines, discipline).dot,
      kind,
      date: kind === 'especial' ? date : null,
      description,
      level,
      price: price.trim() === '' ? null : Number(price),
      requirements,
      bookable,
    }
    try {
      if (isEdit) await updateClassSession(cls.id, input)
      else await createClassSession(input)
      await refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la clase')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-card rounded-2xl shadow-2xl w-full max-w-md border border-border overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-bold text-foreground">{isEdit ? 'Editar clase' : 'Nueva clase'}</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          <div>
            <label className={labelClass}>Tipo de clase</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { k: 'regular', t: 'Regular', s: 'Se repite todas las semanas' },
                { k: 'especial', t: 'Especial', s: 'Taller o evento, con su fecha' },
              ] as const).map((o) => (
                <button
                  key={o.k}
                  type="button"
                  onClick={() => setKind(o.k)}
                  className={cn(
                    'rounded-xl border px-3 py-2 text-left transition-colors',
                    kind === o.k
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/40'
                  )}
                >
                  <span className="block text-sm font-semibold text-foreground">{o.t}</span>
                  <span className="block text-[11px] text-muted-foreground leading-tight mt-0.5">
                    {o.s}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelClass}>Nombre de la clase *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Ej: Reformer Intermedio" className={inputClass} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Disciplina</label>
              <select value={discipline} onChange={(e) => setDiscipline(e.target.value as Discipline)} className={inputClass}>
                {disciplines.map((d) => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Profesor/a *</label>
              <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} required className={inputClass}>
                <option value="">Seleccionar...</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              {kind === 'especial' ? (
                <>
                  <label className={labelClass}>Fecha *</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    className={inputClass}
                  />
                </>
              ) : (
                <>
                  <label className={labelClass}>Día</label>
                  <select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))} className={inputClass}>
                    {DAYS.map((d, i) => (
                      <option key={d} value={i}>{d}</option>
                    ))}
                  </select>
                </>
              )}
            </div>
            <div>
              <label className={labelClass}>Hora de inicio</label>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Duración (min)</label>
              <input type="number" min="15" step="5" value={duration} onChange={(e) => setDuration(e.target.value)} required className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Cupo máximo</label>
              <input type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} required className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Sala</label>
            {rooms.length > 0 ? (
              <select value={room} onChange={(e) => setRoom(e.target.value)} className={inputClass}>
                {!rooms.some((r) => r.name === room) && room && <option value={room}>{room}</option>}
                {rooms.map((r) => (
                  <option key={r.id} value={r.name}>{r.name}</option>
                ))}
              </select>
            ) : (
              <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Ej: Sala 1" className={inputClass} />
            )}
          </div>

          <div>
            <label className={labelClass}>Descripción</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="De qué se trata. Se muestra en la web y en el portal."
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Nivel o público</label>
              <input
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                placeholder="Ej: Embarazadas"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Precio</label>
              <input
                type="number"
                min="0"
                step="100"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Incluida en el plan"
                className={inputClass}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Vacío = la cubre la membresía
              </p>
            </div>
          </div>

          <div>
            <label className={labelClass}>Requisitos</label>
            <input
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              placeholder="Ej: traer toalla y media antideslizante"
              className={inputClass}
            />
          </div>

          <button
            type="button"
            onClick={() => setBookable(!bookable)}
            className="flex items-start gap-3 w-full text-left"
          >
            <span
              className={cn(
                'w-10 h-6 rounded-full transition-colors relative shrink-0 mt-0.5',
                bookable ? 'bg-primary' : 'bg-muted'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
                  bookable ? 'translate-x-[18px]' : 'translate-x-0.5'
                )}
              />
            </span>
            <span>
              <span className="block text-sm font-medium text-foreground">
                La alumna puede reservarla sola
              </span>
              <span className="block text-[11px] text-muted-foreground leading-tight">
                Apagado: se muestra en la agenda, pero el lugar lo asigna recepción
              </span>
            </span>
          </button>

          {error && <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">{error}</p>}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-border shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? 'Guardar cambios' : 'Crear clase'}
          </button>
        </div>
      </form>
    </div>
  )
}

function ClassDetailModal({
  cls,
  onClose,
  onEdit,
}: {
  cls: WeekClass
  onClose: () => void
  onEdit: (cls: ClassSession) => void
}) {
  const { refresh, canWrite, can } = useData()
  const { students, disciplines, teachers } = useStudio()
  const colors = disciplineStyle(disciplines, cls.discipline)
  const isFull = cls.enrolled >= cls.capacity
  const [dayBusy, setDayBusy] = useState(false)
  const [dayError, setDayError] = useState<string | null>(null)
  const [tomandoAsistencia, setTomandoAsistencia] = useState(false)
  // La profesora puede tomar asistencia sin poder editar nada más.
  const puedeMarcarAsistencia = can('reservas.asistencia') || canWrite

  // Excepciones de esa fecha: suspender el día o cambiar la profesora
  // (migración 0018). Solo tocan ESE día, no la clase entera.
  const runDay = async (action: () => Promise<void>) => {
    setDayBusy(true)
    setDayError(null)
    try {
      await action()
      await refresh()
    } catch (err) {
      setDayError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setDayBusy(false)
    }
  }

  const suspender = () => {
    const motivo = window.prompt(
      'Motivo de la suspensión (lo va a ver la alumna):',
      cls.occurrenceReason || 'Feriado'
    )
    if (motivo === null) return
    runDay(() => suspendClassDate(cls.id, cls.date, motivo))
  }

  const reactivar = () => runDay(() => clearClassDate(cls.id, cls.date))

  const reemplazar = (teacherId: string) => {
    if (!teacherId) {
      runDay(() => clearClassDate(cls.id, cls.date))
      return
    }
    runDay(() => setClassDateTeacher(cls.id, cls.date, teacherId))
  }

  const pct = Math.round((cls.enrolled / cls.capacity) * 100)

  const [studentId, setStudentId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const reserve = async (waitlist: boolean) => {
    if (!studentId) {
      setError('Seleccioná un alumno primero')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createReservation(studentId, cls.id, cls.date, waitlist ? 'lista de espera' : 'confirmada')
      await refresh()
      setDone(waitlist ? 'Anotado en lista de espera' : 'Reserva confirmada')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la reserva')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm(`¿Eliminar "${cls.title}" de la grilla? El historial de reservas se conserva.`)) return
    setSaving(true)
    try {
      await deactivateClassSession(cls.id)
      await refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la clase')
      setSaving(false)
    }
  }

  if (tomandoAsistencia) {
    return (
      <TomarAsistencia
        classId={cls.id}
        date={cls.date}
        title={cls.title}
        time={cls.time}
        onClose={() => setTomandoAsistencia(false)}
      />
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-2xl shadow-2xl w-full max-w-sm border border-border max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-5 py-4 flex items-start justify-between"
          style={{ backgroundColor: `${colors.dot}18` }}
        >
          <div>
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full mb-2 inline-block"
              style={{ backgroundColor: colors.bg, color: colors.text }}
            >
              {cls.discipline}
            </span>
            {cls.kind === 'especial' && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full mb-2 ml-1.5 inline-flex items-center gap-1 bg-foreground/10 text-foreground">
                <Sparkles className="w-3 h-3" />
                Especial
              </span>
            )}
            <h3 className="text-base font-bold text-foreground">{cls.title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {shortDate(cls.date)}
              {cls.level && ` · ${cls.level}`}
            </p>
            {cls.description && (
              <p className="text-xs text-foreground/70 mt-1.5 max-w-xs">{cls.description}</p>
            )}
            {(cls.price != null || cls.requirements || !cls.bookable) && (
              <div className="mt-1.5 space-y-0.5">
                {cls.price != null && (
                  <p className="text-xs font-semibold text-foreground">
                    ${cls.price.toLocaleString('es-AR')} — se cobra aparte
                  </p>
                )}
                {cls.requirements && (
                  <p className="text-[11px] text-muted-foreground">Requisitos: {cls.requirements}</p>
                )}
                {!cls.bookable && (
                  <p className="text-[11px] text-muted-foreground">
                    La alumna no la reserva sola: el lugar lo asigna recepción
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            {canWrite && (
              <>
                <button
                  onClick={() => onEdit(cls)}
                  title="Editar clase"
                  className="w-7 h-7 rounded-full hover:bg-black/10 flex items-center justify-center text-muted-foreground"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleDelete}
                  title="Eliminar clase"
                  className="w-7 h-7 rounded-full hover:bg-destructive/15 flex items-center justify-center text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full hover:bg-black/10 flex items-center justify-center text-muted-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-[10px] text-muted-foreground">Horario</p>
                <p className="text-sm font-semibold text-foreground">
                  {cls.time} · {cls.durationMinutes}min
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-[10px] text-muted-foreground">Sala</p>
                <p className="text-sm font-semibold text-foreground">{cls.room}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-[10px] text-muted-foreground">Profesora/or</p>
              <p className="text-sm font-semibold text-foreground">{cls.teacherName}</p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-muted">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Ocupación</span>
              </div>
              <span className="text-xs font-bold text-foreground">
                {cls.enrolled}/{cls.capacity} ({pct}%)
              </span>
            </div>
            <div className="h-2 rounded-full bg-border overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(pct, 100)}%`,
                  backgroundColor: pct >= 100 ? '#EF4444' : pct >= 80 ? '#F59E0B' : colors.dot,
                }}
              />
            </div>
            {isFull && cls.waitlist > 0 && (
              <p className="text-xs text-amber-600 mt-1.5">
                {cls.waitlist} persona{cls.waitlist !== 1 ? 's' : ''} en lista de espera
              </p>
            )}
          </div>

          {/* Ese día en particular: suspender o cambiar la profesora */}
          {canWrite && (
            <div className="rounded-xl border border-border p-3 space-y-2.5">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                Solo para el {shortDate(cls.date)}
              </p>

              {cls.suspended ? (
                <div className="space-y-2">
                  <p className="text-xs text-foreground">
                    Suspendida
                    {cls.occurrenceReason && `: ${cls.occurrenceReason}`}
                  </p>
                  <button
                    disabled={dayBusy}
                    onClick={reactivar}
                    className="w-full py-2 rounded-xl border border-border text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    Volver a dictarla
                  </button>
                </div>
              ) : (
                <>
                  <select
                    value={cls.substitute ? teachers.find((t) => t.name === cls.teacherName)?.id ?? '' : ''}
                    disabled={dayBusy}
                    onChange={(e) => reemplazar(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-xs text-foreground outline-none focus:border-primary"
                  >
                    <option value="">
                      La da {cls.titularName ?? cls.teacherName} (como siempre)
                    </option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        Ese día la da {t.name}
                      </option>
                    ))}
                  </select>

                  <button
                    disabled={dayBusy}
                    onClick={suspender}
                    className="w-full py-2 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:text-destructive hover:border-destructive/40 disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <CalendarOff className="w-3.5 h-3.5" />
                    Suspender este día
                  </button>
                </>
              )}

              {cls.enrolled > 0 && (
                <p className="text-[11px] text-muted-foreground leading-tight">
                  Hay {cls.enrolled} {cls.enrolled === 1 ? 'reserva' : 'reservas'} para ese día. Suspender
                  no las cancela: avisales vos y decidí si les devolvés la clase.
                </p>
              )}

              {dayError && <p className="text-xs text-destructive">{dayError}</p>}
            </div>
          )}

          {puedeMarcarAsistencia && !cls.suspended && cls.enrolled > 0 && (
            <button
              onClick={() => setTomandoAsistencia(true)}
              className="w-full py-3 rounded-xl border-2 border-primary text-primary text-sm font-bold flex items-center justify-center gap-2 hover:bg-primary/5 transition-colors"
            >
              <ClipboardCheck className="w-4 h-4" />
              Tomar asistencia
            </button>
          )}

          {!canWrite ? null : cls.suspended ? (
            <p className="text-sm text-center font-semibold text-muted-foreground bg-muted rounded-xl px-3 py-3">
              Clase suspendida ese día
            </p>
          ) : done ? (
            <p className="text-sm text-center font-semibold text-[#2E6040] bg-[#E8F2EB] rounded-xl px-3 py-3">
              {done}
            </p>
          ) : (
            <>
              <select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:border-primary transition-colors"
              >
                <option value="">Alumno a reservar...</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              {error && (
                <p className="text-xs text-destructive bg-destructive/10 rounded-xl px-3 py-2">{error}</p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  disabled={isFull || saving}
                  onClick={() => reserve(false)}
                  className={cn(
                    'flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2',
                    isFull
                      ? 'bg-muted text-muted-foreground cursor-not-allowed'
                      : 'text-primary-foreground'
                  )}
                  style={!isFull ? { backgroundColor: colors.dot } : {}}
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isFull ? 'Clase completa' : 'Reservar lugar'}
                </button>
                {isFull && (
                  <button
                    disabled={saving}
                    onClick={() => reserve(true)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-amber-100 text-amber-700 transition-colors hover:bg-amber-200 flex items-center justify-center gap-2"
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    Lista de espera
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function AgendaPage() {
  const { canWrite } = useData()
  const { classes, reservations, disciplines, occurrences } = useStudio()
  const [selectedDisciplines, setSelectedDisciplines] = useState<Discipline[]>([])
  const [selectedClass, setSelectedClass] = useState<WeekClass | null>(null)

  const [weekOffset, setWeekOffset] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [editingClass, setEditingClass] = useState<ClassSession | undefined>(undefined)
  // Día visible en la vista mobile (0=Lun..5=Sáb); arranca en hoy, o lunes si es domingo
  const [mobileDay, setMobileDay] = useState(() => {
    const dow = (new Date().getDay() + 6) % 7
    return dow > 5 ? 0 : dow
  })

  const weekStart = addDays(mondayOf(), weekOffset * 7)
  const weekEnd = addDays(weekStart, 5)
  const today = localISO()

  // Cupos por clase para la semana visible
  const weekClasses: WeekClass[] = useMemo(() => {
    const weekLast = addDays(weekStart, 6)
    return classes
      // Una especial solo aparece en la semana de su fecha; las regulares,
      // todas las semanas (migración 0017).
      .filter((c) => c.kind !== 'especial' || (c.date >= weekStart && c.date <= weekLast))
      .map((c) => {
        const date = c.kind === 'especial' && c.date ? c.date : addDays(weekStart, c.dayOfWeek)
        const ofDay = reservations.filter((r) => r.classId === c.id && r.date === date)
        // Si ese día se aparta de la norma, manda la excepción (0018).
        const occ = occurrences.find((o) => o.classId === c.id && o.date === date)
        return {
          ...c,
          date,
          time: occ?.startTime ?? c.time,
          capacity: occ?.capacity ?? c.capacity,
          teacherName: occ?.teacherId ? occ.teacherName : c.teacherName,
          titularName: c.teacherName,
          suspended: occ?.status === 'suspendida',
          substitute: !!occ?.teacherId,
          occurrenceReason: occ?.reason ?? '',
          enrolled: ofDay.filter((r) => r.status === 'confirmada' || r.status === 'asistió').length,
          waitlist: ofDay.filter((r) => r.status === 'lista de espera').length,
        }
      })
  }, [classes, reservations, occurrences, weekStart])

  // El detalle se re-lee de la semana en cada render: si se suspende el día
  // o se cambia la profesora, el modal abierto muestra el cambio al toque
  // en vez de quedarse con la copia del momento en que se abrió.
  const detalle = selectedClass
    ? weekClasses.find((c) => c.id === selectedClass.id && c.date === selectedClass.date) ??
      selectedClass
    : null

  const toggleDiscipline = (d: Discipline) => {
    setSelectedDisciplines((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    )
  }

  const filtered =
    selectedDisciplines.length === 0
      ? weekClasses
      : weekClasses.filter((c) => selectedDisciplines.includes(c.discipline))

  const weekLabel = `Semana del ${shortDate(weekStart)} — ${shortDate(weekEnd)} ${weekStart.slice(0, 4)}`

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="px-4 md:px-6 py-4 border-b border-border bg-card flex items-center gap-3 flex-wrap">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Disciplinas:
        </span>
        <div className="flex flex-wrap gap-1.5">
          {disciplines.map((item) => {
            const d = item.name
            const colors = disciplineStyle(disciplines, d)
            const active = selectedDisciplines.includes(d)
            return (
              <button
                key={item.id}
                onClick={() => toggleDiscipline(d)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all border',
                  active
                    ? 'border-transparent'
                    : 'bg-muted text-muted-foreground border-border hover:border-primary/30'
                )}
                style={active ? { backgroundColor: colors.bg, color: colors.text } : undefined}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: colors.dot }}
                />
                {d}
              </button>
            )
          })}
          {selectedDisciplines.length > 0 && (
            <button
              onClick={() => setSelectedDisciplines([])}
              className="px-3 py-1 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Limpiar
            </button>
          )}
        </div>

        {canWrite && (
          <button
            onClick={() => {
              setEditingClass(undefined)
              setShowForm(true)
            }}
            className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nueva clase</span>
          </button>
        )}
      </div>

      {/* Week navigation */}
      <div className="px-4 md:px-6 py-3 border-b border-border flex items-center justify-between bg-card">
        <button
          onClick={() => setWeekOffset((w) => w - 1)}
          className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Semana anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-foreground">{weekLabel}</h2>
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="text-xs text-primary font-medium hover:underline"
            >
              Hoy
            </button>
          )}
        </div>
        <button
          onClick={() => setWeekOffset((w) => w + 1)}
          className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Semana siguiente"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Vista mobile: un día a la vez, sin paneo horizontal */}
      <div className="md:hidden flex-1 overflow-auto p-4 flex flex-col gap-3">
        <div className="grid grid-cols-6 gap-1.5">
          {DAYS_SHORT.map((day, i) => {
            const dayDate = addDays(weekStart, i)
            const isToday = dayDate === today
            const isSelected = mobileDay === i
            return (
              <button
                key={day}
                onClick={() => setMobileDay(i)}
                className={cn(
                  'flex flex-col items-center py-2 rounded-xl border text-xs font-semibold transition-colors',
                  isSelected
                    ? 'bg-primary text-primary-foreground border-primary'
                    : isToday
                    ? 'bg-card text-primary border-primary'
                    : 'bg-card text-muted-foreground border-border'
                )}
              >
                <span>{day}</span>
                <span className={cn('text-[10px] font-normal', isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                  {dayDate.slice(8, 10)}
                </span>
              </button>
            )
          })}
        </div>
        <div className="flex flex-col gap-0">
          {(() => {
            const dayCls = filtered
              .filter((c) => c.dayOfWeek === mobileDay)
              .sort((a, b) => a.time.localeCompare(b.time))
            if (dayCls.length === 0) {
              return (
                <div className="h-24 rounded-xl border border-dashed border-border flex items-center justify-center">
                  <span className="text-xs text-muted-foreground">Sin clases este día</span>
                </div>
              )
            }
            return dayCls.map((cls) => (
              <ClassCard key={cls.id} cls={cls} onClick={() => setSelectedClass(cls)} />
            ))
          })()}
        </div>
      </div>

      {/* Grid semanal (desktop) */}
      <div className="hidden md:block flex-1 overflow-auto p-4">
        <div className="grid grid-cols-6 gap-3 min-w-[720px]">
          {/* Day headers */}
          {DAYS.map((day, i) => {
            const dayCount = filtered.filter((c) => c.dayOfWeek === i).length
            const dayDate = addDays(weekStart, i)
            const isToday = dayDate === today
            return (
              <div
                key={day}
                className={cn(
                  'bg-card rounded-xl border p-3 mb-1',
                  isToday ? 'border-primary' : 'border-border'
                )}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-bold text-foreground hidden xl:block">{day}</span>
                  <span className="text-xs font-bold text-foreground xl:hidden">{DAYS_SHORT[i]}</span>
                  {dayCount > 0 && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                      {dayCount}
                    </span>
                  )}
                </div>
                <p className={cn('text-[10px]', isToday ? 'text-primary font-semibold' : 'text-muted-foreground')}>
                  {shortDate(dayDate)}
                </p>
              </div>
            )
          })}

          {/* Class cards per day */}
          {DAYS.map((_, dayIdx) => {
            const dayCls = filtered
              .filter((c) => c.dayOfWeek === dayIdx)
              .sort((a, b) => a.time.localeCompare(b.time))

            return (
              <div key={dayIdx} className="flex flex-col gap-0">
                {dayCls.length === 0 ? (
                  <div className="h-16 rounded-xl border border-dashed border-border flex items-center justify-center">
                    <span className="text-[10px] text-muted-foreground">Sin clases</span>
                  </div>
                ) : (
                  dayCls.map((cls) => (
                    <ClassCard key={cls.id} cls={cls} onClick={() => setSelectedClass(cls)} />
                  ))
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Summary row */}
      <div className="px-4 md:px-6 py-3 border-t border-border bg-card flex items-center gap-x-6 gap-y-1 text-xs text-muted-foreground flex-wrap">
        <span>
          <strong className="text-foreground">{filtered.length}</strong> clases esta semana
        </span>
        <span>
          <strong className="text-foreground">
            {filtered.reduce((a, c) => a + c.enrolled, 0)}
          </strong>{' '}
          reservas confirmadas
        </span>
        <span>
          <strong className="text-amber-600">
            {filtered.filter((c) => c.enrolled >= c.capacity).length}
          </strong>{' '}
          clases llenas
        </span>
        <span>
          <strong className="text-destructive">
            {filtered.reduce((a, c) => a + c.waitlist, 0)}
          </strong>{' '}
          en listas de espera
        </span>
      </div>

      {/* Class detail modal */}
      {detalle && (
        <ClassDetailModal
          cls={detalle}
          onClose={() => setSelectedClass(null)}
          onEdit={(cls) => {
            setSelectedClass(null)
            setEditingClass(cls)
            setShowForm(true)
          }}
        />
      )}

      {showForm && <ClassFormModal cls={editingClass} onClose={() => setShowForm(false)} />}
    </div>
  )
}
