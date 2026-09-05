'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Wallet,
  Building2,
  Smartphone,
  CreditCard,
  HelpCircle,
  Lock,
  Loader2,
  ArrowRightLeft,
  Plus,
  AlertTriangle,
  Check,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useData } from '@/lib/data-context'
import { localISO } from '@/lib/api'
import {
  abrirCaja,
  cerrarCaja,
  createMovement,
  fetchBalances,
  fetchCajaControl,
  fetchDia,
  fetchLedger,
  fetchOpenSession,
  fetchSessions,
  type CajaProblema,
} from '@/lib/caja-api'
import type { AccountBalance, CashSession, LedgerEntry, MovementKind } from '@/lib/types'

type Tab = 'caja' | 'cuentas' | 'movimientos' | 'arqueos'

const ICONO_CUENTA = {
  caja: Wallet,
  banco: Building2,
  billetera: Smartphone,
  pasarela: CreditCard,
  transitoria: HelpCircle,
} as const

const plata = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`

function Monto({ n, className }: { n: number; className?: string }) {
  return <span className={cn('tabular-nums', className)}>{plata(n)}</span>
}

// ─────────────────────────────────────────────────────────────────
// Cierre: un solo campo, cuánto contaste
// ─────────────────────────────────────────────────────────────────
function CierreModal({
  cuenta,
  sesion,
  esperado,
  ingresos,
  egresos,
  onClose,
  onCerrado,
}: {
  cuenta: AccountBalance
  sesion: CashSession
  esperado: number
  // Los totales del turno se calculan en vivo: los de la sesión recién se
  // llenan al cerrarla, así que mientras está abierta son cero y el
  // resumen mostraría ceros al lado de un esperado que no los explica.
  ingresos: number
  egresos: number
  onClose: () => void
  onCerrado: () => void
}) {
  const [contado, setContado] = useState('')
  const [notas, setNotas] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valor = contado.trim() === '' ? null : Number(contado)
  const diferencia = valor === null ? null : valor - esperado

  const confirmar = async () => {
    if (valor === null || Number.isNaN(valor)) {
      setError('Escribí cuánto contaste')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await cerrarCaja(cuenta.accountId, valor, notas)
      onCerrado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cerrar')
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
          <h2 className="text-base font-bold text-foreground">Cerrar {cuenta.name}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Turno abierto desde {new Date(sesion.openedAt).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="rounded-xl bg-muted/50 px-4 py-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Saldo al abrir</span>
              <Monto n={esperado - ingresos + egresos} />
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Entró</span>
              <Monto n={ingresos} className="text-[#2E6040]" />
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Salió</span>
              <Monto n={egresos} className="text-destructive" />
            </div>
            <div className="flex justify-between pt-1.5 border-t border-border font-semibold">
              <span>Debería haber</span>
              <Monto n={esperado} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              ¿Cuánto contaste?
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={contado}
              onChange={(e) => setContado(e.target.value)}
              autoFocus
              placeholder={String(Math.round(esperado))}
              className="w-full px-3 py-3 rounded-xl border border-border bg-background text-lg font-semibold text-foreground tabular-nums outline-none focus:border-primary"
            />
          </div>

          {diferencia !== null && diferencia !== 0 && (
            <div
              className={cn(
                'rounded-xl px-4 py-3 text-sm',
                Math.abs(diferencia) > 0 ? 'bg-amber-50 text-amber-800' : ''
              )}
            >
              <p className="font-semibold">
                {diferencia > 0 ? 'Sobra ' : 'Falta '}
                {plata(Math.abs(diferencia))}
              </p>
              <p className="text-xs mt-0.5">
                Contá de nuevo, y si es correcto explicá abajo qué pasó.
              </p>
            </div>
          )}

          {diferencia === 0 && (
            <p className="text-sm text-[#2E6040] font-semibold flex items-center gap-1.5">
              <Check className="w-4 h-4" /> La caja cierra justo
            </p>
          )}

          {diferencia !== null && diferencia !== 0 && (
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                ¿Qué pasó?
              </label>
              <input
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Ej: vuelto mal dado a la mañana"
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm outline-none focus:border-primary"
              />
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-border flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground"
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={saving || valor === null}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Cerrar caja
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Movimiento manual: lo que los cobros no saben expresar
// ─────────────────────────────────────────────────────────────────
const TIPOS_MOVIMIENTO: Array<{ k: MovementKind; label: string; ayuda: string }> = [
  { k: 'transferencia', label: 'Transferencia entre cuentas', ayuda: 'Retirar de Mercado Pago al banco, depositar la recaudación' },
  { k: 'retiro', label: 'Retiro', ayuda: 'Plata que sale y no es un gasto del estudio' },
  { k: 'aporte', label: 'Aporte', ayuda: 'Plata que entra y no es un cobro' },
  { k: 'devolucion', label: 'Devolución', ayuda: 'Se le devolvió plata a una alumna' },
  { k: 'apertura', label: 'Saldo inicial', ayuda: 'Con cuánto arrancó esta cuenta en el sistema' },
]

function MovimientoModal({
  cuentas,
  onClose,
  onCreado,
}: {
  cuentas: AccountBalance[]
  onClose: () => void
  onCreado: () => void
}) {
  const [kind, setKind] = useState<MovementKind>('transferencia')
  const [desde, setDesde] = useState('')
  const [hacia, setHacia] = useState('')
  const [monto, setMonto] = useState('')
  const [concepto, setConcepto] = useState('')
  const [dia, setDia] = useState(localISO())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tipo = TIPOS_MOVIMIENTO.find((t) => t.k === kind)!
  const pideDesde = kind !== 'aporte' && kind !== 'apertura'
  const pideHacia = kind !== 'retiro' && kind !== 'devolucion'

  const guardar = async () => {
    const n = Number(monto)
    if (!n || n <= 0) {
      setError('Poné un monto')
      return
    }
    if (pideDesde && !desde) return setError('Elegí de qué cuenta sale')
    if (pideHacia && !hacia) return setError('Elegí a qué cuenta entra')
    setSaving(true)
    setError(null)
    try {
      await createMovement({
        kind,
        fromAccountId: pideDesde ? desde : null,
        toAccountId: pideHacia ? hacia : null,
        amount: n,
        concept: concepto,
        dia,
      })
      onCreado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar')
      setSaving(false)
    }
  }

  const selectClass =
    'w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:border-primary'

  return (
    <div className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-card w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl shadow-2xl border border-border max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground">Nuevo movimiento</h2>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">Tipo</label>
            <select value={kind} onChange={(e) => setKind(e.target.value as MovementKind)} className={selectClass}>
              {TIPOS_MOVIMIENTO.map((t) => (
                <option key={t.k} value={t.k}>{t.label}</option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground mt-1">{tipo.ayuda}</p>
          </div>

          {pideDesde && (
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">Sale de</label>
              <select value={desde} onChange={(e) => setDesde(e.target.value)} className={selectClass}>
                <option value="">Elegir cuenta...</option>
                {cuentas.map((c) => (
                  <option key={c.accountId} value={c.accountId}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {pideHacia && (
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">Entra a</label>
              <select value={hacia} onChange={(e) => setHacia(e.target.value)} className={selectClass}>
                <option value="">Elegir cuenta...</option>
                {cuentas.map((c) => (
                  <option key={c.accountId} value={c.accountId}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">Monto</label>
              <input
                type="number"
                inputMode="decimal"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                className={selectClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">Fecha</label>
              <input type="date" value={dia} onChange={(e) => setDia(e.target.value)} className={selectClass} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">Concepto</label>
            <input
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              placeholder="Ej: retiro de Mercado Pago al banco"
              className={selectClass}
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-border flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground">
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Registrar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Pantalla
// ─────────────────────────────────────────────────────────────────
export function CajaPage() {
  const { can, canWrite } = useData()
  const [tab, setTab] = useState<Tab>('caja')
  const [saldos, setSaldos] = useState<AccountBalance[]>([])
  const [sesion, setSesion] = useState<CashSession | null>(null)
  const [dia, setDia] = useState<{ ingresos: number; egresos: number; neto: number } | null>(null)
  const [libro, setLibro] = useState<LedgerEntry[]>([])
  const [arqueos, setArqueos] = useState<CashSession[]>([])
  const [problemas, setProblemas] = useState<CajaProblema[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cerrando, setCerrando] = useState(false)
  const [nuevoMov, setNuevoMov] = useState(false)
  const [abriendo, setAbriendo] = useState(false)

  const puedeOperar = can('caja.operar') || canWrite
  const puedeCerrar = can('caja.cerrar') || canWrite

  // La caja arqueable: es la que se cuenta con la mano.
  const cajaPrincipal = useMemo(() => saldos.find((s) => s.arquea) ?? null, [saldos])
  const hoy = localISO()

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const [b, ctrl] = await Promise.all([fetchBalances(), fetchCajaControl()])
      setSaldos(b)
      setProblemas(ctrl)

      const caja = b.find((x) => x.arquea)
      if (caja) {
        const [s, d, l, arq] = await Promise.all([
          fetchOpenSession(caja.accountId),
          fetchDia(caja.accountId, hoy),
          fetchLedger({ desde: hoy, hasta: hoy, accountId: caja.accountId }),
          fetchSessions(caja.accountId, 20),
        ])
        setSesion(s)
        setDia(d)
        setLibro(l)
        setArqueos(arq)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la caja')
    } finally {
      setCargando(false)
    }
  }, [hoy])

  useEffect(() => {
    cargar()
  }, [cargar])

  const abrir = async () => {
    if (!cajaPrincipal) return
    setAbriendo(true)
    try {
      await abrirCaja(cajaPrincipal.accountId)
      await cargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir')
    } finally {
      setAbriendo(false)
    }
  }

  // Lo que debería haber ahora en el cajón, según el sistema.
  const esperado = cajaPrincipal?.saldo ?? 0
  const sinPermisoCompleto = cajaPrincipal && (!cajaPrincipal.veCobros || !cajaPrincipal.veGastos)

  if (cargando) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Pestañas */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {([
          ['caja', 'Caja de hoy'],
          ['cuentas', 'Cuentas'],
          ['movimientos', 'Movimientos'],
          ['arqueos', 'Cierres'],
        ] as Array<[Tab, string]>).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              'px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors',
              tab === k
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">{error}</p>
      )}

      {sinPermisoCompleto && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-relaxed">
            Tu rol no ve {!cajaPrincipal?.veCobros ? 'los cobros' : 'los gastos'}, así que estos
            saldos están incompletos. No los uses para arquear.
          </p>
        </div>
      )}

      {problemas.length > 0 && (
        <div className="rounded-xl bg-destructive/5 border border-destructive/30 px-4 py-3">
          <p className="text-xs font-semibold text-destructive mb-1.5">
            {problemas.length === 1 ? 'Hay algo que revisar' : `Hay ${problemas.length} cosas que revisar`}
          </p>
          <ul className="space-y-1">
            {problemas.slice(0, 5).map((p, i) => (
              <li key={i} className="text-xs text-foreground/80">
                {p.problema}
                {p.cuenta && ` · ${p.cuenta}`}
                {p.monto ? ` · ${plata(p.monto)}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Caja de hoy ── */}
      {tab === 'caja' && (
        <div className="space-y-5">
          {!cajaPrincipal ? (
            <p className="text-sm text-muted-foreground">
              No hay ninguna cuenta marcada para arquear. Configurá una en Cuentas.
            </p>
          ) : (
            <>
              <div className="bg-card rounded-2xl border border-border overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-foreground">{cajaPrincipal.name}</h2>
                    <p className="text-xs text-muted-foreground">
                      {sesion
                        ? `Abierta desde ${new Date(sesion.openedAt).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                        : 'Sin turno abierto'}
                    </p>
                  </div>
                  {sesion ? (
                    puedeCerrar && (
                      <button
                        onClick={() => setCerrando(true)}
                        className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-2"
                      >
                        <Lock className="w-4 h-4" /> Cerrar caja
                      </button>
                    )
                  ) : (
                    puedeOperar && (
                      <button
                        onClick={abrir}
                        disabled={abriendo}
                        className="px-4 py-2 rounded-xl border border-primary text-primary text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
                      >
                        {abriendo && <Loader2 className="w-4 h-4 animate-spin" />}
                        Abrir caja
                      </button>
                    )
                  )}
                </div>

                <div className="grid grid-cols-3 divide-x divide-border">
                  <div className="px-5 py-4">
                    <p className="text-xs text-muted-foreground">Entró hoy</p>
                    <p className="text-xl font-bold text-[#2E6040] tabular-nums mt-1">
                      {plata(dia?.ingresos ?? 0)}
                    </p>
                  </div>
                  <div className="px-5 py-4">
                    <p className="text-xs text-muted-foreground">Salió hoy</p>
                    <p className="text-xl font-bold text-destructive tabular-nums mt-1">
                      {plata(dia?.egresos ?? 0)}
                    </p>
                  </div>
                  <div className="px-5 py-4">
                    <p className="text-xs text-muted-foreground">Debería haber</p>
                    <p className="text-xl font-bold text-foreground tabular-nums mt-1">
                      {plata(esperado)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-card rounded-2xl border border-border overflow-hidden">
                <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
                  <h3 className="text-sm font-bold text-foreground">Movimientos de hoy</h3>
                  {puedeOperar && (
                    <button
                      onClick={() => setNuevoMov(true)}
                      className="text-xs font-semibold text-primary flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" /> Nuevo
                    </button>
                  )}
                </div>
                <LibroLista entradas={libro} />
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Cuentas ── */}
      {tab === 'cuentas' && (
        <div className="grid gap-3 sm:grid-cols-2">
          {saldos.map((c) => {
            const Icono = ICONO_CUENTA[c.kind] ?? Wallet
            const destacar = c.isSystem && c.saldo !== 0
            return (
              <div
                key={c.accountId}
                className={cn(
                  'bg-card rounded-2xl border p-4',
                  destacar ? 'border-amber-300 bg-amber-50/50' : 'border-border'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
                      <Icono className="w-4.5 h-4.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {c.arquea ? 'Se cuenta al cierre' : c.kind}
                      </p>
                    </div>
                  </div>
                </div>
                <p className="text-2xl font-bold text-foreground tabular-nums mt-3">
                  {plata(c.saldo)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {c.movimientos} {c.movimientos === 1 ? 'movimiento' : 'movimientos'}
                </p>
                {destacar && (
                  <p className="text-[11px] text-amber-800 mt-2 leading-tight">
                    Hay plata sin asignar a una cuenta real. Revisá estos cobros y ponelos donde van.
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Movimientos ── */}
      {tab === 'movimientos' && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Hoy</h3>
            {puedeOperar && (
              <button
                onClick={() => setNuevoMov(true)}
                className="text-xs font-semibold text-primary flex items-center gap-1.5"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" /> Nuevo movimiento
              </button>
            )}
          </div>
          <LibroLista entradas={libro} />
        </div>
      )}

      {/* ── Cierres ── */}
      {tab === 'arqueos' && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          {arqueos.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              Todavía no se cerró ninguna caja
            </p>
          ) : (
            <div className="divide-y divide-border">
              {arqueos.map((a) => (
                <div key={a.id} className="px-5 py-3.5 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {new Date(a.fecha + 'T12:00:00').toLocaleDateString('es-AR', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {a.closedAt &&
                        `Cerrada ${new Date(a.closedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`}
                      {a.notas && ` · ${a.notas}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-foreground tabular-nums">
                      {plata(a.saldoReal ?? 0)}
                    </p>
                    {a.diferencia !== null && a.diferencia !== 0 ? (
                      <p
                        className={cn(
                          'text-[11px] font-semibold tabular-nums',
                          a.diferencia > 0 ? 'text-amber-700' : 'text-destructive'
                        )}
                      >
                        {a.diferencia > 0 ? 'sobró ' : 'faltó '}
                        {plata(Math.abs(a.diferencia))}
                      </p>
                    ) : (
                      <p className="text-[11px] text-[#2E6040] font-semibold">cerró justo</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {cerrando && cajaPrincipal && sesion && (
        <CierreModal
          cuenta={cajaPrincipal}
          sesion={sesion}
          esperado={esperado}
          ingresos={dia?.ingresos ?? 0}
          egresos={dia?.egresos ?? 0}
          onClose={() => setCerrando(false)}
          onCerrado={() => {
            setCerrando(false)
            cargar()
          }}
        />
      )}

      {nuevoMov && (
        <MovimientoModal
          cuentas={saldos.filter((s) => !s.isSystem)}
          onClose={() => setNuevoMov(false)}
          onCreado={() => {
            setNuevoMov(false)
            cargar()
          }}
        />
      )}
    </div>
  )
}

function LibroLista({ entradas }: { entradas: LedgerEntry[] }) {
  if (entradas.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-sm text-muted-foreground">
        Todavía no hay movimientos
      </p>
    )
  }
  return (
    <div className="divide-y divide-border">
      {entradas.map((e) => (
        <div key={`${e.origen}-${e.refId}-${e.sentido}`} className="px-5 py-3 flex items-center gap-3">
          <div
            className={cn(
              'w-7 h-7 rounded-full flex items-center justify-center shrink-0',
              e.sentido === 'ingreso' ? 'bg-[#E8F2EB] text-[#2E6040]' : 'bg-destructive/10 text-destructive'
            )}
          >
            {e.sentido === 'ingreso' ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground truncate">{e.concepto}</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {new Date(e.at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
              {e.contraparte && ` · ${e.contraparte}`}
              {e.medio && ` · ${e.medio}`}
            </p>
          </div>
          <span
            className={cn(
              'text-sm font-semibold tabular-nums shrink-0',
              e.sentido === 'ingreso' ? 'text-[#2E6040]' : 'text-destructive'
            )}
          >
            {e.sentido === 'ingreso' ? '+' : '−'}
            {plata(e.monto)}
          </span>
        </div>
      ))}
    </div>
  )
}
