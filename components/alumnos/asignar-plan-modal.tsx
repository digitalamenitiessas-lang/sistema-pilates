'use client'

import { useState } from 'react'
import { X, Loader2, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useData } from '@/lib/data-context'
import { assignMembership } from '@/lib/api'
import type { Student } from '@/lib/types'

interface AsignarPlanModalProps {
  student: Student
  onClose: () => void
}

export function AsignarPlanModal({ student, onClose }: AsignarPlanModalProps) {
  const { data, refresh } = useData()
  const plans = data?.plans ?? []
  const [planId, setPlanId] = useState(student.membership?.planId ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!planId) return
    setSaving(true)
    setError(null)
    try {
      await assignMembership(student.id, planId, plans)
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
                  {p.classCount} clases · {p.durationDays} días
                </p>
              </div>
              <p className="text-sm font-bold text-foreground shrink-0">
                {p.price === 0 ? 'Gratis' : `$${p.price.toLocaleString('es-AR')}`}
              </p>
            </button>
          ))}

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">{error}</p>
          )}
          <p className="text-[11px] text-muted-foreground pt-1">
            La membresía arranca hoy. Si el plan tiene precio, la deuda queda generada en Pagos para cobrarla.
          </p>
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
