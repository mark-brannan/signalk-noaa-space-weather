import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import createPlugin, { notReadyDelayMs } from '../src/index'

interface Delta {
  updates: any[]
}

function fakeApp() {
  const deltas: Delta[] = []
  return {
    deltas,
    error: vi.fn(),
    debug: vi.fn(),
    setPluginStatus: vi.fn(),
    setPluginError: vi.fn(),
    getSelfPath: vi.fn(() => undefined),
    handleMessage: (_id: string, delta: Delta) => deltas.push(delta)
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

  it('declares every configuration key the plugin reads', () => {
    const properties = createPlugin(fakeApp()).schema.properties
    for (const key of [
      'sendAdvisoryOutlook',
      'sendAlertsWatchesWarnings',
      'notificationVisual',
      'notificationSound',
      'zoneAlertThreshold',
      'observationsInterval',
      'notificationsInterval'
    ]) {
      expect(properties[key], key).toBeTruthy()
      expect(properties[key].default, key).toBeDefined()
    }
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
    plugin.start({ sendAdvisoryOutlook: true, sendAlertsWatchesWarnings: true })
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
    expect(units['environment.noaa.swpc.scales.forecast.1day.S.probability']).toBe(
      'ratio'
    )
  })

  it('survives a fetch failure without an unhandled rejection', async () => {
    const app = fakeApp()
    const plugin = createPlugin(app)
    plugin.start({ sendAdvisoryOutlook: true, sendAlertsWatchesWarnings: true })
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

  it('never backs off longer than the product\'s own interval', () => {
    const minute = 60 * 1000
    for (const attempt of [0, 1, 2, 3, 4, 10]) {
      expect(notReadyDelayMs(attempt, minute)).toBeLessThanOrEqual(minute)
    }
    // ...nor shorter than the base delay, even for an absurd interval.
    expect(notReadyDelayMs(0, 1)).toBe(5000)
  })
})
