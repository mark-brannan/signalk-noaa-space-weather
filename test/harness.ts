import { settingsFrom } from '../src/config'
import { Client } from '../src/noaa/client'
import { ValueUpdate } from '../src/parse'
import { Meta, Publisher } from '../src/publisher'
import { ProductContext } from '../src/products/types'

/**
 * The point of the products/ split: a product can be exercised with a fake
 * client and a fake publisher, with no server, no timers and no network. Each
 * of these drives the real refresh path over a captured payload and asserts on
 * what would reach Signal K.
 *
 * The stubs satisfy Client and Publisher rather than being cast at the call
 * site. A cast on `refresh(ctx)` accepts whatever the stubs happen to be, so a
 * product reaching for something they don't have -- `dataDirPath`, a second
 * argument to `client.text` -- would surface as an undefined at runtime.
 * `npm run typecheck` fails on it instead.
 */
export function harness(responses: Record<string, any>) {
  const published: { values: ValueUpdate[]; timestamp: string }[] = []
  const metas: Meta[] = []
  const errors: string[] = []

  const publisher: Publisher = {
    meta: (m) => metas.push(...m),
    values: (values, timestamp) => published.push({ values, timestamp }),
    value(path, value, timestamp) {
      this.values([{ path, value }], timestamp)
    },
    // Answers what this harness has already published, so a product that
    // checks the tree before republishing sees what a server would show it:
    // the newest update for that path, not the first, and the `.timestamp`
    // leaf alongside the `.value` one.
    selfPath: (path: string) => {
      for (let i = published.length - 1; i >= 0; i--) {
        const { values, timestamp } = published[i]
        for (const update of values) {
          if (`${update.path}.value` === path) return update.value
          if (`${update.path}.timestamp` === path) return timestamp
        }
      }
      return undefined
    },
    status: () => {},
    fail: () => {},
    error: (m, ...a) => errors.push(`${m} ${a.join(' ')}`),
    debug: () => {},
    // No product exercised here persists a file, and a stub handing back a
    // real directory would let one start doing so without a test noticing.
    dataDirPath: () => {
      throw new Error('dataDirPath is not stubbed')
    }
  }

  const client: Client = {
    json: async (subPath) => {
      if (!(subPath in responses)) throw new Error(`unstubbed ${subPath}`)
      return responses[subPath]
    },
    text: async (subPath) => {
      if (!(subPath in responses)) throw new Error(`unstubbed ${subPath}`)
      return responses[subPath]
    }
  }

  const ctx: ProductContext = {
    client,
    publisher,
    settings: settingsFrom({}),
    stopped: () => false
  }

  const flat = () => published.flatMap((p) => p.values)
  return {
    publisher,
    client,
    metas,
    errors,
    published,
    ctx,
    valueAt: (path: string) => flat().find((v) => v.path === path)?.value,
    paths: () => flat().map((v) => v.path)
  }
}
