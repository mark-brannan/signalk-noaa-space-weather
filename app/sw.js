// The app's service worker: makes it installable, and makes the shell open
// without the network.
//
// The shell only. NOAA's own responses are deliberately never cached here --
// the products already cache what they need through the CacheStore in
// app/store.js, and a second copy of a ~900 KB aurora grid in the Cache API
// would double what the app costs a phone to hold while making neither copy
// the authority on how old it is.
//
// SHELL and VERSION are written by scripts/build-app.mjs from the site's own
// file list, never by hand: the app is public/index.html's transitive import
// closure, and a hand-kept list here would be a second, quietly wrong answer
// to the question of what the app is made of.
const VERSION = '__VERSION__'
const SHELL = __SHELL__

const CACHE_PREFIX = 'noaa-space-weather-shell-'
const CACHE = `${CACHE_PREFIX}${VERSION}`

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      // Don't sit in `waiting` behind a tab the reader has already left: the
      // shell that just downloaded is the one they should get on next open.
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          // Our own prefix only. A worker's scope is a path but the Cache API
          // is origin-wide, and this app may well be served from a path under
          // a site that has its own.
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // Anything that is not this app's own origin is NOAA, and NOAA is the one
  // thing here that must always be the live answer.
  if (url.origin !== self.location.origin) return

  // A navigation is the shell, whatever path it was opened at -- an installed
  // app restores to its own start URL and must not depend on the network to
  // find it.
  if (request.mode === 'navigate') {
    event.respondWith(
      caches
        .match('./index.html')
        .then((hit) => hit ?? fetch(request))
        .catch(() =>
          caches.match('./index.html').then((hit) => hit ?? Response.error())
        )
    )
    return
  }

  // Cache-first for the shell: these are content-addressed by the cache
  // version above, so a hit is never stale -- a new build is a new cache.
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((response) => {
          // Only same-origin, only successful, and cloned before the body is
          // read: a response can be consumed exactly once.
          if (response.ok && response.type === 'basic') {
            const copy = response.clone()
            // Held open: the worker may be killed the moment `respondWith`
            // settles, which is before a bare `.then` would have run.
            event.waitUntil(
              caches.open(CACHE).then((cache) => cache.put(request, copy))
            )
          }
          return response
        })
    )
  )
})
