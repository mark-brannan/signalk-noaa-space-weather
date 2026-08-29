import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import createPlugin, { retryDelayMs } from '../src/index'
import { settingsFrom } from '../src/config'
import {
  AURORA_BASE,
  DRAP_BASE,
  PROTON_FLUX_BASE,
  TELEMETRY_BASE,
  XRAY_FLUX_BASE
} from '../src/paths'
import { ValueUpdate, parseDrapGrid } from '../src/parse'
import { Meta } from '../src/publisher'
import { readAuroraCache, writeAuroraCache } from '../src/cache/auroraCache'
import { readDrapCache, writeDrapCache } from '../src/cache/drapCache'
import { writeAdvisoryCache } from '../src/cache/advisoryCache'
import { fixture, fixtureJson } from './fixtures'
import { fileStore } from './harness.js'

interface Delta {
  updates: any[]
}

/**
 * A test that doesn't care about persistence used to pass no `dataDir` at
 * all and get back the inert '/nonexistent' -- fine as long as nothing ever
 * wrote to it. Tier 3's stop()-time flush (src/meter.ts) means stop() now
 * writes for real whenever a fetch happened during the test, so a caller
 * with no explicit `dataDir` gets a real, disposable one instead, created
 * lazily and only if `getDataDirPath` is actually called.
 */
const fallbackDataDirs: string[] = []

function fakeApp(dataDir?: string, position?: any) {
  const deltas: Delta[] = []
  let resolvedDataDir: string | null = null
  return {
    deltas,
    error: vi.fn(),
    debug: vi.fn(),
    setPluginStatus: vi.fn(),
    setPluginError: vi.fn(),
    getSelfPath: vi.fn((path: string) =>
      path === 'navigation.position.value' ? position : undefined
    ),
    getDataDirPath: vi.fn(() => {
      if (dataDir) return dataDir
      if (!resolvedDataDir) {
        resolvedDataDir = mkdtempSync(join(tmpdir(), 'plugin-fallback-'))
        fallbackDataDirs.push(resolvedDataDir)
      }
      return resolvedDataDir
    }),
    handleMessage: (_id: string, delta: Delta) => deltas.push(delta)
  }
}

/** Captures router.get(path, handler) registrations without a real Express router. */
function fakeRouter() {
  const routes = new Map<string, (req: any, res: any) => any>()
  return {
    get(path: string, handler: (req: any, res: any) => any) {
      routes.set(path, handler)
    },
    // async: route handlers may be async (the force-refresh route awaits a
    // fetch), so this must await whatever the handler returns before the
    // response body is complete.
    async invoke(path: string, params: Record<string, string> = {}) {
      const handler = routes.get(path)
      if (!handler) throw new Error(`no route registered for ${path}`)
      const body: {
        status: number
        json: any
        sent: any
        headers: Record<string, string>
      } = {
        status: 200,
        json: undefined,
        sent: undefined,
        headers: {}
      }
      const res = {
        status(code: number) {
          body.status = code
          return res
        },
        json(payload: any) {
          body.json = payload
        },
        send(payload: any) {
          body.sent = payload
        },
        setHeader(name: string, value: string) {
          body.headers[name] = value
        }
      }
      await handler({ params }, res)
      return body
    }
  }
}

/** Every metadata path emitted by a full start cycle. */
function metaPaths(deltas: Delta[]): string[] {
  return deltas.flatMap((delta) =>
    delta.updates.flatMap((update: any) =>
      (update.meta ?? []).map((meta: any) => meta.path)
    )
  )
}

interface Update {
  meta?: Meta[]
  values?: ValueUpdate[]
}

/** The metadata published for one path, or undefined. */
function metaFor(deltas: Delta[], path: string) {
  return deltas
    .flatMap((delta) => delta.updates as Update[])
    .flatMap((update) => update.meta ?? [])
    .find((meta) => meta.path === path)?.value
}

/** The last value published on one path, or undefined. */
function valueFor(deltas: Delta[], path: string) {
  return deltas
    .flatMap((delta) => delta.updates as Update[])
    .flatMap((update) => update.values ?? [])
    .filter((value) => value.path === path)
    .pop()?.value
}

