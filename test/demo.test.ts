// The GitHub Pages demo (issues #199, #239): scripts/build-demo.mjs copies
// public/index.html itself and substitutes demo/signalk.js for
// public/signalk.js, so the demo is the shipping page rather than a fork of
// it. What these pin is that seam -- the copied set is closed under imports,
// the substitute answers everything the real module does, and the committed
// snapshot has something to draw at every surface -- not what the page says.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { refreshFailure } from '../public/aurora.js'
import * as demo from '../demo/signalk.js'
import * as real from '../public/signalk.js'
import {
  PUBLIC_MODULES,
  SITE_FILES,
  resolveImports,
  sourceOf
} from '../scripts/build-demo.mjs'

const ROOT = join(__dirname, '..')
const snapshot = JSON.parse(
  readFileSync(join(ROOT, 'demo', 'snapshot.json'), 'utf8')
)

// The demo's module keeps the snapshot and the clock offset for the life of
// the page, so a test wanting either afresh needs a fresh module, not a fresh
// stub.
async function freshDemo() {
  vi.resetModules()
  return (await import('../demo/signalk.js')) as typeof demo
}
async function withSnapshot(body: unknown) {
  vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => body }))
  return freshDemo()
}

afterEach(() => vi.unstubAllGlobals())

describe('the assembled demo site', () => {
  // Deliberately the build's own pattern and resolver rather than a copy of
  // them: a second regex here would only ever agree with the first, so it
  // would pin nothing. What that buys is one implementation to fix; what it
  // costs is that this test is blind to exactly what the build is blind to --
  // a dynamic `import()` built from a variable, `new Worker(...)`, `new
  // URL('./x.js', import.meta.url)`, and anything referenced from HTML markup
  // or CSS rather than from an import. None of those are copied and none of
  // them fail here. The only real guard is loading the built page in a
  // browser, which cannot live in this suite: the plugin registry runs
  // `npm test` under `firejail --net=none` with a 60 second cap, and
  // Playwright fits in neither. See docs/development.md.
  it('is closed under the imports of everything it copies', () => {
    const site = new Set(SITE_FILES)
    for (const name of SITE_FILES) {
      if (!name.endsWith('.js') && !name.endsWith('.html')) continue
      for (const target of resolveImports(name))
        expect(site.has(target), `${name} -> ${target}`).toBe(true)
    }
  })

  // The one case the walk must refuse rather than resolve: the site is copied
  // by name into demo-dist/, so a specifier climbing out of it writes above
  // the output directory, over whatever is there.
  it('refuses an import that resolves outside the site', () => {
    expect(() =>
      resolveImports('index.html', "import x from '../../etc/passwd'")
    ).toThrow(/outside the site/)
    // A `../` that stays inside is ordinary and still resolves.
    expect(
      resolveImports(
        'vendor/coast-wright/index.js',
        "import x from '../../geo.js'"
      )
    ).toEqual(['geo.js'])
  })

  it('names only files that exist to copy', () => {
    for (const name of SITE_FILES)
      expect(existsSync(sourceOf(name)), name).toBe(true)
  })

  it('serves the shipping page itself, not a fork of it', () => {
    expect(SITE_FILES).toContain('index.html')
    expect(PUBLIC_MODULES).toContain('index.html')
  })

  // index.html imports the map modules, which import the vendored coastline:
  // a walk that stopped at the page would publish a map with no geography.
  it('reaches what the page imports, through the demo signalk.js', () => {
    expect(SITE_FILES).toContain('signalk.js')
    expect(PUBLIC_MODULES).not.toContain('signalk.js')
    expect(SITE_FILES).toContain('snapshot.json')
    expect(SITE_FILES.some((name: string) => name.startsWith('vendor/'))).toBe(
      true
    )
  })

  // The config screen is the admin UI, not the page, and it reads the server
  // directly -- copying it would put a dead form on a static host.
  it('leaves the admin UI config screen out', () => {
    expect(SITE_FILES).not.toContain('remoteEntry.js')
    expect(SITE_FILES).not.toContain('config-panel.js')
  })
})

