'use client'

/**
 * El renglón de "instalala en tu celu" para el Perfil de la clienta.
 *
 * El cartel flotante (`install-prompt.tsx`) aparece solo una vez y se
 * puede descartar para siempre. Después de eso no había forma de
 * instalarla desde el sistema: quien tocó "Ahora no" se quedaba sin
 * camino. Acá vive el camino, donde la persona lo va a buscar.
 *
 * Los cuatro estados dicen la verdad en vez de ofrecer un botón que no
 * hace nada, que es lo que pasa cuando el navegador no tiene diálogo:
 *
 *   · ya instalada       → no se ofrece nada, se confirma que está
 *   · iPhone             → los pasos de Safari, que es lo único que iOS deja
 *   · con diálogo        → el botón que lo abre
 *   · sin diálogo        → dónde encontrarlo en el menú del navegador
 */

import { useEffect, useState } from 'react'
import { CheckCircle2, Smartphone } from 'lucide-react'
import { esIos, forzandoIos, instalar, yaInstalada } from '@/lib/instalacion'
import { PasosIos, useEventoDeInstalacion } from './install-prompt'

export function InstalarEnElCelu() {
  const hayDialogo = useEventoDeInstalacion()
  const [pasos, setPasos] = useState(false)
  // `yaInstalada()` y `esIos()` leen el navegador, así que se resuelven
  // después del primer render: en el servidor no existe `window` y
  // decidir el texto con un valor inventado haría parpadear el renglón.
  const [entorno, setEntorno] = useState<{ instalada: boolean; ios: boolean } | null>(null)

  useEffect(() => {
    const debug = forzandoIos()
    setEntorno({ instalada: !debug && yaInstalada(), ios: debug || esIos() })
  }, [])

  if (!entorno) return null

  if (entorno.instalada) {
    return (
      <div className="flex items-center gap-3 px-4 py-3.5">
        <CheckCircle2 className="w-4 h-4 text-exito-fuerte shrink-0" />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">Ya la tenés instalada</span>
          <span className="block text-[11px] text-muted-foreground mt-0.5">
            La estás usando como app, desde tu pantalla de inicio.
          </span>
        </span>
      </div>
    )
  }

  const enIos = entorno.ios
  const detalle = enIos
    ? 'Te mostramos los tres pasos de Safari. Además, en iPhone los avisos sólo llegan con la app agregada al inicio.'
    : hayDialogo
      ? 'Queda como una app, con su ícono, y abre sin la barra del navegador.'
      : 'Buscá "Instalar app" o "Agregar a pantalla de inicio" en el menú de tu navegador.'

  const alTocar = async () => {
    if (enIos) {
      setPasos(true)
      return
    }
    // Si el navegador no tiene diálogo, el renglón ya dice dónde
    // encontrarlo: no se toca nada y no se finge que pasó algo.
    await instalar()
  }

  return (
    <>
      <button
        onClick={alTocar}
        disabled={!enIos && !hayDialogo}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/50 transition-colors disabled:hover:bg-transparent disabled:cursor-default"
      >
        <Smartphone className="w-4 h-4 text-primary-fuerte shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium text-foreground">
            Agregala a tu pantalla de inicio
          </span>
          <span className="block text-[11px] text-muted-foreground mt-0.5">{detalle}</span>
        </span>
      </button>
      {pasos && <PasosIos onClose={() => setPasos(false)} />}
    </>
  )
}
