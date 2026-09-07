import type { MetadataRoute } from 'next'
import { nombreDelEstudio } from '@/lib/estudio'

// Async a propósito: el nombre sale del sistema, no del código. Es el que
// la clienta ve debajo del ícono cuando instala la app en el celular.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const nombre = await nombreDelEstudio()
  return {
    name: nombre,
    short_name: nombre,
    description: 'Reservá tus clases, mirá tu membresía y tus pagos.',
    start_url: '/sistema',
    display: 'standalone',
    background_color: '#f5ece3',
    theme_color: '#f5ece3',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
