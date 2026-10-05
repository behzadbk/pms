/* Web Push — همین. توسط Workbox (importScripts) داخل service worker اصلی بارگذاری می‌شود. */
self.addEventListener('push', (event) => {
  let d = {}
  try {
    d = event.data ? event.data.json() : {}
  } catch (e) {
    d = { title: 'همین', body: event.data ? event.data.text() : '' }
  }
  const title = d.title || 'همین'
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, {
        body: d.body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: d.tag || undefined,
        renotify: !!d.tag,
        dir: 'rtl',
        lang: 'fa',
        vibrate: [120, 60, 120],
        timestamp: Date.now(),
        data: { url: d.url || '/', kind: d.kind || '', inboxId: d.inboxId || '' },
      })
      // اپ باز است؟ زنگوله فوراً تازه شود
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      list.forEach((c) => c.postMessage({ type: 'push', kind: d.kind || '' }))
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const c of list) {
        if (new URL(c.url).origin === self.location.origin && 'focus' in c) {
          await c.focus()
          // مسیر را به SPA بدهیم تا بدون reload کامل باز شود
          c.postMessage({ type: 'navigate', url: target })
          return
        }
      }
      await self.clients.openWindow(target)
    })(),
  )
})
