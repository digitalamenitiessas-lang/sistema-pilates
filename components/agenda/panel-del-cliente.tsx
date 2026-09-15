'use client'

/**
 * La ficha rápida que se abre en Agenda, sobre la clase.
 *
 * Del pedido del estudio del 15/09, §1, y textual: *"La recepción no
 * debería tener que salir de Agenda y recorrer varios módulos para
 * resolver una alumna que está físicamente en el estudio."*
 *
 * Las cinco cosas que pidió poder hacer acá —renovar, cambiar plan,
 * registrar pago, actualizar vencimiento y consultar clases
 * disponibles— **ya existían todas**, repartidas entre Alumnos, Planes y
 * Pagos. Lo que faltaba era el lugar, no las funciones.
 *
 * Por eso esto NO reimplementa nada: monta los modales que ya usan las
 * otras pantallas. Es la regla que ordena el archivo — un panel que
 * hiciera de todo por su cuenta terminaría con su propia versión del
 * ajuste por medio de pago o del encolado de períodos, y dos versiones
 * de una regla de negocio se desincronizan sin avisar.
 */

import { useState } from 'react'
import { CreditCard, RefreshCw, CalendarClock, Loader2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useData, useStudio } from '@/lib/data-context'
import { AsignarPlanModal } from '@/components/alumnos/asignar-plan-modal'
import { RegistrarPagoModal, CobrarModal } from '@/components/pagos/pagos-page'
import { esOferta, moverVencimiento, hoyISO } from '@/lib/api'
import type { Student, Payment } from '@/lib/types'

/** El `T00:00` evita que un ISO suelto se lea como UTC y muestre el día anterior. */
const fecha = (iso: string) => new Date(`${iso}T00:00`).toLocaleDateString('es-AR')

/** Cuántos días faltan para esa fecha, en el huso del estudio. */
function diasHasta(iso: string): number {
  const hoy = hoyISO()
  const ms = new Date(`${iso}T00:00`).getTime() - new Date(`${hoy}T00:00`).getTime()
  return Math.round(ms / 86400000)
}

