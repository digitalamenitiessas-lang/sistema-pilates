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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useData, useStudio } from '@/lib/data-context'
import { registerPayment, collectPayment, createMpLink, syncMpPayments } from '@/lib/api'
import type { Payment } from '@/lib/types'

type FilterStatus = 'todos' | 'pagado' | 'pendiente' | 'vencido'
type Method = 'efectivo' | 'transferencia' | 'tarjeta'
type AnyMethod = Method | 'mercadopago'

const METHOD_ICON: Record<AnyMethod, React.ComponentType<{ className?: string }>> = {
  efectivo: Banknote,
  transferencia: Smartphone,
  tarjeta: CreditCard,
  mercadopago: Wallet,
}

const METHOD_LABEL: Record<AnyMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  mercadopago: 'Mercado Pago',
}

// Métodos que se registran a mano (MP se acredita solo)
const MANUAL_METHODS: Method[] = ['efectivo', 'transferencia', 'tarjeta']

/** Link de WhatsApp con el recordatorio de deuda ya escrito. */
export function paymentReminderLink(payment: Payment, phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null
  const firstName = payment.studentName.split(' ')[0]
  const text =
    `¡Hola ${firstName}! Te escribimos del estudio 🙂 ` +
    `Te recordamos que tenés pendiente el pago de ${payment.planName} ` +
    `($${payment.amount.toLocaleString('es-AR')}).` +
    (payment.mpLink ? ` Podés abonarlo con este link: ${payment.mpLink}` : '') +
    ` ¡Gracias!`
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

const METHOD_COLORS: Record<AnyMethod, string> = {
  transferencia: '#7D9B76',
  efectivo: '#D4A854',
  tarjeta: '#C4735A',
  mercadopago: '#009EE3',
}

function PaymentStatusBadge({ status }: { status: Payment['status'] }) {
  if (status === 'pagado') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-[#E8F2EB] text-[#2E6040]">
        <Check className="w-3 h-3" /> Pagado
      </span>
    )
  }
  if (status === 'pendiente') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">
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
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">
      <X className="w-3 h-3" /> Vencido
    </span>
  )
}

function MethodPicker({ value, onChange }: { value: Method | null; onChange: (m: Method) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {MANUAL_METHODS.map((m) => {
        const Icon = METHOD_ICON[m]
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className={cn(
              'flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-medium transition-all',
              value === m
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-border text-muted-foreground hover:border-primary/40'
            )}
          >
            <Icon className="w-4 h-4" />
            {METHOD_LABEL[m]}
          </button>
        )
      })}
    </div>
  )
}

function ReceiptSuccess({ receiptNumber, onClose }: { receiptNumber: number; onClose: () => void }) {
  return (
    <div className="px-6 py-8 flex flex-col items-center text-center">
      <div className="w-14 h-14 rounded-full bg-[#E8F2EB] flex items-center justify-center mb-4">
        <Receipt className="w-6 h-6 text-[#2E6040]" />
      </div>
      <h3 className="text-base font-bold text-foreground mb-1">Pago registrado</h3>
      <p className="text-sm text-muted-foreground mb-1">Comprobante generado automáticamente</p>
      <p className="text-2xl font-bold text-foreground mb-6">
        N° {String(receiptNumber).padStart(8, '0')}
      </p>
      <button
        onClick={onClose}
        className="px-8 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
      >
        Listo
      </button>
    </div>
  )
}

