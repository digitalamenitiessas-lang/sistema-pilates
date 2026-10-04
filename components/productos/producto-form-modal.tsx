'use client'

/**
 * Alta y edición de un producto: su proveedor, sus precios por medio de
 * pago y los aromas que trae.
 *
 * Los precios son los que da el estudio para cada medio, uno por uno; no
 * se derivan del recargo ni del descuento del medio. Un medio sin precio
 * no se ofrece al vender, y las dos transferencias pueden tener el mismo.
 *
 * El stock no se toca acá: tiene su propia historia (cargar mercadería,
 * devolver al proveedor, ajustar con motivo).
 */

import { useMemo, useState } from 'react'
import { Loader2, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStudio } from '@/lib/data-context'
import { guardarProducto, guardarProveedor } from '@/lib/inventario-api'
import type { Producto, Proveedor } from '@/lib/types'
import { mediosParaCobrar } from '@/components/pagos/pagos-page'
import {
  BotonPrincipal,
  BotonSecundario,
  ErrorEnLaHoja,
  Hoja,
  inputClass,
  labelClass,
  leerNumero,
} from './comun'

export function ProductoFormModal({
  producto,
  proveedores,
  onClose,
  onGuardado,
}: {
  producto?: Producto
  proveedores: Proveedor[]
  onClose: () => void
  onGuardado: () => void
}) {
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
        { id, nombre: nuevoProv.nombre.trim(), contacto: '', notas: '', pctEstudio: pct, active: true },
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
        precios: paraMandar,
        aromas: listaAromas,
      })
      onGuardado()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el producto')
      setGuardando(false)
    }
  }

  const nombreMedio = (code: string) => paymentMethods.find((m) => m.code === code)?.name ?? code

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
              <span className="text-xs text-muted-foreground">% para el estudio, sobre lo cobrado</span>
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
        </p>
      </div>

      <div>
        <label className={labelClass}>Aromas que trae (opcional)</label>
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
            placeholder="Ej.: Lavanda"
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
          Aparecen como sugerencia al vender. Se puede vender un aroma que no esté en la lista.
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