function MoverVencimiento({
  membershipId,
  actual,
  onListo,
  onCancelar,
}: {
  membershipId: string
  actual: string
  onListo: () => void
  onCancelar: () => void
}) {
  const [nueva, setNueva] = useState(actual)
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const guardar = async () => {
    setSaving(true)
    setError(null)
    try {
      await moverVencimiento(membershipId, nueva, motivo)
      onListo()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo mover el vencimiento')
      setSaving(false)
    }
  }

  const corrimiento = diasHasta(nueva) - diasHasta(actual)

  return (
    <div className="rounded-xl border border-aviso/50 bg-aviso-suave px-3 py-2.5 space-y-2">
      <p className="text-[11px] font-bold text-aviso-fuerte">Mover el vencimiento</p>
      <input
        type="date"
        value={nueva}
        onChange={(e) => setNueva(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none focus:border-primary"
      />
      {corrimiento !== 0 && (
        <p className="text-[10px] text-aviso-fuerte">
          {corrimiento > 0
            ? `Le da ${corrimiento} día${corrimiento === 1 ? '' : 's'} más para usar las clases que le quedan. No suma clases: el plan es el mismo.`
            : `Le saca ${-corrimiento} día${corrimiento === -1 ? '' : 's'}.`}
        </p>
      )}
      <input
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Motivo (ej: estuvo enferma dos semanas)"
        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none focus:border-primary"
      />
      <p className="text-[10px] text-aviso-fuerte/90">
        Queda tu nombre y el motivo. El cliente ve el motivo desde su portal.
      </p>
      {error && <p className="text-[11px] text-destructive-fuerte">{error}</p>}
      <div className="flex gap-2">
        <button
          disabled={saving || !motivo.trim() || nueva === actual}
          onClick={guardar}
          className="flex-1 py-2 rounded-lg text-xs font-semibold bg-aviso-fuerte text-background disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Guardar
        </button>
        <button
          onClick={onCancelar}
          className="px-3 py-2 rounded-lg text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

export function PanelDelCliente({ student }: { student: Student }) {
  const { refresh, can, canWrite } = useData()
  const { memberships, payments } = useStudio()

  const [asignando, setAsignando] = useState(false)
  const [registrando, setRegistrando] = useState(false)
  const [cobrando, setCobrando] = useState<Payment | null>(null)
  const [moviendo, setMoviendo] = useState(false)

  // La que manda es la misma que elige la base para cobrar la clase de
  // hoy: activa, vigente hoy, y si hay más de una la que vence antes.
  const hoy = hoyISO()
  const vigente = memberships
    .filter(
      (m) => m.studentId === student.id && m.status === 'activa' && hoy >= m.startDate && hoy <= m.endDate
    )
    .sort((a, b) => a.endDate.localeCompare(b.endDate))[0]

  // Deuda de verdad, no la oferta de renovación: esa cobra un período que
  // todavía no existe —lo crea el pago— así que no se puede exigir (0041).
  const deudas = payments.filter(
    (p) => p.studentId === student.id && (p.status === 'pendiente' || p.status === 'vencido') && !esOferta(p)
  )
  const debe = deudas.reduce((t, p) => t + p.amount, 0)

  const restantes = vigente ? Math.max(0, vigente.classesTotal - vigente.classesUsed) : 0
  const dias = vigente ? diasHasta(vigente.endDate) : 0

  const cerrar = async () => {
    setMoviendo(false)
    await refresh()
  }

  const botonClase =
    'flex-1 py-2 rounded-lg text-[11px] font-semibold border border-border text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-1.5'

  return (
    <>
      <div className="rounded-xl border border-border bg-muted/40 px-3 py-2.5 space-y-2">
        {/* Las cuatro preguntas que el mostrador tiene que poder contestar
            con la clienta parada adelante: qué plan, hasta cuándo, cuántas
            le quedan, y si debe. */}
        {vigente ? (
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-bold text-foreground truncate">{vigente.planName}</p>
            <p className="text-[11px] text-muted-foreground shrink-0">
              {restantes} de {vigente.classesTotal}
            </p>
          </div>
        ) : (
          <p className="text-xs font-bold text-aviso-fuerte">Sin membresía vigente</p>
        )}

        {vigente && (
          <p
            className={cn(
              'text-[11px]',
              dias < 0
                ? 'text-destructive-fuerte'
                : dias <= 5
                ? 'text-aviso-fuerte'
                : 'text-muted-foreground'
            )}
          >
            {dias < 0
              ? `Venció el ${fecha(vigente.endDate)}`
              : dias === 0
              ? `Vence hoy, ${fecha(vigente.endDate)}`
              : `Vence el ${fecha(vigente.endDate)} · ${dias} día${dias === 1 ? '' : 's'}`}
            {vigente.endDateMotivo ? ` · movido: ${vigente.endDateMotivo}` : ''}
          </p>
        )}

        {debe > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-2.5 py-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-destructive-fuerte shrink-0" />
            <p className="text-[11px] font-semibold text-destructive-fuerte flex-1">
              Debe ${debe.toLocaleString('es-AR')}
              {deudas.length > 1 ? ` en ${deudas.length} cuotas` : ''}
            </p>
            {canWrite && (
              <button
                onClick={() => setCobrando(deudas[0])}
                className="text-[11px] font-bold text-destructive-fuerte underline shrink-0"
              >
                Cobrar
              </button>
            )}
          </div>
        )}

        {moviendo && vigente ? (
          <MoverVencimiento
            membershipId={vigente.id}
            actual={vigente.endDate}
            onListo={cerrar}
            onCancelar={() => setMoviendo(false)}
          />
        ) : (
          <div className="flex gap-1.5">
            {(can('membresias.asignar') || canWrite) && (
              <button onClick={() => setAsignando(true)} className={botonClase}>
                <RefreshCw className="w-3 h-3 shrink-0" />
                {vigente ? 'Renovar' : 'Asignar plan'}
              </button>
            )}
            {(can('pagos.registrar') || canWrite) && (
              <button onClick={() => setRegistrando(true)} className={botonClase}>
                <CreditCard className="w-3 h-3 shrink-0" />
                Cobrar
              </button>
            )}
            {vigente && (can('membresias.editar') || canWrite) && (
              <button onClick={() => setMoviendo(true)} className={botonClase}>
                <CalendarClock className="w-3 h-3 shrink-0" />
                Vencimiento
              </button>
            )}
          </div>
        )}
      </div>

      {/* Los modales de siempre, los mismos que abren Alumnos y Pagos. */}
      {asignando && <AsignarPlanModal student={student} onClose={() => { setAsignando(false); refresh() }} />}
      {registrando && (
        <RegistrarPagoModal student={student} onClose={() => { setRegistrando(false); refresh() }} />
      )}
      {cobrando && <CobrarModal payment={cobrando} onClose={() => { setCobrando(null); refresh() }} />}
    </>
  )
}
