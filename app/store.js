// The app's CacheStore: the grids and the advisory bulletin, kept in
// localStorage so a cold start paints from the last fetch instead of buying
// another one.
//
// This is the same `CacheStore` the products have taken since #272 -- two
// synchronous string methods -- so nothing about a product knows or cares that
// the store is a browser's rather than a data directory. On a phone it is the
// difference between opening the app and waiting on a ~900 KB aurora grid, and
// opening it to yesterday's map while today's lands behind it.

const PREFIX = 'noaa-space-weather:cache:'

/**
 * Whether we can use it at all.
 *
 * Private browsing, a blocked-cookies setting and an iframe with no storage
 * access all make the *getter* throw, not just the call -- so this has to be a
 * try/catch around the access itself, and the answer is "no store", never an
 * exception on the way to the first fetch.
 *
 * A read, not a write: a store that is full is still readable, and a probe
 * write would throw there and drop us to memory with the grids we already have
 * sitting unreachable. Running out of room is `writeCache`'s to handle.
 */
function available() {
  try {
    localStorage.getItem(`${PREFIX}probe`)
    return true
  } catch {
    return false
  }
}

/**
 * A CacheStore over localStorage, or an in-memory one where that is not
 * usable.
 *
 * A write that will not fit is dropped rather than raised. The products treat
 * a cache miss as "fetch it again", which is exactly the right degradation:
 * the app costs one more fetch, and nothing above here has to learn a new
 * failure mode. Raising instead would abort a refresh that had already
 * succeeded -- the payload is in hand by the time it is written.
 */
export function createLocalStore() {
  if (!available()) {
    const memory = new Map()
    return {
      readCache: (name) => memory.get(name) ?? null,
      writeCache: (name, text) => void memory.set(name, text),
      persistent: false
    }
  }

  return {
    readCache(name) {
      try {
        return localStorage.getItem(PREFIX + name)
      } catch {
        return null
      }
    },
    writeCache(name, text) {
      const key = PREFIX + name
      const write = () => localStorage.setItem(key, text)
      try {
        return void write()
      } catch {
        // Out of quota.
      }
      // The stale copy of this same entry first: going straight to the full
      // clear makes the two grids evict each other turn about, so the store
      // converges on holding one of them.
      try {
        localStorage.removeItem(key)
        return void write()
      } catch {
        // Still out of quota.
      }
      try {
        for (const other of Object.keys(localStorage)) {
          if (other.startsWith(PREFIX)) localStorage.removeItem(other)
        }
        write()
      } catch {
        // Dropped on purpose; the next refresh re-fetches.
      }
    },
    persistent: true
  }
}

const POSITION_KEY = 'noaa-space-weather:position'

/** One place is a tenth of a degree: ~11 km, coarser than any grid we index. */
const POSITION_PLACES = 1

/** Why coarsening rather than encryption: docs/design-decisions.md. */
export function coarsenPosition(position) {
  if (!position) return null
  // toFixed, not multiply-round-divide: the latter leaves binary-float dust.
  const round = (v) => Number(v.toFixed(POSITION_PLACES))
  return {
    latitude: round(position.latitude),
    longitude: round(position.longitude)
  }
}

/**
 * The last fix, so a cold start has somewhere to index the grids before the
 * device answers -- and somewhere to stay if it never does.
 *
 * Stored separately from the cache above because it survives a quota clear:
 * it is two numbers, and losing it costs the app its whole reason to draw a
 * value at a place rather than a global map.
 */
export function readLastPosition() {
  try {
    const saved = JSON.parse(localStorage.getItem(POSITION_KEY) || 'null')
    return typeof saved?.latitude === 'number' &&
      typeof saved?.longitude === 'number'
      ? { latitude: saved.latitude, longitude: saved.longitude }
      : null
  } catch {
    return null
  }
}

export function writeLastPosition(position) {
  try {
    localStorage.setItem(POSITION_KEY, JSON.stringify(position))
  } catch {
    // A viewpoint that does not persist is still a viewpoint for this run.
  }
}
