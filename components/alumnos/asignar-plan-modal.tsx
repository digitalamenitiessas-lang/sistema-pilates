'use client'

import { useState } from 'react'
import { X, Loader2, BookOpen } from 'lucide-react'
import { cn, cuantoDura } from '@/lib/utils'
import { useData } from '@/lib/data-context'
import { assignMembership, addDays, hoyISO } from '@/lib/api'
import type { Membership, Student } from '@/lib/types'

interface AsignarPlanModalProps {
  student: Student
  onClose: () => void
}

export function AsignarPlanModal({ student, onClose }: AsignarPlanModalProps) {
  const { data, refresh } = useData()
  const plans = data?.plans ?? []
  const settings = data?.settings ?? {}
  const memberships = data?.memberships ?? []
  // Solo se preselecciona el plan actual si sigue estando entre los activos.
  // Si se dio de baja —que es lo que va a pasar con los planes de demo— el
  // botón quedaba habilitado apuntando a un id que la base rechaza, y el
  // error recién aparecía al guardar.
  const [planId, setPlanId] = useState(() => {
    const actual = student.membership?.planId
    return actual && plans.some((p) => p.id === actual) ? actual : ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hoy = hoyISO()
  /** El `T00:00` evita que un ISO suelto se lea como UTC y muestre el día anterior. */
  const fecha = (iso: string) => new Date(`${iso}T00:00`).toLocaleDateString('es-AR')
  const plan = plans.find((p) => p.id === planId)

  // Qué día va a arrancar, para no prometerle "arranca hoy" a quien está
  // pagando adelantado. La base es la que decide (trigger memberships_fechas,
  // 0036 y 0037) y acá se repite su cuenta exacta, que es el MÁXIMO end_date
  // de las membresías que le siguen vivas — no la que cubre hoy. La
  // diferencia se paga en el mostrador: con la actual hasta el 19/10 y otra
  // ya encolada hasta el 19/11, mirar `student.membership` anunciaba el
  // 20/10 y la base la creaba arrancando el 20/11.
  //
  // Los pases de prueba quedan fuera de los dos lados del encolado (0037):
  // ni empujan a una mensualidad ni se encolan detrás de una. Un plan que no
  // viaja en el paquete —dado de baja, `plans` solo trae los activos— se
  // cuenta como mensualidad, que es lo que es en casi todos los casos.
  const esPrueba = (idDelPlan: string) => plans.find((p) => p.id === idDelPlan)?.isTrial === true
  const ultima = memberships
    .filter(
      (m) =>
        m.studentId === student.id &&
        // El trigger pide status = 'activa' y end_date >= el día que entra:
        // en la base los únicos estados guardados son 'activa' y
        // 'suspendida', y 'vencida' se deriva de la fecha al leer.
        m.status !== 'suspendida' &&
        m.endDate >= hoy &&
        !esPrueba(m.planId)
    )
    .reduce<Membership | null>((max, m) => (max === null || m.endDate > max.endDate ? m : max), null)
  const arranca = plan && !plan.isTrial && ultima ? addDays(ultima.endDate, 1) : null

  // El encolado alcanza también al cambio de plan, y eso sigue sin resolver
  // a propósito (lo explica la 0037): hace falta que el estudio decida qué
  // pasa con lo que le queda del plan viejo. Mientras no esté decidido, lo
  // único honesto es que quien cobra lo sepa antes de cobrar.
  const cambioDePlan = !!plan && !!ultima && !!arranca && ultima.planId !== plan.id

  const handleSubmit = async () => {
    if (!planId) return
    setSaving(true)
    setError(null)
    try {
      await assignMembership(student.id, planId, plans, settings)
      await refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo asignar el plan')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-2xl shadow-2xl w-full max-w-md border border-border overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">Asignar plan</h2>
            <p className="text-xs text-muted-foreground">{student.name}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-2 overflow-y-auto">
          {plans.map((p) => (
            <button
              key={p.id}
              onClick={() => setPlanId(p.id)}
              className={cn(
                'w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all',
                planId === p.id
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border hover:border-primary/40'
              )}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${p.color}18` }}
              >
                <BookOpen className="w-4 h-4" style={{ color: p.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {p.name}
                  {p.isTrial && (
                    <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-accent/15 text-accent">
                      Prueba
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {p.classCount} clase{p.classCount !== 1 ? 's' : ''} ·{' '}
                  {cuantoDura(p)}
                </p>
              </div>
              <p className="text-sm font-bold text-foreground shrink-0">
                {p.price === 0 ? 'Gratis' : `$${p.price.toLocaleString('es-AR')}`}
              </p>
            </button>
          ))}

          {plans.length === 0 && (
            <p className="text-sm text-muted-foreground bg-muted rounded-xl px-3 py-3 text-center">
              No hay planes activos para asignar. Creá uno en Planes, o reactivá
              alguno de los que están dados de baja.
            </p>
          )}

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">{error}</p>
          )}
          {cambioDePlan && plan && ultima && arranca && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
              <span className="font-semibold">{plan.name}</span> no es el plan del último período que
              ya tiene asignado ({ultima.planName}), así que esto es un cambio de plan — y el cambio
              de plan también se encola: paga hoy y lo empieza a usar el {fecha(arranca)}. Hasta ese
              día sigue con las clases de los períodos que ya tiene asignados. El sistema todavía no
              sabe adelantar un cambio de plan: decíselo antes de cobrarle.
            </p>
          )}

          {plans.length > 0 && (
            <p className="text-[11px] text-muted-foreground pt-1">
              {!plan
                ? 'Elegí un plan para ver desde qué día va a estar vigente.'
                : plan.isTrial
                ? 'El pase de prueba arranca hoy: no se encola detrás de lo que ya tenga.'
                : arranca && ultima
                ? `La membresía arranca el ${fecha(arranca)}, el día siguiente al último período que ya tiene asignado (termina el ${fecha(ultima.endDate)}): pagar antes no le corta el mes.`
                : 'La membresía arranca hoy.'}{' '}
              Si el plan tiene precio, la deuda queda generada en Pagos para cobrarla.
            </p>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-border shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!planId || saving}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Asignar
          </button>
        </div>
      </div>
    </div>
  )
}
