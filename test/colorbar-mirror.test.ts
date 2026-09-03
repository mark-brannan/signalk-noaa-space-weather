/**
 * Two pictures of one number: the webapp's map, drawn by the space-weather
 * package's public/ modules, and the tile this plugin overlays on a chart,
 * drawn by tiles.ts. The browser cannot import the TypeScript, so tiles.ts
 * carries copies of the core's two colour tables; this is what makes the
 * copies safe. Change a table in the core and this is the test that fails.
 */
import { describe, expect, it } from 'vitest'
import {
  NOAA_DRAP_STOPS,
  drapNoaaColor
} from 'space-weather/public/drap-colors.js'
import { NOAA_AURORA_RAMP } from 'space-weather/public/aurora.js'
import {
  NOAA_DRAP_STOPS as TILE_STOPS,
  NOAA_RAMP,
  drapLattice
} from '../src/tiles'

describe('the chart-plotter tile draws the same D-RAP colorbar', () => {
  const lattice = drapLattice({
    validTime: '2026-08-26T12:00:00Z',
    latitudes: [2, 0],
    longitudes: [-178, -174],
    frequenciesMHz: [
      [0, 0],
      [0, 0]
    ]
  })!

  it('copies NOAA_DRAP_STOPS exactly', () => {
    expect(NOAA_DRAP_STOPS).toEqual(TILE_STOPS.map((stop) => [...stop]))
  })

  it('renders every cutoff in the webapp colour, alpha included', () => {
    const { lut, lutScale } = lattice
    for (let mhz = 0; mhz <= 40; mhz += 0.25) {
      const index = Math.round(mhz * lutScale) * 4
      const [r, g, b, a] = drapNoaaColor(mhz)
      expect([
        lut[index],
        lut[index + 1],
        lut[index + 2],
        lut[index + 3]
      ]).toEqual([r, g, b, Math.round(255 * a)])
    }
  })
})

describe('the chart-plotter tile draws the same aurora ramp', () => {
  it('copies NOAA_RAMP exactly', () => {
    expect(NOAA_AURORA_RAMP).toEqual(NOAA_RAMP.map((stop) => [...stop]))
  })
})
