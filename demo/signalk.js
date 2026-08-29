// The demo's stand-in for public/signalk.js (issues #199, #239). Same
// exports, same shapes, but every read is answered from demo/snapshot.json --
// one saved NOAA capture -- instead of a Signal K server.
// scripts/build-demo.mjs copies this file over signalk.js in the assembled
// site, so public/index.html itself, and every module it imports, runs
// unchanged against the snapshot. This file is the whole seam: if the page
// can reach a server any other way, the demo silently draws nothing.

// --- The demo's clock ------------------------------------------------------
//
// The page decides for itself whether what it is showing is current: STALE_MS
// in public/index.html is three hours, measured against the data's own
// timestamps. A saved capture is older than that within an afternoon, so on a
// real clock this page would read "STALE DATA / No update since ... / This is
// not an all-clear" from three hours after the capture until the end of time.
// That is a true statement about a live install and a false one about a
// snapshot: nothing is broken, the moment is simply saved.
//
// So the demo runs on the capture's clock. `Date.now()` and `new Date()`
// answer `capturedAt + (real now - the moment the snapshot loaded)`: an
// offset, not a freeze, so the hero's countdown and the "since" counters tick
// exactly as they do on a boat. Live data (#239 leg 2) is the real fix; this
// is what makes a *saved* snapshot honest until then.
//
// Installed from this module, at module scope, because a module's imports are
// evaluated before the importing module's body -- so it is in place before
// index.html runs its first line. demo/chrome.js is appended and runs last,
// which is too late.
const RealDate = Date
let clockShiftMs = 0
let clockAdopted = false
const shiftedNow = () => RealDate.now() + clockShiftMs

/**
 * `Date`, with the zero-argument constructor and `now()` moved onto the
 * capture's clock and nothing else touched. `new Date(iso)` has to keep
 * parsing exactly what it is given -- the page parses every NOAA timestamp
 * through it, and shifting those would corrupt every reading on the page
 * rather than the one number this is about.
 *
 * A Proxy rather than a subclass so `Date.prototype`, `Date.parse`,
 * `Date.UTC` and every `x instanceof Date` in the page keep the identity they
 * had; a subclass gives `Date.prototype` a new object and quietly breaks them.
 */
export const DemoDate = new Proxy(RealDate, {
  construct: (target, args, newTarget) =>
    Reflect.construct(target, args.length ? args : [shiftedNow()], newTarget),
  // `Date()` without `new` is a string of the current time, and it would read
  // the real one straight past the proxy otherwise.
  apply: () => new RealDate(shiftedNow()).toString(),
  get: (target, prop, receiver) =>
    prop === 'now' ? shiftedNow : Reflect.get(target, prop, receiver)
})

/**
 * Point the clock at the captured instant. Once only: the page re-reads the
 * snapshot on every poll, and re-adopting would rewind "now" to the capture
 * each time, freezing the counters this offset exists to keep running.
 */
export function adoptCaptureClock(capturedAt) {
  if (clockAdopted) return
  const capturedMs = RealDate.parse(capturedAt)
  if (!Number.isFinite(capturedMs)) return
  clockAdopted = true
  clockShiftMs = capturedMs - RealDate.now()
}

