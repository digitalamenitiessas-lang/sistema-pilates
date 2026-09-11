import { cn } from '@/lib/utils'

/**
 * El logotipo del estudio.
 *
 * Se dibuja con la tipografía de la marca a partir del nombre que el
 * estudio cargó en Configuración, y no como una imagen fija. Tres razones:
 * escala a cualquier tamaño sin pixelarse, hereda el color del contexto
 * (el mismo componente sirve sobre claro y sobre oscuro), y un estudio que
 * se llame de otra manera no ve el logo de Casa Fé.
 *
 * La imagen sí existe, pero solo donde el sistema operativo exige un
 * archivo: el favicon y los íconos de la PWA, en `public/` y `app/`.
 */
export function Logotipo({ nombre, className }: { nombre: string; className?: string }) {
  // Una línea por palabra, como en el manual: CASA arriba, FE abajo.
  const lineas = nombre.trim().split(/\s+/).filter(Boolean)
  if (lineas.length === 0) return null
  return (
    <span className={cn('lockup block', className)} aria-label={nombre}>
      {lineas.map((l) => (
        <span key={l} className="block">
          {l}
        </span>
      ))}
    </span>
  )
}

/**
 * La versión para un cuadro chico —sidebar plegada, avatar del portal—,
 * donde el logotipo de dos líneas no se leería. Usa la última palabra del
 * nombre, que es la mitad distintiva: "FE" de Casa Fé. Con un nombre de una
 * sola palabra usa esa.
 */
export function Sello({ nombre, className }: { nombre: string; className?: string }) {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean)
  const corto = palabras[palabras.length - 1] ?? ''
  return (
    <span
      className={cn(
        'lockup flex items-center justify-center bg-foreground text-background',
        className
      )}
      aria-label={nombre}
    >
      {corto}
    </span>
  )
}
