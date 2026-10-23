'use client'

import { useState } from 'react'
import { X, Loader2, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useData } from '@/lib/data-context'
import { cambiarPlanDesdeHoy, esOferta, hoyISO, vigenciaHasta, addDays, type CambioDePlan } from '@/lib/api'
import { CobrarModal } from '@/components/pagos/pagos-page'
import type { Membership, Student } from '@/lib/types'

/** "23/10" a partir de un ISO, sin pasar por `new Date(iso)` (se corre un día). */
function fechaCorta(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

/**
 * Cambiar de plan desde hoy (0095).
 *
 * Lo pidió el estudio el 23/10: una clienta con FE START usó sus 4 clases
 * antes de fin de mes y quiso pasar a FE FLOW. "Asignar plan" sólo sabía
 * encolar el cambio para el mes siguiente. El estudio eligió "plan nuevo
 * desde hoy": el período actual termina ayer, el nuevo arranca hoy entero,
 * y se cobra el mes completo del plan nuevo (con la promo que corresponda
 * al cobrar).
 *
 * Todo lo hace la base en una transacción. La ventana muestra antes, con
 * los números, lo que va a pasar —sobre todo cuántas clases sin usar se
 * pierden— y dice por qué no se puede cuando no se puede, que es lo mismo
 * que la base va a rechazar.
 */
export function CambiarPlanModal({
  student,
  membresia,
  onClose,
}: {
  student: Student
  membresia: Membership
  onClose: () => void
}) {
  const { data, refresh } = useData()
  const hoy = hoyISO()
  const planes = (data?.plans ?? []).filter((p) => !p.isTrial && p.id !== membresia.planId)
  const [planId, setPlanId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<CambioDePlan | null>(null)
  // El nombre se guarda al confirmar: después del refresh el plan nuevo es
  // el actual y sale de la lista de opciones.
  const [planHecho, setPlanHecho] = useState('')
  const [cobrando, setCobrando] = useState(false)

  const plan = planes.find((p) => p.id === planId)
  const quedan = Math.max(membresia.classesTotal - membresia.classesUsed, 0)
  const pagos = data?.payments ?? []
  const memberships = data?.memberships ?? []

  // Lo mismo que la base va a exigir, para no ofrecer un botón que falla.
  const cuotaSinCobrar = pagos.some(
    (p) =>
      p.membershipId === membresia.id &&
      (p.status === 'pendiente' || p.status === 'vencido') &&
      !esOferta(p)
  )
  const siguienteAsignado = memberships.some(
    (m) =>
      m.studentId === student.id &&
      m.id !== membresia.id &&
      m.status !== 'cancelada' &&
      m.status !== 'suspendida' &&
      m.startDate > membresia.endDate
  )
  const empezoHoy = membresia.startDate === hoy
  const ofertaPendiente = pagos.some((p) => p.renuevaMembresiaId === membresia.id && esOferta(p))
  const bloqueo = cuotaSinCobrar
    ? 'La cuota de este período está sin cobrar: cobrala o anulala en Pagos antes de cambiar el plan.'
    : siguienteAsignado
      ? 'Ya tiene asignado el período siguiente (pagó por adelantado): cambiar desde hoy correría ese también. Avisanos y lo resolvemos.'
      : empezoHoy
        ? 'Este período empezó hoy: deshacelo o cancelalo y asigná el plan nuevo con «Asignar plan».'
        : null

  const confirmar = async () => {
    if (!plan) return
    setSaving(true)
    setError(null)
    try {
      const r = await cambiarPlanDesdeHoy(membresia.id, plan.id)
      setPlanHecho(plan.name)
      await refresh()
      setHecho(r)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el plan')
    } finally {
      setSaving(false)
    }
  }

  const cuotaNueva = hecho?.cuota ? pagos.find((p) => p.id === hecho.cuota) : undefined
  if (cobrando && cuotaNueva) return <CobrarModal payment={cuotaNueva} onClose={onClose} />

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
            <h2 className="text-base font-bold text-foreground">Cambiar de plan desde hoy</h2>
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

        {hecho ? (
          <div className="px-5 py-5 space-y-4 overflow-y-auto">
            <p className="text-sm text-foreground">
              Listo: desde hoy tiene <strong>{planHecho}</strong>, del {fechaCorta(hecho.desde)} al{' '}
              {fechaCorta(hecho.hasta)}.{' '}
              {hecho.cuota
                ? 'La cuota quedó en Pagos para cobrar: las promos se aplican al cobrarla.'
                : 'El plan no tiene precio, así que no hay nada que cobrar.'}
            </p>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted"
              >
                Cerrar
              </button>
              {cuotaNueva && (
                <button
                  onClick={() => setCobrando(true)}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90"
                >
                  Cobrar ahora
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="px-5 py-4 space-y-4 overflow-y-auto">
              <p className="text-xs text-muted-foreground">
                Hoy tiene <strong className="text-foreground">{membresia.planName}</strong>, del{' '}
                {fechaCorta(membresia.startDate)} al {fechaCorta(membresia.endDate)}
                {quedan > 0
                  ? `, y le quedan ${quedan} ${quedan === 1 ? 'clase' : 'clases'} sin usar.`
                  : ', y ya usó todas sus clases.'}
              </p>

              {bloqueo ? (
                <p className="text-sm text-aviso-fuerte bg-aviso-suave rounded-xl px-3 py-2.5">{bloqueo}</p>
              ) : (
                <>
                  <div className="space-y-2">
                    {planes.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setPlanId(p.id)}
                        className={cn(
                          'w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors',
                          planId === p.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'
                        )}
                      >
                        <BookOpen className="w-4 h-4 shrink-0" style={{ color: p.color }} />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-semibold text-foreground">{p.name}</span>
                          <span className="block text-[11px] text-muted-foreground">{p.classCount} clases</span>
                        </span>
                        <span className="text-sm font-bold text-foreground tabular-nums">
                          ${p.price.toLocaleString('es-AR')}
                        </span>
                      </button>
                    ))}
                  </div>

                  {plan && (
                    <div className="rounded-xl bg-muted/60 px-3 py-3 text-xs text-foreground space-y-1.5">
                      <p>
                        • El <strong>{membresia.planName}</strong> termina ayer ({fechaCorta(addDays(hoy, -1))}).
                        {quedan > 0 && (
                          <strong className="text-aviso-fuerte">
                            {' '}
                            Pierde {quedan} {quedan === 1 ? 'clase' : 'clases'} sin usar.
                          </strong>
                        )}
                      </p>
                      <p>
                        • <strong>{plan.name}</strong> arranca hoy ({fechaCorta(hoy)}) y vale hasta el{' '}
                        {fechaCorta(vigenciaHasta(hoy, plan))}, con {plan.classCount} clases. Renueva el
                        día {Number(hoy.slice(8, 10))} de cada mes.
                      </p>
                      <p>
                        • Queda la cuota de <strong>${plan.price.toLocaleString('es-AR')}</strong> en Pagos para
                        cobrar; las promos se aplican al cobrarla.
                      </p>
                      {ofertaPendiente && <p>• El aviso de renovación del {membresia.planName} se anula.</p>}
                      <p className="text-muted-foreground">
                        Las reservas que ya tiene siguen igual y no le descuentan clases del plan nuevo.
                      </p>
                    </div>
                  )}
                </>
              )}

              {error && <p className="text-xs text-destructive-fuerte">{error}</p>}
            </div>

            <div className="flex gap-2 px-5 py-4 border-t border-border shrink-0">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                onClick={confirmar}
                disabled={!plan || saving || !!bloqueo}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Cambiar desde hoy
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
