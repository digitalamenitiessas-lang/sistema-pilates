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
import { useData, useStudio } from '@/lib/data-context'
import { hoyISO } from '@/lib/api'
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
  fetchTurno,
  reabrirCaja,
  type CajaProblema,
  type TurnoEnCurso,
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
// El período del turno
//
// El turno se muestra por su período —de cuándo a cuándo— y nada más.
// Hasta el 27/09 la pantalla avisaba en naranja "Sin cerrar hace 4 días ·
// el arqueo va a juntar todos esos días", y el cierre repetía "lo que
// contás incluye esos días, no solo hoy", como si dejar la caja abierta
// fuera un descuido. Matías lo definió al revés: la caja se abre y se
// cierra cuando el estudio quiere. Lo que hacía falta era ver el período y
// que los números fueran los de ese período; el reto sobraba.
//
// Siempre en el huso del estudio. Antes las horas salían con el del
// navegador, y los días se contaban cortando el ISO en UTC, que a las
// 21:00 de Buenos Aires ya es el día siguiente.
// ─────────────────────────────────────────────────────────────────
const HUSO_DEL_ESTUDIO = 'America/Argentina/Buenos_Aires'
const PARTES_DEL_MOMENTO = new Intl.DateTimeFormat('en-CA', {
  timeZone: HUSO_DEL_ESTUDIO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  // h23 por lo mismo que en `ahoraDelEstudio` (lib/api.ts), y porque
  // es-AR, según el motor, escribe "10:58 a. m.".
  hourCycle: 'h23',
})
const DIA_DE_LA_SEMANA = new Intl.DateTimeFormat('es-AR', {
  timeZone: HUSO_DEL_ESTUDIO,
  weekday: 'short',
})

/** Un instante leído en el estudio: el día ("mié 23/09", o "hoy") y la hora ("10:58"). */
function enElEstudio(iso: string): { fecha: string; dia: string; hora: string } {
  const d = new Date(iso)
  const partes = PARTES_DEL_MOMENTO.formatToParts(d)
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? '00'
  const fecha = `${p('year')}-${p('month')}-${p('day')}`
  return {
    fecha,
    dia:
      fecha === hoyISO()
        ? 'hoy'
        : `${DIA_DE_LA_SEMANA.format(d).replace('.', '')} ${p('day')}/${p('month')}`,
    hora: `${p('hour')}:${p('minute')}`,
  }
}

/** Para una frase: "el mié 23/09 a las 10:58", o "hoy a las 10:58". */
function cuando(iso: string): string {
  const m = enElEstudio(iso)
  return `${m.dia === 'hoy' ? 'hoy' : `el ${m.dia}`} a las ${m.hora}`
}

/** "de 09:05 a 13:48" si fue un solo día; "del mié 23/09 10:58 a hoy 13:48" si fueron varios. */
function periodo(desde: string, hasta: string): string {
  const a = enElEstudio(desde)
  const h = enElEstudio(hasta)
  if (a.fecha === h.fecha) return `de ${a.hora} a ${h.hora}`
  return `del ${a.dia} ${a.hora} ${h.dia === 'hoy' ? 'a hoy' : `al ${h.dia}`} ${h.hora}`
}

