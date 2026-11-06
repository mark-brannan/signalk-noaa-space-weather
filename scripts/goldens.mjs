#!/usr/bin/env node
// Screenshot goldens of the plugin configuration screen: the Signal K admin
// UI's form for this plugin, rendered by this repo's own configurator
// (public/remoteEntry.js), on a real Signal K server started here with the
// built plugin linked in. Compared pixel for pixel against
// screenshots/goldens/. Modelled on space-weather's and searoom's.
//
//   node scripts/goldens.mjs update   rewrite screenshots/goldens/, and the
//                                     README's docs/screenshots/ copy with it
//   node scripts/goldens.mjs check    compare; exit 1 if any shot differs by
//                                     more than 0.1% of pixels
//
// Needs `npm run build` (the server loads dist/ and serves public/) and the
// screenshots package (`npm ci --prefix scripts/screenshots`, then
// `npx --prefix scripts/screenshots playwright install chromium`), which
// carries both Playwright and the pinned signalk-server: they stay out of the
// plugin's own devDependencies because the registry scores this repo with an
// offline `npm ci` under a 60 s cap.
//
// The configuration screen exists only here, so its goldens live here even
// where the page around it duplicates space-weather's webapp goldens.
//
// The server runs from a throwaway config directory with security off and
// the plugin saved as disabled: the panel's status and conditions reads then
// answer nothing, nothing reaches NOAA, and the picture is the same on every
// run. The server version is pinned in scripts/screenshots/package-lock.json,
// so the admin UI around the panel moves only on a deliberate bump.
// `check` writes the actual renders and a red-mask diff-*.png for each miss to
// goldens-out/ (CI uploads it). Comparison runs in the browser on a canvas,
// so no image dependency is added.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHOTS_PKG = path.join(ROOT, 'scripts', 'screenshots', 'package.json')
const require = createRequire(SHOTS_PKG)

const mode = process.argv[2] ?? 'check'
if ((mode !== 'check' && mode !== 'update') || process.argv.length > 3) {
  console.error('usage: goldens.mjs check|update')
  process.exit(1)
}
const goldenDir = path.join(ROOT, 'screenshots', 'goldens')
const outDir = path.join(ROOT, 'goldens-out')
const readmeDir = path.join(ROOT, 'docs', 'screenshots')
const PLUGIN_ID = 'signalk-noaa-space-weather'
const NOW = '2026-03-20T12:00:00Z'
const MAX_DIFF_FRACTION = 0.001 // 0.1% of pixels
const CHANNEL_TOLERANCE = 16 // per-channel delta below this is anti-aliasing noise
const MAX_HEIGHT = 3000 // px; a long phone page stays a reviewable PNG

// The admin UI has no dark mode, so light only. 1400 is the width every
// README shot renders at, and that golden is the README's picture; 360 is the
// phone a boat's admin UI is often opened on.
const shots = [
  {
    file: 'plugin-configuration-1400.png',
    width: 1400,
    height: 940,
    readme: 'plugin-configuration.png'
  },
  { file: 'plugin-configuration-360.png', width: 360, height: 740 }
]

for (const built of ['dist/index.js', 'public/remoteEntry.js']) {
  if (!existsSync(path.join(ROOT, built))) {
    console.error(`${built} is missing: run \`npm run build\` first`)
    process.exit(1)
  }
}
let chromium
let serverBin
try {
  ;({ chromium } = require('playwright'))
  serverBin = require.resolve('signalk-server/bin/signalk-server')
} catch {
  console.error(
    'the screenshots package is not installed:\n' +
      '  npm ci --prefix scripts/screenshots\n' +
      '  npx --prefix scripts/screenshots playwright install chromium'
  )
  process.exit(1)
}

// A free port rather than a fixed one: two worktrees shooting at once would
// otherwise screenshot each other's server.
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })
}

// The config directory a fresh `signalk-server-setup` would leave, minus the
// questions: the plugin is found through node_modules like any installed one,
// and its saved configuration is the defaults, disabled.
function configDir() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sk-goldens-'))
  mkdirSync(path.join(dir, 'node_modules'))
  symlinkSync(ROOT, path.join(dir, 'node_modules', PLUGIN_ID), 'dir')
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name: 'sk-goldens',
      version: '0.0.0',
      dependencies: { [PLUGIN_ID]: '*' }
    })
  )
  writeFileSync(
    path.join(dir, 'settings.json'),
    // No NMEA or Signal K TCP listeners and no mDNS: they would collide with a
    // server already running on the machine, and nothing here reads them.
    JSON.stringify({
      interfaces: { tcp: false, 'nmea-tcp': false },
      mdns: false,
      pipedProviders: [],
      // A fixed identity, or the admin UI's footer prints a fresh one.
      vessel: {
        name: 'Goldens',
        uuid: 'urn:mrn:signalk:uuid:00000000-0000-4000-8000-000000000000'
      }
    })
  )
  mkdirSync(path.join(dir, 'plugin-config-data'))
  writeFileSync(
    path.join(dir, 'plugin-config-data', `${PLUGIN_ID}.json`),
    JSON.stringify({ enabled: false, configuration: {} })
  )
  return dir
}

async function startServer(dir) {
  const port = await freePort()
  const base = `http://127.0.0.1:${port}`
  const server = spawn(
    process.execPath,
    [serverBin, '-c', dir, '-s', 'settings.json'],
    {
      cwd: dir,
      env: { ...process.env, PORT: String(port), SIGNALK_NODE_CONFIG_DIR: dir },
      stdio: ['ignore', 'ignore', 'inherit']
    }
  )
  for (let i = 0; i < 300; i++) {
    if (server.exitCode !== null) break
    try {
      if ((await fetch(`${base}/skServer/plugins`)).ok) return { server, base }
    } catch {
      await sleep(100)
    }
  }
  server.kill()
  throw new Error(`Signal K server did not answer at ${base}`)
}

