import type { Metadata, Viewport } from 'next'
import { nombreDelEstudio } from '@/lib/estudio'
import { Bodoni_Moda, Montserrat } from 'next/font/google'
import './globals.css'

// Las dos de la marca. Montserrat es la de la guía tal cual; Bodoni Moda
// reemplaza a Bauer Bodoni, que es comercial y no se puede servir como
// webfont sin licencia — es el mismo Bodoni, mismo didone.
const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
})

// El eje `opsz` es lo que separa un Bodoni de texto de uno de titular: en 96
// las astas finas se afinan hasta el pelo, que es el gesto del mockup.
const bodoni = Bodoni_Moda({
  subsets: ['latin'],
  axes: ['opsz'],
  variable: '--font-bodoni',
})

// El título es lo que se ve en la pestaña y lo que aparece cuando alguien
// comparte el link por WhatsApp. El nombre sale del sistema y no del
// código. La descripción no enumera el catálogo: la lista la edita el
// estudio y una enumeración escrita acá promete clases que no se dictan.
//
// Sin `icons` a propósito: declararlo acá PISA los archivos de convención
// de Next (`app/icon.png`, `app/apple-icon.png`). Cuando esto decía
// `icons: { apple: ... }`, el <head> salía con el apple-touch-icon y sin
// ningún <link rel="icon">: el navegador no tenía favicon que mostrar.
export async function generateMetadata(): Promise<Metadata> {
  const nombre = await nombreDelEstudio()
  return {
    title: `${nombre} — Estudio de Pilates`,
    description:
      'Clases de Pilates Reformer en grupos reducidos, con seguimiento personalizado.',
    appleWebApp: { capable: true, title: nombre, statusBarStyle: 'default' },
  }
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#e1dfdb',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className="bg-background">
      <body className={`${montserrat.variable} ${bodoni.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  )
}