// The same ids as public/signalk.js, so readAll's result keeps its shape.
// Values are vessel-tree paths rather than URLs: there is no server to build
// a URL for. Written out rather than imported from scales-source.js -- this
// file also has to load from demo/, where that module isn't a sibling --
// and the tests pin every path against the real ENDPOINTS' URLs.
export const ENDPOINTS = {
  scalesNow: 'environment/noaa/swpc/scales/observations/latest',
  scalesObserved: 'environment/noaa/swpc/scales/observations/24_hours_maximums',
  scalesForecast: 'environment/noaa/swpc/scales/forecast',
  kp: 'environment/noaa/swpc/kp',
  solarWind: 'environment/noaa/swpc/solar_wind',
  aurora: 'environment/noaa/swpc/aurora',
  xrayFlare: 'environment/noaa/swpc/xray_flare',
  xrayFlux: 'environment/noaa/swpc/xray_flux',
  protonFlux: 'environment/noaa/swpc/proton_flux',
  drap: 'environment/noaa/swpc/drap',
  f107: 'environment/noaa/swpc/f107',
  aIndex: 'environment/noaa/swpc/a_index',
  sunspotNumber: 'environment/noaa/swpc/sunspot_number',
  alerts: 'notifications/noaa/swpc/alerts',
  position: 'navigation/position',
  // No snapshot carries this yet -- the MUF is issue #82 -- and nodeAt
  // answers null, which is the same "not measured" the live webapp gets.
  muf: 'environment/noaa/swpc/muf',
  // The plugin's own two routes have no vessel path, and neither is
  // reconstructable from one: the advisory route serves the bulletin `text`
  // and `idLine` that no published path carries, and `status` describes a
  // running plugin. They are answered out of the snapshot's saved route
  // responses instead -- see ROUTE_OF below.
  advisory: null,
  status: null
}

/**
 * The plugin routes, by the key their saved response is filed under in the
 * snapshot's `routes` -- the same idea as `grids`, one captured response
 * each, byte-identical to what the route serves. A route the capture did not
 * save reads null, which is what the live page gets from a 404 too.
 */
const ROUTE_OF = {
  advisory: 'advisory',
  status: 'status'
}

/**
 * The snapshot's `values` map (dotted path -> {value, timestamp}) as the
 * nested tree the REST API would serve. A path can be both a leaf and a
 * parent -- xray_flux carries a trend child -- which is why leaves merge
 * into the node rather than replacing it, the same shape leafValue already
 * reads.
 */
export function treeFromValues(values) {
  const root = {}
  for (const [dotted, leaf] of Object.entries(values || {})) {
    let node = root
    for (const key of dotted.split('.')) {
      node = node[key] ?? (node[key] = {})
    }
    Object.assign(node, leaf)
  }
  return root
}

/** The subtree at a slash path, or null -- a 404 from a server that isn't there. */
export function nodeAt(tree, slashPath) {
  let node = tree
  for (const key of slashPath.split('/')) {
    node = node?.[key]
    if (node === undefined) return null
  }
  return node
}

