// Assembles the standalone app into app-dist/, gitignored.
//
//   npm install && npm run build && npm run app:build
//   npx http-server app-dist        # or any static server, to preview
//
// The shipping page with no Signal K server under it, via the same one
// substitution the demo uses: app/signalk.js lands as signalk.js. What makes
// it an app rather than the demo's ?live mode lives in app/ -- the device's
// position, a store that outlives the tab, a manifest and a service worker.
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { REPO, ENTRY, defineSite } from './site.mjs'

const MODULE_PATH = fileURLToPath(import.meta.url)

// Loaded after the page's own script, so it inserts into a built page rather
// than racing it.
const CHROME_TAG = '\n<script type="module" src="./app-chrome.js"></script>\n'

// Reached by no import, so they have to be named: the worker is registered by
// URL, the manifest is linked by the chrome at runtime, and the icon is the
// favicon.
const ASSETS = ['icon.svg', 'manifest.webmanifest', 'sw.js']

const site = defineSite({
  out: 'app-dist',
  dir: path.join(REPO, 'app'),
  files: {
    'signalk.js': 'signalk.js',
    'store.js': 'store.js',
    'app-chrome.js': 'chrome.js',
    'sw.js': 'sw.js',
    'manifest.webmanifest': 'manifest.webmanifest'
  },
  roots: [ENTRY, 'app-chrome.js'],
  assets: ASSETS,
  appendTag: CHROME_TAG
})

export const {
  SITE_FILES,
  PUBLIC_MODULES,
  PLUGIN_MODULES,
  resolveImports,
  sourceOf
} = site

/**
 * What the worker precaches: every file in the site except the worker itself.
 *
 * A worker that precaches itself pins the old one in the cache and makes the
 * next update fight it; the browser fetches sw.js on its own terms anyway.
 */
export const SHELL = SITE_FILES.filter((name) => name !== 'sw.js').map(
  (name) => `./${name}`
)

/**
 * The cache key: a digest of everything the shell holds, not the package
 * version.
 *
 * The version would be wrong in both directions -- unchanged across a rebuilt
 * page (readers keep the old shell) and changed by a release that touched only
 * the plugin's server half (readers re-download an identical one). A content
 * digest is right by construction.
 */
async function shellVersion(out) {
  const digest = createHash('sha256')
  for (const name of SITE_FILES.filter((n) => n !== 'sw.js')) {
    digest.update(name)
    digest.update(await fs.readFile(path.join(out, name)))
  }
  return digest.digest('hex').slice(0, 12)
}

/**
 * The worker's two blanks, filled from the site's own file list -- never
 * hand-written, for the same reason the file copy is not.
 *
 * Exported and taking its template, so the test can check the substitution
 * without an assembled site on disk: `npm test` runs after `npm run build`
 * and nothing more, both here and in the plugin registry's offline scoring.
 */
export function fillWorker(template, version) {
  const filled = template
    .replace('__SHELL__', JSON.stringify(SHELL, null, 2))
    .replace('__VERSION__', version)
  // A blank left behind is a worker that precaches the string "__SHELL__" and
  // fails its install, offline, on someone's phone -- silently, because a
  // failed install just means no offline mode. Caught here instead.
  if (filled.includes('__SHELL__') || filled.includes('__VERSION__')) {
    throw new Error('app/sw.js: a build placeholder was left unfilled')
  }
  return filled
}

async function build() {
  await site.build()

  const worker = path.join(site.OUT, 'sw.js')
  const version = await shellVersion(site.OUT)
  const source = fillWorker(await fs.readFile(worker, 'utf8'), version)
  await fs.writeFile(worker, source)

  console.log(
    `  service worker precaches ${SHELL.length} files (shell ${version})`
  )
}

// Only when run, never on import: the tests read SITE_FILES out of this
// module, and two of them importing it in parallel workers would otherwise
// race each other's rm -rf of app-dist/.
if (process.argv[1] && path.resolve(process.argv[1]) === MODULE_PATH) {
  await build()
}
