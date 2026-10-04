'use client'

/**
 * Vender un producto en el mostrador.
 *
 * Lo que se elige acá es lo que la base no puede saber: cuántos, qué
 * aroma, con qué se pagó y, si hay, quién compró. El precio sale de la
 * lista del producto para ese medio y lo pone la base, igual que el
 * reparto con el proveedor y la cuenta donde entra la plata: el número
 * que se ve acá es una vista previa del mismo cálculo. Lo que sí viaja es
 * el precio que se ve, como control: si el admin cambió la lista desde
 * otro lado, la base corta en vez de registrar un monto distinto del que
 * se le cobró a quien compra.
 *
 * El aroma es obligatorio en la pantalla y en la base. Es texto libre (se
 * puede vender un aroma que no esté en la lista), pero arriba están los
 * que trae el proveedor y los que ya se vendieron, y un toque los copia
 * tal cual: así "Lavanda", "lavanda" y "lavana" no salen como tres cosas
 * distintas en lo que se le rinde al proveedor.
 */

import { useEffect, useMemo, useState } from 'react'
import { Check, Loader2, Minus, Plus, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useData, useStudio } from '@/lib/data-context'
import { fetchAromas, nuevaLlave, venderProducto } from '@/lib/inventario-api'
import type { Producto, Proveedor, VentaRegistrada } from '@/lib/types'
import { iconoDeMedio, mediosParaCobrar } from '@/components/pagos/pagos-page'
import {
  BotonPrincipal,
  BotonSecundario,
  Chips,
  Hoja,
  inputClass,
  labelClass,
  plata,
} from './comun'

type Comprador = 'nadie' | 'ficha' | 'otra'

/**
 * La llave pendiente de cada producto, FUERA de la hoja. Si la respuesta
 * de una venta se pierde (mala señal: la venta quedó grabada pero el
 * navegador recibe un error) y quien vende cierra la hoja y la vuelve a
 * abrir, una llave nueva grabaría una segunda venta: otra vez el stock,
 * otra vez la plata en la caja. Con la llave guardada acá, el segundo
 * "Cobrar" manda la misma y la base devuelve la venta ya hecha. Se suelta
 * recién cuando una venta se confirma. Vive mientras la pestaña esté
 * abierta (sobrevive a ir a otra pantalla y volver).
 */
const llavesPendientes = new Map<string, string>()

function llaveDe(productoId: string): string {
  let k = llavesPendientes.get(productoId)
  if (!k) {
    k = nuevaLlave()
    llavesPendientes.set(productoId, k)
  }
  return k
}

