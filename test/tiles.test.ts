import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  MAX_ZOOM,
  TILE_SIZE,
  auroraGridFrom,
  auroraLattice,
  drapLattice,
  isValidTile,
  rasterizeTile,
  renderTile
} from '../src/tiles'
import { parseDrapGrid } from 'space-weather/parse'
import { fixture, fixtureJson } from './fixtures'

const REAL = 'ovation-aurora.2026_08_01.json'

/** Coordinate triples in NOAA's documented layout, from a cell function. */
function coordinates(cell: (lon: number, lat: number) => number) {
  const out: number[][] = []
  for (let lon = 0; lon < 360; lon++) {
    for (let lat = -90; lat <= 90; lat++) {
      out.push([lon, lat, cell(lon, lat)])
    }
  }
  return out
}

/** The flat aurora grid, for the tests that index it directly. */
function gridOf(cell: (lon: number, lat: number) => number): Uint8Array {
  const grid = auroraGridFrom(coordinates(cell))
  if (!grid) throw new Error('grid was rejected')
  return grid
}

/** The same grid as the lattice the renderer draws from. */
function latticeOf(cell: (lon: number, lat: number) => number) {
  return auroraLattice(gridOf(cell))
}

/** RGBA at a pixel, reading past each scanline's filter-type byte. */
function pixel(raw: Buffer, x: number, y: number) {
  const offset = y * (1 + TILE_SIZE * 4) + 1 + x * 4
  return {
    r: raw[offset],
    g: raw[offset + 1],
    b: raw[offset + 2],
    a: raw[offset + 3]
  }
}

/** Minimal PNG reader: enough to prove the container is well formed. */
function readPng(png: Buffer) {
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  const chunks: { type: string; data: Buffer }[] = []
  let at = 8
  while (at < png.length) {
    const length = png.readUInt32BE(at)
    const type = png.toString('ascii', at + 4, at + 8)
    const data = png.subarray(at + 8, at + 8 + length)
    chunks.push({ type, data })
    at += 12 + length
  }
  const ihdr = chunks.find((c) => c.type === 'IHDR')!
  return {
    chunks,
    width: ihdr.data.readUInt32BE(0),
    height: ihdr.data.readUInt32BE(4),
    bitDepth: ihdr.data[8],
    colourType: ihdr.data[9],
    idat: inflateSync(chunks.find((c) => c.type === 'IDAT')!.data)
  }
}

describe('auroraGridFrom', () => {
  it('indexes a cell the same way parse.ts does', () => {
    const grid = gridOf((lon, lat) => (lon === 20 && lat === 70 ? 42 : 0))
    expect(grid[20 * 181 + (70 + 90)]).toBe(42)
  })

  it('rejects a payload with no usable cells', () => {
    expect(auroraGridFrom([])).toBeNull()
    expect(auroraGridFrom(null)).toBeNull()
    expect(auroraGridFrom([['a', 'b', 'c']])).toBeNull()
  })

  it('skips unusable entries rather than rejecting the whole grid', () => {
    const grid = auroraGridFrom([
      [10, 20, 30],
      [999, 0, 5],
      [1, 2, NaN],
      'nonsense'
    ])
    expect(grid).not.toBeNull()
    expect(grid![10 * 181 + (20 + 90)]).toBe(30)
  })

  it('accepts the captured NOAA payload', () => {
    const grid = auroraGridFrom(fixtureJson(REAL).coordinates)
    expect(grid).not.toBeNull()
    expect(grid!.length).toBe(360 * 181)
  })
})

describe('isValidTile', () => {
  it('accepts tiles inside the pyramid', () => {
    expect(isValidTile(0, 0, 0)).toBe(true)
    expect(isValidTile(3, 7, 7)).toBe(true)
    expect(isValidTile(MAX_ZOOM, 2 ** MAX_ZOOM - 1, 0)).toBe(true)
  })

  it('rejects tiles outside it', () => {
    expect(isValidTile(3, 8, 0)).toBe(false)
    expect(isValidTile(3, 0, -1)).toBe(false)
    expect(isValidTile(MAX_ZOOM + 1, 0, 0)).toBe(false)
    expect(isValidTile(1.5, 0, 0)).toBe(false)
    expect(isValidTile(NaN, 0, 0)).toBe(false)
  })
})

