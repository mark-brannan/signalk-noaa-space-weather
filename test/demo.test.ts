// The GitHub Pages demo (issue #199): demo/signalk.js swapped in for
// public/signalk.js over a committed NOAA snapshot. What these pin is the
// swap contract -- same ids, resolvable imports, a snapshot the page can
// actually draw -- not what the page says.
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import {
  ENDPOINTS as DEMO_ENDPOINTS,
  leafValue,
  nodeAt,
  treeFromValues
} from '../demo/signalk.js'
import { ENDPOINTS as REAL_ENDPOINTS } from '../public/signalk.js'
import { PUBLIC_MODULES } from '../scripts/build-demo.mjs'

const ROOT = join(__dirname, '..')
const snapshot = JSON.parse(
  readFileSync(join(ROOT, 'demo', 'snapshot.json'), 'utf8')
)

describe('demo/signalk.js', () => {
  it('answers the same ids as the real signalk.js, at the same paths', () => {
    expect(Object.keys(DEMO_ENDPOINTS).sort()).toEqual(
      Object.keys(REAL_ENDPOINTS).sort()
    )
    for (const [id, path] of Object.entries(DEMO_ENDPOINTS)) {
      if (path === null) continue
      expect(REAL_ENDPOINTS[id as keyof typeof REAL_ENDPOINTS], id).toBe(
        `/signalk/v1/api/vessels/self/${path}`
      )
    }
  })

  it('resolves the snapshot values the HF card reads, with no NaN', () => {
    const tree = treeFromValues(snapshot.values)
    for (const path of [
      'environment/noaa/swpc/f107',
      'environment/noaa/swpc/xray_flux',
      'environment/noaa/swpc/proton_flux'
    ]) {
      const value = leafValue(nodeAt(tree, path))
      expect(value, path).toBeTypeOf('number')
      expect(Number.isFinite(value), path).toBe(true)
    }
    // A leaf that also carries a child: the merge in treeFromValues must not
    // let the parent's {value} clobber the trend or vice versa.
    const flux = nodeAt(tree, 'environment/noaa/swpc/xray_flux')
    expect(Number.isFinite(leafValue(flux.trend))).toBe(true)
  })

  it('reads null for a path the snapshot does not carry, like a 404', () => {
    const tree = treeFromValues(snapshot.values)
    expect(nodeAt(tree, 'navigation/position')).toBeNull()
  })
})

describe('demo/snapshot.json', () => {
  it('carries a capture date the page can show', () => {
    expect(Number.isNaN(Date.parse(snapshot.capturedAt))).toBe(false)
  })

  it('carries both grids in the shape the map samplers take', () => {
    expect(Array.isArray(snapshot.grids.aurora.grid.coordinates)).toBe(true)
    const drap = snapshot.grids.drap.grid
    expect(Array.isArray(drap.frequenciesMHz)).toBe(true)
    expect(drap.latitudes.length).toBe(drap.frequenciesMHz.length)
  })
})

describe('scripts/build-demo.mjs', () => {
  // The whole demo is static copies, so a new import in any copied module is
  // the one change that can break it silently -- caught here instead of on
  // the published page.
  it('copies every module the copied modules import', () => {
    const site = new Set([...PUBLIC_MODULES, 'signalk.js'])
    const sources = [
      ...PUBLIC_MODULES.filter((n: string) => n.endsWith('.js')).map(
        (n: string) => join(ROOT, 'public', n)
      ),
      join(ROOT, 'demo', 'signalk.js'),
      join(ROOT, 'demo', 'index.html')
    ]
    for (const file of sources) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/from\s+'\.\/([^']+)'/g)) {
        const target = match[1]
        if (target.startsWith('vendor/')) continue
        expect(site.has(target), `${file} imports ${target}`).toBe(true)
      }
    }
  })

  it('lists only files that exist in public/', () => {
    const names = new Set(readdirSync(join(ROOT, 'public')))
    for (const name of PUBLIC_MODULES) expect(names.has(name), name).toBe(true)
  })
})
