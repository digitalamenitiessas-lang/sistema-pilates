'use client'

/**
 * Productos en consignación (0090): vender en el mostrador, llevar el
 * stock y rendirle al proveedor su parte.
 *
 * Pensada primero para el celular o la tablet del mostrador: arriba, fijo,
 * lo que se vende con su stock y sus precios, y el botón de vender. Lo
 * demás va en secciones plegables, y cada una se muestra según su permiso
 * —nunca por `canWrite`—: recepción vende y ve, pero cargar productos,
 * precios y stock, anular ventas y pagarle al proveedor es de admin, y lo
 * decide la base de todos modos.
 *
 * La plata de una venta entra entera a la caja (la quinta rama del libro,
 * `origen 'venta'`); la parte del proveedor sale después como gasto,
 * cuando se le paga desde "Rendir a proveedores".
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Ban,
  Boxes,
  HandCoins,
  History,
  Loader2,
  PackageMinus,
  PackagePlus,
  Pencil,
  Plus,
  Receipt,
  ShoppingBag,
  SlidersHorizontal,
  Truck,
  Undo2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useData, useStudio } from '@/lib/data-context'
import { SeccionPlegable, SeccionesPlegables } from '@/components/ui/seccion-plegable'
import { addDays, hoyISO } from '@/lib/api'
import { fetchAccounts } from '@/lib/caja-api'
import {
  FALTA,
  fetchMovimientos,
  fetchProductos,
  fetchProveedores,
  fetchRendiciones,
  fetchVentas,
  fetchVentasARendir,
} from '@/lib/inventario-api'
import type {
  Account,
  EstadoVenta,
  MovimientoStock,
  Producto,
  Proveedor,
  Rendicion,
  VentaProducto,
} from '@/lib/types'
import { mediosParaCobrar } from '@/components/pagos/pagos-page'
import { fechaCorta, fechaLarga, momento, plata } from './comun'
import { VenderModal } from './vender-modal'
import { AnularVentaModal } from './anular-venta-modal'
import { RendirModal } from './rendir-modal'
import { AnularRendicionModal } from './anular-rendicion-modal'
import { ProductoFormModal } from './producto-form-modal'
import { StockModal, type ModoStock } from './stock-modal'
import { ProveedorFormModal } from './proveedor-form-modal'

const inputFecha =
  'px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:border-primary'

const ESTADO: Record<EstadoVenta, { texto: string; clase: string }> = {
  a_rendir: { texto: 'A rendir', clase: 'bg-aviso-suave text-aviso-fuerte' },
  rendida: { texto: 'Rendida', clase: 'bg-exito-suave text-exito-fuerte' },
  anulada: { texto: 'Anulada', clase: 'bg-muted text-muted-foreground' },
  sin_parte: { texto: 'Todo del estudio', clase: 'bg-info-suave text-info-fuerte' },
}

function inicioDeMes(): string {
  return hoyISO().slice(0, 8) + '01'
}

/** Lo que dice el renglón de un movimiento de stock. */
function textoMovimiento(m: MovimientoStock): string {
  const n = `${m.cantidad > 0 ? '+' : '−'}${Math.abs(m.cantidad)}`
  switch (m.tipo) {
    case 'ingreso':
      return `Ingreso ${n}${m.motivo ? ` · ${m.motivo}` : ''}`
    case 'devolucion':
      return `Devolución ${n} al proveedor (lo que no se vendió)${m.motivo ? ` · ${m.motivo}` : ''}`
    case 'ajuste':
      return `Ajuste ${n} · ${m.motivo}`
    case 'venta':
      return `Venta ${n}`
    case 'anulacion':
      return `Anulación de una venta ${n}${m.motivo ? ` · ${m.motivo}` : ''}`
  }
}

type Modal =
  | { tipo: 'vender'; productoId: string }
  | { tipo: 'anularVenta'; venta: VentaProducto }
  | { tipo: 'rendir'; proveedorId: string; ventas: VentaProducto[] }
  | { tipo: 'anularRendicion'; rendicion: Rendicion }
  | { tipo: 'producto'; producto?: Producto }
  | { tipo: 'stock'; producto: Producto; modo: ModoStock }
  | { tipo: 'proveedor'; proveedor?: Proveedor }