describe('rasterizeTile', () => {
  it('is fully transparent where the model says nothing', () => {
    const raw = rasterizeTile(
      latticeOf(() => 0),
      0,
      0,
      0
    )
    for (let y = 0; y < TILE_SIZE; y += 16) {
      for (let x = 0; x < TILE_SIZE; x += 16) {
        expect(pixel(raw, x, y).a).toBe(0)
      }
    }
  })

  it('is strongest and reddest at the top of the scale', () => {
    const raw = rasterizeTile(
      latticeOf(() => 100),
      0,
      0,
      0
    )
    const p = pixel(raw, 128, 128)
    expect(p.a).toBeGreaterThan(200)
    // NOAA's 100% stop is red; green must have dropped away entirely.
    expect(p.r).toBeGreaterThan(200)
    expect(p.g).toBeLessThan(30)
  })

  it('is green in the low percentages, as NOAA draws it', () => {
    const raw = rasterizeTile(
      latticeOf(() => 10),
      0,
      0,
      0
    )
    const p = pixel(raw, 128, 128)
    expect(p.g).toBeGreaterThan(200)
    expect(p.r).toBeLessThan(60)
  })

  it('emits a filter-type byte of 0 at the head of every scanline', () => {
    const raw = rasterizeTile(
      latticeOf(() => 5),
      2,
      1,
      1
    )
    for (let y = 0; y < TILE_SIZE; y++) {
      expect(raw[y * (1 + TILE_SIZE * 4)]).toBe(0)
    }
  })

  /**
   * The buffer comes from `Buffer.allocUnsafe`, so any pixel the rasterizer
   * fails to write keeps whatever was in that memory. An all-zero grid must
   * therefore produce one exact colour everywhere -- uninitialised bytes show
   * up as noise, and a NaN reaching the LUT index would land somewhere else
   * in the table.
   *
   * Counted into a Set and asserted once rather than per byte: 262,144
   * separate `expect` calls take 26 seconds under armv7 emulation and time
   * out the CI job for the Cerbo GX.
   */
  it('writes every byte it allocates', () => {
    const raw = rasterizeTile(
      latticeOf(() => 0),
      1,
      0,
      0
    )
    const distinct = new Set<string>()
    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        const p = pixel(raw, x, y)
        distinct.add(`${p.r},${p.g},${p.b},${p.a}`)
      }
    }
    expect([...distinct]).toEqual(['116,166,117,0'])
  })

  /**
   * The bug this pins: indexing the colour ramp by the truncated percent
   * quantises bilinear samples back to whole percents, which renders the
   * large low-probability areas as hard contour bands. A latitude gradient
   * across a tile must therefore change alpha in many small steps, not in a
   * handful of large ones.
   */
  it('preserves fractional interpolation instead of banding it', () => {
    // 1 percent per degree of latitude, well inside the ramp's low end.
    const raw = rasterizeTile(
      latticeOf((_lon, lat) => Math.max(0, Math.min(20, lat - 50))),
      4,
      8,
      4
    )
    // Distinct colours, not distinct alphas: alpha is nearly flat across the
    // low percentages, so it is a weak probe for quantisation. Truncating to
    // whole percents would cap this at roughly one colour per integer step.
    const colours = new Set<string>()
    for (let y = 0; y < TILE_SIZE; y++) {
      const p = pixel(raw, 128, y)
      colours.add(`${p.r},${p.g},${p.b},${p.a}`)
    }
    expect(colours.size).toBeGreaterThan(40)
  })

  it('wraps longitude across the 0/360 seam', () => {
    // A band centred on the seam: cells at lon 359 and lon 0 are both hot.
    const grid = gridOf((lon, lat) =>
      lat === 0 && (lon === 0 || lon === 359) ? 60 : 0
    )
    // z0 tile: x pixel 0 is longitude -180, pixel 128 is longitude 0.
    const raw = rasterizeTile(auroraLattice(grid), 0, 0, 0)
    expect(pixel(raw, 128, 128).a).toBeGreaterThan(0)
  })

  it('places the northern oval in the northern half of a z1 tile', () => {
    const grid = auroraGridFrom(fixtureJson(REAL).coordinates)!
    // z1 x=0 y=0 is the north-west quadrant: latitudes ~0..85.
    const raw = rasterizeTile(auroraLattice(grid), 1, 0, 0)
    let northAlpha = 0
    let southAlpha = 0
    for (let x = 0; x < TILE_SIZE; x += 4) {
      for (let y = 0; y < 64; y++) northAlpha += pixel(raw, x, y).a
      for (let y = 192; y < TILE_SIZE; y++) southAlpha += pixel(raw, x, y).a
    }
    expect(northAlpha).toBeGreaterThan(southAlpha)
  })
})

