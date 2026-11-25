// uniconnect's service worker (registered by src/main.tsx in the built app):
// it makes the app installable and lets it open offline.
// - The API never comes from a cache: its answers are personal, and Kakao's
//   may not be kept.
// - Pages come from the network; the last page shell (the same index.html
//   for every address) is kept to open with offline.
// - Built assets, whose names change with their content, are kept once
//   fetched, the newest 80.
const SHELL_CACHE = "uniconnect-shell-v1"
const ASSET_CACHE = "uniconnect-assets-v1"
const KEEP_ASSETS = 80

self.addEventListener("install", () => self.skipWaiting())

self.addEventListener("activate", (event) => {
  const current = [SHELL_CACHE, ASSET_CACHE]
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !current.includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

async function keepAsset(request, response) {
  const cache = await caches.open(ASSET_CACHE)
  await cache.put(request, response)
  const keys = await cache.keys()
  await Promise.all(keys.slice(0, Math.max(0, keys.length - KEEP_ASSETS)).map((key) => cache.delete(key)))
}

self.addEventListener("fetch", (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.includes("/api/")) return

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.put("shell", copy)))
          }
          return response
        })
        .catch(() =>
          caches
            .open(SHELL_CACHE)
            .then((cache) => cache.match("shell"))
            .then((cached) => cached || Response.error()),
        ),
    )
    return
  }

  if (url.pathname.includes("/assets/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) event.waitUntil(keepAsset(request, response.clone()))
            return response
          }),
      ),
    )
  }
})

// Push notices (#108): the server sends a short title, sometimes a line, and
// the screen it leads to (backend lib/push.ts). A browser shows every push it
// was sent, so one that can't be read still says something.
self.addEventListener("push", (event) => {
  let message = {}
  try {
    message = event.data ? event.data.json() : {}
  } catch {
    // Shown without the details.
  }
  const base = self.registration.scope
  event.waitUntil(
    self.registration.showNotification(message.title || "uniconnect", {
      body: message.body || "",
      icon: new URL("icons/icon-192.png", base).href,
      badge: new URL("icons/icon-192.png", base).href,
      tag: message.path || "uniconnect",
      renotify: true,
      data: { path: message.path || "/" },
    }),
  )
})

// A pressed notice opens its screen, only on this site: in a tab already open
// when there is one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const home = new URL(self.registration.scope)
  let target = home
  try {
    const path = String((event.notification.data && event.notification.data.path) || "/")
    const asked = new URL(path.replace(/^\/+/, ""), home)
    if (asked.origin === home.origin) target = asked
  } catch {
    // The home screen instead.
  }
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (tabs) => {
      const tab = tabs.find((item) => new URL(item.url).origin === home.origin)
      if (tab) {
        const moved = await tab.navigate(target.href).catch(() => null)
        if (moved) return moved.focus()
      }
      return self.clients.openWindow(target.href)
    }),
  )
})
