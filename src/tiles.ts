/**
 * Renders the OVATION aurora grid as Web Mercator PNG tiles, so a chart
 * plotter (Freeboard-SK, via `@signalk/charts-plugin`'s online chart source)
 * can draw the auroral oval over the actual chart instead of the webapp
 * showing it in a separate box.
 *
 * No I/O and no `app` access: this takes a grid and returns bytes. The route
 * that serves it, and the disk cache it reads from, live in index.ts and
 * cache/auroraCache.ts respectively.
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
 * Bilinear sample in whole percents, wrapping longitude at the 0/360 seam and
 * clamping latitude at the poles -- the same treatment `auroraProbabilityAt`
 * gives a single position, for the same reason: the grid is coarse and the
 * oval's edge is exactly where the answer matters.
 */
function sample(grid: Uint8Array, latitude: number, longitude: number): number {
  const lat = latitude > 90 ? 90 : latitude < -90 ? -90 : latitude
  const lon = ((longitude % LON_STEPS) + LON_STEPS) % LON_STEPS
  const lat0 = Math.floor(lat)
  const lat1 = lat0 + 1 > 90 ? 90 : lat0 + 1
  const lon0 = Math.floor(lon) % LON_STEPS
  const lon1 = (lon0 + 1) % LON_STEPS
  const fy = lat - lat0
  const fx = lon - Math.floor(lon)

  const v00 = grid[lon0 * LAT_STEPS + (lat0 + 90)]
  const v10 = grid[lon1 * LAT_STEPS + (lat0 + 90)]
  const v01 = grid[lon0 * LAT_STEPS + (lat1 + 90)]
  const v11 = grid[lon1 * LAT_STEPS + (lat1 + 90)]

  const lower = v00 + (v10 - v00) * fx
  const upper = v01 + (v11 - v01) * fx
  return lower + (upper - lower) * fy
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
const LUT_SCALE = 8
const LUT_MAX_INDEX = 100 * LUT_SCALE

function buildLut(): Uint8Array {
  const lut = new Uint8Array((LUT_MAX_INDEX + 1) * 4)
  for (let i = 0; i <= LUT_MAX_INDEX; i++) {
    const percent = i / LUT_SCALE
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
const LUT = buildLut()

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
  grid: Uint8Array,
  z: number,
  x: number,
  y: number
): Buffer {
  const n = 2 ** z
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
      const scaled = sample(grid, lat, lon < 0 ? lon + 360 : lon) * LUT_SCALE
      const index =
        (scaled < 0 ? 0 : scaled > LUT_MAX_INDEX ? LUT_MAX_INDEX : scaled | 0) *
        4
      const out = rowStart + 1 + px * 4
      raw[out] = LUT[index]
      raw[out + 1] = LUT[index + 1]
      raw[out + 2] = LUT[index + 2]
      raw[out + 3] = LUT[index + 3]
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

/** One aurora tile as PNG bytes. */
export async function renderAuroraTile(
  grid: Uint8Array,
  z: number,
  x: number,
  y: number
): Promise<Buffer> {
  return encodePng(TILE_SIZE, TILE_SIZE, rasterizeTile(grid, z, x, y))
}
