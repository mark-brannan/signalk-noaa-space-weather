/**
 * Signal K plugin surfacing NOAA Space Weather Prediction Center products.
 *
 * This module is only the plugin definition and lifecycle. Each NOAA product
 * owns its own paths, metadata and parsing under src/products/, parsing itself
 * is pure and lives in src/parse.ts, and all I/O goes through src/noaa/client
 * (in) and src/publisher (out).
 */
import { Settings, schema, settingsFrom } from './config.js'
import { createClient, Trigger } from './noaa/client.js'
import { flushTotals, loadTotals, meterSnapshot } from './meter.js'
import { CacheStore } from './cache/entryCache.js'
import { readAuroraCache } from './cache/auroraCache.js'
import { readDrapCache } from './cache/drapCache.js'
import { readAdvisoryCache } from './cache/advisoryCache.js'
import { createPublisher } from './publisher.js'
import { PROTON_FLUX_BASE, XRAY_FLUX_BASE } from './paths.js'
import { FORCE_REFRESH_COOLDOWN_MS } from './refreshPolicy.js'
import {
  Lattice,
  MAX_ZOOM,
  auroraGridFrom,
  auroraLattice,
  drapLattice,
  isValidTile,
  renderTile
} from './tiles.js'

// Re-exported so `PRODUCTS` stays one list with one importable name: the
// registry moved to src/products/registry.ts when the browser demo needed it
// (#239), and this module's own closure reaches the filesystem.
import { aurora } from './products/aurora.js'
import { drap } from './products/drap.js'
import { goesFlux } from './products/goesFlux.js'
import { PRODUCTS } from './products/registry.js'
import type { Product } from './products/types.js'
export { PRODUCTS }

const PLUGIN_ID = 'signalk-noaa-space-weather'
/** Let the server settle before the first fetch. */
const INITIAL_DELAY_MS = 5000
/**
 * Backoff for a product holding a grid it has nowhere to index yet. A GPS fix
 * usually arrives within seconds, so the first look is quick; but a dev
 * server or a boat with no GPS at all may never produce one, and that must
 * settle into a quiet heartbeat rather than a busy loop.
 */
const RETRY_BASE_MS = 5000
const RETRY_MAX_MS = 5 * 60 * 1000
/**
 * Rendered tiles held in memory. A 1280x800 viewport is about 20 tiles, so
 * this covers several pans and zooms of the same forecast; anything evicted
 * costs the ~4ms to draw again. Bounded because this runs on boat hardware
 * next to everything else the server is doing.
 */
const TILE_CACHE_LIMIT = 256

/** What a product's refresh resolves to; see the Product interface. */
type RefreshResult = Awaited<ReturnType<Product['refresh']>>

/** Geometric backoff, capped both by RETRY_MAX_MS and the product's own interval. */
export function retryDelayMs(attempt: number, intervalMs: number): number {
  const geometric = RETRY_BASE_MS * Math.pow(2, Math.max(0, attempt))
  return Math.min(geometric, RETRY_MAX_MS, Math.max(intervalMs, RETRY_BASE_MS))
}

interface Plugin {
  start: (props: any) => void
  stop: () => void
  id: string
  name: string
  description: string
  schema: any
  signalKApiRoutes: (router: any) => any
}

