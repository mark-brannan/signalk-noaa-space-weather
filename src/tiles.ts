/**
 * Renders a global NOAA grid as Web Mercator PNG tiles, so a chart plotter
 * (Freeboard-SK, via `@signalk/charts-plugin`'s online chart source) can draw
 * the auroral oval, or the HF absorption footprint, over the actual chart
 * instead of the webapp showing it in a separate box.
 *
 * Two grids go through the same renderer at two different resolutions --
 * OVATION at 1 degree, D-RAP at 2 by 4 -- so what a `Lattice` carries is the
 * geometry and the colour table, and everything below it is shared.
 *
 * No I/O and no `app` access: this takes a grid and returns bytes. The routes
 * that serve it, and the disk caches they read from, live in index.ts and
 * cache/ respectively.
 *
 * Why a hand-rolled PNG encoder rather than a dependency: a PNG is a
 * signature, an IHDR chunk, a zlib stream, and IEND. Node's own zlib does the
 * only difficult part. `canvas` would add native bindings (worse for the
 * registry's audit and CI scoring, and for anyone installing on a Raspberry
 * Pi), and even a pure-JS PNG library would be a dependency earning its place
 * against about forty lines of chunk framing.
 */
import { deflate } from 'node:zlib'
import { promisify } from 'node:util'
import { DrapGrid, MARINE_SSB_BAND_EDGES_HZ } from './parse.js'

const deflateAsync = promisify(deflate)

/** Longitudes 0..359 and latitudes -90..90 inclusive, as in parse.ts. */
const LAT_STEPS = 181
const LON_STEPS = 360

export const TILE_SIZE = 256

/**
 * Above this the 1-degree source grid has nothing more to say -- a z9 tile
 * spans well under a grid cell -- and an uncapped {z} is an invitation for a
 * client to request an unbounded number of tiles from a boat's server.
 */
export const MAX_ZOOM = 8

/**
 * The grid as a flat `Uint8Array` of whole percents, indexed the same way
 * parse.ts indexes `coordinates`.
 *
 * Per-pixel sampling reads the grid ~65,000 times per tile, so the triples
 * are flattened once per fetch rather than indexed as an array of arrays.
 * Returns null for a payload that yields no usable cells, matching the
 * "return null rather than publish nonsense" stance everywhere else here.
 */
export function auroraGridFrom(coordinates: unknown): Uint8Array | null {
  if (!Array.isArray(coordinates) || coordinates.length === 0) return null
  const grid = new Uint8Array(LON_STEPS * LAT_STEPS)
  let filled = 0
  for (const entry of coordinates) {
    if (!Array.isArray(entry)) continue
    const lon = entry[0]
    const lat = entry[1]
    const pct = entry[2]
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue
    if (!Number.isFinite(pct)) continue
    if (lon < 0 || lon >= LON_STEPS || lat < -90 || lat > 90) continue
    grid[lon * LAT_STEPS + (lat + 90)] = pct < 0 ? 0 : pct > 255 ? 255 : pct
    filled++
  }
  return filled === 0 ? null : grid
}

/**
 * A regular global lattice of model values, plus the colour table that turns
 * one into a pixel. The renderer knows nothing else about the product.
 *
 * `latStart`/`lonStart` are the coordinates of index 0 and the steps are
 * signed degrees, so a grid NOAA publishes north-to-south or from -178 is
 * described rather than rewritten. Longitude wraps, latitude clamps.
 */
export interface Lattice {
  values: Uint8Array | Float32Array
  latStart: number
  latStep: number
  latCount: number
  lonStart: number
  lonStep: number
  lonCount: number
  /** RGBA quadruples; a sampled value indexes it at `value * lutScale`. */
  lut: Uint8Array
  lutScale: number
}

/**
 * Bilinear sample, wrapping longitude at the seam and clamping latitude at
 * the poles -- the same treatment `auroraProbabilityAt` gives a single
 * position, for the same reason: the grid is coarse and the edge of the
 * feature is exactly where the answer matters.
 */
