'use client'

/**
 * Alta y edición de un producto: su proveedor, sus precios por medio de
 * pago y las sugerencias del dato que se pide al vender.
 *
 * Los precios son los que da el estudio para cada medio, uno por uno; no
 * se derivan del recargo ni del descuento del medio. Un medio sin precio
 * no se ofrece al vender, y las dos transferencias pueden tener el mismo.
 *
 * Con la 0092, el precio puede salir en cambio de la letra de la etiqueta
 * (la lista es del proveedor: Chini tiene una sola tabla para aros,
 * collares, anillos y pulseras), y el dato que se escribe al vender tiene
 * nombre propio: "Aroma" para un difusor, "Código" para un aro. Sin la
 * 0092 nada de eso se muestra ni se manda, y con ella viaja sólo si
 * cambió: guardar un precio anda igual con las funciones de la 0090 (base
 * vieja, o la 0092 vuelta atrás).
 *
 * El stock no se toca acá: tiene su propia historia (cargar mercadería,
 * devolver al proveedor, ajustar con motivo).
 */

import { useMemo, useState } from 'react'
import { AlertTriangle, Loader2, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStudio } from '@/lib/data-context'
import { guardarProducto, guardarProveedor } from '@/lib/inventario-api'
import type { LetrasPorProveedor, Producto, Proveedor } from '@/lib/types'
import { mediosParaCobrar } from '@/components/pagos/pagos-page'
import {
  BotonPrincipal,
  BotonSecundario,
  Chips,
  ErrorEnLaHoja,
  Hoja,
  inputClass,
  labelClass,
  leerNumero,
  ordenarLetras,
  plata,
} from './comun'

/** Los nombres típicos del dato: un toque los completa. */
const DATOS_TIPICOS = ['Aroma', 'Código']

