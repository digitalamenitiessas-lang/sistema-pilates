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
import { Loader2, Plus, Trash2, Users, Clock, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useData, useStudio } from '@/lib/data-context'
import { SeccionPlegable, SeccionesPlegables } from '@/components/ui/seccion-plegable'
import { hoyISO, addDays } from '@/lib/api'
import {
  fetchCondiciones,
  fijarCondicion,
  fetchHoras,
  cargarHoras,
  borrarHoras,
  fetchLiquidacion,
} from '@/lib/personal-api'
import type { CondicionPago, HorasTrabajadas, FilaLiquidacion } from '@/lib/types'

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

function Liquidacion({ desde, hasta }: { desde: string; hasta: string }) {
  const [filas, setFilas] = useState<FilaLiquidacion[] | null>(null)
  const [error, setError] = useState<string | null>(null)

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
              <th className="text-right px-4 py-3 font-semibold">Total</th>
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
                <td className="px-4 py-3 text-right tabular-nums font-bold text-foreground">{plata(f.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-baseline justify-between px-4">
        <p className="text-xs text-muted-foreground">{filas.length} en el período</p>
        <p className="text-sm font-bold text-foreground tabular-nums">{plata(total)}</p>
      </div>

      {/* Liquidar no es pagar, y el mostrador tiene que saberlo antes de
          cerrar el mes: el pago entra al libro como cualquier gasto. */}
      <p className="text-[11px] text-muted-foreground px-4">
        Este cálculo sale de las clases que figuran dictadas en la agenda y de las condiciones que
        regían cada día. <span className="font-semibold">Liquidar no es pagar</span>: cuando le
        pagues, cargalo en Gastos para que entre al libro.
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

export function PersonalPage() {
  const { can, canWrite } = useData()
  const [desde, setDesde] = useState(inicioDeMes())
  const [hasta, setHasta] = useState(hoyISO())

  const veSueldos = can('personal.remuneracion')

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
      </div>

      <SeccionesPlegables memoria="personal">
        {veSueldos && (
          <SeccionPlegable id="liquidacion" titulo="Liquidación del período" icono={Wallet} abiertaPorDefecto>
            <div className="px-1 py-2">
              <Liquidacion desde={desde} hasta={hasta} />
            </div>
          </SeccionPlegable>
        )}

        <SeccionPlegable id="horas" titulo="Horas trabajadas" icono={Clock}>
          <div className="px-5 py-3">
            <Horas desde={desde} hasta={hasta} />
          </div>
        </SeccionPlegable>

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