describe('demo/signalk.js stands in for the whole of public/signalk.js', () => {
  it('exports every name the real module does', () => {
    for (const name of Object.keys(real)) {
      expect(demo[name as keyof typeof demo], name).toBeDefined()
    }
  })

  it('answers the same ids, at the paths the real URLs address', () => {
    expect(Object.keys(demo.ENDPOINTS).sort()).toEqual(
      Object.keys(real.ENDPOINTS).sort()
    )
    for (const [id, path] of Object.entries(demo.ENDPOINTS)) {
      if (path === null) continue
      expect(real.ENDPOINTS[id as keyof typeof real.ENDPOINTS], id).toBe(
        `/signalk/v1/api/vessels/self/${path}`
      )
    }
  })

  it('reads values out of the snapshot, and null where it has none', async () => {
    const sk = await withSnapshot(snapshot)
    const data = await sk.readAll(sk.getJson)
    expect(Object.keys(data).sort()).toEqual(Object.keys(sk.ENDPOINTS).sort())
    expect(sk.leafValue(data.f107)).toBeTypeOf('number')
    // The MUF, which nothing publishes yet (issue #82): a path the snapshot
    // does not carry reads as the same null the live page gets from a 404.
    expect(data.muf).toBeNull()
  })

  // A leaf that also carries a child: xray_flux has a trend under it, and the
  // merge must not let the parent's {value} clobber the child or vice versa.
  it('keeps a value and its child subtree on the same node', () => {
    const flux = demo.nodeAt(
      demo.treeFromValues(snapshot.values),
      'environment/noaa/swpc/xray_flux'
    )
    expect(Number.isFinite(demo.leafValue(flux))).toBe(true)
    expect(Number.isFinite(demo.leafValue(flux.trend))).toBe(true)
  })

  // The advisory overlay bails without the bulletin `text`, and no published
  // Signal K path carries it -- only the plugin's own route ever has. So the
  // snapshot saves each route's response and this reads it back whole.
  it('answers a plugin route out of the response the capture saved', async () => {
    const sk = await withSnapshot({
      values: {},
      routes: { advisory: { idLine: 'a', issued: 'b', text: 'c' } }
    })
    const data = await sk.readAll(sk.getJson)
    expect(data.advisory).toEqual({ idLine: 'a', issued: 'b', text: 'c' })
    // A route this capture did not save reads as the same null a 404 gives
    // the live page, rather than as a broken read. The committed snapshot
    // does carry `status` -- see below.
    expect(data.status).toBeNull()
  })

  it('has no distance preference to read, so the page keeps nmi', async () => {
    expect(await demo.distanceUnitPreference()).toBeNull()
  })
})

describe('the demo stands in for the server-only calls', () => {
  it('hands the map the grid the capture saved', async () => {
    const sk = await withSnapshot(snapshot)
    for (const which of ['aurora', 'drap']) {
      const entry = await sk.fetchGridCache(which)
      expect(entry.grid, which).toBeTypeOf('object')
      expect(Number.isNaN(Date.parse(entry.fetchedAt)), which).toBe(false)
    }
  })

  it('marks a grid the capture has not got as not cached, like a 404', async () => {
    const sk = await withSnapshot({
      capturedAt: snapshot.capturedAt,
      grids: {}
    })
    await expect(sk.fetchGridCache('aurora')).rejects.toMatchObject({
      notCached: true
    })
  })

  // The refusal has to sort into a kind the page can label truthfully. 503 is
  // "the plugin is not running", which is what a static page with no plugin
  // behind it actually is; a cooldown would promise that pressing again later
  // works, and an auth failure would send the reader to a login that is not
  // there.
  it('refuses a manual fetch as a plugin that is not running', async () => {
    for (const which of ['aurora', 'drap']) {
      const err = await demo.forceRefresh(which).then(
        () => null,
        (e: any) => e
      )
      expect(err, which).not.toBeNull()
      expect(refreshFailure(err).kind, which).toBe('stopped')
    }
  })
})

