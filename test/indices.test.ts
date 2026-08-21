import { describe, expect, it } from 'vitest'
import { hfIndices } from '../public/indices.js'

const values = (input: any) =>
  Object.fromEntries(hfIndices(input).map((t: any) => [t.key, t.value]))

describe('hfIndices', () => {
  it('reads the four terms in the order an operator speaks them', () => {
    expect(hfIndices({}).map((t: any) => t.key)).toEqual([
      'SFI',
      'A',
      'K',
      'SSN'
    ])
  })

  it('carries each reading through unrounded', () => {
    expect(values({ f107: 126, aIndex: 20, kp: 2.33, sunspot: 78 })).toEqual({
      SFI: 126,
      A: 20,
      K: 2.33,
      SSN: 78
    })
  })

  it('shows Kp at the precision the rest of the page shows it', () => {
    // Rounding to WWV's spoken integer would turn a Kp of 4.67 into "K 5" and
    // name a G1 storm the Kp tile below does not.
    const kp = hfIndices({ kp: 4.67 }).find((t: any) => t.key === 'K')
    expect(kp.digits).toBe(1)
  })

  it('leaves a missing term as a gap rather than dropping it', () => {
    // The phrase is read positionally: drop A and K slides into its place.
    expect(values({ f107: 126, sunspot: 78 })).toEqual({
      SFI: 126,
      A: null,
      K: null,
      SSN: 78
    })
    expect(values({})).toEqual({ SFI: null, A: null, K: null, SSN: null })
  })

  it('treats a non-numeric reading as missing', () => {
    expect(
      values({ f107: null, aIndex: undefined, kp: NaN, sunspot: '78' })
    ).toEqual({ SFI: null, A: null, K: null, SSN: null })
  })
})
