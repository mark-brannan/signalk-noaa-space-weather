// Assembles the GitHub Pages demo (issues #199, #239) into demo-dist/,
// gitignored.
//
//   npm install && node scripts/build-demo.mjs
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
// The live layer is the plugin's own compiled product modules, copied out of
// dist/ under plugin/ and loaded by the browser unbundled -- `tsc` already
// emits ES modules whose relative imports carry the `.js` extension a browser
// resolves, and this package has no runtime dependencies. So `npm run build`
// has to have run; see PLUGIN_PREFIX below.
import fssync from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MODULE_PATH = fileURLToPath(import.meta.url)
const REPO = path.resolve(path.dirname(MODULE_PATH), '..')
const PUBLIC = path.join(REPO, 'public')
const DEMO = path.join(REPO, 'demo')
const OUT = path.join(REPO, 'demo-dist')
const DIST = path.join(REPO, 'dist')

// Where the compiled plugin lands in the site. A prefix rather than a flat
// copy, because dist/ has its own subdirectories (products/, cache/, noaa/)
// and the emitted imports between them are relative -- so the closure walker
// below follows them into the site with no special case at all.
const PLUGIN_PREFIX = 'plugin/'

// The page is the root, and the demo's framing module is the only other one.
// Everything else is reached by following imports, which is the point: a
// module added to index.html cannot go missing from the demo, and the admin
// UI's config screen (remoteEntry.js, config-panel.js) stays out because
// nothing on the page imports it.
const ENTRY = 'index.html'
const ROOTS = [ENTRY, 'demo-chrome.js']

// Reached by no import, so they have to be named: the snapshot is fetched by
// URL, and the icon is the favicon demo-chrome.js links.
const ASSETS = ['snapshot.json', 'icon.svg']

// Files demo/ supplies, keyed by the name they land under. signalk.js is the
// substitution the whole demo turns on.
const DEMO_FILES = {
  'signalk.js': 'signalk.js',
  'snapshot.json': 'snapshot.json',
  'demo-chrome.js': 'chrome.js'
}

// `import ... from`, `export ... from` and `import(...)`, relative only. A
// bare specifier would be a bug on a page with no bundler, so it is not a
// case to resolve -- it is one that would already be broken in public/. The
// lookbehind is what keeps `transform` and friends from matching.
const RELATIVE_IMPORT = /(?<![\w$])(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g

/** Where the build reads the file that lands in the site under `name`. */
export const sourceOf = (name) =>
  name.startsWith(PLUGIN_PREFIX)
    ? path.join(DIST, name.slice(PLUGIN_PREFIX.length))
    : DEMO_FILES[name]
      ? path.join(DEMO, DEMO_FILES[name])
      : path.join(PUBLIC, name)

/**
 * The site-relative names one file imports. Exported, and taking `source`, so
 * test/demo.test.ts can check the closure with the build's own reader rather
 * than a second copy of the pattern -- a copy would only ever agree with this
 * one, which is not a check of anything.
 */
export function resolveImports(name, source = readSite(name)) {
  const dir = path.posix.dirname(name)
  const targets = []
  for (const [, specifier] of source.matchAll(RELATIVE_IMPORT)) {
    const target = path.posix.normalize(path.posix.join(dir, specifier))
    // A specifier that climbs out of the site would be copied to a path
    // outside demo-dist/ -- silently, and over whatever is there. The site is
    // one flat directory plus vendor/, so this has never had a reason to
    // happen; if it starts to, the fix is to move the file in, not to widen
    // this.
    if (target.startsWith('..')) {
      throw new Error(
        `${name} imports '${specifier}', which resolves outside the site ` +
          `(${target}) -- the demo cannot copy a file it would have to write ` +
          'above demo-dist/'
      )
    }
    targets.push(target)
  }
  return targets
}

function readSite(name) {
  const source = sourceOf(name)
  // Named rather than left as ENOENT: a missing plugin/ file means dist/ was
  // never built, which is one command away and nothing like a broken import.
  if (name.startsWith(PLUGIN_PREFIX) && !fssync.existsSync(source)) {
    throw new Error(
      `${name} is missing from dist/ -- run \`npm run build\` first; the ` +
        "demo's live data layer is the compiled plugin"
    )
  }
  return fssync.readFileSync(source, 'utf8')
}

/**
 * Every file the assembled site needs, site-relative, found by following
 * imports from the roots through whatever actually lands -- so the closure is
 * over the demo's own signalk.js, not public's.
 */
function importClosure(roots) {
  const site = []
  const seen = new Set()
  const queue = [...roots]
  while (queue.length) {
    const name = queue.shift()
    if (seen.has(name)) continue
    seen.add(name)
    site.push(name)
    queue.push(...resolveImports(name))
  }
  return site
}

export const SITE_FILES = [
  ...new Set([...importClosure(ROOTS), ...ASSETS])
].sort()

// The subset copied out of public/: every file the page reaches that neither
// demo/ nor dist/ supplies, the vendored coast-wright subtree included.
export const PUBLIC_MODULES = SITE_FILES.filter(
  (name) => !DEMO_FILES[name] && !name.startsWith(PLUGIN_PREFIX)
)

// The compiled plugin modules the live layer pulls in, which is the import
// closure from src/browser/live.ts and nothing else -- no tile renderer, no
// plugin lifecycle, none of the filesystem those reach.
export const PLUGIN_MODULES = SITE_FILES.filter((name) =>
  name.startsWith(PLUGIN_PREFIX)
)

// Loaded after the page's own script, so it inserts into a built page rather
// than racing it.
const CHROME_TAG = '\n<script type="module" src="./demo-chrome.js"></script>\n'

async function build() {
  // coastline.js and vendor/ are generated by sync-coastline.mjs on prepare;
  // missing means this ran before npm install, not that the build is optional.
  if (!fssync.existsSync(path.join(PUBLIC, 'coastline.js'))) {
    console.error('public/coastline.js missing -- run `npm install` first')
    process.exit(1)
  }
  if (!fssync.existsSync(path.join(DIST, 'index.js'))) {
    console.error('dist/ missing -- run `npm run build` first')
    process.exit(1)
  }

  await fs.rm(OUT, { recursive: true, force: true })
  await fs.mkdir(OUT, { recursive: true })

  for (const name of SITE_FILES) {
    const to = path.join(OUT, name)
    await fs.mkdir(path.dirname(to), { recursive: true })
    await fs.copyFile(sourceOf(name), to)
  }

  await fs.appendFile(path.join(OUT, ENTRY), CHROME_TAG)

  console.log(
    `assembled ${path.relative(REPO, OUT)}/ (${SITE_FILES.length} files, ` +
      `${PLUGIN_MODULES.length} of them the compiled plugin)`
  )
}

// Only when run, never on import: the tests read SITE_FILES out of this
// module, and two of them importing it in parallel workers would otherwise
// race each other's rm -rf of demo-dist/.
if (process.argv[1] && path.resolve(process.argv[1]) === MODULE_PATH) {
  await build()
}