// A snapshot that will not load is this page's transport failure. public's
// getJson answers null for one and the page draws its own no-data state; a
// rejection instead escapes refresh() in index.html and freezes the page.
describe('a snapshot that will not load', () => {
  it('is retried, not memoised as a permanent failure', async () => {
    vi.resetModules()
    let calls = 0
    vi.stubGlobal('fetch', async () => {
      if (++calls === 1) throw new Error('offline')
      return { ok: true, json: async () => snapshot }
    })
    const sk = (await import('../demo/signalk.js')) as typeof demo
    await expect(sk.snapshot()).rejects.toThrow()
    expect(await sk.snapshot()).toBeTypeOf('object')
  })

  it('reads as null everywhere rather than rejecting', async () => {
    vi.resetModules()
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline')
    })
    const sk = (await import('../demo/signalk.js')) as typeof demo
    const data = await sk.readAll(sk.getJson)
    for (const [id, value] of Object.entries(data)) expect(value, id).toBeNull()
  })
})

// public/index.html decides for itself whether what it shows is current:
// STALE_MS is three hours, measured against the data's own timestamps. On a
// real clock a saved capture reads "STALE DATA / not an all-clear" from three
// hours after the capture until the end of time -- true of a live install,
// false of a snapshot. So the demo runs on the capture's clock.
describe("the demo's clock", () => {
  const CAPTURED = '2020-06-01T00:00:00.000Z'
  const capturedMs = Date.parse(CAPTURED)

  it('answers the captured instant for the page, and keeps ticking', async () => {
    const sk = await freshDemo()
    sk.adoptCaptureClock(CAPTURED)
    expect(Math.abs(sk.DemoDate.now() - capturedMs)).toBeLessThan(1000)
    expect(Math.abs(new sk.DemoDate().getTime() - capturedMs)).toBeLessThan(
      1000
    )
    // An offset, not a freeze: the hero's countdown and the "since" counters
    // have to keep running.
    const first = sk.DemoDate.now()
    await new Promise((done) => setTimeout(done, 20))
    expect(sk.DemoDate.now()).toBeGreaterThan(first)
  })

  it('leaves `new Date(...)` with arguments exactly as it was', async () => {
    const sk = await freshDemo()
    sk.adoptCaptureClock(CAPTURED)
    // The page parses every NOAA timestamp through this. Shifting an argument
    // would corrupt every reading rather than the one number this is about.
    const iso = '2031-02-03T04:05:06.000Z'
    expect(new sk.DemoDate(iso).toISOString()).toBe(iso)
    expect(new sk.DemoDate(Date.parse(iso)).toISOString()).toBe(iso)
    expect(new sk.DemoDate(2031, 1, 3, 4, 5, 6).getFullYear()).toBe(2031)
    expect(sk.DemoDate.parse(iso)).toBe(Date.parse(iso))
    expect(sk.DemoDate.UTC(2031, 1, 3)).toBe(Date.UTC(2031, 1, 3))
    // A Proxy rather than a subclass, so identity survives.
    expect(new sk.DemoDate() instanceof Date).toBe(true)
    expect(sk.DemoDate.prototype).toBe(Date.prototype)
  })

  it('takes the offset from the snapshot it loads, once', async () => {
    const sk = await withSnapshot({ capturedAt: CAPTURED, values: {} })
    await sk.snapshot()
    expect(Math.abs(sk.DemoDate.now() - capturedMs)).toBeLessThan(1000)
    // The page re-reads the snapshot on every poll. Re-adopting would rewind
    // "now" to the capture each time and freeze the counters.
    const first = sk.DemoDate.now()
    sk.adoptCaptureClock('1999-01-01T00:00:00.000Z')
    expect(sk.DemoDate.now()).toBeGreaterThanOrEqual(first)
  })
})

