import { cn } from '@/lib/utils'

/**
 * El logotipo de Casa Fe, el archivo que mandó la clienta.
 *
 * Hasta acá se dibujaba con Bodoni Moda a partir del nombre cargado en
 * Configuración. Ella pidió que no: su logo está hecho con Bauer Bodoni, que
 * es otra letra, y puestas una al lado de la otra se nota.
 *
 * El PNG viene en un solo color plano (#e1dfdb) sobre transparente, así que
 * NO se usa como imagen sino como MÁSCARA: el archivo aporta la forma y el
 * color lo pone el contexto (`currentColor`). Con eso, un solo archivo sirve
 * para el negro sobre el natural —barra, sidebar, login, portal— y para el
 * natural sobre la foto del hero. Sin pedir dos versiones, y sin que el
 * logotipo quede invisible cuando cambia el fondo, que es exactamente lo que
 * pasaría usándolo como <img>.
 *
 * Alcanza de sobra para lo que el diseño dibuja: el lugar más grande es el
 * hero, donde "CASA" mide 468 px y no crece (el tamaño está fijo en `lg`),
 * contra los 908 px que trae el archivo.
 */
const MARCA = {
  /** CASA arriba, FE abajo, con el interlineado del manual. 908x597. */
  lockup: { src: '/marca/logotipo.png', ancho: 2.66, alto: 1.75 },
  /** Solo FE, para el cuadro chico. 445x265. */
  sello: { src: '/marca/logotipo-fe.png', proporcion: '445 / 265' },
}

/**
 * El logo es de Casa Fe y de nadie más. El sistema está hecho para que otro
 * estudio lo use con su propio nombre, así que si el nombre no es el de ella
 * se vuelve a dibujar con la tipografía de la marca, que es lo que había
 * antes. Mostrarle a otro estudio el logotipo de Casa Fe sería peor que no
 * mostrarle ninguno.
 *
 * Compara sin tildes y sin espacios de más porque el propio estudio lo
 * escribió de las dos maneras: la `0026` decía "Casa Fé" y la `0033` fijó
 * "Casa Fe".
 */
function esCasaFe(nombre: string): boolean {
  return (
    nombre
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ') === 'casa fe'
  )
}

/**
 * El bloque enmascarado. Va como `inline-block` adentro de un contenedor que
 * conserva el `className` del llamador: así el `text-center` del login sigue
 * centrando y el color sigue saliendo de `text-foreground`, sin que ninguna
 * pantalla tenga que cambiar.
 *
 * Se mide en `em` y no en píxeles por la misma razón: el `text-4xl` del login
 * y el `text-xl` de la sidebar siguen decidiendo el tamaño. El factor 2,66
 * sale del archivo —"CASA" ocupa 2,66 veces el cuerpo de la letra—, así que
 * la imagen entra justo donde entraba el texto.
 */
function Enmascarado({ src, style }: { src: string; style: React.CSSProperties }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        verticalAlign: 'top',
        backgroundColor: 'currentColor',
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        ...style,
      }}
    />
  )
}

export function Logotipo({ nombre, className }: { nombre: string; className?: string }) {
  const lineas = nombre.trim().split(/\s+/).filter(Boolean)
  if (lineas.length === 0) return null

  if (esCasaFe(nombre)) {
    return (
      <span className={cn('block leading-none', className)} role="img" aria-label={nombre}>
        <Enmascarado
          src={MARCA.lockup.src}
          style={{ width: `${MARCA.lockup.ancho}em`, height: `${MARCA.lockup.alto}em` }}
        />
      </span>
    )
  }

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
 * Usa "FE", que es la mitad distintiva del nombre y la que el manual recorta
 * cuando el lockup entero no entra. Con otro nombre cae a la última palabra
 * si es corta y a la inicial si no, que es lo que el sistema hacía antes:
 * desbordar el cuadro es peor que mostrar una letra.
 */
export function Sello({ nombre, className }: { nombre: string; className?: string }) {
  const clase = cn(
    'lockup flex items-center justify-center overflow-hidden bg-foreground text-background',
    className
  )

  if (esCasaFe(nombre)) {
    return (
      <span className={clase} role="img" aria-label={nombre}>
        <Enmascarado
          src={MARCA.sello.src}
          style={{ width: '62%', aspectRatio: MARCA.sello.proporcion }}
        />
      </span>
    )
  }

  const palabras = nombre.trim().split(/\s+/).filter(Boolean)
  const ultima = palabras[palabras.length - 1] ?? ''
  const corto = ultima.length <= 3 ? ultima : ultima.charAt(0)
  if (!corto) return null
  return (
    <span className={clase} aria-label={nombre}>
      {corto}
    </span>
  )
}
