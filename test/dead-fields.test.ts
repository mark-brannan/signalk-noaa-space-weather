import { describe, expect, it } from 'vitest'
import { SCALES_BASE, SOLAR_WIND_BASE, XRAY_FLARE_BASE } from '../src/paths'
import { scales } from '../src/products/scales'
import { solarWind } from '../src/products/solarWind'
import {
  FLARE_ENDPOINT,
  SCALES_FIXTURES,
  SYNTHETIC_FLARE_FIXTURES,
  SYNTHETIC_HOSTILE_SCALES_FIXTURES,
  SYNTHETIC_SCALES_FIXTURES,
  fixtureJson,
  harness
} from './fixtures'

/**
 * Issue #120: the badge read NOAA's instantaneous scale field, which is 0 in
 * every real capture -- including the day whose 24-hour maximum was G4 -- so
 * the correct output and the broken output were the same bytes and 441 tests
 * stayed green. `src/` alone cannot catch that: the plugin published both
 * fields correctly, and the wrong one was read one layer up, in the webapp.
 *
 * So this drives the real product over every fixture in `examples/` (real
 * captures and the invented corpus in `examples/synthetic/` alike), through
 * the same Signal K paths the webapp's card modules read -- see
 * `public/scales.js` and `public/signalk.js`, the endpoint list #124 made
 * this test possible against -- and fails if any of them is 0 or null in
 * every single fixture. A field that never once moves across the whole
 * corpus is not a quiet sky; it is a surface wired to the wrong place.
 *
 * `kp` and `aurora` are not swept here. `kp` windows its output against the
 * real clock (see `parseKpForecast`'s `now` argument), so a generic sweep
 * would need a different pinned system time per fixture; `aurora` needs a
 * vessel position and a grid cache neither `examples/` nor this harness
 * carries. Both are candidates for the same treatment, not exempt from it --
 * just follow-up work rather than a fit for this harness as it stands.
 */

const SCALES_JSON_ENDPOINT = '/products/noaa-scales.json'

/** A scales fixture paired with a flare fixture, run through the real product. */
async function publishScales(scalesFixture: string, flareFixture: string) {
  const h = harness({
    [SCALES_JSON_ENDPOINT]: fixtureJson(scalesFixture),
    [FLARE_ENDPOINT]: fixtureJson(flareFixture)
  })
  await scales.refresh(h.ctx)
  return h
}

// Fixtures with no complete JSON value (the torn-payload pair) are exercised
// by synthetic-fixtures.test.ts against firstJsonValue directly -- feeding them
// here would only prove that JSON.parse throws on them, which is not the point.
const SCALES_CORPUS = [
  ...SCALES_FIXTURES,
  ...SYNTHETIC_SCALES_FIXTURES.map((f) => `synthetic/${f}`),
  ...SYNTHETIC_HOSTILE_SCALES_FIXTURES.map((f) => `synthetic/${f}`)
]

const REAL_FLARE_FIXTURE = 'xray-flares-latest.2026_08_06.json'
const FLARE_CORPUS = [
  REAL_FLARE_FIXTURE,
  ...SYNTHETIC_FLARE_FIXTURES.map((f) => `synthetic/${f}`)
]

const ANY_SCALES_FIXTURE = 'noaa-scales.2026_08_01.json'

function record(bucket: Record<string, unknown[]>, label: string, value: unknown) {
  ;(bucket[label] ??= []).push(value)
}

const isDead = (values: unknown[]) =>
  values.every((v) => v === null || v === undefined || v === 0)

describe('no field a webapp surface draws is dead across the whole fixture corpus', () => {
  it('finds a non-zero Storm Scales reading somewhere in examples/', async () => {
    const drawn: Record<string, unknown[]> = {}
    for (const fixture of SCALES_CORPUS) {
      const h = await publishScales(fixture, REAL_FLARE_FIXTURE)
      for (const letter of ['G', 'S', 'R']) {
        record(
          drawn,
          `observed.${letter}`,
          h.valueAt(`${SCALES_BASE}observations.24_hours_maximums.${letter}`)
        )
      }
      for (const day of ['1day', '2day', '3day']) {
        record(drawn, `forecast.${day}.G`, h.valueAt(`${SCALES_BASE}forecast.${day}.G`))
        record(
          drawn,
          `forecast.${day}.S`,
          h.valueAt(`${SCALES_BASE}forecast.${day}.S.probability`)
        )
        record(
          drawn,
          `forecast.${day}.R.minor`,
          h.valueAt(`${SCALES_BASE}forecast.${day}.R.minorProbability`)
        )
        record(
          drawn,
          `forecast.${day}.R.major`,
          h.valueAt(`${SCALES_BASE}forecast.${day}.R.majorProbability`)
        )
      }
    }

    const dead = Object.entries(drawn)
      .filter(([, values]) => isDead(values))
      .map(([label]) => label)
    expect(dead).toEqual([])
  })

  it('finds a non-empty X-ray flare class somewhere in examples/', async () => {
    const classes: unknown[] = []
    for (const fixture of FLARE_CORPUS) {
      const h = await publishScales(ANY_SCALES_FIXTURE, fixture)
      classes.push(h.valueAt(`${XRAY_FLARE_BASE}.class`))
    }
    expect(classes.some((v) => typeof v === 'string' && v.length > 0)).toBe(true)
  })

  it('finds a non-zero solar wind reading somewhere in examples/', async () => {
    // Only one real capture exists and there is no synthetic solar-wind
    // fixture yet -- this still guards the wiring against the one payload we
    // have, and grows the moment a second one lands.
    const h = harness({
      '/products/summary/solar-wind-speed.json': fixtureJson(
        'solar-wind-speed.2026_08_01.json'
      ),
      '/products/summary/solar-wind-mag-field.json': fixtureJson(
        'solar-wind-mag-field.2026_08_01.json'
      )
    })
    await solarWind.refresh(h.ctx)

    const dead = ['speed', 'Bt', 'Bz'].filter((field) =>
      isDead([h.valueAt(`${SOLAR_WIND_BASE}.${field}`)])
    )
    expect(dead).toEqual([])
  })
})
