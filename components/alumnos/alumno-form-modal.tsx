'use client'

import { useRef, useState } from 'react'
import { X, Loader2, Smartphone } from 'lucide-react'
import { useData } from '@/lib/data-context'
import { createStudent, createSystemUser, hoyISO, updateStudent, vigenciaHasta, cobrarCuota, AltaIncompleta } from '@/lib/api'
import { MethodPicker } from '@/components/pagos/pagos-page'
import type { Student } from '@/lib/types'

interface AlumnoFormModalProps {
  student?: Student // si viene, es edición
  onClose: () => void
}

export function AlumnoFormModal({ student, onClose }: AlumnoFormModalProps) {
  const { data, refresh, can } = useData()
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
   * Desde qué día corre el plan que se elige en el alta. Por defecto hoy.
   *
   * El estudio abre el 29/09 y carga las clientas la semana anterior
   * (pedido del 22/09): sin esto, el plan les empezaba a correr el día
   * que las cargan y perdían la semana de antes.
   */
  const [planDesde, setPlanDesde] = useState(hoyISO())
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
  /**
   * Con qué paga, si paga acá (pedido del estudio del 17/09: "ponemos si
   * paga ahí y cómo paga para que se acredite"). Null = no paga ahora y
   * la cuota queda pendiente en Pagos, que es como funcionaba hasta hoy.
   *
   * Apagado por defecto a propósito: el alta tiene que poder terminar sin
   * plata de por medio —alguien que se anota y paga mañana— y el camino
   * de siempre no puede volverse el excepcional.
   */
  const [metodo, setMetodo] = useState<string | null>(null)
  const [cupon, setCupon] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  /**
   * Lo que este formulario ya creó. Una vez que hay ficha, el botón de
   * abajo deja de crear clientes: sigue con lo que falte —el cobro, el
   * acceso— o cierra.
   *
   * Antes el alta terminaba con un cartel y el formulario abierto con
   * "Crear cliente y avisarle" activo: tanto al salir bien con cobro
   * (para mostrar el comprobante) como ante cualquier falla. Un segundo
   * clic era otra ficha, otra membresía, otra cuota y otro cobro, y la
   * base no lo frena porque no hay unicidad por DNI ni por mail.
   */
  const [creado, setCreado] = useState<{
    studentId: string
    paymentId: string | null
    /**
     * Lo que el alta no llegó a guardar (AltaIncompleta), dicho para el
     * mostrador. Se repite en cada cartel de después y hace que el
     * formulario no se cierre solo: si no, "Crear el acceso" lo borraba y
     * cerraba como si todo hubiera salido bien.
     */
    falta: string | null
  } | null>(null)
  /**
   * El id de la ficha, elegido acá una sola vez (ver `NewStudentInput.id`).
   * Sin `randomUUID` —un navegador muy viejo o una página sin https— lo
   * elige la base, como siempre.
   */
  const [idFicha] = useState(() =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : undefined
  )
  const [cobroHecho, setCobroHecho] = useState(false)
  const [accesoHecho, setAccesoHecho] = useState(false)
  /** El texto del cobro ya hecho, para no perderlo en los carteles de después. */
  const [cobroTexto, setCobroTexto] = useState<string | null>(null)
  /**
   * `saving` apaga el botón, pero recién en el render siguiente. Esto
   * corta en el acto: dos clics seguidos no pueden arrancar dos altas.
   */
  const enCurso = useRef(false)

  const isEdit = !!student
  const planElegido = plans.find((p) => p.id === planId)
  /** El `T00:00` evita que un ISO suelto se lea como UTC y muestre el día anterior. */
  const fechaCorta = (iso: string) =>
    new Date(`${iso}T00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })

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

  /**
   * Con la ficha ya creada y sin mail o documento, el acceso no se puede
   * crear desde acá: los campos están trabados. Sin este corte el tilde
   * se prendía, pedía "completalo arriba" donde ya no se puede escribir
   * y de paso apagaba el botón de reintentar el cobro.
   */
  const accesoSinDatos = !!creado && (!email.trim() || dniLimpio.length < 6)
  /** Si se le ofrece cobrar en el alta: plan pago y alguien a quien la base le deja cobrar. */
  const ofrecePago = !isEdit && !!planElegido && planElegido.price > 0 && can('pagos.registrar')
  /** Ficha creada con plan pago y sin cuota: el alta quedó a medias antes de generarla. */
  const sinCuota = ofrecePago && !!creado && !creado.paymentId
  /**
   * "Paga ahora" tildado y sin medio. Antes eso pasaba de largo: no
   * cobraba, el formulario se cerraba como si hubiera salido bien, y la
   * cuota quedaba pendiente con la clienta creyendo que había pagado.
   */
  const faltaMedio = ofrecePago && !sinCuota && metodo === ''
  /**
   * Qué le falta al alta ya creada, en el orden en que el botón lo hace.
   * Con `creado` y nada pendiente, el único botón que queda es "Listo".
   */
  const pendiente: 'cobro' | 'acceso' | null = !creado
    ? null
    : ofrecePago && metodo !== null && creado.paymentId && !cobroHecho
      ? 'cobro'
      : puedeAcceso && !accesoHecho
        ? 'acceso'
        : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (enCurso.current) return
    enCurso.current = true
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

      // La ficha se crea UNA vez. Si ya está, esto es seguir con lo que
      // faltó, y volver a llamar a createStudent sería duplicarla.
      let alta = creado
      if (!alta) {
        try {
          const r = await createStudent(
            {
              ...input,
              id: idFicha,
              planId: planId || undefined,
              planDesde: planId ? planDesde : undefined,
            },
            plans,
            settings
          )
          alta = { studentId: r.id, paymentId: r.paymentId, falta: null }
          setCreado(alta)
        } catch (err) {
          // La ficha quedó guardada y algo de después no. Desde acá el
          // formulario ya no crea: lo que falta del alta se completa en la
          // ficha, y el acceso, si se pidió, todavía se puede crear acá.
          if (err instanceof AltaIncompleta) {
            const falta = `${err.message} Completalo desde su ficha.`
            setCreado({ studentId: err.studentId, paymentId: null, falta })
            await refresh()
            setAviso(
              falta + (puedeAcceso ? ' El acceso todavía no se creó: lo podés crear desde acá.' : '')
            )
            return
          }
          throw err
        }
      }
      // Lo que quedó sin guardar se sigue diciendo mientras dure el alta.
      const antes = alta.falta ? `${alta.falta} ` : ''
      setAviso(alta.falta)

      // EL COBRO VA APARTE Y DESPUÉS, igual que el acceso y por el mismo
      // motivo: la ficha, la membresía y la cuota ya están guardadas. Si el
      // cobro falla —no tiene permiso, la promo se agotó, la base rechaza—
      // no se pierde el alta: queda la cuota pendiente, que es exactamente
      // el estado que tenía este formulario hasta hoy.
      let cobro = cobroTexto
      if (metodo && alta.paymentId && !cobroHecho) {
        try {
          const r = await cobrarCuota(alta.paymentId, metodo, cupon.trim() || null)
          cobro =
            `Cobrado: $${r.cobrado.toLocaleString('es-AR')}` +
            (r.promo ? ` con "${r.promo}"` : '') +
            ` · comprobante N° ${String(r.comprobante).padStart(8, '0')}.`
          setCobroHecho(true)
          setCobroTexto(cobro)
        } catch (err) {
          const motivo = err instanceof Error ? err.message : 'error desconocido'
          // "Ya está cobrada" es que el intento anterior SÍ entró y lo que
          // se perdió fue la respuesta. No es una falla: el cobro está
          // hecho, y el texto de la base trae el comprobante.
          if (/ya está cobrada/i.test(motivo)) {
            cobro = `${motivo.replace(/\.$/, '')}: el cobro anterior sí había entrado.`
            setCobroHecho(true)
            setCobroTexto(cobro)
          } else {
            await refresh()
            setAviso(
              `${antes}El cliente y su plan se crearon bien, pero el cobro no salió: ${motivo}` +
                ' Podés reintentarlo acá, o destildar "Paga ahora" y dejar la cuota pendiente en Pagos.' +
                // El acceso va después del cobro, así que tampoco se hizo.
                // Sin decirlo, "Cerrar" la dejaba sin acceso y sin mail.
                (puedeAcceso && !accesoHecho
                  ? ' El acceso todavía no se creó: sale con el cobro, o con "Crear el acceso" si destildás "Paga ahora".'
                  : '')
            )
            return
          }
        }
      }

      // El acceso va después y aparte: si falla, la ficha ya está guardada
      // —con su plan y su cuota— y lo único que queda pendiente es el
      // acceso. Meterlo en el mismo try sin distinguir haría perder el
      // alta por un mail mal escrito.
      let accesoRecien = false
      if (puedeAcceso && !accesoHecho) {
        try {
          const r = await createSystemUser({
            email: email.trim(),
            fullName: name,
            role: 'alumno',
            studentId: alta.studentId,
          })
          // Con la cuenta creada el acceso ya está, salga o no el mail:
          // pedirlo de nuevo chocaría con la cuenta que existe. El mail se
          // reenvía desde la ficha.
          setAccesoHecho(true)
          accesoRecien = true
          await refresh()
          if (!r.mailEnviado) {
            // El motivo va primero y completo: es lo único que dice si hay
            // que ir a Vercel, a Resend o a corregir la ficha. Antes este
            // cartel decía sólo "no se pudo enviar" y había que adivinar.
            setAviso(
              `${antes}Cliente creado y acceso creado, pero el mail no salió. ${cobro ? `${cobro} ` : ''}${r.mailMotivo ?? ''}` +
                ` Mientras tanto pasale el acceso a mano: entra con ${email.trim()} y su documento, y al entrar le vamos a pedir que la cambie. También podés reintentar el mail desde su ficha.`
            )
            return
          }
        } catch (err) {
          await refresh()
          setAviso(
            `${antes}El cliente se creó bien${cobro ? ` (${cobro})` : ''}, pero el acceso no: ${
              err instanceof Error ? err.message : 'error desconocido'
            }. Podés reintentarlo acá o crearlo desde su ficha.`
          )
          return
        }
      }

      await refresh()
      // Con cobro no se cierra solo: el número de comprobante es lo único
      // que la pantalla no vuelve a mostrar sin ir a buscarlo, y es lo que
      // el mostrador le dice a la clienta que tiene enfrente. Con algo sin
      // guardar tampoco: cerrar solo lo haría pasar por un alta completa.
      if (cobro || alta.falta) {
        setAviso(
          [
            alta.falta,
            cobro ? `Cliente creado. ${cobro}` : null,
            accesoRecien ? 'El acceso quedó creado y le mandamos el mail.' : null,
          ]
            .filter(Boolean)
            .join(' ')
        )
        return
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el cliente')
    } finally {
      enCurso.current = false
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
      // Mientras guarda no se cierra por ningún lado: cerrar no frena lo
      // que ya salió hacia la base —la ficha, el cobro, el mail siguen
      // solos—, sólo esconde cómo terminó.
      onClick={saving ? undefined : onClose}
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
            disabled={saving}
            className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {/* Con la ficha ya creada, los datos quedan trabados: el botón de
              abajo ya no los guarda, y dejarlos editables haría creer que
              sí. Se corrigen desde la ficha. */}
          <fieldset disabled={!!creado} className="space-y-4 min-w-0 disabled:opacity-70">
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
          </fieldset>

          {!isEdit && (
            <div>
              <label className={labelClass}>Asignar plan (opcional)</label>
              <select value={planId} onChange={(e) => setPlanId(e.target.value)} disabled={!!creado} className={`${inputClass} disabled:opacity-70`}>
                <option value="">Sin plan por ahora</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — ${p.price.toLocaleString('es-AR')}
                    {p.isTrial ? ' (prueba)' : ''}
                  </option>
                ))}
              </select>
              {planId && (
                <>
                  <label className={`${labelClass} mt-3`}>Arranca el</label>
                  <input
                    type="date"
                    value={planDesde}
                    onChange={(e) => setPlanDesde(e.target.value)}
                    disabled={!!creado}
                    className={`${inputClass} disabled:opacity-70`}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    {planElegido && planDesde
                      ? `Vigente del ${fechaCorta(planDesde)} al ${fechaCorta(vigenciaHasta(planDesde, planElegido))} — el último día se usa.`
                      : 'Se crea la membresía desde ese día.'}{' '}
                    {planDesde > hoyISO() && 'Hasta esa fecha no va a poder reservar. '}
                    {sinCuota
                      ? 'No se cobró nada: el plan no quedó asignado.'
                      : metodo
                        ? 'Se cobra ahora y queda el comprobante.'
                        : 'La deuda queda generada en Pagos (si el plan no es gratuito).'}
                  </p>

                  {/* PAGA ACÁ O QUEDA LA DEUDA.
                      Lo pidió el estudio el 17/09: "cuando creamos el
                      cliente, tomamos esos datos, el plan que elige y
                      ponemos si paga ahí y cómo paga para que se acredite".
                      Hasta hoy el alta dejaba la cuota pendiente y cobrarla
                      era ir a otra pantalla — doce veces en la primera
                      semana.

                      Sólo con plan pago, y sólo a quien la base le va a
                      dejar cobrar: `cobrar_cuota()` exige
                      `pagos.registrar`, así que ofrecérselo a recepción sin
                      esa clave sería ofrecer una acción que va a fallar. */}
                  {ofrecePago && planElegido && !sinCuota && (
                    // Cobrado, se traba: el cobro ya salió y tocar el medio
                    // o el cupón no lo cambia. Y sin cuota no hay qué
                    // cobrar, así que ni se muestra.
                    <fieldset
                      disabled={cobroHecho}
                      className="rounded-xl border border-border px-3.5 py-3 mt-3 space-y-3 min-w-0 disabled:opacity-70"
                    >
                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={metodo !== null}
                          onChange={(e) => {
                            setMetodo(e.target.checked ? '' : null)
                            if (!e.target.checked) setCupon('')
                          }}
                          className="mt-0.5"
                        />
                        <span className="text-xs text-foreground font-semibold">
                          Paga ahora
                          <span className="block font-normal text-[11px] text-muted-foreground">
                            Sin tildar, la cuota de ${planElegido.price.toLocaleString('es-AR')}{' '}
                            queda pendiente en Pagos, como hasta hoy.
                          </span>
                        </span>
                      </label>

                      {metodo !== null && (
                        <>
                          <div>
                            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                              Con qué paga
                            </p>
                            <MethodPicker
                              value={metodo || null}
                              onChange={(m) => setMetodo(m)}
                            />
                            {faltaMedio && (
                              <p className="text-[11px] font-semibold text-aviso-fuerte mt-1.5">
                                Elegí con qué paga, o destildá &quot;Paga ahora&quot; para dejar la
                                cuota pendiente.
                              </p>
                            )}
                          </div>
                          <div>
                            <label className={labelClass}>Cupón (opcional)</label>
                            <input
                              value={cupon}
                              onChange={(e) => setCupon(e.target.value)}
                              placeholder="Si trae un código"
                              className={`${inputClass} uppercase placeholder:normal-case`}
                            />
                          </div>
                          {/* El monto NO se anticipa acá. En el modal de
                              cobro sí, porque se conoce la cuota; acá
                              todavía no existe, y un número calculado en
                              pantalla que después la base corrige es peor
                              que no mostrar ninguno. El cobrado se dice
                              cuando vuelve, con su comprobante. */}
                          <p className="text-[11px] text-muted-foreground">
                            El monto lo calcula la base al cobrar: puede diferir del precio de
                            lista por el medio de pago o por una promoción vigente. Te lo decimos
                            con el comprobante.
                          </p>
                        </>
                      )}
                    </fieldset>
                  )}
                </>
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
                  disabled={accesoHecho || accesoSinDatos}
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
              {accesoSinDatos && !accesoHecho && !conAcceso && (
                <p className="text-[11px] text-muted-foreground mt-2">
                  Sin mail o sin documento no se le puede crear desde acá. Se cargan en su ficha y
                  el acceso se crea desde ahí.
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
          {creado && !pendiente && !saving ? (
            // Terminado: un solo botón, que cierra. No hay nada que el
            // formulario pueda volver a guardar sin duplicar. Y recién
            // cuando terminó de verdad: las banderas se prenden antes del
            // último refresco, y un "Listo" apretado en ese segundo
            // cerraba antes del comprobante o del aviso de que el mail no
            // salió.
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Listo
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                {/* Con la ficha creada, cerrar no deshace nada. */}
                {creado ? 'Cerrar' : 'Cancelar'}
              </button>
              <button
                type="submit"
                disabled={saving || !!faltaParaAcceso || faltaMedio}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {isEdit
                  ? 'Guardar cambios'
                  : pendiente === 'cobro'
                    ? 'Cobrar ahora'
                    : pendiente === 'acceso'
                      ? 'Crear el acceso'
                      : creado
                        ? 'Terminando…'
                        : puedeAcceso
                          ? 'Crear cliente y avisarle'
                          : 'Crear cliente'}
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  )
}
