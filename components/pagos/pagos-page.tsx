'use client'

import { useEffect, useState } from 'react'
import {
  CreditCard,
  TrendingUp,
  Search,
  Plus,
  Check,
  X,
  Clock,
  DollarSign,
  Banknote,
  Smartphone,
  Loader2,
  Receipt,
  Link2,
  Copy,
  MessageCircle,
  Wallet,
  Ban,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useData, useStudio } from '@/lib/data-context'
import { registerPayment, collectPayment, createMpLink, syncMpPayments, voidPayment, precioConAjuste, precioConPromo, settingText, esOferta, hoyISO, promocionesPara, cobrarCuota, type PromoAplicable } from '@/lib/api'
import type { Payment, PaymentMethod, Student } from '@/lib/types'

type FilterStatus = 'todos' | 'pagado' | 'pendiente' | 'renovacion' | 'vencido'

/**
 * El medio de pago es el `code` del catálogo, no una de cuatro palabras.
 *
 * Hasta acá eran tres uniones de TypeScript y tres objetos de cuatro
 * claves escritos a mano. La 0020 dejó anotado por qué eso bloqueaba todo
 * lo demás: «payments.method sigue con su CHECK de cuatro valores.
 * Cambiarlo por una FK al catálogo es correcto y está pendiente, pero HOY
 * rompería la pantalla de Pagos: METHOD_ICON / METHOD_LABEL /
 * METHOD_COLORS son objetos de cuatro claves escritos a mano y un código
 * desconocido deja el icono en undefined, que en React es una pantalla en
 * blanco. Primero se derivan del catálogo en el front, después la FK, en
 * su propia migración.»
 *
 * Esto es ese "primero". Nada acá indexa un objeto con un código: se
 * busca en el catálogo y hay un valor por defecto para lo que no está, así
 * que un medio nuevo se dibuja solo y uno que ya no exista no rompe la
 * pantalla de una clienta que pagó con él el año pasado.
 */
type Method = string

/**
 * El icono es decoración y el catálogo no guarda ninguno, así que los
 * cuatro conocidos conservan el suyo y el resto usa el genérico. Un medio
 * nuevo se ve bien desde el primer día sin que nadie cargue nada.
 */
const ICONO_CONOCIDO: Record<string, React.ComponentType<{ className?: string }>> = {
  efectivo: Banknote,
  transferencia: Smartphone,
  tarjeta: CreditCard,
  mercadopago: Wallet,
}

function iconoDeMedio(code: string | null | undefined): React.ComponentType<{ className?: string }> {
  return (code && ICONO_CONOCIDO[code]) || DollarSign
}

/**
 * El nombre lo pone el estudio desde Configuración, así que sale del
 * catálogo. Si el código no está —un medio borrado, o la migración del
 * catálogo sin correr— se muestra el código crudo: feo, pero cierto, y
 * mucho mejor que un `undefined` en la fila de un cobro real.
 */
function nombreDeMedio(code: string | null | undefined, medios: PaymentMethod[]): string {
  if (!code) return '—'
  return medios.find((m) => m.code === code)?.name ?? code
}

/** El `T00:00` evita que un ISO suelto se lea como UTC y muestre el día anterior. */
const fechaCorta = (iso: string) => new Date(`${iso}T00:00`).toLocaleDateString('es-AR')

/** Link de WhatsApp con el mensaje de cobranza —o de renovación— ya escrito. */
export function paymentReminderLink(payment: Payment, phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null
  const firstName = payment.studentName.split(' ')[0]
  const monto = `$${payment.amount.toLocaleString('es-AR')}`
  const oferta = esOferta(payment)
  // A una oferta de renovación no se le reclama nada: todavía no debe. Con
  // un solo texto para las dos cosas, a la clienta al día le llegaba
  // "tenés pendiente el pago" por el mes que recién le estamos ofreciendo.
  //
  // "No perder la prioridad" y no "conservar tus días y horarios": el turno
  // fijo no existe en el sistema —una reserva es una fila por clase y
  // fecha, no un derecho recurrente— así que conservarlos no se lo puede
  // prometer nadie. La prioridad sí es del estudio, es la palabra que usó
  // ("pierde la prioridad sobre sus dias y horarios fijos"), y es lo mismo
  // que dicen los mails del proceso diario.
  const cuerpo = oferta
    ? `Ya podés renovar ${payment.planName} (${monto}). ` +
      `Tenés hasta el ${fechaCorta(payment.dueDate)} para renovar y no perder la prioridad en tus días y horarios.`
    : `Te recordamos que tenés pendiente el pago de ${payment.planName} (${monto}).`
  const text =
    `¡Hola ${firstName}! Te escribimos del estudio 🙂 ` +
    cuerpo +
    (payment.mpLink
      ? ` Podés ${oferta ? 'renovar' : 'abonarlo'} con este link: ${payment.mpLink}`
      : '') +
    ` ¡Gracias!`
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

/**
 * El color de la barra de "cobrado por medio". Los cuatro de siempre
 * mantienen el suyo —el celeste de Mercado Pago es el de su marca— y un
 * medio nuevo toma uno de la paleta por su posición, de forma estable: el
 * mismo medio siempre el mismo color, sin guardar nada.
 */
const COLOR_CONOCIDO: Record<string, string> = {
  transferencia: '#9AA08C',
  efectivo: '#B79B72',
  tarjeta: '#847164',
  mercadopago: '#009EE3',
}

const PALETA_MEDIOS = ['#7D9B76', '#C4735A', '#D4A854', '#9B6E8E', '#5E8FA8', '#B8956A']

function colorDeMedio(code: string, indice: number): string {
  return COLOR_CONOCIDO[code] ?? PALETA_MEDIOS[indice % PALETA_MEDIOS.length]
}

function PaymentStatusBadge({ pago }: { pago: Payment }) {
  const { status } = pago
  // La oferta se pregunta antes que el estado, porque sin pagar es
  // 'pendiente' igual que una deuda y de las dos es la única que no se le
  // puede reclamar: cobra un período que todavía no existe. En celeste,
  // que en el resto del sistema es el color del período que no arrancó.
  if (esOferta(pago)) {
    return (
      <span
        title="Cuota del período siguiente. Todavía no es deuda: el período nuevo se crea cuando se cobra."
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-info-suave text-info-fuerte"
      >
        <RefreshCw className="w-3 h-3" /> Renovación
      </span>
    )
  }
  if (status === 'pagado') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-exito-suave text-exito-fuerte">
        <Check className="w-3 h-3" /> Pagado
      </span>
    )
  }
  if (status === 'pendiente') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-aviso-suave text-aviso-fuerte">
        <Clock className="w-3 h-3" /> Pendiente
      </span>
    )
  }
  if (status === 'anulado') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground line-through">
        Anulado
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-destructive-suave text-destructive-fuerte">
      <X className="w-3 h-3" /> Vencido
    </span>
  )
}

