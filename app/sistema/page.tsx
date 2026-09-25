'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { CambiarClaveObligatorio } from '@/components/auth/cambiar-clave-obligatorio'
import { Sidebar, type PageKey } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { DashboardPage } from '@/components/dashboard/dashboard-page'
import { AgendaPage } from '@/components/agenda/agenda-page'
import { AlumnosPage } from '@/components/alumnos/alumnos-page'
import { PlanesPage } from '@/components/planes/planes-page'
import { ReservasPage } from '@/components/reservas/reservas-page'
import { PagosPage } from '@/components/pagos/pagos-page'
import { LoginPage } from '@/components/auth/login-page'
import { ConfiguracionPage } from '@/components/configuracion/configuracion-page'
import { PortalPage } from '@/components/portal/portal-page'
import { InstallPrompt } from '@/components/pwa/install-prompt'
import { CajaPage } from '@/components/caja/caja-page'
import { GastosPage } from '@/components/gastos/gastos-page'
import { PersonalPage } from '@/components/personal/personal-page'
import { ReportesPage } from '@/components/reportes/reportes-page'
import { DataProvider, useData } from '@/lib/data-context'

const PAGE_COMPONENTS: Record<PageKey, React.ComponentType<{ onNavigate: (page: PageKey) => void }>> = {
  dashboard: DashboardPage,
  agenda: AgendaPage,
  alumnos: AlumnosPage,
  planes: PlanesPage,
  reservas: ReservasPage,
  pagos: PagosPage,
  caja: CajaPage,
  gastos: GastosPage,
  personal: PersonalPage,
  reportes: ReportesPage,
  configuracion: ConfiguracionPage,
}

function FullScreenLoader({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-3">
      <Loader2 className="w-8 h-8 text-primary-fuerte animate-spin" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

function AppShell() {
  const { session, sessionLoading, profile, profileReady, data, dataError, refresh } = useData()
  /**
   * Con qué pantalla abre: `?p=agenda` entra directo a la agenda.
   *
   * El sistema navega sin tocar la URL —siempre dice `/sistema`—, que
   * para una persona está bien y para todo lo demás no: un link a
   * Reservas no se puede mandar, y un navegador sin manos no puede pedir
   * "la agenda" para capturarla. De ahí nació esto, el 12/09, para las
   * capturas del manual, y quedó marcado como temporal.
   *
   * Deja de serlo el 15/09: abrir una pantalla por su dirección es una
   * función normal de cualquier sistema web, y la usan tanto el script
   * del manual como cualquiera que quiera compartir un link.
   *
   * Se valida contra `PAGE_COMPONENTS` y no contra una lista escrita
   * acá: un `?p=` inventado dejaba la pantalla en blanco, y una lista
   * aparte se desincroniza el día que se agregue un módulo. Así, la
   * pantalla nueva se vuelve enlazable sola.
   *
   * Solo al montar, a propósito: después manda el menú, y releer la URL
   * en cada render pelearía con él.
   */
  const [currentPage, setCurrentPage] = useState<PageKey>(() => {
    if (typeof window === 'undefined') return 'dashboard'
    const p = new URLSearchParams(window.location.search).get('p')
    return p && p in PAGE_COMPONENTS ? (p as PageKey) : 'dashboard'
  })
  const [collapsed, setCollapsed] = useState(false)
  // En mobile el sidebar es un drawer superpuesto; acá vive su apertura
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    // Si el viewport pasa a desktop con el drawer abierto, cerrarlo:
    // en desktop el sidebar vuelve al flujo y el estado quedaría pegado
    const mq = window.matchMedia('(min-width: 768px)')
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setMobileMenuOpen(false)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  if (sessionLoading) return <FullScreenLoader message="Iniciando..." />
  if (!session) return <LoginPage />
  // El loader tapa la pantalla solo cuando no hay nada que mostrar. Si ya
  // hay datos, una recarga se hace por debajo: borrar lo que la persona
  // estaba mirando para volver a poner lo mismo es peor que esperar.
  if (!data && !dataError) return <FullScreenLoader message="Cargando datos del estudio..." />
  // No mostrar ninguna interfaz hasta conocer el rol del usuario
  if (!profileReady && !dataError) return <FullScreenLoader message="Cargando tu perfil..." />

  /**
   * Antes de cualquier pantalla: si la cuenta nació con el documento como
   * contraseña, elegir una propia es lo único que se puede hacer.
   *
   * Va acá y no adentro del portal porque tiene que valer para todos los
   * roles: el día que un acceso de staff se cree igual, el corte ya está.
   * Y va después de `profileReady` para no parpadear antes de saber quién
   * es, pero ANTES del portal y del sistema: si estuviera después, habría
   * un instante en el que la pantalla real ya se dibujó.
   */
  if (session.user?.user_metadata?.debe_cambiar_clave) {
    return (
      <CambiarClaveObligatorio
        // La clienta entra con su documento; el staff, con la temporal que
        // le puso el admin al blanquearla.
        conDocumento={profile?.role === 'alumno'}
        // Recargar es lo más simple y lo más seguro: la sesión vuelve con
        // la metadata nueva y el corte de arriba deja de aplicar. Mutar el
        // usuario en memoria dejaría dos fuentes de verdad.
        onListo={() => window.location.reload()}
        onSalir={() => void supabase.auth.signOut()}
      />
    )
  }

  // Los clientes ven su portal, no el sistema de gestión
  if (profile?.role === 'alumno' && data) {
    return (
      <>
        <PortalPage />
        <InstallPrompt conBarraAbajo />
      </>
    )
  }

  // Con datos en pantalla, un error es de un refresco que no salió: se
  // avisa en una tira y se sigue trabajando con lo que había. La pantalla
  // de error completa queda para cuando no hay nada que mostrar.
  if (!data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 p-6 text-center">
        <p className="text-sm text-destructive-fuerte">No se pudieron cargar los datos: {dataError}</p>
        <button
          onClick={() => refresh()}
          className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90"
        >
          Reintentar
        </button>
      </div>
    )
  }

  const PageComponent = PAGE_COMPONENTS[currentPage]

  return (
    <div className="flex h-screen overflow-hidden bg-background font-sans">
      <Sidebar
        currentPage={currentPage}
        onNavigate={(page) => {
          setCurrentPage(page)
          setMobileMenuOpen(false)
        }}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header
          currentPage={currentPage}
          onNavigate={setCurrentPage}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        {dataError && (
          <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-2 bg-destructive/10 border-b border-destructive/20 shrink-0">
            <p className="text-xs text-destructive-fuerte min-w-0">
              No se pudieron actualizar los datos: {dataError}. Estás viendo la
              última versión que se pudo cargar.
            </p>
            <button
              onClick={() => refresh()}
              className="shrink-0 text-xs font-semibold text-destructive-fuerte underline hover:no-underline"
            >
              Reintentar
            </button>
          </div>
        )}

        <main className="flex-1 overflow-auto">
          <PageComponent onNavigate={setCurrentPage} />
        </main>
      </div>

      <InstallPrompt />
    </div>
  )
}

export default function SistemaApp() {
  return (
    <DataProvider>
      <AppShell />
    </DataProvider>
  )
}