export function ProductoFormModal({
  producto,
  proveedores,
  letras,
  letrasSinLeer = null,
  onClose,
  onGuardado,
}: {
  producto?: Producto
  proveedores: Proveedor[]
  /** Las listas por letra de todos los proveedores; null = la 0092 no corrió, o no se sabe */
  letras: LetrasPorProveedor | null
  /** Si `letras` es null porque no se pudieron leer, el porqué (ver ProveedorFormModal) */
  letrasSinLeer?: string | null
  onClose: () => void
  onGuardado: () => void
}) {
  const hay0092 = letras !== null
  const noSeSabe = !hay0092 && letrasSinLeer !== null
  const { paymentMethods } = useStudio()
  const medios = useMemo(() => mediosParaCobrar(paymentMethods), [paymentMethods])
  // Precios cargados en un medio que ya no está para el mostrador (dado de
  // baja): se muestran para poder sacarlos, no se ofrecen al vender.
  const otros = Object.keys(producto?.precios ?? {}).filter((c) => !medios.some((m) => m.code === c))

  const [nombre, setNombre] = useState(producto?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(producto?.descripcion ?? '')
  const [proveedorId, setProveedorId] = useState(producto?.proveedorId ?? '')
  const [stockAviso, setStockAviso] = useState(String(producto?.stockAviso ?? 2))
  const [activo, setActivo] = useState(producto?.active ?? true)
  const [precios, setPrecios] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      [...medios.map((m) => m.code), ...otros].map((c) => [
        c,
        producto?.precios[c] !== undefined ? String(producto.precios[c]) : '',
      ])
    )
  )
  const [aromas, setAromas] = useState<string[]>(producto?.aromas ?? [])
  const [aromaNuevo, setAromaNuevo] = useState('')
  const [porLetra, setPorLetra] = useState(producto?.precioPorLetra ?? false)
  const [dato, setDato] = useState(producto?.datoVenta ?? 'Aroma')

  // El proveedor que se crea desde acá. Su id queda guardado: si después el
  // producto no se guarda (un nombre repetido, un precio mal escrito), el
  // reintento usa ese mismo proveedor en vez de chocar con "Ya hay un
  // proveedor que se llama…".
  const [creados, setCreados] = useState<Proveedor[]>([])
  const [nuevoProv, setNuevoProv] = useState<{ nombre: string; pct: string } | null>(null)
  const [creandoProv, setCreandoProv] = useState(false)
  // El error de crear el proveedor va adentro de su recuadro, donde se está
  // mirando: abajo de todo quedaba fuera de la pantalla del teléfono.
  const [errorProv, setErrorProv] = useState<string | null>(null)

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const elegibles = [
    ...proveedores.filter((p) => p.active || p.id === producto?.proveedorId),
    ...creados.filter((c) => !proveedores.some((p) => p.id === c.id)),
  ]

  const agregarAroma = () => {
    const a = aromaNuevo.replace(/\s+/g, ' ').trim()
    if (!a) return
    if (!aromas.some((x) => x.toLowerCase() === a.toLowerCase())) setAromas([...aromas, a])
    setAromaNuevo('')
  }

  const crearProveedor = async () => {
    if (!nuevoProv) return
    const pct = leerNumero(nuevoProv.pct)
    if (!nuevoProv.nombre.trim()) return setErrorProv('Falta el nombre del proveedor.')
    if (pct === null || pct < 0 || pct > 100) {
      return setErrorProv('La parte del estudio tiene que ser un porcentaje entre 0 y 100.')
    }
    setCreandoProv(true)
    setErrorProv(null)
    try {
      const id = await guardarProveedor({
        id: null,
        nombre: nuevoProv.nombre,
        contacto: '',
        notas: '',
        pctEstudio: pct,
        activo: true,
      })
      setCreados((c) => [
        ...c,
        {
          id,
          nombre: nuevoProv.nombre.trim(),
          contacto: '',
          notas: '',
          pctEstudio: pct,
          // Lo que la base le pone a un proveedor nuevo: con la 0092,
          // 'efectivo' por defecto; sin ella rige lo cobrado.
          comisionSobre: hay0092 ? 'efectivo' : 'cobrado',
          active: true,
        },
      ])
      setProveedorId(id)
      setNuevoProv(null)
    } catch (e) {
      setErrorProv(e instanceof Error ? e.message : 'No se pudo crear el proveedor')
    } finally {
      setCreandoProv(false)
    }
  }

  const guardar = async () => {
    if (!nombre.trim()) return setError('Falta el nombre del producto.')
    const aviso = leerNumero(stockAviso)
    if (aviso === null || aviso < 0 || !Number.isInteger(aviso)) {
      return setError('El aviso de stock bajo tiene que ser un número entero, 0 o más.')
    }
    const paraMandar: Record<string, number | null> = {}
    for (const [code, texto] of Object.entries(precios)) {
      if (!texto.trim()) {
        // Vacío borra el precio sólo si había uno: si no, no hay nada que tocar.
        if (producto?.precios[code] !== undefined) paraMandar[code] = null
        continue
      }
      const n = leerNumero(texto)
      const nombreMedio = paymentMethods.find((m) => m.code === code)?.name ?? code
      if (n === null || n <= 0) return setError(`El precio en ${nombreMedio} tiene que ser un número mayor que cero.`)
      paraMandar[code] = n
    }
    // Lo que quedó escrito en el campo y no se agregó, también va.
    const a = aromaNuevo.replace(/\s+/g, ' ').trim()
    const listaAromas = a && !aromas.some((x) => x.toLowerCase() === a.toLowerCase()) ? [...aromas, a] : aromas

    const datoLimpio = dato.replace(/\s+/g, ' ').trim()
    if (hay0092 && (!datoLimpio || datoLimpio.length > 30)) {
      return setError('El dato que se pide al vender necesita un nombre (hasta 30 letras), por ejemplo Aroma o Código.')
    }
    // La misma regla que la base, antes de mandar: con precio fijo y un
    // proveedor que calcula sobre el efectivo, sin ese precio no se podría
    // vender con ningún otro medio.
    const prov = elegibles.find((p) => p.id === proveedorId)
    const quedaConPrecios = Object.entries(precios).some(([, t]) => t.trim() !== '')
    if (
      hay0092 &&
      !porLetra &&
      activo &&
      prov?.comisionSobre === 'efectivo' &&
      quedaConPrecios &&
      !(precios.efectivo ?? '').trim()
    ) {
      return setError(
        `${nombre.trim()} no tiene precio en efectivo, y la parte del estudio de ${prov.nombre} se calcula sobre ese precio.`
      )
    }

    setGuardando(true)
    setError(null)
    try {
      await guardarProducto({
        id: producto?.id ?? null,
        nombre,
        descripcion,
        proveedorId: proveedorId || null,
        activo,
        stockAviso: aviso,
        // Por letra, los precios propios no se tocan: quedan guardados para
        // el día que el producto vuelva al precio fijo.
        // (porLetra sólo puede ser true si la 0092 corrió: viene de la fila.)
        precios: porLetra ? {} : paraMandar,
        aromas: listaAromas,
        ...(hay0092 && porLetra !== (producto?.precioPorLetra ?? false) ? { precioPorLetra: porLetra } : {}),
        ...(hay0092 && datoLimpio !== (producto?.datoVenta ?? 'Aroma') ? { datoVenta: datoLimpio } : {}),
      })
      onGuardado()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el producto')
      setGuardando(false)
    }
  }

  const nombreMedio = (code: string) => paymentMethods.find((m) => m.code === code)?.name ?? code

  // La lista del proveedor elegido, resumida: cuántas letras y de cuánto a
  // cuánto en efectivo.
  const provElegido = elegibles.find((p) => p.id === proveedorId) ?? null
  const letrasProv = proveedorId && letras ? letras[proveedorId] ?? {} : {}
  const ordenLetras = ordenarLetras(Object.keys(letrasProv))
  const efectivos = ordenLetras.map((l) => letrasProv[l].efectivo).filter((n): n is number => n !== undefined)
  const etiquetaSugerencias =
    dato.trim().toLowerCase() === 'aroma' ? 'Aromas que trae' : `Sugerencias de ${dato.trim().toLowerCase() || 'el dato'}`

  return (
    <Hoja
      titulo={producto ? `Editar ${producto.nombre}` : 'Nuevo producto'}
      ocupado={guardando || creandoProv}
      onClose={onClose}
      error={error}
      pie={
        <>
          <BotonSecundario onClick={onClose} disabled={guardando}>
            Cancelar
          </BotonSecundario>
          <BotonPrincipal onClick={guardar} disabled={guardando || creandoProv}>
            {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
            Guardar
          </BotonPrincipal>
        </>
      }
    >
      <div>
        <label className={labelClass}>Nombre *</label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>Proveedor</label>
        {nuevoProv ? (
          <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-2">
            <input
              value={nuevoProv.nombre}
              onChange={(e) => setNuevoProv({ ...nuevoProv, nombre: e.target.value })}
              placeholder="Nombre del proveedor"
              maxLength={80}
              className={inputClass}
            />
            <div className="flex items-center gap-2">
              <input
                value={nuevoProv.pct}
                onChange={(e) => setNuevoProv({ ...nuevoProv, pct: e.target.value })}
                inputMode="decimal"
                className={cn(inputClass, 'w-24')}
              />
              <span className="text-xs text-muted-foreground">
                % para el estudio{hay0092 ? ', sobre el precio de efectivo' : noSeSabe ? '' : ', sobre lo cobrado'}
              </span>
            </div>
            <ErrorEnLaHoja mensaje={errorProv} />
            <div className="flex gap-2">
              <BotonSecundario
                onClick={() => {
                  setNuevoProv(null)
                  setErrorProv(null)
                }}
                disabled={creandoProv}
              >
                Cancelar
              </BotonSecundario>
              <BotonPrincipal onClick={crearProveedor} disabled={creandoProv}>
                {creandoProv && <Loader2 className="w-4 h-4 animate-spin" />}
                Crear proveedor
              </BotonPrincipal>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} className={inputClass}>
              <option value="">Sin proveedor (no se puede vender)</option>
              {elegibles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} · {p.pctEstudio}% estudio{p.active ? '' : ' (dado de baja)'}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setNuevoProv({ nombre: '', pct: '30' })}
              className="shrink-0 px-3 rounded-xl border border-border text-xs font-semibold text-foreground hover:bg-muted flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Nuevo
            </button>
          </div>
        )}
      </div>

      {noSeSabe && (
        <p className="text-xs text-aviso-fuerte bg-aviso-suave rounded-xl px-3 py-2.5 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            Los precios por letra no están disponibles ({letrasSinLeer}).
            {producto?.precioPorLetra && ` ${producto.nombre} se vende por letra.`} Se puede guardar lo demás; de
            dónde sale el precio y el dato que se pide al vender quedan como están. Para cambiarlos, cerrá y volvé
            a abrir.
          </span>
        </p>
      )}

      {hay0092 && (
        <div>
          <label className={labelClass}>De dónde sale el precio</label>
          <div className="grid grid-cols-2 gap-1.5">
            {(
              [
                [false, 'Un precio por medio de pago'],
                [true, 'Por letra, con la lista del proveedor'],
              ] as const
            ).map(([v, t]) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => setPorLetra(v)}
                className={cn(
                  'px-2 py-2 rounded-xl border text-xs font-semibold transition-colors text-left',
                  porLetra === v
                    ? 'border-primary bg-primary/5 text-primary-fuerte'
                    : 'border-border text-muted-foreground hover:border-primary/40'
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {porLetra && !hay0092 ? (
        <p className="rounded-xl bg-muted/50 px-3.5 py-3 text-xs text-muted-foreground">
          El precio sale de la letra de la etiqueta, con la lista del proveedor.
        </p>
      ) : porLetra ? (
        <div className="rounded-xl bg-muted/50 px-3.5 py-3 text-xs text-muted-foreground space-y-1">
          {!proveedorId ? (
            <p>Elegí el proveedor: la lista de letras es suya.</p>
          ) : ordenLetras.length === 0 ? (
            <p>
              {provElegido?.nombre ?? 'Ese proveedor'} todavía no tiene precios por letra. Se cargan en
              Proveedores → editar.
            </p>
          ) : (
            <p>
              Con la lista de {provElegido?.nombre ?? 'el proveedor'}: {ordenLetras.length}{' '}
              {ordenLetras.length === 1 ? 'letra' : 'letras'} ({ordenLetras[0]}
              {ordenLetras.length > 1 && ` a ${ordenLetras[ordenLetras.length - 1]}`})
              {efectivos.length > 0 &&
                `, de ${plata(Math.min(...efectivos))} a ${plata(Math.max(...efectivos))} en efectivo`}
              .
            </p>
          )}
          <p>
            Al vender se elige la letra de la etiqueta y el precio sale solo. Si tenía precios por medio de pago,
            quedan guardados sin usarse.
          </p>
        </div>
      ) : (
        <div>
          <label className={labelClass}>Precio por medio de pago</label>
          <div className="space-y-2">
            {Object.keys(precios).map((code) => (
              <div key={code} className="flex items-center gap-2">
                <span className="text-sm text-foreground w-40 shrink-0 truncate">
                  {nombreMedio(code)}
                  {otros.includes(code) && (
                    <span className="block text-[10px] text-muted-foreground">no está en el mostrador</span>
                  )}
                </span>
                <input
                  value={precios[code]}
                  onChange={(e) => setPrecios({ ...precios, [code]: e.target.value })}
                  inputMode="decimal"
                  placeholder="Sin precio"
                  className={inputClass}
                />
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            Vacío = ese medio no se ofrece al vender. Es el precio final: no se le suma el recargo de la
            tarjeta ni se le resta el descuento del efectivo.
            {hay0092 && provElegido?.comisionSobre === 'efectivo' &&
              ` La parte del estudio de ${provElegido.nombre} sale del precio en efectivo: ese no puede faltar.`}
          </p>
        </div>
      )}

      {hay0092 && (
        <div>
          <label className={labelClass}>Dato que se pide al vender *</label>
          <input value={dato} onChange={(e) => setDato(e.target.value)} maxLength={30} className={inputClass} />
          <div className="mt-1.5">
            <Chips opciones={DATOS_TIPICOS} elegido={dato.trim()} onElegir={setDato} />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Lo escribe quien vende y queda en la venta y en la rendición: el aroma de un difusor, el código de
            un aro.
          </p>
        </div>
      )}

      <div>
        <label className={labelClass}>{etiquetaSugerencias} (opcional)</label>
        {aromas.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {aromas.map((a) => (
              <span
                key={a}
                className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full border border-border text-xs text-foreground"
              >
                {a}
                <button
                  type="button"
                  onClick={() => setAromas(aromas.filter((x) => x !== a))}
                  className="w-5 h-5 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground"
                  aria-label={`Sacar ${a}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={aromaNuevo}
            onChange={(e) => setAromaNuevo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                agregarAroma()
              }
            }}
            maxLength={60}
            placeholder={dato.trim().toLowerCase() === 'aroma' ? 'Ej.: Lavanda' : ''}
            className={inputClass}
          />
          <button
            type="button"
            onClick={agregarAroma}
            className="shrink-0 px-3 rounded-xl border border-border text-xs font-semibold text-foreground hover:bg-muted"
          >
            Agregar
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          Aparecen como sugerencia al vender. Se puede escribir algo que no esté en la lista.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Avisar con stock de</label>
          <input
            value={stockAviso}
            onChange={(e) => setStockAviso(e.target.value)}
            inputMode="numeric"
            className={inputClass}
          />
        </div>
        {producto && (
          <label className="flex items-end gap-2 pb-2.5 text-sm text-foreground">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            Se vende
          </label>
        )}
      </div>

      <div>
        <label className={labelClass}>Descripción (opcional)</label>
        <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={inputClass} />
      </div>

    </Hoja>
  )
}
