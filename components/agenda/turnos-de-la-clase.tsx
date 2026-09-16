'use client'

/**
 * Quiénes tienen este horario fijo, y la gestión desde administración
 * (0048). Es §2 del pedido del estudio del 15/09, casi entero:
 * *"Consultar quién ocupa permanentemente cada horario"*, cambiar,
 * liberar y *"saber cuándo pierde prioridad"*.
 *
 * Vive en el detalle de la clase, en Agenda, porque ahí es donde la
 * pregunta aparece: el mostrador está mirando el martes a las 18 y
 * quiere saber cuántos de esos ocho lugares ya tienen dueño.
 *
 * La ocupación fija es distinta de la ocupación de una fecha. Una clase
 * puede tener 6 de 8 lugares con dueño permanente y estar vacía el
 * martes que viene: el turno fijo es un derecho, no una reserva. Por eso
 * este bloque cuenta aparte y lo dice con esas palabras.
 */

import { useState } from 'react'
import { CalendarClock, Loader2, UserMinus, Pause, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useData, useStudio } from '@/lib/data-context'
import {
  asignarTurnoFijo,
  liberarTurnoFijo,
  pausarTurnoFijo,
  reactivarTurnoFijo,
} from '@/lib/api'
import type { FixedSlot, Student } from '@/lib/types'

const fecha = (iso: string) => new Date(`${iso}T00:00`).toLocaleDateString('es-AR')

function Turno({ t, onHecho }: { t: FixedSlot; onHecho: () => Promise<void> }) {
  const { can } = useData()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const puedeLiberar = can('turnos.liberar')
  const puedeAsignar = can('turnos.asignar')

  const correr = async (accion: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await accion()
      await onHecho()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
      setBusy(false)
    }
  }

  const liberar = () => {
    const motivo = window.prompt(
      `¿Por qué se libera el turno de ${t.studentName}? (lo ve el cliente en su portal)`,
      t.conPrioridad ? '' : 'No renovó la membresía'
    )
    if (motivo === null) return
    if (!motivo.trim()) {
      setError('Hace falta un motivo para liberar el turno')
      return
    }
    correr(() => liberarTurnoFijo(t.id, motivo))
  }

  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">
          {t.studentName}
          {t.estado === 'pausado' && (
            <span className="ml-1.5 text-[10px] font-semibold text-muted-foreground">en pausa</span>
          )}
        </p>
        {/* La fecha sola no alcanza: lo que decide si este lugar se puede
            dar de nuevo es si la prioridad sigue viva hoy.
            Y el pausado va aparte: la liberación automática NO lo toca
            (0049), así que decirle "se puede liberar" al mostrador sería
            justo lo contrario de lo que el estudio le prometió al cliente. */}
        <p
          className={cn(
            'text-[10px]',
            t.estado === 'pausado'
              ? 'text-muted-foreground'
              : t.conPrioridad
              ? 'text-muted-foreground'
              : 'text-destructive-fuerte font-semibold'
          )}
        >
          {t.estado === 'pausado'
            ? `el estudio le guarda el lugar${t.motivo ? ` · ${t.motivo}` : ''}`
            : t.prioridadHasta
            ? t.conPrioridad
              ? `prioridad hasta el ${fecha(t.prioridadHasta)}`
              : `sin prioridad desde el ${fecha(t.prioridadHasta)} — se puede liberar`
            : 'sin membresía — se puede liberar'}
        </p>
        {error && <p className="text-[10px] text-destructive-fuerte mt-0.5">{error}</p>}
      </div>

      {busy ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />
      ) : (
        <div className="flex items-center gap-0.5 shrink-0">
          {puedeAsignar &&
            (t.estado === 'pausado' ? (
              <button
                onClick={() => correr(() => reactivarTurnoFijo(t.id))}
                title="Volver a activarlo"
                className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted"
              >
                <Play className="w-3 h-3" />
              </button>
            ) : (
              <button
                onClick={() => {
                  const m = window.prompt('¿Por qué se pausa? (viaje, lesión…)', '')
                  if (m === null) return
                  correr(() => pausarTurnoFijo(t.id, m))
                }}
                title="Pausarlo sin quitárselo"
                className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted"
              >
                <Pause className="w-3 h-3" />
              </button>
            ))}
          {puedeLiberar && (
            <button
              onClick={liberar}
              title="Liberar el lugar"
              className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive-fuerte"
            >
              <UserMinus className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function TurnosDeLaClase({
  classId,
  capacity,
  cliente,
}: {
  classId: string
  capacity: number
  /** El cliente elegido arriba, para poder darle este horario sin buscarlo de nuevo. */
  cliente?: Student
}) {
  const { refresh, can } = useData()
  const { turnosFijos } = useStudio()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sin el `|| canWrite` de otras pantallas, y a propósito: las tres
  // claves las crea la 0048, así que `can()` responde que no mientras la
  // migración no haya corrido. Eso hace que la clave sea también el
  // interruptor de la función — el bloque no aparece prometiendo un
  // horario fijo que la base todavía no sabe guardar.
  const puedeVer = can('turnos.ver')
  const puedeAsignar = can('turnos.asignar')

  const turnos = turnosFijos.filter((t) => t.classId === classId)
  const activos = turnos.filter((t) => t.estado === 'activo').length
  const yaLoTiene = !!cliente && turnos.some((t) => t.studentId === cliente.id)

  // Sin la 0048 corrida la lista llega vacía y no hay nada que mostrar;
  // tampoco para el rol que no ve turnos.
  if (!puedeVer || (turnos.length === 0 && !puedeAsignar)) return null

  const asignar = async () => {
    if (!cliente) return
    setBusy(true)
    setError(null)
    try {
      await asignarTurnoFijo(cliente.id, classId)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo asignar el turno')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
          <CalendarClock className="w-3.5 h-3.5 shrink-0 text-primary-fuerte" />
          Turnos fijos
        </p>
        <p className="text-[10px] text-muted-foreground shrink-0">
          {activos} de {capacity} lugares con dueño
        </p>
      </div>

      {turnos.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Nadie tiene este horario reservado de forma permanente.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {turnos.map((t) => (
            <Turno key={t.id} t={t} onHecho={refresh} />
          ))}
        </div>
      )}

      {puedeAsignar && cliente && !yaLoTiene && (
        <button
          disabled={busy}
          onClick={asignar}
          className="w-full mt-1 py-2 rounded-lg text-[11px] font-semibold border border-border text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60"
        >
          {busy && <Loader2 className="w-3 h-3 animate-spin" />}
          Darle este horario fijo a {cliente.name.split(' ')[0]}
        </button>
      )}

      {error && <p className="text-[11px] text-destructive-fuerte">{error}</p>}

      {/* Un turno fijo no reserva la clase de cada fecha: es el derecho
          al lugar. Sin esto, el mostrador va a mirar la ocupación de
          arriba —0/8— y creer que el bloque no funciona. */}
      {turnos.length > 0 && (
        <p className="text-[10px] text-muted-foreground pt-0.5">
          Tener el horario fijo no reserva cada clase: guarda el lugar. La reserva de cada fecha se
          hace como siempre.
        </p>
      )}
    </div>
  )
}
