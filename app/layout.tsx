import type { Metadata, Viewport } from 'next'
import { nombreDelEstudio } from '@/lib/estudio'
import { DM_Sans, Playfair_Display } from 'next/font/google'
import './globals.css'

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
})

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
})

// El título es lo que se ve en la pestaña y lo que aparece cuando alguien
// comparte el link por WhatsApp. El nombre sale del sistema y no del
// código. La descripción no enumera el catálogo: la lista la edita el
// estudio y una enumeración escrita acá promete clases que no se dictan.
export async function generateMetadata(): Promise<Metadata> {
  const nombre = await nombreDelEstudio()
  return {
    title: `${nombre} — Estudio de Pilates`,
    description:
      'Clases de Pilates Reformer en grupos reducidos, con seguimiento personalizado.',
    icons: { apple: '/apple-icon.png' },
    appleWebApp: { capable: true, title: nombre, statusBarStyle: 'default' },
  }
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f5ece3',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className="bg-background">
      <body className={`${dmSans.className} ${playfair.variable} antialiased`}>
        {children}
      </body>
    </html>
  )
}
