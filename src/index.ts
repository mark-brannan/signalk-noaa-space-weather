/**
 * Signal K plugin surfacing NOAA Space Weather Prediction Center products.
 *
 * This module is only the plugin definition and lifecycle. Each NOAA product
 * owns its own paths, metadata and parsing under src/products/, parsing itself
 * is pure and lives in src/parse.ts, and all I/O goes through src/noaa/client
 * (in) and src/publisher (out).
 */
import { Settings, schema, settingsFrom } from './config.js'
import { createClient } from './noaa/client.js'
import { readAuroraCache } from './cache/auroraCache.js'
import { readDrapCache } from './cache/drapCache.js'
import { readAdvisoryCache } from './cache/advisoryCache.js'
import { createPublisher } from './publisher.js'
import { advisory } from './products/advisory.js'
import { aIndex } from './products/aIndex.js'
import { aurora } from './products/aurora.js'
import { alerts } from './products/alerts.js'
import { drap } from './products/drap.js'
import { f107 } from './products/f107.js'
import { goesFlux } from './products/goesFlux.js'
import { kp } from './products/kp.js'
import { outlook27 } from './products/outlook27.js'
import { scales } from './products/scales.js'
import { sunspot } from './products/sunspot.js'
import { solarWind } from './products/solarWind.js'
import { Product } from './products/types.js'
import {
  MAX_ZOOM,
  auroraGridFrom,
  drapGridFrom,
  isValidTile,
  renderAuroraTile,
  renderDrapTile
} from './tiles.js'

const PRODUCTS: Product[] = [
  scales,
  kp,
  outlook27,
  solarWind,
  f107,
  goesFlux,
  aIndex,
  sunspot,
  aurora,
  drap,
  advisory,
  alerts
]

const PLUGIN_ID = 'signalk-noaa-space-weather'
/** Let the server settle before the first fetch. */
const INITIAL_DELAY_MS = 5000
/**
 * Backoff for a product whose preconditions are not met yet. A GPS fix
 * usually arrives within seconds, so the first look is quick; but a dev
 * server or a boat with no GPS at all may never satisfy it, and that must
 * settle into a quiet heartbeat rather than a busy loop.
 */
const NOT_READY_BASE_MS = 5000
const NOT_READY_MAX_MS = 5 * 60 * 1000
/**
 * Floor between aurora fetches a manual "refresh now" is allowed to start. The
 * aurora interval defaults to two hours to bound what that payload costs, so a
 * button a user can mash has to bound it too, independent of the configured
 * interval.
 *
 * Measured against the last fetch rather than the last press, so a scheduled
 * fetch holds it down as well — a press seconds after one would buy the same
 * grid twice. One number for both cases: it is the same NOAA traffic whether
 * or not a schedule is running, and a second, longer floor for the unscheduled
 * case would be a rule nobody could predict from the setting they changed.
 */
const FORCE_REFRESH_COOLDOWN_MS = 60 * 1000
/**
 * Rendered tiles held in memory. A 1280x800 viewport is about 20 tiles, so
 * this covers several pans and zooms of the same forecast; anything evicted
 * costs the ~4ms to draw again. Bounded because this runs on boat hardware
 * next to everything else the server is doing.
 */
const TILE_CACHE_LIMIT = 256

/** What a product's refresh resolves to; see the Product interface. */
type RefreshResult = Awaited<ReturnType<Product['refresh']>>