function sample(lattice: Lattice, latitude: number, longitude: number): number {
  const { values, latCount, lonCount } = lattice
  const fy = (latitude - lattice.latStart) / lattice.latStep
  const y0 = fy < 0 ? 0 : fy > latCount - 1 ? latCount - 1 : Math.floor(fy)
  const y1 = y0 + 1 > latCount - 1 ? latCount - 1 : y0 + 1
  const ty = fy - y0 < 0 ? 0 : fy - y0 > 1 ? 1 : fy - y0

  const fx = (longitude - lattice.lonStart) / lattice.lonStep
  const wrapped = ((fx % lonCount) + lonCount) % lonCount
  const x0 = Math.floor(wrapped) % lonCount
  const x1 = (x0 + 1) % lonCount
  const tx = wrapped - Math.floor(wrapped)

  const v00 = values[x0 * latCount + y0]
  const v10 = values[x1 * latCount + y0]
  const v01 = values[x0 * latCount + y1]
  const v11 = values[x1 * latCount + y1]

  const lower = v00 + (v10 - v00) * tx
  const upper = v01 + (v11 - v01) * tx
  return lower + (upper - lower) * ty
}

/**
 * NOAA's own OVATION colour scale, sampled directly from the legend on
 * `services.swpc.noaa.gov/images/aurora-forecast-northern-hemisphere.jpg` at
 * 5% intervals (the "Probability of Aurora" bar, ticked 10/50/90%).
 *
 * Read off the image rather than invented, because the point of a chart
 * overlay is that it looks like the aurora forecast everyone else is looking
 * at. NOAA publishes no numeric definition of this ramp anywhere, so the
 * image is the only source of truth there is.
 *
 * This deliberately no longer matches `auroraStops` in public/index.html,
 * which still uses this plugin's own 4-stop ramp saturating at 30%. Aligning
 * the webapp map is a separate decision -- it is a different picture, on a
 * dark page, at a different scale.
 */
const NOAA_RAMP: ReadonlyArray<readonly [number, number, number]> = [
  [116, 166, 117], // 0%  -- desaturated; we draw this fully transparent
  [50, 196, 53], // 5%
  [23, 227, 16], // 10%
  [30, 232, 10], // 15%
  [37, 241, 6], // 20%
  [45, 247, 3], // 25%
  [61, 255, 0], // 30%
  [109, 255, 0], // 35%
  [156, 255, 2], // 40%
  [199, 255, 1], // 45%
  [248, 255, 1], // 50%
  [255, 238, 0], // 55%
  [254, 222, 0], // 60%
  [254, 201, 0], // 65%
  [255, 182, 0], // 70%
  [255, 163, 0], // 75%
  [255, 144, 2], // 80%
  [254, 113, 0], // 85%
  [250, 54, 0], // 90%
  [249, 2, 0], // 95%
  [228, 0, 0] // 100%
]
const RAMP_STEP_PERCENT = 5

/**
 * Colour lookup indexed at 1/8 of a percent rather than whole percents.
 *
 * The grid stores integers but bilinear sampling produces fractions, and
 * quantising them back to integers on lookup renders as hard contour bands
 * across the 1-3% areas that cover most of the globe on a quiet day. The
 * webapp's canvas map never hits this because it fills one rectangle per grid
 * cell instead of sampling per pixel.
 */
const AURORA_LUT_SCALE = 8
const AURORA_LUT_MAX = 100 * AURORA_LUT_SCALE

function buildAuroraLut(): Uint8Array {
  const lut = new Uint8Array((AURORA_LUT_MAX + 1) * 4)
  for (let i = 0; i <= AURORA_LUT_MAX; i++) {
    const percent = i / AURORA_LUT_SCALE
    const position = percent / RAMP_STEP_PERCENT
    const seg = Math.min(NOAA_RAMP.length - 2, Math.floor(position))
    const localT = position - seg
    const a = NOAA_RAMP[seg]
    const b = NOAA_RAMP[seg + 1]
    lut[i * 4 + 0] = Math.round(a[0] + (b[0] - a[0]) * localT)
    lut[i * 4 + 1] = Math.round(a[1] + (b[1] - a[1]) * localT)
    lut[i * 4 + 2] = Math.round(a[2] + (b[2] - a[2]) * localT)
    // NOAA draws this ramp opaque over a dark globe. An overlay has to let a
    // nautical chart through, so alpha carries the low end instead: fully
    // transparent at zero, faded in across the first 2% rather than switched
    // on at a threshold (a hard cutoff draws a crisp false edge around the
    // oval, exactly the boundary a reader would over-trust), and capped short
    // of opaque so soundings stay readable underneath.
    lut[i * 4 + 3] = Math.round(
      255 * Math.min(1, percent / 2) * (0.22 + 0.63 * (percent / 100))
    )
  }
  return lut
}
const AURORA_LUT = buildAuroraLut()

