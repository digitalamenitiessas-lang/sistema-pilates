'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bell, BellRing, BellOff, CreditCard, UserPlus, CalendarClock, AlertTriangle,
  Loader2, Smartphone, RefreshCw, RefreshCwOff, Wallet, Scale, Coins,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useData } from '@/lib/data-context'
import {
  fetchNotifications,
  markNotificationsRead,
  pushSupported,
  getPushSubscription,
  enablePush,
  disablePush,
} from '@/lib/api'
import type { AppNotification, NotificationType } from '@/lib/types'
import type { PageKey } from './sidebar'

/** Cómo se dibuja un aviso: icono, color de la pastilla y a dónde lleva. */
interface EstiloAviso {
  Icon: React.ComponentType<{ className?: string }>
  color: string
  page: PageKey
}

/**
 * El genérico: lo que se muestra cuando el tipo no se reconoce. Existe
 * porque antes esto eran tres mapas sueltos y un tipo ausente devolvía
 * `undefined` en los tres. El icono `undefined` no rompía el aviso: tiraba
 * el árbol de React, o sea la campana, el header y la pantalla entera, y
 * como no hay error boundary había que recargar — y volvía a explotar al
 * primer clic, porque la fila seguía ahí.
 *
 * La base admite tipos que esta versión del código puede no conocer: se
 * migra a mano y el front se despliega aparte. No reconocer uno tiene que
 * ser aburrido, no fatal.
 */
const GENERICO: EstiloAviso = {
  Icon: Bell,
  color: 'bg-muted text-muted-foreground',
  page: 'dashboard',
}

/**
 * Un estilo por tipo conocido. Sigue declarado contra `NotificationType`
 * para que el compilador avise si se suma un tipo a la unión y se olvida el
 * estilo — pero ahora olvidarlo cuesta un icono feo, no la campana.
 */
const ESTILOS: Record<NotificationType, EstiloAviso> = {
  pago_acreditado:      { Icon: CreditCard,    color: 'bg-exito-suave text-exito-fuerte',             page: 'pagos' },
  nuevo_alumno:         { Icon: UserPlus,      color: 'bg-primary/10 text-primary-fuerte',                   page: 'alumnos' },
  membresia_por_vencer: { Icon: CalendarClock, color: 'bg-aviso-suave text-aviso-fuerte',             page: 'alumnos' },
  membresia_vencida:    { Icon: AlertTriangle, color: 'bg-destructive-suave text-destructive-fuerte', page: 'alumnos' },
  deuda_vencida:        { Icon: AlertTriangle, color: 'bg-destructive-suave text-destructive-fuerte', page: 'pagos' },
  membresia_renovada:   { Icon: RefreshCw,     color: 'bg-exito-suave text-exito-fuerte',             page: 'alumnos' },
  caja_sin_cerrar:      { Icon: Wallet,        color: 'bg-aviso-suave text-aviso-fuerte',             page: 'caja' },
  caja_diferencia:      { Icon: Scale,         color: 'bg-destructive-suave text-destructive-fuerte', page: 'caja' },
  saldo_sin_imputar:    { Icon: Coins,         color: 'bg-aviso-suave text-aviso-fuerte',             page: 'caja' },
  // El par de RefreshCw: la renovación que no fue. Lleva a Planes y no a
  // Clientes porque lo que hay que arreglar es el plan apagado, no la ficha.
  // Aviso y no destructive: no se rompió nada, hay algo mal configurado.
  renovacion_omitida:   { Icon: RefreshCwOff,  color: 'bg-aviso-suave text-aviso-fuerte',             page: 'planes' },
}

/**
 * Resuelve el estilo de un aviso sin devolver nunca `undefined`: el tipo
 * exacto, y si no está, el genérico — que si el aviso apunta a un cliente
 * lo lleva a su listado, que es más útil que Inicio.
 */
