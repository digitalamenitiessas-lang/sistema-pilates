'use client'

// Invitación post-login a instalar la app en el teléfono.
//
// iOS no tiene diálogo nativo de instalación: ahí se muestran los pasos
// (Compartir → Agregar a inicio). En Android/Chrome se usa el evento
// beforeinstallprompt y el diálogo del sistema. La respuesta se recuerda
// en localStorage para no insistir en cada visita.
//
// La detección del evento NO vive acá desde el 18/09: está en
// `lib/instalacion.ts`, porque el Perfil de la clienta también ofrece
// instalar la app y esa pestaña se monta mucho después de que el evento
// se disparó. Acá queda el cartel, que es una decisión de interfaz.

import { useEffect, useState, useSyncExternalStore } from 'react'
import { Share, SquarePlus, Smartphone, X } from 'lucide-react'
import { esIos, eventoGuardado, forzandoIos, instalar, suscribirse, yaInstalada } from '@/lib/instalacion'

const STORAGE_KEY = 'pwa-install-prompt'

/**
 * Los pasos de Safari, que se muestran igual desde el cartel y desde el
 * Perfil. Es lo único que iOS nos deja hacer: no hay diálogo que abrir.
 */
export function PasosIos({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm border border-border max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground">Agregala a tu inicio</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            Desde Safari, seguí estos pasos (te lleva 10 segundos):
          </p>
          <ol className="space-y-3">
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary-fuerte text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
              <p className="text-sm text-foreground">
                Tocá el botón <strong>Compartir</strong>{' '}
                <Share className="w-4 h-4 inline text-primary-fuerte" /> en la barra de abajo del
                navegador.
              </p>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary-fuerte text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
              <p className="text-sm text-foreground">
                Deslizá hacia abajo y elegí <strong>&quot;Agregar a inicio&quot;</strong>{' '}
                <SquarePlus className="w-4 h-4 inline text-primary-fuerte" />.
              </p>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary-fuerte text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
              <p className="text-sm text-foreground">
                Tocá <strong>&quot;Agregar&quot;</strong> arriba a la derecha. Listo: vas a ver el
                ícono del estudio junto a tus apps.
              </p>
            </li>
          </ol>
          <p className="text-xs text-muted-foreground">
            Si estás en otro navegador, abrí esta página en Safari primero.
          </p>
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            ¡Listo!
          </button>
        </div>
      </div>
    </div>
  )
}

/** Si hay un diálogo de instalación esperando, y se entera cuando llega. */
export function useEventoDeInstalacion(): boolean {
  return useSyncExternalStore(
    suscribirse,
    () => eventoGuardado() !== null,
    () => false
  )
}

export function InstallPrompt() {
  const [mode, setMode] = useState<'ask' | 'ios-steps' | null>(null)
  const [ios, setIos] = useState(false)
  const hayDialogo = useEventoDeInstalacion()

  // El service worker, que además es lo que habilita los avisos push.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      // No se traga en silencio: sin service worker no hay push, y hasta
      // el 18/09 eso dejaba el botón de "Activar avisos" girando para
      // siempre. El límite de espera está en `lib/api.ts`; el motivo, acá.
      console.error('[pwa] no se pudo registrar el service worker:', err)
    })
  }, [])

  // A quién se le ofrece el cartel. En iOS hay una espera corta para no
  // tapar la pantalla en el primer segundo.
  useEffect(() => {
    const debugIos = forzandoIos()
    if (!debugIos && yaInstalada()) return
    try {
      if (!debugIos && localStorage.getItem(STORAGE_KEY)) return
    } catch {
      // Sin localStorage —modo privado— se ofrece igual: insistir de más
      // es mejor que no ofrecerlo nunca.
    }
    if (debugIos || esIos()) {
      setIos(true)
      const t = setTimeout(() => setMode('ask'), 1500)
      return () => clearTimeout(t)
    }
  }, [])

  // En Android el cartel aparece cuando llega el evento, no antes.
  useEffect(() => {
    if (!hayDialogo || ios) return
    if (yaInstalada()) return
    try {
      if (localStorage.getItem(STORAGE_KEY)) return
    } catch {
      /* ver arriba */
    }
    setMode('ask')
  }, [hayDialogo, ios])

  const dismiss = (remember: 'dismissed' | 'done') => {
    try {
      localStorage.setItem(STORAGE_KEY, remember)
    } catch {
      /* sin localStorage no se recuerda, y el cartel vuelve la próxima */
    }
    setMode(null)
  }

  const accept = async () => {
    if (ios) {
      setMode('ios-steps')
      return
    }
    const r = await instalar()
    if (r !== 'sin-dialogo') dismiss(r === 'accepted' ? 'done' : 'dismissed')
  }

  if (!mode) return null
  if (mode === 'ios-steps') return <PasosIos onClose={() => dismiss('done')} />

  return (
    <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:max-w-sm z-[70]">
      <div className="bg-card rounded-2xl shadow-2xl border border-border p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
          <Smartphone className="w-5 h-5 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Llevá el estudio en tu celu</p>
          <p className="text-xs text-muted-foreground mt-0.5 mb-3">
            Agregala a tu pantalla de inicio y usala como una app.
          </p>
          <div className="flex gap-2">
            <button
              onClick={accept}
              className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              Sí, agregar
            </button>
            <button
              onClick={() => dismiss('dismissed')}
              className="flex-1 py-2 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors"
            >
              Ahora no
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
