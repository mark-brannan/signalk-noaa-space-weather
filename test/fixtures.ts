import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { settingsFrom } from '../src/config.js'
import { Client } from '../src/noaa/client.js'
import { ValueUpdate } from '../src/parse.js'
import { Meta, Publisher } from '../src/publisher.js'
import { ProductContext } from '../src/products/types.js'
import { scales as scalesProduct } from '../src/products/scales.js'
import { ENDPOINTS } from '../public/signalk.js'

/**
 * Captured NOAA payloads live in examples/ and are the only input these tests
 * use. Nothing here touches the network; offline.test.ts asserts that.
 */
export function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../examples/${name}`, import.meta.url)),
    'utf8'
  )
}

export function fixtureJson(name: string): any {
  return JSON.parse(fixture(name))
}

export const ALERT_FIXTURES = [
  'alerts.2025_04_11.json',
  'alerts.2025_04_17.json',
  'alerts.2026_08_01.json'
]

export const SCALES_FIXTURES = [
  'noaa-scales.2025_04_08.json',
  'noaa-scales.2025_04_10.json',
  'noaa-scales.2025_04_13.json',
  'noaa-scales.2025_04_16.json',
  'noaa-scales.2025_04_18.json',
  'noaa-scales.2026_08_01.json',
  // The payload behind issue #120: R2 in the 24-hour maximum, R0 in the
  // instantaneous reading the badges used to draw.
  'noaa-scales.2026_08_25.json'
]

export const ADVISORY_FIXTURES = [
  'advisory-outlook.2025_04_02.txt',
  'advisory-outlook.2025_04_11.txt',
  'advisory-outlook.2025_04_14.txt',
  'advisory-outlook.2025_04_18.txt',
  'advisory-outlook.2026_08_01.txt',
  'advisory-outlook.2026_08_03.txt'
]

/**
 * Invented payloads, in `examples/synthetic/`. Real captures prove what NOAA
 * does send; these prove the plugin survives what it might -- and, more to the
 * point of #120, they carry the value combinations a real quiet sky never
 * produces. `synthetic-fixtures.test.ts` asserts this list names every file in
 * that directory, so one added and never read cannot go unnoticed.
 */
export const SYNTHETIC_SCALES_FIXTURES = [
  'noaa-scales.all-slots-distinct.json',
  'noaa-scales.storm-in-progress.json',
  'noaa-scales.quiet-with-forecast.json',
  'noaa-scales.solar-radiation-only.json',
  'noaa-scales.extreme-all.json'
]

export const SYNTHETIC_HOSTILE_SCALES_FIXTURES = [
  'noaa-scales.hostile-types.json',
  'noaa-scales.hostile-missing-observed.json',
  'noaa-scales.hostile-out-of-range.json'
]

export const SYNTHETIC_FLARE_FIXTURES = [
  'xray-flares-latest.x-class-peaked.json',
  'xray-flares-latest.x-class-rising.json',
  'xray-flares-latest.hostile-empty.json',
  'xray-flares-latest.hostile-nulls.json'
]

/**
 * Neither is valid JSON, on purpose: read as text, never parsed directly.
 *
 * The two halves of what a read landing mid-rewrite looks like. NOAA rewrites
 * these files in place, so a *shorter* new payload leaves the tail of the
 * longer old one behind -- that is the torn-with-tail one, and it has a
 * complete leading value to recover. The truncated one does not, and must not
 * be recovered into a half value.
 */
export const SYNTHETIC_TRUNCATED_FIXTURE = 'noaa-scales.hostile-truncated.json'
export const SYNTHETIC_TORN_FIXTURE = 'noaa-scales.hostile-torn-with-tail.json'

export const SYNTHETIC_TEXT_FIXTURES = [
  'wwv.no-storms.txt',
  'wwv.all-three-storms.txt',
  'drap-global-frequencies.warning-in-force.txt'
]

export const AURORA_FIXTURES = ['ovation-aurora.2026_08_01.json']

export const OUTLOOK27_FIXTURES = ['27-day-outlook.2026_08_12.txt']

export const KP_FORECAST_FIXTURES = [
  'noaa-planetary-k-index-forecast.2025_04_10.json',
  'noaa-planetary-k-index-forecast.2025_04_11.json',
  'noaa-planetary-k-index-forecast.2025_04_17.json',
  'noaa-planetary-k-index-forecast.2026_08_01.json'
]

export const FLARE_ENDPOINT = '/json/goes/primary/xray-flares-latest.json'

/**
 * The point of the products/ split: a product can be exercised with a fake
 * client and a fake publisher, with no server, no timers and no network. Each
 * caller drives the real refresh path over a captured payload and asserts on
 * what would reach Signal K.
 *
 * The stubs satisfy Client and Publisher rather than being cast at the call
 * site. A cast on `refresh(ctx)` accepts whatever the stubs happen to be, so a
 * product reaching for something they don't have -- `dataDirPath`, a second
 * argument to `client.text` -- would surface as an undefined at runtime.
 * `npm run typecheck` fails on it instead.
 */
export function harness(responses: Record<string, any>) {
  const published: { values: ValueUpdate[]; timestamp: string }[] = []
  const metas: Meta[] = []
  const errors: string[] = []

  const publisher: Publisher = {
    meta: (m) => metas.push(...m),
    values: (values, timestamp) => published.push({ values, timestamp }),
    value(path, value, timestamp) {
      this.values([{ path, value }], timestamp)
    },
    // Answers what this harness has already published, so a product that
    // checks the tree before republishing sees what a server would show it:
    // the newest update for that path, not the first, and the `.timestamp`
    // leaf alongside the `.value` one.
    selfPath: (path: string) => {
      for (let i = published.length - 1; i >= 0; i--) {
        const { values, timestamp } = published[i]
        for (const update of values) {
          if (`${update.path}.value` === path) return update.value
          if (`${update.path}.timestamp` === path) return timestamp
        }
      }
      return undefined
    },
    status: () => {},
    fail: () => {},
    error: (m, ...a) => errors.push(`${m} ${a.join(' ')}`),
    debug: () => {},
    // No product exercised here persists a file, and a stub handing back a
    // real directory would let one start doing so without a test noticing.
    dataDirPath: () => {
      throw new Error('dataDirPath is not stubbed')
    }
  }

  const client: Client = {
    json: async (subPath) => {
      if (!(subPath in responses)) throw new Error(`unstubbed ${subPath}`)
      return responses[subPath]
    },
    text: async (subPath) => {
      if (!(subPath in responses)) throw new Error(`unstubbed ${subPath}`)
      return responses[subPath]
    }
  }

  const ctx: ProductContext = {
    client,
    publisher,
    settings: settingsFrom({}),
    stopped: () => false
  }

  const flat = () => published.flatMap((p) => p.values)
  return {
    publisher,
    client,
    metas,
    errors,
    published,
    ctx,
    valueAt: (path: string) => flat().find((v) => v.path === path)?.value,
    paths: () => flat().map((v) => v.path)
  }
}

/** The dotted Signal K path an endpoint URL addresses. */
function pathOf(url: string): string | null {
  const vessel = '/signalk/v1/api/vessels/self/'
  return url.startsWith(vessel) ? url.slice(vessel.length).replace(/\//g, '.') : null
}

/**
 * What a GET on each endpoint in `ENDPOINTS` would return, from what a
 * product published -- the API answers a non-leaf path with the subtree
 * below it, leaves and all, which is why webapp card modules reach into
 * `?.G` and `?.S?.probability`. Anything never published 404s and arrives at
 * the webapp as `null`.
 */
function apiTree(values: ValueUpdate[], timestamp: string): Record<string, any> {
  const data: Record<string, any> = {}
  for (const [id, url] of Object.entries<string>(ENDPOINTS)) {
    const base = pathOf(url)
    if (base === null) continue
    let node: any = null
    for (const { path, value } of values) {
      if (path !== base && !path.startsWith(base + '.')) continue
      const rest = path === base ? [] : path.slice(base.length + 1).split('.')
      const leaf = { value, timestamp }
      if (rest.length === 0) {
        node = leaf
        continue
      }
      node ??= {}
      let cursor = node
      for (const key of rest.slice(0, -1)) cursor = cursor[key] ??= {}
      cursor[rest[rest.length - 1]] = leaf
    }
    data[id] = node
  }
  return data
}

/**
 * Runs the real Scales product over one captured payload, offline, and
 * returns the result the way the Signal K API would serve it to the webapp --
 * the whole path from NOAA's bytes to what a card module reads, with no
 * hand-written middle. `flareFixture` is optional because most fixtures do
 * not pair a scales payload with a flare one; when omitted, the flare fetch
 * fails the same best-effort way it does against a real server that hasn't
 * published one yet.
 */
export async function publishedScalesTree(scalesFixture: string, flareFixture?: string) {
  const scalesJson = fixtureJson(scalesFixture)
  const flareJson = flareFixture ? fixtureJson(flareFixture) : undefined
  const values: ValueUpdate[] = []
  let timestamp = ''
  await scalesProduct.refresh({
    client: {
      json: async (subPath: string) => {
        if (subPath.includes('noaa-scales')) return scalesJson
        if (subPath.includes('xray-flares') && flareJson !== undefined) return flareJson
        throw new Error(`no fixture stubbed for ${subPath}`)
      }
    } as any,
    publisher: {
      values: (v: ValueUpdate[], ts: string) => {
        values.push(...v)
        timestamp = ts
      },
      error: () => {}
    } as any,
    settings: settingsFrom({}),
    stopped: () => false
  })
  return apiTree(values, timestamp)
}

/**
 * The server's zone matcher, reproduced verbatim from signalk-server
 * src/zones.ts so the zone tests check the behaviour that actually happens on
 * a server rather than our own restatement of it.
 */
export function matchZone(zones: any[], value: number): number {
  return zones.findIndex((zone) => {
    const { upper = Infinity, lower = -Infinity } = zone
    return typeof value === 'number' && value < upper && value >= lower
  })
}
