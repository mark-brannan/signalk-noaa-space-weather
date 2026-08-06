import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('icon.svg', () => {
  /**
   * Duplicated, not symlinked: `npm pack` silently drops a symlinked file
   * instead of following it (confirmed by inspecting the actual packed
   * tarball, not just `npm pack --dry-run`, which agreed with the symlink
   * but was equally wrong) -- so a real copy has to live in public/ for the
   * Webapps admin page's icon route to serve anything at all. That already
   * drifted out of sync once (the root icon was redesigned, the public/
   * copy wasn't), which is what this guards against.
   */
  it('stays identical to the root icon.svg', () => {
    const root = readFileSync(
      fileURLToPath(new URL('../icon.svg', import.meta.url)),
      'utf8'
    )
    const webapp = readFileSync(
      fileURLToPath(new URL('../public/icon.svg', import.meta.url)),
      'utf8'
    )
    expect(webapp).toBe(root)
  })
})