/** The OVATION grid as something the renderer can draw. */
export function auroraLattice(values: Uint8Array): Lattice {
  return {
    values,
    latStart: -90,
    latStep: 1,
    latCount: LAT_STEPS,
    lonStart: 0,
    lonStep: 1,
    lonCount: LON_STEPS,
    lut: AURORA_LUT,
    lutScale: AURORA_LUT_SCALE
  }
}

/**
 * The D-RAP colour table, keyed to the marine SSB band edges rather than to a
 * continuous scale.
 *
 * The published number is a frequency, not a severity -- `zonesForDrap` in
 * parse.ts carries that argument in full -- so a smooth rainbow over MHz would
 * be drawing a gradient across something that is actually a set of steps. What
 * a reader needs off a chart is which of their bands are gone, so each band
 * edge the cutoff has passed moves the colour one stop, and the contour lands
 * exactly on the boundary that changed what they can work. It is the same
 * ladder the HF Radio tile's band strip draws, in map form.
 *
 * Green through red rather than NOAA's own D-RAP rainbow: this is an overlay
 * on a nautical chart, where blue is water, and the ramp has to read as
 * severity at a glance against soundings.
 */
export const DRAP_BAND_RAMP: ReadonlyArray<readonly [number, number, number]> =
  [
    [90, 200, 120], // nothing absorbed -- drawn transparent
    [140, 214, 74],
    [186, 222, 44],
    [226, 220, 34],
    [246, 198, 30],
    [250, 166, 26],
    [250, 130, 24],
    [246, 92, 30],
    [232, 52, 44],
    [204, 24, 70] // every marine SSB band absorbed
  ]

/**
 * Indexed at 1/16 MHz. The grid is whole tenths of a MHz at most and bilinear
 * sampling produces fractions between them, so the table has to be finer than
 * the data for the same reason aurora's is.
 */
const DRAP_LUT_SCALE = 16
const DRAP_MAX_MHZ = 40
const DRAP_LUT_MAX = DRAP_MAX_MHZ * DRAP_LUT_SCALE

function buildDrapLut(): Uint8Array {
  const edgesMHz = MARINE_SSB_BAND_EDGES_HZ.map((hz) => hz / 1e6)
  const lut = new Uint8Array((DRAP_LUT_MAX + 1) * 4)
  for (let i = 0; i <= DRAP_LUT_MAX; i++) {
    const mhz = i / DRAP_LUT_SCALE
    // How many band edges this cutoff has passed, interpolated across the gap
    // to the next one so the steps have a soft shoulder rather than aliasing
    // into a jagged contour a pixel wide.
    let stop = 0
    for (let b = 0; b < edgesMHz.length; b++) {
      if (mhz >= edgesMHz[b]) {
        stop = b + 1
        continue
      }
      const previous = b === 0 ? 0 : edgesMHz[b - 1]
      stop =
        b +
        Math.min(1, Math.max(0, (mhz - previous) / (edgesMHz[b] - previous)))
      break
    }
    if (mhz >= edgesMHz[edgesMHz.length - 1]) stop = DRAP_BAND_RAMP.length - 1
    const seg = Math.min(DRAP_BAND_RAMP.length - 2, Math.floor(stop))
    const localT = Math.min(1, stop - seg)
    const a = DRAP_BAND_RAMP[seg]
    const b = DRAP_BAND_RAMP[seg + 1]
    lut[i * 4 + 0] = Math.round(a[0] + (b[0] - a[0]) * localT)
    lut[i * 4 + 1] = Math.round(a[1] + (b[1] - a[1]) * localT)
    lut[i * 4 + 2] = Math.round(a[2] + (b[2] - a[2]) * localT)
    // Transparent below the lowest marine band -- absorption nobody on this
    // boat can hear is not worth putting ink on a chart for -- then faded in
    // and capped short of opaque, the same bargain aurora's alpha strikes.
    const fraction = Math.min(1, stop / (DRAP_BAND_RAMP.length - 1))
    lut[i * 4 + 3] =
      mhz < edgesMHz[0] ? 0 : Math.round(255 * (0.22 + 0.53 * fraction))
  }
  return lut
}
const DRAP_LUT = buildDrapLut()

/**
 * The parsed D-RAP grid as something the renderer can draw.
 *
 * NOAA publishes it north-to-south and from -178, so the values are copied
 * into a south-to-north, 0..360 lattice once per fetch rather than reasoned
 * about on every one of the ~65,000 samples a tile takes.
 */
