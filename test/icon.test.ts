import { lstatSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * public/icon.svg is generated from the root icon.svg by
 * scripts/sync-icon.mjs, wired into `prebuild` and `prepare`. It is not in
 * git, so these assertions fail on a fresh clone if that wiring ever comes
 * undone -- which is the failure they exist to catch. The icon itself being
 * wrong is the lesser risk; the icon not shipping at all is what has actually
 * happened, twice.
 */
describe('public/icon.svg', () => {
  const target = fileURLToPath(new URL('../public/icon.svg', import.meta.url))

  /**
   * npm's packlist skips a symlinked file instead of following it, so a
   * symlinked public/icon.svg is absent from the published tarball entirely
   * and the admin Webapps page renders a broken image. Confirmed against the
   * real tarball for 0.15.0, which shipped public/index.html and public/hero.js
   * but no icon.
   */
  it('is a real file, not a symlink', () => {
    expect(lstatSync(target).isSymbolicLink()).toBe(false)
  })

  it('is identical to the root icon.svg', () => {
    const root = readFileSync(
      fileURLToPath(new URL('../icon.svg', import.meta.url)),
      'utf8'
    )
    expect(readFileSync(target, 'utf8')).toBe(root)
  })
})
