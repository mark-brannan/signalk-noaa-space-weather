import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import createPlugin, { notReadyDelayMs } from '../src/index'
import { settingsFrom } from '../src/config'
import { writeAuroraCache } from '../src/cache/auroraCache'
import { writeAdvisoryCache } from '../src/cache/advisoryCache'
import { fixtureJson } from './fixtures'

interface Delta {
  updates: any[]
}

function fakeApp(dataDir?: string, position?: any) {
  const deltas: Delta[] = []
  return {
    deltas,
    error: vi.fn(),
    debug: vi.fn(),
    setPluginStatus: vi.fn(),
    setPluginError: vi.fn(),
    getSelfPath: vi.fn((path: string) =>
      path === 'navigation.position.value' ? position : undefined
    ),
    getDataDirPath: vi.fn(() => dataDir ?? '/nonexistent'),
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

    it('answers 404 with a helpful message when nothing is cached yet', async () => {
      const plugin = createPlugin(fakeApp(dataDir))
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)

      const response = await router.invoke(ROUTE)
      expect(response.status).toBe(404)
      expect(response.json.error).toMatch(/enable aurora/i)
    })

    it('serves back exactly what the aurora product cached', async () => {
      writeAuroraCache(dataDir, { coordinates: [[1, 2, 3]] })
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
      writeAuroraCache(dataDir, grid)
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
      writeAuroraCache(dataDir, {
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
      writeAdvisoryCache(dataDir, {
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
      fetchMock = vi.fn(async () => new Response(AURORA_BODY, { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)
    }

    it('refuses before the plugin has started', async () => {
      const plugin = createPlugin(fakeApp(dataDir, POSITION))
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)

      const response = await router.invoke(ROUTE)
      expect(response.status).toBe(503)
    })

    it('refuses when aurora is disabled in configuration', async () => {
      const plugin = createPlugin(fakeApp(dataDir, POSITION))
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)
      plugin.start({}) // auroraEnabled defaults to false

      const response = await router.invoke(ROUTE)
      expect(response.status).toBe(400)
      plugin.stop()
    })

    it('reports 409 when there is no vessel position to refresh against', async () => {
      const plugin = createPlugin(fakeApp(dataDir, undefined))
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)
      plugin.start({ auroraEnabled: true })

      const response = await router.invoke(ROUTE)
      expect(response.status).toBe(409)
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

  it('declares every configuration key the plugin reads', () => {
    const properties = createPlugin(fakeApp()).schema.properties
    for (const key of [
      'sendAdvisoryOutlook',
      'alarmLevel',
      'auroraEnabled',
      'auroraInterval',
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
      (attempt) => notReadyDelayMs(attempt, hour) / 1000
    )
    expect(seconds).toEqual([5, 10, 20, 40, 80, 160, 300, 300])
  })

  it("never backs off longer than the product's own interval", () => {
    const minute = 60 * 1000
    for (const attempt of [0, 1, 2, 3, 4, 10]) {
      expect(notReadyDelayMs(attempt, minute)).toBeLessThanOrEqual(minute)
    }
    // ...nor shorter than the base delay, even for an absurd interval.
    expect(notReadyDelayMs(0, 1)).toBe(5000)
  })
})
