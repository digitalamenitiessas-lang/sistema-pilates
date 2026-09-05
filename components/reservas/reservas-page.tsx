'use client'

import { useState } from 'react'
import {
  CalendarDays,
  Check,
  X,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  Filter,
  UserCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useData, useStudio } from '@/lib/data-context'
import { disciplineStyle } from '@/lib/disciplines'
import { markAttendance, updateReservationStatus } from '@/lib/api'
import type { Reservation, ReservationStatus } from '@/lib/types'

const STATUS_CONFIG: Record<
  ReservationStatus,
  { label: string; bg: string; text: string; icon: React.ComponentType<{ className?: string }> }
> = {
  confirmada: { label: 'Confirmada', bg: 'bg-primary/10', text: 'text-primary', icon: Check },
  cancelada: { label: 'Cancelada', bg: 'bg-gray-100', text: 'text-gray-500', icon: X },
  'lista de espera': { label: 'Lista de espera', bg: 'bg-amber-100', text: 'text-amber-700', icon: Clock },
  asistió: { label: 'Asistió', bg: 'bg-[#E8F2EB]', text: 'text-[#2E6040]', icon: CheckCircle2 },
  ausente: { label: 'Ausente', bg: 'bg-red-100', text: 'text-red-700', icon: XCircle },
}

export function ReservasPage() {
  const { refresh, canWrite } = useData()
  const { reservations: RESERVATIONS, students: STUDENTS, disciplines } = useStudio()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('todas')
  const [filterDate, setFilterDate] = useState<string>('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const runAction = async (reservation: Reservation, action: () => Promise<void>) => {
    setBusyId(reservation.id)
    try {
      await action()
      await refresh()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo actualizar la reserva')
    } finally {
      setBusyId(null)
    }
  }

  const filtered = RESERVATIONS.filter((r) => {
    const matchSearch =
      search === '' ||
      r.studentName.toLowerCase().includes(search.toLowerCase()) ||
      r.className.toLowerCase().includes(search.toLowerCase())

    const matchStatus =
      filterStatus === 'todas' || r.status === filterStatus

    const matchDate = filterDate === '' || r.date === filterDate

    return matchSearch && matchStatus && matchDate
  }).sort((a, b) => b.date.localeCompare(a.date))

  const confirmedCount = RESERVATIONS.filter((r) => r.status === 'confirmada').length
  const waitlistCount = RESERVATIONS.filter((r) => r.status === 'lista de espera').length
  const attendedCount = RESERVATIONS.filter((r) => r.status === 'asistió').length
  const cancelledCount = RESERVATIONS.filter((r) => r.status === 'cancelada').length

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-4 md:px-6 py-4 border-b border-border bg-card flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background text-sm flex-1 min-w-48 max-w-xs">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar alumno o clase..."
            className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground outline-none text-sm"
          />
        </div>

        <input
          type="date"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
          className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none focus:border-primary transition-colors"
        />

        <div className="flex items-center gap-1.5 flex-wrap">
          {(['todas', 'confirmada', 'lista de espera', 'asistió', 'cancelada', 'ausente'] as const).map(
            (s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium transition-colors border',
                  filterStatus === s
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted text-muted-foreground border-border hover:border-primary/30'
                )}
              >
                {s === 'todas'
                  ? 'Todas'
                  : s === 'lista de espera'
                  ? 'En espera'
                  : s === 'asistió'
                  ? 'Asistió'
                  : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            )
          )}
        </div>
      </div>

      {/* Summary row */}
      <div className="px-6 py-3 border-b border-border bg-muted/30 flex items-center gap-6 text-xs flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-primary" />
          <span className="text-muted-foreground">
            <strong className="text-foreground">{confirmedCount}</strong> confirmadas
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <span className="text-muted-foreground">
            <strong className="text-foreground">{waitlistCount}</strong> en espera
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-accent" />
          <span className="text-muted-foreground">
            <strong className="text-foreground">{attendedCount}</strong> asistieron
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-muted-foreground" />
          <span className="text-muted-foreground">
            <strong className="text-foreground">{cancelledCount}</strong> canceladas
          </span>
        </div>
        <span className="ml-auto text-muted-foreground">
          Mostrando <strong className="text-foreground">{filtered.length}</strong> registros
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Alumno
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Clase
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">
                    Disciplina
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">
                    Fecha
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">
                    Profesora/or
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Estado
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                      No se encontraron reservas
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => {
                    const cfg = STATUS_CONFIG[r.status]
                    const StatusIcon = cfg.icon
                    const student = STUDENTS.find((s) => s.id === r.studentId)
                    const disciplineColor = disciplineStyle(disciplines, r.discipline).dot

                    return (
                      <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <span className="text-primary text-[10px] font-bold">
                                {student?.avatar ?? '??'}
                              </span>
                            </div>
                            <span className="font-medium text-foreground text-sm">{r.studentName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground">{r.className}</td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor: `${disciplineColor}18`,
                              color: disciplineColor,
                            }}
                          >
                            {r.discipline}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <div>
                            <p className="text-sm text-foreground font-medium">{r.date}</p>
                            <p className="text-xs text-muted-foreground">{r.time}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground hidden lg:table-cell">
                          {r.teacherName}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold',
                              cfg.bg,
                              cfg.text
                            )}
                          >
                            <StatusIcon className="w-3 h-3" />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {canWrite && r.status === 'confirmada' && (
                              <>
                                <button
                                  disabled={busyId === r.id}
                                  onClick={() => runAction(r, () => markAttendance(r))}
                                  className="w-7 h-7 rounded-lg hover:bg-[#E8F2EB] flex items-center justify-center text-muted-foreground hover:text-[#2E6040] transition-colors disabled:opacity-50"
                                  title="Marcar asistencia"
                                >
                                  <UserCheck className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  disabled={busyId === r.id}
                                  onClick={() =>
                                    runAction(r, () => updateReservationStatus(r.id, 'ausente'))
                                  }
                                  className="w-7 h-7 rounded-lg hover:bg-amber-50 flex items-center justify-center text-muted-foreground hover:text-amber-600 transition-colors disabled:opacity-50"
                                  title="Marcar ausente"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  disabled={busyId === r.id}
                                  onClick={() =>
                                    runAction(r, () => updateReservationStatus(r.id, 'cancelada'))
                                  }
                                  className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                                  title="Cancelar reserva"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            {canWrite && r.status === 'lista de espera' && (
                              <button
                                disabled={busyId === r.id}
                                onClick={() =>
                                  runAction(r, () => updateReservationStatus(r.id, 'confirmada'))
                                }
                                className="px-2 py-1 rounded-lg bg-primary/10 text-primary text-[10px] font-semibold hover:bg-primary/20 transition-colors disabled:opacity-50"
                                title="Confirmar desde lista de espera"
                              >
                                Confirmar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
