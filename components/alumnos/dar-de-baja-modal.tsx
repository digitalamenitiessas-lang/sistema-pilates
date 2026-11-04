'use client'

import { useState } from 'react'
import { X, Loader2, UserX } from 'lucide-react'
import { useData } from '@/lib/data-context'
import { ahoraDelEstudio, darDeBajaCliente, esOferta } from '@/lib/api'
import type { Payment, Reservation, Student } from '@/lib/types'

function plata(n: number): string {
  return `$${n.toLocaleString('es-AR')}`
}

/**
 * Dar de baja a un cliente (0097).
 *
 * Lo pidió el estudio el 03/11: "hay varios que no van a venir y no quiero
 * que se me mezclen con los demás". Es una baja y no un borrado: la ficha
 * sale de la lista, del buscador y de la agenda, pero conserva su
 * historia —cobros, arqueos, asistencias— y se puede reactivar desde
 * Clientes → De baja.
 *
 * Dos pasos a propósito, dentro de la ventana y no con `window.confirm`,
 * que el navegador de Instagram y el panel de vista previa descartan
 * solos. El primero dice con números todo lo que la baja va a soltar,
 * contado con los mismos criterios que la base; el segundo es el "sí".
 */
export function DarDeBajaModal({
  student,
  reservations,
  payments,
  onClose,
  onHecho,
}: {
  student: Student
  reservations: Reservation[]
  payments: Payment[]
  onClose: () => void
  /** La ficha deja de existir en el paquete del estudio: hay que salir de ella */
  onHecho: () => void
}) {
  const { data, refresh } = useData()
  const [motivo, setMotivo] = useState('')
  const [anularDeuda, setAnularDeuda] = useState(true)
  const [paso, setPaso] = useState<'resumen' | 'confirmar'>('resumen')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { fecha: hoy, hora } = ahoraDelEstudio()

  // Lo mismo que va a tocar dar_de_baja_cliente, para decirlo antes.
  const porDelante = reservations.filter(
    (r) =>
      (r.status === 'confirmada' || r.status === 'lista de espera' || (r.status as string) === 'ofrecida') &&
      (r.date > hoy || (r.date === hoy && r.time.slice(0, 5) > hora))
  )
  const turnos = (data?.turnosFijos ?? []).filter(
    (t) => t.studentId === student.id && (t.estado === 'activo' || t.estado === 'pausado')
  )
  const ofertas = payments.filter((p) => esOferta(p))
  const futuros = (data?.memberships ?? []).filter(
    (m) => m.studentId === student.id && m.status !== 'cancelada' && m.status !== 'suspendida' && m.startDate > hoy
  )
  const cobrado = (membresiaId: string) =>
    payments.some((p) => p.membershipId === membresiaId && p.status === 'pagado')
  const futurosSinCobrar = futuros.filter((m) => !cobrado(m.id))
  const futurosCobrados = futuros.filter((m) => cobrado(m.id))
  const deuda = payments.filter(
    (p) =>
      (p.status === 'pendiente' || p.status === 'vencido') &&
      !esOferta(p) &&
      !futurosSinCobrar.some((m) => m.id === p.membershipId)
  )
  const totalDeuda = deuda.reduce((s, p) => s + p.amount, 0)

  const confirmar = async () => {
    setSaving(true)
    setError(null)
    try {
      await darDeBajaCliente(student.id, motivo, anularDeuda)
      await refresh()
      onHecho()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo dar de baja')
      setSaving(false)
    }
  }

  const lineas: string[] = []
  if (porDelante.length > 0)
    lineas.push(
      `Se cancelan ${porDelante.length === 1 ? 'su reserva' : `sus ${porDelante.length} reservas`} por delante, y el lugar queda libre para otra persona.`
    )
  if (turnos.length > 0)
    lineas.push(
      `Se ${turnos.length === 1 ? 'libera su turno fijo' : `liberan sus ${turnos.length} turnos fijos`}.`
    )
  if (ofertas.length > 0) lineas.push('Se anula el aviso de renovación que tenía para pagar.')
  if (futurosSinCobrar.length > 0)
    lineas.push(
      `Se ${futurosSinCobrar.length === 1 ? 'cancela el período' : 'cancelan los períodos'} que todavía no ${futurosSinCobrar.length === 1 ? 'empezó' : 'empezaron'}, con su cuota.`
    )

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-foreground/20 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl border border-border max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-foreground">Dar de baja</h2>
            <p className="text-xs text-muted-foreground truncate">{student.name}</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground shrink-0"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {paso === 'resumen' ? (
          <>
            <div className="px-5 py-4 space-y-4 overflow-y-auto">
              <p className="text-sm text-foreground">
                Sale de la lista de clientes, del buscador y de la agenda. <strong>No se borra nada</strong>:
                sus cobros, su historial y su credencial quedan guardados, y si vuelve se la reactiva desde
                Clientes → De baja.
              </p>

              {lineas.length > 0 ? (
                <ul className="rounded-xl bg-muted/60 px-3 py-3 text-xs text-foreground space-y-1.5">
                  {lineas.map((l) => (
                    <li key={l}>• {l}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No tiene reservas, turnos ni cuotas pendientes.</p>
              )}

              {deuda.length > 0 && (
                <label className="flex items-start gap-2.5 rounded-xl border border-border px-3 py-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={anularDeuda}
                    onChange={(e) => setAnularDeuda(e.target.checked)}
                    className="mt-0.5 accent-primary"
                  />
                  <span className="text-xs text-foreground">
                    Anular también {deuda.length === 1 ? 'su cuota sin cobrar' : `sus ${deuda.length} cuotas sin cobrar`}{' '}
                    de <strong>{plata(totalDeuda)}</strong>.
                    <span className="block text-muted-foreground mt-0.5">
                      Si la destildás, la deuda queda en Pagos para seguir reclamándola.
                    </span>
                  </span>
                </label>
              )}

              {futurosCobrados.length > 0 && (
                <p className="text-xs text-aviso-fuerte bg-aviso-suave rounded-xl px-3 py-2.5">
                  Tiene {futurosCobrados.length === 1 ? 'un período que' : `${futurosCobrados.length} períodos que`}{' '}
                  todavía no {futurosCobrados.length === 1 ? 'empezó' : 'empezaron'} y ya{' '}
                  {futurosCobrados.length === 1 ? 'está cobrado' : 'están cobrados'}. La baja no lo toca: si
                  corresponde devolver la plata, anulá el cobro desde Pagos.
                </p>
              )}

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Motivo
                </label>
                <textarea
                  rows={2}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ej: no va a seguir viniendo"
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors resize-none"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Opcional. Se ve en la lista de bajas, para acordarse después.
                </p>
              </div>
            </div>

            <div className="flex gap-2 px-5 py-4 border-t border-border shrink-0">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                onClick={() => setPaso('confirmar')}
                className="flex-1 py-2.5 rounded-xl bg-destructive-fuerte text-white text-sm font-semibold hover:opacity-90"
              >
                Dar de baja
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="px-5 py-6 space-y-3 overflow-y-auto text-center">
              <UserX className="w-10 h-10 mx-auto text-destructive-fuerte opacity-70" />
              <p className="text-sm font-semibold text-foreground">¿Seguro que querés dar de baja a {student.name}?</p>
              <p className="text-xs text-muted-foreground">
                {lineas.length > 0 || (deuda.length > 0 && anularDeuda)
                  ? 'Lo que se cancela y se anula no vuelve, aunque después se reactive la ficha.'
                  : 'Se puede reactivar cuando quieras desde Clientes → De baja.'}
              </p>
              {error && (
                <p className="text-sm text-destructive-fuerte bg-destructive/10 rounded-xl px-3 py-2 text-left">{error}</p>
              )}
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-border shrink-0">
              <button
                onClick={() => {
                  setPaso('resumen')
                  setError(null)
                }}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted"
              >
                Volver
              </button>
              <button
                onClick={confirmar}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-destructive-fuerte text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Sí, dar de baja
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
