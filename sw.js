/* Fobel service worker — installable + offline.
   App shell is precached; hashed build assets are cached at runtime (stale-while-revalidate);
   the market feed is network-first so prices stay fresh when online. */
const VERSION = 'fobel-v2'
const SHELL = `${VERSION}-shell`
const RUNTIME = `${VERSION}-runtime`
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './favicon.svg', './icon-maskable.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== location.origin) return

  // SPA navigations → network-first, fall back to the cached shell (offline).
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))))
    return
  }

  // Fresh prices when online; cached snapshot when offline.
  if (url.pathname.endsWith('/market-prices.json')) {
    event.respondWith(
      fetch(request).then((res) => {
        const copy = res.clone()
        caches.open(RUNTIME).then((c) => c.put(request, copy))
        return res
      }).catch(() => caches.match(request)),
    )
    return
  }

  // Everything else (hashed JS/CSS/assets) → stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone()
          caches.open(RUNTIME).then((c) => c.put(request, copy))
        }
        return res
      }).catch(() => cached)
      return cached || network
    }),
  )
})