describe('plugin module', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock = vi.fn(() => Promise.reject(new Error('network disabled')))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    for (const dir of fallbackDataDirs.splice(0))
      rmSync(dir, { recursive: true, force: true })
  })

  it('keeps `main` in package.json, pointing at the built entry point', () => {
    // The server loads plugins with require() on an absolute directory path,
    // and Node's CommonJS resolver ignores `exports` in that case. Removing
    // `main` reintroduces issue #1: "Cannot find module" on install.
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    )
    expect(pkg.main).toBeTruthy()
    expect(existsSync(new URL(`../${pkg.main}`, import.meta.url))).toBe(true)
  })

  it('exposes the Signal K plugin interface', () => {
    const plugin = createPlugin(fakeApp())
    expect(plugin.id).toBe('signalk-noaa-space-weather')
    expect(typeof plugin.start).toBe('function')
    expect(typeof plugin.stop).toBe('function')
    expect(plugin.schema.type).toBe('object')
  })

  describe('GET /signalk-noaa-space-weather/aurora-grid (signalKApiRoutes)', () => {
    const ROUTE = '/signalk-noaa-space-weather/aurora-grid'
    let dataDir: string
    beforeEach(() => {
      dataDir = mkdtempSync(join(tmpdir(), 'plugin-datadir-'))
    })
    afterEach(() => {
      rmSync(dataDir, { recursive: true, force: true })
    })

    it('returns the same router it was given, mountable at /signalk/v1/api', () => {
      const plugin = createPlugin(fakeApp(dataDir))
      const router = fakeRouter()
      expect(plugin.signalKApiRoutes(router)).toBe(router)
    })

    it('answers 404 with an explanation when nothing is cached yet', async () => {
      const plugin = createPlugin(fakeApp(dataDir))
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)

      const response = await router.invoke(ROUTE)
      expect(response.status).toBe(404)
      // An empty cache is not an error the caller can read a stack trace from,
      // so this route owes it a sentence about what would fill it.
      expect(response.json.error.length).toBeGreaterThan(0)
    })

    it('serves back exactly what the aurora product cached', async () => {
      writeAuroraCache(fileStore(dataDir), { coordinates: [[1, 2, 3]] })
      const plugin = createPlugin(fakeApp(dataDir))
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)

      const response = await router.invoke(ROUTE)
      expect(response.status).toBe(200)
      expect(response.json.grid).toEqual({ coordinates: [[1, 2, 3]] })
      expect(typeof response.json.fetchedAt).toBe('string')
    })
  })

  describe('GET /signalk-noaa-space-weather/aurora-tile/:z/:x/:y.png', () => {
    const ROUTE = '/signalk-noaa-space-weather/aurora-tile/:z/:x/:y.png'
    let dataDir: string
    beforeEach(() => {
      dataDir = mkdtempSync(join(tmpdir(), 'plugin-datadir-'))
    })
    afterEach(() => {
      rmSync(dataDir, { recursive: true, force: true })
    })

    function serving(grid: any) {
      writeAuroraCache(fileStore(dataDir), grid)
      const plugin = createPlugin(fakeApp(dataDir))
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)
      return { plugin, router }
    }

    /** A band of aurora across the northern latitudes. */
    const BAND = {
      coordinates: Array.from({ length: 360 }, (_, lon) =>
        Array.from({ length: 181 }, (_, i) => [
          lon,
          i - 90,
          i - 90 > 60 ? 40 : 0
        ])
      ).flat()
    }

    it('answers 404 when no grid has been cached yet', async () => {
      const plugin = createPlugin(fakeApp(dataDir))
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)

      const response = await router.invoke(ROUTE, { z: '2', x: '1', y: '1' })
      expect(response.status).toBe(404)
      expect(response.sent).toBeUndefined()
    })

    it('rejects a tile outside the pyramid without rendering it', async () => {
      const { router } = serving(BAND)
      for (const params of [
        { z: '2', x: '9', y: '0' },
        { z: '99', x: '0', y: '0' },
        { z: 'x', x: '0', y: '0' }
      ]) {
        const response = await router.invoke(ROUTE, params)
        expect(response.status).toBe(400)
        expect(response.sent).toBeUndefined()
      }
    })

    it('serves a PNG for a tile inside the pyramid', async () => {
      const { router } = serving(BAND)
      const response = await router.invoke(ROUTE, { z: '2', x: '1', y: '0' })

      expect(response.status).toBe(200)
      expect(response.headers['Content-Type']).toBe('image/png')
      expect([...response.sent.subarray(0, 8)]).toEqual([
        137, 80, 78, 71, 13, 10, 26, 10
      ])
    })

    it('dates the tile by the fetch behind it, not by the request', async () => {
      const { router } = serving(BAND)
      const cachedAt = readAuroraCache(fileStore(dataDir))!.fetchedAt
      const response = await router.invoke(ROUTE, { z: '2', x: '1', y: '0' })

      // A chart plotter has no equivalent of the webapp's "Cached 21:40", and
      // with the schedule off the grid moves only when somebody presses the
      // button -- so the age has to be on the wire. Second resolution: an
      // HTTP date carries no milliseconds.
      expect(Date.parse(response.headers['Last-Modified'])).toBe(
        Math.floor(Date.parse(cachedAt) / 1000) * 1000
      )
    })

    it('returns the identical buffer on a repeat request', async () => {
      const { router } = serving(BAND)
      const first = await router.invoke(ROUTE, { z: '3', x: '4', y: '2' })
      const second = await router.invoke(ROUTE, { z: '3', x: '4', y: '2' })
      expect(second.sent).toBe(first.sent)
    })

    it('renders from the newer grid after a refresh replaces the cache', async () => {
      const { router } = serving(BAND)
      const before = await router.invoke(ROUTE, { z: '2', x: '1', y: '0' })

      // The cache is keyed on the entry's `fetchedAt`, and these tests run on
      // fake timers, so the clock has to move for a second write to look like
      // a later fetch rather than the same one.
      vi.advanceTimersByTime(1000)

      // Same tile, a grid with nothing in it: a cache keyed only on {z}/{x}/{y}
      // would hand back the previous render forever.
      writeAuroraCache(fileStore(dataDir), {
        coordinates: BAND.coordinates.map(([lon, lat]) => [lon, lat, 0])
      })
      const after = await router.invoke(ROUTE, { z: '2', x: '1', y: '0' })

      expect(after.status).toBe(200)
      expect(after.sent.equals(before.sent)).toBe(false)
      expect(after.headers.ETag).not.toBe(before.headers.ETag)
    })

    it('answers 404 when the cached payload has no usable grid', async () => {
      const { router } = serving({ coordinates: [] })
      const response = await router.invoke(ROUTE, { z: '1', x: '0', y: '0' })
      expect(response.status).toBe(404)
    })
  })

  describe('GET /signalk-noaa-space-weather/drap-tile/:z/:x/:y.png', () => {
    const ROUTE = '/signalk-noaa-space-weather/drap-tile/:z/:x/:y.png'
    const GRID_ROUTE = '/signalk-noaa-space-weather/drap-grid'
    let dataDir: string
    beforeEach(() => {
      dataDir = mkdtempSync(join(tmpdir(), 'plugin-datadir-'))
    })
    afterEach(() => {
      rmSync(dataDir, { recursive: true, force: true })
    })

    const GRID = parseDrapGrid(
      fixture('drap-global-frequencies.2026_08_20.txt')
    )!

    /** A dayside cap over the Atlantic, in NOAA's documented grid shape. */
    function syntheticGrid(peakMHz = 20) {
      const latitudes = Array.from({ length: 90 }, (_, i) => 89 - i * 2)
      const longitudes = Array.from({ length: 90 }, (_, i) => -178 + i * 4)
      return {
        validTime: '2026-08-20T04:42:00.000Z',
        latitudes,
        longitudes,
        frequenciesMHz: latitudes.map((lat) =>
          longitudes.map((lon) =>
            Math.abs(lat) < 40 && Math.abs(lon) < 40 ? peakMHz : 0
          )
        )
      }
    }

    function serving(cached: any = GRID) {
      writeDrapCache(fileStore(dataDir), cached)
      const plugin = createPlugin(fakeApp(dataDir))
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)
      return { plugin, router }
    }

    it('answers 404 when no grid has been cached yet', async () => {
      const plugin = createPlugin(fakeApp(dataDir))
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)
      expect(
        (await router.invoke(ROUTE, { z: '0', x: '0', y: '0' })).status
      ).toBe(404)
      expect((await router.invoke(GRID_ROUTE)).status).toBe(404)
      plugin.stop()
    })

    it('serves the cached grid back for the webapp map', async () => {
      const { plugin, router } = serving()
      const response = await router.invoke(GRID_ROUTE)
      expect(response.status).toBe(200)
      expect(response.json.grid.validTime).toBe(GRID.validTime)
      plugin.stop()
    })

    it('renders a PNG carrying the cache instant, not the aurora one', async () => {
      // Two independent captures on two intervals: a tile cache shared by
      // coordinate alone would serve one product's picture for the other's.
      writeAuroraCache(fileStore(dataDir), { coordinates: [[0, 0, 100]] })
      const { plugin, router } = serving()
      const response = await router.invoke(ROUTE, { z: '0', x: '0', y: '0' })
      expect(response.status).toBe(200)
      expect(response.headers['Content-Type']).toBe('image/png')
      expect(response.sent.subarray(1, 4).toString('ascii')).toBe('PNG')
      expect(response.headers['ETag']).toContain(
        readDrapCache(fileStore(dataDir))!.fetchedAt
      )
      plugin.stop()
    })

    it('rejects a tile outside the pyramid', async () => {
      const { plugin, router } = serving()
      expect(
        (await router.invoke(ROUTE, { z: '99', x: '0', y: '0' })).status
      ).toBe(400)
      plugin.stop()
    })

    it('renders from the newer grid after a refresh replaces the cache', async () => {
      const { plugin, router } = serving(syntheticGrid(20))
      const before = await router.invoke(ROUTE, { z: '1', x: '0', y: '0' })

      // Fake timers again: the memo is keyed on the entry's `fetchedAt`.
      vi.advanceTimersByTime(1000)
      writeDrapCache(fileStore(dataDir), syntheticGrid(0))
      const after = await router.invoke(ROUTE, { z: '1', x: '0', y: '0' })

      expect(after.sent.equals(before.sent)).toBe(false)
      expect(after.headers.ETag).not.toBe(before.headers.ETag)
      plugin.stop()
    })

    /**
     * The two layers hold separate tile caches: they are refreshed on
     * separate schedules, and a D-RAP fetch has no business evicting a
     * screenful of aurora tiles -- or, worse, answering with one.
     */
    it('does not serve aurora tiles from the D-RAP cache, or the reverse', async () => {
      writeAuroraCache(fileStore(dataDir), {
        coordinates: Array.from({ length: 360 }, (_, lon) =>
          Array.from({ length: 181 }, (_, i) => [lon, i - 90, 40])
        ).flat()
      })
      const { plugin, router } = serving(syntheticGrid())

      const auroraTile = await router.invoke(
        '/signalk-noaa-space-weather/aurora-tile/:z/:x/:y.png',
        { z: '1', x: '0', y: '0' }
      )
      const drapTile = await router.invoke(ROUTE, { z: '1', x: '0', y: '0' })
      expect(auroraTile.status).toBe(200)
      expect(drapTile.status).toBe(200)
      expect(drapTile.sent.equals(auroraTile.sent)).toBe(false)
      plugin.stop()
    })

    it('answers 404 when the cached grid is not the shape it must be', async () => {
      const torn = syntheticGrid()
      torn.frequenciesMHz = torn.frequenciesMHz.slice(0, 40)
      const { plugin, router } = serving(torn)
      const response = await router.invoke(ROUTE, { z: '1', x: '0', y: '0' })
      expect(response.status).toBe(404)
      plugin.stop()
    })
  })

  describe('GET /signalk-noaa-space-weather/advisory-outlook (signalKApiRoutes)', () => {
    const ROUTE = '/signalk-noaa-space-weather/advisory-outlook'
    let dataDir: string
    beforeEach(() => {
      dataDir = mkdtempSync(join(tmpdir(), 'plugin-datadir-'))
    })
    afterEach(() => {
      rmSync(dataDir, { recursive: true, force: true })
    })

    it('answers 404 with nothing cached yet', async () => {
      const plugin = createPlugin(fakeApp(dataDir))
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)

      const response = await router.invoke(ROUTE)
      expect(response.status).toBe(404)
    })

    it('serves back exactly what the advisory product cached', async () => {
      writeAdvisoryCache(fileStore(dataDir), {
        issued: '2026-08-03T04:25:00.000Z',
        idLine: 'SPACE WEATHER ADVISORY OUTLOOK #26-30',
        teaser: 'G1 storms expected.',
        text: 'raw bulletin text'
      })
      const plugin = createPlugin(fakeApp(dataDir))
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)

      const response = await router.invoke(ROUTE)
      expect(response.status).toBe(200)
      expect(response.json.text).toBe('raw bulletin text')
      expect(response.json.issued).toBe('2026-08-03T04:25:00.000Z')
    })
  })

  describe('GET /signalk-noaa-space-weather/status (signalKApiRoutes)', () => {
    const ROUTE = '/signalk-noaa-space-weather/status'

    it('answers 503 before the plugin has been started', async () => {
      const plugin = createPlugin(fakeApp())
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)

      const response = await router.invoke(ROUTE)
      expect(response.status).toBe(503)
    })

    it('reports when this run of the plugin began', async () => {
      vi.setSystemTime(new Date('2026-08-12T09:12:00.000Z'))
      const plugin = createPlugin(fakeApp())
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)
      plugin.start(settingsFrom({}))

      const response = await router.invoke(ROUTE)
      expect(response.status).toBe(200)
      expect(response.json.startedAt).toBe('2026-08-12T09:12:00.000Z')

      plugin.stop()
    })

    it('reports the settings it is running, not the ones it was given', async () => {
      const plugin = createPlugin(fakeApp())
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)
      // A superseded key and nothing else: every value the plugin runs on here
      // is one the saved configuration never named, which is exactly the case
      // the configuration panel cannot work out for itself.
      plugin.start({ zoneAlertThreshold: 1 })

      const response = await router.invoke(ROUTE)
      expect(response.json.settings).toEqual(
        settingsFrom({ zoneAlertThreshold: 1 })
      )
      expect(response.json.settings.alarmLevel).toBe(3)

      plugin.stop()
    })

    it('forgets the start time once stopped, so a stale one cannot be served', async () => {
      const plugin = createPlugin(fakeApp())
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)
      plugin.start(settingsFrom({}))
      plugin.stop()

      const response = await router.invoke(ROUTE)
      expect(response.status).toBe(503)
    })

    it('moves the start time forward when the plugin is restarted', async () => {
      const plugin = createPlugin(fakeApp())
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)

      vi.setSystemTime(new Date('2026-08-12T09:12:00.000Z'))
      plugin.start(settingsFrom({}))
      const first = await router.invoke(ROUTE)
      plugin.stop()

      vi.setSystemTime(new Date('2026-08-12T14:30:00.000Z'))
      plugin.start(settingsFrom({}))
      const second = await router.invoke(ROUTE)
      plugin.stop()

      expect(first.json.startedAt).toBe('2026-08-12T09:12:00.000Z')
      expect(second.json.startedAt).toBe('2026-08-12T14:30:00.000Z')
    })
  })

  describe('GET /signalk-noaa-space-weather/telemetry (signalKApiRoutes)', () => {
    const ROUTE = '/signalk-noaa-space-weather/telemetry'

    it('answers 503 before the plugin has been started', async () => {
      const plugin = createPlugin(fakeApp())
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)

      const response = await router.invoke(ROUTE)
      expect(response.status).toBe(503)
    })

    it('reports what the scheduled fetches have actually done', async () => {
      fetchMock = vi.fn(
        async () =>
          new Response(fixture('noaa-scales.2026_08_01.json'), {
            status: 200,
            headers: { 'content-length': '9' }
          })
      )
      vi.stubGlobal('fetch', fetchMock)
      const plugin = createPlugin(fakeApp())
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)
      plugin.start(settingsFrom({}))

      // The initial per-product delay before the first scheduled run.
      await vi.advanceTimersByTimeAsync(10_000)

      const response = await router.invoke(ROUTE)
      expect(response.status).toBe(200)
      expect(response.json.schema).toBe(2)
      expect(response.json.ring.length).toBeGreaterThan(0)
      const scales = response.json.ring.find(
        (r: any) => r.subPath === '/products/noaa-scales.json'
      )
      expect(scales.trigger).toBe('schedule')
      expect(scales.outcome).toBe('ok')
      expect(response.json.hourly['/products/noaa-scales.json']).toBeDefined()

      plugin.stop()
    })
  })

  describe('telemetry Signal K paths', () => {
    const PATHS = [
      `${TELEMETRY_BASE}.bytesPerDay`,
      `${TELEMETRY_BASE}.bytesPerDayPredicted`,
      `${TELEMETRY_BASE}.fetchesPerDay`,
      `${TELEMETRY_BASE}.errorsPerDay`
    ]

    it('publishes metadata for all four paths on start, with no zones', () => {
      const app = fakeApp()
      const plugin = createPlugin(app)
      plugin.start({})
      plugin.stop()

      for (const path of PATHS) {
        const meta = metaFor(app.deltas, path)
        expect(meta, path).toBeDefined()
        expect(meta.displayName, path).toBeTruthy()
        expect(meta.description, path).toBeTruthy()
        // Zones raise notifications; a bandwidth wobble is not an alarm.
        expect(meta, path).not.toHaveProperty('zones')
      }
      expect(metaFor(app.deltas, PATHS[0]).units).toBe('bytes')
      expect(metaFor(app.deltas, PATHS[1]).units).toBe('bytes')
      expect(metaFor(app.deltas, PATHS[2])).not.toHaveProperty('units')
      expect(metaFor(app.deltas, PATHS[3])).not.toHaveProperty('units')
    })

    it('publishes values once a tier-2 bucket has rolled over, not before', async () => {
      fetchMock = vi.fn(
        async () =>
          new Response(fixture('noaa-scales.2026_08_01.json'), {
            status: 200,
            headers: { 'content-length': '9' }
          })
      )
      vi.stubGlobal('fetch', fetchMock)
      const app = fakeApp()
      const plugin = createPlugin(app)
      plugin.start(settingsFrom({}))

      for (const path of PATHS)
        expect(valueFor(app.deltas, path)).toBeUndefined()

      // The initial per-product delay before the first scheduled run --
      // that first fetch opens the very first tier-2 bucket, which is
      // itself a rollover.
      await vi.advanceTimersByTimeAsync(10_000)

      expect(
        valueFor(app.deltas, `${TELEMETRY_BASE}.bytesPerDay`)
      ).toBeGreaterThan(0)
      expect(
        valueFor(app.deltas, `${TELEMETRY_BASE}.bytesPerDayPredicted`)
      ).toBeGreaterThan(0)
      expect(
        valueFor(app.deltas, `${TELEMETRY_BASE}.fetchesPerDay`)
      ).toBeGreaterThan(0)
      expect(valueFor(app.deltas, `${TELEMETRY_BASE}.errorsPerDay`)).toBe(0)

      plugin.stop()
    })
  })

  describe('GET /signalk-noaa-space-weather/aurora-refresh (signalKApiRoutes)', () => {
    const ROUTE = '/signalk-noaa-space-weather/aurora-refresh'
    const POSITION = { latitude: 70, longitude: 20 }
    let dataDir: string

    beforeEach(() => {
      dataDir = mkdtempSync(join(tmpdir(), 'plugin-datadir-'))
    })
    afterEach(() => {
      rmSync(dataDir, { recursive: true, force: true })
    })

    // Serialised once, at import. Building it inside the mock read and parsed
    // 0.88 MB off disk and re-serialised it on every fetch -- imperceptible
    // natively, but the armv7 job runs under QEMU and the rate-limit test
    // fetches several times, which pushed it past its 5s timeout.
    const AURORA_BODY = JSON.stringify(
      fixtureJson('ovation-aurora.2026_08_01.json')
    )

    function stubSuccessfulFetch() {
      // A real Response rather than a hand-rolled shape: this was an object
      // carrying only `json()`, which broke the moment the client started
      // reading the body as text to survive a torn payload. The double should
      // not encode which accessor the client happens to use.
      //
      // Only the aurora URL gets the aurora body. The tests below advance
      // hours of timers, so every other product polls too, and handing each of
      // them 0.88 MB to parse costs seconds under the QEMU armv7 job for a
      // payload none of them can use anyway.
      stubFetch(async () => new Response(AURORA_BODY, { status: 200 }))
    }

    /** `respond` serves the aurora URL; everything else gets an empty body. */
    function stubFetch(respond: () => Promise<Response>) {
      fetchMock = vi.fn(async (url: unknown) =>
        auroraUrl(url) ? respond() : new Response('[]', { status: 200 })
      )
      vi.stubGlobal('fetch', fetchMock)
    }

    const auroraUrl = (url: unknown) =>
      String(url).includes('ovation_aurora_latest')

    /** Aurora fetches only, so a count is not confused by the other products. */
    const auroraFetches = () =>
      fetchMock.mock.calls.filter((call) => auroraUrl(call[0])).length

    it('refuses before the plugin has started', async () => {
      const plugin = createPlugin(fakeApp(dataDir, POSITION))
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)

      const response = await router.invoke(ROUTE)
      expect(response.status).toBe(503)
    })

    it('fetches on demand while the recurring fetch is switched off', async () => {
      stubSuccessfulFetch()
      const app = fakeApp(dataDir, POSITION)
      const plugin = createPlugin(app)
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)
      plugin.start({}) // auroraEnabled defaults to false

      const response = await router.invoke(ROUTE)
      expect(response.status).toBe(200)
      expect(response.json.grid.coordinates.length).toBeGreaterThan(0)
      // The setting says what the plugin may spend on its own initiative. A
      // press is not the plugin's own initiative.
      expect(auroraFetches()).toBe(1)
      expect(valueFor(app.deltas, `${AURORA_BASE}.probability`)).toBeTypeOf(
        'number'
      )
      plugin.stop()
    })

    it('describes the aurora paths before publishing the first on-demand value', async () => {
      stubSuccessfulFetch()
      const app = fakeApp(dataDir, POSITION)
      const plugin = createPlugin(app)
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)
      plugin.start({})

      // start() only describes the products it schedules, so without this the
      // probability arrives as a bare number: no units, no zones, no name.
      expect(metaPaths(app.deltas)).not.toContain(`${AURORA_BASE}.probability`)
      await router.invoke(ROUTE)

      const meta = metaFor(app.deltas, `${AURORA_BASE}.probability`)
      expect(meta.units).toBe('ratio')
      expect(meta.zones.length).toBeGreaterThan(0)
      plugin.stop()
    })

    it('starts no schedule of its own when fetched on demand', async () => {
      stubSuccessfulFetch()
      const plugin = createPlugin(fakeApp(dataDir, POSITION))
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)
      plugin.start({})

      expect((await router.invoke(ROUTE)).status).toBe(200)
      const afterPress = auroraFetches()
      // Twice the default aurora interval. An on-demand fetch that quietly
      // signed the owner up for a recurring 145 KB would be the opposite of
      // what turning the setting off asked for.
      await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000)
      expect(auroraFetches()).toBe(afterPress)

      plugin.stop()
    })

    it('restarts the interval after a manual fetch instead of buying it twice', async () => {
      stubSuccessfulFetch()
      const plugin = createPlugin(fakeApp(dataDir, POSITION))
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)
      plugin.start({ auroraEnabled: true, auroraInterval: 120 })

      await vi.advanceTimersByTimeAsync(10_000) // the initial fetch
      expect(auroraFetches()).toBe(1)

      await vi.advanceTimersByTimeAsync(119 * 60 * 1000)
      expect((await router.invoke(ROUTE)).status).toBe(200)
      expect(auroraFetches()).toBe(2)

      // The scheduled run was a minute away. The data it would fetch has just
      // been fetched, so the clock restarts rather than spending the payload
      // twice a minute apart.
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
      expect(auroraFetches()).toBe(2)

      // Deferred, not cancelled.
      await vi.advanceTimersByTimeAsync(120 * 60 * 1000)
      expect(auroraFetches()).toBe(3)

      plugin.stop()
    })

    it('joins a scheduled fetch already in flight rather than starting a second', async () => {
      let release: () => void = () => {}
      const inFlight = new Promise<void>((resolve) => (release = resolve))
      stubFetch(async () => {
        await inFlight
        return new Response(AURORA_BODY, { status: 200 })
      })
      const plugin = createPlugin(fakeApp(dataDir, POSITION))
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)
      plugin.start({ auroraEnabled: true })

      await vi.advanceTimersByTimeAsync(10_000) // the scheduled run, now waiting on NOAA
      expect(auroraFetches()).toBe(1)

      // Deferring the next run cannot help here: the timer has already fired.
      // Two requests for the same grid would race to write the same cache file.
      const pressed = router.invoke(ROUTE)
      release()
      expect((await pressed).status).toBe(200)
      expect(auroraFetches()).toBe(1)

      plugin.stop()
    })

    it('counts a scheduled fetch against the cooldown, not just a press', async () => {
      stubSuccessfulFetch()
      const plugin = createPlugin(fakeApp(dataDir, POSITION))
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)
      plugin.start({ auroraEnabled: true })

      await vi.advanceTimersByTimeAsync(10_000)
      expect(auroraFetches()).toBe(1)

      // Pressing seconds after a scheduled fetch would buy the same grid
      // again, which is what the cooldown is there to stop.
      const response = await router.invoke(ROUTE)
      expect(response.status).toBe(429)
      expect(auroraFetches()).toBe(1)

      plugin.stop()
    })

    it('does not report a refresh that produced nothing as a success', async () => {
      writeAuroraCache(fileStore(dataDir), { coordinates: [[1, 2, 3]] })
      const stale = readFileSync(join(dataDir, 'aurora-grid.json'), 'utf8')
      // Well-formed JSON carrying no usable grid: `refresh()` logs and returns,
      // without throwing and without writing anything.
      stubFetch(async () => new Response('{"nope":true}', { status: 200 }))
      const plugin = createPlugin(fakeApp(dataDir, POSITION))
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)
      plugin.start({})

      const response = await router.invoke(ROUTE)
      // Answering 200 with the previous grid would report a refresh that did
      // not happen, over a reading that has not moved.
      expect(response.status).toBe(502)
      expect(readFileSync(join(dataDir, 'aurora-grid.json'), 'utf8')).toBe(
        stale
      )

      plugin.stop()
    })

    it('refreshes with no vessel position at all, and caches the grid', async () => {
      stubSuccessfulFetch()
      const app = fakeApp(dataDir, undefined)
      let position: typeof POSITION | undefined = undefined
      app.getSelfPath = vi.fn((path: string) =>
        path === 'navigation.position.value' ? position : undefined
      )
      const plugin = createPlugin(app)
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)
      plugin.start({})

      // The grid is what was asked for and the grid arrived. Nothing about a
      // global payload needs to know where the boat is.
      const response = await router.invoke(ROUTE)
      expect(response.status).toBe(200)
      expect(auroraFetches()).toBe(1)
      expect(response.json.grid.coordinates.length).toBeGreaterThan(0)

      // And the value at the boat lands once the fix does, off that same
      // capture -- no second fetch.
      position = POSITION
      await vi.advanceTimersByTimeAsync(10_000)
      expect(auroraFetches()).toBe(1)
      expect(
        app.deltas
          .flatMap((d) => d.updates)
          .flatMap((u: any) => u.values ?? [])
          .some(
            (v: any) => v.path === 'environment.noaa.swpc.aurora.probability'
          )
      ).toBe(true)

      plugin.stop()
    })

    it('fetches fresh data on demand and returns the newly cached grid', async () => {
      stubSuccessfulFetch()
      const plugin = createPlugin(fakeApp(dataDir, POSITION))
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)
      plugin.start({ auroraEnabled: true })

      const response = await router.invoke(ROUTE)
      expect(response.status).toBe(200)
      expect(typeof response.json.fetchedAt).toBe('string')
      expect(response.json.grid.coordinates.length).toBeGreaterThan(0)
      // This is the point of the route: a fetch happened right now, not on
      // whatever the configured interval is.
      expect(fetchMock).toHaveBeenCalledTimes(1)
      plugin.stop()
    })

    it('rate-limits repeat requests instead of hammering NOAA', async () => {
      stubSuccessfulFetch()
      const plugin = createPlugin(fakeApp(dataDir, POSITION))
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)
      plugin.start({ auroraEnabled: true })

      const first = await router.invoke(ROUTE)
      expect(first.status).toBe(200)

      const second = await router.invoke(ROUTE)
      expect(second.status).toBe(429)
      expect(second.headers['Retry-After']).toBeDefined()
      expect(fetchMock).toHaveBeenCalledTimes(1) // the second call never reached the network

      plugin.stop()
    })

    it('allows another refresh once the cooldown has elapsed', async () => {
      stubSuccessfulFetch()
      const plugin = createPlugin(fakeApp(dataDir, POSITION))
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)
      plugin.start({ auroraEnabled: true })

      expect((await router.invoke(ROUTE)).status).toBe(200)
      const callsAfterFirst = fetchMock.mock.calls.length
      // Past the cooldown, not the scheduled interval: this crosses every
      // enabled product's own INITIAL_DELAY_MS too, so the network gets
      // busier than just this route -- the assertion below only needs "at
      // least one more fetch happened", not an exact count.
      await vi.advanceTimersByTimeAsync(60_000)
      expect((await router.invoke(ROUTE)).status).toBe(200)
      expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterFirst)

      plugin.stop()
    })
  })

  describe('GET /signalk-noaa-space-weather/drap-refresh (signalKApiRoutes)', () => {
    const ROUTE = '/signalk-noaa-space-weather/drap-refresh'
    const POSITION = { latitude: 41, longitude: -178 }
    let dataDir: string

    beforeEach(() => {
      dataDir = mkdtempSync(join(tmpdir(), 'plugin-datadir-'))
    })
    afterEach(() => {
      rmSync(dataDir, { recursive: true, force: true })
    })

    const DRAP_BODY = fixture('drap-global-frequencies.2026_08_20.txt')
    const drapUrl = (url: unknown) =>
      String(url).includes('drap_global_frequencies')

    function stubSuccessfulFetch() {
      fetchMock = vi.fn(async (url: unknown) =>
        drapUrl(url)
          ? new Response(DRAP_BODY, { status: 200 })
          : new Response('[]', { status: 200 })
      )
      vi.stubGlobal('fetch', fetchMock)
    }

    const drapFetches = () =>
      fetchMock.mock.calls.filter((call) => drapUrl(call[0])).length

    it('fetches on demand while the recurring fetch is switched off', async () => {
      stubSuccessfulFetch()
      const plugin = createPlugin(fakeApp(dataDir, POSITION))
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)
      plugin.start({ drapEnabled: false })

      const response = await router.invoke(ROUTE)
      expect(response.status).toBe(200)
      expect(response.json.grid.validTime).toBe('2026-08-20T04:42:00.000Z')
      expect(drapFetches()).toBe(1)

      plugin.stop()
    })

    it('publishes the metadata an unscheduled product never got', async () => {
      stubSuccessfulFetch()
      const app = fakeApp(dataDir, POSITION)
      const plugin = createPlugin(app)
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)
      plugin.start({ drapEnabled: false })

      const path = `${DRAP_BASE}.highest_affected_frequency`
      expect(metaPaths(app.deltas)).not.toContain(path)
      await router.invoke(ROUTE)
      expect(metaFor(app.deltas, path).units).toBe('Hz')

      plugin.stop()
    })

    it('starts no schedule of its own, even when it has to wait for a fix', async () => {
      stubSuccessfulFetch()
      const app = fakeApp(dataDir, undefined)
      let position: typeof POSITION | undefined = undefined
      app.getSelfPath = vi.fn((path: string) =>
        path === 'navigation.position.value' ? position : undefined
      )
      const plugin = createPlugin(app)
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)
      plugin.start({ drapEnabled: false })

      expect((await router.invoke(ROUTE)).status).toBe(200)
      expect(drapFetches()).toBe(1)

      // The value at the boat is still owed, and arrives off the capture
      // already on disk.
      position = POSITION
      await vi.advanceTimersByTimeAsync(10_000)
      expect(
        app.deltas
          .flatMap((d) => d.updates)
          .flatMap((u: any) => u.values ?? [])
          .some(
            (v: any) => v.path === `${DRAP_BASE}.highest_affected_frequency`
          )
      ).toBe(true)
      // Paying that debt must not leave a recurring fetch behind for a
      // product the owner switched off.
      expect(drapFetches()).toBe(1)
      await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000)
      expect(drapFetches()).toBe(1)

      plugin.stop()
    })
  })

  describe('goesFluxEnabled', () => {
    const ROUTE = '/signalk-noaa-space-weather/goesflux-refresh'
    const XRAY = fixtureJson('xrays-6-hour.2026_08_20.json')
    const PROTONS = fixtureJson('integral-protons-6-hour.2026_08_20.json')
    const goesUrl = (url: unknown) =>
      String(url).includes('xrays-6-hour') ||
      String(url).includes('integral-protons-6-hour')

    function stubSuccessfulFetch() {
      fetchMock = vi.fn(async (url: unknown) => {
        if (String(url).includes('xrays-6-hour'))
          return new Response(JSON.stringify(XRAY), { status: 200 })
        if (String(url).includes('integral-protons-6-hour'))
          return new Response(JSON.stringify(PROTONS), { status: 200 })
        return new Response('[]', { status: 200 })
      })
      vi.stubGlobal('fetch', fetchMock)
    }

    const goesFetches = () =>
      fetchMock.mock.calls.filter((call) => goesUrl(call[0])).length

    /**
     * The real server answers `getSelfPath` out of the model the plugin's own
     * deltas update, which is what both `goesFlux` (to skip an unchanged
     * channel) and the refresh route (to tell a reading from nothing) rely on.
     * The bare fake answers `undefined` for everything, so replay the deltas.
     */
    function selfPathFromDeltas(app: ReturnType<typeof fakeApp>) {
      app.getSelfPath = vi.fn((path: string) => {
        const wanted = path.replace(/\.value$/, '')
        let found: any = undefined
        for (const delta of app.deltas)
          for (const update of delta.updates)
            for (const value of update.values ?? [])
              if (value.path === wanted) found = value.value
        return found
      })
      return app
    }

    const published = (app: ReturnType<typeof fakeApp>, path: string) =>
      app.deltas
        .flatMap((d) => d.updates)
        .flatMap((u: any) => u.values ?? [])
        .filter((v: any) => v.path === path)

    it('fetches nothing on a fresh install, and leaves the rest of the poll alone', () => {
      // The default, not a choice: an install that has never opened the
      // configuration screen must not be charged 775 KB a day for this.
      stubSuccessfulFetch()
      const plugin = createPlugin(fakeApp())
      plugin.start({})

      vi.advanceTimersByTime(10_000)
      expect(goesFetches()).toBe(0)
      // The toggle is the product's, not the poll's: everything else on
      // `updateInterval` still went out.
      expect(fetchMock.mock.calls.length).toBeGreaterThan(0)

      plugin.stop()
    })

    it('publishes no flux metadata for a product it does not schedule', () => {
      stubSuccessfulFetch()
      const app = fakeApp()
      const plugin = createPlugin(app)
      plugin.start({})

      expect(metaPaths(app.deltas)).not.toContain(XRAY_FLUX_BASE)
      expect(metaPaths(app.deltas)).not.toContain(PROTON_FLUX_BASE)

      plugin.stop()
    })

    it('follows goesFluxInterval rather than updateInterval', async () => {
      stubSuccessfulFetch()
      const plugin = createPlugin(fakeApp())
      plugin.start({
        goesFluxEnabled: true,
        updateInterval: 60,
        goesFluxInterval: 180
      })

      await vi.advanceTimersByTimeAsync(10_000)
      expect(goesFetches()).toBe(2) // one window each, on the initial run
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
      expect(goesFetches()).toBe(2) // the hourly poll is not its poll
      await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000)
      expect(goesFetches()).toBe(4)

      plugin.stop()
    })

    it('fetches on demand while the recurring fetch is switched off', async () => {
      stubSuccessfulFetch()
      const app = selfPathFromDeltas(fakeApp())
      const plugin = createPlugin(app)
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)
      plugin.start({}) // the default, which is off

      const response = await router.invoke(ROUTE)
      expect(response.status).toBe(200)
      expect(response.json.xrayFlux).toBeGreaterThan(0)
      expect(response.json.protonFlux).toBeGreaterThan(0)
      expect(goesFetches()).toBe(2)

      plugin.stop()
    })

    it('publishes the metadata an unscheduled product never got', async () => {
      stubSuccessfulFetch()
      const app = selfPathFromDeltas(fakeApp())
      const plugin = createPlugin(app)
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)
      plugin.start({})

      expect(metaPaths(app.deltas)).not.toContain(XRAY_FLUX_BASE)
      await router.invoke(ROUTE)
      expect(metaFor(app.deltas, XRAY_FLUX_BASE).units).toBe('W/m2')
      expect(metaFor(app.deltas, PROTON_FLUX_BASE).units).toBe('m-2.s-1.sr-1')

      plugin.stop()
    })

    it('starts no schedule of its own', async () => {
      stubSuccessfulFetch()
      const app = selfPathFromDeltas(fakeApp())
      const plugin = createPlugin(app)
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)
      plugin.start({})

      expect((await router.invoke(ROUTE)).status).toBe(200)
      expect(goesFetches()).toBe(2)
      await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000)
      expect(goesFetches()).toBe(2)

      plugin.stop()
    })

    it('answers 502 when neither channel came back', async () => {
      fetchMock = vi.fn(async () => new Response('[]', { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)
      const app = selfPathFromDeltas(fakeApp())
      const plugin = createPlugin(app)
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)
      plugin.start({})

      expect((await router.invoke(ROUTE)).status).toBe(502)

      plugin.stop()
    })

    it('publishes no NaN on either path, scheduled or on demand', async () => {
      stubSuccessfulFetch()
      const app = selfPathFromDeltas(fakeApp())
      const plugin = createPlugin(app)
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)
      plugin.start({ goesFluxEnabled: true })

      await vi.advanceTimersByTimeAsync(10_000)
      await router.invoke(ROUTE)
      const values = [
        ...published(app, XRAY_FLUX_BASE),
        ...published(app, PROTON_FLUX_BASE),
        ...published(app, `${XRAY_FLUX_BASE}.trend`)
      ]
      expect(values.length).toBeGreaterThan(0)
      for (const value of values) expect(Number.isNaN(value.value)).toBe(false)

      plugin.stop()
    })
  })

  it('declares every configuration key the plugin reads', () => {
    const properties = createPlugin(fakeApp()).schema.properties
    for (const key of [
      'sendAdvisoryOutlook',
      'alarmLevel',
      'auroraEnabled',
      'auroraInterval',
      'drapEnabled',
      'drapInterval',
      'goesFluxEnabled',
      'goesFluxInterval',
      'updateInterval'
    ]) {
      expect(properties[key], key).toBeTruthy()
      expect(properties[key].default, key).toBeDefined()
    }
  })

  it('offers no setting the plugin does not resolve', () => {
    // The other direction, and the one that rots: a property left in the schema
    // after the code stopped reading it is a dial that visibly does nothing.
    const properties = createPlugin(fakeApp()).schema.properties
    const resolved = Object.keys(settingsFrom({}))
    expect(Object.keys(properties).sort()).toEqual(resolved.sort())
  })

  it('touches the network only after the initial delay, not during start', () => {
    const plugin = createPlugin(fakeApp())
    plugin.start({})
    expect(fetchMock).not.toHaveBeenCalled()
    plugin.stop()
  })

  it('makes no further requests once stopped', async () => {
    // Only the repeating intervals used to be tracked, so a stop inside the
    // first five seconds left the initial timeout pending and it still fired.
    const plugin = createPlugin(fakeApp())
    plugin.start({ sendAdvisoryOutlook: true })
    plugin.stop()

    await vi.advanceTimersByTimeAsync(10_000)
    expect(fetchMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('starts and stops repeatedly without leaking work', async () => {
    const plugin = createPlugin(fakeApp())
    for (let i = 0; i < 3; i++) {
      plugin.start({})
      plugin.stop()
    }
    await vi.advanceTimersByTimeAsync(10_000)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('publishes metadata for the paths it will populate', async () => {
    const app = fakeApp()
    const plugin = createPlugin(app)
    plugin.start({})
    await vi.advanceTimersByTimeAsync(6_000)
    plugin.stop()

    const paths = metaPaths(app.deltas)
    // Both observation ranges must be described. Until 0.2.0 the "latest
    // observed" metadata was written to the 24-hour maximum paths, so
    // observations.latest.* carried none at all.
    for (const path of [
      'environment.noaa.swpc.scales.observations.latest.G',
      'environment.noaa.swpc.scales.observations.24_hours_maximums.G',
      'environment.noaa.swpc.scales.forecast.1day.S.probability',
      'environment.noaa.swpc.scales.forecast.3day.R.majorProbability',
      'environment.noaa.swpc.kp.observed',
      'environment.noaa.swpc.kp.forecast.max24h',
      'environment.noaa.swpc.solar_wind.speed',
      'environment.noaa.swpc.solar_wind.Bt',
      'environment.noaa.swpc.solar_wind.Bz'
    ]) {
      expect(paths, path).toContain(path)
    }
  })

  it('emits no duplicate metadata paths', () => {
    const app = fakeApp()
    const plugin = createPlugin(app)
    plugin.start({})
    vi.advanceTimersByTime(6_000)
    plugin.stop()

    const paths = metaPaths(app.deltas)
    expect(paths.length).toBe(new Set(paths).size)
  })

  it('declares SI units on the paths that carry a physical quantity', () => {
    const app = fakeApp()
    const plugin = createPlugin(app)
    plugin.start({})
    vi.advanceTimersByTime(6_000)
    plugin.stop()

    const units: Record<string, string> = {}
    for (const delta of app.deltas) {
      for (const update of delta.updates) {
        for (const meta of update.meta ?? []) {
          if (meta.value?.units) units[meta.path] = meta.value.units
        }
      }
    }
    expect(units['environment.noaa.swpc.solar_wind.speed']).toBe('m/s')
    expect(units['environment.noaa.swpc.solar_wind.Bt']).toBe('T')
    expect(units['environment.noaa.swpc.solar_wind.Bz']).toBe('T')
    expect(
      units['environment.noaa.swpc.scales.forecast.1day.S.probability']
    ).toBe('ratio')
  })

  it('declares no units at all on the dimensionless indices', () => {
    // The admin UI renders the string verbatim, so `units: "none"` displays as
    // "2 none". The G/S/R levels and Kp are dimensionless and must carry no
    // `units` key -- the assertion above only checks the physical paths, so a
    // stray unit on a level would have gone unnoticed.
    const app = fakeApp()
    const plugin = createPlugin(app)
    plugin.start({})
    vi.advanceTimersByTime(6_000)
    plugin.stop()

    const dimensionless = /\.(kp|kp\.observed|scales\.[^.]+\.[^.]+\.[GSR])$/
    let checked = 0
    for (const delta of app.deltas) {
      for (const update of delta.updates) {
        for (const meta of update.meta ?? []) {
          if (!dimensionless.test(meta.path)) continue
          checked++
          expect(meta.value, meta.path).not.toHaveProperty('units')
        }
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('survives a fetch failure without an unhandled rejection', async () => {
    const app = fakeApp()
    const plugin = createPlugin(app)
    plugin.start({ sendAdvisoryOutlook: true })
    await vi.advanceTimersByTimeAsync(6_000)
    plugin.stop()

    expect(fetchMock).toHaveBeenCalled()
    expect(app.error).toHaveBeenCalled()
  })

  it('backs off geometrically while a product is not ready', () => {
    // A GPS fix normally lands in seconds, so look again quickly at first —
    // but a dev server or a boat with no GPS at all must settle into a quiet
    // heartbeat rather than retrying every few seconds forever.
    const hour = 60 * 60 * 1000
    const seconds = [0, 1, 2, 3, 4, 5, 6, 9].map(
      (attempt) => retryDelayMs(attempt, hour) / 1000
    )
    expect(seconds).toEqual([5, 10, 20, 40, 80, 160, 300, 300])
  })

  it("never backs off longer than the product's own interval", () => {
    const minute = 60 * 1000
    for (const attempt of [0, 1, 2, 3, 4, 10]) {
      expect(retryDelayMs(attempt, minute)).toBeLessThanOrEqual(minute)
    }
    // ...nor shorter than the base delay, even for an absurd interval.
    expect(retryDelayMs(0, 1)).toBe(5000)
  })
})
