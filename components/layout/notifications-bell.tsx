'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bell, BellRing, CreditCard, UserPlus, CalendarClock, AlertTriangle,
  Loader2, RefreshCw, RefreshCwOff, Wallet, Scale, Coins,
  CalendarCheck, CalendarOff, UserCheck,
  Tag, ArrowLeft, Check, CheckCheck, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useData } from '@/lib/data-context'
import { fetchNotifications, markNotificationsRead, markNotificationUnread } from '@/lib/api'
import { AvisosEnEsteCelu } from '@/components/pwa/avisos-en-este-celu'
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
  // Lleva a Agenda y no a Clientes: lo que hay que hacer con un turno
  // liberado es decidir a quién dárselo, y eso se ve sobre la grilla.
  turno_liberado:       { Icon: CalendarClock, color: 'bg-aviso-suave text-aviso-fuerte',             page: 'agenda' },
  // Los cinco de la clienta (0052). El `page` casi no se usa: los lee
  // desde el portal, donde la campana va sin `onNavigate` porque sus
  // destinos son pantallas del sistema que el portal no tiene.
  reserva_confirmada:     { Icon: CalendarCheck, color: 'bg-exito-suave text-exito-fuerte',     page: 'reservas' },
  clase_recordatorio:     { Icon: CalendarClock, color: 'bg-primary/10 text-primary-fuerte',    page: 'reservas' },
  clase_suspendida:       { Icon: CalendarOff,   color: 'bg-destructive-suave text-destructive-fuerte', page: 'agenda' },
  clase_cambio_profesora: { Icon: UserCheck,     color: 'bg-info-suave text-info-fuerte',       page: 'agenda' },
  lugar_liberado:         { Icon: CalendarCheck, color: 'bg-aviso-suave text-aviso-fuerte',     page: 'reservas' },
  // La promoción anunciada (0080). Lleva a Pagos porque lo que hace con
  // ella es pagar: el descuento se aplica al cobrar la cuota, no antes.
  promocion:              { Icon: Tag,           color: 'bg-exito-suave text-exito-fuerte',     page: 'pagos' },
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

/** Cómo se nombra la pantalla a la que lleva un aviso, para el botón "Ir a". */
const NOMBRE_DE_PANTALLA: Partial<Record<PageKey, string>> = {
  dashboard: 'Inicio',
  agenda: 'Agenda',
  alumnos: 'Clientes',
  planes: 'Planes',
  reservas: 'Reservas',
  pagos: 'Pagos',
  productos: 'Productos',
  caja: 'Caja',
  gastos: 'Gastos',
  personal: 'Personal',
  reportes: 'Reportes',
  configuracion: 'Configuración',
}

/** La fecha entera, para el detalle: "lun 28/09 · 10:15". */
function fechaCompleta(iso: string): string {
  const d = new Date(iso)
  const dia = d.toLocaleDateString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  })
  const hora = d.toLocaleTimeString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return `${dia} · ${hora}`
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

