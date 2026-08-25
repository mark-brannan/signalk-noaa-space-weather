// Every Signal K path the webapp reads, in one list.
//
// The wiring is the thing that broke in issue #120 and the thing no test could
// see, because it lived inline in a `Promise.all` in index.html next to the
// markup it fed. A URL written at the call site is only ever checked by
// looking at the page. Named here, the pairing of a surface to a path is a
// value a test can hold -- `scales-render.test.ts` runs the card over every
// captured payload through these ids and fails if a surface is drawing a
// field that has never once been non-zero.
//
// The admin widget in remoteEntry.js reads from the same table, so the two
// surfaces cannot drift apart the way they had.
import { SCALES_NOW, SCALES_OBSERVED } from './scales-source.js'

const API = '/signalk/v1/api'
/** A path on the vessel's own data tree. */
const vessel = (path) => `${API}/vessels/self/${path}`
/** One of the plugin's own routes, which are not vessel data. */
const plugin = (route) => `${API}/signalk-noaa-space-weather/${route}`

export const ENDPOINTS = {
  // The instantaneous sample and the rolling 24-hour maximum. Which of the
  // two a surface may draw is scales-source.js's subject, not this file's.
  scalesNow: vessel(SCALES_NOW),
  scalesObserved: vessel(SCALES_OBSERVED),
  scalesForecast: vessel('environment/noaa/swpc/scales/forecast'),
  kp: vessel('environment/noaa/swpc/kp'),
  solarWind: vessel('environment/noaa/swpc/solar_wind'),
  aurora: vessel('environment/noaa/swpc/aurora'),
  xrayFlare: vessel('environment/noaa/swpc/xray_flare'),
  f107: vessel('environment/noaa/swpc/f107'),
  aIndex: vessel('environment/noaa/swpc/a_index'),
  sunspot: vessel('environment/noaa/swpc/sunspot_number'),
  position: vessel('navigation/position'),
  advisory: plugin('advisory-outlook'),
  status: plugin('status')
}

/**
 * Fetch the whole table at once and return it keyed by id.
 *
 * One round of requests per refresh, in parallel, because they all go to the
 * same server and a serial walk of thirteen paths is thirteen round trips of
 * latency for a page that redraws every minute. `read` is passed in rather
 * than imported so the caller keeps its own auth and error handling -- a 401
 * on any one of these means the same thing for all of them.
 */
export async function readAll(read) {
  const ids = Object.keys(ENDPOINTS)
  const values = await Promise.all(ids.map((id) => read(ENDPOINTS[id])))
  return Object.fromEntries(ids.map((id, i) => [id, values[i]]))
}

/**
 * The value out of a Signal K leaf, which looks like
 * `{value, timestamp, $source, meta}`.
 *
 * Absent paths -- a disabled product, or anything before the first fetch
 * cycle -- 404 at the parent, so every caller has to handle `null` throughout.
 * Not every node is a leaf either: a vessel name is a bare string at its own
 * path, so `'value' in node` would throw on it. And an object with no `value`
 * is a path carrying only `meta`, described at startup but never published
 * because that product's fetch failed -- returning the node itself rendered
 * as "[object Object]".
 */
export const leafValue = (node) =>
  node && typeof node === 'object'
    ? 'value' in node
      ? node.value
      : null
    : (node ?? null)

/** When that leaf was last published, or null. */
export const leafTime = (node) => (node && node.timestamp) || null
