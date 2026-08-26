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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useData, useStudio } from '@/lib/data-context'
import {
  addDays,
  mondayOf,
  createReservation,
  localISO,
  createClassSession,
  updateClassSession,
  deactivateClassSession,
  type ClassInput,
} from '@/lib/api'
import type { ClassSession, Discipline } from '@/lib/types'

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const DAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

const DISCIPLINE_COLORS: Record<Discipline, { bg: string; text: string; dot: string }> = {
  'Pilates Mat': { bg: 'bg-[#FDEEE8]', text: 'text-[#8B3A25]', dot: '#C4735A' },
  'Pilates Reformer': { bg: 'bg-[#E8F2EB]', text: 'text-[#2E6040]', dot: '#7D9B76' },
  'Pilates Clínico': { bg: 'bg-[#F0EAF5]', text: 'text-[#5A2F72]', dot: '#9B6E8E' },
  Yoga: { bg: 'bg-[#FDF5E6]', text: 'text-[#7A5A1A]', dot: '#D4A854' },
  Stretching: { bg: 'bg-[#E6EFF5]', text: 'text-[#1A4D6A]', dot: '#5E8FA8' },
  Funcional: { bg: 'bg-[#F5EDE0]', text: 'text-[#6A4A1A]', dot: '#B8956A' },
}

const ALL_DISCIPLINES: Discipline[] = [
  'Pilates Mat',
  'Pilates Reformer',
  'Pilates Clínico',
  'Yoga',
  'Stretching',
  'Funcional',
]

/** Clase con cupos calculados para una semana determinada. */
type WeekClass = ClassSession & { date: string }

function shortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTH_NAMES[m - 1].slice(0, 3)}`
}

function ClassCard({ cls, onClick }: { cls: WeekClass; onClick: () => void }) {
  const colors = DISCIPLINE_COLORS[cls.discipline]
  const isFull = cls.enrolled >= cls.capacity
  const pct = (cls.enrolled / cls.capacity) * 100

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-xl p-2.5 mb-1.5 border transition-all hover:shadow-md hover:-translate-y-0.5 group',
        colors.bg,
        'border-transparent hover:border-current/20'
      )}
      style={{ borderLeftColor: colors.dot, borderLeftWidth: '3px' }}
    >
      <div className="flex items-start justify-between gap-1 mb-1">
        <p className={cn('text-xs font-semibold leading-tight line-clamp-2', colors.text)}>
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
  const { teachers, rooms } = useStudio()
  const isEdit = !!cls

  const [title, setTitle] = useState(cls?.title ?? '')
  const [discipline, setDiscipline] = useState<Discipline>(cls?.discipline ?? 'Pilates Mat')
  const [teacherId, setTeacherId] = useState(cls?.teacherId ?? '')
  const [dayOfWeek, setDayOfWeek] = useState(cls?.dayOfWeek ?? 0)
  const [startTime, setStartTime] = useState(cls?.time ?? '09:00')
  const [duration, setDuration] = useState(String(cls?.durationMinutes ?? 55))
  const [capacity, setCapacity] = useState(String(cls?.capacity ?? 10))
  const [room, setRoom] = useState(cls?.room ?? (rooms[0]?.name ?? ''))
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
    setSaving(true)
    setError(null)
    const input: ClassInput = {
      title,
      discipline,
      teacherId,
      dayOfWeek,
      startTime,
      durationMinutes: Number(duration) || 55,
      capacity: Number(capacity) || 10,
      room,
      color: DISCIPLINE_COLORS[discipline].dot,
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
            <label className={labelClass}>Nombre de la clase *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Ej: Reformer Intermedio" className={inputClass} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Disciplina</label>
              <select value={discipline} onChange={(e) => setDiscipline(e.target.value as Discipline)} className={inputClass}>
                {ALL_DISCIPLINES.map((d) => (
                  <option key={d} value={d}>{d}</option>
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
              <label className={labelClass}>Día</label>
              <select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))} className={inputClass}>
                {DAYS.map((d, i) => (
                  <option key={d} value={i}>{d}</option>
                ))}
              </select>
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
  const { refresh, canWrite } = useData()
  const { students } = useStudio()
  const colors = DISCIPLINE_COLORS[cls.discipline]
  const isFull = cls.enrolled >= cls.capacity
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
              className={cn(
                'text-[10px] font-semibold px-2 py-0.5 rounded-full mb-2 inline-block',
                colors.bg,
                colors.text
              )}
            >
              {cls.discipline}
            </span>
            <h3 className="text-base font-bold text-foreground">{cls.title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{shortDate(cls.date)}</p>
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

          {!canWrite ? null : done ? (
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
  const { classes, reservations } = useStudio()
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
    return classes.map((c) => {
      const date = addDays(weekStart, c.dayOfWeek)
      const ofDay = reservations.filter((r) => r.classId === c.id && r.date === date)
      return {
        ...c,
        date,
        enrolled: ofDay.filter((r) => r.status === 'confirmada' || r.status === 'asistió').length,
        waitlist: ofDay.filter((r) => r.status === 'lista de espera').length,
      }
    })
  }, [classes, reservations, weekStart])

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
          {ALL_DISCIPLINES.map((d) => {
            const colors = DISCIPLINE_COLORS[d]
            const active = selectedDisciplines.includes(d)
            return (
              <button
                key={d}
                onClick={() => toggleDiscipline(d)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all border',
                  active
                    ? `${colors.bg} ${colors.text} border-transparent`
                    : 'bg-muted text-muted-foreground border-border hover:border-primary/30'
                )}
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
      {selectedClass && (
        <ClassDetailModal
          cls={selectedClass}
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
