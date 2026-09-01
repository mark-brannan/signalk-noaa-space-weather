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
 * Whether we can use it at all. Private browsing, a blocked-cookies setting
 * and an iframe with no storage access all make the *getter* throw, not just
 * the call -- so this has to be a try/catch around the access itself, and the
 * answer is "no store", never an exception on the way to the first fetch.
 */
function available() {
  try {
    const probe = `${PREFIX}probe`
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
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
      try {
        localStorage.setItem(PREFIX + name, text)
      } catch {
        // Out of quota, most likely the aurora grid. Clear this plugin's own
        // entries -- never the whole store, which is not ours -- and try the
        // one write again. A second failure means the payload alone does not
        // fit, and there is nothing further to try.
        try {
          for (const key of Object.keys(localStorage)) {
            if (key.startsWith(PREFIX)) localStorage.removeItem(key)
          }
          localStorage.setItem(PREFIX + name, text)
        } catch {
          // Dropped on purpose; the next refresh re-fetches.
        }
      }
    },
    persistent: true
  }
}

const POSITION_KEY = 'noaa-space-weather:position'

/** Decimal places kept in a stored fix: one, so a tenth of a degree, ~11 km. */
const POSITION_PLACES = 1

/**
 * The fix, rounded to a tenth of a degree.
 *
 * Nothing this app draws can tell the difference. The aurora grid is 1 degree
 * square and sampled bilinearly, D-RAP is 2 by 4, and the device is asked for
 * a fix with `enableHighAccuracy: false` in the first place -- so a tenth is
 * already finer than the coarsest input and far finer than the grid it
 * indexes. What it does change is what a phone is carrying between sessions:
 * an 11 km box rather than a doorstep.
 *
 * That distinction is the whole difference between this app and the plugin it
 * came from. On a boat the position is the *vessel's*, on a server its owner
 * runs, from a hull that is broadcasting AIS anyway. Here it is the reader's
 * own, persisted on a device this project does not own, in an origin-scoped
 * store any script on the origin can read. Same two numbers, different
 * subject.
 *
 * Coarsening rather than encrypting, because a browser app has nowhere to put
 * a key that the code reading the value cannot also reach: ciphertext in
 * `localStorage` moves the plaintext one call away and protects it from
 * nobody. Less precision is the only mitigation here that is not theatre.
 */
export function coarsenPosition(position) {
  if (!position) return null
  // Through `toFixed` rather than multiply-round-divide: the latter leaves
  // binary-float dust (-122.30000000000001) in a value that gets stored and
  // read by a human looking at what the app kept.
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
