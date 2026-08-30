// Assembling a static site out of public/, dist/ and one directory of
// substitutions. Two sites are built this way and neither is a copy of the
// page: the GitHub Pages demo (scripts/build-demo.mjs) and the standalone app
// (scripts/build-app.mjs).
//
// The trick both turn on is one substitution. public/index.html imports
// './signalk.js' and so does every module it reaches; drop a different
// signalk.js into the site and the whole page resolves to it, unchanged. What
// sits behind that seam is the only thing that differs -- a Signal K server, a
// saved capture, or the plugin's own product modules fetching NOAA from the
// tab. The page is never forked and the file list is never hand-written: the
// site is the page's transitive import closure, so a module added to
// index.html cannot go missing from either site.
//
// The live data layer is the compiled product modules, copied out of dist/
// under plugin/ and loaded unbundled -- `tsc` already emits ES modules whose
// relative imports carry the `.js` extension a browser resolves, and this
// package has no runtime dependencies. So `npm run build` has to have run.
import fssync from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const REPO = path.resolve(HERE, '..')
export const PUBLIC = path.join(REPO, 'public')
export const DIST = path.join(REPO, 'dist')

// Where the compiled plugin lands in a site. A prefix rather than a flat copy,
// because dist/ has its own subdirectories (products/, cache/, noaa/) and the
// emitted imports between them are relative -- so the closure walker follows
// them into the site with no special case at all.
export const PLUGIN_PREFIX = 'plugin/'

export const ENTRY = 'index.html'

// `import ... from`, `export ... from` and `import(...)`, relative only. A
// bare specifier would be a bug on a page with no bundler, so it is not a case
// to resolve -- it is one that would already be broken in public/. The
// lookbehind is what keeps `transform` and friends from matching.
const RELATIVE_IMPORT = /(?<![\w$])(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g

/**
 * One static site: where it is written, which directory supplies its
 * substitutions, and what it is rooted at.
 *
 * `files` maps the name a file lands under in the site to its name inside
 * `dir` -- signalk.js is the substitution every site turns on. `assets` names
 * what no import reaches, which is the one thing the closure cannot find for
 * itself. `appendTag` is appended to index.html after the copy, so a site's
 * own framing arrives as one script tag rather than an edit to the page.
 */
export function defineSite({
  out,
  dir,
  files = {},
  roots,
  assets = [],
  appendTag = ''
}) {
  const OUT = path.join(REPO, out)

  /** Where the build reads the file that lands in the site under `name`. */
  const sourceOf = (name) =>
    name.startsWith(PLUGIN_PREFIX)
      ? path.join(DIST, name.slice(PLUGIN_PREFIX.length))
      : files[name]
        ? path.join(dir, files[name])
        : path.join(PUBLIC, name)

  function readSite(name) {
    const source = sourceOf(name)
    // Named rather than left as ENOENT: a missing plugin/ file means dist/ was
    // never built, which is one command away and nothing like a broken import.
    if (name.startsWith(PLUGIN_PREFIX) && !fssync.existsSync(source)) {
      throw new Error(
        `${name} is missing from dist/ -- run \`npm run build\` first; the ` +
          "site's live data layer is the compiled plugin"
      )
    }
    return fssync.readFileSync(source, 'utf8')
  }

  /**
   * The site-relative names one file imports. Exported, and taking `source`,
   * so the tests can check the closure with the build's own reader rather than
   * a second copy of the pattern -- a copy would only ever agree with this
   * one, which is not a check of anything.
   */
  function resolveImports(name, source = readSite(name)) {
    const dirname = path.posix.dirname(name)
    const targets = []
    for (const [, specifier] of source.matchAll(RELATIVE_IMPORT)) {
      const target = path.posix.normalize(path.posix.join(dirname, specifier))
      // A specifier that climbs out of the site would be copied to a path
      // outside the output directory -- silently, and over whatever is there.
      // A site is one flat directory plus vendor/, so this has never had a
      // reason to happen; if it starts to, the fix is to move the file in, not
      // to widen this.
      if (target.startsWith('..')) {
        throw new Error(
          `${name} imports '${specifier}', which resolves outside the site ` +
            `(${target}) -- the build cannot copy a file it would have to ` +
            `write above ${out}/`
        )
      }
      targets.push(target)
    }
    return targets
  }

  /**
   * Every file the assembled site needs, site-relative, found by following
   * imports from the roots through whatever actually lands -- so the closure
   * is over the site's own signalk.js, not public's.
   */
  function importClosure(entries) {
    const site = []
    const seen = new Set()
    const queue = [...entries]
    while (queue.length) {
      const name = queue.shift()
      if (seen.has(name)) continue
      seen.add(name)
      site.push(name)
      queue.push(...resolveImports(name))
    }
    return site
  }

  const SITE_FILES = [...new Set([...importClosure(roots), ...assets])].sort()

  // The subset copied out of public/: every file the page reaches that neither
  // the site's own directory nor dist/ supplies, the vendored coast-wright
  // subtree included.
  const PUBLIC_MODULES = SITE_FILES.filter(
    (name) => !files[name] && !name.startsWith(PLUGIN_PREFIX)
  )

  // The compiled plugin modules the live layer pulls in, which is the import
  // closure from src/browser/live.ts and nothing else -- no tile renderer, no
  // plugin lifecycle, none of the filesystem those reach.
  const PLUGIN_MODULES = SITE_FILES.filter((name) =>
    name.startsWith(PLUGIN_PREFIX)
  )

  async function build() {
    // coastline.js and vendor/ are generated by sync-coastline.mjs on prepare;
    // missing means this ran before npm install, not that the build is
    // optional.
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

    if (appendTag) await fs.appendFile(path.join(OUT, ENTRY), appendTag)

    console.log(
      `assembled ${path.relative(REPO, OUT)}/ (${SITE_FILES.length} files, ` +
        `${PLUGIN_MODULES.length} of them the compiled plugin)`
    )
    return SITE_FILES
  }

  return {
    OUT,
    SITE_FILES,
    PUBLIC_MODULES,
    PLUGIN_MODULES,
    resolveImports,
    readSite,
    sourceOf,
    build
  }
}
