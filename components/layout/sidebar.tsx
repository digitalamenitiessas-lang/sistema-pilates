'use client'

import {
  LayoutDashboard,
  CalendarDays,
  Users,
  BookOpen,
  CreditCard,
  ClipboardList,
  Settings,
  LogOut,
  ChevronLeft,
  Menu,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useData } from '@/lib/data-context'
import { initials } from '@/lib/api'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  recepcion: 'Recepción',
  profesor: 'Profesor/a',
  alumno: 'Alumno/a',
}

export type PageKey =
  | 'dashboard'
  | 'agenda'
  | 'alumnos'
  | 'planes'
  | 'reservas'
  | 'pagos'
  | 'configuracion'

interface NavItem {
  key: PageKey
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Inicio', icon: LayoutDashboard },
  { key: 'agenda', label: 'Agenda', icon: CalendarDays },
  { key: 'alumnos', label: 'Alumnos', icon: Users },
  { key: 'planes', label: 'Planes', icon: BookOpen },
  { key: 'reservas', label: 'Reservas', icon: ClipboardList },
  { key: 'pagos', label: 'Pagos', icon: CreditCard },
]

interface SidebarProps {
  currentPage: PageKey
  onNavigate: (page: PageKey) => void
  collapsed: boolean
  onToggleCollapse: () => void
  /** En mobile el sidebar es un drawer; esto controla si está abierto */
  mobileOpen: boolean
  onMobileClose: () => void
}

export function Sidebar({
  currentPage,
  onNavigate,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onMobileClose,
}: SidebarProps) {
  const { profile, canWrite, signOut } = useData()
  // El drawer mobile siempre se muestra expandido; el colapso es cosa de desktop
  const showLabels = !collapsed || mobileOpen
  // El profesor no ve datos económicos ni configuración (rol solo consulta)
  const navItems = NAV_ITEMS.filter((item) => item.key !== 'pagos' || canWrite)

  return (
    <>
      {/* Backdrop mobile: tap afuera cierra el drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          'flex flex-col bg-sidebar border-r border-sidebar-border',
          // Mobile: drawer fijo off-canvas que se desliza desde la izquierda
          'fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] transition-[transform,width] duration-300',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          // Desktop: vuelve al flujo del layout, igual que siempre
          'md:static md:h-full md:translate-x-0 md:max-w-none',
          collapsed ? 'md:w-16' : 'md:w-60'
        )}
      >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border min-h-[64px]">
        {showLabels && (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <span className="text-primary-foreground font-serif font-bold text-sm">P</span>
            </div>
            <div className="min-w-0">
              <p className="font-serif font-semibold text-foreground text-sm leading-tight truncate">PilatesStudio</p>
              <p className="text-[10px] text-muted-foreground truncate">Sistema de Gestión</p>
            </div>
          </div>
        )}
        {!showLabels && (
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center mx-auto">
            <span className="text-primary-foreground font-serif font-bold text-sm">P</span>
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className="shrink-0 w-7 h-7 rounded-md hover:bg-sidebar-accent hidden md:flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          aria-label={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
        >
          {collapsed ? <Menu className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
        <button
          onClick={onMobileClose}
          className="shrink-0 w-7 h-7 rounded-md hover:bg-sidebar-accent flex md:hidden items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Cerrar menú"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Role badge */}
      {showLabels && profile && (
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/8">
            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <span className="text-primary font-semibold text-xs">{initials(profile.fullName)}</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">
                {ROLE_LABELS[profile.role] ?? profile.role}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">{profile.email}</p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto" aria-label="Navegación principal">
        {navItems.map(({ key, label, icon: Icon }) => {
          const isActive = currentPage === key
          return (
            <button
              key={key}
              onClick={() => onNavigate(key)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                !showLabels && 'justify-center',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground'
              )}
              title={!showLabels ? label : undefined}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className={cn('shrink-0', !showLabels ? 'w-5 h-5' : 'w-4 h-4')} />
              {showLabels && <span>{label}</span>}
            </button>
          )
        })}
      </nav>

      {/* Bottom actions */}
      <div className="px-2 py-3 border-t border-sidebar-border space-y-0.5">
        {canWrite && (
        <button
          onClick={() => onNavigate('configuracion')}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors',
            !showLabels && 'justify-center'
          )}
          title={!showLabels ? 'Configuración' : undefined}
        >
          <Settings className={cn('shrink-0', !showLabels ? 'w-5 h-5' : 'w-4 h-4')} />
          {showLabels && <span>Configuración</span>}
        </button>
        )}
        <button
          onClick={() => signOut()}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors',
            !showLabels && 'justify-center'
          )}
          title={!showLabels ? 'Cerrar sesión' : undefined}
        >
          <LogOut className={cn('shrink-0', !showLabels ? 'w-5 h-5' : 'w-4 h-4')} />
          {showLabels && <span>Cerrar sesión</span>}
        </button>
      </div>
      </aside>
    </>
  )
}