/** Geometric backoff, capped both by NOT_READY_MAX_MS and the product's own interval. */
export function notReadyDelayMs(attempt: number, intervalMs: number): number {
  const geometric = NOT_READY_BASE_MS * Math.pow(2, Math.max(0, attempt))
  return Math.min(
    geometric,
    NOT_READY_MAX_MS,
    Math.max(intervalMs, NOT_READY_BASE_MS)
  )
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
  let stopped = false
  /** Consecutive 'not-ready' results per product, for the backoff. */
  const notReadyAttempts = new Map<string, number>()
  /** Refreshes currently awaiting NOAA, so a second caller joins rather than
   * starting its own. See `refreshOnce`. */
  const inFlight = new Map<string, Promise<RefreshResult>>()
  /** When each product's most recent fetch began, whoever started it. */
  const lastRefreshStartedAt = new Map<string, number>()
  /** Set on start(), read by the force-refresh route below. */
  let currentSettings: Settings | null = null
  /**
   * start() publishes a product's metadata only for the products it schedules,
   * so an on-demand fetch of an unscheduled aurora has to publish its own —
   * otherwise the probability lands on a path with no units, no zones and no
   * display name, which is a bare number in the data browser.
   */
  let auroraMetaPublished = false
  /** When this run of the plugin began; served by the status route below. */
  let startedAt: string | null = null

  /**
   * Tile rendering reads the same disk cache the webapp's map does, but
   * re-parsing 900 KB of JSON and reflattening the grid costs ~33ms, which
   * would dwarf the ~4ms of actual drawing on every request. So both the
   * flattened grid and the rendered tiles are memoised against the cache
   * entry's `fetchedAt`, and the whole lot is dropped when a newer fetch
   * lands -- a stale tile is worse than a slow one.
   *
   * One of these per grid the plugin draws (aurora, D-RAP): they hold
   * separate caches because they are refreshed on separate schedules, and a
   * D-RAP fetch has no business evicting a screenful of aurora tiles.
   */
  interface TileLayer {
    name: string
    /** The flattened grid and the cache instant it came from, or null. */
    source(): { grid: any; key: string } | null
    render(grid: any, z: number, x: number, y: number): Promise<Buffer>
    /** What to say when nothing has been cached yet. */
    notCached: string
    clear(): void
  }

  function tileLayer<Grid, Entry extends { fetchedAt: string }>(spec: {
    name: string
    read(): Entry | null
    flatten(entry: Entry): Grid | null
    render(grid: Grid, z: number, x: number, y: number): Promise<Buffer>
    notCached: string
  }): TileLayer {
    let gridKey: string | null = null
    let grid: Grid | null = null
    const tiles = new Map<string, Buffer>()

    return {
      name: spec.name,
      notCached: spec.notCached,
      source() {
        const cached = spec.read()
        if (!cached) return null
        if (gridKey !== cached.fetchedAt || !grid) {
          const flattened = spec.flatten(cached)
          if (!flattened) return null
          grid = flattened
          gridKey = cached.fetchedAt
          tiles.clear()
        }
        return { grid, key: cached.fetchedAt }
      },
      async render(source: Grid, z: number, x: number, y: number) {
        const cacheKey = `${z}/${x}/${y}`
        const held = tiles.get(cacheKey)
        if (held) return held
        const png = await spec.render(source, z, x, y)
        // The grid can be replaced by a refresh while a render is in flight;
        // caching the result under the new grid's key would serve a tile
        // drawn from the old one.
        if (grid === source) {
          if (tiles.size >= TILE_CACHE_LIMIT) {
            // Map iterates in insertion order, so the first key is the oldest.
            const oldest = tiles.keys().next()
            if (!oldest.done) tiles.delete(oldest.value)
          }
          tiles.set(cacheKey, png)
        }
        return png
      },
      clear() {
        tiles.clear()
        grid = null
        gridKey = null
      }
    }
  }

  const auroraLayer = tileLayer({
    name: 'aurora',
    read: () => readAuroraCache(publisher.dataDirPath()),
    flatten: (entry) => auroraGridFrom(entry.grid?.coordinates),
    render: renderAuroraTile,
    // A chart plotter has no button to offer, so this points at the setting
    // rather than at the webapp's on-demand fetch: an overlay that only
    // refreshes when somebody opens a browser is not an overlay anyone
    // should be navigating by.
    notCached:
      'No aurora data cached yet. Turn on automatic aurora updates in the' +
      ' plugin configuration.'
  })

  const drapLayer = tileLayer({
    name: 'D-RAP',
    read: () => readDrapCache(publisher.dataDirPath()),
    flatten: (entry) => drapGridFrom(entry.grid),
    render: renderDrapTile,
    notCached:
      'No D-RAP data cached yet. Turn on "Publish HF absorption (NOAA' +
      ' D-RAP)" in the plugin configuration.'
  })

  const tileLayers = [auroraLayer, drapLayer]

  /** The route handler both tile layers are served by. */
  function serveTile(layer: TileLayer) {
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

      const source = layer.source()
      if (!source) {
        res.status(404).json({ error: layer.notCached })
        return
      }

      let png: Buffer
      try {
        png = await layer.render(source.grid, z, x, y)
      } catch (err) {
        publisher.error(
          `Failed to render ${layer.name} tile ${z}/${x}/${y}: ${err}`
        )
        res.status(500).json({ error: 'Tile could not be rendered.' })
        return
      }

      res.setHeader('Content-Type', 'image/png')
      // Tiles are only as fresh as the fetch behind them. ETag lets a client
      // revalidate cheaply across a refresh instead of guessing at an age.
      res.setHeader('ETag', `"${source.key}-${z}/${x}/${y}"`)
      res.setHeader('Cache-Control', 'public, max-age=300')
      // How old the grid behind the tile is. Every other reader of these
      // caches says so -- the webapp's maps print it -- but a chart plotter
      // has only what is on the wire, and the ETag carries the same instant
      // as a token no client may parse. It matters more now that leaving a
      // schedule off is a supported way to run: the cache then moves only
      // when somebody presses the button. Reported, not enforced; what
      // counts as too old belongs to whoever is navigating by it.
      const fetchedAt = Date.parse(source.key)
      if (Number.isFinite(fetchedAt)) {
        res.setHeader('Last-Modified', new Date(fetchedAt).toUTCString())
      }
      res.send(png)
    }
  }

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
   */
  function refreshOnce(product: Product, settings: Settings) {
    const joined = inFlight.get(product.name)
    if (joined) return joined

    const previousStartedAt = lastRefreshStartedAt.get(product.name)
    lastRefreshStartedAt.set(product.name, Date.now())

    const attempt: Promise<RefreshResult> = product
      .refresh({ client, publisher, settings, stopped: () => stopped })
      .then((result) => {
        // 'not-ready' is decided before anything goes out — the aurora product
        // checks for a position first — so it is not a fetch, and must not
        // hold down a cooldown that exists to bound NOAA traffic.
        if (result === 'not-ready') {
          if (previousStartedAt === undefined)
            lastRefreshStartedAt.delete(product.name)
          else lastRefreshStartedAt.set(product.name, previousStartedAt)
        }
        return result
      })
      .finally(() => {
        if (inFlight.get(product.name) === attempt)
          inFlight.delete(product.name)
      })
    inFlight.set(product.name, attempt)
    return attempt
  }

  function run(product: Product, settings: Settings) {
    // One failing product must never take down the others, and an unhandled
    // rejection here would reach the server. Every branch below reschedules
    // itself — there is no setInterval backing this up.
    refreshOnce(product, settings)
      .then((result) => {
        if (result === 'not-ready') {
          const attempt = notReadyAttempts.get(product.name) ?? 0
          notReadyAttempts.set(product.name, attempt + 1)
          const delay = notReadyDelayMs(attempt, intervalFor(product, settings))
          publisher.debug(
            `'${product.name}' is not ready; looking again in ${Math.round(delay / 1000)}s`
          )
          schedule(product, settings, delay)
          return
        }
        notReadyAttempts.delete(product.name)
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
          const cached = readAuroraCache(publisher.dataDirPath())
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

      // Same idea as aurora-grid above, for the weekly advisory outlook: the
      // webapp reads the plugin's own cached bulletin instead of a
      // notification path, which has changed shape before for other products.
      router.get(
        '/signalk-noaa-space-weather/advisory-outlook',
        (_req: any, res: any) => {
          const cached = readAdvisoryCache(publisher.dataDirPath())
          if (!cached) {
            res.status(404).json({
              error: 'No advisory outlook cached yet.'
            })
            return
          }
          res.json(cached)
        }
      )

      // The grids as Web Mercator PNG tiles, so a chart plotter can draw
      // them over the actual chart. `@signalk/charts-plugin` takes an online
      // chart source as a {z}/{x}/{y} URL, so this needs no resource-provider
      // registration and no Freeboard-SK change: point a chart source at one
      // of these routes and the overlay appears.
      //
      // GET-only and on the same namespace as the reads above, for the same
      // reason -- they serve the same data the webapp already reads, in a
      // different shape.
      router.get(
        '/signalk-noaa-space-weather/aurora-tile/:z/:x/:y.png',
        serveTile(auroraLayer)
      )

      // D-RAP's is the one that answers a question the vessel's own reading
      // cannot: a path to a station crosses cells the boat is not sitting in,
      // and a band that works here can be dead a thousand miles down the
      // bearing. See docs/hf-operator-view.md.
      router.get(
        '/signalk-noaa-space-weather/drap-tile/:z/:x/:y.png',
        serveTile(drapLayer)
      )

      // The cached D-RAP grid itself, for the webapp's absorption map --
      // aurora-grid above, for the other grid, and for the same reason: one
      // server-side fetch, and a browser that only talks to the server it
      // loaded the page from.
      router.get(
        '/signalk-noaa-space-weather/drap-grid',
        (_req: any, res: any) => {
          const cached = readDrapCache(publisher.dataDirPath())
          if (!cached) {
            res.status(404).json({ error: drapLayer.notCached })
            return
          }
          res.json(cached)
        }
      )

      // Manual "refresh now" for the webapp: a one-shot aurora fetch outside
      // the scheduled interval, cooldown-limited so a user mashing the
      // button (or a script hitting this URL) cannot turn a two-hour budget
      // into a busy loop. GET rather than POST for the same reason the read
      // above is GET: this namespace gates PUT/POST/DELETE behind auth, and
      // this route needs no more privilege than the data it is refreshing.
      //
      // Works whether or not aurora is scheduled. `auroraEnabled` says what
      // the plugin may spend on its own initiative; it does not say the data
      // can never be had. Turning the recurring fetch off and then having to
      // turn it back on, wait out an interval and turn it off again is four
      // steps to answer one question, and it leaves a recurring cost behind
      // if the last step is forgotten.
      router.get(
        '/signalk-noaa-space-weather/aurora-refresh',
        async (_req: any, res: any) => {
          const settings = currentSettings
          if (!settings) {
            res.status(503).json({ error: 'Plugin is not running.' })
            return
          }
          // A fetch already in flight is not traffic this request would add:
          // it joins that one below rather than being refused for it. Only a
          // fetch this request would *start* is the cooldown's business.
          if (!inFlight.has(aurora.name)) {
            const sinceLast =
              Date.now() - (lastRefreshStartedAt.get(aurora.name) ?? 0)
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

          if (!auroraMetaPublished && aurora.metadata) {
            publisher.meta(aurora.metadata(settings))
            auroraMetaPublished = true
          }

          // What the cache holds before the fetch, to tell a refresh that
          // produced something from one that only returned. Every entry
          // carries the instant it was written, so an unchanged `fetchedAt`
          // means nothing new was written under this request.
          const before = readAuroraCache(publisher.dataDirPath())

          try {
            const result = await refreshOnce(aurora, settings)
            if (result === 'not-ready') {
              res.status(409).json({
                error: 'No vessel position available to refresh against yet.'
              })
              return
            }
          } catch (err) {
            res.status(502).json({ error: `Aurora refresh failed: ${err}` })
            return
          }

          const cached = readAuroraCache(publisher.dataDirPath())
          // `refresh()` returns without throwing when the payload carried no
          // usable grid, and its cache write is best effort. Either way
          // nothing new landed, and answering 200 with the previous grid would
          // report a refresh that did not happen -- on the webapp, a button
          // that says it worked over a reading that has not moved.
          if (!cached || cached.fetchedAt === before?.fetchedAt) {
            res.status(502).json({
              error: 'Refreshed, but no new aurora grid came back from NOAA.'
            })
            return
          }

          notReadyAttempts.delete(aurora.name)
          deferNextRun(aurora, settings)
          res.json(cached)
        }
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

      return router
    },

    start(props: any) {
      stopped = false
      notReadyAttempts.clear()
      productTimers.clear()
      const settings = settingsFrom(props)
      currentSettings = settings
      startedAt = new Date().toISOString()
      auroraMetaPublished = false

      for (const product of PRODUCTS) {
        if (product.enabled && !product.enabled(settings)) continue

        if (product.metadata) {
          publisher.meta(product.metadata(settings))
          if (product === aurora) auroraMetaPublished = true
        }

        schedule(product, settings, INITIAL_DELAY_MS)
      }
    },

    stop() {
      stopped = true
      currentSettings = null
      startedAt = null
      productTimers.forEach((timer) => clearTimeout(timer))
      productTimers.clear()
      // Several MB of rendered tiles and the flattened grid have no reason to
      // outlive the plugin being switched off.
      tileLayers.forEach((layer) => layer.clear())
    }
  }
}
