'use client'

/**
 * Las compras de productos de una ficha, en su pestaña de Pagos.
 *
 * Van aparte de los pagos y no mezcladas: no son cuotas ni deuda, y la
 * mayor parte de esa plata es del proveedor. Si la 0090 no corrió, el
 * bloque no aparece; si hay otro error, se dice.
 */

import { useEffect, useState } from 'react'
import { ShoppingBag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FALTA, fetchVentasDeCliente } from '@/lib/inventario-api'
import type { VentaProducto } from '@/lib/types'
import { momento, plata } from './comun'

/**
 * Si una ficha ya descubrió que la 0090 no corrió, las siguientes no lo
 * vuelven a preguntar (cada pregunta era un 404 en la red). Al recargar la
 * página se pregunta de nuevo: así, corrida la migración, aparece solo.
 */
let faltaLaMigracion = false

export function ComprasDeCliente({ studentId }: { studentId: string }) {
  const [ventas, setVentas] = useState<VentaProducto[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [oculto, setOculto] = useState(faltaLaMigracion)

  useEffect(() => {
    if (faltaLaMigracion) return
    let vivo = true
    setVentas(null)
    setError(null)
    fetchVentasDeCliente(studentId)
      .then((v) => vivo && setVentas(v))
      .catch((e) => {
        const msg = e instanceof Error ? e.message : 'No se pudieron leer las compras'
        if (msg === FALTA) faltaLaMigracion = true
        if (!vivo) return
        if (msg === FALTA) setOculto(true)
        else setError(msg)
      })
    return () => {
      vivo = false
    }
  }, [studentId])

  // Nada hasta la primera respuesta: si la 0090 no corrió, el bloque no
  // tiene que asomarse ("Cargando…" y después desaparecer). Es lo último
  // de la pestaña, así que aparecer un instante después no corre nada.
  if (oculto || (ventas === null && !error)) return null

  return (
    <div className="pt-4 space-y-2">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
        <ShoppingBag className="w-3.5 h-3.5" />
        Compras de productos
      </h3>
      {error || ventas === null ? (
        <p className="text-xs text-destructive-fuerte bg-destructive/10 rounded-xl px-3 py-2">{error}</p>
      ) : ventas.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin compras de productos.</p>
      ) : (
        ventas.map((v) => {
          const anulada = v.status === 'anulado'
          return (
            <div key={v.id} className="bg-card rounded-xl border border-border p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {v.productoNombre} · {v.aroma}
                  {v.cantidad > 1 && ` ×${v.cantidad}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {momento(v.paidAt)} · {v.medio} · V-{v.numero}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p
                  className={cn(
                    'text-sm font-bold',
                    anulada ? 'text-muted-foreground line-through' : 'text-foreground'
                  )}
                >
                  {plata(v.monto)}
                </p>
                {anulada && <span className="text-[10px] font-semibold text-muted-foreground">Anulada</span>}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
