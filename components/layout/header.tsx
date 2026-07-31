'use client'

import { Bell, Search } from 'lucide-react'
import type { PageKey } from './sidebar'

const PAGE_TITLES: Record<PageKey, { title: string; subtitle: string }> = {
  dashboard: { title: 'Inicio', subtitle: 'Vista general del estudio' },
  agenda: { title: 'Agenda', subtitle: 'Clases y horarios semanales' },
  alumnos: { title: 'Alumnos', subtitle: 'Fichas y membresías' },
  planes: { title: 'Planes y Membresías', subtitle: 'Gestión de planes disponibles' },
  reservas: { title: 'Reservas', subtitle: 'Turnos, cancelaciones y lista de espera' },
  pagos: { title: 'Pagos', subtitle: 'Control de cobros e ingresos' },
  configuracion: { title: 'Configuración', subtitle: 'Ajustes del sistema' },
}

interface HeaderProps {
  currentPage: PageKey
  alertCount?: number
}

export function Header({ currentPage, alertCount = 0 }: HeaderProps) {
  const { title, subtitle } = PAGE_TITLES[currentPage]

  return (
    <header className="flex items-center justify-between px-6 py-4 bg-card border-b border-border min-h-[64px] shrink-0">
      <div>
        <h1 className="text-lg font-semibold text-foreground leading-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="hidden md:flex items-center gap-2 px-3 py-2 rounded-lg bg-muted border border-border text-sm text-muted-foreground w-52 cursor-pointer hover:border-primary/40 transition-colors">
          <Search className="w-4 h-4 shrink-0" />
          <span>Buscar alumno...</span>
          <kbd className="ml-auto text-[10px] px-1.5 py-0.5 rounded border border-border bg-card font-mono">⌘K</kbd>
        </div>

        {/* Notifications */}
        <button
          className="relative w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Notificaciones"
        >
          <Bell className="w-5 h-5" />
          {alertCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
              {alertCount > 9 ? '9+' : alertCount}
            </span>
          )}
        </button>

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
