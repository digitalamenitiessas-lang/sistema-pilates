'use client'

/**
 * Personal, horas y remuneraciones (0053).
 *
 * Tres cosas en una pantalla, separadas por permiso: quién trabaja, qué
 * horas hizo, y cuánto se le liquida. Las tres claves son distintas a
 * propósito — ver quién trabaja no es ver cuánto gana, y recepción puede
 * cargar horas sin enterarse de un sueldo.
 *
 * Lo que NO se carga acá: las clases dictadas. Se cuentan solas desde la
 * agenda, con la profesora de cada fecha y sin las suspendidas. Pedirle
 * al mostrador que copie un dato que el sistema ya tiene es abrir la
 * puerta a que los dos números no coincidan.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  Loader2, Plus, Trash2, Users, Clock, Wallet, Lock, AlertTriangle, Check, IdCard,
} from 'lucide-react'
import { cn, nombreDelDia } from '@/lib/utils'
import { useData, useStudio } from '@/lib/data-context'
import { SeccionPlegable, SeccionesPlegables } from '@/components/ui/seccion-plegable'
import { hoyISO, addDays } from '@/lib/api'
import {
  fetchCondiciones,
  fijarCondicion,
  fetchHoras,
  cargarHoras,
  borrarHoras,
  fetchAjustes,
  cargarAjuste,
  borrarAjuste,
  fetchLiquidacion,
  fetchLiquidacionesCerradas,
  cerrarLiquidacion,
  pagarLiquidacion,
  anularLiquidacion,
  fetchUltimosCierres,
  cerrarTodas,
} from '@/lib/personal-api'
import { fetchAccounts } from '@/lib/caja-api'
import type { Account } from '@/lib/types'
import type {
  AjusteLiquidacion,
  CondicionPago,
  HorasTrabajadas,
  FilaLiquidacion,
  LiquidacionCerrada,
} from '@/lib/types'

const plata = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`
const fecha = (iso: string) => new Date(`${iso}T00:00`).toLocaleDateString('es-AR')

const MODALIDAD: Record<CondicionPago['modalidad'], string> = {
  por_clase: 'Por clase',
  por_hora: 'Por hora',
  mensual: 'Mensual',
}

const input =
  'px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors'

/** El primer día del mes en curso, que es el período que se mira siempre. */
function inicioDeMes(): string {
  return hoyISO().slice(0, 8) + '01'
}

// ─────────────────────────────────────────────────────────────────────

