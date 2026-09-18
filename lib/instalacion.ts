/**
 * Instalar la app en el teléfono: la detección, en un solo lugar.
 *
 * POR QUÉ ESTO ES UN MÓDULO Y NO UN `useEffect`
 *
 * `beforeinstallprompt` se dispara **una sola vez**, apenas carga la
 * página, y hay que quedarse con el evento porque es el único que sabe
 * abrir el diálogo del sistema. Hasta el 18/09 lo capturaba el efecto del
 * cartel flotante (`install-prompt.tsx`), y alcanzaba porque ese cartel se
 * monta enseguida.
 *
 * Ahora el Perfil de la clienta también ofrece instalar la app, y esa
 * pestaña se monta cuando ella la toca — minutos después, con el evento ya
 * perdido. Con dos `useEffect` escuchando lo mismo, además, los dos se
 * quedarían con el evento y llamar `prompt()` dos veces sobre el mismo
 * tira error.
 *
 * Así que se escucha una vez, al importar el módulo, y el valor queda
 * guardado para quien lo necesite después.
 */

type EventoDeInstalacion = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let guardado: EventoDeInstalacion | null = null
let escuchando = false
const oyentes = new Set<() => void>()

function empezarAEscuchar(): void {
  if (escuchando || typeof window === 'undefined') return
  escuchando = true
  window.addEventListener('beforeinstallprompt', (e) => {
    // Sin el preventDefault, Chrome muestra su propia barra de instalación
    // además de la nuestra.
    e.preventDefault()
    guardado = e as EventoDeInstalacion
    oyentes.forEach((avisar) => avisar())
  })
}

empezarAEscuchar()

/** Ya está agregada al inicio: no hay nada que ofrecer. */
export function yaInstalada(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

/**
 * iPhone y iPad. iPadOS se presenta como Mac, así que se lo distingue por
 * la pantalla táctil.
 *
 * Importa porque **iOS no tiene diálogo de instalación**: hay que dictarle
 * los pasos de Safari (Compartir → Agregar a inicio), y sin la app
 * agregada al inicio iOS tampoco entrega notificaciones push.
 */
export function esIos(): boolean {
  if (typeof window === 'undefined') return false
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

/** Para probar el flujo de iOS desde cualquier dispositivo:
 *  `localStorage.setItem('pwa-debug','ios')`. */
export function forzandoIos(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem('pwa-debug') === 'ios'
  } catch {
    return false
  }
}

export function suscribirse(avisar: () => void): () => void {
  empezarAEscuchar()
  oyentes.add(avisar)
  return () => oyentes.delete(avisar)
}

export function eventoGuardado(): EventoDeInstalacion | null {
  return guardado
}

/**
 * Abre el diálogo del sistema. Devuelve qué contestó la persona, o
 * `'sin-dialogo'` cuando este navegador no lo ofrece — que es el caso de
 * iOS y también de un Chrome donde el evento nunca llegó (ya instalada, o
 * la descartó antes).
 */
export async function instalar(): Promise<'accepted' | 'dismissed' | 'sin-dialogo'> {
  const e = guardado
  if (!e) return 'sin-dialogo'
  await e.prompt()
  const { outcome } = await e.userChoice
  // El evento sirve una sola vez.
  guardado = null
  oyentes.forEach((avisar) => avisar())
  return outcome
}