/**
 * Los medios que se cobran a mano: activos y manuales.
 *
 * `isManual = false` es Mercado Pago, que lo acredita la integración y no
 * se elige desde el mostrador — la misma regla que estaba escrita a mano
 * en `MANUAL_METHODS`, ahora leída de donde el estudio la configura.
 *
 * Hoy esto devuelve exactamente Efectivo, Transferencia y Tarjeta: las
 * mismas tres de siempre. La diferencia es que cuando el estudio agregue
 * Débito, aparece solo.
 */
function mediosParaCobrar(medios: PaymentMethod[]): PaymentMethod[] {
  return medios
    .filter((m) => m.active && m.isManual)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

function MethodPicker({ value, onChange }: { value: Method | null; onChange: (m: Method) => void }) {
  const { data } = useData()
  const medios = mediosParaCobrar(data?.paymentMethods ?? [])

  // Sin medios no hay cobro posible, y el motivo importa: puede ser que el
  // estudio los apagó a todos, o que quien mira no tiene permiso sobre el
  // catálogo —y una tabla sin permiso devuelve cero filas, no un error—.
  // Antes esto era imposible porque la lista estaba en el código; ahora
  // que sale de la base, callar dejaría tres botones que no están sin
  // ninguna explicación.
  if (medios.length === 0) {
    return (
      <p className="text-xs text-aviso-fuerte bg-aviso-suave rounded-xl px-3 py-2.5">
        No hay medios de pago para cobrar a mano. Se cargan en Configuración → Medios de pago.
      </p>
    )
  }

  return (
    <div className={cn('grid gap-2', medios.length >= 4 ? 'grid-cols-4' : 'grid-cols-3')}>
      {medios.map((m) => {
        const Icon = iconoDeMedio(m.code)
        return (
          <button
            key={m.code}
            type="button"
            onClick={() => onChange(m.code)}
            className={cn(
              'flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-medium transition-all',
              value === m.code
                ? 'border-primary bg-primary/5 text-primary-fuerte'
                : 'border-border text-muted-foreground hover:border-primary/40'
            )}
          >
            <Icon className="w-4 h-4" />
            <span className="text-center leading-tight">{m.name}</span>
          </button>
        )
      })}
    </div>
  )
}

function ReceiptSuccess({
  receiptNumber,
  cobrado,
  onClose,
}: {
  receiptNumber: number
  /** Lo que la base cobró de verdad, no lo que la pantalla anticipó. */
  cobrado?: number | null
  onClose: () => void
}) {
  return (
    <div className="px-6 py-8 flex flex-col items-center text-center">
      <div className="w-14 h-14 rounded-full bg-exito-suave flex items-center justify-center mb-4">
        <Receipt className="w-6 h-6 text-exito-fuerte" />
      </div>
      <h3 className="text-base font-bold text-foreground mb-1">Pago registrado</h3>
      <p className="text-sm text-muted-foreground mb-1">Comprobante generado automáticamente</p>
      <p className={cn('text-2xl font-bold text-foreground', cobrado == null ? 'mb-6' : 'mb-1')}>
        N° {String(receiptNumber).padStart(8, '0')}
      </p>
      {cobrado != null && (
        <p className="text-sm text-muted-foreground mb-6">
          Se cobraron <strong className="text-foreground">${cobrado.toLocaleString('es-AR')}</strong>
        </p>
      )}
      <button
        onClick={onClose}
        className="px-8 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
      >
        Listo
      </button>
    </div>
  )
}

/**
 * Exportados para que Agenda los use tal cual (§1 del pedido del 15/09):
 * resolver una clienta sin salir de Agenda no puede significar una
 * segunda implementación del cobro. El ajuste por medio de pago y el
 * redondeo viven acá una sola vez — si se copiaran, el mismo acto
 * comercial daría dos números según por qué pantalla se entrara, que es
 * exactamente el bug que estos dos modales ya tuvieron una vez.
 */
export function RegistrarPagoModal({
  onClose,
  student: preseleccionado,
}: {
  onClose: () => void
  /** Desde Agenda ya se sabe quién es: preseleccionarlo ahorra el paso. */
  student?: Student
}) {
  const { refresh } = useData()
  const { students, plans, paymentMethods, settings } = useStudio()

  const [studentId, setStudentId] = useState(preseleccionado?.id ?? '')
  // Con el cliente ya elegido se arranca con su plan cargado, que es lo
  // mismo que hace `applyPlanDefaults` cuando se lo elige a mano.
  const [concept, setConcept] = useState(preseleccionado?.membership?.planName ?? '')
  const [amount, setAmount] = useState(
    preseleccionado?.membership ? String(preseleccionado.membership.price) : ''
  )
  const [method, setMethod] = useState<Method | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [receiptNumber, setReceiptNumber] = useState<number | null>(null)

  const selectedStudent = students.find((s) => s.id === studentId)

  // El mismo ajuste que aplica Cobrar. Sin esto, el mismo acto comercial
  // daba dos números distintos según por qué botón se entrara: cobrar una
  // deuda en efectivo descontaba 5% y registrar el pago a mano no, y la
  // diferencia solo aparecía al cerrar el mes.
  const deLista = Number(amount) || 0
  const ajuste = method
    ? (paymentMethods.find((m) => m.code === method)?.ajustePct ?? 0)
    : 0
  const aCobrar = ajuste === 0
    ? deLista
    : precioConAjuste(deLista, ajuste, settingText(settings, 'price_rounding', 'cincuenta'))

  const applyPlanDefaults = (id: string) => {
    setStudentId(id)
    const student = students.find((s) => s.id === id)
    if (student?.membership) {
      setConcept(student.membership.planName)
      setAmount(String(student.membership.price))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!studentId || !method) return
    setSaving(true)
    setError(null)
    try {
      const n = await registerPayment({
        studentId,
        membershipId: selectedStudent?.membership?.id,
        concept: concept || 'Pago',
        amount: aCobrar,
        method,
      })
      await refresh()
      setReceiptNumber(n)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el pago')
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
      <div
        className="bg-card rounded-2xl shadow-2xl w-full max-w-md border border-border overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {receiptNumber !== null ? (
          <ReceiptSuccess receiptNumber={receiptNumber} onClose={onClose} />
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <h2 className="text-base font-bold text-foreground">Registrar pago</h2>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 overflow-y-auto">
              <div>
                <label className={labelClass}>Cliente *</label>
                <select
                  value={studentId}
                  onChange={(e) => applyPlanDefaults(e.target.value)}
                  required
                  className={inputClass}
                >
                  <option value="">Seleccionar cliente...</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass}>Concepto</label>
                <input
                  value={concept}
                  onChange={(e) => setConcept(e.target.value)}
                  placeholder="Ej: Reformer Premium"
                  list="conceptos"
                  className={inputClass}
                />
                <datalist id="conceptos">
                  {plans.map((p) => (
                    <option key={p.id} value={p.name} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className={labelClass}>Monto ($) *</label>
                <input
                  type="number"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  placeholder="32000"
                  className={inputClass}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  El precio de lista. Si el medio de pago tiene descuento o
                  recargo, se aplica abajo.
                </p>
              </div>

              <div>
                <label className={labelClass}>Método de pago *</label>
                <MethodPicker value={method} onChange={setMethod} />
                {/* Mismo criterio que el modal de cobrar una cuota: el
                    ajuste del medio no puede quedar en letra chica. Acá
                    además el número de arriba lo escribe quien cobra, así
                    que ver los dos juntos —lo que puso y lo que se cobra—
                    es lo que evita el "¿y esto de dónde salió?". */}
                {aCobrar !== deLista && (
                  <div
                    className={cn(
                      'mt-2 rounded-xl px-3 py-2.5',
                      aCobrar < deLista
                        ? 'bg-exito-suave text-exito-fuerte'
                        : 'bg-aviso-suave text-aviso-fuerte'
                    )}
                  >
                    <p className="text-sm font-bold tabular-nums">
                      <span className="text-muted-foreground line-through font-normal mr-2">
                        ${deLista.toLocaleString('es-AR')}
                      </span>
                      ${aCobrar.toLocaleString('es-AR')}
                    </p>
                    <p className="text-xs font-semibold mt-0.5">
                      {aCobrar < deLista ? '−' : '+'}
                      {Math.abs(ajuste).toLocaleString('es-AR')}%{' '}
                      {aCobrar < deLista ? 'de descuento' : 'de recargo'} por{' '}
                      {nombreDeMedio(method, paymentMethods).toLowerCase()}
                    </p>
                  </div>
                )}
              </div>

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
                disabled={saving || !studentId || !method}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Cobrar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export function CobrarModal({ payment, onClose }: { payment: Payment; onClose: () => void }) {
  const { refresh } = useData()
  const { paymentMethods, settings } = useStudio()
  const [method, setMethod] = useState<Method | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [receiptNumber, setReceiptNumber] = useState<number | null>(null)
  const [cobrado, setCobrado] = useState<number | null>(null)

  // Qué promociones le sirven a ESTA cuota. La pregunta la contesta la
  // base con la misma función que después valida el cobro: si acá dijera
  // otra cosa, el mostrador le prometería a la clienta un descuento que
  // el cobro le va a negar.
  const [promos, setPromos] = useState<PromoAplicable[]>([])
  const [codigo, setCodigo] = useState('')
  useEffect(() => {
    promocionesPara(payment.id)
      .then(setPromos)
      // Sin la 0079 la función no existe y no hay promociones: el cobro
      // sigue andando con el ajuste del medio, como antes.
      .catch(() => setPromos([]))
  }, [payment.id])

  // La automática es la que se aplica sola, sin que nadie la pida. Si hay
  // más de una gana la que más descuenta, que es lo que hace la base.
  const automaticas = promos.filter((p) => !p.codigo)
  const cupones = promos.filter((p) => p.codigo)
  const cupon = codigo.trim()
    ? cupones.find((p) => p.codigo === codigo.trim().toUpperCase())
    : undefined
  const cuponEscritoYNoSirve = codigo.trim().length > 0 && !cupon

  const redondeo = settingText(settings, 'price_rounding', 'cincuenta')

  // El precio de lista es el que quedó en la deuda; el medio de pago lo
  // ajusta (efectivo −5%, tarjeta +25%). Mientras no se elige medio, se
  // muestra el de lista.
  const ajuste = method
    ? (paymentMethods.find((m) => m.code === method)?.ajustePct ?? 0)
    : 0

  // El cupón escrito le gana a la automática: si alguien se tomó el
  // trabajo de repartirlo, es porque vale más que lo que hay para todas.
  // Y la promo REEMPLAZA al ajuste del medio, no se suma: son dos motivos
  // distintos para tocar el mismo precio, y aplicarlos juntos descuenta
  // dos veces. Es lo que hace `cobrar_cuota()` y acá solo se espeja.
  const promoElegida =
    cupon ??
    (automaticas.length > 0
      ? automaticas.reduce((mejor, p) =>
          precioConPromo(payment.amount, p.tipo, p.valor, redondeo) <
          precioConPromo(payment.amount, mejor.tipo, mejor.valor, redondeo)
            ? p
            : mejor
        )
      : undefined)

  const aCobrar = promoElegida
    ? precioConPromo(payment.amount, promoElegida.tipo, promoElegida.valor, redondeo)
    : ajuste === 0
      ? payment.amount
      : precioConAjuste(payment.amount, ajuste, redondeo)
  const diferencia = aCobrar - payment.amount

  const handleSubmit = async () => {
    if (!method) return
    setSaving(true)
    setError(null)
    try {
      // El monto lo decide la base, no este navegador: acá viaja el medio
      // y el cupón, y vuelve lo que efectivamente se cobró. Antes se
      // mandaba el número calculado en pantalla, que con promociones y
      // topes de uso ya no se puede hacer cumplir.
      const r = await cobrarCuota(payment.id, method, cupon ? cupon.codigo : null)
      await refresh()
      setCobrado(r.cobrado)
      setReceiptNumber(r.comprobante)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo registrar el cobro'
      // Si la 0079 todavía no corrió, se cobra como se cobraba. Sin
      // promociones, pero se cobra: el mostrador no puede quedar sin poder
      // cobrar porque falte una migración.
      if (msg.includes('migración 0079')) {
        try {
          const n = await collectPayment(payment.id, method, aCobrar)
          await refresh()
          setCobrado(aCobrar)
          setReceiptNumber(n)
          return
        } catch (err2) {
          setError(err2 instanceof Error ? err2.message : msg)
          setSaving(false)
          return
        }
      }
      setError(msg)
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-2xl shadow-2xl w-full max-w-sm border border-border max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {receiptNumber !== null ? (
          <ReceiptSuccess receiptNumber={receiptNumber} cobrado={cobrado} onClose={onClose} />
        ) : (
          <>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-base font-bold text-foreground">Cobrar pago</h2>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="bg-muted rounded-xl p-4">
                <p className="text-sm font-semibold text-foreground">{payment.studentName}</p>
                <p className="text-xs text-muted-foreground">{payment.planName}</p>
                {/* POR QUÉ ESE NÚMERO Y NO EL DE LA CUOTA.
                    El monto que se cobra ya viene con el ajuste del medio
                    —efectivo tiene descuento, tarjeta recargo— y eso estaba
                    dicho en 11px y en gris, debajo del número. Matías cobró
                    $80.750 sobre una cuota de $85.000 y no encontró de dónde
                    salía la diferencia: "solo aparece el monto".

                    Ahora el precio de lista va tachado al lado del que se
                    cobra, y el ajuste en su propio recuadro con color: verde
                    si baja, ámbar si sube. Es la misma información, puesta
                    donde no se pueda pasar por alto — quien cobra tiene que
                    poder explicárselo a la clienta que tiene enfrente. */}
                <div className="flex items-baseline gap-2 mt-2 flex-wrap">
                  {diferencia !== 0 && (
                    <span className="text-base text-muted-foreground line-through tabular-nums">
                      ${payment.amount.toLocaleString('es-AR')}
                    </span>
                  )}
                  <span className="text-2xl font-bold text-foreground tabular-nums">
                    ${aCobrar.toLocaleString('es-AR')}
                  </span>
                </div>
                {promoElegida ? (
                  <p className="text-xs font-semibold mt-2 rounded-lg px-2.5 py-1.5 inline-block bg-exito-suave text-exito-fuerte">
                    {promoElegida.nombre}
                    {promoElegida.codigo && (
                      <span className="font-mono ml-1.5 opacity-80">{promoElegida.codigo}</span>
                    )}
                    <span className="block font-normal opacity-80">
                      Paga ${Math.abs(diferencia).toLocaleString('es-AR')} menos que el precio
                      de lista{ajuste !== 0 && ', y la promoción reemplaza al ajuste del medio'}
                    </span>
                  </p>
                ) : diferencia !== 0 && (
                  <p
                    className={cn(
                      'text-xs font-semibold mt-2 rounded-lg px-2.5 py-1.5 inline-block',
                      diferencia < 0
                        ? 'bg-exito-suave text-exito-fuerte'
                        : 'bg-aviso-suave text-aviso-fuerte'
                    )}
                  >
                    {diferencia < 0 ? '−' : '+'}
                    {Math.abs(ajuste).toLocaleString('es-AR')}%{' '}
                    {diferencia < 0 ? 'de descuento' : 'de recargo'} por pagar con{' '}
                    {nombreDeMedio(method, paymentMethods).toLowerCase()}
                    <span className="block font-normal opacity-80">
                      {diferencia < 0 ? 'Paga' : 'Paga'} ${Math.abs(diferencia).toLocaleString('es-AR')}{' '}
                      {diferencia < 0 ? 'menos' : 'más'} que el precio de lista
                    </span>
                  </p>
                )}
              </div>

              {/* Cobrar una renovación no es cobrar una deuda: es lo que
                  crea el período. Conviene decirlo acá, que es donde
                  alguien duda de si le está cobrando dos veces el mes. */}
              {esOferta(payment) && (
                <div className="rounded-xl border border-info/40 bg-info-suave px-4 py-3 text-[11px] text-info-fuerte space-y-1">
                  <p className="font-semibold">Es la renovación del período siguiente.</p>
                  <p>
                    El período nuevo lo crea este cobro: si la membresía en curso todavía no
                    venció, arranca cuando esa termina; si ya venció, arranca hoy.
                  </p>
                </div>
              )}

              {/* El campo aparece solo si hay algún cupón que esta cuota
                  podría usar. Ofrecerlo siempre sería invitar a probar
                  códigos que no existen. */}
              {cupones.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                    Cupón
                  </p>
                  <input
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    placeholder="Si trae un código, escribilo"
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground uppercase placeholder:normal-case placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  {cuponEscritoYNoSirve && (
                    <p className="text-[11px] text-aviso-fuerte mt-1.5">
                      Ese código no se puede usar en esta cuota: puede estar
                      vencido, agotado o ser de otro plan.
                    </p>
                  )}
                  {cupon?.usosRestantes != null && (
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      Quedan {cupon.usosRestantes} {cupon.usosRestantes === 1 ? 'uso' : 'usos'}.
                    </p>
                  )}
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                  Método de pago
                </p>
                <MethodPicker value={method} onChange={setMethod} />
              </div>

              {error && (
                <p className="text-sm text-destructive-fuerte bg-destructive/10 rounded-xl px-3 py-2">{error}</p>
              )}
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-border">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={!method || saving || cuponEscritoYNoSirve}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirmar cobro
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function MpLinkModal({ payment, onClose }: { payment: Payment; onClose: () => void }) {
  const { refresh } = useData()
  const { students } = useStudio()
  const [link, setLink] = useState<string | null>(payment.mpLink ?? null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const student = students.find((s) => s.id === payment.studentId)

  useEffect(() => {
    if (link) return
    createMpLink(payment.id)
      .then(async (l) => {
        setLink(l)
        await refresh()
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo generar el link'))
  }, [link, payment.id, refresh])

  const copy = async () => {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const waHref = (() => {
    if (!link || !student?.phone) return null
    const digits = student.phone.replace(/\D/g, '')
    if (!digits) return null
    const firstName = student.name.split(' ')[0]
    const text = `Hola ${firstName}! Te paso el link para abonar ${payment.planName} ($${payment.amount.toLocaleString('es-AR')}): ${link}`
    return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
  })()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-2xl shadow-2xl w-full max-w-md border border-border max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-foreground">Link de pago</h2>
            <p className="text-xs text-muted-foreground">
              {payment.studentName} · {payment.planName} · ${payment.amount.toLocaleString('es-AR')}
            </p>
            {/* Con el plazo cumplido la oferta sigue viva hasta que el
                proceso diario la anula, así que el modal se abre igual:
                decirle "puede pagarla hasta el 21" un 23 sería falso. */}
            {esOferta(payment) && (
              <p className="text-[11px] text-info-fuerte mt-0.5">
                {payment.dueDate < hoyISO()
                  ? `Renovación · el plazo venció el ${fechaCorta(payment.dueDate)}`
                  : `Renovación · puede pagarla hasta el ${fechaCorta(payment.dueDate)}`}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-3">
          {error ? (
            <p className="text-sm text-destructive-fuerte bg-destructive/10 rounded-xl px-3 py-2">{error}</p>
          ) : !link ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Generando link en Mercado Pago...
            </div>
          ) : (
            <>
              <div className="bg-muted rounded-xl px-3 py-2.5 text-xs font-mono text-foreground break-all select-all">
                {link}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={copy}
                  className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  {copied ? '¡Copiado!' : 'Copiar link'}
                </button>
                {waHref && (
                  <a
                    href={waHref}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 py-2.5 rounded-xl bg-[#25D366] text-white text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                  >
                    <MessageCircle className="w-4 h-4" />
                    WhatsApp
                  </a>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Cuando el cliente pague, el sistema lo acredita automáticamente y genera el
                comprobante (se actualiza al abrir esta pantalla).
                {esOferta(payment) && ' Con ese pago acreditado se crea el período nuevo.'}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function AnularCobroModal({
  pago,
  onClose,
  onAnulado,
}: {
  pago: Payment
  onClose: () => void
  onAnulado: () => void
}) {
  const { refresh } = useData()
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirmar = async () => {
    if (!motivo.trim()) {
      setError('Escribí por qué se anula')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await voidPayment(pago.id, motivo)
      await refresh()
      onAnulado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo anular')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-card w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl shadow-2xl border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground">Anular cobro</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {pago.studentName} · ${pago.amount.toLocaleString('es-AR')}
            {pago.receiptNumber ? ` · comprobante #${String(pago.receiptNumber).padStart(6, '0')}` : ''}
          </p>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Decir qué pasa, antes de que pase */}
          <div className="rounded-xl bg-muted/50 px-4 py-3 text-xs text-foreground/80 space-y-1.5">
            <p>El cobro deja de contar como plata entrada y baja el saldo de su cuenta.</p>
            <p>No se borra: queda tachado, con el motivo y el comprobante que ya se emitió.</p>
            <p>
              Si ese día ya se arqueó, <strong>el cierre firmado no cambia</strong>: dice lo que se
              contó y sigue siendo cierto. Lo que haya que devolver se registra hoy, desde Caja.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              ¿Por qué se anula?
            </label>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              autoFocus
              placeholder="Ej: se cobró dos veces por error"
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:border-primary"
            />
          </div>

          {error && <p className="text-xs text-destructive-fuerte">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-border flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground">
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Anular
          </button>
        </div>
      </div>
    </div>
  )
}

export function PagosPage() {
  const { refresh, canWrite, can } = useData()
  const { payments: PAYMENTS, monthlyRevenue, mpConfigured, students, paymentMethods } = useStudio()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('todos')
  const [showRegistrar, setShowRegistrar] = useState(false)
  const [collectingPayment, setCollectingPayment] = useState<Payment | null>(null)
  const [linkPayment, setLinkPayment] = useState<Payment | null>(null)
  const [anulando, setAnulando] = useState<Payment | null>(null)
  const puedeAnular = can('pagos.anular') || canWrite
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  // Al abrir Pagos, acredita los links de MP que ya fueron pagados
  useEffect(() => {
    if (!mpConfigured || !canWrite) return
    syncMpPayments()
      .then(async (updated) => {
        if (updated > 0) {
          await refresh()
          setSyncMsg(
            updated === 1
              ? 'Se acreditó 1 pago de Mercado Pago'
              : `Se acreditaron ${updated} pagos de Mercado Pago`
          )
        }
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Las ofertas de renovación sin cobrar, aparte de la deuda.
  //
  // Son cuotas del período que viene, emitidas antes de que venza el
  // actual (0041), y la clienta no las debe: si no las paga, el período no
  // se crea y la oferta se anula sola. Sumadas a "Pendientes", ese total
  // dejaba de significar plata a cobrar desde el día que se emite la
  // primera —toda clienta al día figuraba con una— y es justo el número
  // que el estudio mira para saber cuánto tiene por cobrar.
  //
  // Mientras la 0041 no haya corrido no hay ninguna: `esOferta` da false
  // sin la columna y todo se cuenta como se contaba hasta hoy.
  const ofertas = PAYMENTS.filter((p) => esOferta(p))
  const pendientes = PAYMENTS.filter((p) => p.status === 'pendiente' && !esOferta(p))
  const montoOfertas = ofertas.reduce((a, p) => a + p.amount, 0)

  // EL ORDEN DE LA LISTA.
  //
  // Hasta hoy era el de la consulta —`due_date` descendente— y por eso
  // arriba de todo aparecía una cuota ANULADA del 17/09: vencía en
  // octubre, y el vencimiento dice cuándo hay que pagar algo, no cuándo
  // pasó algo. Los dos cobros reales del día quedaban 2° y 5°, separados
  // por anuladas.
  //
  // Y son dos preguntas distintas según qué esté mirando quien filtra:
  //
  //   · Todos / Pagado / Anulado -> "¿qué pasó recién?". Lo último arriba.
  //   · Pendiente / Vencido / Renovación -> "¿a quién hay que ir a
  //     buscar?". Lo más urgente arriba, que es lo más viejo.
  //
  // Un orden único deja siempre una de las dos mal: por fecha de cobro,
  // las pendientes —que no tienen— caen todas juntas al fondo; por
  // vencimiento descendente, la deuda más atrasada queda última, que es
  // exactamente la que hay que reclamar primero. Por eso el orden lo
  // decide el filtro, y la pantalla lo dice en voz alta debajo: un orden
  // que cambia solo y no se anuncia se lee como desorden, que es el
  // problema que esto viene a resolver.
  const porUrgencia =
    filterStatus === 'pendiente' || filterStatus === 'vencido' || filterStatus === 'renovacion'

  // Qué fecha representa a cada fila cuando la pregunta es "qué pasó".
  // El instante y no el día: dos cobros del mismo día son indistinguibles
  // por el día, y ahí volvía el desorden en chiquito.
  const cuandoPaso = (p: Payment) => p.paidAt ?? p.createdAt ?? p.dueDate

  const filtered = PAYMENTS.filter((p) => {
    const matchSearch =
      search === '' || p.studentName.toLowerCase().includes(search.toLowerCase())
    const matchStatus =
      filterStatus === 'todos'
        ? true
        : filterStatus === 'renovacion'
        ? esOferta(p)
        : filterStatus === 'pendiente'
        ? p.status === 'pendiente' && !esOferta(p)
        : p.status === filterStatus
    return matchSearch && matchStatus
  })
  // Copia antes de ordenar: `filter` ya devuelve una nueva, pero dejarlo
  // dicho evita que mañana alguien ordene PAYMENTS en su lugar y le mueva
  // la lista a las otras pantallas que derivan del mismo paquete.
  const ordenados = [...filtered].sort((a, b) => {
    if (porUrgencia) {
      // Ascendente: la que vence antes va arriba.
      return a.dueDate.localeCompare(b.dueDate) || a.studentName.localeCompare(b.studentName)
    }
    return (
      cuandoPaso(b).localeCompare(cuandoPaso(a)) ||
      // EL EMPATE NO ES UN CASO RARO, ES EL NORMAL.
      //
      // `created_at` sale de now(), que en Postgres es el instante de la
      // TRANSACCIÓN: un insert de varias filas les pone a todas el mismo
      // valor, hasta el microsegundo. Y el proceso diario emite las cuotas
      // de renovación exactamente así, en tanda — así que el día que
      // renueven ocho clientas, esas ocho empatan.
      //
      // Sin desempate, `sort` es estable y las deja en el orden en que
      // vinieron de la consulta, que es el desorden que esto vino a
      // arreglar. Dentro de la misma tanda manda lo que vence antes, y a
      // igual vencimiento el nombre: alfabético es lo único que sirve
      // cuando alguien busca a una persona en la lista.
      a.dueDate.localeCompare(b.dueDate) ||
      a.studentName.localeCompare(b.studentName)
    )
  })

  const totalPaid = PAYMENTS.filter((p) => p.status === 'pagado').reduce((a, p) => a + p.amount, 0)
  const overdueCount = PAYMENTS.filter((p) => p.status === 'vencido').length
  const currentMonth = monthlyRevenue[monthlyRevenue.length - 1]
  const currentMonthRevenue = currentMonth?.amount ?? 0
  const maxRevenue = Math.max(1, ...monthlyRevenue.map((m) => m.amount))

  // Distribución por método, en PLATA y no en cantidad de pagos: veinte
  // cobros chicos en efectivo y dos transferencias grandes son cosas muy
  // distintas, y contando pagos parecían lo mismo.
  const paidWithMethod = PAYMENTS.filter((p) => p.status === 'pagado' && p.method)
  const totalWithMethod = paidWithMethod.reduce((a, p) => a + p.amount, 0)
  // Las barras salen del catálogo, no de cuatro claves escritas acá. Y se
  // suman también los códigos que el catálogo ya no tiene —un medio dado
  // de baja, o renombrado por otro lado— porque esa plata se cobró: si no
  // entrara en ninguna barra, los porcentajes no cerrarían en 100 y nadie
  // sabría dónde fue a parar.
  const codigosCobrados = new Set(paidWithMethod.map((p) => p.method as string))
  const delCatalogo = [...paymentMethods].sort((a, b) => a.sortOrder - b.sortOrder)
  const sueltos = [...codigosCobrados].filter((c) => !paymentMethods.some((m) => m.code === c))
  const methodDistribution = [
    ...delCatalogo.map((m) => ({ code: m.code, label: m.name })),
    ...sueltos.map((c) => ({ code: c, label: c })),
  ]
    .map((m, i) => {
      const monto = paidWithMethod
        .filter((p) => p.method === m.code)
        .reduce((a, p) => a + p.amount, 0)
      return {
        label: m.label,
        color: colorDeMedio(m.code, i),
        monto,
        pct: totalWithMethod ? Math.round((monto / totalWithMethod) * 100) : 0,
      }
    })
    .sort((a, b) => b.monto - a.monto)

  const tarjetas = [
    {
      icon: TrendingUp,
      label: `Ingresos ${currentMonth?.month ?? ''}`,
      value: `$${(currentMonthRevenue / 1000).toFixed(0)}k`,
      sub: 'Cobrado este mes',
      color: 'var(--exito)',
    },
    {
      icon: Check,
      label: 'Pagos al día',
      value: String(PAYMENTS.filter((p) => p.status === 'pagado').length),
      sub: `$${totalPaid.toLocaleString('es-AR')}`,
      color: 'var(--exito)',
    },
    {
      icon: Clock,
      label: 'Pendientes',
      value: String(pendientes.length),
      sub: `$${pendientes.reduce((a, p) => a + p.amount, 0).toLocaleString('es-AR')}`,
      color: 'var(--aviso)',
    },
    {
      icon: X,
      label: 'Vencidos',
      value: String(overdueCount),
      sub: `$${PAYMENTS.filter((p) => p.status === 'vencido').reduce((a, p) => a + p.amount, 0).toLocaleString('es-AR')}`,
      color: 'var(--destructive)',
    },
    // La quinta tarjeta aparece solo si hay ofertas: es plata sobre la mesa
    // y hay que poder verla, pero en su propio número y no dentro de la
    // deuda. Sin ofertas —el estado de hoy— la fila queda igual que antes.
    ...(ofertas.length > 0
      ? [
          {
            icon: RefreshCw,
            label: 'Renovaciones',
            value: String(ofertas.length),
            sub: `$${montoOfertas.toLocaleString('es-AR')} · no cuenta como deuda`,
            color: 'var(--info)',
          },
        ]
      : []),
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Stats */}
      <div className="px-6 py-5 border-b border-border bg-card">
        <div
          className={cn(
            'grid grid-cols-2 gap-4',
            ofertas.length > 0 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'
          )}
        >
          {tarjetas.map(({ icon: Icon, label, value, sub, color }) => (
            <div key={label} className="bg-muted rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground font-medium">{label}</span>
                {/* El tinte se arma con color-mix y no pegando el alfa al
                    final del color: `var(--exito)18` no es CSS válido y el
                    fondo desaparece sin avisar. */}
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `color-mix(in oklab, ${color} 10%, transparent)` }}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color }} />
                </div>
              </div>
              <p className="text-2xl font-bold text-foreground">{value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-4 md:px-6 py-4 border-b border-border bg-card flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background text-sm flex-1 min-w-48 max-w-xs">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente..."
            className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground outline-none text-sm"
          />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {([
            { key: 'todos', label: 'Todos' },
            { key: 'pagado', label: 'Pagado' },
            { key: 'pendiente', label: 'Pendiente' },
            // Con este filtro se llega a las ofertas, que ya no salen por
            // "Pendiente": ahí quedó solo la deuda. Aparece cuando hay
            // alguna, así que sin la 0041 los botones son los de siempre.
            // Y también cuando es el filtro elegido, aunque ya no quede
            // ninguna: cobrar la última refresca la pantalla, y si el chip
            // desaparecía quedaba una lista vacía sin ningún filtro marcado.
            ...(ofertas.length > 0 || filterStatus === 'renovacion'
              ? [{ key: 'renovacion', label: 'Renovaciones' }]
              : []),
            { key: 'vencido', label: 'Vencido' },
          ] as { key: FilterStatus; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilterStatus(key)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition-colors border',
                filterStatus === key
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted text-muted-foreground border-border hover:border-primary/30'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* El orden cambia con el filtro, así que se dice. Sin esto, pasar
            de "Todos" a "Vencido" y ver la lista al revés se lee como que
            la pantalla hace cualquier cosa. */}
        <span className="text-[11px] text-muted-foreground w-full sm:w-auto order-last sm:order-none">
          {porUrgencia ? 'Lo que vence antes, arriba' : 'Lo último que pasó, arriba'}
        </span>

        {canWrite && (
          <button
            onClick={() => setShowRegistrar(true)}
            className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Registrar pago</span>
          </button>
        )}
      </div>

      {syncMsg && (
        <div className="mx-6 mt-4 px-4 py-2.5 rounded-xl bg-exito-suave text-sm text-exito-fuerte flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          {syncMsg} — comprobante generado automáticamente
        </div>
      )}

      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Table */}
          <div className="xl:col-span-2 bg-card rounded-2xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Cliente
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">
                      Concepto
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Monto
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">
                      Vencimiento
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">
                      Método
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">
                      Comp.
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Estado
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {ordenados.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                        No se encontraron pagos
                      </td>
                    </tr>
                  ) : (
                    ordenados.map((p) => {
                      const MethodIcon = iconoDeMedio(p.method)
                      return (
                        <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground text-sm">{p.studentName}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">
                            {p.planName}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm font-bold text-foreground">
                              ${p.amount.toLocaleString('es-AR')}
                            </span>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <div>
                              <p className="text-xs text-muted-foreground">{p.dueDate}</p>
                              {p.date && (
                                <p className="text-[10px] text-muted-foreground/60">
                                  Pagado {p.date}
                                </p>
                              )}
                              {/* En una oferta la fecha no es un vencimiento
                                  de deuda: es el último día para renovar. */}
                              {esOferta(p) && (
                                <p className="text-[10px] text-info-fuerte">Límite para renovar</p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            {p.method ? (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <MethodIcon className="w-3.5 h-3.5" />
                                {nombreDeMedio(p.method, paymentMethods)}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground/50">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            {p.receiptNumber ? (
                              <span className="text-xs font-mono text-muted-foreground">
                                #{String(p.receiptNumber).padStart(6, '0')}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground/50">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <PaymentStatusBadge pago={p} />
                          </td>
                          <td className="px-4 py-3">
                            {/* Un cobro ya hecho se puede anular; el
                                comprobante emitido queda igual. */}
                            {p.status === 'pagado' && puedeAnular && (
                              <button
                                onClick={() => setAnulando(p)}
                                title="Anular este cobro"
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive-fuerte transition-colors"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canWrite && (p.status === 'pendiente' || p.status === 'vencido') && (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => setCollectingPayment(p)}
                                  className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary-fuerte text-[10px] font-semibold hover:bg-primary/20 transition-colors whitespace-nowrap"
                                >
                                  Cobrar
                                </button>
                                {mpConfigured && (
                                  <button
                                    onClick={() => setLinkPayment(p)}
                                    title={p.mpLink ? 'Ver link de pago' : 'Generar link de pago (Mercado Pago)'}
                                    className={cn(
                                      'w-7 h-7 rounded-lg flex items-center justify-center transition-colors',
                                      p.mpLink
                                        ? 'bg-[#009EE3]/15 text-[#009EE3] hover:bg-[#009EE3]/25'
                                        : 'text-muted-foreground hover:bg-[#009EE3]/10 hover:text-[#009EE3]'
                                    )}
                                  >
                                    <Link2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {(() => {
                                  const phone = students.find((s) => s.id === p.studentId)?.phone ?? ''
                                  const link = paymentReminderLink(p, phone)
                                  return link ? (
                                    <a
                                      href={link}
                                      target="_blank"
                                      rel="noreferrer"
                                      title="Enviar recordatorio por WhatsApp"
                                      className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-[#25D366]/15 hover:text-[#25D366] transition-colors"
                                    >
                                      <MessageCircle className="w-3.5 h-3.5" />
                                    </a>
                                  ) : null
                                })()}
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Revenue chart sidebar */}
          <div className="bg-card rounded-2xl border border-border p-5">
            <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary-fuerte" />
              Evolución de ingresos
            </h3>
            <p className="text-xs text-muted-foreground mb-5">Últimos 6 meses</p>

            <div className="space-y-3">
              {monthlyRevenue.map((m, i) => {
                const isLast = i === monthlyRevenue.length - 1
                const pct = Math.round((m.amount / maxRevenue) * 100)
                return (
                  <div key={m.month}>
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={cn(
                          'text-xs font-medium',
                          isLast ? 'text-foreground font-semibold' : 'text-muted-foreground'
                        )}
                      >
                        {m.month}
                      </span>
                      <span
                        className={cn(
                          'text-xs font-semibold',
                          isLast ? 'text-primary-fuerte' : 'text-muted-foreground'
                        )}
                      >
                        ${(m.amount / 1000).toFixed(0)}k
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          isLast ? 'bg-primary' : 'bg-muted-foreground/30'
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-5 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground mb-2">Cobrado por método</p>
              <div className="space-y-2">
                {methodDistribution.map(({ label, pct, color, monto }) => (
                  <div key={label} className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-xs text-muted-foreground flex-1">{label}</span>
                    <span className="text-xs font-semibold text-foreground tabular-nums">
                      ${monto.toLocaleString('es-AR')}
                    </span>
                    <span className="text-[11px] text-muted-foreground tabular-nums w-9 text-right">
                      {pct}%
                    </span>
                    <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showRegistrar && <RegistrarPagoModal onClose={() => setShowRegistrar(false)} />}
      {collectingPayment && (
        <CobrarModal payment={collectingPayment} onClose={() => setCollectingPayment(null)} />
      )}
      {linkPayment && <MpLinkModal payment={linkPayment} onClose={() => setLinkPayment(null)} />}
      {anulando && (
        <AnularCobroModal
          pago={anulando}
          onClose={() => setAnulando(null)}
          onAnulado={() => setAnulando(null)}
        />
      )}
    </div>
  )
}
