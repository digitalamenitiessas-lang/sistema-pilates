import type { Metadata, Viewport } from 'next'
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

export const metadata: Metadata = {
  title: 'PilatesStudio — Estudio de Pilates y Movimiento',
  description:
    'Pilates Mat, Reformer, Clínico, Yoga y más. Clases en grupos reducidos con seguimiento personalizado. Probá tu primera clase.',
  icons: { apple: '/apple-icon.png' },
  appleWebApp: {
    capable: true,
    title: 'PilatesStudio',
    statusBarStyle: 'default',
  },
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
