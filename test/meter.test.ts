import { describe, expect, it } from 'vitest'
import {
  createMeter,
  FetchRecord,
  meterSnapshot,
  meterTotals,
  recordFetch
} from '../src/meter'

const HOUR_MS = 60 * 60 * 1000

function entry(overrides: Partial<FetchRecord> = {}): FetchRecord {
  return {
    subPath: '/products/noaa-scales.json',
    productName: 'Scales',
    trigger: 'schedule',
    startedAt: 0,
    durationMs: 10,
    status: 200,
    wireBytes: 100,
    wireBytesEstimated: false,
    decodedBytes: 120,
    outcome: 'ok',
    ...overrides
  }
}

describe('recordFetch: tier 1, the ring', () => {
  it('keeps the most recent 200 and drops the oldest first', () => {
    const meter = createMeter()
    for (let i = 0; i < 205; i++) {
      recordFetch(meter, entry({ startedAt: i, durationMs: i }))
    }
    expect(meter.ring).toHaveLength(200)
    expect(meter.ring[0].durationMs).toBe(5)
    expect(meter.ring[199].durationMs).toBe(204)
  })
})

describe('recordFetch: tier 2, the rolling 24 hours', () => {
  it('folds same-hour fetches into one bucket per endpoint', () => {
    const meter = createMeter()
    recordFetch(meter, entry({ startedAt: 0, wireBytes: 100 }))
    recordFetch(meter, entry({ startedAt: 1000, wireBytes: 200 }))

    const buckets = meter.hourly.get('/products/noaa-scales.json')!
    expect(buckets).toHaveLength(1)
    expect(buckets[0].fetches).toBe(2)
    expect(buckets[0].wireBytes).toBe(300)
  })

  it('rolls a new bucket in on the hour and keeps at most 24', () => {
    const meter = createMeter()
    for (let hour = 0; hour < 30; hour++) {
      recordFetch(meter, entry({ startedAt: hour * HOUR_MS }))
    }
    const buckets = meter.hourly.get('/products/noaa-scales.json')!
    expect(buckets).toHaveLength(24)
    // The oldest 6 hours fell off the front.
    expect(buckets[0].hourStart).toBe(6 * HOUR_MS)
    expect(buckets[23].hourStart).toBe(29 * HOUR_MS)
  })

  it('bounds the window by hours, not by bucket count', () => {
    // An endpoint polled every two hours: 24 buckets would span two days and
    // be read as one day's traffic.
    const meter = createMeter()
    for (let hour = 0; hour < 60; hour += 2) {
      recordFetch(meter, entry({ startedAt: hour * HOUR_MS }))
    }
    const buckets = meter.hourly.get('/products/noaa-scales.json')!
    expect(buckets[buckets.length - 1].hourStart).toBe(58 * HOUR_MS)
    expect(buckets[0].hourStart).toBe(36 * HOUR_MS)
    expect(buckets).toHaveLength(12)
  })

  it('counts notModified and every non-ok outcome separately from errors', () => {
    const meter = createMeter()
    recordFetch(meter, entry({ outcome: 'ok' }))
    recordFetch(meter, entry({ outcome: 'notModified' }))
    recordFetch(meter, entry({ outcome: 'httpError' }))
    recordFetch(meter, entry({ outcome: 'timeout' }))

    const bucket = meter.hourly.get('/products/noaa-scales.json')![0]
    expect(bucket.fetches).toBe(4)
    expect(bucket.notModified).toBe(1)
    expect(bucket.errors).toBe(2)
  })

  it('keeps endpoints in separate buckets, keyed by subPath not product', () => {
    const meter = createMeter()
    recordFetch(
      meter,
      entry({ subPath: '/json/goes/primary/xrays-6-hour.json' })
    )
    recordFetch(
      meter,
      entry({ subPath: '/json/goes/secondary/xrays-6-hour.json' })
    )

    expect(meter.hourly.size).toBe(2)
  })

  it('calls onRollover when a fetch opens a new bucket, and not when it folds into the current one', () => {
    let rollovers = 0
    const meter = createMeter(() => rollovers++)

    recordFetch(meter, entry({ startedAt: 0 })) // opens the first bucket
    recordFetch(meter, entry({ startedAt: 1000 })) // same hour -- no rollover
    recordFetch(meter, entry({ startedAt: HOUR_MS })) // next hour -- rolls over

    expect(rollovers).toBe(2)
  })

  it('calls onRollover once per endpoint, not once per fetch that opens a bucket for any endpoint', () => {
    let rollovers = 0
    const meter = createMeter(() => rollovers++)

    recordFetch(meter, entry({ subPath: '/a' }))
    recordFetch(meter, entry({ subPath: '/b' }))
    recordFetch(meter, entry({ subPath: '/a' }))

    expect(rollovers).toBe(2)
  })

  it('has already folded the triggering fetch in by the time onRollover fires', () => {
    // onRollover fires because *this* fetch opened a new bucket -- a
    // listener reading meterTotals() from inside the callback must see
    // that fetch counted, not just the buckets that existed before it.
    let totalsAtRollover: ReturnType<typeof meterTotals> | undefined
    const meter = createMeter(() => {
      totalsAtRollover = meterTotals(meter, HOUR_MS)
    })

    recordFetch(meter, entry({ startedAt: 0, wireBytes: 100 })) // opens bucket 0, no rollover
    recordFetch(
      meter,
      entry({ startedAt: HOUR_MS, wireBytes: 50 }) // opens bucket 1 -- rolls over
    )

    expect(totalsAtRollover).toEqual({
      bytesPerDay: 150,
      fetchesPerDay: 2,
      errorsPerDay: 0
    })
  })
})

