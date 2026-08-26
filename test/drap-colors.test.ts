import { describe, expect, it } from 'vitest'
import { drapColor, drapRampRgb } from '../public/drap-colors.js'

describe('drapRampRgb', () => {
  it('matches NOAA legend stops exactly at the sampled points', () => {
    expect(drapRampRgb(0)).toEqual([0, 0, 0])
    expect(drapRampRgb(10)).toEqual([0, 55, 255])
    expect(drapRampRgb(20)).toEqual([0, 255, 67])
    expect(drapRampRgb(35)).toEqual([255, 0, 0])
  })

  it('saturates at pure red above 35 MHz, matching NOAA legend end box', () => {
    expect(drapRampRgb(40)).toEqual([255, 0, 0])
  })

  it('interpolates between adjacent stops', () => {
    const [r, g, b] = drapRampRgb(11)
    expect(r).toBe(0)
    expect(g).toBeGreaterThan(55)
    expect(g).toBeLessThan(131)
    expect(b).toBe(255)
  })
})

describe('drapColor', () => {
  it('draws nothing at or below zero -- NOAA black would read as missing data', () => {
    expect(drapColor(0)).toBeNull()
    expect(drapColor(-1)).toBeNull()
  })

  it('never returns opaque, so the coastline stays visible underneath', () => {
    const rgba = drapColor(35)
    const alpha = Number(rgba.match(/[\d.]+\)$/)[0].slice(0, -1))
    expect(alpha).toBeLessThan(1)
  })

  it('is more opaque at a higher frequency', () => {
    const alphaOf = (mhz) =>
      Number(
        drapColor(mhz)
          .match(/[\d.]+\)$/)[0]
          .slice(0, -1)
      )
    expect(alphaOf(30)).toBeGreaterThan(alphaOf(5))
  })
})
