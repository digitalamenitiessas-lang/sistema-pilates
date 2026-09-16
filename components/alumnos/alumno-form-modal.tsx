'use client'

import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { useData } from '@/lib/data-context'
import { createStudent, updateStudent } from '@/lib/api'
import type { Student } from '@/lib/types'

interface AlumnoFormModalProps {
  student?: Student // si viene, es edición
  onClose: () => void
}

export function AlumnoFormModal({ student, onClose }: AlumnoFormModalProps) {
  const { data, refresh } = useData()
  const plans = data?.plans ?? []
  const settings = data?.settings ?? {}

  const [name, setName] = useState(student?.name ?? '')
  const [email, setEmail] = useState(student?.email ?? '')
  const [phone, setPhone] = useState(student?.phone ?? '')
  const [dni, setDni] = useState(student?.dni ?? '')
  const [birthdate, setBirthdate] = useState(student?.birthdate ?? '')
  const [observations, setObservations] = useState(student?.observations ?? '')
  const [medicalNotes, setMedicalNotes] = useState(student?.medicalNotes ?? '')
  const [emergencyContact, setEmergencyContact] = useState(student?.emergencyContact ?? '')
  // Los cuatro campos de salud (0050). Antes era todo un párrafo suelto.
  const [lesiones, setLesiones] = useState(student?.lesiones ?? '')
  const [embarazo, setEmbarazo] = useState(student?.embarazo ?? '')
  const [cirugias, setCirugias] = useState(student?.cirugias ?? '')
  const [medicacion, setMedicacion] = useState(student?.medicacion ?? '')
  const [planId, setPlanId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEdit = !!student

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const input = {
        name, email, phone, dni, birthdate, observations,
        medicalNotes, emergencyContact,
        lesiones, embarazo, cirugias, medicacion,
      }
      if (isEdit) {
        await updateStudent(student.id, input)
      } else {
        await createStudent({ ...input, planId: planId || undefined }, plans, settings)
      }
      await refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el cliente')
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
            {isEdit ? 'Editar cliente' : 'Nuevo cliente'}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelClass}>Nombre completo *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ej: Ana García" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ana@gmail.com" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Teléfono</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+54 ..." className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>DNI</label>
              <input value={dni} onChange={(e) => setDni(e.target.value)} placeholder="30.123.456" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Fecha de nacimiento</label>
              <input type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Observaciones</label>
            <textarea rows={2} value={observations} onChange={(e) => setObservations(e.target.value)} placeholder="Preferencias, horarios..." className={`${inputClass} resize-none`} />
          </div>

          {/* Salud, en campos propios (0050). Puestos así se pueden
              filtrar y se encuentran rápido en una clase; en un párrafo
              suelto no se puede ninguna de las dos cosas. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Lesiones</label>
              <input value={lesiones} onChange={(e) => setLesiones(e.target.value)} placeholder="Hernia lumbar, hombro derecho..." className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Embarazo</label>
              <input value={embarazo} onChange={(e) => setEmbarazo(e.target.value)} placeholder="6 meses, o vacío" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Cirugías</label>
              <input value={cirugias} onChange={(e) => setCirugias(e.target.value)} placeholder="Cesárea 2024..." className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Medicación</label>
              <input value={medicacion} onChange={(e) => setMedicacion(e.target.value)} placeholder="Anticoagulantes..." className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Otras observaciones de salud</label>
            <textarea rows={2} value={medicalNotes} onChange={(e) => setMedicalNotes(e.target.value)} placeholder="Lo que no entra en los campos de arriba..." className={`${inputClass} resize-none`} />
          </div>

          {/* Existía en la base desde la 0008 y no había forma de cargarlo.
              Va con las notas médicas porque comparte su protección: las
              dos viven en `student_private`. */}
          <div>
            <label className={labelClass}>Contacto de emergencia</label>
            <input
              value={emergencyContact}
              onChange={(e) => setEmergencyContact(e.target.value)}
              placeholder="Nombre, vínculo y teléfono"
              className={inputClass}
            />
            <p className="text-[11px] text-muted-foreground mt-1.5">
              A quién llamar si le pasa algo en clase. Queda protegido como las notas médicas.
            </p>
          </div>

          {!isEdit && (
            <div>
              <label className={labelClass}>Asignar plan (opcional)</label>
              <select value={planId} onChange={(e) => setPlanId(e.target.value)} className={inputClass}>
                <option value="">Sin plan por ahora</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — ${p.price.toLocaleString('es-AR')}
                    {p.isTrial ? ' (prueba)' : ''}
                  </option>
                ))}
              </select>
              {planId && (
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Se crea la membresía desde hoy y queda la deuda generada en Pagos (si el plan no es gratuito).
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive-fuerte bg-destructive/10 rounded-xl px-3 py-2">{error}</p>
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
            {isEdit ? 'Guardar cambios' : 'Crear cliente'}
          </button>
        </div>
      </form>
    </div>
  )
}
