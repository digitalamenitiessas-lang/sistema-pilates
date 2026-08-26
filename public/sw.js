// Service worker de PilatesStudio: recibe notificaciones push y las
// muestra. No cachea nada a propósito — el deploy de Vercel maneja los
// assets y un cache acá solo traería versiones viejas.

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'PilatesStudio', body: event.data.text() }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'PilatesStudio', {
      body: payload.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: payload.url || '/sistema' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/sistema'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes('/sistema') && 'focus' in client) return client.focus()
      }
      return self.clients.openWindow(url)
    })
  )
})