describe('meterTotals', () => {
  it('sums fetches, wireBytes and errors across every endpoint within the last 24h of `now`', () => {
    const meter = createMeter()
    recordFetch(
      meter,
      entry({ subPath: '/a', startedAt: 0, wireBytes: 100, outcome: 'ok' })
    )
    recordFetch(
      meter,
      entry({
        subPath: '/b',
        startedAt: HOUR_MS,
        wireBytes: 50,
        outcome: 'httpError'
      })
    )

    const totals = meterTotals(meter, 2 * HOUR_MS)
    expect(totals).toEqual({
      bytesPerDay: 150,
      fetchesPerDay: 2,
      errorsPerDay: 1
    })
  })

  it('excludes a bucket older than 24h of `now`, even though recordFetch has not pruned it yet', () => {
    // An endpoint fetched once and never again keeps its one bucket forever
    // in `meter.hourly` -- recordFetch only prunes on that endpoint's own
    // next fetch. meterTotals has to apply the window itself.
    const meter = createMeter()
    recordFetch(
      meter,
      entry({ subPath: '/stale', startedAt: 0, wireBytes: 999 })
    )
    recordFetch(
      meter,
      entry({ subPath: '/fresh', startedAt: 30 * HOUR_MS, wireBytes: 1 })
    )

    const totals = meterTotals(meter, 30 * HOUR_MS)
    expect(totals.bytesPerDay).toBe(1)
    expect(totals.fetchesPerDay).toBe(1)
  })

  it('includes a bucket whose hour overlaps the 24h window even though it started more than 23h ago', () => {
    // now = 30.5h: a fetch in the bucket starting at 6h landed at 6.75h,
    // which is 23.75h old and belongs in the last 24 hours -- a cutoff of
    // "23 hours before now, floored" excludes the whole bucket that fetch
    // is in.
    const meter = createMeter()
    recordFetch(
      meter,
      entry({ subPath: '/a', startedAt: 6.75 * HOUR_MS, wireBytes: 7 })
    )

    const totals = meterTotals(meter, 30.5 * HOUR_MS)
    expect(totals.bytesPerDay).toBe(7)
    expect(totals.fetchesPerDay).toBe(1)
  })

  it('includes a bucket exactly on the 24h boundary', () => {
    const meter = createMeter()
    recordFetch(meter, entry({ subPath: '/a', startedAt: 0, wireBytes: 3 }))

    const totals = meterTotals(meter, 24 * HOUR_MS)
    expect(totals.bytesPerDay).toBe(3)
  })
})

describe('meterSnapshot', () => {
  it('is a JSON-safe copy: mutating it does not touch the meter', () => {
    const meter = createMeter()
    recordFetch(meter, entry())

    const snapshot = meterSnapshot(meter)
    snapshot.ring.push(entry({ startedAt: 999 }))
    snapshot.hourly['/products/noaa-scales.json'].push({
      hourStart: 999,
      fetches: 1,
      wireBytes: 1,
      decodedBytes: 1,
      errors: 0,
      notModified: 0
    })

    expect(meter.ring).toHaveLength(1)
    expect(meter.hourly.get('/products/noaa-scales.json')).toHaveLength(1)
  })

  it('turns the hourly Map into a plain object keyed by subPath', () => {
    const meter = createMeter()
    recordFetch(meter, entry())
    const snapshot = meterSnapshot(meter)
    expect(Object.keys(snapshot.hourly)).toEqual(['/products/noaa-scales.json'])
  })
})
