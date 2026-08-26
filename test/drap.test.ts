import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { describe, expect, it } from 'vitest'
import { readDrapCache } from '../src/cache/drapCache'
import { settingsFrom } from '../src/config'
import { drap } from '../src/products/drap'
import { fixture } from './fixtures'

const REAL = 'drap-global-frequencies.2026_08_20.txt'

function harness(position: any, response?: string) {
  // A real directory, not a stub that throws: the grid the map and the tile
  // route draw is written here, so a product that stopped writing it would
  // otherwise pass every test while the map went blank.
  const dataDir = mkdtempSync(`${tmpdir()}/drap-test-`)
  const published: any[] = []
  const errors: string[] = []
  const fetched: string[] = []
  const publisher = {
    meta: () => {},
    values: (values: any[]) => published.push(...values),
    value(path: string, value: any) {
      published.push({ path, value })
    },
    selfPath: (p: string) => {
      if (p === 'navigation.position.value') return position
      // Answers what this harness has already published, the same way
      // products.test.ts's shared harness does, so the dedup check in
      // drap.ts sees what a server would show it.
      const match = p.match(/^(.+)\.value$/)
      return match
        ? published.find((v) => v.path === match[1])?.value
        : undefined
    },
    status: () => {},
    fail: () => {},
    error: (m: string) => errors.push(m),
    debug: () => {},
    dataDirPath: () => dataDir
  }
  const client = {
    json: async () => {
      throw new Error('unstubbed json call')
    },
    text: async (subPath: string) => {
      fetched.push(subPath)
      return response ?? ''
    }
  }
  return {
    dataDir,
    cached: () => readDrapCache(dataDir),
    published,
    errors,
    fetched,
    ctx: {
      client,
      publisher,
      settings: settingsFrom({}),
      stopped: () => false
    },
    valueAt: (path: string) => published.find((v) => v.path === path)?.value
  }
}

describe('D-RAP product', () => {
  it('publishes the highest affected frequency at the vessel position, in Hz', async () => {
    // 41N/-178E is an exact grid point in the fixture: 2.9 MHz.
    const h = harness({ latitude: 41, longitude: -178 }, fixture(REAL))
    await drap.refresh(h.ctx as any)

    expect(h.errors).toEqual([])
    expect(
      h.valueAt('environment.noaa.swpc.drap.highest_affected_frequency')
    ).toBeCloseTo(2.9e6, 0)
    expect(h.valueAt('environment.noaa.swpc.drap.validTime')).toBe(
      '2026-08-20T04:42:00.000Z'
    )
  })

  it('caches the whole grid for the map and the tile route', async () => {
    const h = harness({ latitude: 41, longitude: -178 }, fixture(REAL))
    await drap.refresh(h.ctx as any)

    const cached = h.cached()
    expect(cached?.grid.validTime).toBe('2026-08-20T04:42:00.000Z')
    expect(cached?.grid.latitudes.length).toBe(90)
    expect(cached?.grid.frequenciesMHz.length).toBe(90)
  })

  it('still fetches and caches with no position, publishing nothing', async () => {
    // Unlike aurora: the grid is the map's data, and it is readable without
    // knowing where the boat is. Only the vessel's own cell needs a fix.
    for (const bad of [undefined, {}, { latitude: 'x', longitude: 2 }]) {
      const h = harness(bad, fixture(REAL))
      const result = await drap.refresh(h.ctx as any)

      expect(h.fetched).toEqual(['/text/drap_global_frequencies.txt'])
      expect(h.published).toEqual([])
      expect(h.errors).toEqual([])
      expect(result).not.toBe('not-ready')
      expect(h.cached()?.grid.latitudes.length).toBe(90)
    }
  })

  it('publishes the value even when the cache cannot be written', async () => {
    const h = harness({ latitude: 41, longitude: -178 }, fixture(REAL))
    h.ctx.publisher.dataDirPath = () => '/nonexistent/directory'
    await drap.refresh(h.ctx as any)

    expect(h.errors.length).toBe(1)
    expect(
      h.valueAt('environment.noaa.swpc.drap.highest_affected_frequency')
    ).toBeCloseTo(2.9e6, 0)
  })

  it('reports a malformed payload without publishing', async () => {
    const h = harness({ latitude: 41, longitude: -178 }, 'not a drap grid')
    await drap.refresh(h.ctx as any)
    expect(h.published).toEqual([])
    expect(h.errors.length).toBe(1)
  })

  it('does not rebroadcast a reading that has not moved', async () => {
    const h = harness({ latitude: 41, longitude: -178 }, fixture(REAL))
    await drap.refresh(h.ctx as any)
    await drap.refresh(h.ctx as any)

    expect(h.errors).toEqual([])
    expect(h.published.length).toBe(2) // one refresh's worth: frequency + validTime
  })
})

describe('the D-RAP switch', () => {
  it('is on unless the saved config says otherwise', () => {
    // A config saved before this setting existed was already fetching D-RAP,
    // so an absent key must not silently stop publishing the path.
    expect(drap.enabled!(settingsFrom({}))).toBe(true)
    expect(drap.enabled!(settingsFrom({ drapEnabled: false }))).toBe(false)
    expect(drap.enabled!(settingsFrom({ drapEnabled: true }))).toBe(true)
  })
})