export function ProductosPage() {
  const { can } = useData()
  const { paymentMethods } = useStudio()

  // Una constante por acción, con la clave del motor. La base exige lo
  // mismo adentro de cada función: esto es para no ofrecer lo que va a
  // rechazar.
  const puedeVer = can('inventario.ver')
  const puedeVender = can('inventario.vender')
  const puedeGestionar = can('inventario.gestionar')
  const puedeAnular = can('inventario.anular')
  const puedeRendir = can('inventario.rendir') && can('gastos.cargar')
  const puedeAnularRendicion = can('inventario.rendir') && can('gastos.anular')
  const veProveedores = puedeVer || puedeGestionar || can('inventario.rendir')
  const veMovimientos = puedeVer || puedeGestionar
  const veRendiciones = puedeVer || can('inventario.rendir')
  const entra = puedeVer || puedeVender || puedeGestionar
  const necesitaCuentas = puedeAnular || puedeRendir || puedeAnularRendicion

  const [productos, setProductos] = useState<Producto[] | null>(null)
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [ventasHoy, setVentasHoy] = useState<VentaProducto[]>([])
  const [ventas, setVentas] = useState<VentaProducto[] | null>(null)
  const [aRendir, setARendir] = useState<VentaProducto[]>([])
  const [rendiciones, setRendiciones] = useState<Rendicion[]>([])
  const [movimientos, setMovimientos] = useState<MovimientoStock[]>([])
  const [cuentas, setCuentas] = useState<Account[]>([])
  const [falta, setFalta] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorVentas, setErrorVentas] = useState<string | null>(null)

  const [desde, setDesde] = useState(inicioDeMes)
  const [hasta, setHasta] = useState(hoyISO)
  const [filtroMov, setFiltroMov] = useState('')
  /** Las ventas destildadas en "Rendir": las nuevas entran tildadas. */
  const [excluidas, setExcluidas] = useState<Set<string>>(new Set())
  const [modal, setModal] = useState<Modal | null>(null)
  const [version, setVersion] = useState(0)
  const recargar = useCallback(() => setVersion((v) => v + 1), [])

  // Lo fijo: productos, proveedores, lo que falta rendir, los pagos y los
  // movimientos. Si la 0090 no corrió, la primera lectura lo dice y no se
  // pide nada más.
  useEffect(() => {
    if (!entra) return
    let vivo = true
    const hoy = hoyISO()
    ;(async () => {
      try {
        const ps = await fetchProductos()
        if (!vivo) return
        setProductos(ps)
        setFalta(false)
      } catch (e) {
        if (!vivo) return
        const msg = e instanceof Error ? e.message : 'No se pudieron leer los productos'
        if (msg === FALTA) setFalta(true)
        else setError(msg)
        setProductos([])
        return
      }
      const [prov, hoyV, pend, rend, mov, ctas] = await Promise.allSettled([
        veProveedores ? fetchProveedores() : Promise.resolve([] as Proveedor[]),
        fetchVentas({ desde: hoy, hasta: hoy }),
        veRendiciones ? fetchVentasARendir() : Promise.resolve([] as VentaProducto[]),
        veRendiciones ? fetchRendiciones() : Promise.resolve([] as Rendicion[]),
        veMovimientos ? fetchMovimientos(null, 80) : Promise.resolve([] as MovimientoStock[]),
        necesitaCuentas ? fetchAccounts() : Promise.resolve([] as Account[]),
      ])
      if (!vivo) return
      const fallas: string[] = []
      const tomar = <T,>(r: PromiseSettledResult<T>, poner: (v: T) => void) => {
        if (r.status === 'fulfilled') poner(r.value)
        else fallas.push(r.reason instanceof Error ? r.reason.message : String(r.reason))
      }
      tomar(prov, setProveedores)
      tomar(hoyV, setVentasHoy)
      tomar(pend, setARendir)
      tomar(rend, setRendiciones)
      tomar(mov, setMovimientos)
      tomar(ctas, setCuentas)
      setError(fallas.length > 0 ? [...new Set(fallas)].join(' · ') : null)
    })()
    return () => {
      vivo = false
    }
  }, [entra, veProveedores, veRendiciones, veMovimientos, necesitaCuentas, version])

  // Las ventas del período, aparte: cambian con las fechas.
  useEffect(() => {
    if (!entra || falta) return
    let vivo = true
    setErrorVentas(null)
    fetchVentas({ desde, hasta })
      .then((v) => vivo && setVentas(v))
      .catch((e) => {
        if (!vivo) return
        setVentas([])
        setErrorVentas(e instanceof Error ? e.message : 'No se pudieron leer las ventas')
      })
    return () => {
      vivo = false
    }
  }, [entra, falta, desde, hasta, version])

  const medios = useMemo(() => mediosParaCobrar(paymentMethods), [paymentMethods])

  // Al abrir la hoja de venta se vuelve a leer la lista: la tablet del
  // mostrador puede tener la pantalla abierta desde la mañana y el admin
  // haber cambiado un precio desde otro lado. La base igual controla, al
  // cobrar, que el precio sea el que se vio; esto es para que se vea el de
  // ahora desde el principio.
  const abrirVenta = (productoId: string) => {
    setModal({ tipo: 'vender', productoId })
    fetchProductos()
      .then(setProductos)
      .catch(() => {})
  }
  const proveedorDe = (id: string | null) => (id ? proveedores.find((p) => p.id === id) ?? null : null)
  const nombreCuenta = (id: string | null) => (id ? cuentas.find((c) => c.id === id)?.name ?? null : null)
  const nombreProducto = (id: string) => productos?.find((p) => p.id === id)?.nombre ?? 'Producto'

  // ── Estados de entrada ──────────────────────────────────────────────
  if (!entra) {
    // `?p=productos` abre la pantalla sin pasar por el menú: hay que
    // decirlo acá, no sólo esconder el ítem.
    return (
      <div className="p-4 md:p-6">
        <p className="text-sm text-muted-foreground bg-muted rounded-xl px-4 py-3">
          Tu rol no ve productos.
          {can('permisos.administrar') && ' Se da desde Configuración → Permisos.'}
        </p>
      </div>
    )
  }

  if (falta) {
    return (
      <div className="p-4 md:p-6">
        <div className="rounded-2xl border border-aviso/40 bg-aviso-suave px-4 py-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-aviso-fuerte shrink-0" />
          <div>
            <p className="text-sm font-semibold text-aviso-fuerte">{FALTA}</p>
            <p className="text-xs text-aviso-fuerte/90 mt-1">
              Hasta que se corra, el resto del sistema funciona igual: Caja, Pagos y el tablero no se
              enteran de que este módulo existe.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (productos === null) {
    return (
      <div className="py-16 flex justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-primary-fuerte" />
      </div>
    )
  }

  const activos = productos.filter((p) => p.active)
  const vigentesHoy = ventasHoy.filter((v) => v.status === 'pagado')
  const sumar = (vs: VentaProducto[], k: 'monto' | 'parteEstudio' | 'parteProveedor') =>
    vs.reduce((a, v) => a + v[k], 0)
  const faltaRendir = sumar(aRendir, 'parteProveedor')

  // Lo que falta rendir, por proveedor.
  const porProveedor = new Map<string, { nombre: string; ventas: VentaProducto[] }>()
  for (const v of aRendir) {
    const g = porProveedor.get(v.proveedorId) ?? {
      nombre: proveedorDe(v.proveedorId)?.nombre ?? v.proveedorNombre,
      ventas: [],
    }
    g.ventas.push(v)
    porProveedor.set(v.proveedorId, g)
  }

  const ventasDelPeriodo = ventas ?? []
  const vigentesPeriodo = ventasDelPeriodo.filter((v) => v.status === 'pagado')

  const modalActual = (() => {
    if (!modal) return null
    const cerrar = () => setModal(null)
    switch (modal.tipo) {
      case 'vender': {
        // Del listado fresco y no de una copia: después de vender, "Otra
        // venta" tiene que ver el stock que quedó.
        const p = productos.find((x) => x.id === modal.productoId)
        if (!p) return null
        return (
          <VenderModal
            producto={p}
            proveedor={proveedorDe(p.proveedorId)}
            onClose={cerrar}
            onVendido={recargar}
            onFallo={recargar}
          />
        )
      }
      case 'anularVenta':
        return (
          <AnularVentaModal
            venta={modal.venta}
            cuenta={nombreCuenta(modal.venta.accountId)}
            onClose={cerrar}
            onAnulada={recargar}
            onFallo={recargar}
          />
        )
      case 'rendir':
        return (
          <RendirModal
            proveedor={
              proveedorDe(modal.proveedorId) ?? {
                id: modal.proveedorId,
                nombre: modal.ventas[0]?.proveedorNombre ?? 'el proveedor',
              }
            }
            ventas={modal.ventas}
            cuentas={cuentas}
            onClose={cerrar}
            onRendido={() => {
              setExcluidas(new Set())
              recargar()
            }}
            onFallo={recargar}
          />
        )
      case 'anularRendicion':
        return (
          <AnularRendicionModal
            rendicion={modal.rendicion}
            cuenta={nombreCuenta(modal.rendicion.accountId)}
            onClose={cerrar}
            onAnulada={recargar}
            onFallo={recargar}
          />
        )
      case 'producto':
        return (
          <ProductoFormModal
            producto={modal.producto}
            proveedores={proveedores}
            onClose={cerrar}
            onGuardado={() => {
              cerrar()
              recargar()
            }}
          />
        )
      case 'stock':
        return (
          <StockModal
            producto={modal.producto}
            modo={modal.modo}
            proveedorNombre={proveedorDe(modal.producto.proveedorId)?.nombre ?? null}
            onClose={cerrar}
            onGuardado={() => {
              cerrar()
              recargar()
            }}
          />
        )
      case 'proveedor':
        return (
          <ProveedorFormModal
            proveedor={modal.proveedor}
            onClose={cerrar}
            onGuardado={() => {
              cerrar()
              recargar()
            }}
          />
        )
    }
  })()

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      {error && (
        <p className="text-xs text-destructive-fuerte bg-destructive/10 rounded-xl px-3 py-2">{error}</p>
      )}

      {/* ── Para vender ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
          <ShoppingBag className="w-4 h-4 text-primary-fuerte" />
          Para vender
        </h2>

        {activos.length === 0 ? (
          <p className="text-sm text-muted-foreground bg-card border border-border rounded-2xl px-4 py-6 text-center">
            Todavía no hay productos.
            {puedeGestionar && ' Se cargan más abajo, en Productos y precios.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {activos.map((p) => {
              const conPrecio = medios.filter((m) => p.precios[m.code] !== undefined)
              // Qué le falta para venderse. A quien lo puede completar se le
              // dice qué hacer y se le da el botón ahí mismo (Difusor y Spray
              // nacen sin proveedor y sin stock: si el admin no los completa,
              // el mostrador no vende); al resto, a quién pedírselo.
              const sinFicha = !p.proveedorId || conPrecio.length === 0
              const faltanAca: string[] = []
              if (!p.proveedorId) faltanAca.push(puedeGestionar ? 'elegir el proveedor' : 'el proveedor')
              if (conPrecio.length === 0) faltanAca.push(puedeGestionar ? 'cargar los precios' : 'los precios')
              if (p.stock <= 0) faltanAca.push(puedeGestionar ? 'cargar la mercadería' : 'stock')
              const motivo =
                faltanAca.length === 0
                  ? null
                  : `Para vender falta ${faltanAca.join(' y ')}${puedeGestionar ? '.' : ': lo carga quien administra.'}`
              return (
                <div key={p.id} className="bg-card rounded-2xl border border-border p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-base font-bold text-foreground truncate">{p.nombre}</p>
                      {p.descripcion && (
                        <p className="text-[11px] text-muted-foreground line-clamp-2">{p.descripcion}</p>
                      )}
                    </div>
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded-full text-[11px] font-semibold shrink-0',
                        p.stock <= 0
                          ? 'bg-destructive-suave text-destructive-fuerte'
                          : p.stock <= p.stockAviso
                            ? 'bg-aviso-suave text-aviso-fuerte'
                            : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {p.stock <= 0
                        ? 'Sin stock'
                        : p.stock <= p.stockAviso
                          ? `Quedan ${p.stock} · reponer`
                          : `Quedan ${p.stock}`}
                    </span>
                  </div>

                  {conPrecio.length > 0 ? (
                    // Una columna: en dos, "Transferencia Galicia" y
                    // "Transferencia BBVA" se cortaban igual en el celular.
                    <div className="space-y-1">
                      {conPrecio.map((m) => (
                        <div key={m.code} className="flex items-baseline justify-between gap-2 min-w-0">
                          <span className="text-xs text-muted-foreground truncate">{m.name}</span>
                          <span className="text-sm font-semibold text-foreground tabular-nums">
                            {plata(p.precios[m.code])}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">Sin precios cargados</p>
                  )}

                  <div className="mt-auto space-y-1.5">
                    {puedeVender && (
                      <button
                        disabled={!!motivo}
                        onClick={() => abrirVenta(p.id)}
                        className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40"
                      >
                        Vender
                      </button>
                    )}
                    {motivo && <p className="text-[11px] font-semibold text-aviso-fuerte">{motivo}</p>}
                    {puedeGestionar && (sinFicha || p.stock <= 0) && (
                      <div className="flex flex-wrap gap-1.5">
                        {sinFicha && (
                          <button
                            onClick={() => setModal({ tipo: 'producto', producto: p })}
                            className="px-2.5 py-1.5 rounded-lg border border-border text-[11px] font-semibold text-foreground hover:bg-muted inline-flex items-center gap-1"
                          >
                            <Pencil className="w-3 h-3" />
                            {!p.proveedorId ? 'Elegir el proveedor' : 'Cargar los precios'}
                          </button>
                        )}
                        {p.stock <= 0 && (
                          <button
                            onClick={() => setModal({ tipo: 'stock', producto: p, modo: 'ingreso' })}
                            className="px-2.5 py-1.5 rounded-lg border border-border text-[11px] font-semibold text-foreground hover:bg-muted inline-flex items-center gap-1"
                          >
                            <PackagePlus className="w-3 h-3" />
                            Cargar mercadería
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Hoy */}
        <div className="bg-card rounded-2xl border border-border px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <p className="text-[11px] text-muted-foreground">Hoy</p>
            <p className="text-sm font-bold text-foreground tabular-nums">
              {vigentesHoy.length} {vigentesHoy.length === 1 ? 'venta' : 'ventas'}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Cobrado</p>
            <p className="text-sm font-bold text-foreground tabular-nums">{plata(sumar(vigentesHoy, 'monto'))}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Para el estudio</p>
            <p className="text-sm font-bold text-foreground tabular-nums">
              {plata(sumar(vigentesHoy, 'parteEstudio'))}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Para proveedores</p>
            <p className="text-sm font-bold text-foreground tabular-nums">
              {plata(sumar(vigentesHoy, 'parteProveedor'))}
            </p>
          </div>
        </div>
      </section>

      <SeccionesPlegables memoria="productos">
        {/* ── Ventas ───────────────────────────────────────────────── */}
        <SeccionPlegable
          id="ventas"
          titulo="Ventas"
          icono={Receipt}
          abiertaPorDefecto
          resumen={
            ventas ? (
              <span className="text-xs text-muted-foreground tabular-nums">{plata(sumar(vigentesPeriodo, 'monto'))}</span>
            ) : undefined
          }
        >
          <div className="px-5 py-3 space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Desde</label>
                <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={inputFecha} />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Hasta</label>
                <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={inputFecha} />
              </div>
              <button
                onClick={() => {
                  setDesde(hoyISO())
                  setHasta(hoyISO())
                }}
                className="px-3 py-2 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted"
              >
                Hoy
              </button>
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
                  const fin = addDays(inicioDeMes(), -1)
                  setDesde(fin.slice(0, 8) + '01')
                  setHasta(fin)
                }}
                className="px-3 py-2 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted"
              >
                Mes pasado
              </button>
            </div>

            {errorVentas && (
              <p className="text-xs text-destructive-fuerte bg-destructive/10 rounded-xl px-3 py-2">{errorVentas}</p>
            )}

            {ventas === null ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Cargando…</p>
            ) : ventas.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Sin ventas en el período</p>
            ) : (
              <div className="divide-y divide-border">
                {ventas.map((v) => {
                  const anulada = v.status === 'anulado'
                  return (
                    <div key={v.id} className="py-3 space-y-1">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">
                            <span className="text-muted-foreground tabular-nums">V-{v.numero}</span> ·{' '}
                            {v.productoNombre} · {v.aroma}
                            {v.cantidad > 1 && ` ×${v.cantidad}`}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {momento(v.paidAt)} · {v.medio}
                            {v.compradorNombre && ` · ${v.compradorNombre}`}
                            {v.vendidoPorNombre && ` · vendió ${v.vendidoPorNombre}`}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p
                            className={cn(
                              'text-sm font-bold tabular-nums',
                              anulada ? 'text-muted-foreground line-through' : 'text-foreground'
                            )}
                          >
                            {plata(v.monto)}
                          </p>
                          <span
                            className={cn(
                              'inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold',
                              ESTADO[v.estado].clase
                            )}
                          >
                            {ESTADO[v.estado].texto}
                          </span>
                        </div>
                      </div>
                      {!anulada && (
                        <p className="text-[11px] text-muted-foreground">
                          Estudio {plata(v.parteEstudio)} ({v.pctEstudio}%) · {v.proveedorNombre}{' '}
                          {plata(v.parteProveedor)}
                        </p>
                      )}
                      {anulada && v.voidReason && (
                        <p className="text-[11px] text-muted-foreground">Anulada: {v.voidReason}</p>
                      )}
                      {puedeAnular && !anulada && v.estado !== 'rendida' && (
                        <button
                          onClick={() => setModal({ tipo: 'anularVenta', venta: v })}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive-fuerte inline-flex items-center gap-1"
                        >
                          <Ban className="w-3 h-3" />
                          Anular
                        </button>
                      )}
                      {puedeAnular && v.estado === 'rendida' && (
                        <p className="text-[11px] text-muted-foreground">
                          Ya se le rindió al proveedor. Para anularla, primero anulá ese pago en Rendir a
                          proveedores → Pagos anteriores.
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {ventas && vigentesPeriodo.length > 0 && (
              <div className="rounded-xl bg-muted/50 px-3.5 py-2.5 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Cobrado</p>
                  <p className="font-bold text-foreground tabular-nums">{plata(sumar(vigentesPeriodo, 'monto'))}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Estudio</p>
                  <p className="font-bold text-foreground tabular-nums">
                    {plata(sumar(vigentesPeriodo, 'parteEstudio'))}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Proveedores</p>
                  <p className="font-bold text-foreground tabular-nums">
                    {plata(sumar(vigentesPeriodo, 'parteProveedor'))}
                  </p>
                </div>
              </div>
            )}

            {!puedeAnular && (
              <p className="text-[11px] text-muted-foreground">
                Si te equivocaste en una venta, avisale a quien administra: la anulación la hace admin.
              </p>
            )}
          </div>
        </SeccionPlegable>

        {/* ── Rendir a proveedores ─────────────────────────────────── */}
        {veRendiciones && (
          <SeccionPlegable
            id="rendir"
            titulo="Rendir a proveedores"
            icono={HandCoins}
            resumen={
              faltaRendir > 0 ? (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-aviso-suave text-aviso-fuerte tabular-nums">
                  Falta rendir {plata(faltaRendir)}
                </span>
              ) : undefined
            }
          >
            <div className="px-5 py-3 space-y-5">
              {porProveedor.size === 0 ? (
                <p className="text-sm text-muted-foreground py-2 text-center">
                  No hay ventas pendientes de rendir.
                </p>
              ) : (
                [...porProveedor.entries()].map(([provId, g]) => {
                  // Sólo quien registra el pago elige qué ventas entran: al
                  // resto, la lista de lectura con lo pendiente entero.
                  const elegidas = puedeRendir ? g.ventas.filter((v) => !excluidas.has(v.id)) : g.ventas
                  const total = sumar(elegidas, 'parteProveedor')
                  return (
                    <div key={provId} className="rounded-2xl border border-border overflow-hidden">
                      <div className="px-4 py-3 bg-muted/40 flex items-baseline justify-between gap-2">
                        <p className="text-sm font-bold text-foreground truncate">{g.nombre}</p>
                        <p className="text-xs text-muted-foreground shrink-0">
                          {g.ventas.length} {g.ventas.length === 1 ? 'venta' : 'ventas'} ·{' '}
                          {plata(sumar(g.ventas, 'parteProveedor'))}
                        </p>
                      </div>
                      <div className="divide-y divide-border">
                        {g.ventas.map((v) => {
                          const Fila = puedeRendir ? 'label' : 'div'
                          return (
                            <Fila
                              key={v.id}
                              className={cn('px-4 py-2.5 flex items-start gap-3', puedeRendir && 'cursor-pointer')}
                            >
                              {puedeRendir && (
                                <input
                                  type="checkbox"
                                  className="mt-1"
                                  checked={!excluidas.has(v.id)}
                                  onChange={(e) => {
                                    const s = new Set(excluidas)
                                    if (e.target.checked) s.delete(v.id)
                                    else s.add(v.id)
                                    setExcluidas(s)
                                  }}
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-foreground">
                                  {fechaCorta(v.paidDate)} · {v.productoNombre} · {v.aroma}
                                  {v.cantidad > 1 && ` ×${v.cantidad}`}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  V-{v.numero} · cobrado {plata(v.monto)} en {v.medio}
                                </p>
                              </div>
                              <p className="text-sm font-semibold text-foreground tabular-nums shrink-0">
                                {plata(v.parteProveedor)}
                              </p>
                            </Fila>
                          )
                        })}
                      </div>
                      <div className="px-4 py-3 border-t border-border flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">
                          {puedeRendir ? 'A pagar' : 'Pendiente'}:{' '}
                          <span className="text-sm font-bold text-foreground tabular-nums">{plata(total)}</span>
                        </p>
                        {puedeRendir ? (
                          <button
                            disabled={elegidas.length === 0}
                            onClick={() =>
                              setModal({ tipo: 'rendir', proveedorId: provId, ventas: elegidas })
                            }
                            className="px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40"
                          >
                            Registrar el pago al proveedor
                          </button>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">El pago lo registra quien administra.</p>
                        )}
                      </div>
                    </div>
                  )
                })
              )}

              <div>
                <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5" />
                  Pagos anteriores
                </p>
                {rendiciones.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">Todavía no se le pagó a ningún proveedor.</p>
                ) : (
                  <div className="divide-y divide-border">
                    {rendiciones.map((r) => (
                      <div key={r.id} className="py-2.5 space-y-1">
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <p className={cn('text-sm text-foreground', !r.vigente && 'line-through text-muted-foreground')}>
                              {r.proveedorNombre} · {r.ventas} {r.ventas === 1 ? 'venta' : 'ventas'}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {momento(r.createdAt)} ·{' '}
                              {r.desde === r.hasta
                                ? `ventas del ${fechaLarga(r.desde)}`
                                : `ventas del ${fechaLarga(r.desde)} al ${fechaLarga(r.hasta)}`}
                              {nombreCuenta(r.accountId) && ` · desde ${nombreCuenta(r.accountId)}`}
                            </p>
                          </div>
                          <p
                            className={cn(
                              'text-sm font-bold tabular-nums shrink-0',
                              r.vigente ? 'text-foreground' : 'text-muted-foreground line-through'
                            )}
                          >
                            {plata(r.total)}
                          </p>
                        </div>
                        {!r.vigente && (
                          <p className="text-[11px] text-muted-foreground">
                            Anulado: esas ventas volvieron a quedar pendientes.
                          </p>
                        )}
                        {r.vigente && r.gastoMonto !== null && Math.abs(r.gastoMonto - r.total) >= 0.01 && (
                          <p className="text-[11px] text-aviso-fuerte">
                            Ojo: el gasto en Gastos dice {plata(r.gastoMonto)}.
                          </p>
                        )}
                        {r.vigente && puedeAnularRendicion && (
                          <button
                            onClick={() => setModal({ tipo: 'anularRendicion', rendicion: r })}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive-fuerte inline-flex items-center gap-1"
                          >
                            <Undo2 className="w-3 h-3" />
                            Anular este pago
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <p className="text-[11px] text-muted-foreground">
                Registrar el pago carga el gasto en Gastos por vos, en &ldquo;Rendiciones a
                proveedores&rdquo;. No hace falta cargarlo a mano: si lo hacés, la plata sale dos veces.
              </p>
            </div>
          </SeccionPlegable>
        )}

        {/* ── Productos y precios ──────────────────────────────────── */}
        {puedeGestionar && (
          <SeccionPlegable
            id="productos"
            titulo="Productos y precios"
            icono={Boxes}
            // Abierta mientras haya algo que no se puede vender por falta de
            // proveedor o de precios: es lo primero que tiene que completar
            // el admin (si ya plegó secciones antes, manda lo que recordó).
            abiertaPorDefecto={activos.some(
              (p) => !p.proveedorId || !medios.some((m) => p.precios[m.code] !== undefined)
            )}
            accion={
              <button
                onClick={() => setModal({ tipo: 'producto' })}
                className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary-fuerte text-xs font-semibold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Nuevo
              </button>
            }
          >
            <div className="divide-y divide-border">
              {productos.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted-foreground text-center">Sin productos cargados.</p>
              ) : (
                productos.map((p) => {
                  const prov = proveedorDe(p.proveedorId)
                  return (
                    <div key={p.id} className="px-5 py-3 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className={cn('text-sm font-semibold text-foreground', !p.active && 'text-muted-foreground')}>
                            {p.nombre}
                            {!p.active && <span className="ml-2 text-[10px] font-semibold">dado de baja</span>}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {prov ? `${prov.nombre} · ${prov.pctEstudio}% estudio` : 'Sin proveedor'} · stock{' '}
                            {p.stock} · avisa con {p.stockAviso}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {Object.keys(p.precios).length === 0
                              ? 'Sin precios'
                              : Object.entries(p.precios)
                                  .map(
                                    ([c, n]) =>
                                      `${paymentMethods.find((m) => m.code === c)?.name ?? c} ${plata(n)}`
                                  )
                                  .join(' · ')}
                          </p>
                          {p.aromas.length > 0 && (
                            <p className="text-[11px] text-muted-foreground">Aromas: {p.aromas.join(', ')}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => setModal({ tipo: 'producto', producto: p })}
                          className="px-2.5 py-1.5 rounded-lg border border-border text-[11px] font-semibold text-foreground hover:bg-muted inline-flex items-center gap-1"
                        >
                          <Pencil className="w-3 h-3" />
                          Editar
                        </button>
                        <button
                          onClick={() => setModal({ tipo: 'stock', producto: p, modo: 'ingreso' })}
                          className="px-2.5 py-1.5 rounded-lg border border-border text-[11px] font-semibold text-foreground hover:bg-muted inline-flex items-center gap-1"
                        >
                          <PackagePlus className="w-3 h-3" />
                          Cargar mercadería
                        </button>
                        <button
                          onClick={() => setModal({ tipo: 'stock', producto: p, modo: 'devolucion' })}
                          disabled={p.stock <= 0}
                          className="px-2.5 py-1.5 rounded-lg border border-border text-[11px] font-semibold text-foreground hover:bg-muted inline-flex items-center gap-1 disabled:opacity-40"
                        >
                          <PackageMinus className="w-3 h-3" />
                          Devolver al proveedor
                        </button>
                        <button
                          onClick={() => setModal({ tipo: 'stock', producto: p, modo: 'ajuste' })}
                          className="px-2.5 py-1.5 rounded-lg border border-border text-[11px] font-semibold text-foreground hover:bg-muted inline-flex items-center gap-1"
                        >
                          <SlidersHorizontal className="w-3 h-3" />
                          Ajustar
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </SeccionPlegable>
        )}

        {/* ── Movimientos de stock ─────────────────────────────────── */}
        {veMovimientos && (
          <SeccionPlegable id="movimientos" titulo="Movimientos de stock" icono={History}>
            <div className="px-5 py-3 space-y-2">
              <select
                value={filtroMov}
                onChange={(e) => setFiltroMov(e.target.value)}
                className={cn(inputFecha, 'w-full sm:w-auto')}
              >
                <option value="">Todos los productos</option>
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
              {movimientos.filter((m) => !filtroMov || m.productoId === filtroMov).length === 0 ? (
                <p className="text-sm text-muted-foreground py-3 text-center">Sin movimientos todavía.</p>
              ) : (
                <div className="divide-y divide-border">
                  {movimientos
                    .filter((m) => !filtroMov || m.productoId === filtroMov)
                    .map((m) => (
                      <div key={m.id} className="py-2 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground">
                            {nombreProducto(m.productoId)} · {textoMovimiento(m)}
                          </p>
                          <p className="text-[11px] text-muted-foreground">{momento(m.at)}</p>
                        </div>
                        <p className="text-xs text-muted-foreground tabular-nums shrink-0">quedan {m.stockResultante}</p>
                      </div>
                    ))}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">Se muestran los últimos 80.</p>
            </div>
          </SeccionPlegable>
        )}

        {/* ── Proveedores ──────────────────────────────────────────── */}
        {veProveedores && (
          <SeccionPlegable
            id="proveedores"
            titulo="Proveedores"
            icono={Truck}
            accion={
              puedeGestionar ? (
                <button
                  onClick={() => setModal({ tipo: 'proveedor' })}
                  className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary-fuerte text-xs font-semibold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Nuevo
                </button>
              ) : undefined
            }
          >
            <div className="divide-y divide-border">
              {proveedores.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted-foreground text-center">
                  Sin proveedores cargados. Sin proveedor, un producto no se puede vender.
                </p>
              ) : (
                proveedores.map((p) => (
                  <div key={p.id} className="px-5 py-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm font-semibold text-foreground', !p.active && 'text-muted-foreground')}>
                        {p.nombre}
                        {!p.active && <span className="ml-2 text-[10px] font-semibold">dado de baja</span>}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {p.pctEstudio}% para el estudio · {Math.round((100 - p.pctEstudio) * 100) / 100}% para el
                        proveedor
                        {p.contacto && ` · ${p.contacto}`}
                      </p>
                      {p.notas && <p className="text-[11px] text-muted-foreground">{p.notas}</p>}
                    </div>
                    {puedeGestionar && (
                      <button
                        onClick={() => setModal({ tipo: 'proveedor', proveedor: p })}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted shrink-0"
                        aria-label={`Editar ${p.nombre}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </SeccionPlegable>
        )}
      </SeccionesPlegables>

      {modalActual}
    </div>
  )
}
