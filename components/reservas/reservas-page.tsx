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
  ClipboardCheck,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useData, useStudio } from '@/lib/data-context'
import { SeccionPlegable, SeccionesPlegables } from '@/components/ui/seccion-plegable'
import { TomarAsistencia } from '@/components/asistencia/tomar-asistencia'
import { disciplineStyle } from '@/lib/disciplines'
import {
  addDays,
  hoyISO,
  updateReservationStatus,
  formaDeLaReserva,
  cancelacionEnPlazo,
  consecuenciaDeCancelar,
  topeDeDevoluciones,
  settingNum,
  type ConsecuenciaDeCancelar,
} from '@/lib/api'
import type {
  Discipline,
  DisciplineItem,
  Reservation,
  ReservationStatus,
  Student,
} from '@/lib/types'

const STATUS_CONFIG: Record<
  ReservationStatus,
  { label: string; bg: string; text: string; icon: React.ComponentType<{ className?: string }> }
> = {
  // Relleno pleno y no tinte: sobre el tinte al 10%, `primary-fuerte` queda
  // a ΔEok 0.02 del `muted-foreground` de 'cancelada' — a 10px son el mismo
  // color, y esta es la pantalla donde el mostrador barre la lista de un vistazo.
  confirmada: { label: 'Confirmada', bg: 'bg-primary', text: 'text-primary-foreground', icon: Check },
  cancelada: { label: 'Cancelada', bg: 'bg-muted', text: 'text-muted-foreground', icon: X },
  'lista de espera': { label: 'Lista de espera', bg: 'bg-aviso-suave', text: 'text-aviso-fuerte', icon: Clock },
  asistió: { label: 'Asistió', bg: 'bg-exito-suave', text: 'text-exito-fuerte', icon: CheckCircle2 },
  ausente: { label: 'Ausente', bg: 'bg-destructive-suave', text: 'text-destructive-fuerte', icon: XCircle },
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
  /** Abre el "¿seguro?": cancelar no va directo, ver `ConfirmarCancelacion`. */
  onCancelar: (r: Reservation) => void
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
  const { busyId, puedeMarcar, canWrite, onEstado, onCancelar } = acciones

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
              Cliente
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
                      <p className="text-sm text-foreground font-medium">{fechaCorta(r.date)}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">{r.time}</p>
                    </div>
                  ) : (
                    <p className="text-sm font-semibold text-foreground tabular-nums">{r.time}</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-primary-fuerte text-[10px] font-bold">
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
                  {/* El estado solo no distingue una cancelación que le
                      devolvió la clase de una que se la hizo perder, ni una
                      clase recuperada de una común (0046). */}
                  {(() => {
                    const forma = formaDeLaReserva(r)
                    if (!forma) return null
                    return (
                      <p
                        className={cn(
                          'text-[10px] font-semibold mt-1',
                          forma.tono === 'info' && 'text-info-fuerte',
                          forma.tono === 'aviso' && 'text-aviso-fuerte',
                          forma.tono === 'neutro' && 'text-muted-foreground'
                        )}
                      >
                        {forma.texto}
                      </p>
                    )
                  })()}
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
                              className="w-7 h-7 rounded-lg hover:bg-exito-suave flex items-center justify-center text-muted-foreground hover:text-exito-fuerte transition-colors disabled:opacity-50"
                              title="Marcar asistencia"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                            </button>
                            <button
                              disabled={busyId === r.id}
                              onClick={() => onEstado(r, 'ausente')}
                              className="w-7 h-7 rounded-lg hover:bg-aviso-suave flex items-center justify-center text-muted-foreground hover:text-aviso-fuerte transition-colors disabled:opacity-50"
                              title="Marcar ausente"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        {canWrite && (
                          <button
                            disabled={busyId === r.id}
                            onClick={() => onCancelar(r)}
                            className="w-7 h-7 rounded-lg hover:bg-destructive-suave flex items-center justify-center text-muted-foreground hover:text-destructive-fuerte transition-colors disabled:opacity-50"
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
                        className="px-2 py-1 rounded-lg bg-primary/10 text-primary-fuerte text-[10px] font-semibold hover:bg-primary/20 transition-colors disabled:opacity-50"
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

interface ClaseDelDia {
  classId: string
  title: string
  time: string
  teacherName: string
  discipline: Discipline
  filas: Reservation[]
}

/**
 * Las reservas de un día, juntadas por la clase a la que pertenecen. Es el
 * orden en que se toma asistencia de verdad: nadie busca a una alumna en
 * una lista de treinta, mira la clase de las 09:00 y marca a las seis que
 * tenía anotadas.
 */
function agruparPorClase(filas: Reservation[]): ClaseDelDia[] {
  const grupos = new Map<string, ClaseDelDia>()
  for (const r of filas) {
    // Clase y hora: una clase no se repite en el mismo día, pero si el
    // estudio le agregara otro horario, cada uno es su propia lista.
    const clave = `${r.classId}|${r.time}`
    const grupo = grupos.get(clave)
    if (grupo) {
      grupo.filas.push(r)
      continue
    }
    grupos.set(clave, {
      classId: r.classId,
      title: r.className,
      time: r.time,
      teacherName: r.teacherName,
      discipline: r.discipline,
      filas: [r],
    })
  }

  // Las canceladas al final de cada clase: siguen estando, pero no son
  // parte de lo que hay que mirar cuando la clase arranca.
  const peso = (r: Reservation) => (r.status === 'cancelada' ? 1 : 0)
  return [...grupos.values()]
    .map((g) => ({
      ...g,
      filas: g.filas.sort(
        (a, b) => peso(a) - peso(b) || a.studentName.localeCompare(b.studentName)
      ),
    }))
    .sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title))
}

/**
 * Un día visto por clase: cada clase con sus anotadas, cómo viene la
 * asistencia y, si se puede marcar, el botón que abre la toma de esa clase.
 */
function ClasesDelDia({
  filas,
  students,
  disciplines,
  acciones,
  /** Si viene, cada clase muestra el botón para tomarle asistencia */
  onTomarAsistencia,
  vacio,
}: {
  filas: Reservation[]
  students: Student[]
  disciplines: DisciplineItem[]
  acciones: AccionesDeFila
  onTomarAsistencia?: (clase: ClaseDelDia) => void
  vacio: string
}) {
  const { busyId, puedeMarcar, canWrite, onEstado, onCancelar } = acciones

  if (filas.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{vacio}</p>
  }

  return (
    <div className="divide-y divide-border">
      {agruparPorClase(filas).map((clase) => {
        const color = disciplineStyle(disciplines, clase.discipline).dot
        const sinMarcar = clase.filas.filter((r) => r.status === 'confirmada').length
        const presentes = clase.filas.filter((r) => r.status === 'asistió').length
        const ausentes = clase.filas.filter((r) => r.status === 'ausente').length
        const enEspera = clase.filas.filter((r) => r.status === 'lista de espera').length

        return (
          <div key={`${clase.classId}|${clase.time}`}>
            <div className="flex items-center gap-3 px-4 py-3 bg-muted/20 flex-wrap">
              <span className="text-sm font-bold text-foreground tabular-nums shrink-0">
                {clase.time}
              </span>
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground truncate">{clase.title}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {clase.teacherName}
                  {presentes > 0 && ` · ${presentes} presente${presentes === 1 ? '' : 's'}`}
                  {ausentes > 0 && ` · ${ausentes} ausente${ausentes === 1 ? '' : 's'}`}
                  {enEspera > 0 && ` · ${enEspera} en espera`}
                </p>
              </div>
              {/* "Sin marcar" es una tarea pendiente, y solo lo es en un día
                  que ya pasó o está pasando. En un día que todavía no
                  llegó, lo que importa es cuántas se anotaron. */}
              {sinMarcar > 0 && (
                <span className="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary-fuerte">
                  {onTomarAsistencia
                    ? `${sinMarcar} sin marcar`
                    : `${sinMarcar} anotado${sinMarcar === 1 ? '' : 's'}`}
                </span>
              )}
              {onTomarAsistencia && (
                <button
                  onClick={() => onTomarAsistencia(clase)}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
                >
                  <ClipboardCheck className="w-3.5 h-3.5" />
                  Tomar asistencia
                </button>
              )}
            </div>

            <ul>
              {clase.filas.map((r) => {
                const cfg = STATUS_CONFIG[r.status]
                const StatusIcon = cfg.icon
                const student = students.find((s) => s.id === r.studentId)

                return (
                  <li
                    key={r.id}
                    className="flex items-center gap-3 px-4 py-2.5 border-t border-border/50 hover:bg-muted/30 transition-colors"
                  >
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-primary-fuerte text-[10px] font-bold">
                        {student?.avatar ?? '??'}
                      </span>
                    </div>
                    <span className="flex-1 min-w-0 truncate font-medium text-foreground text-sm">
                      {r.studentName}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold',
                        cfg.bg,
                        cfg.text
                      )}
                    >
                      <StatusIcon className="w-3 h-3" />
                      {cfg.label}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {r.status === 'confirmada' && (
                        <>
                          {puedeMarcar && (
                            <>
                              <button
                                disabled={busyId === r.id}
                                onClick={() => onEstado(r, 'asistió')}
                                className="w-7 h-7 rounded-lg hover:bg-exito-suave flex items-center justify-center text-muted-foreground hover:text-exito-fuerte transition-colors disabled:opacity-50"
                                title="Marcar asistencia"
                              >
                                <UserCheck className="w-3.5 h-3.5" />
                              </button>
                              <button
                                disabled={busyId === r.id}
                                onClick={() => onEstado(r, 'ausente')}
                                className="w-7 h-7 rounded-lg hover:bg-aviso-suave flex items-center justify-center text-muted-foreground hover:text-aviso-fuerte transition-colors disabled:opacity-50"
                                title="Marcar ausente"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          {canWrite && (
                            <button
                              disabled={busyId === r.id}
                              onClick={() => onCancelar(r)}
                              className="w-7 h-7 rounded-lg hover:bg-destructive-suave flex items-center justify-center text-muted-foreground hover:text-destructive-fuerte transition-colors disabled:opacity-50"
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
                          className="px-2 py-1 rounded-lg bg-primary/10 text-primary-fuerte text-[10px] font-semibold hover:bg-primary/20 transition-colors disabled:opacity-50"
                          title="Confirmar desde lista de espera"
                        >
                          Confirmar
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

/**
 * El "¿seguro que querés cancelar?" del mostrador.
 *
 * Lo pidió Matías el 27/09, probando el sistema: la cruz cancelaba de un
 * toque. Y un toque de más acá no es inocente — la base sella en ese
 * momento si la clase se devuelve o se pierde, gasta una de las
 * devoluciones del período y le libera el lugar a otra persona, y esta
 * pantalla no tiene cómo deshacerlo.
 *
 * El paso de más dice la consecuencia, no sólo la pregunta: es lo que la
 * recepción necesita tener enfrente si la clienta está del otro lado del
 * teléfono. La cuenta es la misma que le muestra el portal al cancelar
 * (`consecuenciaDeCancelar`), así que las dos pantallas dicen lo mismo.
 *
 * Va en la página y no en un `window.confirm`: esos carteles los
 * descartan solos el panel de vista previa y el navegador de Instagram,
 * y el botón parece muerto.
 */
function ConfirmarCancelacion({
  reserva,
  consecuencia,
  horasDePlazo,
  tope,
  trabajando,
  error,
  onCerrar,
  onConfirmar,
}: {
  reserva: Reservation
  consecuencia: ConsecuenciaDeCancelar
  horasDePlazo: number
  tope: number | null
  trabajando: boolean
  error: string | null
  onCerrar: () => void
  onConfirmar: () => void
}) {
  const plazo = `${horasDePlazo} ${horasDePlazo === 1 ? 'hora' : 'horas'}`
  const { caso, restantes } = consecuencia
  // Con cero horas de plazo, "en plazo" es "todavía no empezó". Hace falta
  // porque la cruz también está en la clase en curso y en el historial
  // —una reserva de ayer que quedó confirmada—, y ahí "faltan menos de 3
  // horas" sería falso.
  const yaEmpezo = !cancelacionEnPlazo(reserva.date, reserva.time, 0)
  // Después de esta cancelación, que es el número que se le puede decir.
  const despues = restantes === null ? null : restantes - 1

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm"
      onClick={trabajando ? undefined : onCerrar}
    >
      <div
        className="bg-card rounded-2xl shadow-2xl w-full max-w-sm border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground">¿Seguro que querés cancelar?</h2>
          <button
            type="button"
            onClick={onCerrar}
            disabled={trabajando}
            className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-foreground">{reserva.studentName}</p>
            <p className="text-xs text-muted-foreground">
              {reserva.className} · {fechaCorta(reserva.date)} · {reserva.time}
              {reserva.teacherName ? ` · ${reserva.teacherName}` : ''}
            </p>
          </div>

          {/* Los colores son los del portal: verde vuelve, ámbar avisó a
              tiempo y la pierde igual, rojo llegó tarde. Son tres cosas
              distintas y la recepción las tiene que poder explicar. */}
          {caso === 'vuelve' && (
            <div className="rounded-xl bg-exito-suave px-3.5 py-3">
              <p className="text-sm font-semibold text-exito-fuerte">La clase se le devuelve</p>
              <p className="text-xs text-exito-fuerte/90 mt-1">
                Faltan más de {plazo} para que empiece, así que vuelve a su plan.
              </p>
              {despues !== null && tope !== null && (
                <p className="text-xs text-exito-fuerte/90 mt-2">
                  Usa una de sus {tope} {tope === 1 ? 'devolución' : 'devoluciones'} del período
                  {despues === 0
                    ? ': es la última.'
                    : `: después de esta le ${despues === 1 ? 'queda' : 'quedan'} ${despues}.`}
                </p>
              )}
            </div>
          )}

          {caso === 'sin-cupo' && (
            <div className="rounded-xl bg-aviso-suave px-3.5 py-3">
              <p className="text-sm font-semibold text-aviso-fuerte">La clase se pierde</p>
              <p className="text-xs text-aviso-fuerte/90 mt-1">
                {/* En 0 el estudio decidió que cancelar nunca devuelve: decir
                    "ya usó las 0 devoluciones" no se entiende. */}
                {tope === 0
                  ? `Faltan más de ${plazo}, pero el estudio tiene las devoluciones en 0: cancelar no devuelve la clase.`
                  : `Faltan más de ${plazo}, pero ya usó ${
                      tope === 1 ? 'la devolución' : `las ${tope} devoluciones`
                    } del período.`}
              </p>
              <p className="text-xs text-aviso-fuerte/90 mt-2">
                Cancelar igual le libera el lugar a otra persona.
              </p>
            </div>
          )}

          {caso === 'se-pierde' && (
            <div className="rounded-xl bg-destructive/10 px-3.5 py-3">
              <p className="text-sm font-semibold text-destructive-fuerte">La clase se pierde</p>
              <p className="text-xs text-destructive-fuerte/90 mt-1">
                {reserva.date < hoyISO()
                  ? 'Esa clase ya pasó: cancelarla ahora no se la devuelve.'
                  : yaEmpezo
                    ? 'La clase ya empezó: cancelarla ahora no se la devuelve.'
                    : `Faltan menos de ${plazo} para que empiece: no se le devuelve.`}
              </p>
              {!yaEmpezo && (
                <p className="text-xs text-destructive-fuerte/90 mt-2">
                  Cancelar igual le libera el lugar a otra persona.
                </p>
              )}
            </div>
          )}

          {(caso === 'no-consume' || caso === 'espera' || caso === 'suspendida') && (
            <div className="rounded-xl bg-muted px-3.5 py-3">
              <p className="text-sm font-semibold text-foreground">No le cuesta nada</p>
              <p className="text-xs text-muted-foreground mt-1">
                {caso === 'espera'
                  ? 'Está en lista de espera: todavía no tenía lugar, así que cancelar no le descuenta ninguna clase.'
                  : caso === 'suspendida'
                    ? 'El estudio suspendió esa clase: cancelarla no le descuenta nada ni le gasta una devolución.'
                    : 'Esta reserva no sale de ningún plan, así que cancelarla no le descuenta nada.'}
              </p>
            </div>
          )}

          {error && (
            <p className="text-xs text-destructive-fuerte bg-destructive/10 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCerrar}
              disabled={trabajando}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-60"
            >
              No
            </button>
            <button
              type="button"
              onClick={onConfirmar}
              disabled={trabajando}
              className="flex-1 py-2.5 rounded-xl bg-destructive text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {trabajando && <Loader2 className="w-4 h-4 animate-spin" />}
              {trabajando ? 'Cancelando...' : 'Sí, cancelar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ReservasPage() {
  const { refresh, canWrite, can } = useData()
  const {
    reservations: RESERVATIONS,
    students: STUDENTS,
    disciplines,
    occurrences,
    settings,
    settingsMeta,
  } = useStudio()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('todas')
  const [filterDate, setFilterDate] = useState<string>('')
  const [busyId, setBusyId] = useState<string | null>(null)
  /** La clase a la que se le está tomando asistencia, si hay alguna */
  const [asistenciaDe, setAsistenciaDe] = useState<ClaseDelDia | null>(null)
  /** La reserva que espera el "sí, cancelar" */
  const [aCancelar, setACancelar] = useState<Reservation | null>(null)
  const [errorAlCancelar, setErrorAlCancelar] = useState<string | null>(null)

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

  // Los mismos parámetros con los que la base sella la cancelación, así
  // que si el estudio los cambia desde Configuración, el aviso cambia.
  const horasDeCancelacion = settingNum(settings, 'cancel_hours', 3)
  const topeDevoluciones = topeDeDevoluciones(settings, settingsMeta)

  // Se cuenta sobre todas las reservas del estudio: la cuenta filtra por el
  // período de ESA reserva, y el mostrador las ve todas.
  const consecuenciaDe = (r: Reservation) =>
    consecuenciaDeCancelar(r, RESERVATIONS, horasDeCancelacion, topeDevoluciones, {
      suspendida: occurrences.some(
        (o) => o.classId === r.classId && o.date === r.date && o.status === 'suspendida'
      ),
    })

  const pedirCancelacion = (r: Reservation) => {
    setErrorAlCancelar(null)
    setACancelar(r)
  }

  const confirmarCancelacion = async () => {
    const r = aCancelar
    if (!r) return
    setBusyId(r.id)
    setErrorAlCancelar(null)
    try {
      await updateReservationStatus(r.id, 'cancelada')
      await refresh()
      setACancelar(null)
    } catch (err) {
      // Adentro del cartel y no en un `alert`: el alert también lo
      // descartan solos los navegadores embebidos, y el error se perdía.
      setErrorAlCancelar(err instanceof Error ? err.message : 'No se pudo cancelar la reserva')
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
    onCancelar: pedirCancelacion,
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
            placeholder="Buscar cliente o clase..."
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
          <div className="w-2 h-2 rounded-full bg-aviso" />
          <span className="text-muted-foreground">
            <strong className="text-foreground">{waitlistCount}</strong> en espera
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-exito" />
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
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary-fuerte">
                      {sinMarcarHoy} sin marcar
                    </span>
                  ) : (
                    conteo(deHoy.length)
                  )
                }
              >
                <ClasesDelDia
                  filas={deHoy}
                  students={STUDENTS}
                  disciplines={disciplines}
                  acciones={acciones}
                  onTomarAsistencia={puedeMarcar ? setAsistenciaDe : undefined}
                  vacio="No hay reservas para hoy"
                />
              </SeccionPlegable>

              <SeccionPlegable
                id="manana"
                icono={CalendarClock}
                colorIcono="bg-primary/10 text-primary-fuerte"
                titulo="Mañana"
                ayuda={fechaCorta(manana)}
                abiertaPorDefecto
                resumen={conteo(deManana.length)}
              >
                <ClasesDelDia
                  filas={deManana}
                  students={STUDENTS}
                  disciplines={disciplines}
                  acciones={acciones}
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

      {/* Fuera del bloque plegable a propósito: si la sección se cierra, el
          modal no tiene que irse con ella. Es el mismo que usa la profesora
          desde Inicio y desde la agenda. */}
      {asistenciaDe && (
        <TomarAsistencia
          classId={asistenciaDe.classId}
          date={hoy}
          title={asistenciaDe.title}
          time={asistenciaDe.time}
          onClose={() => setAsistenciaDe(null)}
        />
      )}

      {/* Afuera por lo mismo: la reserva puede estar en una sección que se
          pliega o, al cancelarla, cambiar de lugar en la lista. */}
      {aCancelar && (
        <ConfirmarCancelacion
          reserva={aCancelar}
          consecuencia={consecuenciaDe(aCancelar)}
          horasDePlazo={horasDeCancelacion}
          tope={topeDevoluciones}
          trabajando={busyId === aCancelar.id}
          error={errorAlCancelar}
          onCerrar={() => setACancelar(null)}
          onConfirmar={confirmarCancelacion}
        />
      )}
    </div>
  )
}
