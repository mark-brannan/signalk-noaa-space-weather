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
import { alerts } from './products/alerts.js'
import { kp } from './products/kp.js'
import { scales } from './products/scales.js'
import { solarWind } from './products/solarWind.js'
import { Product } from './products/types.js'

const PRODUCTS: Product[] = [scales, kp, solarWind, advisory, alerts]

const PLUGIN_ID = 'signalk-noaa-space-weather'
/** Let the server settle before the first fetch. */
const INITIAL_DELAY_MS = 5000

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

  function intervalFor(product: Product, settings: Settings): number {
    const minutes =
      product.schedule === 'observations'
        ? settings.observationsInterval
        : settings.notificationsInterval
    return minutes * 60 * 1000
  }

  function run(product: Product, settings: Settings) {
    const ctx = { client, publisher, settings, stopped: () => stopped }
    // One failing product must never take down the others, and an unhandled
    // rejection here would reach the server.
    product.refresh(ctx).catch((err) => {
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
