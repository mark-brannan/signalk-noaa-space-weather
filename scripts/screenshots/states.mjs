#!/usr/bin/env node
//
// A contact sheet of every hero state, for pasting onto a pull request that
// changes the webapp.
//
// Usage:
//   npm install --prefix scripts/screenshots
//   npx --prefix scripts/screenshots playwright install chromium
//   node scripts/screenshots/states.mjs
//   node scripts/screenshots/states.mjs --through '#hfTile'   # further down the page
//
// This draws from `scripts/mock-webapp.mjs`, not from a server, and that is
// the whole point: four of its states are impractical to reach against a live
// one -- a G4 happens a few times a solar cycle, and "no data since start"
// means breaking the plugin on purpose. The mock serves fixed payloads and the
// real heroState/renderTimer decide what renders, so a shot here is the page's
// own answer rather than a mock of it. `capture.mjs` is the other direction:
// live data, and the five pictures the README ships.
//
// A state is added in mock-webapp.mjs; this file enumerates whatever is there.
//
// Output is a gitignored directory -- these are review material, not repo
// content, and pinning one would mean regenerating it on every unrelated
// change to the page.

import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')

const argv = parseArgs(process.argv.slice(2))
const OUT_DIR = path.resolve(ROOT, argv.out || '.hero-states')
const PORT = Number(argv.port || 8732)
const BASE = `http://127.0.0.1:${PORT}`
// The app is dark by default and that's the only rendering worth reviewing
// on a pull request; --theme light still works for a one-off light-mode
// check, it's just not part of the default contact sheet anymore.
const THEMES = argv.theme ? [argv.theme] : ['dark']
// Every shot runs from the top of the page down to the bottom of one element.
// The default pairs the statusbar with the hero tile and nothing else; a
// change lower down the page passes its own selector so the pictures show what
// it touched (`--through '#hfTile'` reaches the tile row).
const THROUGH = argv.through || '.tile.hero'

// Wide enough that the hero copy wraps the way it does on a laptop, and tall
// enough that the whole banner is in the viewport before it is clipped.
const WIDTH = 900
const HEIGHT = 800

main().catch((err) => {
  console.error(err.message || err)
  process.exitCode = 1
})

async function main() {
  const { chromium } = await importPlaywright()
  await mkdir(OUT_DIR, { recursive: true })

  const { server, states } = await startMock()
  const shots = []
  // The launch is inside the try: it can fail (no browser downloaded yet),
  // and the mock is already listening by then -- left running it holds the
  // port, so the next run fails for a different reason than the real one.
  let browser
  try {
    browser = await chromium.launch()
    for (const theme of THEMES) {
      const context = await browser.newContext({
        viewport: { width: WIDTH, height: HEIGHT },
        // The pictures are read at whatever size a pull request renders them,
        // so the extra density is what keeps the small type legible there.
        deviceScaleFactor: 2,
        colorScheme: theme
      })
      try {
        const page = await context.newPage()
        for (const state of states) {
          await page.goto(`${BASE}/mock/${state}`, {
            waitUntil: 'networkidle'
          })
          // The page fills its placeholders in from several independent
          // fetches; the hero is written last of the three the mock answers.
          await page.waitForFunction(() => {
            const t =
              document.querySelector('[data-part="headline"]')?.textContent || ''
            return t.trim() !== '' && !t.includes('Reading current conditions')
          })
          await page.evaluate(() => document.fonts.ready)
          // The mock's state switcher is pinned to the viewport bottom, so a
          // clip taller than the viewport lands it across the middle of the
          // page. It is the mock's furniture, not the page under review.
          await page.addStyleTag({
            content: '[data-mock-strip] { display: none !important; }'
          })

          // Never the hero tile without the statusbar above it: the chip and
          // the countdown live in the first and the words in the second, and
          // #126 was a disagreement between the two. So the clip always starts
          // at the top of the page and only its bottom edge moves.
          const target = await page.locator(THROUGH).first().boundingBox()
          if (!target) throw new Error(`No element matches ${THROUGH}`)
          const height = Math.ceil(target.y + target.height + 8)
          const file = `hero-${state}-${theme}.png`
          await page.screenshot({
            path: path.join(OUT_DIR, file),
            // A clip taller than the viewport is only honoured on a full-page
            // shot; asking for one unconditionally would scroll the short
            // default shot for no reason.
            fullPage: height > HEIGHT,
            clip: { x: 0, y: 0, width: WIDTH, height }
          })
          shots.push({ state, theme, file })
          console.log(`  ✓ ${state} · ${theme} → ${file}`)
        }
      } finally {
        await context.close()
      }
    }
  } finally {
    await browser?.close()
    server.kill()
  }

  await writeFile(path.join(OUT_DIR, 'index.html'), contactSheet(shots))
  console.log(
    `\n${shots.length} shots in ${path.relative(ROOT, OUT_DIR)}/ ` +
      `— open index.html to compare, or attach the PNGs to the pull request.`
  )
}

