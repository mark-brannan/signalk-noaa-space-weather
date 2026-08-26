/**
 * Persists the parsed D-RAP grid to the plugin's own data directory, so the
 * absorption map and the tile route read the fetch the product already made
 * rather than asking NOAA again.
 *
 * The parsed grid rather than the raw text, unlike auroraCache: parsing is
 * `parseDrapGrid`'s job and it is strict about a torn payload (a short grid,
 * or one with no valid time, is rejected outright). Caching the text would
 * push that decision into every reader, and a reader in a browser cannot run
 * the parser at all.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { DrapGrid } from '../parse.js'

const CACHE_FILENAME = 'drap-grid.json'

export interface DrapCacheEntry {
  fetchedAt: string
  grid: DrapGrid
}

/** Write-then-rename, so a reader never sees a half-written file. */
export function writeDrapCache(dataDirPath: string, grid: DrapGrid): void {
  const finalPath = join(dataDirPath, CACHE_FILENAME)
  const tmpPath = finalPath + '.tmp'
  const entry: DrapCacheEntry = { fetchedAt: new Date().toISOString(), grid }
  writeFileSync(tmpPath, JSON.stringify(entry))
  renameSync(tmpPath, finalPath)
}

/** Never throws: a missing or corrupt cache file is "nothing cached yet". */
export function readDrapCache(dataDirPath: string): DrapCacheEntry | null {
  const path = join(dataDirPath, CACHE_FILENAME)
  if (!existsSync(path)) return null
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    if (!parsed || typeof parsed.fetchedAt !== 'string') return null
    const grid = parsed.grid
    if (
      !grid ||
      !Array.isArray(grid.latitudes) ||
      !Array.isArray(grid.longitudes) ||
      !Array.isArray(grid.frequenciesMHz)
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}
