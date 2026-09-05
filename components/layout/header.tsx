'use client'

import { Eye, Menu, Search } from 'lucide-react'
import { useData } from '@/lib/data-context'
import { NotificationsBell } from './notifications-bell'
import type { PageKey } from './sidebar'

const PAGE_TITLES: Record<PageKey, { title: string; subtitle: string }> = {
  dashboard: { title: 'Inicio', subtitle: 'Vista general del estudio' },
  agenda: { title: 'Agenda', subtitle: 'Clases y horarios semanales' },
  alumnos: { title: 'Alumnos', subtitle: 'Fichas y membresías' },
  planes: { title: 'Planes y Membresías', subtitle: 'Gestión de planes disponibles' },
  reservas: { title: 'Reservas', subtitle: 'Turnos, cancelaciones y lista de espera' },
  pagos: { title: 'Pagos', subtitle: 'Control de cobros e ingresos' },
  caja: { title: 'Caja', subtitle: 'Cuentas, movimientos y cierres' },
  configuracion: { title: 'Configuración', subtitle: 'Ajustes del sistema' },
}

interface HeaderProps {
  currentPage: PageKey
  onNavigate: (page: PageKey) => void
  onOpenMobileMenu: () => void
}

export function Header({ currentPage, onNavigate, onOpenMobileMenu }: HeaderProps) {
  const { canWrite } = useData()
  const { title, subtitle } = PAGE_TITLES[currentPage]

  return (
    <header className="flex items-center justify-between gap-2 px-4 md:px-6 py-4 bg-card border-b border-border min-h-[64px] shrink-0">
      <div className="flex items-center gap-2 md:gap-3 min-w-0">
        <button
          onClick={onOpenMobileMenu}
          className="md:hidden shrink-0 w-9 h-9 -ml-1 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Abrir menú"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-foreground leading-tight truncate">{title}</h1>
          <p className="text-sm text-muted-foreground truncate">{subtitle}</p>
        </div>
        {!canWrite && (
          <span
            title="Tu rol puede consultar el sistema, pero no modificar datos."
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted border border-border text-[11px] font-semibold text-muted-foreground shrink-0"
          >
            <Eye className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Solo consulta</span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 md:gap-3 shrink-0">
        {/* Search */}
        <div className="hidden md:flex items-center gap-2 px-3 py-2 rounded-lg bg-muted border border-border text-sm text-muted-foreground w-52 cursor-pointer hover:border-primary/40 transition-colors">
          <Search className="w-4 h-4 shrink-0" />
          <span>Buscar alumno...</span>
          <kbd className="ml-auto text-[10px] px-1.5 py-0.5 rounded border border-border bg-card font-mono">⌘K</kbd>
        </div>

        {/* Notifications */}
        <NotificationsBell onNavigate={onNavigate} />

        {/* Date badge */}
        <div className="hidden sm:flex flex-col items-end">
          <span className="text-xs font-semibold text-foreground">
            {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' })}
          </span>
          <span className="text-[10px] text-muted-foreground capitalize">
            {new Date().toLocaleDateString('es-AR', { year: 'numeric' })}
          </span>
        </div>
      </div>
    </header>
  )
}
