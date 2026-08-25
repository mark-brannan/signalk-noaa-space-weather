import { describe, expect, it } from 'vitest'
import { ENDPOINTS, leafValue } from '../public/signalk.js'
import { LETTERS, SCALES_CARD_SOURCES, scalesCard } from '../public/scales.js'
import { scales } from '../src/products/scales.js'
import { ValueUpdate } from '../src/parse.js'
import { SCALES_FIXTURES, fixtureJson } from './fixtures.js'

/**
 * The gap issue #121 names: `hero.test.ts` proves the *decision* is right from
 * hand-built objects, and nothing proved which endpoint fills them. So this
 * runs the real product over a captured payload, serves the result the way the
 * Signal K API would, and asks the card what the badges read -- the whole path
 * from NOAA's bytes to the number on screen, with no hand-written middle.
 */

/** The dotted Signal K path an endpoint URL addresses. */
function pathOf(url: string): string | null {
  const vessel = '/signalk/v1/api/vessels/self/'
  return url.startsWith(vessel)
    ? url.slice(vessel.length).replace(/\//g, '.')
    : null
}

/**
 * What a GET on each endpoint returns, from what the product published.
 *
 * The API answers a non-leaf path with the subtree below it, leaves and all,
 * which is why the webapp reaches into `?.G` and `?.S?.probability`. Anything
 * the product never published 404s, and arrives at the webapp as `null`.
 */
function apiTree(
  values: ValueUpdate[],
  timestamp: string
): Record<string, any> {
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

/** Run the scales product over one captured payload, offline. */
async function publishedFrom(fixture: string) {
  const json = fixtureJson(fixture)
  const values: ValueUpdate[] = []
  let timestamp = ''
  await scales.refresh({
    client: {
      json: async (subPath: string) => {
        // The flare class comes from a second endpoint the fixtures do not
        // pair with a scales payload; the product treats a failure there as
        // best-effort, which is exactly the case being exercised.
        if (subPath.includes('noaa-scales')) return json
        throw new Error('no flare fixture for this payload')
      }
    } as any,
    publisher: {
      values: (v: ValueUpdate[], ts: string) => {
        values.push(...v)
        timestamp = ts
      },
      error: () => {}
    } as any,
    settings: {} as any,
    stopped: () => false
  })
  return apiTree(values, timestamp)
}

describe('the Storm Scales card, from NOAA payload to badge', () => {
  it('reads G4 on the day whose 24-hour maximum was G4', async () => {
    const card = scalesCard(await publishedFrom('noaa-scales.2025_04_16.json'))
    expect(card.observed.G).toBe(4)
  })

  // Issue #120 as it was reported: a live R2, drawn as R0.
  it('reads R2 on the day a live R2 was reported', async () => {
    const card = scalesCard(await publishedFrom('noaa-scales.2026_08_25.json'))
    expect(card.observed.R).toBe(2)
  })

  it('takes its levels from the 24-hour maximum, not the instantaneous sample', () => {
    expect(SCALES_CARD_SOURCES.observed).toBe('scalesObserved')
    // The pairing the card resolves has to be one the webapp actually fetches.
    for (const id of Object.values(SCALES_CARD_SOURCES)) {
      expect(Object.keys(ENDPOINTS)).toContain(id)
    }
  })

  it('converts NOAA probabilities out of the ratio Signal K publishes', async () => {
    const data = await publishedFrom('noaa-scales.2025_04_16.json')
    const card = scalesCard(data)
    const ratio = leafValue(data.scalesForecast?.['1day']?.S?.probability)
    expect(card.forecast[0].sProbability).toBeCloseTo(ratio * 100, 10)
  })

  it('leaves a missing reading null rather than zero', () => {
    const card = scalesCard({})
    for (const letter of LETTERS) expect(card.observed[letter]).toBeNull()
    expect(card.forecast).toHaveLength(3)
    expect(card.forecast[0].G).toBeNull()
    expect(card.forecast[0].sProbability).toBeNull()
  })
})

/**
 * The guard issue #121 asks for. A field that is 0 in every payload we have
 * ever captured is not a quiet sky -- it is a surface wired to the wrong
 * place, which is what #120 turned out to be. The instantaneous sample reads
 * 0 in all seven fixtures including the G4 day and the R2 day, so a card
 * drawing it fails here rather than shipping green.
 *
 * The corpus has to be able to answer: a guard run over payloads that are all
 * genuinely quiet would pass a broken wiring, so the storm days are pinned
 * separately above and the fixture list is the thing to grow.
 */
describe('no rendered field is dead across every captured payload', () => {
  it('finds a non-zero reading for every number the card draws', async () => {
    const cards = await Promise.all(
      SCALES_FIXTURES.map(publishedFrom).map(async (d) => scalesCard(await d))
    )

    /** Every number the card puts on screen, flattened to `label -> values`. */
    const drawn: Record<string, (number | null)[]> = {}
    const record = (label: string, value: number | null) =>
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
      .filter(([, values]) => values.every((v) => v === null || v === 0))
      .map(([label]) => label)
    expect(dead).toEqual([])
  })
})
