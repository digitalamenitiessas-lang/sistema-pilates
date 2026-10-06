'use client'

/**
 * Vender un producto en el mostrador.
 *
 * Lo que se elige acá es lo que la base no puede saber: cuántos, qué
 * pieza (el aroma de un difusor, la letra y el código de un aro), con qué
 * se pagó y, si hay, quién compró. El precio sale de la lista —la del
 * producto o, si el producto va por letra, la del proveedor (0092)— y lo
 * pone la base, igual que el reparto con el proveedor y la cuenta donde
 * entra la plata: el número que se ve acá es una vista previa del mismo
 * cálculo. Lo que sí viaja es el precio que se ve, como control: si el
 * admin cambió la lista desde otro lado, la base corta en vez de
 * registrar un monto distinto del que se le cobró a quien compra.
 *
 * El dato (aroma, código: el nombre lo pone el producto) es obligatorio
 * en la pantalla y en la base. Es texto libre, pero arriba están las
 * sugerencias, y un toque las copia tal cual: así "Lavanda", "lavanda" y
 * "lavana" no salen como tres cosas distintas en lo que se le rinde al
 * proveedor. Un producto por letra se vende de a una pieza: cada código
 * es una, y "Otra venta" está a un toque.
 */

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Loader2, Minus, Plus, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useData, useStudio } from '@/lib/data-context'
import { buscarCodigoVendido, fetchAromas, nuevaLlave, venderProducto } from '@/lib/inventario-api'
import type { Producto, Proveedor, VentaRegistrada } from '@/lib/types'
import { iconoDeMedio, mediosParaCobrar } from '@/components/pagos/pagos-page'
import {
  BotonPrincipal,
  BotonSecundario,
  Chips,
  Hoja,
  fechaCorta,
  inputClass,
  labelClass,
  ordenarLetras,
  plata,
  reparto,
} from './comun'

type Comprador = 'nadie' | 'ficha' | 'otra'