export function drapLattice(grid: DrapGrid): Lattice | null {
  const latCount = grid.latitudes?.length ?? 0
  const lonCount = grid.longitudes?.length ?? 0
  if (latCount < 2 || lonCount < 2) return null
  const values = new Float32Array(lonCount * latCount)
  for (let row = 0; row < latCount; row++) {
    const cells = grid.frequenciesMHz[row]
    if (!cells) return null
    // Row 0 is the northernmost latitude; the lattice runs the other way.
    const y = latCount - 1 - row
    for (let column = 0; column < lonCount; column++) {
      const mhz = cells[column]
      values[column * latCount + y] = Number.isFinite(mhz) ? mhz : 0
    }
  }
  // Column 0 is the westernmost longitude, which normalises to 0..360 by
  // adding a turn; the sampler wraps, so a start past 180 is not a problem.
  const lonStart =
    grid.longitudes[0] < 0 ? grid.longitudes[0] + 360 : grid.longitudes[0]
  return {
    values,
    latStart: grid.latitudes[latCount - 1],
    latStep: Math.abs(grid.latitudes[0] - grid.latitudes[1]),
    latCount,
    lonStart,
    lonStep: Math.abs(grid.longitudes[1] - grid.longitudes[0]),
    lonCount,
    lut: DRAP_LUT,
    lutScale: DRAP_LUT_SCALE
  }
}

/** Whether {z}/{x}/{y} name a tile this renderer will draw. */
export function isValidTile(z: number, x: number, y: number): boolean {
  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y)) {
    return false
  }
  if (z < 0 || z > MAX_ZOOM) return false
  const n = 2 ** z
  return x >= 0 && x < n && y >= 0 && y < n
}

/**
 * RGBA scanlines for one tile, each already prefixed with its PNG filter-type
 * byte (0 = None -- the data is smooth gradients over large transparent areas,
 * which deflate handles well enough that per-scanline filtering would cost
 * more CPU than it saves bytes).
 */
export function rasterizeTile(
  lattice: Lattice,
  z: number,
  x: number,
  y: number
): Buffer {
  const n = 2 ** z
  const { lut, lutScale } = lattice
  const lutMax = lut.length / 4 - 1
  const stride = 1 + TILE_SIZE * 4
  const raw = Buffer.allocUnsafe(TILE_SIZE * stride)
  const lonSpan = 360 / n / TILE_SIZE

  for (let py = 0; py < TILE_SIZE; py++) {
    const rowStart = py * stride
    raw[rowStart] = 0

    // Mercator latitude is non-linear in y, so it is recomputed per scanline
    // rather than interpolated between the tile's north and south edges --
    // at low zoom that error would be tens of degrees.
    const gy = (y * TILE_SIZE + py + 0.5) / (n * TILE_SIZE)
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * gy))) * 180) / Math.PI
    const lonBase = (x / n) * 360 - 180 + lonSpan * 0.5

    for (let px = 0; px < TILE_SIZE; px++) {
      const lon = lonBase + px * lonSpan
      const scaled = sample(lattice, lat, lon < 0 ? lon + 360 : lon) * lutScale
      const index = (scaled < 0 ? 0 : scaled > lutMax ? lutMax : scaled | 0) * 4
      const out = rowStart + 1 + px * 4
      raw[out] = lut[index]
      raw[out + 1] = lut[index + 1]
      raw[out + 2] = lut[index + 2]
      raw[out + 3] = lut[index + 3]
    }
  }
  return raw
}

// --- PNG container ---------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf: Buffer): number {
  let c = -1
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ -1) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.allocUnsafe(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  // The CRC covers the type and the data, but not the length.
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

/**
 * Wrap filtered scanlines in a PNG.
 *
 * `deflate` is the async form deliberately. Measured on a 20-tile screenful,
 * `deflateSync` back-to-back blocks the event loop for the whole run -- 75ms
 * with zero timer ticks -- while awaiting one tile at a time keeps the worst
 * observed lag at ~2.5ms for about 11ms more wall clock. This is a plugin
 * inside somebody's navigation server; it does not get to stall it.
 */
async function encodePng(
  width: number,
  height: number,
  raw: Buffer
): Promise<Buffer> {
  const ihdr = Buffer.allocUnsafe(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: truecolour with alpha
  ihdr[10] = 0 // compression: deflate
  ihdr[11] = 0 // filter method 0
  ihdr[12] = 0 // no interlace
  const idat = (await deflateAsync(raw, { level: 6 })) as Buffer
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/** One tile of whichever grid the lattice describes, as PNG bytes. */
export async function renderTile(
  lattice: Lattice,
  z: number,
  x: number,
  y: number
): Promise<Buffer> {
  return encodePng(TILE_SIZE, TILE_SIZE, rasterizeTile(lattice, z, x, y))
}