export default function (app: any): Plugin {
  const publisher = createPublisher(app, PLUGIN_ID)
  const client = createClient(publisher)

  // One live timer handle per product, not a growing array: each product
  // reschedules itself after every run (see `run()` below), so a flat array
  // pushed to on every tick would grow for as long as the server runs.
  const productTimers = new Map<string, any>()
  /**
   * Timers for the position-retry loop, deliberately not `productTimers`:
   * membership of that map is what says a product is on a recurring schedule,
   * and a manual refresh of a product the user switched off must not quietly
   * become one. See `retryFromCache`.
   */
  const positionRetryTimers = new Map<string, any>()
  let stopped = false
  /** Consecutive 'awaiting-position' results per product, for the backoff. */
  const awaitingPositionAttempts = new Map<string, number>()
  /** Refreshes currently awaiting NOAA, so a second caller joins rather than
   * starting its own. See `refreshOnce`. */
  const inFlight = new Map<string, Promise<RefreshResult>>()
  /** When each product's most recent fetch began, whoever started it. */
  const lastRefreshStartedAt = new Map<string, number>()
  /** Set on start(), read by the force-refresh route below. */
  let currentSettings: Settings | null = null
  /**
   * Products whose metadata has gone out this run. start() publishes it only
   * for the products it schedules, so an on-demand fetch of an unscheduled one
   * has to publish its own — otherwise the value lands on a path with no
   * units, no zones and no display name, which is a bare number in the data
   * browser.
   */
  const metaPublished = new Set<string>()
  /** When this run of the plugin began; served by the status route below. */
  let startedAt: string | null = null
  /**
   * Tier 3's totals load once per process, not once per start(). Loading on
   * every start() would clobber an in-memory total that has moved since the
   * last hourly flush with whatever was last on disk, every time the plugin
   * is stopped and restarted from the admin UI without the process
   * restarting -- `client.meter` outlives that cycle, disk does not need to
   * catch up to it.
   */
  let totalsLoaded = false

  /**
   * Tile rendering reads the same disk cache the webapp's map does, but
   * re-parsing 900 KB of JSON and reflattening the grid costs ~33ms, which
   * would dwarf the ~4ms of actual drawing on every request. So both the
   * lattice and the rendered tiles are memoised against the cache entry's
   * `fetchedAt`, and the whole lot is dropped when a newer fetch lands -- a
   * stale tile is worse than a slow one.
   *
   * One of these per product with tiles: they are independent captures on
   * independent intervals, and a shared cache keyed only by tile coordinates
   * would serve one product's picture for the other's.
   */
  function tileSource<T extends { fetchedAt: string }>(
    read: (store: CacheStore) => T | null,
    latticeOf: (entry: T) => Lattice | null
  ) {
    let key: string | null = null
    let lattice: Lattice | null = null
    const tiles = new Map<string, Buffer>()

    return {
      current(): { lattice: Lattice; key: string } | null {
        const cached = read(publisher)
        if (!cached) return null
        if (key !== cached.fetchedAt || !lattice) {
          const next = latticeOf(cached)
          if (!next) return null
          lattice = next
          key = cached.fetchedAt
          tiles.clear()
        }
        return { lattice, key: cached.fetchedAt }
      },
      get: (tile: string) => tiles.get(tile),
      /** Only under the key the render was actually drawn from; a refresh can
       * replace the lattice while a render is in flight. */
      remember(sourceKey: string, tile: string, png: Buffer) {
        if (key !== sourceKey) return
        if (tiles.size >= TILE_CACHE_LIMIT) {
          // Map iterates in insertion order, so the first key is the oldest.
          const oldest = tiles.keys().next()
          if (!oldest.done) tiles.delete(oldest.value)
        }
        tiles.set(tile, png)
      },
      clear() {
        tiles.clear()
        lattice = null
        key = null
      }
    }
  }

  const auroraTiles = tileSource(readAuroraCache, (entry) => {
    const grid = auroraGridFrom(entry.grid?.coordinates)
    return grid ? auroraLattice(grid) : null
  })
  const drapTiles = tileSource(readDrapCache, (entry) =>
    drapLattice(entry.grid)
  )

  function intervalFor(product: Product, settings: Settings): number {
    return product.intervalMinutes(settings) * 60 * 1000
  }

  function schedule(product: Product, settings: Settings, delayMs: number) {
    if (stopped) return
    // Clear first: a manual refresh can reschedule a product whose own run is
    // still in flight, and that run will reschedule itself when it resolves.
    // Without this the product would be left holding two live timers, only one
    // of which this map can ever cancel.
    const existing = productTimers.get(product.name)
    if (existing) clearTimeout(existing)
    productTimers.set(
      product.name,
      setTimeout(() => run(product, settings), delayMs)
    )
  }

  /**
   * Restart a scheduled product's clock, after something else has just fetched
   * for it. A manual refresh a minute before the tick would otherwise buy the
   * payload twice, and what that payload costs is the whole reason the aurora
   * interval defaults to two hours. A no-op for a product that is not
   * scheduled, which is the case this exists to serve.
   *
   * A manual refresh that joined a scheduled run makes this replace the timer
   * that run has just set, with the same delay it just used. Two reschedules
   * for one outcome, and cheaper than the bookkeeping it would take to notice.
   */
  function deferNextRun(product: Product, settings: Settings) {
    if (!productTimers.has(product.name)) return
    schedule(product, settings, intervalFor(product, settings))
  }

  /**
   * A product's refresh, at most one at a time, recording when the fetch behind
   * it began.
   *
   * Two things need that. A manual refresh must not start a second fetch
   * alongside a scheduled one already awaiting NOAA — the same payload twice,
   * racing to write the same cache file — so it joins the one in flight
   * instead; `deferNextRun` cannot help there, because by then the timer has
   * already fired. And the manual route's cooldown is about NOAA traffic
   * rather than about button presses, so a scheduled fetch has to hold it down
   * too: a press seconds after a scheduled fetch would otherwise buy the same
   * grid again.
   *
   * Every refresh here reaches NOAA, so the stamp is unconditional. It was not
   * always: while the grid products waited for a vessel position before
   * fetching, a refresh could return having sent nothing, and the stamp had to
   * be rolled back so a boat still waiting on a GPS fix was not also made to
   * wait out a cooldown for traffic it never sent.
   */
  function refreshOnce(
    product: Product,
    settings: Settings,
    trigger: Trigger = 'schedule'
  ) {
    const joined = inFlight.get(product.name)
    if (joined) return joined

    lastRefreshStartedAt.set(product.name, Date.now())

    const attempt: Promise<RefreshResult> = product
      .refresh({
        client: client.withTrigger(trigger),
        publisher,
        settings,
        stopped: () => stopped
      })
      .finally(() => {
        if (inFlight.get(product.name) === attempt)
          inFlight.delete(product.name)
      })
    inFlight.set(product.name, attempt)
    return attempt
  }

  function scheduleCacheRetry(
    product: Product,
    settings: Settings,
    delayMs: number
  ) {
    if (stopped) return
    const existing = positionRetryTimers.get(product.name)
    if (existing) clearTimeout(existing)
    positionRetryTimers.set(
      product.name,
      setTimeout(() => retryFromCache(product, settings), delayMs)
    )
  }

  /**
   * A product whose fetch landed with no vessel position to index it at, asked
   * again -- out of its own cache, never over the network. Waiting for a GPS
   * fix is exactly the case that must not turn into repeat NOAA traffic, and
   * on the aurora grid that traffic is 145 KB a time.
   *
   * It gives up after one interval, at which point either the recurring
   * schedule takes over (and buys a fresh grid, because a chart overlay drawn
   * from an hours-old capture is worse than one that says it has nothing), or
   * -- for a product with no schedule, refreshed once by hand -- there is
   * nothing further this was asked to do.
   */
  function retryFromCache(product: Product, settings: Settings) {
    if (stopped) return
    positionRetryTimers.delete(product.name)
    const intervalMs = intervalFor(product, settings)
    const sinceFetch =
      Date.now() - (lastRefreshStartedAt.get(product.name) ?? 0)
    const scheduled = productTimers.has(product.name)
    if (sinceFetch >= intervalMs) {
      awaitingPositionAttempts.delete(product.name)
      if (scheduled) run(product, settings)
      return
    }

    let published = true
    try {
      published =
        product.publishFromCache?.({
          client,
          publisher,
          settings,
          stopped: () => stopped
        }) ?? true
    } catch (err) {
      publisher.error(`Failed to publish '${product.name}' from cache: ${err}`)
    }

    if (published) {
      awaitingPositionAttempts.delete(product.name)
      if (scheduled) schedule(product, settings, intervalMs - sinceFetch)
      return
    }

    const attempt = awaitingPositionAttempts.get(product.name) ?? 0
    awaitingPositionAttempts.set(product.name, attempt + 1)
    scheduleCacheRetry(product, settings, retryDelayMs(attempt, intervalMs))
  }

  function run(product: Product, settings: Settings) {
    // One failing product must never take down the others, and an unhandled
    // rejection here would reach the server. Every branch below reschedules
    // itself — there is no setInterval backing this up.
    refreshOnce(product, settings)
      .then((result) => {
        if (result === 'awaiting-position') {
          const attempt = awaitingPositionAttempts.get(product.name) ?? 0
          awaitingPositionAttempts.set(product.name, attempt + 1)
          const delay = retryDelayMs(attempt, intervalFor(product, settings))
          publisher.debug(
            `'${product.name}' has no position yet; looking again in ${Math.round(delay / 1000)}s`
          )
          // The payload is already on disk, so the retry reads that back
          // rather than going to NOAA again.
          scheduleCacheRetry(product, settings, delay)
          return
        }
        awaitingPositionAttempts.delete(product.name)
        // A product can override its own next interval (the advisory
        // outlook tightens its cadence near the expected weekly issuance);
        // everyone else just gets intervalMinutes again, unchanged.
        const delay =
          result && 'nextDelayMinutes' in result
            ? result.nextDelayMinutes * 60 * 1000
            : intervalFor(product, settings)
        schedule(product, settings, delay)
      })
      .catch((err) => {
        publisher.error(`Failed to handle '${product.name}': ${err}`)
        schedule(product, settings, intervalFor(product, settings))
      })
  }

  return {
    id: PLUGIN_ID,
    name: 'NOAA Space Weather',
    description: 'SignalK Plugin to get SPACE weather from the NOAA SWPC',
    schema,

    // Serves the aurora product's own cached NOAA fetch back to the webapp
    // (GET /signalk/v1/api/signalk-noaa-space-weather/aurora-grid), so the
    // map reads the one server-side capture instead of the browser fetching
    // NOAA a second time. See src/cache/auroraCache.ts for why.
    //
    // Mounted via signalKApiRoutes, not registerWithRouter: the server
    // hardcodes the whole /plugins/* prefix to admin-only
    // (tokensecurity.js's adminAuthenticationMiddleware, unconditional, no
    // per-route override available), which would make this data-serving GET
    // require a full admin login unlike every other read in this webapp.
    // /signalk/v1/api/* carries no such gate on GET -- only PUT/POST/DELETE
    // are restricted there -- so it matches the read-level access the rest
    // of the plugin's data already has. Self-namespaced under the plugin id
    // because /signalk/v1/api is a namespace shared by every plugin using
    // this same extension point.
    signalKApiRoutes(router: any) {
      router.get(
        '/signalk-noaa-space-weather/aurora-grid',
        (_req: any, res: any) => {
          const cached = readAuroraCache(publisher)
          if (!cached) {
            res.status(404).json({
              error:
                'No aurora data cached yet. Fetch one on demand from this' +
                " plugin's webapp, or turn on automatic aurora updates in the" +
                ' plugin configuration.'
            })
            return
          }
          res.json(cached)
        }
      )

      // Same idea again, for D-RAP: one server-side fetch of a global grid,
      // read back by the webapp's map. Parsed rather than raw, because that
      // is what the cache holds -- see src/cache/drapCache.ts.
      router.get(
        '/signalk-noaa-space-weather/drap-grid',
        (_req: any, res: any) => {
          const cached = readDrapCache(publisher)
          if (!cached) {
            res.status(404).json({
              error:
                'No D-RAP data cached yet. Fetch one on demand from this' +
                " plugin's webapp, or turn on HF absorption in the plugin" +
                ' configuration.'
            })
            return
          }
          res.json(cached)
        }
      )

      // Same idea as aurora-grid above, for the weekly advisory outlook: the
      // webapp reads the plugin's own cached bulletin instead of a
      // notification path, which has changed shape before for other products.
      router.get(
        '/signalk-noaa-space-weather/advisory-outlook',
        (_req: any, res: any) => {
          const cached = readAdvisoryCache(publisher)
          if (!cached) {
            res.status(404).json({
              error: 'No advisory outlook cached yet.'
            })
            return
          }
          res.json(cached)
        }
      )

      // The grids as Web Mercator PNG tiles, so a chart plotter can draw the
      // oval, or the absorption footprint, over the actual chart.
      // `@signalk/charts-plugin` takes an online chart source as a {z}/{x}/{y}
      // URL, so this needs no resource-provider registration and no
      // Freeboard-SK change: point a chart source at one of these routes and
      // the overlay appears.
      //
      // GET-only and on the same namespace as the reads above, for the same
      // reason -- they serve the same data the webapp already reads, in a
      // different shape.
      function tileHandler(
        source: ReturnType<typeof tileSource>,
        label: string,
        emptyError: string
      ) {
        return async (req: any, res: any) => {
          const z = Number(req.params.z)
          const x = Number(req.params.x)
          const y = Number(req.params.y)
          if (!isValidTile(z, x, y)) {
            res.status(400).json({
              error: `Tile out of range. Zoom must be 0-${MAX_ZOOM}, and x and y within 0..2^z-1.`
            })
            return
          }

          const current = source.current()
          if (!current) {
            res.status(404).json({ error: emptyError })
            return
          }

          const cacheKey = `${z}/${x}/${y}`
          let png = source.get(cacheKey)
          if (!png) {
            try {
              png = await renderTile(current.lattice, z, x, y)
            } catch (err) {
              publisher.error(
                `Failed to render ${label} tile ${cacheKey}: ${err}`
              )
              res.status(500).json({ error: 'Tile could not be rendered.' })
              return
            }
            source.remember(current.key, cacheKey, png)
          }

          res.setHeader('Content-Type', 'image/png')
          // Tiles are only as fresh as the fetch behind them, and the aurora
          // interval is 120 minutes by default. ETag lets a client revalidate
          // cheaply across a refresh instead of guessing at an age.
          res.setHeader('ETag', `"${current.key}-${cacheKey}"`)
          res.setHeader('Cache-Control', 'public, max-age=300')
          // How old the grid behind the tile is. Every other reader of this
          // cache says so -- the webapp's map prints it, and the tile says
          // when updates are off -- but a chart plotter has only what is on
          // the wire, and the ETag carries the same instant as a token no
          // client may parse. It matters more now that leaving the schedule
          // off is a supported way to run: the cache then moves only when
          // somebody presses the button. Reported, not enforced; what counts
          // as too old belongs to whoever is navigating by it.
          const fetchedAt = Date.parse(current.key)
          if (Number.isFinite(fetchedAt)) {
            res.setHeader('Last-Modified', new Date(fetchedAt).toUTCString())
          }
          res.send(png)
        }
      }

      // A chart plotter has no button to offer, so these point at the setting
      // rather than at the webapp's on-demand fetch: an overlay that only
      // refreshes when somebody opens a browser is not an overlay anyone
      // should be navigating by.
      router.get(
        '/signalk-noaa-space-weather/aurora-tile/:z/:x/:y.png',
        tileHandler(
          auroraTiles,
          'aurora',
          'No aurora data cached yet. Turn on automatic aurora updates in the' +
            ' plugin configuration.'
        )
      )
      router.get(
        '/signalk-noaa-space-weather/drap-tile/:z/:x/:y.png',
        tileHandler(
          drapTiles,
          'D-RAP',
          'No D-RAP data cached yet. Turn on HF absorption in the plugin' +
            ' configuration.'
        )
      )

      // Manual "refresh now" for the webapp: a one-shot fetch of one product
      // outside the scheduled interval, cooldown-limited so a user mashing the
      // button (or a script hitting this URL) cannot turn a two-hour budget
      // into a busy loop. GET rather than POST for the same reason the reads
      // above are GET: this namespace gates PUT/POST/DELETE behind auth, and
      // these routes need no more privilege than the data they are refreshing.
      //
      // Works whether or not the product is scheduled. `auroraEnabled` and
      // `drapEnabled` say what the plugin may spend on its own initiative;
      // they do not say the data can never be had. Turning the recurring fetch
      // off and then having to turn it back on, wait out an interval and turn
      // it off again is four steps to answer one question, and it leaves a
      // recurring cost behind if the last step is forgotten.
      /**
       * What `goesFlux` currently has to show, read back out of Signal K --
       * the store it publishes to, which is also the only place it keeps
       * anything. Null when neither channel has ever landed, which is the one
       * outcome that makes a refresh a failure.
       */
      function publishedFlux() {
        const xrayFlux = publisher.selfPath(`${XRAY_FLUX_BASE}.value`) ?? null
        const protonFlux =
          publisher.selfPath(`${PROTON_FLUX_BASE}.value`) ?? null
        if (xrayFlux === null && protonFlux === null) return null
        return {
          xrayFlux,
          protonFlux,
          trend: publisher.selfPath(`${XRAY_FLUX_BASE}.trend.value`) ?? null
        }
      }

      //
      // `read` answers what the product has to show right now, and `landed`
      // decides whether this request produced it. The grids keep a capture on
      // disk stamped with the instant it was written, so a `fetchedAt` that
      // did not move means nothing new arrived. `goesFlux` keeps no capture --
      // it publishes straight to Signal K, and skips a channel whose value has
      // not changed since the last poll -- so an unchanged reading there is a
      // successful refresh, and the question is only whether there is a
      // reading at all.
      function refreshHandler(
        product: Product,
        read: () => any,
        landed: (before: any, after: any) => boolean = (before, after) =>
          !!after && after.fetchedAt !== before?.fetchedAt
      ) {
        return async (_req: any, res: any) => {
          const settings = currentSettings
          if (!settings) {
            res.status(503).json({ error: 'Plugin is not running.' })
            return
          }
          // A fetch already in flight is not traffic this request would add:
          // it joins that one below rather than being refused for it. Only a
          // fetch this request would *start* is the cooldown's business.
          if (!inFlight.has(product.name)) {
            const sinceLast =
              Date.now() - (lastRefreshStartedAt.get(product.name) ?? 0)
            if (sinceLast < FORCE_REFRESH_COOLDOWN_MS) {
              const retryAfterS = Math.ceil(
                (FORCE_REFRESH_COOLDOWN_MS - sinceLast) / 1000
              )
              res.setHeader('Retry-After', String(retryAfterS))
              res.status(429).json({
                error: `Refreshed too recently; try again in ${retryAfterS}s.`
              })
              return
            }
          }

          if (!metaPublished.has(product.name) && product.metadata) {
            publisher.meta(product.metadata(settings))
            metaPublished.add(product.name)
          }

          // What the cache holds before the fetch, to tell a refresh that
          // produced something from one that only returned. Every entry
          // carries the instant it was written, so an unchanged `fetchedAt`
          // means nothing new was written under this request.
          const before = read()

          let result: RefreshResult
          try {
            result = await refreshOnce(product, settings, 'webapp')
          } catch (err) {
            res
              .status(502)
              .json({ error: `${product.name} refresh failed: ${err}` })
            return
          }

          const cached = read()
          // `refresh()` returns without throwing when the payload carried no
          // usable data, and a cache write is best effort. Either way nothing
          // landed, and answering 200 with the previous reading would report a
          // refresh that did not happen -- on the webapp, a button that says it
          // worked over a reading that has not moved.
          if (!landed(before, cached)) {
            res.status(502).json({
              error: `Refreshed, but no new ${product.name} data came back from NOAA.`
            })
            return
          }

          // 'awaiting-position' is not a failure of this request. The grid is
          // what was asked for and the grid arrived; only the value at the
          // boat is still waiting on a fix, and the scheduler is already
          // watching for one.
          if (result === 'awaiting-position') {
            scheduleCacheRetry(product, settings, RETRY_BASE_MS)
          } else {
            awaitingPositionAttempts.delete(product.name)
            deferNextRun(product, settings)
          }
          res.json(cached)
        }
      }

      router.get(
        '/signalk-noaa-space-weather/aurora-refresh',
        refreshHandler(aurora, () => readAuroraCache(publisher))
      )
      router.get(
        '/signalk-noaa-space-weather/drap-refresh',
        refreshHandler(drap, () => readDrapCache(publisher))
      )
      // Whether or not `goesFluxEnabled` schedules it, for the same reason the
      // two grids have a route: the setting says what the plugin may spend on
      // its own initiative, and a press is not the plugin's own initiative.
      // Without this, switching off the poll's most expensive product is the
      // one toggle that makes its data unobtainable.
      router.get(
        '/signalk-noaa-space-weather/goesflux-refresh',
        refreshHandler(
          goesFlux,
          publishedFlux,
          (_before, after) => after !== null
        )
      )

      // When the webapp has no values, "the first fetch has not landed yet"
      // and "this has been running all afternoon and NOAA is unreachable"
      // look identical -- Signal K carries no trace of a value that was
      // never published. The plugin's own start time is the only thing that
      // separates them, and nothing else exposes it.
      //
      // `settings` is what `settingsFrom` made of the saved configuration,
      // which is not the same thing as the saved configuration: a default it
      // supplied, or a superseded key it migrated, is a value the plugin is
      // running that nothing has ever been saved with. The configuration
      // panel shows the saved side and needs this one to know when the two
      // disagree.
      router.get(
        '/signalk-noaa-space-weather/status',
        (_req: any, res: any) => {
          if (!startedAt) {
            res.status(503).json({ error: 'Plugin is not running.' })
            return
          }
          res.json({ startedAt, settings: currentSettings })
        }
      )

      // The primary surface for docs/instrumentation-design.md: the ring of
      // recent fetches, each endpoint's rolling 24 hourly buckets, and its
      // totals since install, straight from the meter with nothing computed
      // on top yet. `schema` is versioned so a scraper can tell one shape
      // from the next -- bumped to 2 when `totals` was added; the
      // predicted-vs-measured comparison is still a later phase, needing
      // src/endpoints.ts's declarations wired in alongside this.
      router.get(
        '/signalk-noaa-space-weather/telemetry',
        (_req: any, res: any) => {
          if (!startedAt) {
            res.status(503).json({ error: 'Plugin is not running.' })
            return
          }
          res.json({
            schema: 2,
            startedAt,
            settings: currentSettings,
            ...meterSnapshot(client.meter)
          })
        }
      )

      return router
    },

    start(props: any) {
      stopped = false
      awaitingPositionAttempts.clear()
      productTimers.clear()
      positionRetryTimers.clear()
      const settings = settingsFrom(props)
      currentSettings = settings
      startedAt = new Date().toISOString()
      metaPublished.clear()
      // getDataDirPath() -- which readCache/writeCache resolve through -- is
      // only callable from start() onward per the server's own docs, so this
      // can't happen in the constructor alongside createClient().
      if (!totalsLoaded) {
        loadTotals(client.meter, publisher)
        totalsLoaded = true
      }

      for (const product of PRODUCTS) {
        if (product.enabled && !product.enabled(settings)) continue

        if (product.metadata) {
          publisher.meta(product.metadata(settings))
          metaPublished.add(product.name)
        }

        schedule(product, settings, INITIAL_DELAY_MS)
      }
    },

    stop() {
      // The one flush the design doc allows outside the hourly gate -- so a
      // clean stop doesn't lose up to an hour of totals it didn't have to.
      flushTotals(client.meter, publisher, Date.now())
      stopped = true
      currentSettings = null
      startedAt = null
      productTimers.forEach((timer) => clearTimeout(timer))
      productTimers.clear()
      positionRetryTimers.forEach((timer) => clearTimeout(timer))
      positionRetryTimers.clear()
      // Several MB of rendered tiles and the flattened grids have no reason to
      // outlive the plugin being switched off.
      auroraTiles.clear()
      drapTiles.clear()
    }
  }
}
