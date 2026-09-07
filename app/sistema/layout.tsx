import type { Metadata } from 'next'
import { nombreDelEstudio } from '@/lib/estudio'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: `Sistema de Gestión — ${await nombreDelEstudio()}`,
    description: 'Gestión de clientas, clases, reservas, membresías y pagos.',
    robots: { index: false },
  }
}

export default function SistemaLayout({ children }: { children: React.ReactNode }) {
  return children
}
