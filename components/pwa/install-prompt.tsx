'use client'

import { useEffect, useState } from 'react'
import { Share, SquarePlus, Smartphone, X } from 'lucide-react'

// Invitación post-login a instalar la app en el teléfono.
// iOS no tiene prompt nativo de instalación: ahí mostramos los pasos
// (Compartir → Agregar a inicio). En Android/Chrome usamos el evento
// beforeinstallprompt y el diálogo del sistema. La respuesta se
// recuerda en localStorage para no insistir en cada visita.

const STORAGE_KEY = 'pwa-install-prompt'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function isIos(): boolean {
  // iPadOS se presenta como Mac, pero con pantalla táctil
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export function InstallPrompt() {
  const [mode, setMode] = useState<'ask' | 'ios-steps' | null>(null)
  const [ios, setIos] = useState(false)
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    // Preview manual: localStorage.setItem('pwa-debug','ios') fuerza el
    // flujo de iOS desde cualquier dispositivo (para probar/demostrar).
    const debugIos = localStorage.getItem('pwa-debug') === 'ios'
    if (!debugIos && (isStandalone() || localStorage.getItem(STORAGE_KEY))) return

    if (debugIos || isIos()) {
      setIos(true)
      const t = setTimeout(() => setMode('ask'), 1500)
      return () => clearTimeout(t)
    }

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setMode('ask')
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  const dismiss = (remember: 'dismissed' | 'done') => {
    localStorage.setItem(STORAGE_KEY, remember)
    setMode(null)
  }

  const accept = async () => {
    if (ios) {
      setMode('ios-steps')
      return
    }
    if (deferred) {
      await deferred.prompt()
      const { outcome } = await deferred.userChoice
      dismiss(outcome === 'accepted' ? 'done' : 'dismissed')
    }
  }

  if (!mode) return null

  if (mode === 'ios-steps') {
    return (
      <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm">
        <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm border border-border max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="text-base font-bold text-foreground">Agregala a tu inicio</h2>
            <button
              onClick={() => dismiss('done')}
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
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                <p className="text-sm text-foreground">
                  Tocá el botón <strong>Compartir</strong>{' '}
                  <Share className="w-4 h-4 inline text-primary" /> en la barra de abajo del
                  navegador.
                </p>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                <p className="text-sm text-foreground">
                  Deslizá hacia abajo y elegí <strong>&quot;Agregar a inicio&quot;</strong>{' '}
                  <SquarePlus className="w-4 h-4 inline text-primary" />.
                </p>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                <p className="text-sm text-foreground">
                  Tocá <strong>&quot;Agregar&quot;</strong> arriba a la derecha. Listo: vas a ver
                  el ícono de PilatesStudio junto a tus apps.
                </p>
              </li>
            </ol>
            <p className="text-xs text-muted-foreground">
              Si estás en otro navegador, abrí esta página en Safari primero.
            </p>
            <button
              onClick={() => dismiss('done')}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              ¡Listo!
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:max-w-sm z-[70]">
      <div className="bg-card rounded-2xl shadow-2xl border border-border p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
          <Smartphone className="w-5 h-5 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Llevá PilatesStudio en tu celu</p>
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
