'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Plus,
  Loader2,
  Filter,
  X,
  Receipt,
  Check,
  Ban,
  Pencil,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useData, useStudio } from '@/lib/data-context'
import { addDays, localISO, settingText } from '@/lib/api'
import {
  createExpense,
  fetchAccounts,
  fetchExpenseCategories,
  fetchExpenses,
  payExpense,
  updateExpense,
  voidExpense,
  type ExpenseFilters,
  type ExpenseInput,
} from '@/lib/caja-api'
import type { Account, Expense, ExpenseCategory } from '@/lib/types'

const plata = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`

const TIPOS_COMPROBANTE: Array<Expense['docType']> = [
  'sin comprobante',
  'factura',
  'recibo',
  'ticket',
  'nota de credito',
  'orden de pago',
]

const ESTADO_ETIQUETA: Record<Expense['status'], string> = {
  pendiente: 'Por pagar',
  pagado: 'Pagado',
  anulado: 'Anulado',
}

function EstadoBadge({ status }: { status: Expense['status'] }) {
  const clase =
    status === 'pagado'
      ? 'bg-[#E8F2EB] text-[#2E6040]'
      : status === 'pendiente'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-muted text-muted-foreground line-through'
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0', clase)}>
      {ESTADO_ETIQUETA[status]}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────
// Alta y edición
// ─────────────────────────────────────────────────────────────────
function GastoModal({
  gasto,
  categorias,
  cuentas,
  onClose,
  onGuardado,
}: {
  gasto?: Expense
  categorias: ExpenseCategory[]
  cuentas: Account[]
  onClose: () => void
  onGuardado: () => void
}) {
  const { settings, paymentMethods } = useStudio()
  const isEdit = !!gasto

  // El estado con el que arranca un gasto nuevo lo define el estudio: el
  // flujo del cuaderno es cargarlo ya pagado; el de cuentas por pagar, no.
  const estadoDefault = settingText(settings, 'gastos_estado_default', 'pagado') as Expense['status']
  const exigeComprobante = settingText(settings, 'gastos_comprobante_obligatorio', 'false') === 'true'

  const [fecha, setFecha] = useState(gasto?.fecha ?? localISO())
  const [categoryId, setCategoryId] = useState(gasto?.categoryId ?? '')
  const [detail, setDetail] = useState(gasto?.detail ?? '')
  const [amount, setAmount] = useState(gasto ? String(gasto.amount) : '')
  const [supplier, setSupplier] = useState(gasto?.supplier ?? '')
  const [docType, setDocType] = useState<Expense['docType']>(gasto?.docType ?? 'sin comprobante')
  const [docNumber, setDocNumber] = useState(gasto?.docNumber ?? '')
  const [status, setStatus] = useState<Expense['status']>(gasto?.status ?? estadoDefault)
  const [method, setMethod] = useState(gasto?.method ?? '')
  const [accountId, setAccountId] = useState(gasto?.accountId ?? '')
  const [paidDate, setPaidDate] = useState(gasto?.paidDate ?? localISO())
  const [tags, setTags] = useState((gasto?.tags ?? []).join(', '))
  const [notes, setNotes] = useState(gasto?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inputClass =
    'w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary'
  const labelClass = 'block text-xs font-semibold text-foreground mb-1.5'

  // Al elegir el medio se sugiere su cuenta, que es lo que pasa el 95% de
  // las veces; se puede cambiar.
  const elegirMedio = (code: string) => {
    setMethod(code)
    if (!accountId) {
      const m = paymentMethods.find((p) => p.code === code)
      const sugerida = cuentas.find((c) => c.kind === (code === 'efectivo' ? 'caja' : 'banco'))
      if (sugerida) setAccountId(sugerida.id)
      void m
    }
  }

  const guardar = async () => {
    const monto = Number(amount)
    if (!monto || monto <= 0) return setError('Poné el monto')
    if (!detail.trim()) return setError('Escribí de qué se trata')
    if (status === 'pagado' && !accountId) return setError('Elegí de qué cuenta salió')
    if (exigeComprobante && docType === 'sin comprobante') {
      return setError('El estudio pide comprobante para cargar un gasto')
    }
    setSaving(true)
    setError(null)
    const input: ExpenseInput = {
      fecha,
      categoryId: categoryId || null,
      detail,
      amount: monto,
      supplier,
      docType,
      docNumber,
      method: status === 'pagado' ? method || null : null,
      accountId: status === 'pagado' ? accountId || null : null,
      status,
      paidDate: status === 'pagado' ? paidDate : null,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      notes,
    }
    try {
      if (isEdit) await updateExpense(gasto.id, input)
      else await createExpense(input)
      onGuardado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
      setSaving(false)
    }
  }

  const rubros = categorias.filter((c) => !c.parentId)
  const subrubros = categorias.filter((c) => c.parentId)

  return (
    <div className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl border border-border max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
          <h2 className="text-base font-bold text-foreground">
            {isEdit ? 'Editar gasto' : 'Nuevo gasto'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Fecha</label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Monto *</label>
              <input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>De qué se trata *</label>
            <input
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Ej: alquiler de septiembre"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Categoría</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}>
                <option value="">Sin categoría</option>
                {rubros.map((r) => (
                  <optgroup key={r.id} label={r.name}>
                    <option value={r.id}>{r.name}</option>
                    {subrubros
                      .filter((s) => s.parentId === r.id)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Proveedor</label>
              <input
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="A quién se le pagó"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Comprobante</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as Expense['docType'])}
                className={inputClass}
              >
                {TIPOS_COMPROBANTE.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Número</label>
              <input value={docNumber} onChange={(e) => setDocNumber(e.target.value)} className={inputClass} />
            </div>
          </div>

          {/* Pagado o por pagar: un gasto pendiente no mueve un peso */}
          <div>
            <label className={labelClass}>Estado</label>
            <div className="grid grid-cols-2 gap-2">
              {(['pagado', 'pendiente'] as const).map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setStatus(e)}
                  className={cn(
                    'rounded-xl border px-3 py-2 text-left transition-colors',
                    status === e ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                  )}
                >
                  <span className="block text-sm font-semibold text-foreground">
                    {e === 'pagado' ? 'Ya lo pagué' : 'Queda por pagar'}
                  </span>
                  <span className="block text-[11px] text-muted-foreground leading-tight mt-0.5">
                    {e === 'pagado' ? 'Sale de una cuenta ahora' : 'No mueve plata todavía'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {status === 'pagado' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Medio</label>
                <select value={method} onChange={(e) => elegirMedio(e.target.value)} className={inputClass}>
                  <option value="">Elegir...</option>
                  {paymentMethods.filter((m) => m.active).map((m) => (
                    <option key={m.code} value={m.code}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Sale de *</label>
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputClass}>
                  <option value="">Elegir cuenta...</option>
                  {cuentas.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className={labelClass}>Fecha de pago</label>
                <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} className={inputClass} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Etiquetas</label>
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="separadas por coma"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Notas</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
            </div>
          </div>

          {error && <p className="text-xs text-destructive bg-destructive/10 rounded-xl px-3 py-2">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-border flex gap-2 shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground">
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? 'Guardar' : 'Cargar gasto'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Pantalla
// ─────────────────────────────────────────────────────────────────
export function GastosPage() {
  const { can, canWrite } = useData()
  const { paymentMethods } = useStudio()

  const [desde, setDesde] = useState(addDays(localISO(), -30))
  const [hasta, setHasta] = useState(localISO())
  const [categoryId, setCategoryId] = useState('')
  const [supplier, setSupplier] = useState('')
  const [method, setMethod] = useState('')
  const [accountId, setAccountId] = useState('')
  const [tag, setTag] = useState('')
  const [status, setStatus] = useState<'' | Expense['status']>('')
  const [verFiltros, setVerFiltros] = useState(false)

  const [gastos, setGastos] = useState<Expense[]>([])
  const [categorias, setCategorias] = useState<ExpenseCategory[]>([])
  const [cuentas, setCuentas] = useState<Account[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editando, setEditando] = useState<Expense | undefined>()
  const [nuevo, setNuevo] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const puedeCargar = can('gastos.cargar') || canWrite
  const puedeEditar = can('gastos.editar') || canWrite
  const puedeAnular = can('gastos.anular') || canWrite

  const filtros: ExpenseFilters = useMemo(
    () => ({
      desde,
      hasta,
      categoryId: categoryId || null,
      supplier: supplier || null,
      method: method || null,
      accountId: accountId || null,
      tag: tag || null,
      status: status || null,
    }),
    [desde, hasta, categoryId, supplier, method, accountId, tag, status]
  )

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const [g, c, a] = await Promise.all([
        fetchExpenses(filtros),
        fetchExpenseCategories(),
        fetchAccounts(),
      ])
      setGastos(g)
      setCategorias(c)
      setCuentas(a)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los gastos')
    } finally {
      setCargando(false)
    }
  }, [filtros])

  useEffect(() => {
    cargar()
  }, [cargar])

  // El total de lo filtrado, siempre a la vista: un listado de gastos sin
  // el total no sirve para decidir nada.
  const totales = useMemo(() => {
    const vigentes = gastos.filter((g) => g.status !== 'anulado')
    return {
      pagado: vigentes.filter((g) => g.status === 'pagado').reduce((a, g) => a + g.amount, 0),
      pendiente: vigentes.filter((g) => g.status === 'pendiente').reduce((a, g) => a + g.amount, 0),
      cantidad: vigentes.length,
    }
  }, [gastos])

  const anular = async (g: Expense) => {
    const motivo = window.prompt(`¿Por qué se anula "${g.detail}"?`)
    if (motivo === null) return
    setBusyId(g.id)
    try {
      await voidExpense(g.id, motivo)
      await cargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo anular')
    } finally {
      setBusyId(null)
    }
  }

  const pagar = async (g: Expense) => {
    const cuenta = cuentas[0]
    if (!cuenta) return
    setBusyId(g.id)
    try {
      await payExpense(g.id, g.accountId ?? cuenta.id, g.method ?? 'efectivo', localISO())
      await cargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el pago')
    } finally {
      setBusyId(null)
    }
  }

  const limpiarFiltros = () => {
    setCategoryId('')
    setSupplier('')
    setMethod('')
    setAccountId('')
    setTag('')
    setStatus('')
  }
  const hayFiltros = !!(categoryId || supplier || method || accountId || tag || status)

  const inputClass =
    'w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:border-primary'

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Totales del filtro */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-3 divide-x divide-border">
          <div className="px-5 py-4">
            <p className="text-xs text-muted-foreground">Pagado en el período</p>
            <p className="text-xl font-bold text-foreground tabular-nums mt-1">{plata(totales.pagado)}</p>
          </div>
          <div className="px-5 py-4">
            <p className="text-xs text-muted-foreground">Queda por pagar</p>
            <p className="text-xl font-bold text-amber-700 tabular-nums mt-1">{plata(totales.pendiente)}</p>
          </div>
          <div className="px-5 py-4 col-span-2 sm:col-span-1">
            <p className="text-xs text-muted-foreground">Gastos</p>
            <p className="text-xl font-bold text-foreground tabular-nums mt-1">{totales.cantidad}</p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-card rounded-2xl border border-border">
        <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="px-3 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground outline-none" />
          <span className="text-xs text-muted-foreground">a</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="px-3 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground outline-none" />

          <button
            onClick={() => setVerFiltros(!verFiltros)}
            className={cn(
              'px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors',
              hayFiltros ? 'border-primary text-primary bg-primary/5' : 'border-border text-muted-foreground'
            )}
          >
            <Filter className="w-3.5 h-3.5" />
            Filtros{hayFiltros ? ' activos' : ''}
          </button>

          {hayFiltros && (
            <button onClick={limpiarFiltros} className="text-xs text-muted-foreground hover:text-foreground">
              Limpiar
            </button>
          )}

          <div className="flex-1" />

          {puedeCargar && (
            <button
              onClick={() => setNuevo(true)}
              className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Nuevo gasto
            </button>
          )}
        </div>

        {verFiltros && (
          <div className="px-4 pb-4 pt-1 grid gap-3 sm:grid-cols-3 border-t border-border">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}>
              <option value="">Toda categoría</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="Proveedor"
              className={inputClass}
            />
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputClass}>
              <option value="">Todo medio</option>
              {paymentMethods.map((m) => (
                <option key={m.code} value={m.code}>{m.name}</option>
              ))}
            </select>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputClass}>
              <option value="">Toda cuenta</option>
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Etiqueta" className={inputClass} />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as '' | Expense['status'])}
              className={inputClass}
            >
              <option value="">Todo estado</option>
              <option value="pagado">Pagados</option>
              <option value="pendiente">Por pagar</option>
              <option value="anulado">Anulados</option>
            </select>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">{error}</p>}

      {/* Listado */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        {cargando ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : gastos.length === 0 ? (
          <div className="py-16 text-center">
            <Receipt className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {hayFiltros ? 'Ningún gasto con esos filtros' : 'Todavía no hay gastos cargados'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {gastos.map((g) => (
              <div key={g.id} className="px-5 py-3.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p
                      className={cn(
                        'text-sm font-medium truncate',
                        g.status === 'anulado' ? 'text-muted-foreground line-through' : 'text-foreground'
                      )}
                    >
                      {g.detail}
                    </p>
                    <EstadoBadge status={g.status} />
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {new Date(g.fecha + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                    {g.categoryName && ` · ${g.categoryName}`}
                    {g.supplier && ` · ${g.supplier}`}
                    {g.docNumber && ` · ${g.docType} ${g.docNumber}`}
                    {g.voidReason && ` · ${g.voidReason}`}
                  </p>
                </div>

                <span
                  className={cn(
                    'text-sm font-semibold tabular-nums shrink-0',
                    g.status === 'anulado' ? 'text-muted-foreground line-through' : 'text-foreground'
                  )}
                >
                  {plata(g.amount)}
                </span>

                {busyId === g.id ? (
                  <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                ) : (
                  g.status !== 'anulado' && (
                    <div className="flex items-center gap-1 shrink-0">
                      {g.status === 'pendiente' && puedeEditar && (
                        <button
                          onClick={() => pagar(g)}
                          title="Marcar como pagado"
                          className="w-7 h-7 rounded-lg hover:bg-[#E8F2EB] flex items-center justify-center text-muted-foreground hover:text-[#2E6040]"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {puedeEditar && (
                        <button
                          onClick={() => setEditando(g)}
                          title="Editar"
                          className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {puedeAnular && (
                        <button
                          onClick={() => anular(g)}
                          title="Anular"
                          className="w-7 h-7 rounded-lg hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive"
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {(nuevo || editando) && (
        <GastoModal
          gasto={editando}
          categorias={categorias}
          cuentas={cuentas}
          onClose={() => {
            setNuevo(false)
            setEditando(undefined)
          }}
          onGuardado={() => {
            setNuevo(false)
            setEditando(undefined)
            cargar()
          }}
        />
      )}
    </div>
  )
}
