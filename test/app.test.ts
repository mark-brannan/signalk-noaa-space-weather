// The standalone app (app/, scripts/build-app.mjs): public/index.html with no
// Signal K server under it, the plugin's own products fetching NOAA from the
// reader's tab, installable to a home screen.
//
// The guards here are the demo's, for the same reasons -- the page must stay
// unforked, the file list must stay derived rather than written -- plus the
// two the demo has no equivalent of: the service worker's precache list is
// filled from the site rather than by hand, and a store that outlives the tab
// degrades to one that does not, instead of failing.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import * as real from '../public/signalk.js'
import * as seam from '../src/browser/seam.js'
import { createLocalStore, readLastPosition } from '../app/store.js'
import {
  SHELL,
  SITE_FILES,
  fillWorker,
  resolveImports,
  sourceOf
} from '../scripts/build-app.mjs'

const ROOT = join(__dirname, '..')

describe('the assembled app site', () => {
  // The build's own resolver, not a copy of it -- see test/demo.test.ts for
  // what that buys and what it leaves blind.
  it('is closed under the imports of everything it copies', () => {
    const site = new Set(SITE_FILES)
    for (const name of SITE_FILES) {
      if (!name.endsWith('.js') && !name.endsWith('.html')) continue
      for (const target of resolveImports(name))
        expect(site.has(target), `${name} -> ${target}`).toBe(true)
    }
  })

  it('serves the shipping page, not a copy of it', () => {
    expect(sourceOf('index.html')).toBe(join(ROOT, 'public', 'index.html'))
  })

  // The substitution the whole thing turns on. Without it the page would
  // resolve './signalk.js' to public's, which talks to a server that is not
  // there.
  it('substitutes the app data layer for the server one', () => {
    expect(sourceOf('signalk.js')).toBe(join(ROOT, 'app', 'signalk.js'))
  })

  // index.ts owns the plugin lifecycle, the HTTP routes and the tile renderer,
  // and reaches the filesystem through all three. The app is the products and
  // the layer that drives them, and nothing else.
  it('copies the product modules without the plugin around them', () => {
    expect(SITE_FILES).toContain('plugin/browser/live.js')
    expect(SITE_FILES).toContain('plugin/products/registry.js')
    expect(SITE_FILES).not.toContain('plugin/index.js')
    expect(SITE_FILES).not.toContain('plugin/tiles.js')
  })
})

describe('app/signalk.js stands in for the whole of public/signalk.js', () => {
  // Read as source rather than imported: the module starts the plugin and asks
  // for the reader's location on import when `window` exists, and the point of
  // this test is the surface, not the behaviour.
  const source = readFileSync(join(ROOT, 'app', 'signalk.js'), 'utf8')

  /** The names a module actually exports, read off its source. */
  const exported = (text: string) => {
    const names = new Set<string>()
    // `export { a, b } from '...'` and `export { a, b }`
    for (const [, clause] of text.matchAll(/export\s*\{([^}]*)\}/g)) {
      for (const member of clause.split(',')) {
        const name = member
          .trim()
          .split(/\s+as\s+/)
          .pop()
          ?.trim()
        if (name) names.add(name)
      }
    }
    // `export const x`, `export function x`, `export async function x`,
    // `export class x`
    for (const [, name] of text.matchAll(
      /export\s+(?:async\s+)?(?:const|let|function|class)\s+([A-Za-z0-9_$]+)/g
    )) {
      names.add(name)
    }
    return names
  }

  it('exports every name the real module does', () => {
    const names = exported(source)
    for (const name of Object.keys(real)) {
      expect(names.has(name), `app/signalk.js is missing ${name}`).toBe(true)
    }
  })

  // The names it re-exports come from the seam, so the seam is what has to
  // carry them -- a re-export of something that is not there is a build-time
  // error in a browser and nothing at all here.
  it('re-exports them from the shared seam rather than redefining them', () => {
    for (const name of [
      'ENDPOINTS',
      'AuthRequiredError',
      'leafValue',
      'leafMeta',
      'leafTime',
      'retryAfterSeconds'
    ]) {
      expect(seam[name as keyof typeof seam], name).toBeDefined()
    }
  })

  it('answers the same ids, at the paths the real URLs address', () => {
    expect(Object.keys(seam.ENDPOINTS).sort()).toEqual(
      Object.keys(real.ENDPOINTS).sort()
    )
    for (const [id, path] of Object.entries(seam.ENDPOINTS)) {
      if (path === null) continue
      expect(real.ENDPOINTS[id as keyof typeof real.ENDPOINTS], id).toBe(
        `/signalk/v1/api/vessels/self/${path}`
      )
    }
  })
})

