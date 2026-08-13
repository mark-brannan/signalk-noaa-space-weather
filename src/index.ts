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
import { readAdvisoryCache } from './cache/advisoryCache.js'
import { createPublisher } from './publisher.js'
import { advisory } from './products/advisory.js'
import { aurora } from './products/aurora.js'
import { alerts } from './products/alerts.js'
import { f107 } from './products/f107.js'
import { kp } from './products/kp.js'
import { outlook27 } from './products/outlook27.js'
import { scales } from './products/scales.js'
import { solarWind } from './products/solarWind.js'
import { Product } from './products/types.js'
import {
  MAX_ZOOM,
  auroraGridFrom,
  isValidTile,
  renderAuroraTile
} from './tiles.js'

const PRODUCTS: Product[] = [
  scales,
  kp,
  outlook27,
  solarWind,
  f107,
  aurora,
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
 * Floor between manual "refresh now" requests from the webapp. The aurora
 * interval defaults to two hours to bound what that payload costs, so a button
 * a user can mash has to bound it too, independent of the configured interval.
 */
const FORCE_REFRESH_COOLDOWN_MS = 60 * 1000
/**
 * Rendered tiles held in memory. A 1280x800 viewport is about 20 tiles, so
 * this covers several pans and zooms of the same forecast; anything evicted
 * costs the ~4ms to draw again. Bounded because this runs on boat hardware
 * next to everything else the server is doing.
 */
const TILE_CACHE_LIMIT = 256

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
  /** Set on start(), read by the force-refresh route below. */
  let currentSettings: Settings | null = null
  let lastForcedRefreshAt = 0
  /** When this run of the plugin began; served by the status route below. */
  let startedAt: string | null = null

  /**
   * Tile rendering reads the same disk cache the webapp's map does, but
   * re-parsing 900 KB of JSON and reflattening the grid costs ~33ms, which
   * would dwarf the ~4ms of actual drawing on every request. So both the
   * flattened grid and the rendered tiles are memoised against the cache
   * entry's `fetchedAt`, and the whole lot is dropped when a newer fetch
   * lands -- a stale tile is worse than a slow one.
   */
  let tileGridKey: string | null = null
  let tileGrid: Uint8Array | null = null
  const tileCache = new Map<string, Buffer>()

  function auroraGridForTiles(): { grid: Uint8Array; key: string } | null {
    const cached = readAuroraCache(publisher.dataDirPath())
    if (!cached) return null
    if (tileGridKey !== cached.fetchedAt || !tileGrid) {
      const grid = auroraGridFrom(cached.grid?.coordinates)
      if (!grid) return null
      tileGrid = grid
      tileGridKey = cached.fetchedAt
      tileCache.clear()
    }
    return { grid: tileGrid, key: cached.fetchedAt }
  }

  function rememberTile(key: string, png: Buffer) {
    if (tileCache.size >= TILE_CACHE_LIMIT) {
      // Map iterates in insertion order, so the first key is the oldest.
      const oldest = tileCache.keys().next()
      if (!oldest.done) tileCache.delete(oldest.value)
    }
    tileCache.set(key, png)
  }

  function intervalFor(product: Product, settings: Settings): number {
    return product.intervalMinutes(settings) * 60 * 1000
  }

  function schedule(product: Product, settings: Settings, delayMs: number) {
    if (stopped) return
    productTimers.set(
      product.name,
      setTimeout(() => run(product, settings), delayMs)
    )
  }

  function run(product: Product, settings: Settings) {
    const ctx = { client, publisher, settings, stopped: () => stopped }
    // One failing product must never take down the others, and an unhandled
    // rejection here would reach the server. Every branch below reschedules
    // itself — there is no setInterval backing this up.
    product
      .refresh(ctx)
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
                'No aurora data cached yet. Enable aurora in the plugin' +
                ' configuration and wait for the next fetch cycle.'
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

      // The aurora grid as Web Mercator PNG tiles, so a chart plotter can
      // draw the oval over the actual chart. `@signalk/charts-plugin` takes
      // an online chart source as a {z}/{x}/{y} URL, so this needs no
      // resource-provider registration and no Freeboard-SK change: point a
      // chart source at this route and the overlay appears.
      //
      // GET-only and on the same namespace as the reads above, for the same
      // reason -- it serves the same data the webapp already reads, in a
      // different shape.
      router.get(
        '/signalk-noaa-space-weather/aurora-tile/:z/:x/:y.png',
        async (req: any, res: any) => {
          const z = Number(req.params.z)
          const x = Number(req.params.x)
          const y = Number(req.params.y)
          if (!isValidTile(z, x, y)) {
            res.status(400).json({
              error: `Tile out of range. Zoom must be 0-${MAX_ZOOM}, and x and y within 0..2^z-1.`
            })
            return
          }

          const source = auroraGridForTiles()
          if (!source) {
            res.status(404).json({
              error:
                'No aurora data cached yet. Enable aurora in the plugin' +
                ' configuration and wait for the next fetch cycle.'
            })
            return
          }

          const cacheKey = `${z}/${x}/${y}`
          let png = tileCache.get(cacheKey)
          if (!png) {
            try {
              png = await renderAuroraTile(source.grid, z, x, y)
            } catch (err) {
              publisher.error(
                `Failed to render aurora tile ${cacheKey}: ${err}`
              )
              res.status(500).json({ error: 'Tile could not be rendered.' })
              return
            }
            // The grid can be replaced by a refresh while a render is in
            // flight; caching the result under the new grid's key would serve
            // a tile drawn from the old one.
            if (tileGridKey === source.key) rememberTile(cacheKey, png)
          }

          res.setHeader('Content-Type', 'image/png')
          // Tiles are only as fresh as the fetch behind them, and the aurora
          // interval is 120 minutes by default. ETag lets a client revalidate
          // cheaply across a refresh instead of guessing at an age.
          res.setHeader('ETag', `"${source.key}-${cacheKey}"`)
          res.setHeader('Cache-Control', 'public, max-age=300')
          res.send(png)
        }
      )

      // Manual "refresh now" for the webapp: a one-shot aurora fetch outside
      // the scheduled interval, cooldown-limited so a user mashing the
      // button (or a script hitting this URL) cannot turn a two-hour budget
      // into a busy loop. GET rather than POST for the same reason the read
      // above is GET: this namespace gates PUT/POST/DELETE behind auth, and
      // this route needs no more privilege than the data it is refreshing.
      router.get(
        '/signalk-noaa-space-weather/aurora-refresh',
        async (_req: any, res: any) => {
          if (!currentSettings) {
            res.status(503).json({ error: 'Plugin is not running.' })
            return
          }
          if (!currentSettings.auroraEnabled) {
            res.status(400).json({
              error: 'Aurora is disabled in the plugin configuration.'
            })
            return
          }
          const sinceLast = Date.now() - lastForcedRefreshAt
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
          lastForcedRefreshAt = Date.now()

          try {
            const result = await aurora.refresh({
              client,
              publisher,
              settings: currentSettings,
              stopped: () => stopped
            })
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
          if (!cached) {
            // The fetch above succeeded (no throw, not 'not-ready') but
            // wrote nothing readable back -- best-effort cache write must
            // have failed. The scheduled probability publish still went out.
            res.status(502).json({
              error:
                'Refreshed, but the result could not be read back from cache.'
            })
            return
          }
          res.json(cached)
        }
      )

      // When the webapp has no values, "the first fetch has not landed yet"
      // and "this has been running all afternoon and NOAA is unreachable"
      // look identical -- Signal K carries no trace of a value that was
      // never published. The plugin's own start time is the only thing that
      // separates them, and nothing else exposes it.
      router.get(
        '/signalk-noaa-space-weather/status',
        (_req: any, res: any) => {
          if (!startedAt) {
            res.status(503).json({ error: 'Plugin is not running.' })
            return
          }
          res.json({ startedAt })
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

      for (const product of PRODUCTS) {
        if (product.enabled && !product.enabled(settings)) continue

        if (product.metadata) {
          publisher.meta(product.metadata(settings))
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
      tileCache.clear()
      tileGrid = null
      tileGridKey = null
    }
  }
}