// --- the mock server -------------------------------------------------------

/**
 * Starts scripts/mock-webapp.mjs and waits for it to name its states, which
 * it prints on the line after the one carrying its URL. Reading them from
 * there rather than importing the module keeps this script's only contract
 * with the mock the one a person uses too.
 */
async function startMock() {
  const server = spawn(
    process.execPath,
    [path.join(ROOT, 'scripts', 'mock-webapp.mjs'), String(PORT)],
    { stdio: ['ignore', 'pipe', 'inherit'] }
  )
  const states = await new Promise((resolve, reject) => {
    let buf = ''
    const onData = (chunk) => {
      buf += chunk
      const line = /^states: (.+)$/m.exec(buf)
      if (line) {
        server.stdout.off('data', onData)
        resolve(line[1].split(',').map((s) => s.trim()))
      }
    }
    server.stdout.on('data', onData)
    server.once('error', reject)
    server.once('exit', (code) =>
      reject(new Error(`mock-webapp exited with ${code} before starting`))
    )
  })
  console.log(`\nmock on ${BASE} — ${states.length} states\n`)
  return { server, states }
}

// --- the contact sheet -----------------------------------------------------

function contactSheet(shots) {
  const byState = new Map()
  for (const shot of shots) {
    if (!byState.has(shot.state)) byState.set(shot.state, [])
    byState.get(shot.state).push(shot)
  }
  const rows = [...byState.entries()]
    .map(
      ([state, files]) => `<section>
    <h2>${state}</h2>
    <div class="pair">
      ${files
        .map(
          (f) =>
            `<figure><img src="${f.file}" alt="${state}, ${f.theme}"><figcaption>${f.theme}</figcaption></figure>`
        )
        .join('\n      ')}
    </div>
  </section>`
    )
    .join('\n  ')

  return `<!doctype html>
<meta charset="utf-8">
<title>Hero states</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0 auto; padding: 32px; max-width: 1100px;
         font: 15px/1.5 ui-sans-serif, system-ui, sans-serif; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  p.lede { margin: 0 0 32px; opacity: .7; }
  section { margin: 0 0 40px; }
  h2 { font: 600 13px/1 ui-monospace, monospace; letter-spacing: .1em;
       text-transform: uppercase; opacity: .6; margin: 0 0 10px; }
  .pair { display: grid; gap: 16px; grid-template-columns: 1fr; }
  @media (min-width: 900px) { .pair { grid-template-columns: 1fr 1fr; } }
  figure { margin: 0; }
  img { width: 100%; height: auto; display: block; border-radius: 6px; }
  figcaption { font: 12px/1 ui-monospace, monospace; opacity: .5;
               margin-top: 6px; }
</style>
<h1>Hero states</h1>
<p class="lede">Rendered from <code>scripts/mock-webapp.mjs</code>. Fixed
payloads, the page's own rendering.</p>
${rows}
`
}

// --- plumbing --------------------------------------------------------------

function parseArgs(args) {
  const out = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!arg.startsWith('--')) continue
    const [key, inline] = arg.slice(2).split('=')
    out[key] = inline ?? args[++i]
  }
  return out
}

async function importPlaywright() {
  try {
    return await import('playwright')
  } catch {
    throw new Error(
      'playwright is not installed — run `npm install --prefix scripts/screenshots` ' +
        'and `npx --prefix scripts/screenshots playwright install chromium` first'
    )
  }
}