describe('the service worker', () => {
  // The template as it is written, filled by the build's own substitution --
  // not the assembled site, which `npm test` must not depend on: the registry
  // scores this repo with `npm ci`, `npm run build`, `npm test` and nothing
  // else, so a test reading app-dist/ would fail there and only there.
  const template = readFileSync(join(ROOT, 'app', 'sw.js'), 'utf8')

  it('has both blanks filled by the build', () => {
    const filled = fillWorker(template, 'deadbeef')
    expect(filled).not.toContain('__SHELL__')
    expect(filled).not.toContain('__VERSION__')
    expect(filled).toContain('deadbeef')
  })

  // A blank left behind installs a worker that precaches the literal string
  // and fails -- offline, on a phone, and quietly, because a failed install
  // just means no offline mode rather than a broken page.
  it('refuses a template it could not fill', () => {
    expect(() =>
      fillWorker(
        'const SHELL = __SHELL__\nconst V = __VERSION__\n__SHELL__',
        'v'
      )
    ).toThrow(/placeholder/)
  })

  // The list is the site's, so a module added to index.html cannot go missing
  // from the offline shell -- the same rule the file copy follows.
  it('precaches the whole site but not itself', () => {
    expect(SHELL).toContain('./index.html')
    expect(SHELL).toContain('./signalk.js')
    expect(SHELL).not.toContain('./sw.js')
    expect(SHELL.length).toBe(SITE_FILES.length - 1)
  })
})

describe('the app cache store', () => {
  // A phone in private browsing throws on the localStorage *getter*, not just
  // on the call, so the store has to survive the access itself failing.
  it('degrades to memory rather than throwing where storage is unusable', () => {
    vi.stubGlobal('localStorage', {
      get getItem(): never {
        throw new Error('denied')
      }
    })
    const store = createLocalStore()
    expect(store.persistent).toBe(false)
    store.writeCache('aurora.json', '{"grid":1}')
    expect(store.readCache('aurora.json')).toBe('{"grid":1}')
    expect(readLastPosition()).toBeNull()
    vi.unstubAllGlobals()
  })

  it('round-trips through a working store', () => {
    const backing = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => void backing.set(k, v),
      removeItem: (k: string) => void backing.delete(k)
    })
    const store = createLocalStore()
    expect(store.persistent).toBe(true)
    store.writeCache('drap.json', 'payload')
    expect(store.readCache('drap.json')).toBe('payload')
    vi.unstubAllGlobals()
  })

  // Out of quota is the aurora grid's normal failure on a phone, and the
  // products treat a miss as "fetch it again" -- so a write that will not fit
  // must be dropped, never raised into a refresh that already succeeded.
  it('drops a write that will not fit instead of raising', () => {
    // The probe write succeeds -- storage is usable -- and only the big one
    // fails, which is the real shape of running out of quota: an app that has
    // been storing grids for a week, not one that never could.
    const backing = new Map<string, string>()
    let refuseLarge = false
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (refuseLarge && v.length > 100) throw new Error('QuotaExceededError')
        backing.set(k, v)
      },
      removeItem: (k: string) => void backing.delete(k),
      get length() {
        return backing.size
      }
    })
    // `writeCache`'s recovery walks Object.keys(localStorage); a stub object's
    // own enumerable keys are its methods, so give it the real shape.
    const store = createLocalStore()
    expect(store.persistent).toBe(true)
    store.writeCache('small.json', 'fits')
    refuseLarge = true
    expect(() =>
      store.writeCache('aurora.json', 'x'.repeat(1000))
    ).not.toThrow()
    // The write was dropped, so the product re-fetches -- and the entry that
    // did fit is not claimed to be there when it is not.
    expect(store.readCache('aurora.json')).toBeNull()
    vi.unstubAllGlobals()
  })
})