describe('renderTile', () => {
  it('produces a decodable 256x256 RGBA PNG', async () => {
    const png = await renderTile(
      latticeOf(() => 12),
      3,
      4,
      2
    )
    const decoded = readPng(png)
    expect(decoded.width).toBe(TILE_SIZE)
    expect(decoded.height).toBe(TILE_SIZE)
    expect(decoded.bitDepth).toBe(8)
    expect(decoded.colourType).toBe(6)
    expect(decoded.idat.length).toBe(TILE_SIZE * (1 + TILE_SIZE * 4))
  })

  it('emits IHDR, IDAT and IEND in that order and nothing else', async () => {
    const png = await renderTile(
      latticeOf(() => 3),
      0,
      0,
      0
    )
    expect(readPng(png).chunks.map((c) => c.type)).toEqual([
      'IHDR',
      'IDAT',
      'IEND'
    ])
  })

  it('writes a CRC every chunk that matches its own contents', async () => {
    const png = await renderTile(
      latticeOf(() => 7),
      2,
      2,
      1
    )
    // Re-derive each CRC independently of the implementation's table.
    let at = 8
    while (at < png.length) {
      const length = png.readUInt32BE(at)
      const covered = png.subarray(at + 4, at + 8 + length)
      let crc = ~0
      for (const byte of covered) {
        crc ^= byte
        for (let k = 0; k < 8; k++) {
          crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
        }
      }
      expect(png.readUInt32BE(at + 8 + length)).toBe(~crc >>> 0)
      at += 12 + length
    }
  })

  it('renders the captured NOAA grid at every zoom it serves', async () => {
    const grid = auroraGridFrom(fixtureJson(REAL).coordinates)!
    for (let z = 0; z <= MAX_ZOOM; z++) {
      const png = await renderTile(auroraLattice(grid), z, 0, 0)
      expect(readPng(png).width).toBe(TILE_SIZE)
    }
  })
})

describe('drapLattice', () => {
  const grid = parseDrapGrid(fixture('drap-global-frequencies.2026_08_20.txt'))!

  it('turns NOAA-s north-to-south rows into a south-to-north lattice', () => {
    const lattice = drapLattice(grid)!
    expect(lattice.latStart).toBe(grid.latitudes[grid.latitudes.length - 1])
    expect(lattice.latStep).toBe(2)
    expect(lattice.lonStep).toBe(4)
    expect(lattice.values.length).toBe(
      grid.latitudes.length * grid.longitudes.length
    )
    // The northernmost row of the payload is the last row of the lattice.
    const latCount = grid.latitudes.length
    expect(lattice.values[0 * latCount + (latCount - 1)]).toBe(
      grid.frequenciesMHz[0][0]
    )
  })

  it('normalises a westernmost longitude past the antimeridian', () => {
    // NOAA starts the row at -178, which is 182 going the other way. The
    // sampler wraps, so a start past 180 is not a problem; a negative one
    // would put every column half a globe out.
    expect(drapLattice(grid)!.lonStart).toBe(182)
  })

  it('rejects a grid with nothing to draw', () => {
    expect(
      drapLattice({
        validTime: 'x',
        latitudes: [],
        longitudes: [],
        frequenciesMHz: []
      })
    ).toBeNull()
  })

  const drapPixelAt = (mhz: number) => {
    const lattice = drapLattice({
      ...grid,
      frequenciesMHz: grid.frequenciesMHz.map((row) => row.map(() => mhz))
    })!
    return pixel(rasterizeTile(lattice, 0, 0, 0), 128, 128)
  }

  it('draws nothing where nothing is absorbed', () => {
    // NOAA's own 0 MHz stop is #000000, which over a chart would read as a
    // hole in it rather than as a quiet grid.
    expect(drapPixelAt(0).a).toBe(0)
  })

  it('fades the low end in rather than switching it on', () => {
    const faint = drapPixelAt(1)
    expect(faint.a).toBeGreaterThan(0)
    expect(faint.a).toBeLessThan(255)
    expect(drapPixelAt(4).a).toBe(255)
  })

  it('follows the NOAA colorbar from blue through to red', () => {
    const low = drapPixelAt(5)
    const high = drapPixelAt(30)
    expect(low.b).toBeGreaterThan(low.r)
    expect(high.r).toBeGreaterThan(high.g)
    expect(high.g).toBeGreaterThan(high.b)
    expect(high.a).toBe(255)
  })

  it('renders the captured grid at every zoom it serves', async () => {
    const lattice = drapLattice(grid)!
    for (let z = 0; z <= MAX_ZOOM; z++) {
      const png = await renderTile(lattice, z, 0, 0)
      expect(readPng(png).width).toBe(TILE_SIZE)
    }
  })
})