// ─────────────────────────────────────────────────────────────────
// Cierre: un solo campo, cuánto contaste
// ─────────────────────────────────────────────────────────────────
function CierreModal({
  cuenta,
  sesion,
  turnoInicial,
  onTurno,
  onClose,
  onCerrado,
}: {
  cuenta: AccountBalance
  sesion: CashSession
  // Los totales del turno se calculan en vivo: los de la sesión recién se
  // llenan al cerrarla, así que mientras está abierta son cero.
  //
  // Llega el que ya tenía la pantalla, para no abrir en blanco, y se vuelve
  // a pedir: lo que se firma es lo de ahora, y la pantalla puede llevar
  // horas cargada. `onTurno` le pasa el número nuevo a la tarjeta de atrás,
  // así no quedan dos "debería haber" distintos uno encima del otro.
  turnoInicial: TurnoEnCurso | null
  onTurno: (t: TurnoEnCurso) => void
  onClose: () => void
  onCerrado: () => void
}) {
  const [contado, setContado] = useState('')
  const [notas, setNotas] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [turno, setTurno] = useState<TurnoEnCurso | null>(turnoInicial)
  const [errorTurno, setErrorTurno] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    fetchTurno(sesion)
      .then((t) => {
        if (!vigente) return
        setTurno(t)
        setErrorTurno(null)
        onTurno(t)
      })
      .catch((err) => {
        if (!vigente) return
        // Se descarta el que había llegado: mostrarlo sería presentar un
        // número viejo como el de ahora. Se dice que no se pudo.
        setTurno(null)
        setErrorTurno(err instanceof Error ? err.message : 'No se pudo calcular el turno')
      })
    return () => {
      vigente = false
    }
  }, [sesion, onTurno])

  const esperado = turno?.esperado ?? null
  const calculando = turno === null && errorTurno === null
  const valor = contado.trim() === '' ? null : Number(contado)
  const diferencia = valor === null || esperado === null ? null : valor - esperado
  // Sin esperado la pantalla no puede saber si hay diferencia, y la base
  // puede pedir el motivo igual: el campo tiene que estar para poder darlo.
  const pideMotivo = errorTurno !== null || (diferencia !== null && diferencia !== 0)

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
          {/* El período entero, de la apertura a ahora: es lo que se está
              contando. Si fueron varios días, las dos fechas lo dicen. */}
          <p className="text-xs text-muted-foreground mt-0.5">
            Turno {periodo(sesion.openedAt, turno?.hasta ?? new Date().toISOString())}
          </p>
        </div>

        <div className="px-5 py-4 space-y-4">
          {turno ? (
            <div className="rounded-xl bg-muted/50 px-4 py-3 space-y-1.5 text-sm">
              {/* "Al cierre anterior" y no "al abrir": el turno arranca donde
                  terminó el anterior, y lo que entre mientras la caja está
                  cerrada se suma a este. Es la cuenta de `cerrar_caja`. */}
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {turno.desde ? 'Saldo al cierre anterior' : 'Saldo inicial'}
                </span>
                <Monto n={turno.saldoInicial} />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Entró</span>
                <Monto n={turno.ingresos} className="text-exito-fuerte" />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Salió</span>
                <Monto n={turno.egresos} className="text-destructive-fuerte" />
              </div>
              <div className="flex justify-between pt-1.5 border-t border-border font-semibold">
                <span>Debería haber</span>
                <Monto n={turno.esperado} />
              </div>
              {/* Lo único en que el período de la cuenta no es el de arriba:
                  lo que entró con la caja cerrada. Se nombra sólo si pasó,
                  para que "Entró" no tenga plata de antes de la apertura sin
                  que nadie sepa de dónde salió. */}
              {turno.antesDeAbrir > 0 && (
                <p className="text-[11px] text-muted-foreground leading-snug pt-1">
                  Incluye {turno.antesDeAbrir === 1 ? 'un movimiento' : `${turno.antesDeAbrir} movimientos`}{' '}
                  de antes de abrirla:{' '}
                  {turno.desde
                    ? `el turno arranca en el cierre anterior, ${cuando(turno.desde)}.`
                    : 'es el primer cierre de esta caja y junta todo lo anterior.'}
                </p>
              )}
            </div>
          ) : calculando ? (
            <div className="rounded-xl bg-muted/50 px-4 py-6 flex justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <p className="rounded-xl bg-aviso-suave px-4 py-3 text-xs text-aviso-fuerte leading-relaxed">
              No se pudo calcular cuánto debería haber ({errorTurno}). Podés cerrar igual: el
              sistema hace la cuenta al cerrar y te avisa si falta el motivo de una diferencia.
            </p>
          )}

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
              placeholder={esperado === null ? '' : String(Math.round(esperado))}
              className="w-full px-3 py-3 rounded-xl border border-border bg-background text-lg font-semibold text-foreground tabular-nums outline-none focus:border-primary"
            />
          </div>

          {diferencia !== null && diferencia !== 0 && (
            <div
              className={cn(
                'rounded-xl px-4 py-3 text-sm',
                Math.abs(diferencia) > 0 ? 'bg-aviso-suave text-aviso-fuerte' : ''
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
            <p className="text-sm text-exito-fuerte font-semibold flex items-center gap-1.5">
              <Check className="w-4 h-4" /> La caja cierra justo
            </p>
          )}

          {pideMotivo && (
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                {esperado === null ? 'Si hubo diferencia, ¿qué pasó?' : '¿Qué pasó?'}
              </label>
              <input
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Ej: vuelto mal dado a la mañana"
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm outline-none focus:border-primary"
              />
            </div>
          )}

          {error && <p className="text-xs text-destructive-fuerte">{error}</p>}
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
            disabled={saving || valor === null || calculando}
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
  { k: 'devolucion', label: 'Devolución', ayuda: 'Se le devolvió plata a un cliente' },
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
  const [dia, setDia] = useState(hoyISO())
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

          {error && <p className="text-xs text-destructive-fuerte">{error}</p>}
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
  // Para escribir "Efectivo" y no "efectivo": las claves de
  // `totalesPorMedio` son los `code` del catálogo, que desde la 0074 los
  // crea el estudio y pueden ser slugs como `debito_macro`.
  const { paymentMethods } = useStudio()
  const [tab, setTab] = useState<Tab>('caja')
  const [saldos, setSaldos] = useState<AccountBalance[]>([])
  const [sesion, setSesion] = useState<CashSession | null>(null)
  // Lo que firmaría el cierre si se cerrara ahora (ver `fetchTurno`).
  const [turno, setTurno] = useState<TurnoEnCurso | null>(null)
  const [dia, setDia] = useState<{ ingresos: number; egresos: number; neto: number } | null>(null)
  const [libro, setLibro] = useState<LedgerEntry[]>([])
  /**
   * El libro del día de TODAS las cuentas, que es otra pregunta que la de
   * `libro` —ése es el cajón y nada más—.
   *
   * La pestaña Movimientos mostraba `libro`, o sea exactamente lo mismo
   * que "Caja de hoy". Con tres cobros del día —uno en efectivo, uno por
   * transferencia y uno con tarjeta— mostraba UNO y los otros dos no
   * estaban en ninguna pantalla: el resumen del día del estudio no se
   * podía ver en ningún lado. Lo encontró Matías el 23/09 registrando
   * cobros de verdad.
   */
  const [libroDelDia, setLibroDelDia] = useState<LedgerEntry[]>([])
  const [arqueos, setArqueos] = useState<CashSession[]>([])
  const [problemas, setProblemas] = useState<CajaProblema[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cerrando, setCerrando] = useState(false)
  const [nuevoMov, setNuevoMov] = useState(false)
  const [abriendo, setAbriendo] = useState(false)

  const puedeOperar = can('caja.operar') || canWrite
  const puedeCerrar = can('caja.cerrar') || canWrite
  // Su propia clave, no la de cerrar: reabrir deshace un cierre firmado y
  // la 0020 lo separó a propósito.
  const puedeReabrir = can('caja.reabrir') || canWrite
  const [reabriendo, setReabriendo] = useState<string | null>(null)

  // Reabrir un arqueo ya existía en la base y en la API desde la 0020, y
  // nunca tuvo botón. El error más probable del día uno es un cero de más
  // al tipear lo contado, y sin esto solo se arregla entrando al SQL
  // Editor. Pide confirmación porque deshace un cierre firmado.
  const reabrir = async (id: string, fecha: string) => {
    const dia = new Date(fecha + 'T12:00:00').toLocaleDateString('es-AR', {
      day: 'numeric', month: 'long',
    })
    if (!window.confirm(
      `¿Reabrir el arqueo del ${dia}?\n\nEl cierre deja de estar firmado y la caja vuelve a quedar abierta. ` +
      `Se usa cuando lo contado se cargó mal.`
    )) return
    setReabriendo(id)
    try {
      await reabrirCaja(id)
      await cargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reabrir')
    } finally {
      setReabriendo(null)
    }
  }

  // La caja arqueable: es la que se cuenta con la mano.
  const cajaPrincipal = useMemo(() => saldos.find((s) => s.arquea) ?? null, [saldos])

  /**
   * Lo que se movió hoy, cuenta por cuenta, sobre el libro entero.
   *
   * Se arma agrupando el libro y no leyendo una vista nueva: la vista
   * `caja_dia` existe pero es por cuenta, y pedirla una vez por cuenta
   * sería una consulta por cada una. Acá los datos ya están.
   *
   * Sólo entran las cuentas que tuvieron movimiento: una lista con seis
   * ceros y un número esconde el número.
   */
  const resumenDelDia = useMemo(() => {
    const por = new Map<string, { accountId: string; name: string; ingresos: number; egresos: number; movimientos: number }>()
    for (const e of libroDelDia) {
      const prev = por.get(e.accountId) ?? {
        accountId: e.accountId,
        name: saldos.find((c) => c.accountId === e.accountId)?.name ?? 'Sin cuenta',
        ingresos: 0,
        egresos: 0,
        movimientos: 0,
      }
      if (e.sentido === 'ingreso') prev.ingresos += e.monto
      else prev.egresos += e.monto
      prev.movimientos += 1
      por.set(e.accountId, prev)
    }
    const filas = [...por.values()]
      .map((f) => ({ ...f, neto: f.ingresos - f.egresos }))
      .sort((a, b) => b.neto - a.neto)
    return { filas, neto: filas.reduce((t, f) => t + f.neto, 0) }
  }, [libroDelDia, saldos])
  const hoy = hoyISO()

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const [b, ctrl, todo] = await Promise.all([
        fetchBalances(),
        fetchCajaControl(),
        // Sin `accountId`: el libro entero del día. `fetchLedger` sólo
        // filtra por cuenta si se la pasan.
        fetchLedger({ desde: hoy, hasta: hoy }),
      ])
      setSaldos(b)
      setProblemas(ctrl)
      setLibroDelDia(todo)

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
        // Después, porque necesita la sesión: el turno cuenta desde su
        // `desde`. Si falla no se deja el de la carga anterior, que sería
        // un "debería haber" viejo presentado como el de ahora.
        try {
          setTurno(s ? await fetchTurno(s) : null)
        } catch (err) {
          setTurno(null)
          throw err
        }
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

  // Lo que debería haber ahora en el cajón. Con un turno abierto es el
  // mismo número que va a mostrar el cierre, sacado de la misma cuenta: el
  // saldo de `account_balances` suma también lo fechado a futuro, que el
  // cierre deja afuera, y la tarjeta y el cierre no pueden decir dos cosas.
  const esperado = sesion ? turno?.esperado ?? null : cajaPrincipal?.saldo ?? 0
  const sinPermisoCompleto = cajaPrincipal && (!cajaPrincipal.veCobros || !cajaPrincipal.veGastos)

  if (cargando) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary-fuerte" />
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
                ? 'border-primary text-primary-fuerte'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-sm text-destructive-fuerte bg-destructive/10 rounded-xl px-4 py-3">{error}</p>
      )}

      {sinPermisoCompleto && (
        <div className="rounded-xl bg-aviso-suave border border-aviso/40 px-4 py-3 flex gap-2.5">
          <AlertTriangle className="w-4 h-4 text-aviso-fuerte shrink-0 mt-0.5" />
          <p className="text-xs text-aviso-fuerte leading-relaxed">
            Tu rol no ve {!cajaPrincipal?.veCobros ? 'los cobros' : 'los gastos'}, así que estos
            saldos están incompletos. No los uses para arquear.
          </p>
        </div>
      )}

      {problemas.length > 0 && (
        <div className="rounded-xl bg-destructive/5 border border-destructive/30 px-4 py-3">
          <p className="text-xs font-semibold text-destructive-fuerte mb-1.5">
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
                      {sesion ? `Abierta ${cuando(sesion.openedAt)}` : 'Sin turno abierto'}
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
                        className="px-4 py-2 rounded-xl border border-primary text-primary-fuerte text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
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
                    <p className="text-xl font-bold text-exito-fuerte tabular-nums mt-1">
                      {plata(dia?.ingresos ?? 0)}
                    </p>
                  </div>
                  <div className="px-5 py-4">
                    <p className="text-xs text-muted-foreground">Salió hoy</p>
                    <p className="text-xl font-bold text-destructive-fuerte tabular-nums mt-1">
                      {plata(dia?.egresos ?? 0)}
                    </p>
                  </div>
                  <div className="px-5 py-4">
                    <p className="text-xs text-muted-foreground">Debería haber</p>
                    <p className="text-xl font-bold text-foreground tabular-nums mt-1">
                      {esperado === null ? '—' : plata(esperado)}
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
                      className="text-xs font-semibold text-primary-fuerte flex items-center gap-1.5"
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
                  destacar ? 'border-aviso/40 bg-aviso-suave' : 'border-border'
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
                  <p className="text-[11px] text-aviso-fuerte mt-2 leading-tight">
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
        <div className="space-y-4">
          {/* EL RESUMEN DEL DÍA, que es lo que esta pestaña no daba.
              "Caja de hoy" contesta cuánto hay en el cajón —y hace bien en
              mirar sólo el efectivo, porque es lo que se cuenta con la
              mano—. Lo que faltaba era la otra pregunta: cuánto entró hoy
              EN TOTAL y por dónde. Se arma sobre el libro entero, así que
              una cuenta nueva aparece sola. */}
          {resumenDelDia.filas.length > 0 && (
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border">
                <h3 className="text-sm font-bold text-foreground">Resumen de hoy</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Todo lo que se movió hoy, cuenta por cuenta
                </p>
              </div>
              <div className="divide-y divide-border">
                {resumenDelDia.filas.map((f) => (
                  <div key={f.accountId} className="px-5 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{f.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {f.movimientos} {f.movimientos === 1 ? 'movimiento' : 'movimientos'}
                        {f.egresos > 0 && ` · entró ${plata(f.ingresos)}, salió ${plata(f.egresos)}`}
                      </p>
                    </div>
                    <Monto
                      n={f.neto}
                      className={cn(
                        'text-sm font-semibold shrink-0',
                        f.neto >= 0 ? 'text-exito-fuerte' : 'text-destructive-fuerte'
                      )}
                    />
                  </div>
                ))}
                <div className="px-5 py-3 flex items-center gap-3 bg-muted/40">
                  <p className="flex-1 text-sm font-bold text-foreground">Total del día</p>
                  <Monto n={resumenDelDia.neto} className="text-sm font-bold shrink-0" />
                </div>
              </div>
            </div>
          )}

          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">Movimientos de hoy</h3>
              {puedeOperar && (
                <button
                  onClick={() => setNuevoMov(true)}
                  className="text-xs font-semibold text-primary-fuerte flex items-center gap-1.5"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" /> Nuevo movimiento
                </button>
              )}
            </div>
            <LibroLista entradas={libroDelDia} cuentas={saldos} />
          </div>
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
                    {/* El título es el día del cierre, y solo, escondía que
                        el turno podía venir de días antes. */}
                    <p className="text-[11px] text-muted-foreground">
                      {a.closedAt && `Turno ${periodo(a.openedAt, a.closedAt)}`}
                      {a.notas && ` · ${a.notas}`}
                    </p>

                    {/* EL DESGLOSE POR MEDIO.
                        La base lo venía guardando desde la 0020 —el cierre
                        calcula `totales_por_medio` y lo sella en la fila— y
                        no se mostraba en ninguna pantalla. Era el resumen
                        del día ya escrito y nadie podía leerlo.

                        Va acá y no en el cajón: el número grande de la
                        derecha es lo que se contó con la mano, y esto es
                        TODO lo que entró en el turno, por dónde entró. Por
                        eso el efectivo suele coincidir con el monto y el
                        resto no: la transferencia nunca pasó por el cajón. */}
                    {Object.keys(a.totalesPorMedio).length > 0 && (
                      <div className="mt-1.5">
                        {/* El total primero: es la pregunta ("¿cuánto
                            entró?") y el desglose es la respuesta larga.

                            "Cobrado en el turno" y no "del día", que sería
                            falso: la base suma los cobros entre la apertura
                            y el cierre, y un turno puede abarcar varios días
                            —el que cerramos venía del 18/09—. Y "cobrado" y
                            no "entró", porque `totales_por_medio` suma sólo
                            `payments`: los gastos pagados en el turno no
                            están acá. */}
                        <p className="text-[11px] text-foreground">
                          Cobrado en el turno{' '}
                          <span className="font-bold tabular-nums">
                            {plata(Object.values(a.totalesPorMedio).reduce((t, n) => t + n, 0))}
                          </span>
                        </p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                          {Object.entries(a.totalesPorMedio)
                            .sort((x, y) => y[1] - x[1])
                            .map(([code, monto]) => (
                              <span key={code} className="text-[11px] text-muted-foreground">
                                {/* 'sin_medio' lo arma la propia base cuando
                                    un cobro no tiene medio cargado. No es un
                                    code del catálogo, así que se traduce acá. */}
                                {code === 'sin_medio'
                                  ? 'Sin medio'
                                  : paymentMethods.find((m) => m.code === code)?.name ?? code}{' '}
                                <span className="font-semibold text-foreground/70 tabular-nums">
                                  {plata(monto)}
                                </span>
                              </span>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-foreground tabular-nums">
                      {plata(a.saldoReal ?? 0)}
                    </p>
                    {a.diferencia !== null && a.diferencia !== 0 ? (
                      <p
                        className={cn(
                          'text-[11px] font-semibold tabular-nums',
                          a.diferencia > 0 ? 'text-aviso-fuerte' : 'text-destructive-fuerte'
                        )}
                      >
                        {a.diferencia > 0 ? 'sobró ' : 'faltó '}
                        {plata(Math.abs(a.diferencia))}
                      </p>
                    ) : (
                      <p className="text-[11px] text-exito-fuerte font-semibold">cerró justo</p>
                    )}
                  </div>
                  {puedeReabrir && (
                    <button
                      onClick={() => reabrir(a.id, a.fecha)}
                      disabled={reabriendo === a.id}
                      className="shrink-0 px-2.5 py-1.5 rounded-lg border border-border text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:border-primary/40 disabled:opacity-50"
                      title="Volver a abrir este turno para corregirlo"
                    >
                      {reabriendo === a.id ? '…' : 'Reabrir'}
                    </button>
                  )}
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
          turnoInicial={turno}
          onTurno={setTurno}
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

/**
 * `cuentas` sólo se pasa cuando la lista mezcla varias: ahí cada renglón
 * dice a cuál entró la plata. En la de "Caja de hoy" se omite, porque
 * repetir "Caja del mostrador" en cada línea de una lista que ya es del
 * mostrador es ruido.
 */
function LibroLista({
  entradas,
  cuentas,
}: {
  entradas: LedgerEntry[]
  cuentas?: AccountBalance[]
}) {
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
              e.sentido === 'ingreso' ? 'bg-exito-suave text-exito-fuerte' : 'bg-destructive/10 text-destructive-fuerte'
            )}
          >
            {e.sentido === 'ingreso' ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground truncate">{e.concepto}</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {enElEstudio(e.at).hora}
              {e.contraparte && ` · ${e.contraparte}`}
              {e.medio && ` · ${e.medio}`}
              {cuentas &&
                ` · ${cuentas.find((c) => c.accountId === e.accountId)?.name ?? 'sin cuenta'}`}
            </p>
          </div>
          <span
            className={cn(
              'text-sm font-semibold tabular-nums shrink-0',
              e.sentido === 'ingreso' ? 'text-exito-fuerte' : 'text-destructive-fuerte'
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
