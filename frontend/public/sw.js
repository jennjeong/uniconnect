// uniconnect is a web page, not an app to install. Earlier versions
// registered a service worker here that made the site installable and kept a
// page shell and built assets for offline use. A browser keeps such a worker
// until its script changes, so this replacement, fetched on the next visit,
// deletes what the old one kept and unregisters itself (src/main.tsx also
// drops any registration it finds). It has no fetch handler, so pages and
// files come straight from the network. Delete this file a few months on,
// once the visitors from before have been back.
self.addEventListener("install", () => self.skipWaiting())

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("uniconnect-")).map((key) => caches.delete(key))))
      .then(() => self.registration.unregister()),
  )
})