function estiloDeAviso(n: AppNotification): EstiloAviso {
  // `renovacion_omitida` tiene dos usos con destinos distintos, y el
  // discriminador es si el aviso apunta a una cuota. Sin cuota es el plan
  // desactivado que no se pudo renovar, y lo que hay que arreglar está en
  // Planes. Con cuota es el aviso de la 0041 —el pago entró y el período
  // no se creó— y ahí lo que hay que hacer es asignarle el plan a mano,
  // que se hace desde su ficha.
  if (n.type === 'renovacion_omitida' && n.paymentId) {
    return { ...ESTILOS.renovacion_omitida, page: 'alumnos' }
  }
  // El índice es texto que viene de la base, no la unión: puede no estar.
  const propio: EstiloAviso | undefined = ESTILOS[n.type as NotificationType]
  if (propio) return propio
  return n.studentId ? { ...GENERICO, page: 'alumnos' } : GENERICO
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'recién'
  if (mins < 60) return `hace ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'ayer'
  if (days < 30) return `hace ${days} días`
  return new Date(iso).toLocaleDateString('es-AR')
}

export function NotificationsBell({ onNavigate }: { onNavigate?: (page: PageKey) => void }) {
  const { session } = useData()
  const userId = session?.user.id
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState(true)
  // Push: 'off' | 'on' | 'busy' | 'unsupported'
  const [pushState, setPushState] = useState<'off' | 'on' | 'busy' | 'unsupported'>('unsupported')
  const [pushError, setPushError] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pushSupported()) return
    getPushSubscription()
      .then((sub) => setPushState(sub ? 'on' : 'off'))
      .catch(() => setPushState('off'))
  }, [])

  const togglePush = async () => {
    setPushError(null)
    const prev = pushState
    setPushState('busy')
    try {
      if (prev === 'on') {
        await disablePush()
        setPushState('off')
      } else {
        await enablePush()
        setPushState('on')
      }
    } catch (err) {
      setPushState(prev)
      setPushError(err instanceof Error ? err.message : 'No se pudo cambiar el estado')
    }
  }

  const reload = useCallback(async () => {
    if (!userId) return
    try {
      setItems(await fetchNotifications(userId))
      setAvailable(true)
    } catch {
      // tabla inexistente (migración 0007 pendiente): campana muda
      setAvailable(false)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    reload()
    // Realtime: un insert en notifications refresca la campana al instante
    const channel = supabase
      .channel('notifications-bell')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        () => reload()
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [reload])

  // Cerrar al clickear afuera
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const unread = items.filter((n) => !n.read)

  const toggle = () => {
    const willOpen = !open
    setOpen(willOpen)
    if (willOpen && userId && unread.length > 0) {
      // Marcar leídas al abrir; el resaltado de esta tanda se mantiene
      // hasta el próximo cierre para que se vea qué era nuevo.
      markNotificationsRead(userId, unread.map((n) => n.id)).catch(() => {})
    }
  }

  const close = () => {
    setOpen(false)
    setItems((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  if (!available) return null

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={toggle}
        className="relative w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        aria-label="Notificaciones"
        aria-expanded={open}
      >
        {unread.length > 0 ? <BellRing className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
        {unread.length > 0 && (
          <span className="absolute top-1 right-1 min-w-4 h-4 px-0.5 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:top-11 sm:right-0 z-50 w-auto sm:w-96 bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-bold text-foreground">Notificaciones</h3>
            {items.length > 0 && (
              <span className="text-[11px] text-muted-foreground">
                {unread.length > 0 ? `${unread.length} nueva${unread.length !== 1 ? 's' : ''}` : 'al día'}
              </span>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-muted-foreground">
                <Bell className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">Sin novedades por ahora</p>
              </div>
            ) : (
              items.map((n) => {
                const { Icon, color, page } = estiloDeAviso(n)
                return (
                  <button
                    key={n.id}
                    onClick={() => {
                      close()
                      onNavigate?.(page)
                    }}
                    className={cn(
                      'w-full flex items-start gap-3 px-4 py-3 text-left border-b border-border last:border-b-0 hover:bg-muted/60 transition-colors',
                      !n.read && 'bg-primary/[0.04]'
                    )}
                  >
                    <span
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                        color
                      )}
                    >
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className={cn('text-sm text-foreground truncate', !n.read && 'font-semibold')}>
                          {n.title}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {relativeTime(n.createdAt)}
                        </span>
                      </span>
                      <span className="block text-xs text-muted-foreground mt-0.5">{n.body}</span>
                    </span>
                    {!n.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" aria-hidden="true" />}
                  </button>
                )
              })
            )}
          </div>

          {pushState !== 'unsupported' && (
            <div className="px-4 py-3 border-t border-border bg-muted/40">
              <button
                onClick={togglePush}
                disabled={pushState === 'busy'}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-border bg-card text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-60"
              >
                {pushState === 'busy' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : pushState === 'on' ? (
                  <BellOff className="w-3.5 h-3.5" />
                ) : (
                  <Smartphone className="w-3.5 h-3.5" />
                )}
                {pushState === 'on'
                  ? 'Desactivar avisos en este dispositivo'
                  : 'Activar avisos en este dispositivo'}
              </button>
              {pushError && <p className="text-[11px] text-destructive-fuerte mt-1.5 text-center">{pushError}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
