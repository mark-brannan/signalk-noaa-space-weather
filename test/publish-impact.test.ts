import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * scripts/publish-impact.sh is read by the pre-commit hook and both version
 * workflows, and nothing else in this suite executes it. #123 is why the
 * comparison is pinned here: a branch at 0.26.0 with v0.28.0 already tagged
 * *differs* from the tag, so the hook read it as a deliberate bump and stood
 * down, and the fix merged at a version that was already published.
 */
const script = fileURLToPath(
  new URL('../scripts/publish-impact.sh', import.meta.url)
)

const sh = (body: string, stdin = '') =>
  execFileSync('sh', ['-c', `. "${script}"; ${body}`], {
    input: stdin,
    encoding: 'utf8'
  }).trim()

const ships = (paths: string[]) =>
  sh('publish_impacting && echo yes || echo no', paths.join('\n'))
const isAhead = (a: string, b: string) =>
  sh(`version_is_ahead "${a}" "${b}" && echo yes || echo no`)
const nextPatch = (a: string, b: string) =>
  sh(`next_patch_version "${a}" "${b}"`)

describe('publish_impacting', () => {
  it('is true for anything that reaches the tarball', () => {
    expect(ships(['public/index.html'])).toBe('yes')
    expect(ships(['src/parse.ts'])).toBe('yes')
  })

  it('is false only when nothing in the change ships', () => {
    expect(
      ships(['test/parse.test.ts', 'docs/screenshots/webapp.png', 'kanban.md'])
    ).toBe('no')
    expect(ships(['docs/screenshots/webapp.png', 'src/index.ts'])).toBe('yes')
  })
})

describe('version_is_ahead', () => {
  it('is false for a stale branch below the latest tag', () => {
    expect(isAhead('0.26.0', '0.28.0')).toBe('no')
  })

  it('is false at the tagged version itself', () => {
    expect(isAhead('0.28.1', '0.28.1')).toBe('no')
  })

  it('is true past the latest release, compared numerically', () => {
    expect(isAhead('0.28.2', '0.28.1')).toBe('yes')
    expect(isAhead('0.10.0', '0.9.9')).toBe('yes')
    expect(isAhead('0.9.9', '0.10.0')).toBe('no')
  })
})

describe('next_patch_version', () => {
  it('always lands past the latest tag, however stale the branch', () => {
    for (const [pkg, tag] of [
      ['0.26.0', '0.28.0'],
      ['0.28.1', '0.28.1'],
      ['0.9.9', '0.10.0']
    ]) {
      expect(isAhead(nextPatch(pkg, tag), tag)).toBe('yes')
    }
  })

  it('patches the working version when it is the higher one', () => {
    expect(nextPatch('0.30.0', '0.28.1')).toBe('0.30.1')
  })
})
