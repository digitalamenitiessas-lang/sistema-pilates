'use client'

/**
 * Deshacer un pago a un proveedor.
 *
 * Existe para no depender de "Anular" en Gastos, que pide el motivo con
 * `window.prompt`: el navegador de Instagram y el panel de vista previa lo
 * descartan solos y el botón parece muerto. Anula el gasto —no la
 * rendición—: que una venta esté rendida se calcula a partir del gasto
 * vivo, así que las ventas vuelven solas a pendientes.
 */

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { anularRendicion } from '@/lib/inventario-api'
import type { Rendicion, RendicionAnulada } from '@/lib/types'
import {
  BotonPrincipal,
  BotonSecundario,
  Hoja,
  inputClass,
  labelClass,
  momento,
  plata,
} from './comun'

export function AnularRendicionModal({
  rendicion,
  cuenta,
  onClose,
  onAnulada,
  onFallo,
}: {
  rendicion: Rendicion
  cuenta: string | null
  onClose: () => void
  onAnulada: () => void
  /** La base dijo que no: se vuelve a leer la lista de atrás */
  onFallo: () => void
}) {
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecha, setHecha] = useState<RendicionAnulada | null>(null)

  const nVentas = `${rendicion.ventas} ${rendicion.ventas === 1 ? 'venta' : 'ventas'}`
  const deCuenta = cuenta ?? 'la cuenta de donde salió'

  const anular = async () => {
    setGuardando(true)
    setError(null)
    try {
      setHecha(await anularRendicion(rendicion.id, motivo))
      onAnulada()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo anular el pago')
      onFallo()
    } finally {
      setGuardando(false)
    }
  }

  if (hecha) {
    return (
      <Hoja
        titulo="Pago anulado"
        onClose={onClose}
        pie={<BotonPrincipal onClick={onClose}>Listo</BotonPrincipal>}
      >
        <p className="text-sm text-foreground">
          Listo: {hecha.ventas === 1 ? 'la venta volvió' : `${hecha.ventas} ventas volvieron`} a quedar
          pendientes, y los {plata(hecha.total)} vuelven al saldo de {hecha.cuenta}.
        </p>
        {hecha.turnoCerrado && (
          <p className="text-xs text-aviso-fuerte bg-aviso-suave rounded-xl px-3 py-2.5">
            El pago había salido en un turno que ya se cerró: el arqueo firmado no cambia y Caja lo va a
            marcar como desactualizado.
          </p>
        )}
      </Hoja>
    )
  }

  return (
    <Hoja
      titulo={`Anular el pago a ${rendicion.proveedorNombre}`}
      subtitulo={`${momento(rendicion.createdAt)} · ${nVentas} · ${plata(rendicion.total)} desde ${deCuenta}`}
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
            Anular el pago
          </BotonPrincipal>
        </>
      }
    >
      <div>
        <label className={labelClass} htmlFor="motivo-anular-rendicion">
          Motivo *
        </label>
        <input
          id="motivo-anular-rendicion"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Queda escrito en el gasto"
          className={inputClass}
        />
      </div>
      <p className="text-xs text-aviso-fuerte bg-aviso-suave rounded-xl px-3 py-2.5">
        El gasto queda anulado y los {plata(rendicion.total)} vuelven al saldo de {deCuenta}.{' '}
        {rendicion.ventas === 1
          ? 'La venta vuelve'
          : `Las ${rendicion.ventas} ventas vuelven`}{' '}
        a quedar pendientes de rendir. Si el pago se hizo en efectivo en un turno que ya se cerró, el
        arqueo firmado no cambia: Caja lo va a marcar como desactualizado.
      </p>
    </Hoja>
  )
}
