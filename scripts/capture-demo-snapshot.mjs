// Captures one real NOAA snapshot into demo/snapshot.json, for the GitHub
// Pages demo (issue #199). The demo page shows a saved moment, not live data
// -- saved keeps it fast, free, and impossible to break from outside -- so
// this is run by hand when the snapshot is worth refreshing, never by the
// page.
//
//   npm run build && node scripts/capture-demo-snapshot.mjs
//
// Same pattern as loadRealProducts in mock-webapp.mjs: the products are
// already decoupled from Signal K behind the Publisher interface, so this
// runs the real ones from dist/ against a publisher that captures every
// published value into a map instead of a delta. The two grids come back
// through the same on-disk cache the plugin itself writes.
//
// Deliberately outside the test suite: it needs the live service, and the
// registry scores this package with `npm test` under --net=none.
import fssync from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(REPO, 'demo', 'snapshot.json')

const distIndex = path.join(REPO, 'dist', 'index.js')
if (!fssync.existsSync(distIndex)) {
  console.error('dist/ missing -- run `npm run build` first')
  process.exit(1)
}

const [{ aurora }, { drap }, { goesFlux }, { f107 }, auroraCache, drapCache, { createClient }] =
  await Promise.all([
    import(path.join(REPO, 'dist', 'products', 'aurora.js')),
    import(path.join(REPO, 'dist', 'products', 'drap.js')),
    import(path.join(REPO, 'dist', 'products', 'goesFlux.js')),
    import(path.join(REPO, 'dist', 'products', 'f107.js')),
    import(path.join(REPO, 'dist', 'cache', 'auroraCache.js')),
    import(path.join(REPO, 'dist', 'cache', 'drapCache.js')),
    import(path.join(REPO, 'dist', 'noaa', 'client.js'))
  ])

const dataDirPath = path.join(os.tmpdir(), 'signalk-noaa-space-weather-demo-capture')
fssync.mkdirSync(dataDirPath, { recursive: true })

// Every published value, keyed by dotted path. The demo has no vessel, so
// selfPath answers nothing: aurora and drap cache their grids and return
// 'awaiting-position', which is all the demo needs from them.
const values = {}
const publisher = {
  meta() {},
  values(vals, timestamp) {
    for (const { path: p, value } of vals) values[p] = { value, timestamp }
  },
  value(p, value, timestamp) {
    this.values([{ path: p, value }], timestamp)
  },
  selfPath() {
    return null
  },
  status(message) {
    console.log(message)
  },
  fail(message) {
    console.error(message)
  },
  error(message, ...args) {
    console.error(message, ...args)
  },
  debug() {},
  dataDirPath: () => dataDirPath
}

const ctx = {
  client: createClient(publisher),
  publisher,
  settings: {
    sendAdvisoryOutlook: false,
    auroraEnabled: true,
    auroraInterval: 900,
    drapEnabled: true,
    alarmLevel: 4,
    popupLevel: 3,
    updateInterval: 15
  },
  stopped: () => false
}

// A snapshot with a hole in it is not a snapshot: any product failing fails
// the run, and the committed file keeps its previous complete capture.
for (const product of [aurora, drap, goesFlux, f107]) {
  console.log(`fetching ${product.name}...`)
  await product.refresh(ctx)
}

const grids = {
  aurora: auroraCache.readAuroraCache(dataDirPath),
  drap: drapCache.readDrapCache(dataDirPath)
}
for (const [name, entry] of Object.entries(grids)) {
  if (!entry?.grid) {
    console.error(`${name} refresh left nothing in the cache`)
    process.exit(1)
  }
}

const snapshot = { capturedAt: new Date().toISOString(), values, grids }
await fs.mkdir(path.dirname(OUT), { recursive: true })
const tempOut = `${OUT}.${process.pid}.tmp`
await fs.writeFile(tempOut, JSON.stringify(snapshot))
await fs.rename(tempOut, OUT)
const kb = Math.round((await fs.stat(OUT)).size / 1024)
console.log(`wrote ${path.relative(REPO, OUT)} (${kb} KB, captured ${snapshot.capturedAt})`)
