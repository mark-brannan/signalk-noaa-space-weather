// Assembles the GitHub Pages demo (issues #199, #239) into demo-dist/,
// gitignored.
//
//   npm install && npm run build && node scripts/build-demo.mjs
//   npx http-server demo-dist        # or any static server, to preview
//
// The demo is the shipping webapp page, not a copy of it: public/index.html
// itself, with exactly one substitution -- demo/signalk.js lands as
// signalk.js, so the page and every module it imports resolve their
// './signalk.js' to the demo's data layer and run unchanged against a saved
// capture, or (on ?live) against NOAA itself, instead of a Signal K server.
// The demo's own framing (what this page is, when it was captured, where to
// get the real thing) is appended as one script tag rather than edited in,
// which is what keeps index.html unforked.
//
// The assembling itself -- the closure walk, the dist/ copy, the
// outside-the-site guard -- is scripts/site.mjs, shared with the standalone
// app build. What is left here is only what makes this site the demo.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { REPO, ENTRY, defineSite } from './site.mjs'

const MODULE_PATH = fileURLToPath(import.meta.url)

// Loaded after the page's own script, so it inserts into a built page rather
// than racing it.
const CHROME_TAG = '\n<script type="module" src="./demo-chrome.js"></script>\n'

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

// Only when run, never on import: the tests read SITE_FILES out of this
// module, and two of them importing it in parallel workers would otherwise
// race each other's rm -rf of demo-dist/.
if (process.argv[1] && path.resolve(process.argv[1]) === MODULE_PATH) {
  await site.build()
}
