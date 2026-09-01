// The demo's stand-in for public/signalk.js (issues #199, #239). Same exports,
// same shapes, and two things behind them instead of a Signal K server:
//
//   snapshot  one saved NOAA capture, demo/snapshot.json  (the default)
//   live      the plugin's own product modules, fetching NOAA from this tab
//
// scripts/build-demo.mjs copies this file over signalk.js in the assembled
// site, so public/index.html itself, and every module it imports, runs
// unchanged against either. This file is the whole seam: if the page can
// reach a server any other way, the demo silently draws nothing.
//
// Live is opt-in, on ?live, and not the default -- a page anyone can open
// must not spend a fresh ~900 KB aurora grid of somebody else's bandwidth on
// every visit. The snapshot costs NOAA nothing and shows the same surfaces;
// live is there for a reader who wants to see the plugin actually work, and
// for checking the real parsers against what NOAA is serving today.

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
/**
 * Which data layer this page is running. Read once, from the URL, before
 * anything else in the module body -- the clock install below depends on it.
 * Live data is real and current, so it runs on the real clock; only the saved
 * capture needs one moved.
 */
export const LIVE =
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).has('live')

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
// The vessel paths, the route map, the tree helpers and every document-backed
// read now come from the shared seam -- src/browser/seam.ts, compiled into the
// site under plugin/. The standalone app reads its own document through the
// same module, so "what the page asks for" has one definition rather than one
// per site. Re-exported here because the page imports them from './signalk.js'
// and knows nothing about where they are written.
import { createDocumentSeam } from './plugin/browser/seam.js'

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

// --- the live data layer --------------------------------------------------
//
// The plugin's own products, compiled to dist/ and copied into the site under
// plugin/, running here against NOAA with no server and no bundler. Imported
// dynamically rather than at the top: a snapshot visitor must not download the
// product closure to look at a saved capture.
let livePlugin = null
function live() {
  if (!livePlugin)
    livePlugin = import('./plugin/browser/live.js')
      .then(({ startLivePlugin }) => startLivePlugin())
      .catch((err) => {
        // Same reasoning as the snapshot's memoised rejection below: a failed
        // load must not become permanent when the page polls on a timer.
        livePlugin = null
        throw err
      })
  return livePlugin
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

/**
 * The document this page is reading, in one shape whichever layer produced it:
 * `{values, grids, routes}`, which is exactly what demo/snapshot.json holds.
 * That the live plugin can be asked for the same document as a saved file is
 * the whole reason the page below needs no branch of its own.
 */
let firstPaint = null
async function document_() {
  if (!LIVE) return snapshot()
  const plugin = await live()
  // Every read on the page's first poll waits on the same promise -- `readAll`
  // asks for seventeen paths at once, and each of them arriving separately is
  // not a reason to wait seventeen times. After that there is nothing to wait
  // for: the products publish as they land and the document is read live.
  firstPaint ??= plugin.ready.catch(() => {})
  await firstPaint
  return plugin.document()
}

// The seam, bound to this page's document. Built on first use rather than at
// module scope so it never depends on where in the file `document_` and
// `forceRefresh` happen to be written.
let seamInstance = null
const seam = () =>
  (seamInstance ??= createDocumentSeam({
    document: document_,
    forceRefresh: (which) => forceRefresh(which)
  }))

/**
 * The document-backed reads. Each one answers null rather than rejecting on a
 * transport failure -- `getJson` in public/signalk.js does the same, and the
 * page's own no-data state is built on it; a rejection would escape
 * `refresh()` in index.html and freeze the page on whatever it last drew.
 */
export const getJson = (path) => seam().getJson(path)
export const readAll = (read = getJson) => seam().readAll(read)
export const fetchTelemetry = () => seam().fetchTelemetry()
export const fetchGridCache = (which) => seam().fetchGridCache(which)

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
export async function forceRefresh(which) {
  // Live, the button does exactly what it says: this page is the plugin, so
  // it fetches. Its refusals are the plugin's own -- the cooldown and the
  // "nothing new came back" 502 -- which is what `refreshFailure` in
  // public/aurora.js already knows how to label.
  if (LIVE) return (await live()).refresh(which)
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
if (typeof window !== 'undefined') {
  if (LIVE) {
    // Nothing to install and nothing to wait for: the clock is real, and the
    // page's own polling draws each product as it lands. Started here rather
    // than on the first read so the fetching begins with the page, not with
    // whatever the first surface happens to ask for.
    live().catch(() => {})
  } else {
    globalThis.Date = DemoDate
    await snapshot().catch(() => {})
  }
}
