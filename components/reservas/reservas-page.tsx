'use client'

import { useState } from 'react'
import {
  CalendarDays,
  CalendarClock,
  Check,
  X,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  History,
  UserCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useData, useStudio } from '@/lib/data-context'
import { SeccionPlegable, SeccionesPlegables } from '@/components/ui/seccion-plegable'
import { disciplineStyle } from '@/lib/disciplines'
import { addDays, hoyISO, updateReservationStatus } from '@/lib/api'
import type { DisciplineItem, Reservation, ReservationStatus, Student } from '@/lib/types'

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

/** Fecha corta para los encabezados: "mié 9 sept". */
function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(a, m - 1, d).toLocaleDateString('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

interface AccionesDeFila {
  busyId: string | null
  puedeMarcar: boolean
  canWrite: boolean
  onEstado: (r: Reservation, estado: ReservationStatus) => void
}

/**
 * La tabla de reservas. Se usa una vez por bloque de la pantalla (hoy,
 * mañana, próximos días, historial), así que las filas vienen ya elegidas
 * y ordenadas: acá solo se dibujan.
 */
function TablaDeReservas({
  filas,
  students,
  disciplines,
  acciones,
  /** En los bloques de un solo día la fecha se repite en cada fila y no dice nada */
  mostrarFecha,
  vacio,
}: {
  filas: Reservation[]
  students: Student[]
  disciplines: DisciplineItem[]
  acciones: AccionesDeFila
  mostrarFecha: boolean
  vacio: string
}) {
  const { busyId, puedeMarcar, canWrite, onEstado } = acciones

  if (filas.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{vacio}</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {mostrarFecha ? 'Fecha' : 'Hora'}
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Clienta
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Clase
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">
              Disciplina
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
          {filas.map((r) => {
            const cfg = STATUS_CONFIG[r.status]
            const StatusIcon = cfg.icon
            const student = students.find((s) => s.id === r.studentId)
            const disciplineColor = disciplineStyle(disciplines, r.discipline).dot

            return (
              <tr key={r.id} className="group hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 whitespace-nowrap">
                  {mostrarFecha ? (
                    <div>
                      <p className="text-sm text-foreground font-medium">{r.date}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">{r.time}</p>
                    </div>
                  ) : (
                    <p className="text-sm font-semibold text-foreground tabular-nums">{r.time}</p>
                  )}
                </td>
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
                <td className="px-4 py-3 hidden lg:table-cell">
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
                {/* Fija a la derecha: si la tabla no entra y hay que
                    scrollear, marcar asistencia es justo lo que no puede
                    quedar fuera de la pantalla. Sin scroll no se nota,
                    porque el fondo es el mismo de la tarjeta. */}
                <td className="px-4 py-3 sticky right-0 bg-card group-hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-1">
                    {r.status === 'confirmada' && (
                      <>
                        {puedeMarcar && (
                          <>
                            <button
                              disabled={busyId === r.id}
                              onClick={() => onEstado(r, 'asistió')}
                              className="w-7 h-7 rounded-lg hover:bg-[#E8F2EB] flex items-center justify-center text-muted-foreground hover:text-[#2E6040] transition-colors disabled:opacity-50"
                              title="Marcar asistencia"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                            </button>
                            <button
                              disabled={busyId === r.id}
                              onClick={() => onEstado(r, 'ausente')}
                              className="w-7 h-7 rounded-lg hover:bg-amber-50 flex items-center justify-center text-muted-foreground hover:text-amber-600 transition-colors disabled:opacity-50"
                              title="Marcar ausente"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        {canWrite && (
                          <button
                            disabled={busyId === r.id}
                            onClick={() => onEstado(r, 'cancelada')}
                            className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                            title="Cancelar reserva"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </>
                    )}
                    {canWrite && r.status === 'lista de espera' && (
                      <button
                        disabled={busyId === r.id}
                        onClick={() => onEstado(r, 'confirmada')}
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
          })}
        </tbody>
      </table>
    </div>
  )
}

export function ReservasPage() {
  const { refresh, canWrite, can } = useData()
  const { reservations: RESERVATIONS, students: STUDENTS, disciplines } = useStudio()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('todas')
  const [filterDate, setFilterDate] = useState<string>('')
  const [busyId, setBusyId] = useState<string | null>(null)

  // Marcar asistencia es su propia clave desde la 0012: la profesora la
  // tiene sin poder tocar el resto. Mientras esté en sombra, can()
  // responde lo de siempre, así que esto es igual a canWrite hasta que el
  // estudio la encienda. Cancelar y confirmar siguen siendo del mostrador.
  const puedeMarcar = can('reservas.asistencia') || canWrite

  const cambiarEstado = async (reservation: Reservation, estado: ReservationStatus) => {
    setBusyId(reservation.id)
    try {
      await updateReservationStatus(reservation.id, estado)
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

    const matchStatus = filterStatus === 'todas' || r.status === filterStatus

    const matchDate = filterDate === '' || r.date === filterDate

    return matchSearch && matchStatus && matchDate
  })

  const confirmedCount = RESERVATIONS.filter((r) => r.status === 'confirmada').length
  const waitlistCount = RESERVATIONS.filter((r) => r.status === 'lista de espera').length
  const attendedCount = RESERVATIONS.filter((r) => r.status === 'asistió').length
  const cancelledCount = RESERVATIONS.filter((r) => r.status === 'cancelada').length

  // El día del estudio, no el del navegador (migración 0016).
  const hoy = hoyISO()
  const manana = addDays(hoy, 1)

  const porHora = (a: Reservation, b: Reservation) => a.time.localeCompare(b.time)
  const deHoy = filtered.filter((r) => r.date === hoy).sort(porHora)
  const deManana = filtered.filter((r) => r.date === manana).sort(porHora)
  const masAdelante = filtered
    .filter((r) => r.date > manana)
    .sort((a, b) => a.date.localeCompare(b.date) || porHora(a, b))
  const historial = filtered
    .filter((r) => r.date < hoy)
    .sort((a, b) => b.date.localeCompare(a.date) || porHora(b, a))

  const sinMarcarHoy = deHoy.filter((r) => r.status === 'confirmada').length

  // Buscar por nombre o filtrar por una fecha es ir a buscar algo puntual,
  // y ahí los bloques por día estorban: lo buscado puede estar en el
  // historial, que viene cerrado. Con filtros se muestra una lista sola.
  const buscando = search !== '' || filterDate !== '' || filterStatus !== 'todas'

  const acciones: AccionesDeFila = {
    busyId,
    puedeMarcar,
    canWrite,
    onEstado: cambiarEstado,
  }

  const conteo = (n: number) => (
    <span className="text-xs text-muted-foreground tabular-nums">
      {n} {n === 1 ? 'reserva' : 'reservas'}
    </span>
  )

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
            placeholder="Buscar clienta o clase..."
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

      <div className="flex-1 overflow-auto p-4 md:p-6">
        {buscando ? (
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-foreground">Resultados de la búsqueda</p>
              {conteo(filtered.length)}
            </div>
            <TablaDeReservas
              filas={[...filtered].sort(
                (a, b) => b.date.localeCompare(a.date) || porHora(b, a)
              )}
              students={STUDENTS}
              disciplines={disciplines}
              acciones={acciones}
              mostrarFecha
              vacio="No se encontraron reservas"
            />
          </div>
        ) : (
          <SeccionesPlegables memoria="reservas">
            <div className="space-y-3">
              <SeccionPlegable
                id="hoy"
                icono={CalendarDays}
                titulo="Hoy"
                ayuda={fechaCorta(hoy)}
                abiertaPorDefecto
                resumen={
                  // Lo que importa del día no es cuántas hay sino cuántas
                  // quedan sin marcar: es la tarea pendiente del mostrador.
                  sinMarcarHoy > 0 ? (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      {sinMarcarHoy} sin marcar
                    </span>
                  ) : (
                    conteo(deHoy.length)
                  )
                }
              >
                <TablaDeReservas
                  filas={deHoy}
                  students={STUDENTS}
                  disciplines={disciplines}
                  acciones={acciones}
                  mostrarFecha={false}
                  vacio="No hay reservas para hoy"
                />
              </SeccionPlegable>

              <SeccionPlegable
                id="manana"
                icono={CalendarClock}
                colorIcono="bg-accent/10 text-accent"
                titulo="Mañana"
                ayuda={fechaCorta(manana)}
                abiertaPorDefecto
                resumen={conteo(deManana.length)}
              >
                <TablaDeReservas
                  filas={deManana}
                  students={STUDENTS}
                  disciplines={disciplines}
                  acciones={acciones}
                  mostrarFecha={false}
                  vacio="Todavía no hay reservas para mañana"
                />
              </SeccionPlegable>

              {masAdelante.length > 0 && (
                <SeccionPlegable
                  id="mas-adelante"
                  icono={CalendarClock}
                  titulo="Más adelante"
                  ayuda="Reservas tomadas para los días siguientes"
                  resumen={conteo(masAdelante.length)}
                >
                  <TablaDeReservas
                    filas={masAdelante}
                    students={STUDENTS}
                    disciplines={disciplines}
                    acciones={acciones}
                    mostrarFecha
                    vacio="Sin reservas más adelante"
                  />
                </SeccionPlegable>
              )}

              <SeccionPlegable
                id="historial"
                icono={History}
                colorIcono="bg-muted text-muted-foreground"
                titulo="Historial"
                ayuda="Lo que ya pasó, de lo más reciente a lo más viejo"
                resumen={conteo(historial.length)}
              >
                <TablaDeReservas
                  filas={historial}
                  students={STUDENTS}
                  disciplines={disciplines}
                  acciones={acciones}
                  mostrarFecha
                  vacio="Sin reservas anteriores"
                />
              </SeccionPlegable>
            </div>
          </SeccionesPlegables>
        )}
      </div>
    </div>
  )
}
