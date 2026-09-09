'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
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
  reportes: ReportesPage,
  configuracion: ConfiguracionPage,
}

function FullScreenLoader({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-3">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

function AppShell() {
  const { session, sessionLoading, profile, profileReady, data, dataError, refresh } = useData()
  const [currentPage, setCurrentPage] = useState<PageKey>('dashboard')
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

  // Los clientes ven su portal, no el sistema de gestión
  if (profile?.role === 'alumno' && data) {
    return (
      <>
        <PortalPage />
        <InstallPrompt />
      </>
    )
  }

  // Con datos en pantalla, un error es de un refresco que no salió: se
  // avisa en una tira y se sigue trabajando con lo que había. La pantalla
  // de error completa queda para cuando no hay nada que mostrar.
  if (!data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 p-6 text-center">
        <p className="text-sm text-destructive">No se pudieron cargar los datos: {dataError}</p>
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
            <p className="text-xs text-destructive min-w-0">
              No se pudieron actualizar los datos: {dataError}. Estás viendo la
              última versión que se pudo cargar.
            </p>
            <button
              onClick={() => refresh()}
              className="shrink-0 text-xs font-semibold text-destructive underline hover:no-underline"
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
