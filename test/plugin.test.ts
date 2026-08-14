import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import createPlugin, { notReadyDelayMs } from '../src/index'
import { settingsFrom } from '../src/config'
import { AURORA_BASE } from '../src/paths'
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

/** The metadata published for one path, or undefined. */
function metaFor(deltas: Delta[], path: string): any {
  return deltas
    .flatMap((delta) =>
      delta.updates.flatMap((update: any) => update.meta ?? [])
    )
    .find((meta: any) => meta.path === path)?.value
}

/** The last value published on one path, or undefined. */
function valueFor(deltas: Delta[], path: string): any {
  return deltas
    .flatMap((delta) =>
      delta.updates.flatMap((update: any) => update.values ?? [])
    )
    .filter((value: any) => value.path === path)
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
      fetchMock = vi.fn(async (url: any) =>
        auroraUrl(url)
          ? new Response(AURORA_BODY, { status: 200 })
          : new Response('[]', { status: 200 })
      )
      vi.stubGlobal('fetch', fetchMock)
    }

    const auroraUrl = (url: any) =>
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

    it('does not charge the cooldown for a request that never reached NOAA', async () => {
      stubSuccessfulFetch()
      const app = fakeApp(dataDir, undefined)
      let position: any = undefined
      app.getSelfPath = vi.fn((path: string) =>
        path === 'navigation.position.value' ? position : undefined
      )
      const plugin = createPlugin(app)
      const router = fakeRouter()
      plugin.signalKApiRoutes(router)
      plugin.start({})

      expect((await router.invoke(ROUTE)).status).toBe(409)
      expect(auroraFetches()).toBe(0)

      // The fix arrives, and the boat that has been waiting for it is not then
      // made to wait out a cooldown for traffic it never sent.
      position = POSITION
      expect((await router.invoke(ROUTE)).status).toBe(200)

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
