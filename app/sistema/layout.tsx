import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sistema de Gestión — PilatesStudio',
  description: 'Gestión de alumnos, clases, reservas, membresías y pagos.',
  robots: { index: false },
}

export default function SistemaLayout({ children }: { children: React.ReactNode }) {
  return children
}
