'use client'

/**
 * Lo que comparten las piezas de Productos: la plata, las fechas, los
 * campos y la hoja de abajo donde viven todos los formularios.
 *
 * Ningún paso del módulo usa `window.confirm` ni `window.prompt`: el
 * navegador de Instagram —por donde entran las clientas— y el panel de
 * vista previa los descartan solos, y el botón parece muerto. Toda
 * confirmación es un paso dentro de la hoja.
 */

import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { VentaProducto } from '@/lib/types'

export const plata = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`

/**
 * El reparto de una venta: la misma cuenta que `reparto_de_venta` en la
 * base (0092), para la vista previa. `base` es lo cobrado (la regla de la
 * 0090) o el precio de efectivo de la misma pieza, ya multiplicado por la
 * cantidad. El redondeo del % queda del lado del estudio y el proveedor
 * se lleva el resto de la base; el recargo del medio, entero al estudio.
 */
export function reparto(cobrado: number, base: number, pct: number): { estudio: number; proveedor: number } {
  const proveedor = base - Math.round(base * pct) / 100
  return { proveedor, estudio: cobrado - proveedor }
}

/** Lo que identifica la pieza vendida: "Lavanda", o "Letra A · AR-0012". */
export function detalleVenta(v: Pick<VentaProducto, 'letra' | 'aroma'>): string {
  return [v.letra && `Letra ${v.letra}`, v.aroma].filter(Boolean).join(' · ')
}

/** Las letras en el orden de la etiqueta: K antes que AA. */
export function ordenarLetras(ls: string[]): string[] {
  return [...ls].sort((a, b) => a.length - b.length || a.localeCompare(b))
}

/** Sobre qué se calculó la parte del estudio de una venta, en palabras. */
export function textoBase(v: Pick<VentaProducto, 'comisionSobre' | 'precioBase' | 'pctEstudio'>): string {
  const prov = Math.round((100 - v.pctEstudio) * 100) / 100
  return v.comisionSobre === 'efectivo'
    ? `${prov}% de ${plata(v.precioBase)} en efectivo`
    : `${prov}% de lo cobrado`
}

/** El `T00:00` evita que un ISO suelto se lea como UTC y muestre el día anterior. */
export const fechaCorta = (iso: string) =>
  new Date(`${iso}T00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })

export const fechaLarga = (iso: string) => new Date(`${iso}T00:00`).toLocaleDateString('es-AR')

const MOMENTO = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  // Sin esto algunos navegadores escriben "07:46 a. m.": el mostrador lee 19:46.
  hourCycle: 'h23',
})

/** Un instante en el reloj del estudio: "04/10 18:32". */
export const momento = (iso: string) => MOMENTO.format(new Date(iso)).replace(',', '')

export const inputClass =
  'w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors'
export const labelClass = 'block text-xs font-semibold text-foreground mb-1.5'

/** Un número escrito a mano, o null si no es un número. Acepta "30.000" y "30000,50". */
export function leerNumero(texto: string): number | null {
  const limpio = texto.trim().replace(/\$/g, '').replace(/\s/g, '')
  if (!limpio) return null
  // "30.000" es treinta mil, no treinta: el punto de miles del castellano.
  const normal = /,/.test(limpio)
    ? limpio.replace(/\./g, '').replace(',', '.')
    : /^\d{1,3}(\.\d{3})+$/.test(limpio)
      ? limpio.replace(/\./g, '')
      : limpio
  const n = Number(normal)
  return Number.isFinite(n) ? n : null
}

/**
 * La hoja: sube desde abajo en el celular y es un cuadro en la compu. No
 * se cierra mientras guarda —un toque afuera en ese momento dejaba la
 * duda de si la venta se hizo—.
 *
 * El error y la nota van en el pie, pegados a los botones, y no al final
 * del cuerpo: en un teléfono el formulario de venta es más alto que la
 * pantalla, y un error dibujado abajo de todo quedaba fuera de la vista.
 * Tocar "Cobrar", que la base dijera que no, y ver la hoja igual que
 * antes: el botón parecía muerto y se podía cerrar creyendo que se cobró.
 */
export function Hoja({
  titulo,
  subtitulo,
  ocupado,
  onClose,
  children,
  pie,
  error,
  nota,
}: {
  titulo: string
  subtitulo?: React.ReactNode
  ocupado?: boolean
  onClose: () => void
  children: React.ReactNode
  pie?: React.ReactNode
  /** El error de la última acción: va arriba de los botones, siempre a la vista */
  error?: string | null
  /** Una pista corta junto a los botones (qué falta para poder apretar) */
  nota?: React.ReactNode
}) {
  const cerrar = () => {
    if (!ocupado) onClose()
  }
  return (
    <div
      className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-sm flex items-end sm:items-center justify-center"
      onClick={cerrar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl border border-border max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-foreground">{titulo}</h2>
            {subtitulo && <div className="text-xs text-muted-foreground mt-0.5">{subtitulo}</div>}
          </div>
          <button
            onClick={cerrar}
            disabled={ocupado}
            className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground shrink-0 disabled:opacity-40"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4 overflow-y-auto">{children}</div>
        {(pie || error || nota) && (
          <div className="px-5 py-4 border-t border-border shrink-0 space-y-2.5">
            <ErrorEnLaHoja mensaje={error ?? null} />
            {nota && <div className="text-[11px] text-muted-foreground">{nota}</div>}
            {pie && <div className="flex gap-2">{pie}</div>}
          </div>
        )}
      </div>
    </div>
  )
}

export function ErrorEnLaHoja({ mensaje }: { mensaje: string | null }) {
  if (!mensaje) return null
  return (
    <p className="text-xs text-destructive-fuerte bg-destructive/10 rounded-xl px-3 py-2" role="alert">
      {mensaje}
    </p>
  )
}

export function BotonSecundario({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted disabled:opacity-40"
    >
      {children}
    </button>
  )
}

export function BotonPrincipal({
  children,
  onClick,
  disabled,
  peligro,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  /** Para lo que deshace: anular una venta o un pago */
  peligro?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2',
        peligro ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground'
      )}
    >
      {children}
    </button>
  )
}

/** Chips tocables para completar un campo de texto con un valor típico. */
export function Chips({
  opciones,
  onElegir,
  elegido,
}: {
  opciones: string[]
  onElegir: (v: string) => void
  elegido?: string
}) {
  if (opciones.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {opciones.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onElegir(o)}
          className={cn(
            'px-2.5 py-1 rounded-full border text-xs transition-colors',
            elegido === o
              ? 'border-primary bg-primary/10 text-primary-fuerte font-semibold'
              : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
          )}
        >
          {o}
        </button>
      ))}
    </div>
  )
}
