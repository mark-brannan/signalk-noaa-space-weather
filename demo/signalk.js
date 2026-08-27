// The demo's stand-in for public/signalk.js (issue #199). Same exports, same
// shapes, but every read is answered from demo/snapshot.json -- one saved
// NOAA capture -- instead of a Signal K server. scripts/build-demo.mjs copies
// this file over signalk.js in the assembled site, so hf.js and anything else
// importing './signalk.js' runs unchanged against the snapshot.
// The same ids as public/signalk.js, so readAll's result keeps its shape.
// Values are vessel-tree paths rather than URLs: there is no server to build
// a URL for. Written out rather than imported from scales-source.js -- this
// file also has to load from demo/, where that module isn't a sibling --
// and test/demo.test.ts pins every path against the real ENDPOINTS' URLs.
// The two plugin routes (advisory, status) have no snapshot equivalent and
// always read null.
export const ENDPOINTS = {
  scalesNow: 'environment/noaa/swpc/scales/observations/latest',
  scalesObserved:
    'environment/noaa/swpc/scales/observations/24_hours_maximums',
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
  position: 'navigation/position',
  advisory: null,
  status: null
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
/** The parsed snapshot: {capturedAt, values, grids}. Fetched once and kept. */
export function snapshot() {
  if (!loaded)
    loaded = fetch('./snapshot.json').then((res) => {
      if (!res.ok) throw new Error(`snapshot.json: HTTP ${res.status}`)
      return res.json()
    })
  return loaded
}

// `read` is accepted for signature compatibility and ignored: there is
// nothing to fetch per path, and no auth for the caller to keep.
export async function readAll() {
  const data = await snapshot()
  const tree = treeFromValues(data.values)
  return Object.fromEntries(
    Object.entries(ENDPOINTS).map(([id, p]) => [id, p ? nodeAt(tree, p) : null])
  )
}

export const leafValue = (node) =>
  node && typeof node === 'object'
    ? 'value' in node
      ? node.value
      : null
    : (node ?? null)

export const leafTime = (node) => (node && node.timestamp) || null