export function VenderModal({
  producto,
  proveedor,
  onClose,
  onVendido,
  onFallo,
}: {
  producto: Producto
  /** Para la vista previa del reparto; null si el rol no ve proveedores */
  proveedor: Proveedor | null
  onClose: () => void
  onVendido: () => void
  /**
   * La venta no salió. Se vuelve a leer todo: si fue porque cambió el
   * precio o se terminó el stock, la hoja muestra lo nuevo; si fue porque
   * no llegó la respuesta, "Hoy" muestra la venta si se había grabado.
   */
  onFallo: () => void
}) {
  const { can } = useData()
  const { paymentMethods, students } = useStudio()

  // Sólo los medios del mostrador que tienen precio para ESTE producto.
  const medios = useMemo(
    () => mediosParaCobrar(paymentMethods).filter((m) => producto.precios[m.code] !== undefined),
    [paymentMethods, producto.precios]
  )

  const [cantidad, setCantidad] = useState(1)
  const [aroma, setAroma] = useState('')
  const [sugeridos, setSugeridos] = useState<string[]>(producto.aromas)
  const [elegido, setElegido] = useState<string | null>(medios.length === 1 ? medios[0].code : null)
  const [comprador, setComprador] = useState<Comprador>('nadie')
  const [busqueda, setBusqueda] = useState('')
  const [studentId, setStudentId] = useState<string | null>(null)
  const [nombreLibre, setNombreLibre] = useState('')
  const [notas, setNotas] = useState('')
  // La llave de ESTE intento: un reintento la repite (también si se cerró
  // la hoja y se volvió a abrir) y la base devuelve la venta ya hecha;
  // "Otra venta" arma una nueva.
  const [idem, setIdem] = useState(() => llaveDe(producto.id))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecha, setHecha] = useState<VentaRegistrada | null>(null)

  useEffect(() => {
    let vivo = true
    fetchAromas(producto)
      .then((a) => vivo && setSugeridos(a))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [producto])

  // Si al volver a leer la lista el medio elegido se quedó sin precio, es
  // como no haber elegido: así el botón no queda habilitado y mudo.
  const method = elegido && producto.precios[elegido] !== undefined ? elegido : null
  const precio = method ? producto.precios[method] : undefined
  const total = precio !== undefined ? precio * cantidad : null

  // Si al volver a leer quedó menos stock que la cantidad elegida, se baja.
  useEffect(() => {
    setCantidad((c) => Math.max(1, Math.min(c, producto.stock)))
  }, [producto.stock])

  const parteEstudio =
    total !== null && proveedor ? Math.round(total * proveedor.pctEstudio) / 100 : null

  const encontradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (q.length < 2) return []
    return students
      .filter((s) => s.name.toLowerCase().includes(q) || (s.dni ?? '').includes(q))
      .slice(0, 6)
  }, [busqueda, students])
  const elegida = studentId ? students.find((s) => s.id === studentId) : null

  const faltan: string[] = []
  if (!aroma.trim()) faltan.push('el aroma')
  if (!method) faltan.push('el medio de pago')
  if (comprador === 'ficha' && !studentId) faltan.push('la ficha del cliente')

  const cobrar = async () => {
    if (faltan.length > 0 || !method || precio === undefined) return
    setGuardando(true)
    setError(null)
    try {
      const r = await venderProducto({
        productoId: producto.id,
        cantidad,
        aroma,
        method,
        studentId: comprador === 'ficha' ? studentId : null,
        comprador: comprador === 'otra' ? nombreLibre : '',
        notas,
        idem,
        // El que se ve en el botón: si la lista cambió, la base corta.
        precioEsperado: precio,
      })
      // Confirmada (nueva o la del intento anterior): la llave ya se usó.
      if (llavesPendientes.get(producto.id) === idem) llavesPendientes.delete(producto.id)
      setHecha(r)
      onVendido()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar la venta')
      onFallo()
    } finally {
      setGuardando(false)
    }
  }

  const otraVenta = () => {
    setHecha(null)
    setIdem(llaveDe(producto.id))
    setCantidad(1)
    setAroma('')
    setComprador('nadie')
    setStudentId(null)
    setNombreLibre('')
    setBusqueda('')
    setNotas('')
    setError(null)
  }

  if (hecha) {
    return (
      <Hoja
        titulo={hecha.repetida ? 'Esta venta ya estaba registrada' : 'Venta registrada'}
        onClose={onClose}
        pie={
          <>
            {hecha.stockRestante > 0 && <BotonSecundario onClick={otraVenta}>Otra venta</BotonSecundario>}
            <BotonPrincipal onClick={onClose}>Listo</BotonPrincipal>
          </>
        }
      >
        <div className="rounded-2xl bg-exito-suave px-4 py-4 space-y-1.5">
          <p className="text-sm font-bold text-exito-fuerte flex items-center gap-2">
            <Check className="w-4 h-4" />
            V-{hecha.numero} · {plata(hecha.cobrado)} en {hecha.medio}
          </p>
          <p className="text-xs text-exito-fuerte">
            {hecha.cantidad} × {producto.nombre} a {plata(hecha.precioUnitario)}. La plata entra en{' '}
            <span className="font-semibold">{hecha.cuenta}</span>.
          </p>
          <p className="text-xs text-exito-fuerte">
            Para el estudio {plata(hecha.parteEstudio)} · para el proveedor {plata(hecha.parteProveedor)}
          </p>
          <p className="text-xs text-exito-fuerte">
            {hecha.stockRestante === 0
              ? `No quedan más ${producto.nombre}.`
              : `Quedan ${hecha.stockRestante}.`}
          </p>
        </div>
        {hecha.repetida && (
          <p className="text-[11px] text-muted-foreground">
            El cobro se había registrado en el intento anterior; no se cobró dos veces.
          </p>
        )}
        {!can('inventario.anular') && (
          <p className="text-[11px] text-muted-foreground">
            Si te equivocaste, avisale a quien administra: la anulación la hace admin.
          </p>
        )}
      </Hoja>
    )
  }

  return (
    <Hoja
      titulo={`Vender ${producto.nombre}`}
      subtitulo={`Hay ${producto.stock} en stock`}
      ocupado={guardando}
      onClose={onClose}
      error={error}
      nota={faltan.length > 0 && !guardando ? `Para cobrar falta ${faltan.join(' y ')}.` : null}
      pie={
        <>
          <BotonSecundario onClick={onClose} disabled={guardando}>
            Cancelar
          </BotonSecundario>
          <BotonPrincipal onClick={cobrar} disabled={guardando || faltan.length > 0}>
            {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
            {total !== null ? `Cobrar ${plata(total)}` : 'Cobrar'}
          </BotonPrincipal>
        </>
      }
    >
      {/* Cantidad */}
      <div>
        <label className={labelClass}>Cantidad</label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setCantidad((c) => Math.max(1, c - 1))}
            disabled={cantidad <= 1}
            className="w-11 h-11 rounded-xl border border-border flex items-center justify-center text-foreground disabled:opacity-30"
            aria-label="Uno menos"
          >
            <Minus className="w-4 h-4" />
          </button>
          <span className="text-xl font-bold tabular-nums w-8 text-center">{cantidad}</span>
          <button
            type="button"
            onClick={() => setCantidad((c) => Math.min(producto.stock, c + 1))}
            disabled={cantidad >= producto.stock}
            className="w-11 h-11 rounded-xl border border-border flex items-center justify-center text-foreground disabled:opacity-30"
            aria-label="Uno más"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Aroma */}
      <div>
        <label className={labelClass} htmlFor="aroma-venta">
          Aroma *
        </label>
        {sugeridos.length > 0 && (
          <div className="mb-2">
            <p className="text-[11px] text-muted-foreground mb-1">Sugeridos</p>
            <Chips opciones={sugeridos} elegido={aroma} onElegir={setAroma} />
          </div>
        )}
        <input
          id="aroma-venta"
          value={aroma}
          onChange={(e) => setAroma(e.target.value)}
          maxLength={60}
          placeholder="Ej.: Lavanda"
          className={inputClass}
        />
      </div>

      {/* Medio */}
      <div>
        <label className={labelClass}>Medio de pago *</label>
        {medios.length === 0 ? (
          <p className="text-xs text-aviso-fuerte bg-aviso-suave rounded-xl px-3 py-2.5">
            {producto.nombre} no tiene precio en ningún medio del mostrador. Lo carga quien administra
            en Productos y precios.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {medios.map((m) => {
              const Icono = iconoDeMedio(m.code)
              return (
                <button
                  key={m.code}
                  type="button"
                  onClick={() => setElegido(m.code)}
                  className={cn(
                    'flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-xl border text-left transition-colors',
                    method === m.code
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/40'
                  )}
                >
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Icono className="w-3.5 h-3.5 text-muted-foreground" />
                    {m.name}
                  </span>
                  <span className="text-sm font-bold tabular-nums text-foreground">
                    {plata(producto.precios[m.code])}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Comprador */}
      <div>
        <label className={labelClass}>Quién compra (opcional)</label>
        <div className="grid grid-cols-3 gap-1.5 mb-2">
          {(
            [
              ['nadie', 'Sin datos'],
              ['ficha', 'Cliente'],
              ['otra', 'Otra persona'],
            ] as const
          ).map(([k, t]) => (
            <button
              key={k}
              type="button"
              onClick={() => setComprador(k)}
              className={cn(
                'py-2 rounded-xl border text-xs font-semibold transition-colors',
                comprador === k
                  ? 'border-primary bg-primary/5 text-primary-fuerte'
                  : 'border-border text-muted-foreground hover:border-primary/40'
              )}
            >
              {t}
            </button>
          ))}
        </div>
        {comprador === 'ficha' &&
          (elegida ? (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2">
              <span className="text-sm text-foreground truncate">{elegida.name}</span>
              <button
                type="button"
                onClick={() => setStudentId(null)}
                className="text-xs font-semibold text-primary-fuerte shrink-0"
              >
                Cambiar
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por nombre o DNI"
                  className={cn(inputClass, 'pl-9')}
                />
              </div>
              {encontradas.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStudentId(s.id)}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-muted text-sm text-foreground truncate"
                >
                  {s.name}
                </button>
              ))}
              {busqueda.trim().length >= 2 && encontradas.length === 0 && (
                <p className="text-[11px] text-muted-foreground px-1">
                  No aparece. Si no tiene ficha, elegí &ldquo;Otra persona&rdquo;.
                </p>
              )}
            </div>
          ))}
        {comprador === 'otra' && (
          <input
            value={nombreLibre}
            onChange={(e) => setNombreLibre(e.target.value)}
            maxLength={80}
            placeholder="Nombre (opcional)"
            className={inputClass}
          />
        )}
        {comprador === 'ficha' && (
          <p className="text-[11px] text-muted-foreground mt-1">Queda en el historial de su ficha.</p>
        )}
      </div>

      <div>
        <label className={labelClass}>Notas (opcional)</label>
        <input value={notas} onChange={(e) => setNotas(e.target.value)} className={inputClass} />
      </div>

      {total !== null && (
        <div className="rounded-xl bg-muted/50 px-3.5 py-3 text-xs text-muted-foreground space-y-0.5">
          <p>
            {cantidad} × {plata(precio!)} ={' '}
            <span className="font-bold text-foreground">{plata(total)}</span>
          </p>
          {parteEstudio !== null && proveedor && (
            <p>
              Para el estudio {plata(parteEstudio)} ({proveedor.pctEstudio}%) · para {proveedor.nombre}{' '}
              {plata(total - parteEstudio)}
            </p>
          )}
          <p>El precio sale de la lista; no se aplica el recargo ni el descuento del medio.</p>
        </div>
      )}

    </Hoja>
  )
}