/**
 * La llave pendiente de cada producto, FUERA de la hoja. Si la respuesta
 * de una venta se pierde (mala señal: la venta quedó grabada pero el
 * navegador recibe un error) y quien vende cierra la hoja y la vuelve a
 * abrir, una llave nueva grabaría una segunda venta: otra vez el stock,
 * otra vez la plata en la caja. Con la llave guardada acá, el segundo
 * "Cobrar" manda la misma y la base devuelve la venta ya hecha —aunque
 * mientras tanto se haya corregido el código o cambiado el medio: una
 * llave, una venta como mucho, y el comprobante avisa la diferencia—. Se
 * suelta recién cuando una venta se confirma. Vive mientras la pestaña
 * esté abierta (sobrevive a ir a otra pantalla y volver).
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

/** "a", "a y b", "a, b y c" */
function enLista(xs: string[]): string {
  return xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`
}

export function VenderModal({
  producto,
  proveedor,
  letras,
  onClose,
  onVendido,
  onFallo,
}: {
  producto: Producto
  /** Para la vista previa del reparto; null si el rol no ve proveedores */
  proveedor: Proveedor | null
  /** La lista por letra del proveedor del producto (letra → medio → precio); {} si no tiene */
  letras: Record<string, Record<string, number>>
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

  const porLetra = producto.precioPorLetra
  const dato = producto.datoVenta
  const ordenLetras = useMemo(() => ordenarLetras(Object.keys(letras)), [letras])

  const [letra, setLetra] = useState<string | null>(null)
  const [cantidad, setCantidad] = useState(1)
  const [aroma, setAroma] = useState('')
  const [sugeridos, setSugeridos] = useState<string[]>(producto.aromas)
  const [elegido, setElegido] = useState<string | null>(null)
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
  const [repetido, setRepetido] = useState<{ codigo: string; numero: number; paidDate: string } | null>(null)

  // El precio de un medio para lo elegido: de la letra (si ya hay una) o
  // de la lista del producto.
  const precioEn = (code: string, l: string | null = letra): number | undefined =>
    porLetra ? (l ? letras[l]?.[code] : undefined) : producto.precios[code]

  // Sólo los medios del mostrador que tienen precio: para la letra
  // elegida o, mientras no hay letra, para alguna.
  const medios = useMemo(
    () =>
      mediosParaCobrar(paymentMethods).filter((m) =>
        porLetra
          ? letra
            ? letras[letra]?.[m.code] !== undefined
            : ordenLetras.some((l) => letras[l][m.code] !== undefined)
          : producto.precios[m.code] !== undefined
      ),
    [paymentMethods, porLetra, letra, letras, ordenLetras, producto.precios]
  )

  // Con un solo medio posible, ya queda elegido.
  const unico = medios.length === 1 ? medios[0].code : null
  // Si al volver a leer la lista (o al cambiar de letra) el medio elegido
  // se quedó sin precio, es como no haber elegido: así el botón no queda
  // habilitado y mudo.
  const method = (elegido ?? unico) && medios.some((m) => m.code === (elegido ?? unico)) ? (elegido ?? unico) : null
  const precio = method ? precioEn(method) : undefined
  const cant = porLetra ? 1 : cantidad
  const total = precio !== undefined ? precio * cant : null

  // La base del reparto: lo cobrado, o el precio de efectivo de la misma
  // pieza si el proveedor calcula sobre el efectivo (0092).
  const sobreEfectivo = proveedor?.comisionSobre === 'efectivo'
  const precioEfectivo = porLetra ? (letra ? letras[letra]?.efectivo : undefined) : producto.precios.efectivo
  const base = precio === undefined ? undefined : sobreEfectivo ? precioEfectivo : precio
  const faltaEfectivo = sobreEfectivo && precio !== undefined && precioEfectivo === undefined
  const vista =
    total !== null && proveedor && base !== undefined ? reparto(total, base * cant, proveedor.pctEstudio) : null
  const masQueLoCobrado = vista !== null && vista.proveedor > (total ?? 0) + 0.001

  useEffect(() => {
    let vivo = true
    fetchAromas(producto)
      .then((a) => vivo && setSugeridos(a))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [producto])

  // Si al volver a leer quedó menos stock que la cantidad elegida, se baja.
  useEffect(() => {
    setCantidad((c) => Math.max(1, Math.min(c, producto.stock)))
  }, [producto.stock])

  // Un código ya vendido de este producto: aviso suave, no freno (puede
  // ser una pieza repetida de verdad). Se mira medio segundo después de
  // dejar de escribir.
  useEffect(() => {
    if (!porLetra) return
    const codigo = aroma.trim()
    if (codigo.length < 2) {
      setRepetido(null)
      return
    }
    let vivo = true
    const t = setTimeout(() => {
      buscarCodigoVendido(producto.id, codigo)
        .then((r) => vivo && setRepetido(r ? { codigo, ...r } : null))
        .catch(() => {})
    }, 500)
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [porLetra, aroma, producto.id])

  const encontradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (q.length < 2) return []
    return students
      .filter((s) => s.name.toLowerCase().includes(q) || (s.dni ?? '').includes(q))
      .slice(0, 6)
  }, [busqueda, students])
  const elegida = studentId ? students.find((s) => s.id === studentId) : null

  // En verbos y sin género: el dato puede llamarse de cualquier forma.
  const faltan: string[] = []
  if (porLetra && !letra) faltan.push('elegir la letra')
  if (!aroma.trim()) faltan.push(`completar «${dato}»`)
  if (!method) faltan.push('elegir el medio de pago')
  if (comprador === 'ficha' && !studentId) faltan.push('elegir la ficha del cliente')
  const bloqueada = faltaEfectivo || masQueLoCobrado

  const cobrar = async () => {
    if (faltan.length > 0 || bloqueada || !method || precio === undefined) return
    setGuardando(true)
    setError(null)
    try {
      const r = await venderProducto({
        productoId: producto.id,
        cantidad: cant,
        aroma,
        method,
        studentId: comprador === 'ficha' ? studentId : null,
        comprador: comprador === 'otra' ? nombreLibre : '',
        notas,
        idem,
        // El que se ve en el botón: si la lista cambió, la base corta.
        precioEsperado: precio,
        letra: porLetra ? letra : null,
      })
      // Confirmada (nueva o la del intento anterior): la llave ya se usó.
      if (llavesPendientes.get(producto.id) === idem) llavesPendientes.delete(producto.id)
      setHecha(r)
      onVendido()
    } catch (e) {
      // La llave NO se suelta: si la venta se grabó y la respuesta se
      // perdió, el próximo "Cobrar" tiene que dar con ella y no grabar otra.
      setError(e instanceof Error ? e.message : 'No se pudo registrar la venta')
      onFallo()
    } finally {
      setGuardando(false)
    }
  }

  // Quien compra queda, como el medio: un producto por letra se vende de a
  // una pieza, y quien se lleva dos aros son dos ventas de la misma
  // persona. Queda a la vista en "Quién compra" y se cambia con un toque.
  const otraVenta = () => {
    setHecha(null)
    setIdem(llaveDe(producto.id))
    setCantidad(1)
    setLetra(null)
    setAroma('')
    setRepetido(null)
    setBusqueda('')
    setNotas('')
    setError(null)
  }

  if (hecha) {
    // Lo que registró la base; con la base vieja (sin estos datos), lo de
    // la pantalla, que es lo que se mandó.
    const letraHecha = hecha.letra ?? (porLetra ? letra : null)
    const datoHecho = hecha.dato ?? aroma.trim()
    const pieza = [letraHecha && `letra ${letraHecha}`, datoHecho && `(${datoHecho})`].filter(Boolean).join(' ')
    const pctProv = proveedor ? Math.round((100 - proveedor.pctEstudio) * 100) / 100 : null
    // Un reintento devuelve la venta del intento anterior TAL COMO QUEDÓ.
    // Si entre tanto se cambió algo (se corrigió el código, la tarjeta no
    // pasó y se pagó en efectivo), se dice qué quedó y qué hay elegido: la
    // base no grabó otra venta, y corregir la que quedó es anularla. Con la
    // base vieja letra y dato no vuelven: sólo se comparan medio y cantidad.
    const nombreMedioElegido = method ? paymentMethods.find((m) => m.code === method)?.name ?? method : null
    const limpio = (t: string) => t.replace(/\s+/g, ' ').trim()
    const diferencias: Array<{ quedo: string; ahora: string }> = []
    if (hecha.repetida) {
      if (hecha.dato !== null) {
        const letraAhora = porLetra ? letra : null
        if ((hecha.letra ?? null) !== (letraAhora ?? null)) {
          diferencias.push({ quedo: `letra ${hecha.letra ?? '(sin letra)'}`, ahora: `letra ${letraAhora ?? '(sin letra)'}` })
        }
        if (limpio(hecha.dato) !== limpio(aroma)) {
          const nombre = (hecha.datoNombre ?? dato).toLowerCase()
          diferencias.push({ quedo: `${nombre} ${hecha.dato}`, ahora: `${nombre} ${limpio(aroma) || '(vacío)'}` })
        }
      }
      if (nombreMedioElegido && hecha.medio !== nombreMedioElegido) {
        diferencias.push({ quedo: hecha.medio, ahora: nombreMedioElegido })
      }
      if (hecha.cantidad !== cant) {
        diferencias.push({ quedo: `${hecha.cantidad} u.`, ahora: `${cant} u.` })
      }
    }
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
            {hecha.cantidad} × {producto.nombre}
            {pieza && `, ${pieza}`} a {plata(hecha.precioUnitario)}. La plata entra en{' '}
            <span className="font-semibold">{hecha.cuenta}</span>.
          </p>
          <p className="text-xs text-exito-fuerte">
            Para el estudio {plata(hecha.parteEstudio)} · para el proveedor {plata(hecha.parteProveedor)}
            {hecha.comisionSobre === 'efectivo' && hecha.precioBase !== null && pctProv !== null && (
              <> ({pctProv}% del precio de efectivo, {plata(hecha.precioBase * hecha.cantidad)})</>
            )}
          </p>
          <p className="text-xs text-exito-fuerte">
            {hecha.stockRestante === 0
              ? `No quedan más ${producto.nombre}.`
              : `Quedan ${hecha.stockRestante}.`}
          </p>
        </div>
        {hecha.repetida && diferencias.length === 0 && (
          <p className="text-[11px] text-muted-foreground">
            El cobro se había registrado en el intento anterior; no se cobró dos veces.
          </p>
        )}
        {diferencias.length > 0 && (
          <div className="text-xs text-aviso-fuerte bg-aviso-suave rounded-xl px-3 py-2.5 flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <div className="space-y-1">
              <p>
                En el intento anterior la venta ya había quedado registrada (V-{hecha.numero}) con{' '}
                <span className="font-semibold">{enLista(diferencias.map((d) => d.quedo))}</span>, no con lo que está
                elegido ahora ({enLista(diferencias.map((d) => d.ahora))}). No se registró otra venta.
              </p>
              <p>
                Si es la misma pieza y lo que quedó está mal (un código mal escrito, otro medio de pago), no hagas otra
                venta encima:{' '}
                {can('inventario.anular')
                  ? `anulá V-${hecha.numero} desde las ventas de hoy y recién ahí cobrala bien.`
                  : `pedile a quien administra que anule V-${hecha.numero} y recién ahí cobrala bien.`}{' '}
                Si además se lleva otra pieza, tocá &ldquo;Otra venta&rdquo;.
              </p>
            </div>
          </div>
        )}
        {!can('inventario.anular') && (
          <p className="text-[11px] text-muted-foreground">
            Si te equivocaste, avisale a quien administra: la anulación la hace admin.
          </p>
        )}
      </Hoja>
    )
  }

  const pctProv = proveedor ? Math.round((100 - proveedor.pctEstudio) * 100) / 100 : null

  return (
    <Hoja
      titulo={`Vender ${producto.nombre}`}
      subtitulo={`Hay ${producto.stock} en stock`}
      ocupado={guardando}
      onClose={onClose}
      error={error}
      nota={
        guardando
          ? null
          : faltan.length > 0
            ? `Para cobrar falta ${enLista(faltan)}.`
            : bloqueada
              ? 'No se puede cobrar hasta que quien administra revise los precios (ver arriba).'
              : null
      }
      pie={
        <>
          <BotonSecundario onClick={onClose} disabled={guardando}>
            Cancelar
          </BotonSecundario>
          <BotonPrincipal onClick={cobrar} disabled={guardando || faltan.length > 0 || bloqueada}>
            {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
            {total !== null ? `Cobrar ${plata(total)}` : 'Cobrar'}
          </BotonPrincipal>
        </>
      }
    >
      {/* Cantidad: un producto por letra va de a una pieza */}
      {porLetra ? (
        <p className="text-[11px] text-muted-foreground">
          Se vende de a una pieza: cada una tiene su código. Para otra, tocá &ldquo;Otra venta&rdquo; después de
          cobrar.
        </p>
      ) : (
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
      )}

      {/* Letra */}
      {porLetra && (
        <div>
          <label className={labelClass}>Letra de la etiqueta *</label>
          {ordenLetras.length === 0 ? (
            <p className="text-xs text-aviso-fuerte bg-aviso-suave rounded-xl px-3 py-2.5">
              {proveedor?.nombre ?? 'El proveedor'} no tiene precios por letra cargados. Los carga quien
              administra en Proveedores.
            </p>
          ) : (
            <>
              {!method && (
                <p className="text-[11px] text-muted-foreground mb-1">Precios en efectivo</p>
              )}
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                {ordenLetras.map((l) => {
                  const p = method ? letras[l][method] : letras[l].efectivo
                  const sinPrecio = method ? p === undefined : false
                  return (
                    <button
                      key={l}
                      type="button"
                      disabled={sinPrecio}
                      onClick={() => setLetra(l)}
                      className={cn(
                        'flex flex-col items-center py-2 rounded-xl border transition-colors disabled:opacity-35',
                        letra === l ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                      )}
                      aria-label={`Letra ${l}`}
                    >
                      <span className="text-base font-bold text-foreground leading-tight">{l}</span>
                      <span className="text-[10px] tabular-nums text-muted-foreground leading-tight">
                        {p === undefined ? '—' : plata(p)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* El dato: aroma, código… */}
      <div>
        <label className={labelClass} htmlFor="dato-venta">
          {dato} *
        </label>
        {sugeridos.length > 0 && (
          <div className="mb-2">
            <p className="text-[11px] text-muted-foreground mb-1">Sugeridos</p>
            <Chips opciones={sugeridos} elegido={aroma} onElegir={setAroma} />
          </div>
        )}
        <input
          id="dato-venta"
          value={aroma}
          onChange={(e) => setAroma(e.target.value)}
          maxLength={60}
          autoCapitalize={porLetra ? 'characters' : undefined}
          placeholder={dato.toLowerCase() === 'aroma' ? 'Ej.: Lavanda' : 'Como figura en la etiqueta'}
          className={inputClass}
        />
        {repetido && repetido.codigo === aroma.trim() && (
          <p className="text-[11px] text-aviso-fuerte mt-1">
            {repetido.codigo} ya se vendió el {fechaCorta(repetido.paidDate)} (V-{repetido.numero}). Si es otra
            pieza con el mismo código, seguí.
          </p>
        )}
      </div>

      {/* Medio */}
      <div>
        <label className={labelClass}>Medio de pago *</label>
        {medios.length === 0 ? (
          <p className="text-xs text-aviso-fuerte bg-aviso-suave rounded-xl px-3 py-2.5">
            {porLetra && letra
              ? `La letra ${letra} no tiene precio en ningún medio del mostrador.`
              : `${producto.nombre} no tiene precio en ningún medio del mostrador.`}{' '}
            Lo carga quien administra en {porLetra ? 'Proveedores' : 'Productos y precios'}.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {medios.map((m) => {
              const Icono = iconoDeMedio(m.code)
              const p = precioEn(m.code)
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
                    {p !== undefined ? plata(p) : porLetra ? 'según la letra' : ''}
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

      {faltaEfectivo && (
        <p className="text-xs text-aviso-fuerte bg-aviso-suave rounded-xl px-3 py-2.5 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            {porLetra ? `La letra ${letra}` : producto.nombre} no tiene precio en efectivo, y la parte del estudio
            se calcula sobre ese precio. Lo carga quien administra.
          </span>
        </p>
      )}
      {masQueLoCobrado && (
        <p className="text-xs text-aviso-fuerte bg-aviso-suave rounded-xl px-3 py-2.5 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            En este medio sale menos que en efectivo, y al proveedor le tocaría más de lo cobrado. Lo revisa quien
            administra.
          </span>
        </p>
      )}

      {total !== null && (
        <div className="rounded-xl bg-muted/50 px-3.5 py-3 text-xs text-muted-foreground space-y-0.5">
          <p>
            {cant} × {plata(precio!)}
            {porLetra && letra && ` (letra ${letra})`} ={' '}
            <span className="font-bold text-foreground">{plata(total)}</span>
          </p>
          {vista && proveedor && !masQueLoCobrado && (
            <p>
              Para el estudio {plata(vista.estudio)} · para {proveedor.nombre} {plata(vista.proveedor)} ({pctProv}%{' '}
              {sobreEfectivo ? 'del precio de efectivo' : 'de lo cobrado'})
            </p>
          )}
          <p>El precio sale de la lista; no se aplica el recargo ni el descuento del medio.</p>
        </div>
      )}
    </Hoja>
  )
}
