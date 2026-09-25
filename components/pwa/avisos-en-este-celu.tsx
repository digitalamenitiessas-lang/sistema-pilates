'use client'

/**
 * El interruptor de los avisos en este dispositivo.
 *
 * Vivía adentro del panel de la campana (`notifications-bell.tsx`), pegado
 * a la lista de avisos. Sale a su propia pieza porque el portal de la
 * clienta lo necesita en su pestaña de Perfil, que es donde una persona
 * busca "activar notificaciones" — y duplicar la lógica de
 * `enablePush`/`disablePush` en dos lugares es la forma segura de que
 * mañana arreglemos uno y no el otro.
 *
 * Se activa **por dispositivo y no por persona**: la suscripción la guarda
 * el navegador de este teléfono. Quien use el sistema en el celular y en
 * la computadora del mostrador tiene que activarlo en los dos, y eso está
 * dicho en el manual.
 */

import { useEffect, useState } from 'react'
import { BellOff, BellRing, Loader2, Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'
import { pushSupported, getPushSubscription, enablePush, disablePush, probarAvisoEnEsteDispositivo } from '@/lib/api'

type Estado = 'off' | 'on' | 'busy' | 'unsupported'

export function AvisosEnEsteCelu({
  variante = 'panel',
}: {
  /**
   * `panel` es el botón chico del pie de la campana; `fila` es el renglón
   * ancho del Perfil de la clienta, con su explicación abajo.
   */
  variante?: 'panel' | 'fila'
}) {
  const [estado, setEstado] = useState<Estado>('unsupported')
  const [error, setError] = useState<string | null>(null)
  /**
   * La prueba: un aviso que manda el servidor a este dispositivo. Activar
   * los avisos sólo guarda la suscripción; que lleguen depende de la clave
   * del servidor y del servicio del teléfono, y hasta que alguien lo prueba
   * no hay forma de saberlo. El 25/09 no le había llegado ninguno a nadie.
   */
  const [prueba, setPrueba] = useState<{ estado: 'mandando' | 'ok' | 'error'; texto: string } | null>(null)

  const probar = async () => {
    setPrueba({ estado: 'mandando', texto: 'Mandando…' })
    try {
      await probarAvisoEnEsteDispositivo()
      setPrueba({
        estado: 'ok',
        texto: 'Listo: tendría que llegarte en unos segundos. Si no llega, avisale a Matías.',
      })
    } catch (err) {
      setPrueba({ estado: 'error', texto: err instanceof Error ? err.message : 'No se pudo mandar la prueba' })
    }
  }

  const botonPrueba =
    estado === 'on' ? (
      <div className="space-y-1">
        <button
          onClick={probar}
          disabled={prueba?.estado === 'mandando'}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-border bg-card text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-60"
        >
          {prueba?.estado === 'mandando' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <BellRing className="w-3.5 h-3.5" />
          )}
          Mandar un aviso de prueba
        </button>
        {prueba && prueba.estado !== 'mandando' && (
          <p
            className={cn(
              'text-[11px] text-center',
              prueba.estado === 'ok' ? 'text-exito-fuerte' : 'text-destructive-fuerte'
            )}
          >
            {prueba.texto}
          </p>
        )}
      </div>
    ) : null

  useEffect(() => {
    if (!pushSupported()) return
    getPushSubscription()
      .then((sub) => setEstado(sub ? 'on' : 'off'))
      .catch(() => setEstado('off'))
  }, [])

  const alternar = async () => {
    setError(null)
    const previo = estado
    setEstado('busy')
    try {
      if (previo === 'on') {
        await disablePush()
        setEstado('off')
      } else {
        await enablePush()
        setEstado('on')
      }
    } catch (err) {
      setEstado(previo)
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el estado')
    }
  }

  // Un navegador sin push no muestra un botón que no va a funcionar. En
  // iPhone, además, el push sólo existe con la app agregada al inicio: de
  // eso se encarga el renglón de instalación, que va al lado.
  if (estado === 'unsupported') return null

  const Icono = estado === 'busy' ? Loader2 : estado === 'on' ? BellOff : Smartphone
  const texto =
    estado === 'on' ? 'Desactivar avisos en este dispositivo' : 'Activar avisos en este dispositivo'

  if (variante === 'fila') {
    return (
      <div>
        <button
          onClick={alternar}
          disabled={estado === 'busy'}
          className="w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-muted/50 transition-colors disabled:opacity-60"
        >
          <Icono className={cn('w-4 h-4 text-primary-fuerte shrink-0 mt-0.5', estado === 'busy' && 'animate-spin')} />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium text-foreground">{texto}</span>
            <span className="block text-[11px] text-muted-foreground mt-0.5">
              Te avisamos cuando te vence el plan o queda un lugar libre. Se activa en cada
              teléfono por separado.
            </span>
          </span>
        </button>
        {error && <p className="text-[11px] text-destructive-fuerte px-4 pb-3">{error}</p>}
        {botonPrueba && <div className="px-4 pb-3">{botonPrueba}</div>}
      </div>
    )
  }

  return (
    <div className="px-4 py-3 border-t border-border bg-muted/40">
      <button
        onClick={alternar}
        disabled={estado === 'busy'}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-border bg-card text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-60"
      >
        <Icono className={cn('w-3.5 h-3.5', estado === 'busy' && 'animate-spin')} />
        {texto}
      </button>
      {error && <p className="text-[11px] text-destructive-fuerte mt-1.5 text-center">{error}</p>}
      {botonPrueba && <div className="mt-2">{botonPrueba}</div>}
    </div>
  )
}
