'use client'

/**
 * Pagarle al proveedor su parte de las ventas elegidas.
 *
 * El patrón de "Registrar el pago" de la liquidación (0054): la base carga
 * el gasto en "Rendiciones a proveedores" y marca las ventas en una sola
 * operación, con el total que calcula ella. Así la plata entró entera
 * como venta y sale el 70% como gasto: el resultado del mes queda con la
 * parte del estudio.
 *
 * No pide fecha: la plata sale cuando se registra. Una fecha para atrás
 * podía caer en un turno ya cerrado y descuadrar un arqueo firmado. La
 * fecha del comprobante del gasto la pone la base: la de la última venta
 * que cubre, así con el resultado "devengado" el costo queda en el mes de
 * las ventas aunque se rinda al mes siguiente. Si las ventas elegidas son
 * de dos meses, el costo entero cae en el último: se avisa antes.
 */

import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { useStudio } from '@/lib/data-context'
import { rendirProveedor } from '@/lib/inventario-api'
import type { Account, Proveedor, RendicionRegistrada, VentaProducto } from '@/lib/types'
import {
  BotonPrincipal,
  BotonSecundario,
  Hoja,
  fechaLarga,
  inputClass,
  labelClass,
  plata,
} from './comun'

const nombreDelMes = (ym: string) =>
  new Date(`${ym}-01T00:00`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })

export function RendirModal({
  proveedor,
  ventas,
  cuentas,
  onClose,
  onRendido,
  onFallo,
}: {
  proveedor: { id: string; nombre: string } & Partial<Proveedor>
  ventas: VentaProducto[]
  cuentas: Account[]
  onClose: () => void
  onRendido: () => void
  /**
   * La base dijo que no. Si fue porque la lista cambió (una venta se anuló
   * o ya se rindió desde otro lado), volver a abrir la hoja mandaba los
   * mismos ids viejos y el mismo error, en un bucle: se vuelve a leer la
   * lista de atrás para que al cerrar ya esté al día.
   */
  onFallo: () => void
}) {
  const { paymentMethods } = useStudio()
  const [method, setMethod] = useState('')
  const [accountId, setAccountId] = useState('')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecha, setHecha] = useState<RendicionRegistrada | null>(null)

  const total = ventas.reduce((a, v) => a + v.parteProveedor, 0)
  const cobrado = ventas.reduce((a, v) => a + v.monto, 0)
  const cuentaElegida = cuentas.find((c) => c.id === accountId)
  const ultimaVenta = ventas.reduce((a, v) => (v.paidDate > a ? v.paidDate : a), '')
  const meses = [...new Set(ventas.map((v) => v.paidDate.slice(0, 7)))].sort()

  // Al elegir el medio se sugiere SU cuenta, como en Gastos: la que el
  // estudio configuró para ese medio. Si ya se eligió una, no se pisa.
  const elegirMedio = (code: string) => {
    setMethod(code)
    if (!accountId) {
      const m = paymentMethods.find((p) => p.code === code)
      if (m?.defaultAccountId && cuentas.some((c) => c.id === m.defaultAccountId)) {
        setAccountId(m.defaultAccountId)
      }
    }
  }

  const registrar = async () => {
    setGuardando(true)
    setError(null)
    try {
      setHecha(
        await rendirProveedor({
          proveedorId: proveedor.id,
          ventaIds: ventas.map((v) => v.id),
          method,
          accountId: accountId || null,
          notas,
        })
      )
      onRendido()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el pago')
      onFallo()
    } finally {
      setGuardando(false)
    }
  }

  if (hecha) {
    return (
      <Hoja
        titulo="Pago registrado"
        onClose={onClose}
        pie={<BotonPrincipal onClick={onClose}>Listo</BotonPrincipal>}
      >
        <div className="rounded-2xl bg-exito-suave px-4 py-4 space-y-1.5">
          <p className="text-sm font-bold text-exito-fuerte flex items-center gap-2">
            <Check className="w-4 h-4" />
            {plata(hecha.total)} para {proveedor.nombre}
          </p>
          <p className="text-xs text-exito-fuerte">
            Se cargó el gasto en &ldquo;Rendiciones a proveedores&rdquo;
            {ultimaVenta && ` (en Gastos figura con fecha ${fechaLarga(ultimaVenta)})`} y{' '}
            {hecha.ventas === 1 ? 'la venta quedó rendida' : `las ${hecha.ventas} ventas quedaron rendidas`}.
            Lo cobrado fue {plata(hecha.cobrado)}; al estudio le quedan {plata(hecha.cobrado - hecha.total)}.
          </p>
        </div>
        <p className="text-[11px] text-muted-foreground">
          No hace falta cargarlo a mano en Gastos: si lo hacés, la plata sale dos veces.
        </p>
      </Hoja>
    )
  }

  return (
    <Hoja
      titulo={`Pagarle a ${proveedor.nombre}`}
      subtitulo={`${ventas.length} ${ventas.length === 1 ? 'venta' : 'ventas'} · cobrado ${plata(cobrado)}`}
      ocupado={guardando}
      onClose={onClose}
      error={error}
      nota={
        !guardando && (!method || !accountId)
          ? 'Para registrar falta elegir con qué se le paga y de qué cuenta sale.'
          : null
      }
      pie={
        <>
          <BotonSecundario onClick={onClose} disabled={guardando}>
            Cancelar
          </BotonSecundario>
          <BotonPrincipal onClick={registrar} disabled={guardando || !method || !accountId}>
            {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
            Registrar el pago
          </BotonPrincipal>
        </>
      }
    >
      <div className="rounded-xl bg-muted/50 px-3.5 py-3">
        <p className="text-xs text-muted-foreground">Le corresponde</p>
        <p className="text-2xl font-bold text-foreground tabular-nums">{plata(total)}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Con qué se le paga *</label>
          <select value={method} onChange={(e) => elegirMedio(e.target.value)} className={inputClass}>
            <option value="">Elegir…</option>
            {paymentMethods
              .filter((m) => m.active)
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((m) => (
                <option key={m.code} value={m.code}>
                  {m.name}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Sale de *</label>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputClass}>
            <option value="">Elegir cuenta…</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass}>Notas (opcional)</label>
        <input
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Ej.: se lo llevó Lucía"
          className={inputClass}
        />
      </div>

      {meses.length > 1 && (
        <p className="text-xs text-aviso-fuerte bg-aviso-suave rounded-xl px-3 py-2.5">
          Son ventas de {meses.map(nombreDelMes).join(' y ')}. Con el resultado por lo devengado, el pago
          entero cuenta en {nombreDelMes(meses[meses.length - 1])}. Para que cada mes quede con su parte,
          rendí un mes por vez: destildá las ventas del otro mes.
        </p>
      )}

      <p className="text-[11px] text-muted-foreground">
        La plata sale hoy y baja del saldo de {cuentaElegida?.name ?? 'la cuenta que elijas'}. En Gastos
        queda en &ldquo;Rendiciones a proveedores&rdquo; con la fecha de la última venta
        {ultimaVenta && ` (${fechaLarga(ultimaVenta)})`}, así el costo cae en el mes de las ventas. Si
        después se anula, estas ventas vuelven a quedar pendientes.
      </p>
    </Hoja>
  )
}
