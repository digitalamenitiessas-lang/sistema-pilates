'use client'

import { useMemo, useState } from 'react'
import { Check, X, Loader2, Undo2, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useData, useStudio } from '@/lib/data-context'
import { markAttendance, undoAttendance, updateReservationStatus } from '@/lib/api'
import type { Reservation } from '@/lib/types'

/**
 * Tomar asistencia de una clase en una fecha.
 *
 * Pensada para el celular: es lo que la profesora abre parada en la sala,
 * con una mano. De ahí que los botones sean grandes, que no haya
 * confirmaciones intermedias y que corregir una marca equivocada sea un
 * toque y no un menú.
 *
 * Sección 1 del documento de Casa Fé: "Activar el check de asistencia para
 * que profesoras y encargadas puedan marcar".
 */
export function TomarAsistencia({
  classId,
  date,
  title,
  time,
  onClose,
}: {
  classId: string
  date: string
  title: string
  time: string
  onClose: () => void
}) {
  const { refresh, can, canWrite } = useData()
  const { reservations, students } = useStudio()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Mientras los permisos estén en sombra, can() responde lo que el rol
  // podía hacer antes, así que esto es equivalente a canWrite hasta que el
  // estudio encienda la clave y se la dé a las profesoras.
  const puedeMarcar = can('reservas.asistencia') || canWrite

  const lista = useMemo(
    () =>
      reservations
        .filter(
          (r) =>
            r.classId === classId &&
            r.date === date &&
            r.status !== 'cancelada' &&
            r.status !== 'lista de espera'
        )
        .sort((a, b) => a.studentName.localeCompare(b.studentName)),
    [reservations, classId, date]
  )

  const presentes = lista.filter((r) => r.status === 'asistió').length
  const ausentes = lista.filter((r) => r.status === 'ausente').length
  const faltanMarcar = lista.filter((r) => r.status === 'confirmada').length

  const marcar = async (r: Reservation, estado: 'asistió' | 'ausente' | 'confirmada') => {
    setBusyId(r.id)
    setError(null)
    try {
      // El "presente" descuenta la clase de la membresía y deshacerlo la
      // devuelve: marcar por error no le puede costar una clase a la
      // alumna. Si la ausencia también consume, lo define el estudio desde
      // Configuración y esa regla se muda a la base.
      if (estado === 'asistió' && r.status !== 'asistió') await markAttendance(r)
      else if (r.status === 'asistió' && estado !== 'asistió') await undoAttendance(r)
      else await updateReservationStatus(r.id, estado)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo marcar')
    } finally {
      setBusyId(null)
    }
  }

  const avatar = (studentId: string) =>
    students.find((s) => s.id === studentId)?.avatar ?? '??'

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-card w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl shadow-2xl border border-border max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-foreground truncate">{title}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {time} · {lista.length} {lista.length === 1 ? 'alumna' : 'alumnas'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground shrink-0"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {lista.length > 0 && (
            <div className="flex items-center gap-3 mt-3 text-xs">
              <span className="font-semibold text-[#2E6040]">{presentes} presentes</span>
              {ausentes > 0 && (
                <span className="font-semibold text-destructive">{ausentes} ausentes</span>
              )}
              {faltanMarcar > 0 && (
                <span className="text-muted-foreground">{faltanMarcar} sin marcar</span>
              )}
            </div>
          )}
        </div>

        <div className="px-4 py-3 overflow-y-auto flex-1">
          {lista.length === 0 && (
            <div className="text-center py-10">
              <Users className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nadie reservó esta clase</p>
            </div>
          )}

          <div className="space-y-2">
            {lista.map((r) => {
              const marcada = r.status === 'asistió' || r.status === 'ausente'
              return (
                <div
                  key={r.id}
                  className={cn(
                    'rounded-2xl border px-3 py-2.5 flex items-center gap-3 transition-colors',
                    r.status === 'asistió'
                      ? 'border-[#7D9B76]/40 bg-[#E8F2EB]'
                      : r.status === 'ausente'
                        ? 'border-destructive/30 bg-destructive/5'
                        : 'border-border'
                  )}
                >
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-primary text-[11px] font-bold">{avatar(r.studentId)}</span>
                  </div>

                  <p className="flex-1 min-w-0 text-sm font-medium text-foreground truncate">
                    {r.studentName}
                  </p>

                  {busyId === r.id ? (
                    <Loader2 className="w-5 h-5 animate-spin text-primary shrink-0" />
                  ) : !puedeMarcar ? (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {r.status === 'asistió' ? 'Presente' : r.status === 'ausente' ? 'Ausente' : '—'}
                    </span>
                  ) : marcada ? (
                    <button
                      onClick={() => marcar(r, 'confirmada')}
                      className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground shrink-0 px-2 py-1"
                      aria-label={`Deshacer ${r.studentName}`}
                    >
                      {r.status === 'asistió' ? 'Presente' : 'Ausente'}
                      <Undo2 className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    // Botones grandes a propósito: se usan de pie, con una mano
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => marcar(r, 'ausente')}
                        className="w-11 h-11 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:border-destructive/50 hover:text-destructive transition-colors"
                        aria-label={`${r.studentName} ausente`}
                      >
                        <X className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => marcar(r, 'asistió')}
                        className="w-11 h-11 rounded-xl bg-[#7D9B76] text-white flex items-center justify-center hover:opacity-90 transition-opacity"
                        aria-label={`${r.studentName} presente`}
                      >
                        <Check className="w-5 h-5" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {error && (
            <p className="text-xs text-destructive bg-destructive/10 rounded-xl px-3 py-2 mt-3">
              {error}
            </p>
          )}

          {!puedeMarcar && lista.length > 0 && (
            <p className="text-xs text-muted-foreground text-center mt-3">
              Tu rol puede ver la lista, pero no marcar asistencia.
            </p>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border shrink-0">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  )
}