let loaded = null
/** The parsed snapshot: {capturedAt, values, grids, routes}. Fetched once. */
export function snapshot() {
  if (!loaded)
    loaded = fetch('./snapshot.json')
      .then((res) => {
        if (!res.ok) throw new Error(`snapshot.json: HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        adoptCaptureClock(data.capturedAt)
        return data
      })
      .catch((err) => {
        // The promise is memoised, so memoising a rejection would make one
        // failed load permanent: every later poll would fail identically and
        // only a manual reload could recover. Drop it and let the next caller
        // try again -- the page already polls on a timer.
        loaded = null
        throw err
      })
  return loaded
}

// Built once per snapshot, not per read: the page polls every path on a timer
// and rebuilding the whole tree each time would walk the snapshot's values for
// every one of them. Keyed on the parsed object rather than memoised on its
// own, so a snapshot that had to be re-fetched gets a tree of its own values.
let built = null
async function valueTree() {
  const data = await snapshot()
  if (built?.data !== data) built = { data, tree: treeFromValues(data.values) }
  return built.tree
}

// Exported for parity with public/signalk.js: the page catches it to tell
// "you are not logged in" apart from "nothing published yet". Nothing here
// ever throws it -- there is no server to be logged out of -- but the page's
// `instanceof` checks need the class to exist.
export class AuthRequiredError extends Error {}

/**
 * One path out of the snapshot, in the shape the REST API answers with.
 *
 * A snapshot that will not load is this page's transport failure, and
 * `getJson` in public/signalk.js answers null for one rather than throwing --
 * the page's own no-data state is built on that. Rejecting here instead would
 * escape `refresh()` in index.html as an unhandled rejection and leave the
 * page frozen on whatever it last drew.
 */
export async function getJson(path) {
  if (!path) return null
  try {
    return nodeAt(await valueTree(), path)
  } catch {
    return null
  }
}

/** One saved route response out of the snapshot, or null. */
async function routeJson(route) {
  try {
    const { routes } = await snapshot()
    return (routes && routes[route]) ?? null
  } catch {
    return null
  }
}

// `read` defaults rather than being ignored, so the page's own
// `readAll(getJson)` and a bare `readAll()` answer the same thing. It reads
// vessel paths only: a plugin route is not a path, so `read` is not given one
// to make a URL out of.
export async function readAll(read = getJson) {
  const ids = Object.keys(ENDPOINTS)
  const values = await Promise.all(
    ids.map((id) =>
      ENDPOINTS[id] ? read(ENDPOINTS[id]) : routeJson(ROUTE_OF[id])
    )
  )
  return Object.fromEntries(ids.map((id, i) => [id, values[i]]))
}

export const leafValue = (node) =>
  node && typeof node === 'object'
    ? 'value' in node
      ? node.value
      : null
    : (node ?? null)

export const leafMeta = (node) =>
  node && typeof node === 'object' && node.meta && typeof node.meta === 'object'
    ? node.meta
    : null

export const leafTime = (node) => (node && node.timestamp) || null

/**
 * Seconds off a `Retry-After` header, or null. Exported for parity; the demo
 * never refuses with a cooldown, because a cooldown would promise that
 * pressing again later works.
 */
export function retryAfterSeconds(header) {
  const seconds = Number(header)
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null
}

/** The grid the capture saved, in the shape the map's layer loader takes. */
export async function fetchGridCache(which) {
  const { grids } = await snapshot()
  const entry = grids && grids[which]
  if (!entry) {
    // The same shape the plugin's 404 produces, so the map draws its own
    // "nothing cached yet" wording rather than reporting an error.
    const err = new Error('Nothing cached yet.')
    err.notCached = true
    throw err
  }
  return entry
}

/**
 * A manual fetch has to fail here, and it has to fail honestly.
 *
 * `refreshFailure` in aurora.js sorts a refusal into five kinds and the page
 * labels each one; four of them would be a lie on this page. A cooldown says
 * "press it again in a minute", which will never work; an auth failure sends
 * the reader to a login that does not exist; an upstream failure blames NOAA
 * for something NOAA had no part in; and a bare failure says nothing at all.
 * 503 is the one that is simply true: this page is a saved capture on a
 * static host, and the plugin -- the only thing that ever reaches NOAA -- is
 * not running behind it. It is the same status the plugin's own /status route
 * answers when it is stopped, and it lines up with the `status` endpoint
 * above reading null, so the aurora tile and the button tell the reader the
 * same story rather than two different ones.
 */
export async function forceRefresh() {
  const err = new Error(
    'This is a saved NOAA snapshot on a static page — there is no plugin' +
      ' running behind it to fetch with. Install the plugin on your own' +
      ' Signal K server for live data.'
  )
  err.status = 503
  throw err
}

/**
 * No server, so no unit preference to read: null leaves the page on the nmi
 * it already defaults to, which is the right unit for a demo aimed at boats.
 */
export async function distanceUnitPreference() {
  return null
}

// The install, last in the file because the top-level await below needs
// everything above it. `await` at module scope holds the importing module's
// body until the snapshot is in, which is what closes the window where
// index.html could read a real `Date.now()` first. A snapshot that will not
// load leaves the page on the real clock and on its own no-data state, which
// is the honest reading of "there is no capture here".
//
// Guarded on `document` so importing this module in the test suite does not
// repoint the runner's own clock; the tests drive `DemoDate` and
// `adoptCaptureClock` directly, and the built page is checked in a browser.
if (typeof document !== 'undefined') {
  globalThis.Date = DemoDate
  await snapshot().catch(() => {})
}
