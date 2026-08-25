import { describe, expect, it } from 'vitest'
import { LETTERS, scalesCard } from '../public/scales.js'
import { SOLAR_WIND_BASE, XRAY_FLARE_BASE } from '../src/paths'
import { solarWind } from '../src/products/solarWind'
import { scales } from '../src/products/scales'
import {
  FLARE_ENDPOINT,
  SCALES_FIXTURES,
  SYNTHETIC_FLARE_FIXTURES,
  SYNTHETIC_HOSTILE_SCALES_FIXTURES,
  SYNTHETIC_SCALES_FIXTURES,
  fixtureJson,
  publishedScalesTree
} from './fixtures'
import { harness } from './harness'

/**
 * Issue #120: the badge read NOAA's instantaneous scale field, which is 0 in
 * every real capture -- including the day whose 24-hour maximum was G4 -- so
 * the correct output and the broken output were the same bytes and the suite
 * stayed green. `src/` alone cannot catch that: the plugin published both
 * fields correctly, and the wrong one was read one layer up, in the webapp.
 *
 * So this drives the real product over every fixture in `examples/` -- real
 * captures and the invented corpus in `examples/synthetic/` alike -- through
 * the same Signal K paths the webapp's card modules read, and fails if any
 * field is 0-or-absent in every single one. A field that never once moves
 * across the whole corpus is not a quiet sky; it is a surface wired to the
 * wrong place.
 *
 * It is only ever as good as the corpus. Against an all-quiet one it would
 * pass a card wired to nothing, which is why `scales-render.test.ts` still
 * pins the two storm days by name against NOAA's own words. What this buys is
 * the fields nobody thought to pin individually.
 *
 * `kp` and `aurora` are not swept here. `kp` windows its output against the
 * real clock (see `parseKpForecast`'s `now` argument), so a generic sweep
 * would need a different pinned system time per fixture; `aurora` needs a
 * vessel position and a grid cache neither `examples/` nor this harness
 * carries. Both are candidates for the same treatment, not exempt from it --
 * follow-up work rather than a fit for this harness as it stands.
 */

// The torn-payload pair is deliberately absent: neither holds a complete JSON
// value, so feeding them here would only prove that JSON.parse throws on them.
// `synthetic-fixtures.test.ts` exercises them against `firstJsonValue`, which
// is the thing that actually has to survive them.
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

// Any payload the flare fetch can be hung off; the scales half is not what
// these cases are asserting on.
const ANY_SCALES_FIXTURE = 'noaa-scales.2026_08_01.json'

const isDead = (values: unknown[]) =>
  values.every((v) => v === null || v === undefined || v === 0)

describe('no field a webapp surface draws is dead across the whole fixture corpus', () => {
  it('finds a non-zero Storm Scales reading somewhere in examples/', async () => {
    const cards = await Promise.all(
      SCALES_CORPUS.map(async (f) =>
        scalesCard(await publishedScalesTree(f, REAL_FLARE_FIXTURE))
      )
    )

    // Keyed by label, so a failure names the field rather than the count.
    const drawn: Record<string, unknown[]> = {}
    const record = (label: string, value: unknown) =>
      (drawn[label] ??= []).push(value)
    for (const card of cards) {
      for (const letter of LETTERS)
        record(`observed.${letter}`, card.observed[letter])
      card.forecast.forEach((day, i) => {
        record(`forecast.${i}.G`, day.G)
        record(`forecast.${i}.S`, day.sProbability)
        record(`forecast.${i}.R.minor`, day.rMinorProbability)
        record(`forecast.${i}.R.major`, day.rMajorProbability)
      })
    }

    const dead = Object.entries(drawn)
      .filter(([, values]) => isDead(values))
      .map(([label]) => label)
    expect(dead).toEqual([])
  })

  it('finds a non-empty X-ray flare class somewhere in examples/', async () => {
    const classes: unknown[] = []
    for (const flareFixture of FLARE_CORPUS) {
      const h = harness({
        '/products/noaa-scales.json': fixtureJson(ANY_SCALES_FIXTURE),
        [FLARE_ENDPOINT]: fixtureJson(flareFixture)
      })
      await scales.refresh(h.ctx)
      classes.push(h.valueAt(`${XRAY_FLARE_BASE}.class`))
    }
    expect(classes.some((v) => typeof v === 'string' && v.length > 0)).toBe(
      true
    )
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
