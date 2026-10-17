/**
 * Two pictures of one number: the webapp's map, drawn by the space-weather
 * package's public/ modules, and the tile this plugin overlays on a chart,
 * drawn by tiles.ts from the same functions. What tiles.ts adds is the lookup
 * table -- its scale, and alpha as a byte -- so that is what this checks.
 */
import { describe, expect, it } from 'vitest'
import { drapNoaaColor } from 'space-weather/public/drap-colors.js'
import { auroraRampColor } from 'space-weather/public/aurora.js'
import { auroraLattice, drapLattice } from '../src/tiles'

describe('the chart-plotter tile draws the same D-RAP colorbar', () => {
  it('renders every cutoff in the webapp colour, alpha included', () => {
    const { lut, lutScale } = drapLattice({
      validTime: '2026-08-26T12:00:00Z',
      latitudes: [2, 0],
      longitudes: [-178, -174],
      frequenciesMHz: [
        [0, 0],
        [0, 0]
      ]
    })!
    for (let mhz = 0; mhz <= 40; mhz += 0.25) {
      const index = Math.round(mhz * lutScale) * 4
      const [r, g, b, a] = drapNoaaColor(mhz)
      expect([...lut.subarray(index, index + 4)]).toEqual([
        r,
        g,
        b,
        Math.round(255 * a)
      ])
    }
  })
})

describe('the chart-plotter tile draws the same aurora ramp', () => {
  it('renders every probability in the webapp colour', () => {
    const { lut, lutScale } = auroraLattice(new Uint8Array(0))
    for (let percent = 0; percent <= 100; percent += 0.5) {
      const index = Math.round(percent * lutScale) * 4
      expect([...lut.subarray(index, index + 3)]).toEqual(
        auroraRampColor(percent)
      )
    }
  })
})