function Liquidacion({
  desde,
  hasta,
  cerradas,
  ultimos,
  onCerrar,
}: {
  desde: string
  hasta: string
  /** Las ya cerradas del período, para no ofrecer cerrar dos veces */
  cerradas: LiquidacionCerrada[]
  /** Hasta cuándo se liquidó por última vez a cada una (0055) */
  ultimos: Map<string, string>
  onCerrar: () => void
}) {
  const [filas, setFilas] = useState<FilaLiquidacion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cerrando, setCerrando] = useState<string | null>(null)

  useEffect(() => {
    setFilas(null)
    setError(null)
    fetchLiquidacion(desde, hasta)
      .then(setFilas)
      .catch((e) => {
        setFilas([])
        setError(e instanceof Error ? e.message : 'No se pudo calcular la liquidación')
      })
  }, [desde, hasta])

  // Ya cerrada para ESTE período exacto. Cerrar el mismo mes dos veces lo
  // rechaza la base igual; esto es para no ofrecerlo.
  const yaCerrada = (id: string) =>
    cerradas.some(
      (c) => c.teacherId === id && c.desde === desde && c.hasta === hasta && c.estado !== 'anulada'
    )

  /**
   * El período elegido empieza antes de donde terminó el último cierre,
   * o sea que se pisa. La base lo rechaza igual (0055): esto es para
   * decirlo ANTES de que el mostrador apriete, no después.
   */
  const sePisa = (id: string) => {
    const ultimo = ultimos.get(id)
    return !!ultimo && desde <= ultimo
  }

  const cerrar = async (f: FilaLiquidacion) => {
    if (
      !window.confirm(
        `Cerrar la liquidación de ${f.profesora} por ${plata(f.total)}?\n\n` +
          'El número queda fijo: si después se carga una clase o cambia una tarifa, ' +
          'este total no se mueve.'
      )
    )
      return
    setCerrando(f.teacherId)
    setError(null)
    try {
      await cerrarLiquidacion(f.teacherId, desde, hasta)
      onCerrar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cerrar')
    } finally {
      setCerrando(null)
    }
  }

  if (error) {
    return <p className="text-xs text-destructive-fuerte bg-destructive/10 rounded-xl px-3 py-2">{error}</p>
  }
  if (filas === null) {
    return <p className="text-sm text-muted-foreground py-6 text-center">Calculando…</p>
  }

  const total = filas.reduce((a, f) => a + f.total, 0)

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground uppercase tracking-wide">
              <th className="text-left px-4 py-3 font-semibold">Profesora/or</th>
              <th className="text-right px-4 py-3 font-semibold">Clases</th>
              <th className="text-right px-4 py-3 font-semibold">Por clases</th>
              <th className="text-right px-4 py-3 font-semibold hidden md:table-cell">Horas</th>
              <th className="text-right px-4 py-3 font-semibold hidden md:table-cell">Por horas</th>
              <th className="text-right px-4 py-3 font-semibold hidden lg:table-cell">Mensual</th>
              <th className="text-right px-4 py-3 font-semibold hidden lg:table-cell">Ajustes</th>
              <th className="text-right px-4 py-3 font-semibold">Total</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filas.map((f) => (
              <tr key={f.teacherId}>
                <td className="px-4 py-3 text-foreground">
                  {f.profesora}
                  {(f.ausencias > 0 || f.tardanzas > 0) && (
                    <span className="block text-[10px] text-aviso-fuerte">
                      {f.ausencias > 0 && `${f.ausencias} ausencia${f.ausencias === 1 ? '' : 's'}`}
                      {f.ausencias > 0 && f.tardanzas > 0 && ' · '}
                      {f.tardanzas > 0 && `${f.tardanzas} tardanza${f.tardanzas === 1 ? '' : 's'}`}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{f.clases}</td>
                <td className="px-4 py-3 text-right tabular-nums">{plata(f.montoClases)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground hidden md:table-cell">{f.horas}</td>
                <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">{plata(f.montoHoras)}</td>
                <td className="px-4 py-3 text-right tabular-nums hidden lg:table-cell">{plata(f.mensual)}</td>
                {/* En cero no se escribe un $0 que no dice nada: un guion se
                    lee como "acá no hubo ajuste". Y si hubo, el signo importa
                    más que el color, así que va el número con su menos. */}
                <td className={cn(
                  'px-4 py-3 text-right tabular-nums hidden lg:table-cell',
                  f.ajustes < 0 ? 'text-destructive-fuerte' : f.ajustes > 0 ? 'text-exito-fuerte' : 'text-muted-foreground'
                )}>
                  {f.ajustes === 0
                    ? '—'
                    : `${f.ajustes < 0 ? '−' : '+'}${plata(Math.abs(f.ajustes))}`}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-bold text-foreground">{plata(f.total)}</td>
                <td className="px-4 py-3 text-right">
                  {yaCerrada(f.teacherId) ? (
                    <span className="text-[10px] font-semibold text-muted-foreground inline-flex items-center gap-1">
                      <Lock className="w-3 h-3" /> cerrada
                    </span>
                  ) : sePisa(f.teacherId) ? (
                    <span
                      className="text-[10px] font-semibold text-aviso-fuerte"
                      title={`Ya se le liquidó hasta el ${fecha(ultimos.get(f.teacherId)!)}`}
                    >
                      liquidada hasta el {fecha(ultimos.get(f.teacherId)!)}
                    </span>
                  ) : (
                    <button
                      disabled={cerrando === f.teacherId || f.total <= 0}
                      onClick={() => cerrar(f)}
                      className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary-fuerte text-[10px] font-semibold hover:bg-primary/20 disabled:opacity-40 whitespace-nowrap"
                    >
                      {cerrando === f.teacherId ? '…' : 'Cerrar'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-baseline justify-between px-4">
        <p className="text-xs text-muted-foreground">{filas.length} en el período</p>
        <p className="text-sm font-bold text-foreground tabular-nums">{plata(total)}</p>
      </div>

      {/* Este texto decía "cuando le pagues, cargalo en Gastos", y era
          cierto hasta que existió el botón de pagar. Desde la 0054 el
          gasto lo crea `pagar_liquidacion()` —van juntos en una sola
          función justamente para que no haya una liquidación pagada sin su
          gasto—, así que seguir la instrucción al pie de la letra hacía
          salir el sueldo DOS VECES del libro: el gasto del botón y el
          cargado a mano, los dos legítimos a los ojos del sistema.
          Encontrado el 17/09 revisando el módulo antes de que lo usen. */}
      <p className="text-[11px] text-muted-foreground px-4">
        Este cálculo sale de las clases que figuran dictadas en la agenda y de las condiciones que
        regían cada día. <span className="font-semibold">Liquidar no es pagar</span>: primero se
        cierra el período y después se usa <span className="font-semibold">Registrar el pago</span>,
        que carga el gasto en el libro por vos. No hace falta cargarlo a mano en Gastos — si lo
        hacés, el sueldo sale dos veces.
      </p>
      {/* El prorrateo del mensual (0064) tiene que estar escrito donde se
          mira el número: si alguien cierra una quincena y ve la mitad del
          sueldo, sin esta línea parece un error. Antes el mes entero se
          sumaba en cada cierre, así que dos quincenas pagaban dos
          sueldos. */}
      <p className="text-[11px] text-muted-foreground px-4 pb-1">
        El <span className="font-semibold">sueldo mensual</span> se reparte por los días del mes
        que cubre el período: un mes completo paga uno, y dos quincenas pagan mitad y mitad —
        suman un sueldo, no dos.
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────

function Condiciones() {
  const { teachers } = useStudio()
  const [filas, setFilas] = useState<CondicionPago[] | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [teacherId, setTeacherId] = useState('')
  const [modalidad, setModalidad] = useState<CondicionPago['modalidad']>('por_clase')
  const [monto, setMonto] = useState('')
  const [desde, setDesde] = useState(inicioDeMes())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(() => {
    fetchCondiciones().then(setFilas).catch(() => setFilas([]))
  }, [])
  useEffect(cargar, [cargar])

  const guardar = async () => {
    setSaving(true)
    setError(null)
    try {
      await fijarCondicion({ teacherId, modalidad, monto: Number(monto) || 0, desde })
      setAbierto(false)
      setMonto('')
      cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const nombre = (id: string) => teachers.find((t) => t.id === id)?.name ?? '—'

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        Una condición <span className="font-semibold">no se edita</span>: se carga la que rige desde
        una fecha, y la anterior queda cerrada sola. Es lo que hace que subirle la tarifa hoy no
        cambie la liquidación del mes pasado.
      </p>

      {filas === null ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Cargando…</p>
      ) : filas.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          Sin condiciones cargadas. Hasta que las cargues, la liquidación cuenta las clases y no
          suma plata.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {filas.map((c) => (
            <div key={c.id} className="flex items-center gap-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{nombre(c.teacherId)}</p>
                <p className="text-[11px] text-muted-foreground">
                  {MODALIDAD[c.modalidad]} · desde el {fecha(c.desde)}
                </p>
              </div>
              <p className="text-sm font-semibold text-foreground tabular-nums shrink-0">
                {plata(c.monto)}
              </p>
            </div>
          ))}
        </div>
      )}

      {abierto ? (
        <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className={input}>
              <option value="">Elegí a quién…</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <select
              value={modalidad}
              onChange={(e) => setModalidad(e.target.value as CondicionPago['modalidad'])}
              className={input}
            >
              <option value="por_clase">Por clase dictada</option>
              <option value="por_hora">Por hora trabajada</option>
              <option value="mensual">Mensual fijo</option>
            </select>
            <input
              type="number"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="Monto"
              className={input}
            />
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={input} />
          </div>
          {error && <p className="text-xs text-destructive-fuerte">{error}</p>}
          <div className="flex gap-2">
            <button
              disabled={saving || !teacherId || !monto}
              onClick={guardar}
              className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Guardar
            </button>
            <button
              onClick={() => setAbierto(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAbierto(true)}
          className="w-full py-2 rounded-xl border border-border text-xs font-semibold text-foreground hover:bg-muted flex items-center justify-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          Fijar una condición
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────

/**
 * Ajustes manuales de la liquidación (0065, requerimiento 12.6): un
 * premio, un descuento, la corrección de un mes anterior. Lo que la
 * fórmula no captura y antes no tenía dónde ir — la única salida era
 * tocarle la tarifa, que cambia el pasado de todas las clases de ese día.
 *
 * El monto se carga como "suma" o "resta" con un número positivo, y no
 * escribiendo un menos: un signo que se olvida convierte un descuento en
 * un premio, y en un sueldo eso se nota tarde.
 *
 * El motivo es obligatorio acá y TAMBIÉN en la base (`check btrim(motivo)
 * <> ''`). El estudio ya tiene dos candados que viven sólo en el
 * navegador y los dos se esquivan; un ajuste de sueldo sin explicación es
 * exactamente lo que nadie va a poder reconstruir seis meses después.
 */
function Ajustes({ desde, hasta }: { desde: string; hasta: string }) {
  const { can, canWrite } = useData()
  const { teachers } = useStudio()
  const [filas, setFilas] = useState<AjusteLiquidacion[] | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [teacherId, setTeacherId] = useState('')
  const [dia, setDia] = useState(hoyISO())
  const [signo, setSigno] = useState<'suma' | 'resta'>('suma')
  const [monto, setMonto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Es plata: la misma clave que las tarifas y la liquidación.
  const puede = can('personal.remuneracion')

  const cargar = useCallback(() => {
    fetchAjustes(desde, hasta).then(setFilas).catch(() => setFilas([]))
  }, [desde, hasta])
  useEffect(cargar, [cargar])

  const guardar = async () => {
    setSaving(true)
    setError(null)
    try {
      const n = Math.abs(Number(monto) || 0)
      await cargarAjuste({
        teacherId,
        fecha: dia,
        monto: signo === 'resta' ? -n : n,
        motivo,
      })
      setAbierto(false)
      setMonto('')
      setMotivo('')
      cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const quitar = async (id: string) => {
    setError(null)
    try {
      await borrarAjuste(id)
      cargar()
    } catch (e) {
      // Acá vive el rechazo del período ya liquidado, con el texto que
      // escribió la base: dice qué período y qué hacer.
      setError(e instanceof Error ? e.message : 'No se pudo borrar')
    }
  }

  const nombre = (id: string) => teachers.find((t) => t.id === id)?.name ?? '—'

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        Lo que el cálculo no puede saber: un premio, un descuento, la corrección de un mes
        anterior. Entra en el período que contiene su fecha, y <span className="font-semibold">el
        motivo es obligatorio</span>. Una vez que el período se cierra, el ajuste no se toca más.
      </p>

      {filas === null ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Cargando…</p>
      ) : filas.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Sin ajustes en el período</p>
      ) : (
        <div className="divide-y divide-border">
          {filas.map((a) => (
            <div key={a.id} className="flex items-center gap-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{nombre(a.teacherId)}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {fecha(a.fecha)} · {a.motivo}
                </p>
              </div>
              <p
                className={cn(
                  'text-sm tabular-nums font-semibold shrink-0',
                  a.monto < 0 ? 'text-destructive-fuerte' : 'text-exito-fuerte'
                )}
              >
                {a.monto < 0 ? '−' : '+'}
                {plata(Math.abs(a.monto))}
              </p>
              {puede && (
                <button
                  onClick={() => quitar(a.id)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive-fuerte shrink-0"
                  aria-label="Borrar"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-destructive-fuerte">{error}</p>}

      {!puede ? null : abierto ? (
        <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className={input}>
              <option value="">Elegí a quién…</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <input type="date" value={dia} onChange={(e) => setDia(e.target.value)} className={input} />
            <select
              value={signo}
              onChange={(e) => setSigno(e.target.value as 'suma' | 'resta')}
              className={input}
            >
              <option value="suma">Le suma al sueldo</option>
              <option value="resta">Le resta del sueldo</option>
            </select>
            <input
              type="number"
              min="0"
              step="100"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="Monto"
              className={input}
            />
          </div>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Por qué (obligatorio): premio por cobertura, adelanto, corrección de agosto…"
            className={cn(input, 'w-full')}
          />
          <div className="flex gap-2">
            <button
              disabled={saving || !teacherId || !motivo.trim() || !(Number(monto) > 0)}
              onClick={guardar}
              className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Guardar
            </button>
            <button
              onClick={() => setAbierto(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAbierto(true)}
          className="w-full py-2 rounded-xl border border-border text-xs font-semibold text-foreground hover:bg-muted flex items-center justify-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          Cargar un ajuste
        </button>
      )}
    </div>
  )
}

function Horas({ desde, hasta }: { desde: string; hasta: string }) {
  const { can, canWrite } = useData()
  const { teachers } = useStudio()
  const [filas, setFilas] = useState<HorasTrabajadas[] | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [teacherId, setTeacherId] = useState('')
  const [dia, setDia] = useState(hoyISO())
  const [tipo, setTipo] = useState<HorasTrabajadas['tipo']>('trabajo')
  const [horas, setHoras] = useState('')
  const [detalle, setDetalle] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const puedeCargar = can('personal.cargar') || canWrite

  const cargar = useCallback(() => {
    fetchHoras(desde, hasta).then(setFilas).catch(() => setFilas([]))
  }, [desde, hasta])
  useEffect(cargar, [cargar])

  const guardar = async () => {
    setSaving(true)
    setError(null)
    try {
      await cargarHoras({ teacherId, fecha: dia, tipo, horas: Number(horas) || 0, detalle })
      setAbierto(false)
      setHoras('')
      setDetalle('')
      cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const quitar = async (id: string) => {
    try {
      await borrarHoras(id)
      cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo borrar')
    }
  }

  const nombre = (id: string) => teachers.find((t) => t.id === id)?.name ?? '—'

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        Solo las horas que <span className="font-semibold">no son clases</span>: cubrir recepción,
        una tarea, una capacitación. Las clases dictadas se cuentan solas desde la agenda.
      </p>

      {filas === null ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Cargando…</p>
      ) : filas.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Sin horas cargadas en el período</p>
      ) : (
        <div className="divide-y divide-border">
          {filas.map((h) => (
            <div key={h.id} className="flex items-center gap-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">
                  {nombre(h.teacherId)}
                  {h.tipo !== 'trabajo' && (
                    <span className="ml-2 text-[10px] font-semibold text-aviso-fuerte">
                      {h.tipo === 'ausencia' ? 'ausencia' : 'tardanza'}
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {fecha(h.fecha)}
                  {h.detalle ? ` · ${h.detalle}` : ''}
                </p>
              </div>
              <p className="text-sm tabular-nums text-foreground shrink-0">{h.horas} h</p>
              {puedeCargar && (
                <button
                  onClick={() => quitar(h.id)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive-fuerte shrink-0"
                  aria-label="Borrar"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-destructive-fuerte">{error}</p>}

      {!puedeCargar ? null : abierto ? (
        <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className={input}>
              <option value="">Elegí a quién…</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <input type="date" value={dia} onChange={(e) => setDia(e.target.value)} className={input} />
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as HorasTrabajadas['tipo'])}
              className={input}
            >
              <option value="trabajo">Horas trabajadas</option>
              <option value="tardanza">Llegó tarde</option>
              <option value="ausencia">No vino</option>
            </select>
            <input
              type="number"
              step="0.5"
              value={horas}
              onChange={(e) => setHoras(e.target.value)}
              placeholder="Horas"
              disabled={tipo === 'ausencia'}
              className={cn(input, tipo === 'ausencia' && 'opacity-50')}
            />
          </div>
          <input
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
            placeholder="Detalle (cubrió recepción, capacitación…)"
            className={cn(input, 'w-full')}
          />
          <div className="flex gap-2">
            <button
              disabled={saving || !teacherId}
              onClick={guardar}
              className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Guardar
            </button>
            <button
              onClick={() => setAbierto(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAbierto(true)}
          className="w-full py-2 rounded-xl border border-border text-xs font-semibold text-foreground hover:bg-muted flex items-center justify-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          Cargar horas
        </button>
      )}
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────

/**
 * Las liquidaciones ya cerradas del período, y el pago.
 *
 * Muestra **las dos cifras**: la congelada al cerrar y la que daría hoy.
 * Es el antídoto del congelado — si alguien carga una clase atrasada
 * después de cerrar, la diferencia aparece en vez de perderse. El
 * sistema no elige por el estudio: le muestra las dos.
 */
function Cerradas({
  filas,
  onCambio,
}: {
  filas: LiquidacionCerrada[]
  onCambio: () => void
}) {
  const { paymentMethods } = useStudio()
  const [cuentas, setCuentas] = useState<Account[]>([])
  const [pagando, setPagando] = useState<LiquidacionCerrada | null>(null)
  const [metodo, setMetodo] = useState('')
  const [cuenta, setCuenta] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchAccounts().then(setCuentas).catch(() => setCuentas([]))
  }, [])

  const pagar = async () => {
    if (!pagando) return
    setBusy(true)
    setError(null)
    try {
      await pagarLiquidacion(pagando.id, metodo, cuenta)
      setPagando(null)
      onCambio()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo pagar')
    } finally {
      setBusy(false)
    }
  }

  const anular = async (c: LiquidacionCerrada) => {
    const motivo = window.prompt('¿Por qué se anula esta liquidación?')
    if (motivo === null) return
    setError(null)
    try {
      await anularLiquidacion(c.id, motivo)
      onCambio()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo anular')
    }
  }

  if (filas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Sin liquidaciones cerradas en el período. Cerrá una desde la tabla de arriba.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-xs text-destructive-fuerte bg-destructive/10 rounded-xl px-3 py-2">{error}</p>
      )}

      <div className="divide-y divide-border">
        {filas.map((c) => {
          const dif = c.totalHoy - c.total
          return (
            <div key={c.id} className="py-3 space-y-1.5">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {c.profesora}
                    {c.estado === 'pagada' && (
                      <span className="ml-2 text-[10px] font-semibold text-exito-fuerte inline-flex items-center gap-1">
                        <Check className="w-3 h-3" /> pagada
                      </span>
                    )}
                    {c.estado === 'anulada' && (
                      <span className="ml-2 text-[10px] font-semibold text-muted-foreground">anulada</span>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {fecha(c.desde)} al {fecha(c.hasta)} · {c.clases} clases · {c.horas} h
                    {c.voidReason ? ` · ${c.voidReason}` : ''}
                  </p>
                </div>
                <p className="text-sm font-bold text-foreground tabular-nums shrink-0">{plata(c.total)}</p>
              </div>

              {/* La diferencia, que es el motivo por el que se guardan las
                  dos cifras. Solo si la hay y si no está anulada. */}
              {c.estado !== 'anulada' && Math.abs(dif) >= 1 && (
                <p className="text-[11px] text-aviso-fuerte bg-aviso-suave rounded-lg px-2.5 py-1.5 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                  <span>
                    Se cargó algo después de cerrar: hoy el período daría{' '}
                    <span className="font-semibold">{plata(c.totalHoy)}</span>, {dif > 0 ? 'o sea' : 'o sea'}{' '}
                    {plata(Math.abs(dif))} {dif > 0 ? 'de más' : 'de menos'}. El total cerrado no se
                    toca: si corresponde, cerrale un ajuste aparte.
                  </span>
                </p>
              )}

              {c.estado === 'cerrada' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setPagando(c)
                      setMetodo(paymentMethods[0]?.code ?? '')
                      setCuenta(cuentas[0]?.id ?? '')
                    }}
                    className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold"
                  >
                    Registrar el pago
                  </button>
                  <button
                    onClick={() => anular(c)}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-muted-foreground hover:bg-muted"
                  >
                    Anular
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {pagando && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm"
          onClick={() => setPagando(null)}
        >
          <div
            className="bg-card rounded-2xl shadow-2xl w-full max-w-sm border border-border p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-base font-bold text-foreground">Pagar la liquidación</h3>
              <p className="text-xs text-muted-foreground">
                {pagando.profesora} · {plata(pagando.total)}
              </p>
            </div>

            <select value={metodo} onChange={(e) => setMetodo(e.target.value)} className={cn(input, 'w-full')}>
              {paymentMethods.map((m) => (
                <option key={m.code} value={m.code}>{m.name}</option>
              ))}
            </select>
            <select value={cuenta} onChange={(e) => setCuenta(e.target.value)} className={cn(input, 'w-full')}>
              {cuentas.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>

            {/* Que quede dicho antes de apretar: esto mueve plata de verdad. */}
            <p className="text-[11px] text-muted-foreground">
              Se carga como gasto en <span className="font-semibold">Sueldos y honorarios</span> y baja
              del saldo de esa cuenta. Para deshacerlo hay que anular el gasto desde Gastos.
            </p>

            {error && <p className="text-xs text-destructive-fuerte">{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={() => setPagando(null)}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                disabled={busy || !metodo || !cuenta}
                onClick={pagar}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Pagar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────

/**
 * La ficha de cada profesora: sus horarios y su condición vigente.
 *
 * Los horarios están en la grilla desde la 0035, pero repartidos entre 64
 * clases: "¿qué da Ivana?" no se podía contestar de un vistazo. Acá se
 * arman desde `classes`, que el paquete del estudio ya trae — no hace
 * falta consultar nada.
 *
 * Es la clase TITULAR de la grilla. Los reemplazos de una fecha puntual
 * no aparecen acá y sí en la liquidación, que mira quién dio cada clase
 * ese día. Son dos preguntas distintas: "qué horarios tiene" y "qué
 * clases dio en el período".
 */
function Fichas({ condiciones }: { condiciones: CondicionPago[] }) {
  const { teachers, classes } = useStudio()

  const vigente = (id: string, modalidad: CondicionPago['modalidad']) =>
    condiciones
      .filter((c) => c.teacherId === id && c.modalidad === modalidad && c.desde <= hoyISO())
      .sort((a, b) => b.desde.localeCompare(a.desde))[0]

  return (
    <div className="divide-y divide-border">
      {teachers.map((t) => {
        const suyas = classes
          .filter((c) => c.teacherId === t.id)
          .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.time.localeCompare(b.time))

        // Agrupadas por día: doce renglones "Lunes 08:00" no se leen.
        const porDia = new Map<number, string[]>()
        for (const c of suyas) {
          porDia.set(c.dayOfWeek, [...(porDia.get(c.dayOfWeek) ?? []), c.time])
        }

        const cond = (['por_clase', 'por_hora', 'mensual'] as const)
          .map((m) => {
            const c = vigente(t.id, m)
            return c ? `${MODALIDAD[m]}: ${plata(c.monto)}` : null
          })
          .filter(Boolean)

        return (
          <div key={t.id} className="py-3 space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
              <p className="text-sm font-semibold text-foreground">{t.name}</p>
              {t.laboral?.fechaIngreso && (
                <p className="text-[11px] text-muted-foreground">
                  desde el {fecha(t.laboral.fechaIngreso)}
                </p>
              )}
              {t.laboral?.fechaBaja && (
                <p className="text-[11px] text-destructive-fuerte font-semibold">
                  baja el {fecha(t.laboral.fechaBaja)}
                </p>
              )}
            </div>

            {porDia.size === 0 ? (
              <p className="text-[11px] text-muted-foreground">Sin clases asignadas en la grilla</p>
            ) : (
              <div className="space-y-0.5">
                {[...porDia.entries()].map(([dia, horas]) => (
                  <p key={dia} className="text-[11px] text-muted-foreground">
                    <span className="font-semibold text-foreground">{nombreDelDia(dia)}</span>{' '}
                    {horas.join(' · ')}
                  </p>
                ))}
                <p className="text-[11px] text-muted-foreground pt-0.5">
                  {suyas.length} {suyas.length === 1 ? 'clase' : 'clases'} por semana en la grilla
                </p>
              </div>
            )}

            {cond.length > 0 ? (
              <p className="text-[11px] text-foreground">{cond.join(' · ')}</p>
            ) : (
              <p className="text-[11px] text-aviso-fuerte">
                Sin condición de pago cargada: se le cuentan las clases y no se le liquida plata.
              </p>
            )}

            {/* Sin cuenta no puede entrar ni tomar asistencia, y es lo
                que hoy frena que las profesoras usen el sistema. */}
            {!t.userId && (
              <p className="text-[11px] text-aviso-fuerte">
                Sin cuenta para entrar al sistema. Se crea en Configuración → Accesos y se vincula en
                Profesoras.
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────

export function PersonalPage() {
  const { can, canWrite } = useData()
  const [desde, setDesde] = useState(inicioDeMes())
  const [hasta, setHasta] = useState(hoyISO())

  const veSueldos = can('personal.remuneracion')

  const [cerradas, setCerradas] = useState<LiquidacionCerrada[]>([])
  const [condiciones, setCondiciones] = useState<CondicionPago[]>([])
  const [ultimos, setUltimos] = useState<Map<string, string>>(new Map())
  const [cerrandoTodas, setCerrandoTodas] = useState(false)
  const [avisoCierre, setAvisoCierre] = useState<string | null>(null)

  const recargar = useCallback(() => {
    if (!veSueldos) return
    fetchLiquidacionesCerradas(desde, hasta).then(setCerradas).catch(() => setCerradas([]))
    fetchUltimosCierres().then(setUltimos).catch(() => setUltimos(new Map()))
    fetchCondiciones().then(setCondiciones).catch(() => setCondiciones([]))
  }, [desde, hasta, veSueldos])
  useEffect(recargar, [recargar])

  // Dónde terminó el último cierre de cualquiera: es el arranque natural
  // del período siguiente, y evita tener que acordarse.
  const ultimoCierre = [...ultimos.values()].sort().pop()

  const cerrarElMes = async () => {
    if (!window.confirm(`Cerrar la liquidación de todos del ${fecha(desde)} al ${fecha(hasta)}?`)) return
    setCerrandoTodas(true)
    setAvisoCierre(null)
    try {
      const r = await cerrarTodas(desde, hasta)
      setAvisoCierre(
        r.salteadas.length === 0
          ? `Se cerraron ${r.cerradas}.`
          : `Se cerraron ${r.cerradas}. Quedaron afuera: ${r.salteadas.join(' · ')}`
      )
      recargar()
    } catch (e) {
      setAvisoCierre(e instanceof Error ? e.message : 'No se pudieron cerrar')
    } finally {
      setCerrandoTodas(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-[11px] text-muted-foreground block mb-1">Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={input} />
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground block mb-1">Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={input} />
        </div>
        <button
          onClick={() => {
            setDesde(inicioDeMes())
            setHasta(hoyISO())
          }}
          className="px-3 py-2 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted"
        >
          Este mes
        </button>
        <button
          onClick={() => {
            const primeroDeEsteMes = inicioDeMes()
            const finDelAnterior = addDays(primeroDeEsteMes, -1)
            setDesde(finDelAnterior.slice(0, 8) + '01')
            setHasta(finDelAnterior)
          }}
          className="px-3 py-2 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted"
        >
          Mes pasado
        </button>
        {/* Arranca donde terminó el último cierre. Es lo que evita el
            error que la 0055 vino a frenar: dos períodos que se pisan. */}
        {ultimoCierre && (
          <button
            onClick={() => {
              setDesde(addDays(ultimoCierre, 1))
              setHasta(hoyISO())
            }}
            className="px-3 py-2 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted"
            title={`La última liquidación llegó hasta el ${fecha(ultimoCierre)}`}
          >
            Desde el último cierre
          </button>
        )}
      </div>

      {ultimoCierre && (
        <p className="text-[11px] text-muted-foreground -mt-3">
          La última liquidación cerrada llega hasta el{' '}
          <span className="font-semibold">{fecha(ultimoCierre)}</span>. Un período nuevo no puede
          pisarla: la base lo rechaza.
        </p>
      )}

      <SeccionesPlegables memoria="personal">
        {veSueldos && (
          <SeccionPlegable id="liquidacion" titulo="Liquidación del período" icono={Wallet} abiertaPorDefecto>
            <div className="px-1 py-2">
              <Liquidacion
                desde={desde}
                hasta={hasta}
                cerradas={cerradas}
                ultimos={ultimos}
                onCerrar={recargar}
              />
              {veSueldos && (
                <div className="px-4 pt-3 flex flex-wrap items-center gap-2">
                  <button
                    disabled={cerrandoTodas}
                    onClick={cerrarElMes}
                    className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 flex items-center gap-2"
                  >
                    {cerrandoTodas && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Cerrar el período de todos
                  </button>
                  {avisoCierre && <p className="text-[11px] text-muted-foreground">{avisoCierre}</p>}
                </div>
              )}
            </div>
          </SeccionPlegable>
        )}

        {veSueldos && (
          <SeccionPlegable
            id="cerradas"
            titulo="Liquidaciones cerradas"
            icono={Lock}
            resumen={
              cerradas.filter((c) => c.estado === 'cerrada').length > 0
                ? `${cerradas.filter((c) => c.estado === 'cerrada').length} sin pagar`
                : undefined
            }
          >
            <div className="px-5 py-3">
              <Cerradas filas={cerradas} onCambio={recargar} />
            </div>
          </SeccionPlegable>
        )}

        <SeccionPlegable id="fichas" titulo="Quién trabaja y qué horarios tiene" icono={IdCard}>
          <div className="px-5 py-3">
            <Fichas condiciones={condiciones} />
          </div>
        </SeccionPlegable>

        <SeccionPlegable id="horas" titulo="Horas trabajadas" icono={Clock}>
          <div className="px-5 py-3">
            <Horas desde={desde} hasta={hasta} />
          </div>
        </SeccionPlegable>

        {veSueldos && (
          <SeccionPlegable id="ajustes" titulo="Ajustes manuales" icono={Wallet}>
            <div className="px-5 py-3">
              <Ajustes desde={desde} hasta={hasta} />
            </div>
          </SeccionPlegable>
        )}

        {veSueldos && (
          <SeccionPlegable id="condiciones" titulo="Condiciones de pago" icono={Users}>
            <div className="px-5 py-3">
              <Condiciones />
            </div>
          </SeccionPlegable>
        )}
      </SeccionesPlegables>

      {!veSueldos && (
        // "Sin acceso" y no un cero que miente: es el criterio que la
        // 0013 dejó para todo lo que una política puede vedar.
        <p className="text-xs text-muted-foreground bg-muted rounded-xl px-4 py-3">
          Tu rol no ve las remuneraciones, así que esta pantalla muestra solo las horas.
          {canWrite && ' El permiso se da desde Configuración → Permisos.'}
        </p>
      )}
    </div>
  )
}
