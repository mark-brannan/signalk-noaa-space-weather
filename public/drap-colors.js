// The webapp's D-RAP colour ramp -- resolves
// https://github.com/mark-brannan/signalk-noaa-space-weather/issues/170 as
// "match NOAA on both surfaces" (what was asked), not aurora's
// chart-overlay-exact/webapp-adapted split. Aurora's split was about that
// map's own transparency and dark-page needs, not a rule that every webapp
// map gets its own palette, and D-RAP's hue sweep (violet through red) reads
// fine on a dark background as-is -- there's no adaptation to justify.
//
// Stops sampled directly from NOAA's own D-RAP legend PNG (2026-08-26,
// recorded on #170), 0-35 MHz. This is the LUT `src/tiles.ts` should reuse
// when the chart-plotter D-RAP tile lands, so the two surfaces stay in
// sync the way NOAA_RAMP already keeps aurora's chart tile and webapp map
// in sync with each other.
const NOAA_DRAP_RAMP = [
  [0, 0, 0, 0],
  [2, 61, 0, 63],
  [4, 88, 0, 132],
  [6, 71, 0, 195],
  [8, 21, 0, 255],
  [10, 0, 55, 255],
  [12, 0, 131, 255],
  [14, 0, 216, 255],
  [16, 0, 255, 220],
  [18, 0, 255, 144],
  [20, 0, 255, 67],
  [22, 4, 255, 0],
  [24, 76, 255, 0],
  [26, 157, 255, 0],
  [28, 229, 255, 0],
  [30, 255, 195, 0],
  [32, 255, 123, 0],
  [34, 255, 42, 0],
  [35, 255, 0, 0]
]

/**
 * RGB at a frequency, MHz, saturating at the ramp's own ends (0 below zero,
 * pure red at and above 35 -- NOAA's own legend holds its end box there
 * rather than extending the ramp).
 */
export function drapRampRgb(mhz) {
  if (!(mhz > 0)) return NOAA_DRAP_RAMP[0].slice(1)
  if (mhz >= 35) return NOAA_DRAP_RAMP[NOAA_DRAP_RAMP.length - 1].slice(1)
  let i = 0
  while (i < NOAA_DRAP_RAMP.length - 1 && NOAA_DRAP_RAMP[i + 1][0] <= mhz) i++
  const [m0, r0, g0, b0] = NOAA_DRAP_RAMP[i]
  const [m1, r1, g1, b1] = NOAA_DRAP_RAMP[i + 1]
  const t = (mhz - m0) / (m1 - m0)
  return [Math.round(r0 + (r1 - r0) * t), Math.round(g0 + (g1 - g0) * t), Math.round(b0 + (b1 - b0) * t)]
}

/**
 * Fill colour for one D-RAP cell, or null for "draw nothing here". NOAA's 0
 * MHz stop is literal black -- opaque over a dark page or a real chart that
 * reads as "no data", not "no absorption" (the same problem aurora's 0%
 * stop has, `tiles.ts:106`), so cells at or below zero are skipped entirely
 * rather than filled with black at any alpha.
 *
 * Alpha is this module's own call, not NOAA's -- the legend has no opacity
 * channel to sample. Ramps in over the first few MHz so a bare-absorption
 * cell doesn't snap straight to a hard-edged blob, and caps short of opaque
 * so the coastline underneath stays visible even at 35 MHz.
 */
export function drapColor(mhz) {
  if (!(mhz > 0)) return null
  const [r, g, b] = drapRampRgb(mhz)
  const alpha = Math.min(0.92, 0.28 + (mhz / 35) * 0.64)
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`
}
