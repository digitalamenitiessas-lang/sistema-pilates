'use client'

/**
 * Anular una venta: devuelve las unidades al stock y saca la plata de la
 * caja. Lo hace admin, con motivo, y no se puede si la venta ya se le
 * rindió al proveedor (primero se anula ese pago).
 *
 * Con un turno ya cerrado pasa lo mismo que al anular un cobro (0083): el
 * arqueo firmado no cambia y Caja lo marca como desactualizado por ese
 * monto. Se dice antes de apretar, y otra vez después si fue el caso.
 */

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { anularVenta } from '@/lib/inventario-api'
import type { VentaAnulada, VentaProducto } from '@/lib/types'
import {
  BotonPrincipal,
  BotonSecundario,
  Chips,
  Hoja,
  inputClass,
  labelClass,
  momento,
  plata,
} from './comun'

const MOTIVOS = ['Se cobró dos veces', 'Era otro producto', 'Lo devolvió', 'Error en el medio de pago']

export function AnularVentaModal({
  venta,
  cuenta,
  onClose,
  onAnulada,
  onFallo,
}: {
  venta: VentaProducto
  /** El nombre de la cuenta donde había entrado la plata, si se conoce */
  cuenta: string | null
  onClose: () => void
  onAnulada: () => void
  /**
   * La base dijo que no (por ejemplo, la venta ya se rindió desde otro
   * lado): se vuelve a leer la lista, así el botón Anular deja de
   * ofrecerse donde ya no corresponde.
   */
  onFallo: () => void
}) {
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecha, setHecha] = useState<VentaAnulada | null>(null)

  const anular = async () => {
    setGuardando(true)
    setError(null)
    try {
      setHecha(await anularVenta(venta.id, motivo))
      onAnulada()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo anular la venta')
      onFallo()
    } finally {
      setGuardando(false)
    }
  }

  if (hecha) {
    return (
      <Hoja
        titulo={`V-${hecha.numero} anulada`}
        onClose={onClose}
        pie={<BotonPrincipal onClick={onClose}>Listo</BotonPrincipal>}
      >
        <p className="text-sm text-foreground">
          Volvieron {hecha.devuelto} al stock (quedan {hecha.stockRestante}) y los {plata(hecha.anulado)}{' '}
          salieron de {hecha.cuenta}.
        </p>
        {hecha.turnoCerrado && (
          <p className="text-xs text-aviso-fuerte bg-aviso-suave rounded-xl px-3 py-2.5">
            La venta era de un turno que ya se cerró. El arqueo firmado no cambia: Caja lo va a marcar
            como desactualizado por {plata(hecha.anulado)}, y el saldo con que arranca el turno abierto
            baja en ese monto.
          </p>
        )}
      </Hoja>
    )
  }

  return (
    <Hoja
      titulo={`Anular la venta V-${venta.numero}`}
      subtitulo={`${momento(venta.paidAt)} · ${venta.productoNombre} · ${venta.aroma}${
        venta.cantidad > 1 ? ` ×${venta.cantidad}` : ''
      } · ${plata(venta.monto)} en ${venta.medio}`}
      ocupado={guardando}
      onClose={onClose}
      error={error}
      pie={
        <>
          <BotonSecundario onClick={onClose} disabled={guardando}>
            Volver
          </BotonSecundario>
          <BotonPrincipal peligro onClick={anular} disabled={guardando || !motivo.trim()}>
            {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
            Anular la venta
          </BotonPrincipal>
        </>
      }
    >
      <div>
        <label className={labelClass} htmlFor="motivo-anular-venta">
          Motivo *
        </label>
        <div className="mb-2">
          <Chips opciones={MOTIVOS} elegido={motivo} onElegir={setMotivo} />
        </div>
        <input
          id="motivo-anular-venta"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Queda escrito en la venta"
          className={inputClass}
        />
      </div>
      <p className="text-xs text-aviso-fuerte bg-aviso-suave rounded-xl px-3 py-2.5">
        {venta.cantidad === 1 ? 'La unidad vuelve' : `Las ${venta.cantidad} unidades vuelven`} al stock
        y los {plata(venta.monto)} salen de {cuenta ?? 'la cuenta donde entraron'}. Si la venta era de
        un turno que ya se cerró, el arqueo firmado no cambia: Caja lo va a marcar como desactualizado.
      </p>
    </Hoja>
  )
}