// The capture is driven off the plugin's PRODUCTS registry (issue #239), so
// what these pin is that the run behind the committed file actually reached
// every product. A snapshot missing one is a blank tile on a published page,
// which nothing else in this suite would notice. They pin NaN at the same
// time: a non-finite number leaves JSON.stringify as `null`, so "is a finite
// number" is the assertion that catches a parser publishing one.
describe('demo/snapshot.json covers what the page draws', () => {
  const tree = demo.treeFromValues(snapshot.values)
  const at = (path: string) => demo.leafValue(demo.nodeAt(tree, path))
  const finite = (path: string) => {
    const value = at(path)
    expect(value, path).toBeTypeOf('number')
    expect(Number.isFinite(value), path).toBe(true)
  }

  it('carries a capture date the page can show and take its clock from', () => {
    expect(Number.isNaN(Date.parse(snapshot.capturedAt))).toBe(false)
  })

  it('answers every endpoint it is meant to, out of one capture', () => {
    // Driven off the endpoint list rather than a copy of it, so an endpoint
    // added to the page is a failing test here until a capture carries it.
    // The exceptions are the paths that read null by design: the two plugin
    // routes, which are answered out of `routes` below, and the MUF, which
    // nothing publishes yet (issue #82).
    const unpublished = new Set(['advisory', 'status', 'muf'])
    for (const [id, path] of Object.entries(demo.ENDPOINTS)) {
      if (unpublished.has(id) || path === null) continue
      expect(demo.nodeAt(tree, path), id).not.toBeNull()
    }
  })

  it('carries a finite number at every scalar the tiles read', () => {
    for (const path of [
      'environment/noaa/swpc/kp/observed',
      'environment/noaa/swpc/kp/forecast/max24h',
      'environment/noaa/swpc/kp/forecast/max72h',
      'environment/noaa/swpc/solar_wind/speed',
      'environment/noaa/swpc/solar_wind/Bt',
      'environment/noaa/swpc/solar_wind/Bz',
      'environment/noaa/swpc/f107',
      'environment/noaa/swpc/a_index',
      'environment/noaa/swpc/sunspot_number',
      'environment/noaa/swpc/xray_flux',
      'environment/noaa/swpc/xray_flux/trend',
      'environment/noaa/swpc/proton_flux',
      // Computed at the vessel out of the cached global grids, so these are
      // the two the capture's chosen position exists for -- the HF band strip
      // is drawn from the D-RAP one. Zero is a real reading here: it means no
      // absorption, not no data, which is why this asks for a finite number
      // rather than a truthy one.
      'environment/noaa/swpc/aurora/probability',
      'environment/noaa/swpc/drap/highest_affected_frequency'
    ])
      finite(path)
  })

  it('carries the three storm scales, observed and forecast', () => {
    for (const scale of ['G', 'S', 'R']) {
      finite(`environment/noaa/swpc/scales/observations/latest/${scale}`)
      finite(
        `environment/noaa/swpc/scales/observations/24_hours_maximums/${scale}`
      )
    }
    // The forecast is shaped differently -- G is a level, R and S are
    // probabilities -- and the hero counts down against all three days.
    for (const day of ['1day', '2day', '3day']) {
      const base = `environment/noaa/swpc/scales/forecast/${day}`
      finite(`${base}/G`)
      finite(`${base}/R/minorProbability`)
      finite(`${base}/S/probability`)
    }
  })

  it('carries a Kp series the chart can draw, with forecast points', () => {
    const series = at('environment/noaa/swpc/kp/forecast/series')
    expect(Array.isArray(series)).toBe(true)
    expect(series.length).toBeGreaterThan(0)
    for (const point of series) {
      expect(Number.isFinite(point.kp), JSON.stringify(point)).toBe(true)
      expect(Number.isNaN(Date.parse(point.time))).toBe(false)
    }
    // The chart splits the line at "now": a capture of observations alone
    // would draw half a chart.
    expect(series.some((point: any) => point.forecast)).toBe(true)
  })

  it('carries the 27-day outlook the long-range panel draws', () => {
    const series = at('environment/noaa/swpc/kp/forecast/outlook27/series')
    expect(Array.isArray(series)).toBe(true)
    expect(series.length).toBeGreaterThan(0)
    for (const day of series) {
      expect(Number.isFinite(day.kp), JSON.stringify(day)).toBe(true)
      expect(Number.isNaN(Date.parse(day.time))).toBe(false)
    }
  })

  it('carries the advisory outlook as plain data', () => {
    const advisory = at('environment/noaa/swpc/advisory_outlook')
    expect(advisory).toBeTypeOf('object')
    expect(Number.isNaN(Date.parse(advisory.issued))).toBe(false)
    expect(advisory.shortId).toBeTypeOf('string')
  })

  it('carries the alerts subtree, whatever NOAA had in force', () => {
    // Present rather than non-empty: nothing in force is a real state of the
    // world, and a capture taken in a quiet week is still a good snapshot.
    // The subtree itself is what proves the product ran -- its metadata is
    // published whether or not there is a message under it.
    const alerts = demo.nodeAt(tree, 'notifications/noaa/swpc/alerts')
    expect(alerts).not.toBeNull()
    for (const [code, node] of Object.entries<any>(alerts)) {
      if (code === 'meta') continue
      const alert = demo.leafValue(node)
      expect(alert.state, code).toBeTypeOf('string')
      expect(alert.message, code).toBeTypeOf('string')
      expect(Number.isNaN(Date.parse(alert.issued)), code).toBe(false)
    }
  })

  it('puts the vessel where the at-vessel values were read', () => {
    const position = at('navigation/position')
    expect(Number.isFinite(position?.latitude)).toBe(true)
    expect(Number.isFinite(position?.longitude)).toBe(true)
  })

  it('carries both grids in the shape the map samplers take', () => {
    expect(Array.isArray(snapshot.grids.aurora.grid.coordinates)).toBe(true)
    const drap = snapshot.grids.drap.grid
    expect(Array.isArray(drap.frequenciesMHz)).toBe(true)
    expect(drap.latitudes.length).toBe(drap.frequenciesMHz.length)
  })

  it('carries the advisory route body the outlook overlay reads', () => {
    // The published paths carry the notification and a summary; only this
    // route has ever served the bulletin itself, and the overlay bails
    // without `text`.
    const advisory = snapshot.routes?.advisory
    expect(advisory?.text).toBeTypeOf('string')
    expect(advisory.text.length).toBeGreaterThan(0)
    expect(advisory.idLine).toBeTypeOf('string')
    expect(Number.isNaN(Date.parse(advisory.issued))).toBe(false)
  })

  // The page reads `status.settings` to decide whether a product is
  // scheduled and how to label its refresh button. With no `status` at all it
  // reads every switch as undefined and tells the visitor automatic updates
  // are off -- a claim about how the plugin runs, made by a page that has the
  // product's data on screen. So the capture saves the settings it ran with,
  // and these pin that they and the data agree.
  it('states the settings the capture ran with, and carries their data', () => {
    const status = snapshot.routes?.status
    expect(Number.isNaN(Date.parse(status?.startedAt))).toBe(false)
    // The three products the plugin gates on a setting. Each is off by
    // default on bandwidth grounds and each is a surface the demo shows, so
    // the capture turns it on and says so.
    const gated: Record<string, string> = {
      auroraEnabled: 'environment/noaa/swpc/aurora/probability',
      drapEnabled: 'environment/noaa/swpc/drap/highest_affected_frequency',
      goesFluxEnabled: 'environment/noaa/swpc/xray_flux'
    }
    for (const [key, path] of Object.entries(gated)) {
      expect(status.settings[key], key).toBe(true)
      expect(demo.nodeAt(tree, path), path).not.toBeNull()
    }
  })

  it('rides metadata on the same node as the value it describes', () => {
    // The HF tile's solar-flux gauge draws its ladder out of published zones
    // (`leafMeta`), so a capture that threw metadata away leaves the gauge
    // with no scale to place the number on.
    const node = demo.nodeAt(tree, 'environment/noaa/swpc/f107')
    expect(Array.isArray(demo.leafMeta(node)?.zones)).toBe(true)
    expect(Number.isFinite(demo.leafValue(node))).toBe(true)
  })
})
