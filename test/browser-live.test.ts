/**
 * The demo's live data layer (#239 leg 2): the core's product modules, running
 * in a browser tab against NOAA with no server under them.
 *
 * The layer itself -- the browser publisher, what a poll costs -- is tested in
 * the space-weather package. What is pinned here is the seam this repo owns:
 * the committed snapshot states the same viewpoint and settings the live
 * layer runs, and the assembled site carries the compiled core out of the
 * installed package. The layer actually reaching NOAA cannot be pinned here at
 * all: the plugin registry runs `npm test` under `firejail --net=none` with a
 * 60 second cap. That half is checked in a browser by hand; see
 * docs/development.md.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { settingsFrom } from 'space-weather/config'
import { DEMO_POSITION, DEMO_PROPS } from 'space-weather/browser/live'
import { DIST } from '../scripts/site.mjs'
import { PLUGIN_MODULES, SITE_FILES, sourceOf } from '../scripts/build-demo.mjs'

const ROOT = join(__dirname, '..')
const snapshot = JSON.parse(
  readFileSync(join(ROOT, 'demo', 'snapshot.json'), 'utf8')
)

describe('the two demos agree about what they are showing', () => {
  // The saved capture imports both of these from the live layer. If they ever
  // stop matching what is in the committed snapshot, the page's two modes are
  // claiming different viewpoints -- and every number on it is worked out from
  // that position.
  it('captures at the position the live layer states', () => {
    expect(snapshot.values['navigation.position'].value).toEqual(DEMO_POSITION)
  })

  it('captures with the settings the live layer runs', () => {
    expect(snapshot.routes.status.settings).toEqual(settingsFrom(DEMO_PROPS))
  })
})

describe('the assembled site carries the compiled core', () => {
  it('copies the live layer and its closure out of the package', () => {
    expect(PLUGIN_MODULES).toContain('plugin/browser/live.js')
    expect(PLUGIN_MODULES).toContain('plugin/products/registry.js')
    expect(PLUGIN_MODULES.length).toBeGreaterThan(10)
  })

  // The whole point of the registry split: the publisher reaches the
  // filesystem, and this plugin's own index.ts and tiles.ts -- the lifecycle,
  // the HTTP routes, the tile renderer -- are not in the package at all.
  it('leaves the server-only modules behind', () => {
    expect(SITE_FILES).not.toContain('plugin/index.js')
    expect(SITE_FILES).not.toContain('plugin/tiles.js')
    expect(SITE_FILES).not.toContain('plugin/publisher.js')
  })

  it('reads a core module out of the installed package, not public/', () => {
    expect(sourceOf('plugin/browser/live.js')).toBe(
      join(DIST, 'browser', 'live.js')
    )
    expect(DIST).toContain(join('node_modules', 'space-weather'))
  })
})
