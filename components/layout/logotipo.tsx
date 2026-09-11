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
 * archivo: el favicon y los íconos de la PWA, en `app/`.
 */
export function Logotipo({ nombre, className }: { nombre: string; className?: string }) {
  // Una línea por palabra, como en el manual: CASA arriba, FE abajo.
  const lineas = nombre.trim().split(/\s+/).filter(Boolean)
  if (lineas.length === 0) return null
  return (
    // `break-words` porque el nombre lo escribe el estudio: una palabra
    // larga sin espacios se pintaba encima del botón de plegar la sidebar.
    <span className={cn('lockup block break-words', className)} aria-label={nombre}>
      {lineas.map((linea, i) => (
        // La clave es la posición y no la palabra: un nombre con una
        // palabra repetida ("Casa Casa Fe") generaba claves duplicadas.
        <span key={i} className="block">
          {linea}
        </span>
      ))}
    </span>
  )
}

/**
 * La versión para un cuadro chico —sidebar plegada, avatar del portal—,
 * donde el logotipo de dos líneas no se leería.
 *
 * Usa la última palabra del nombre, que es la mitad distintiva: "FE" de
 * Casa Fé. Si esa palabra no entra en el cuadro cae a la inicial, que es
 * lo que el sistema mostraba antes de que existiera este componente:
 * desbordar el cuadro es peor que mostrar una letra.
 */
export function Sello({ nombre, className }: { nombre: string; className?: string }) {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean)
  const ultima = palabras[palabras.length - 1] ?? ''
  const corto = ultima.length <= 3 ? ultima : ultima.charAt(0)
  if (!corto) return null
  return (
    <span
      className={cn(
        'lockup flex items-center justify-center overflow-hidden bg-foreground text-background',
        className
      )}
      aria-label={nombre}
    >
      {corto}
    </span>
  )
}
