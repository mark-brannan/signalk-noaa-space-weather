/**
 * Signal K plugin surfacing NOAA Space Weather Prediction Center products.
 *
 * This module is only the plugin definition and lifecycle. Each NOAA product
 * owns its own paths, metadata and parsing under src/products/, parsing itself
 * is pure and lives in src/parse.ts, and all I/O goes through src/noaa/client
 * (in) and src/publisher (out). Adding a data source means adding one product
 * module and one entry in PRODUCTS below.
 */
import { Settings, schema, settingsFrom } from './config.js'
import { createClient } from './noaa/client.js'
import { createPublisher } from './publisher.js'
import { advisory } from './products/advisory.js'
import { aurora } from './products/aurora.js'
import { alerts } from './products/alerts.js'
import { kp } from './products/kp.js'
import { scales } from './products/scales.js'
import { solarWind } from './products/solarWind.js'
import { Product } from './products/types.js'

const PRODUCTS: Product[] = [scales, kp, solarWind, aurora, advisory, alerts]

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

/** Geometric backoff, capped both by NOT_READY_MAX_MS and the product's own interval. */
export function notReadyDelayMs(attempt: number, intervalMs: number): number {
  const geometric = NOT_READY_BASE_MS * Math.pow(2, Math.max(0, attempt))
  return Math.min(geometric, NOT_READY_MAX_MS, Math.max(intervalMs, NOT_READY_BASE_MS))
}

interface Plugin {
  start: (props: any) => void
  stop: () => void
  id: string
  name: string
  description: string
  schema: any
}

export default function (app: any): Plugin {
  const publisher = createPublisher(app, PLUGIN_ID)
  const client = createClient(publisher)

  let timers: any[] = []
  let stopped = false
  /** Consecutive 'not-ready' results per product, for the backoff. */
  const notReadyAttempts = new Map<string, number>()

  function intervalFor(product: Product, settings: Settings): number {
    return product.intervalMinutes(settings) * 60 * 1000
  }

  function run(product: Product, settings: Settings) {
    const ctx = { client, publisher, settings, stopped: () => stopped }
    // One failing product must never take down the others, and an unhandled
    // rejection here would reach the server.
    product
      .refresh(ctx)
      .then((result) => {
        if (result !== 'not-ready') {
          notReadyAttempts.delete(product.name)
          return
        }
        if (stopped) return
        const attempt = notReadyAttempts.get(product.name) ?? 0
        notReadyAttempts.set(product.name, attempt + 1)
        const delay = notReadyDelayMs(attempt, intervalFor(product, settings))
        publisher.debug(
          `'${product.name}' is not ready; looking again in ${Math.round(delay / 1000)}s`
        )
        timers.push(setTimeout(() => run(product, settings), delay))
      })
      .catch((err) => {
        publisher.error(`Failed to handle '${product.name}': ${err}`)
      })
  }

  return {
    id: PLUGIN_ID,
    name: 'NOAA Space Weather',
    description: 'SignalK Plugin to get SPACE weather from the NOAA SWPC',
    schema,

    start(props: any) {
      stopped = false
      notReadyAttempts.clear()
      const settings = settingsFrom(props)

      for (const product of PRODUCTS) {
        if (product.enabled && !product.enabled(settings)) continue

        if (product.metadata) {
          publisher.meta(product.metadata(settings))
        }

        // Both handles are tracked: only the intervals used to be, so a stop
        // inside the initial delay left a fetch pending that still published.
        timers.push(setTimeout(() => run(product, settings), INITIAL_DELAY_MS))
        timers.push(
          setInterval(
            () => run(product, settings),
            intervalFor(product, settings)
          )
        )
      }
    },

    stop() {
      stopped = true
      timers.forEach((timer) => clearTimeout(timer))
      timers = []
    }
  }
}