// Returns { fraction, diffPng (base64) } for two PNG buffers.
async function compare(cmp, goldenPng, actualPng) {
  return cmp.evaluate(
    async ([g, a, tol]) => {
      const load = (b64) =>
        new Promise((res, rej) => {
          const im = new Image()
          im.onload = () => res(im)
          im.onerror = rej
          im.src = 'data:image/png;base64,' + b64
        })
      const [gi, ai] = await Promise.all([load(g), load(a)])
      const w = Math.max(gi.width, ai.width)
      const h = Math.max(gi.height, ai.height)
      const px = (im) => {
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        const x = c.getContext('2d', { willReadFrequently: true })
        x.drawImage(im, 0, 0)
        return x.getImageData(0, 0, w, h)
      }
      const gd = px(gi)
      const ad = px(ai)
      const out = new ImageData(w, h)
      const sizeMiss = gi.width !== ai.width || gi.height !== ai.height
      let bad = 0
      for (let i = 0; i < gd.data.length; i += 4) {
        const d = Math.max(
          Math.abs(gd.data[i] - ad.data[i]),
          Math.abs(gd.data[i + 1] - ad.data[i + 1]),
          Math.abs(gd.data[i + 2] - ad.data[i + 2])
        )
        if (d > tol || sizeMiss) {
          bad++
          out.data.set([255, 0, 64, 255], i)
        } else {
          const v = ad.data[i] * 0.3
          out.data.set([v, ad.data[i + 1] * 0.3, ad.data[i + 2] * 0.3, 255], i)
        }
      }
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      c.getContext('2d').putImageData(out, 0, 0)
      return {
        fraction: bad / (w * h),
        diffPng: c.toDataURL('image/png').split(',')[1]
      }
    },
    [
      goldenPng.toString('base64'),
      actualPng.toString('base64'),
      CHANNEL_TOLERANCE
    ]
  )
}

// The admin UI is a hash-routed SPA that does not survive a hard navigation
// to a deep route, so load its dashboard and move the hash, as capture.mjs
// does; then open this plugin's row the way a person would.
async function openConfiguration(page, base) {
  await page.goto(`${base}/admin/`, { waitUntil: 'networkidle' })
  await page.waitForSelector('#root', { timeout: 30000 })
  await page.evaluate(() => {
    window.location.hash = '#/apps/configuration/-'
  })
  const row = page.locator(`[data-plugin-id="${PLUGIN_ID}"]`)
  await row.waitFor({ state: 'visible', timeout: 30000 })
  await row.click()
  // Off the table, or the row under the pointer is drawn hovered.
  await page.mouse.move(0, 0)
  await page.waitForSelector('#plugin-config-header', { timeout: 30000 })
  await page.waitForLoadState('networkidle')
  // The footer prints the node and npm versions the server runs on, which
  // differ between a laptop and CI and say nothing about this plugin.
  await page.addStyleTag({ content: '.app-footer { visibility: hidden }' })
  await page.waitForTimeout(600)
}

let browser
let server
let dir
let failed = 0
try {
  dir = configDir()
  let base
  ;({ server, base } = await startServer(dir))

  mkdirSync(mode === 'update' ? goldenDir : outDir, { recursive: true })
  browser = await chromium.launch()
  const cmp = await browser.newPage()

  // A fresh context per shot: the admin UI remembers the plugin last opened,
  // and clicking that row again closes it instead.
  for (const { file, width, height, readme } of shots) {
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: 'reduce',
      deviceScaleFactor: 1,
      timezoneId: 'UTC',
      locale: 'en-US',
      colorScheme: 'light'
    })
    const page = await context.newPage()
    await page.clock.setFixedTime(new Date(NOW))
    await openConfiguration(page, base)
    // Grow the viewport to the page instead of a fullPage shot: with nothing
    // to scroll, the admin UI's fixed header cannot be drawn part way down.
    const full = await page.evaluate(
      () => document.documentElement.scrollHeight
    )
    await page.setViewportSize({ width, height: Math.min(full, MAX_HEIGHT) })
    await page.waitForTimeout(300)
    const shot = await page.screenshot()
    await context.close()
    if (mode === 'update') {
      writeFileSync(path.join(goldenDir, file), shot)
      console.log('wrote', file)
      if (readme) {
        copyFileSync(path.join(goldenDir, file), path.join(readmeDir, readme))
        console.log('wrote', `docs/screenshots/${readme}`)
      }
      continue
    }
    writeFileSync(path.join(outDir, file), shot)
    if (!existsSync(path.join(goldenDir, file))) {
      console.log('MISSING', file)
      failed++
      continue
    }
    const { fraction, diffPng } = await compare(
      cmp,
      readFileSync(path.join(goldenDir, file)),
      shot
    )
    const pct = (fraction * 100).toFixed(3)
    if (fraction > MAX_DIFF_FRACTION) {
      writeFileSync(
        path.join(outDir, `diff-${file}`),
        Buffer.from(diffPng, 'base64')
      )
      console.log(`FAIL ${file} ${pct}% differs`)
      failed++
    } else {
      console.log(`ok   ${file} ${pct}%`)
    }
  }
} finally {
  await browser?.close()
  // The server writes into its config directory until it exits, so wait for
  // that before removing it.
  if (server && server.exitCode === null) {
    const exited = new Promise((resolve) => server.once('exit', resolve))
    server.kill()
    await exited
  }
  if (dir) rmSync(dir, { recursive: true, force: true })
}

if (failed) {
  console.error(`${failed} golden(s) over ${MAX_DIFF_FRACTION * 100}%`)
  process.exit(1)
}
