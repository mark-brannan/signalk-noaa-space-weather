// The standalone app's data layer: no server and no snapshot, the plugin's own
// products running against NOAA from this tab at the device's position.
// public/index.html above is unchanged and unaware; test/app.test.ts holds this
// file to the same surface public/signalk.js exposes.
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

// On, where the plugin defaults them off: the bandwidth argument there is a
// metered boat link polled unattended, not a reader who opened an app to look.
const APP_PROPS = {
  auroraEnabled: true,
  drapEnabled: true,
  goesFluxEnabled: true
}

// --- the position ---------------------------------------------------------

// No fix is not an error: the grids are global and still draw, and the plugin
// already has that branch as `awaiting-position`.
const listeners = new Set()
let current = readLastPosition()
let denied = false

export const position = () => current
export const positionDenied = () => denied
export function onPosition(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Coarsened here and nowhere else, so the drawn position and the stored one
// cannot be two answers.
function adopt(fix) {
  const next = coarsenPosition(fix)
  denied = false
  // `watchPosition` fires about once a second while moving and coarsening
  // makes most of those identical; each one re-parses both cached grids.
  if (
    current &&
    next.latitude === current.latitude &&
    next.longitude === current.longitude
  )
    return
  current = next
  writeLastPosition(next)
  plugin()
    .then((p) => p.setPosition(next))
    .catch(() => {})
  for (const listener of listeners) listener(next)
}

// Safe to call again: the chrome's button is the only way back from a refusal.
// `watchPosition` because `setPosition` redraws out of cache, never from NOAA.
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
      // Keep the last run's fix: one a reader can see and correct beats none.
      denied = true
      for (const listener of listeners) listener(current)
    },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }
  )
}

// --- the plugin -----------------------------------------------------------

let started = null
// Dynamic import so the precached shell does not carry the whole product
// closure before first paint. Started on load below, not by the first reader.
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
  // A press really does fetch here, and its refusals are the plugin's own
  // cooldown and 502 -- which `refreshFailure` already labels.
  forceRefresh: async (which) => (await plugin()).refresh(which)
})

export const getJson = (path) => seam.getJson(path)
export const readAll = (read = getJson) => seam.readAll(read)
export const fetchTelemetry = () => seam.fetchTelemetry()
export const fetchGridCache = (which) => seam.fetchGridCache(which)
export const forceRefresh = (which) => seam.forceRefresh(which)

// No server to hold a preference; null leaves the page on its nmi default.
export async function distanceUnitPreference() {
  return null
}

// The install. Guarded on `window` so importing this module in the test suite
// neither starts fetching NOAA nor asks a test runner for its location.
if (typeof window !== 'undefined') {
  plugin().catch(() => {})
  requestPosition()
}