export function NotificationsBell({
  onNavigate,
  sinInterruptor = false,
}: {
  onNavigate?: (page: PageKey) => void
  /**
   * El portal de la clienta tiene el interruptor de avisos en su pestaña
   * de Perfil, que es donde una persona lo busca. Ofrecerlo también acá
   * serían dos lugares para el mismo switch. En el sistema de gestión, en
   * cambio, no hay Perfil: ahí la campana sigue siendo el único lugar.
   */
  sinInterruptor?: boolean
}) {
  const { session } = useData()
  const userId = session?.user.id
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState(true)
  // El aviso abierto en detalle, o null para la lista.
  const [abierta, setAbierta] = useState<AppNotification | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

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

  // Hasta el 28/09 abrir la campana marcaba todo como leído, así que un
  // aviso que no se alcanzaba a mirar quedaba perdido entre los viejos.
  // Ahora se marca al abrir cada uno, o todos juntos con el botón.
  const toggle = () => {
    setOpen(!open)
    setAbierta(null)
  }

  const close = () => {
    setOpen(false)
    setAbierta(null)
  }

  const marcarLeidas = (ids: string[]) => {
    if (!userId || ids.length === 0) return
    setItems((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)))
    // Si la base no lo guarda, la próxima carga lo vuelve a mostrar sin leer:
    // mejor eso que un aviso que se da por leído y no lo está.
    markNotificationsRead(userId, ids).catch(() => reload())
  }

  const marcarNoLeida = (n: AppNotification) => {
    if (!userId) return
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: false } : x)))
    setAbierta(null)
    markNotificationUnread(userId, n.id).catch(() => reload())
  }

  const abrir = (n: AppNotification) => {
    setAbierta(n)
    if (!n.read) marcarLeidas([n.id])
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
          {abierta ? (
            (() => {
              const { Icon, color, page } = estiloDeAviso(abierta)
              const destino = onNavigate ? NOMBRE_DE_PANTALLA[page] : undefined
              return (
                <div>
                  <div className="flex items-center justify-between gap-2 px-2 py-2 border-b border-border">
                    <button
                      onClick={() => setAbierta(null)}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> Volver
                    </button>
                    <button
                      onClick={() => marcarNoLeida(abierta)}
                      className="px-2 py-1.5 rounded-lg text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      Marcar como no leída
                    </button>
                  </div>
                  <div className="px-4 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
                    <div className="flex items-start gap-3">
                      <span className={cn('w-9 h-9 rounded-full flex items-center justify-center shrink-0', color)}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground">{abierta.title}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{fechaCompleta(abierta.createdAt)}</p>
                      </div>
                    </div>
                    <p className="text-sm text-foreground whitespace-pre-line">{abierta.body}</p>
                    {destino && (
                      <button
                        onClick={() => {
                          close()
                          onNavigate?.(page)
                        }}
                        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90"
                      >
                        Ir a {destino} <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })()
          ) : (
          <>
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
            <h3 className="text-sm font-bold text-foreground">Notificaciones</h3>
            {unread.length > 0 ? (
              <button
                onClick={() => marcarLeidas(unread.map((n) => n.id))}
                className="flex items-center gap-1 text-[11px] font-semibold text-primary-fuerte hover:underline"
              >
                <CheckCheck className="w-3.5 h-3.5" /> Marcar todas como leídas
              </button>
            ) : (
              items.length > 0 && <span className="text-[11px] text-muted-foreground">al día</span>
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
                const { Icon, color } = estiloDeAviso(n)
                return (
                  <div
                    key={n.id}
                    className={cn(
                      'flex items-start border-b border-border last:border-b-0',
                      !n.read && 'bg-primary/[0.04]'
                    )}
                  >
                    <button
                      onClick={() => abrir(n)}
                      className="flex-1 min-w-0 flex items-start gap-3 pl-4 pr-2 py-3 text-left hover:bg-muted/60 transition-colors"
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
                        <span className="block text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</span>
                      </span>
                    </button>
                    {/* Marcarla sin abrirla. Va aparte del botón de la fila
                        para que tocar el tilde no abra el detalle. */}
                    {!n.read ? (
                      <button
                        onClick={() => marcarLeidas([n.id])}
                        className="shrink-0 w-9 h-9 mt-2 mr-2 rounded-lg flex items-center justify-center text-primary-fuerte hover:bg-muted"
                        aria-label={`Marcar como leída: ${n.title}`}
                        title="Marcar como leída"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    ) : (
                      <span className="shrink-0 w-9 mr-2" aria-hidden="true" />
                    )}
                  </div>
                )
              })
            )}
          </div>
          </>
          )}

          {/* El interruptor es el mismo que usa el Perfil de la clienta
              (`avisos-en-este-celu.tsx`): una sola lógica de push, dos
              lugares donde se prende. */}
          {!sinInterruptor && <AvisosEnEsteCelu variante="panel" />}
        </div>
      )}
    </div>
  )
}
