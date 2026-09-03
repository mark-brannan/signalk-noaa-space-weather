/**
 * Copies the space-weather package's public/ -- the webapp page, its modules
 * and the vendored coastline -- into this plugin's public/, so the Signal K
 * server has real files to serve.
 *
 * The page lives in the core package now, and a Signal K webapp is served out
 * of the plugin's *own* public/ (the `signalk-webapp` keyword points the
 * server there, and `files` in package.json ships it), so the copy has to
 * exist on disk. A symlink would not do: npm's packlist skips symlinked files,
 * so a symlinked public/ is simply absent from the published tarball. Same
 * reasoning as sync-icon.mjs, which runs after this so the icon lands in the
 * fresh copy.
 *
 * The copy is clean rather than layered: a file the core dropped must not
 * linger here and ship. Runs on prepare and prebuild, so a clone is complete
 * after `npm install`, and gitignored, like dist/.
 */
import { cpSync, existsSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const source = join(
  dirname(require.resolve('space-weather/package.json')),
  'public'
)
const target = fileURLToPath(new URL('../public', import.meta.url))

// coastline.js is generated inside the core on *its* prepare; a package that
// shipped without it would leave the map with no geography, silently.
if (!existsSync(join(source, 'coastline.js'))) {
  console.error(
    `${source} has no coastline.js -- the space-weather install is incomplete`
  )
  process.exit(1)
}

rmSync(target, { recursive: true, force: true })
cpSync(source, target, { recursive: true })
