// The standalone app's data layer -- the third thing to sit behind the page's
// one seam, after a Signal K server (public/signalk.js) and the demo's saved
// capture (demo/signalk.js).
//
// There is no server here and no snapshot: the page IS the plugin, running its
// own product modules against NOAA from this tab, indexed at wherever the
// device says it is. Everything document-backed comes from the shared seam, so
// what is written here is only what makes this the app rather than the demo:
// the device's own position, a store that outlives the tab, and a real clock.
//
// The page above is public/index.html, unchanged and unaware -- the same file
// a boat gets. That is the whole point of the seam, and test/app.test.ts holds
// this file to the same surface public/signalk.js exposes.
import { createDocumentSeam } from './plugin/browser/seam.js'
import {
  createLocalStore,
  coarsenPosition,
  readLastPosition,
  writeLastPosition
} from './store.js'

export {
  ENDPOINTS,
  AuthRequiredError,
  treeFromValues,
  nodeAt,
  leafValue,
  leafMeta,
  leafTime,
  retryAfterSeconds
} from './plugin/browser/seam.js'

/**
 * How the app runs the plugin: the two grids and the GOES flux pair on.
 *
 * All three default off in the plugin on bandwidth grounds, because there the
 * decision is being made on someone's metered boat link for a process that
 * polls unattended. Here the reader opened an app to look at exactly these
 * surfaces, and closes it when they are done.
 */
const APP_PROPS = {
  auroraEnabled: true,
  drapEnabled: true,
  goesFluxEnabled: true
}

// --- the position ---------------------------------------------------------

/**
 * Where the reader is, and how that gets better over time.
 *
 * Three states, in the order they arrive: the last known fix (instant, from
 * the previous run), the device's own (a permission prompt away), and none at
 * all (permission refused on a first run). The last is not an error state --
 * the grids are global and still draw; it is only the readings *at a place*
 * that wait, which is exactly the `awaiting-position` branch the plugin
 * already takes on a boat with no GPS fix yet.
 */
const listeners = new Set()
let current = readLastPosition()
let denied = false

export const position = () => current
export const positionDenied = () => denied
export function onPosition(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Take a fix, coarsened once, here.
 *
 * The rounding is at this boundary and nowhere else so that the whole app --
 * the cell above, the store, the products, the mark on the map -- holds one
 * answer to where the reader is. Coarsening inside `writeLastPosition`
 * instead would leave the drawn position finer than the stored one, which is
 * two answers and an invitation for the fine one to leak somewhere later.
 * `coarsenPosition` says why a tenth of a degree costs this app nothing.
 */
function adopt(fix) {
  const next = coarsenPosition(fix)
  current = next
  denied = false
  writeLastPosition(next)
  plugin().then((p) => p.setPosition(next))
  for (const listener of listeners) listener(next)
}

/**
 * Ask the device. Safe to call more than once -- the button in the app's
 * chrome calls it again after a refusal, which is the only way back from one.
 *
 * `watchPosition` rather than a single read: this is an app someone opens
 * while moving, and a fix that updates costs nothing extra -- `setPosition`
 * redraws out of the cached grids and never reaches NOAA.
 */
let watch = null
export function requestPosition() {
  if (!('geolocation' in navigator)) {
    denied = true
    return
  }
  if (watch !== null) navigator.geolocation.clearWatch(watch)
  watch = navigator.geolocation.watchPosition(
    ({ coords }) =>
      adopt({ latitude: coords.latitude, longitude: coords.longitude }),
    () => {
      // Refused, or unavailable. Keep whatever the last run knew -- a stale
      // fix a reader can see and correct beats a blank map -- and let the
      // chrome offer the prompt again.
      denied = true
      for (const listener of listeners) listener(current)
    },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }
  )
}

// --- the plugin -----------------------------------------------------------

let started = null
/**
 * The product modules, compiled to dist/ and copied into the site under
 * plugin/, running here with no server and no bundler.
 *
 * Imported dynamically for one reason only: the service worker precaches the
 * app shell, and a shell that pulled the whole product closure in before first
 * paint would trade the thing the reader is waiting for against the thing that
 * fills it in. Started on load below, so the fetching begins with the app
 * rather than with whichever surface reads first.
 */
function plugin() {
  if (!started)
    started = import('./plugin/browser/live.js')
      .then(({ startLivePlugin }) =>
        startLivePlugin({
          position: current,
          props: APP_PROPS,
          store: createLocalStore()
        })
      )
      .catch((err) => {
        // Not memoised as a permanent failure: the page polls on a timer, and
        // one failed load must not outlive the condition that caused it.
        started = null
        throw err
      })
  return started
}

let firstPaint = null
async function document_() {
  const live = await plugin()
  // Every read on the first poll waits on the same promise -- `readAll` asks
  // for seventeen paths at once, and each arriving separately is not a reason
  // to wait seventeen times. After that there is nothing to wait for: the
  // products publish as they land and the document is read live.
  firstPaint ??= live.ready.catch(() => {})
  await firstPaint
  return live.document()
}

const seam = createDocumentSeam({
  document: document_,
  /**
   * The map's "fetch now" buttons. This page is the plugin, so a press really
   * does fetch -- and its refusals are the plugin's own cooldown and its
   * "nothing new came back" 502, which is what `refreshFailure` in
   * public/aurora.js already knows how to label.
   */
  forceRefresh: async (which) => (await plugin()).refresh(which)
})

export const getJson = (path) => seam.getJson(path)
export const readAll = (read = getJson) => seam.readAll(read)
export const fetchTelemetry = () => seam.fetchTelemetry()
export const fetchGridCache = (which) => seam.fetchGridCache(which)
export const forceRefresh = (which) => seam.forceRefresh(which)

/**
 * No server, so no unit preference to read: null leaves the page on the nmi it
 * already defaults to, which is the right unit for something aimed at boats.
 */
export async function distanceUnitPreference() {
  return null
}

// The install. Guarded on `window` so importing this module in the test suite
// neither starts fetching NOAA nor asks a test runner for its location.
if (typeof window !== 'undefined') {
  plugin().catch(() => {})
  requestPosition()
}
