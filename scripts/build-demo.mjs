// Assembles the GitHub Pages demo (issues #199, #239) into demo-dist/,
// gitignored.
//
//   npm install && npm run build && node scripts/build-demo.mjs
//   npx http-server demo-dist        # or any static server, to preview
//
// The demo is the shipping webapp page, not a copy of it: public/index.html
// itself, with exactly one substitution -- demo/signalk.js lands as
// signalk.js, so the page and every module it imports resolve their
// './signalk.js' to the demo's data layer and run unchanged against NOAA
// itself, or (on ?snapshot) a saved capture, instead of a Signal K server.
// The demo's own framing (what this page is, when it was captured, where to
// get the real thing) is appended as one script tag rather than edited in,
// which is what keeps index.html unforked.
//
// The assembling itself -- the closure walk, the dist/ copy, the
// outside-the-site guard -- is scripts/site.mjs, shared with the standalone
// app build. What is left here is only what makes this site the demo.
import fssync from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEMO_POSITION } from 'space-weather/browser/live'
import { REPO, ENTRY, defineSite } from './site.mjs'

const MODULE_PATH = fileURLToPath(import.meta.url)

// Loaded after the page's own script, so it inserts into a built page rather
// than racing it.
const CHROME_TAG = '\n<script type="module" src="./demo-chrome.js"></script>\n'

// demo/chrome.js's build-time blanks: the footnote's stand-in position, one
// per data layer. Live runs at the core package's DEMO_POSITION; the snapshot
// was captured wherever DEMO_POSITION stood at capture time, which a core bump
// can move without a recapture, so its label comes from the snapshot itself.
// Read here, at build time in Node -- never as a runtime import in chrome.js,
// which would pull the whole live-layer product closure into a page a
// ?snapshot visitor loads to avoid exactly that (see demo/signalk.js's
// `live()`).
const PLACEHOLDERS = {
  __DEMO_POSITION__: 'live',
  __SNAPSHOT_POSITION__: 'snapshot'
}

export const formatPosition = ({ latitude, longitude }) =>
  `${Math.abs(latitude)}°${latitude >= 0 ? 'N' : 'S'} ` +
  `${Math.abs(longitude)}°${longitude >= 0 ? 'E' : 'W'}`

/**
 * Exported and taking its template, so the test can check the substitution
 * without an assembled site on disk -- the same shape as build-app.mjs's
 * fillWorker. Throws rather than ship the literal placeholder: a chrome.js
 * that no longer carries it (hand-typed a place name back in, say) is exactly
 * the regression this whole mechanism exists to catch.
 */
export function fillChrome(
  template,
  positions = { live: DEMO_POSITION, snapshot: snapshotPosition() }
) {
  let filled = template
  for (const [blank, layer] of Object.entries(PLACEHOLDERS)) {
    if (!filled.includes(blank)) {
      throw new Error(
        `demo/chrome.js: ${blank} not found -- the stand-in ` +
          'position note may have been hand-typed again'
      )
    }
    filled = filled.replaceAll(blank, formatPosition(positions[layer]))
  }
  return filled
}

/** The position demo/snapshot.json was captured at, as its data records it. */
export function snapshotPosition() {
  const saved = JSON.parse(
    fssync.readFileSync(path.join(REPO, 'demo', 'snapshot.json'), 'utf8')
  )
  return saved.values['navigation.position'].value
}

const site = defineSite({
  out: 'demo-dist',
  dir: path.join(REPO, 'demo'),
  // Files demo/ supplies, keyed by the name they land under. signalk.js is the
  // substitution the whole demo turns on.
  files: {
    'signalk.js': 'signalk.js',
    'snapshot.json': 'snapshot.json',
    'demo-chrome.js': 'chrome.js'
  },
  // The page is the root, and the demo's framing module is the only other one.
  // Everything else is reached by following imports, which is the point: a
  // module added to index.html cannot go missing from the demo, and the admin
  // UI's config screen (remoteEntry.js, config-panel.js) stays out because
  // nothing on the page imports it.
  roots: [ENTRY, 'demo-chrome.js'],
  // Reached by no import, so they have to be named: the snapshot is fetched by
  // URL, and the icon is the favicon demo-chrome.js links.
  assets: ['snapshot.json', 'icon.svg'],
  appendTag: CHROME_TAG
})

export const {
  SITE_FILES,
  PUBLIC_MODULES,
  PLUGIN_MODULES,
  resolveImports,
  sourceOf
} = site

async function build() {
  await site.build()
  const chrome = path.join(site.OUT, 'demo-chrome.js')
  await fs.writeFile(chrome, fillChrome(await fs.readFile(chrome, 'utf8')))
}

// Only when run, never on import: the tests read SITE_FILES out of this
// module, and two of them importing it in parallel workers would otherwise
// race each other's rm -rf of demo-dist/.
if (process.argv[1] && path.resolve(process.argv[1]) === MODULE_PATH) {
  await build()
}
