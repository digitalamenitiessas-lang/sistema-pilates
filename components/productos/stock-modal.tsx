'use client'

/**
 * Mover el stock a mano, con su historia. Tres hechos distintos y con
 * nombre propio:
 *
 *   · Cargar mercadería: lo que trajo el proveedor.
 *   · Devolver al proveedor: en consignación, lo que no se vende vuelve.
 *     No es un "ajuste": un ajuste se confunde con una rotura y no dice a
 *     quién volvió.
 *   · Ajustar: rotura, faltante, un conteo que no da. Con motivo.
 *
 * Las ventas y las anulaciones mueven el stock solas.
 */

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { moverStock } from '@/lib/inventario-api'
import type { Producto } from '@/lib/types'
import {
  BotonPrincipal,
  BotonSecundario,
  Chips,
  Hoja,
  inputClass,
  labelClass,
} from './comun'

export type ModoStock = 'ingreso' | 'devolucion' | 'ajuste'

const TITULO: Record<ModoStock, string> = {
  ingreso: 'Cargar mercadería',
  devolucion: 'Devolver al proveedor',
  ajuste: 'Ajustar el stock',
}

const MOTIVOS_AJUSTE = ['Rotura', 'Faltante', 'Conteo', 'Muestra para el local']

export function StockModal({
  producto,
  modo,
  proveedorNombre,
  onClose,
  onGuardado,
}: {
  producto: Producto
  modo: ModoStock
  proveedorNombre: string | null
  onClose: () => void
  onGuardado: () => void
}) {
  const [cantidad, setCantidad] = useState('')
  const [signo, setSigno] = useState<'resta' | 'suma'>('resta')
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const n = Number(cantidad)
  const valida = Number.isInteger(n) && n > 0
  const delta = !valida ? 0 : modo === 'ingreso' ? n : modo === 'devolucion' ? -n : signo === 'resta' ? -n : n
  const quedan = producto.stock + delta

  const guardar = async () => {
    setGuardando(true)
    setError(null)
    try {
      // La base recibe ingreso y devolución en positivo; el ajuste, con signo.
      await moverStock(producto.id, modo, modo === 'ajuste' ? delta : n, motivo)
      onGuardado()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo mover el stock')
      setGuardando(false)
    }
  }

  const falta = !valida || quedan < 0 || (modo === 'ajuste' && !motivo.trim())

  return (
    <Hoja
      titulo={`${TITULO[modo]} · ${producto.nombre}`}
      subtitulo={
        modo === 'ajuste'
          ? `Hay ${producto.stock}`
          : `Hay ${producto.stock}${proveedorNombre ? ` · proveedor ${proveedorNombre}` : ''}`
      }
      ocupado={guardando}
      onClose={onClose}
      error={error}
      pie={
        <>
          <BotonSecundario onClick={onClose} disabled={guardando}>
            Cancelar
          </BotonSecundario>
          <BotonPrincipal onClick={guardar} disabled={guardando || falta}>
            {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
            Guardar
          </BotonPrincipal>
        </>
      }
    >
      {modo === 'ajuste' && (
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['resta', 'Restar'],
              ['suma', 'Sumar'],
            ] as const
          ).map(([k, t]) => (
            <button
              key={k}
              type="button"
              onClick={() => setSigno(k)}
              className={cn(
                'py-2 rounded-xl border text-sm font-semibold transition-colors',
                signo === k
                  ? 'border-primary bg-primary/5 text-primary-fuerte'
                  : 'border-border text-muted-foreground hover:border-primary/40'
              )}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <div>
        <label className={labelClass}>
          {modo === 'ingreso' ? 'Cantidad que llegó *' : modo === 'devolucion' ? 'Cantidad que se lleva *' : 'Cantidad *'}
        </label>
        <input
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value.replace(/\D/g, ''))}
          inputMode="numeric"
          placeholder="0"
          className={inputClass}
        />
        {valida && (
          <p className={cn('text-xs mt-1.5', quedan < 0 ? 'text-destructive-fuerte' : 'text-muted-foreground')}>
            Hay {producto.stock} → {quedan < 0 ? `no alcanza: quedarían ${quedan}` : `van a quedar ${quedan}`}
          </p>
        )}
      </div>

      <div>
        <label className={labelClass}>{modo === 'ajuste' ? 'Motivo *' : 'Nota (opcional)'}</label>
        {modo === 'ajuste' && (
          <div className="mb-2">
            <Chips opciones={MOTIVOS_AJUSTE} elegido={motivo} onElegir={setMotivo} />
          </div>
        )}
        <input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder={
            modo === 'ingreso'
              ? 'Ej.: remito 12'
              : modo === 'devolucion'
                ? 'Ej.: lo que no se vendió en septiembre'
                : 'Qué pasó'
          }
          className={inputClass}
        />
      </div>

      {modo === 'devolucion' && (
        <p className="text-[11px] text-muted-foreground">
          Queda en la historia como devolución al proveedor, no como faltante.
        </p>
      )}

    </Hoja>
  )
}