function RegistrarPagoModal({ onClose }: { onClose: () => void }) {
  const { refresh } = useData()
  const { students, plans } = useStudio()

  const [studentId, setStudentId] = useState('')
  const [concept, setConcept] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<Method | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [receiptNumber, setReceiptNumber] = useState<number | null>(null)

  const selectedStudent = students.find((s) => s.id === studentId)

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
        amount: Number(amount) || 0,
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
                <label className={labelClass}>Alumno *</label>
                <select
                  value={studentId}
                  onChange={(e) => applyPlanDefaults(e.target.value)}
                  required
                  className={inputClass}
                >
                  <option value="">Seleccionar alumno...</option>
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
              </div>

              <div>
                <label className={labelClass}>Método de pago *</label>
                <MethodPicker value={method} onChange={setMethod} />
              </div>

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

function CobrarModal({ payment, onClose }: { payment: Payment; onClose: () => void }) {
  const { refresh } = useData()
  const [method, setMethod] = useState<Method | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [receiptNumber, setReceiptNumber] = useState<number | null>(null)

  const handleSubmit = async () => {
    if (!method) return
    setSaving(true)
    setError(null)
    try {
      const n = await collectPayment(payment.id, method)
      await refresh()
      setReceiptNumber(n)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el cobro')
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
          <ReceiptSuccess receiptNumber={receiptNumber} onClose={onClose} />
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
                <p className="text-2xl font-bold text-foreground mt-2">
                  ${payment.amount.toLocaleString('es-AR')}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                  Método de pago
                </p>
                <MethodPicker value={method} onChange={setMethod} />
              </div>

              {error && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">{error}</p>
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
                disabled={!method || saving}
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
            <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">{error}</p>
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
                Cuando el alumno pague, el sistema lo acredita automáticamente y genera el
                comprobante (se actualiza al abrir esta pantalla).
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function PagosPage() {
  const { refresh, canWrite } = useData()
  const { payments: PAYMENTS, monthlyRevenue, mpConfigured, students } = useStudio()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('todos')
  const [showRegistrar, setShowRegistrar] = useState(false)
  const [collectingPayment, setCollectingPayment] = useState<Payment | null>(null)
  const [linkPayment, setLinkPayment] = useState<Payment | null>(null)
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

  const filtered = PAYMENTS.filter((p) => {
    const matchSearch =
      search === '' || p.studentName.toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus === 'todos' || p.status === filterStatus
    return matchSearch && matchStatus
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
  const methodDistribution = (Object.keys(METHOD_LABEL) as AnyMethod[])
    .map((m) => {
      const monto = paidWithMethod
        .filter((p) => p.method === m)
        .reduce((a, p) => a + p.amount, 0)
      return {
        label: METHOD_LABEL[m],
        color: METHOD_COLORS[m],
        monto,
        pct: totalWithMethod ? Math.round((monto / totalWithMethod) * 100) : 0,
      }
    })
    .sort((a, b) => b.monto - a.monto)

  return (
    <div className="flex flex-col h-full">
      {/* Stats */}
      <div className="px-6 py-5 border-b border-border bg-card">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              icon: TrendingUp,
              label: `Ingresos ${currentMonth?.month ?? ''}`,
              value: `$${(currentMonthRevenue / 1000).toFixed(0)}k`,
              sub: 'Cobrado este mes',
              color: '#7D9B76',
            },
            {
              icon: Check,
              label: 'Pagos al día',
              value: String(PAYMENTS.filter((p) => p.status === 'pagado').length),
              sub: `$${totalPaid.toLocaleString('es-AR')}`,
              color: '#7D9B76',
            },
            {
              icon: Clock,
              label: 'Pendientes',
              value: String(PAYMENTS.filter((p) => p.status === 'pendiente').length),
              sub: `$${PAYMENTS.filter((p) => p.status === 'pendiente').reduce((a, p) => a + p.amount, 0).toLocaleString('es-AR')}`,
              color: '#D4A854',
            },
            {
              icon: X,
              label: 'Vencidos',
              value: String(overdueCount),
              sub: `$${PAYMENTS.filter((p) => p.status === 'vencido').reduce((a, p) => a + p.amount, 0).toLocaleString('es-AR')}`,
              color: '#EF4444',
            },
          ].map(({ icon: Icon, label, value, sub, color }) => (
            <div key={label} className="bg-muted rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground font-medium">{label}</span>
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${color}18` }}
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
            placeholder="Buscar alumno..."
            className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground outline-none text-sm"
          />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {(['todos', 'pagado', 'pendiente', 'vencido'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition-colors border',
                filterStatus === s
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted text-muted-foreground border-border hover:border-primary/30'
              )}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

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
        <div className="mx-6 mt-4 px-4 py-2.5 rounded-xl bg-[#E8F2EB] text-sm text-[#2E6040] flex items-center gap-2">
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
                      Alumno
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
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                        No se encontraron pagos
                      </td>
                    </tr>
                  ) : (
                    filtered.map((p) => {
                      const MethodIcon = p.method ? METHOD_ICON[p.method] : DollarSign
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
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            {p.method ? (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <MethodIcon className="w-3.5 h-3.5" />
                                {METHOD_LABEL[p.method]}
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
                            <PaymentStatusBadge status={p.status} />
                          </td>
                          <td className="px-4 py-3">
                            {canWrite && (p.status === 'pendiente' || p.status === 'vencido') && (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => setCollectingPayment(p)}
                                  className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-[10px] font-semibold hover:bg-primary/20 transition-colors whitespace-nowrap"
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
              <TrendingUp className="w-4 h-4 text-primary" />
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
                          isLast ? 'text-primary' : 'text-muted-foreground'
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
    </div>
  )
}
