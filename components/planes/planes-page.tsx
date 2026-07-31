'use client'

import { useState } from 'react'
import {
  Plus,
  Check,
  CalendarDays,
  BookOpen,
  Users,
  Star,
  Clock,
  X,
  Edit3,
  Trash2,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useData, useStudio } from '@/lib/data-context'
import { createPlan, updatePlan, deactivatePlan, type PlanInput } from '@/lib/api'
import type { Plan, Discipline } from '@/lib/types'

type Tab = 'planes' | 'membresias'

const ALL_DISCIPLINES: Discipline[] = [
  'Pilates Mat',
  'Pilates Reformer',
  'Pilates Clínico',
  'Yoga',
  'Stretching',
  'Funcional',
]

const PLAN_COLORS = ['#C4735A', '#7D9B76', '#D4A854', '#9B6E8E', '#5E8FA8', '#B8956A']

function PlanCard({ plan, onEdit, onDelete }: { plan: Plan; onEdit: () => void; onDelete: () => void }) {
  const { memberships } = useStudio()
  const activeCount = memberships.filter(
    (m) => m.planId === plan.id && (m.status === 'activa' || m.status === 'por vencer')
  ).length

  return (
    <div
      className={cn(
        'bg-card rounded-2xl border overflow-hidden transition-all hover:shadow-lg relative',
        plan.popular ? 'border-primary shadow-md' : 'border-border'
      )}
    >
      {plan.popular && (
        <div className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
          <Star className="w-2.5 h-2.5" />
          Popular
        </div>
      )}
      {plan.isTrial && (
        <div className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent text-accent-foreground text-[10px] font-bold">
          Clase de prueba
        </div>
      )}

      {/* Color bar */}
      <div className="h-1.5" style={{ backgroundColor: plan.color }} />

      <div className="p-5">
        <div className="mb-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
            style={{ backgroundColor: `${plan.color}18` }}
          >
            <BookOpen className="w-5 h-5" style={{ color: plan.color }} />
          </div>
          <h3 className="text-base font-bold text-foreground">{plan.name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{plan.description}</p>
        </div>

        <div className="text-3xl font-bold text-foreground mb-1">
          {plan.price === 0 ? (
            'Gratis'
          ) : (
            <>
              ${plan.price.toLocaleString('es-AR')}
              <span className="text-sm font-normal text-muted-foreground">/mes</span>
            </>
          )}
        </div>

        <div className="space-y-2 my-4">
          <div className="flex items-center gap-2 text-sm">
            <Check className="w-4 h-4 shrink-0" style={{ color: plan.color }} />
            <span className="text-foreground font-medium">
              {plan.classCount} clase{plan.classCount !== 1 ? 's' : ''}{plan.isTrial ? '' : ' por mes'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <CalendarDays className="w-4 h-4 shrink-0" style={{ color: plan.color }} />
            <span className="text-muted-foreground">Vigencia {plan.durationDays} días</span>
          </div>
          {plan.price > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 shrink-0" style={{ color: plan.color }} />
              <span className="text-muted-foreground">
                ${Math.round(plan.price / plan.classCount).toLocaleString('es-AR')} por clase
              </span>
            </div>
          )}
        </div>

        {/* Disciplines */}
        <div className="flex flex-wrap gap-1 mb-4">
          {plan.disciplines.map((d) => (
            <span
              key={d}
              className="text-[10px] font-medium px-2 py-0.5 rounded-full"
              style={{ backgroundColor: `${plan.color}18`, color: plan.color }}
            >
              {d}
            </span>
          ))}
        </div>

        {/* Active members */}
        <div className="flex items-center justify-between py-3 border-t border-border">
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              <strong className="text-foreground">{activeCount}</strong> alumno
              {activeCount !== 1 ? 's' : ''} activo{activeCount !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onEdit}
              className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onDelete}
              className="w-8 h-8 rounded-lg hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PlanFormModal({ plan, onClose }: { plan?: Plan; onClose: () => void }) {
  const { refresh } = useData()
  const isEdit = !!plan

  const [name, setName] = useState(plan?.name ?? '')
  const [price, setPrice] = useState(plan ? String(plan.price) : '')
  const [classCount, setClassCount] = useState(plan ? String(plan.classCount) : '')
  const [durationDays, setDurationDays] = useState(plan ? String(plan.durationDays) : '30')
  const [color, setColor] = useState(plan?.color ?? PLAN_COLORS[0])
  const [disciplines, setDisciplines] = useState<Discipline[]>(plan?.disciplines ?? [])
  const [description, setDescription] = useState(plan?.description ?? '')
  const [isTrial, setIsTrial] = useState(plan?.isTrial ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleDiscipline = (d: Discipline) => {
    setDisciplines((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (disciplines.length === 0) {
      setError('Seleccioná al menos una disciplina')
      return
    }
    setSaving(true)
    setError(null)
    const input: PlanInput = {
      name,
      price: Number(price) || 0,
      classCount: Number(classCount) || 1,
      durationDays: Number(durationDays) || 30,
      disciplines,
      description,
      color,
      isTrial,
    }
    try {
      if (isEdit) {
        await updatePlan(plan.id, input)
      } else {
        await createPlan(input)
      }
      await refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el plan')
      setSaving(false)
    }
  }

  const inputClass =
    'w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors'
  const labelClass =
    'text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-card rounded-2xl shadow-2xl w-full max-w-lg border border-border overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-bold text-foreground">
            {isEdit ? 'Editar plan' : 'Nuevo plan'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelClass}>Nombre del plan *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ej: Reformer Plus" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Precio mensual ($)</label>
              <input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} required placeholder="25000" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Cantidad de clases</label>
              <input type="number" min="1" value={classCount} onChange={(e) => setClassCount(e.target.value)} required placeholder="8" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Vigencia (días)</label>
              <input type="number" min="1" value={durationDays} onChange={(e) => setDurationDays(e.target.value)} required placeholder="30" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Color</label>
              <div className="flex gap-2 pt-1">
                {PLAN_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={cn(
                      'w-6 h-6 rounded-full border-2 transition-colors',
                      color === c ? 'border-foreground' : 'border-transparent hover:border-foreground/30'
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className={labelClass}>Disciplinas habilitadas *</label>
            <div className="flex flex-wrap gap-2">
              {ALL_DISCIPLINES.map((d) => {
                const active = disciplines.includes(d)
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDiscipline(d)}
                    className={cn(
                      'px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors',
                      active
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                    )}
                  >
                    {d}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className={labelClass}>Descripción</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descripción del plan..."
              className={`${inputClass} resize-none`}
            />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={isTrial}
              onChange={(e) => setIsTrial(e.target.checked)}
              className="w-4 h-4 accent-[var(--primary)]"
            />
            <span className="text-sm text-foreground">
              Es clase de prueba <span className="text-muted-foreground">(opción inicial para nuevos alumnos)</span>
            </span>
          </label>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">{error}</p>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-border shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? 'Guardar cambios' : 'Crear plan'}
          </button>
        </div>
      </form>
    </div>
  )
}

export function PlanesPage() {
  const { refresh } = useData()
  const { plans: PLANS, memberships, students } = useStudio()
  const [activeTab, setActiveTab] = useState<Tab>('planes')
  const [showForm, setShowForm] = useState(false)
  const [editingPlan, setEditingPlan] = useState<Plan | undefined>(undefined)

  const activeMemberships = memberships.filter(
    (m) =>
      (m.status === 'activa' || m.status === 'por vencer') &&
      students.find((s) => s.id === m.studentId)?.membership?.id === m.id
  )

  const handleDelete = async (plan: Plan) => {
    if (!window.confirm(`¿Desactivar el plan "${plan.name}"? Las membresías existentes no se modifican.`)) return
    await deactivatePlan(plan.id)
    await refresh()
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tabs + action */}
      <div className="px-6 py-4 border-b border-border bg-card flex items-center justify-between gap-3">
        <div className="flex gap-1 p-1 bg-muted rounded-xl">
          <button
            onClick={() => setActiveTab('planes')}
            className={cn(
              'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
              activeTab === 'planes'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Planes ({PLANS.length})
          </button>
          <button
            onClick={() => setActiveTab('membresias')}
            className={cn(
              'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
              activeTab === 'membresias'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Membresías activas ({activeMemberships.length})
          </button>
        </div>

        {activeTab === 'planes' && (
          <button
            onClick={() => {
              setEditingPlan(undefined)
              setShowForm(true)
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nuevo plan</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'planes' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {PLANS.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                onEdit={() => {
                  setEditingPlan(plan)
                  setShowForm(true)
                }}
                onDelete={() => handleDelete(plan)}
              />
            ))}
          </div>
        )}

        {activeTab === 'membresias' && (
          <div className="space-y-2 max-w-3xl">
            {activeMemberships.length === 0 && (
              <div className="text-center py-12 text-sm text-muted-foreground">
                No hay membresías activas
              </div>
            )}
            {activeMemberships.map((m) => {
              const student = students.find((s) => s.id === m.studentId)
              const pct = Math.round((m.classesUsed / m.classesTotal) * 100)
              const plan = PLANS.find((p) => p.id === m.planId)
              return (
                <div
                  key={m.id}
                  className="bg-card border border-border rounded-2xl p-4 flex items-center gap-4"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-primary font-bold text-sm">{student?.avatar ?? '?'}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {student?.name}
                      </p>
                      <span
                        className={cn(
                          'text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0',
                          m.status === 'activa' ? 'bg-[#E8F2EB] text-[#2E6040]' : 'bg-amber-100 text-amber-700'
                        )}
                      >
                        {m.status === 'activa' ? 'Activa' : 'Por vencer'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: plan?.color ?? '#C4735A' }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {m.classesUsed}/{m.classesTotal}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{m.planName}</span>
                      <span>Vence {m.endDate}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showForm && (
        <PlanFormModal plan={editingPlan} onClose={() => setShowForm(false)} />
      )}
    </div>
  )
}
