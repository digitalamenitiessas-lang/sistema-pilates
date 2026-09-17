'use client'

import { useState } from 'react'
import { X, Loader2, Smartphone } from 'lucide-react'
import { useData } from '@/lib/data-context'
import { createStudent, createSystemUser, updateStudent } from '@/lib/api'
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
  /**
   * El acceso, como último paso del alta (pedido del estudio, 17/09).
   *
   * Antes era un segundo viaje: se cargaba la ficha, se entraba a ella y
   * ahí estaba el botón. Se probó el circuito cargando un cliente y
   * esperando el mail, que nunca salió — porque el mail sale con el
   * acceso, no con la ficha. Dos pasos que parecían uno.
   *
   * Prendido por defecto: el caso normal es que la clienta entre al
   * portal. Se apaga para quien no tiene mail o no lo quiere.
   */
  const [conAcceso, setConAcceso] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const isEdit = !!student

  // El acceso necesita las dos cosas: el mail es el usuario y el
  // documento es la contraseña inicial.
  const dniLimpio = dni.replace(/\D/g, '')
  const puedeAcceso = !isEdit && conAcceso
  const faltaParaAcceso = puedeAcceso
    ? !email.trim()
      ? 'el email'
      : dniLimpio.length < 6
        ? 'el DNI'
        : null
    : null

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
        await refresh()
        onClose()
        return
      }

      const studentId = await createStudent(
        { ...input, planId: planId || undefined },
        plans,
        settings
      )

      // El acceso va después y aparte: si falla, la ficha ya está guardada
      // —con su plan y su cuota— y lo único que queda pendiente es el
      // acceso, que se reintenta desde la ficha. Meterlo en el mismo try
      // sin distinguir haría perder el alta por un mail mal escrito.
      if (puedeAcceso) {
        try {
          const r = await createSystemUser({
            email: email.trim(),
            fullName: name,
            role: 'alumno',
            studentId,
          })
          await refresh()
          if (!r.mailEnviado) {
            // El motivo va primero y completo: es lo único que dice si hay
            // que ir a Vercel, a Resend o a corregir la ficha. Antes este
            // cartel decía sólo "no se pudo enviar" y había que adivinar.
            setAviso(
              `Cliente creado y acceso creado, pero el mail no salió. ${r.mailMotivo ?? ''}` +
                ` Mientras tanto pasale el acceso a mano: entra con ${email.trim()} y su documento, y al entrar le vamos a pedir que la cambie. También podés reintentar el mail desde su ficha.`
            )
            setSaving(false)
            return
          }
        } catch (err) {
          await refresh()
          setAviso(
            `El cliente se creó bien, pero el acceso no: ${
              err instanceof Error ? err.message : 'error desconocido'
            }. Se puede crear desde su ficha.`
          )
          setSaving(false)
          return
        }
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

          {/* El acceso al portal, como último paso del alta */}
          {!isEdit && (
            <div className="rounded-xl border border-border px-3.5 py-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={conAcceso}
                  onChange={(e) => setConAcceso(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[var(--color-primary)]"
                />
                <span className="min-w-0">
                  <span className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-primary-fuerte" />
                    Crearle el acceso y avisarle por mail
                  </span>
                  <span className="block text-[11px] text-muted-foreground mt-1">
                    Entra con su email y{' '}
                    <span className="font-semibold">su documento como contraseña</span>. Le llega un
                    mail con cómo entrar, y al ingresar le vamos a pedir que elija una propia.
                  </span>
                </span>
              </label>

              {faltaParaAcceso && (
                <p className="text-[11px] font-semibold text-aviso-fuerte mt-2">
                  Para crearle el acceso falta {faltaParaAcceso}. Completalo arriba, o destildá esta
                  opción y creale el acceso más adelante desde su ficha.
                </p>
              )}
            </div>
          )}

          {aviso && (
            <p className="text-sm text-aviso-fuerte bg-aviso-suave rounded-xl px-3 py-2.5">{aviso}</p>
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
            disabled={saving || !!faltaParaAcceso}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit
              ? 'Guardar cambios'
              : puedeAcceso
                ? 'Crear cliente y avisarle'
                : 'Crear cliente'}
          </button>
        </div>
      </form>
    </div>
  )
}
