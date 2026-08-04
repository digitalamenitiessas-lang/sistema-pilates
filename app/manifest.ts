import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PilatesStudio',
    short_name: 'PilatesStudio',
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
