# Design: measuring what the plugin actually fetches

**Status: phases 1, 2 and 4 shipped, 3 not started.** Recovered
2026-08-29 — this file was written 2026-08-28 on a design branch that was
never merged and got deleted after phases 1–2 landed off cherry-picked
commits rather than a PR from this branch; it survived only as an
unreachable git object. Phase 1 is [#245](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/245),
phase 2 is [#244](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/244).
When 3 also lands, the arguments here move into `docs/design-decisions.md`
and this file goes away.

## The problem this exists to solve

The config UI told users what a setting would cost in bytes. The numbers were
hand-written prose, measured once, and one product's real behaviour drifted
away from them — `goesFlux` fetches *two* endpoints per poll, and later work
added a third GOES endpoint elsewhere, while `updateInterval`'s description
still says "together about 5 KB per poll".

Prose cannot track code. Two prongs, and both are needed:

1. **Make the config UI's numbers derived, not written.** A product declares
   its endpoints and their measured wire size as data; the form computes the
   cost from the user's actual settings. An endpoint the code fetches but has
   not declared fails the build.
2. **Measure the running installation and report it.** Declarations can still
   be stale, and NOAA's payloads move. The plugin counts its own bytes and
   publishes the number, so a live boat can be compared against what its own
   config UI promised.

Prong 2 without prong 1 is a dashboard nobody reads. Prong 1 without prong 2 is
the same class of untested claim, one indirection deeper.

## The one measurement point

`src/noaa/client.ts` is already the only outbound I/O in the plugin. That is
the whole enforcement mechanism: instrument `get()` and nothing can fetch
without being counted. No call sites change, no product opts in, and a future
product cannot forget.

Per fetch, record:

| Field | Source | Notes |
| --- | --- | --- |
| `subPath` | argument | the key — **counters are per endpoint, not per product** |
| `productName` | argument | rolled up for display only |
| `trigger` | new arg | `schedule` \| `manual` \| `webapp` — a press is not the plugin's own initiative, and the bill should say so |
| `startedAt`, `durationMs` | clock | |
| `status` | response | HTTP code |
| `wireBytes` | `content-length` | what the fetch actually cost |
| `wireBytesEstimated` | — | true when the header was absent and `decodedBytes` was substituted |
| `decodedBytes` | body length | for text/JSON reads |
| `outcome` | — | `ok` \| `notModified` \| `httpError` \| `timeout` \| `networkError` \| `torn` \| `parseError` |

`wireBytes` is the compressed size — Node's `fetch` sends `Accept-Encoding:
gzip` and decompresses transparently, so `content-length` is the gzipped
number and `body.length` is not. That distinction is the difference between a
truthful figure and one ten times too large; `docs/noaa-products.md` already
makes it, and `scripts/measure-noaa.mjs` reads the same header. **Never quote
a decoded size to a user as a cost.**

Counters keyed by `subPath` and not by product name is the specific fix for the
bug that prompted this. "GOES flux" is one product and two fetches; a
product-keyed counter would have hidden exactly the thing that went wrong.

## `src/meter.ts` — pure accounting

A new module with no `app`, no network, no clock of its own (time is passed
in), in the shape of `parse.ts`. It owns three tiers of retention and nothing
else. Everything below reads it; it reads nothing.

- **Tier 1 — the ring.** Last 200 fetch records, full detail, in memory.
  ~50 KB. Answers "what has it been doing in the last few hours", which is
  what you want when something looks wrong. Never persisted.
- **Tier 2 — the rolling 24 hours.** Per endpoint, 24 hourly buckets of
  `{fetches, wireBytes, decodedBytes, errors, notModified}`. Tiny. This is
  what the Signal K paths and the daily-cost comparison read.
- **Tier 3 — totals since install.** Per endpoint, cumulative. The only tier
  that is persisted.

Restart loses tiers 1 and 2. That is correct: the real history lives in
whatever scrapes the Signal K paths (InfluxDB on Symphony), and rebuilding it
from disk would cost writes to buy a number a time-series database already has.

**Shipped in phase 1** (`src/meter.ts`, tiers 1 and 2, `get()` wrapper,
`/telemetry` route, logging discipline) — see #245.

## Persistence and flash wear

This runs on a Raspberry Pi's SD card, so the flush cadence is a design
decision, not an implementation detail.

The cost that matters is erase blocks, not bytes. A small JSON file rewritten
on a card with a 128 KB–4 MB erase block costs a full block erase per write
regardless of how few bytes changed. Flushing per fetch — roughly 1,400 fetches
a day at the defaults — is on the order of gigabytes of erase a day on a bad
card. That is not a real budget for a diagnostics counter.

**Decision: flush at most hourly, on the tier-2 bucket rollover, only if the
counters moved, plus once in `stop()`.** 25 writes a day, worst case. Write to
a temp file in the data dir and `rename()` over the target, so a power cut
leaves either the old file or the new one. **A counters file that does not
parse is discarded, not repaired** — the same rule as never recovering a
truncated NOAA value; a half-restored total presented as a total is worse than
starting from zero.

Accepted consequence: an ungraceful shutdown loses up to an hour of the
since-install totals. These are diagnostics. Signal K's own delta logging
writes orders of magnitude more to the same card in that hour; the discipline
here is about not adding to it carelessly, not about being the dominant term.

Not doing: persisting tier 1 or tier 2, a WAL, an append-only log that needs
compaction, or any new dependency.

**Shipped in phase 4** (`src/meter.ts`'s `loadTotals`/`flushTotals`/
`maybeFlushTotals`, the hourly gate on tier-2 rollover, stop()'s unconditional
flush) — the totals now also ride along in the `/telemetry` route's
`meterSnapshot`, at schema 2.

## Declared endpoints — the config-UI prong

Today a product passes a string literal to `client.json()`. Change the
`Product` interface so it declares them:

```ts
interface Endpoint {
  subPath: string
  /** Wire size with gzip, in bytes. Measured — never estimated. */
  wireBytes: number
  /** ISO date of the measurement, from scripts/measure-noaa.mjs. */
  measuredOn: string
}

interface Product {
  // ...
  endpoints: Endpoint[]
}
```

`Client` takes an `Endpoint`, not a string. An undeclared fetch stops being
possible to write. Three tests then hold the line:

1. Every `subPath` reachable at runtime belongs to some product's `endpoints`
   (a runtime guard in the client, plus a test that walks `PRODUCTS`).
2. Declared `wireBytes` agree with what `docs/noaa-products.md` records, within
   tolerance — so re-measuring and forgetting to update the code fails.
3. The cost the config panel computes for the default settings equals the sum
   over declared endpoints at their declared intervals. The number in the UI
   and the number in the code are the same number.

`config.ts` descriptions stop quoting per-fetch byte figures in prose;
`public/config-panel.js` already does the daily arithmetic for aurora and D-RAP
and grows to cover every product, driven by the declarations.

The live cross-check closes it: the plugin knows its *predicted* bytes/day from
declarations and settings, and its *measured* bytes/day from tier 2. A sustained
divergence beyond, say, 25% is the alarm that the config UI is lying again. That
comparison is the single highest-value output of this whole design.

**Shipped in phase 2** (`src/endpoints.ts`, the `Endpoint` type, the three
tests, config prose replaced by computed figures) — see #244. The
predicted-vs-measured cross-check itself is part of **phase 3**, below —
declarations give the predicted half; the live comparison needs tier 2's
measured half surfaced somewhere a person or a scraper reads it.

## Four surfaces, one source

All read `meter.ts`. None of them compute anything.

**1. JSON route.** `GET /plugins/signalk-noaa-space-weather/telemetry`,
alongside the existing routes in `signalKApiRoutes`. Full detail: the ring, the
24h buckets, the totals, the predicted-vs-measured comparison, and
`{startedAt, settings}` as `/status` already returns. Stable shape, versioned
with a `schema` field, safe to scrape. This is the primary surface — the other
three are views of it.

**Shipped in phase 1**, though without the totals (phase 4) or the
predicted-vs-measured comparison (needs phase 2's declarations wired in —
phase 3).

**2. Signal K paths.** Deliberately few. Housekeeping data in a vessel's data
model earns its place only where a time-series database should keep the
history:

- `<BASE>.telemetry.bytesPerDay` — measured, rolling 24h, `units: 'bytes'`
- `<BASE>.telemetry.bytesPerDayPredicted` — from declarations and settings
- `<BASE>.telemetry.fetchesPerDay`
- `<BASE>.telemetry.errorsPerDay`

Four paths, `meta` with `displayName`/`description`/`units`, **no `zones`** —
zones raise notifications, and a boat does not want an alarm because a NOAA
endpoint got fatter. Published once per tier-2 rollover, not per fetch.

**Not yet built — this is phase 3.**

**3. Webapp diagnostics tab.** Reads the JSON route. A table of endpoints with
bytes/day measured against predicted, the last few fetches, and the errors.
Its job is to make the divergence obvious at a glance.

**Not yet built — this is phase 3.**

**4. Status line and log.** See below.

**Shipped in phase 1.**

## Logging discipline

The status line and log are the surfaces most often done badly, so the rules
are explicit:

- **One line per fetch, at `debug`, never at `info`.** Fixed `key=value` shape
  so it is greppable and parseable:
  `noaa.fetch product=… path=… trigger=… status=200 wire=4913 ms=210 outcome=ok`.
  No prose, no timestamps of our own (the server adds them), no `%j` dumps.
- **`info`/`status` only on state change.** The current code sets a status
  string on every successful retrieval, which means the status line is a clock.
  It should say what is true — scheduled products, last success, current error
  — and change only when one of those does.
- **Errors are deduplicated.** A NOAA endpoint 404ing every minute must not
  produce 1,440 identical error lines. Log on transition into the failure, then
  at exponential intervals, then on recovery with the count of what was
  suppressed. The counter in `meter.ts` is where the real number lives.
- **Nothing logged at any level contains a position, an MMSI, or anything else
  identifying the vessel.** This is a diagnostics path on somebody's boat.
- **No log line is the only record of anything.** If it matters, it is in the
  meter and reachable from the route.

**Shipped in phase 1.**

## Testing

`meter.ts` is pure, so tiers, rollover, and the predicted-vs-measured
arithmetic are unit-testable with an injected clock and no server. The client
instrumentation is tested against the existing fixture-backed fakes.
`test/offline.test.ts` must keep passing unchanged — nothing here adds I/O, and
the persistence flush is the data dir the plugin already writes tiles to.

## Phasing

Four pull requests, each shippable alone, in this order:

1. **Meter and client instrumentation.** `src/meter.ts`, tiers 1 and 2, the
   `get()` wrapper, the JSON route, and the logging discipline. No persistence,
   no Signal K paths, no declarations. Delivers: you can already see what a live
   installation is doing. **Shipped — #245.**
2. **Declared endpoints.** The `Endpoint` type, `Client` signature change, the
   three tests, config prose replaced by computed figures in
   `public/config-panel.js`. Delivers: the original bug becomes a build failure.
   This is the prong that prevents recurrence; it is worth doing even if
   nothing else here ships. **Shipped — #244.**
3. **Signal K paths and the webapp tab.** Predicted vs measured becomes
   visible and gets recorded by whatever is already scraping Signal K.
   **Not started.**
4. **Persistence.** Tier 3, hourly flush, atomic rename, discard-on-corrupt.
   **Shipped.**

Do not collapse 1 and 2 into one pull request: one changes behaviour, the other
changes a type everything implements, and reviewing them together hides both.
