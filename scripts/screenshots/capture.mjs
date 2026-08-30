#!/usr/bin/env node
//
// Regenerates docs/screenshots/*.png against a running Signal K server.
//
// Usage:
//   npm install --prefix scripts/screenshots
//   npx --prefix scripts/screenshots playwright install chromium
//   SK_USERNAME=admin SK_PASSWORD=... node scripts/screenshots/capture.mjs
//   node scripts/screenshots/capture.mjs --url http://localhost:3100 --only webapp,space-map
//
// The default target is the dev server, because screenshots belong to the
// change that alters the UI: capture against the published package and the PR
// that rewrote a panel ships a picture of the old one. `--url` covers the
// other direction when the point is to match what a registry installer sees.
//
// Credentials come from --username/--password, SK_USERNAME/SK_PASSWORD, or a
// prompt; nothing is written to disk. A read-only user is enough for four of
// the five shots — the admin UI exposes Data → Browser to any logged-in user.
// Only the plugin-configuration shot needs admin, because /skServer/plugins is
// admin-gated; with a non-admin login it is skipped rather than failing.

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as readline from 'node:readline'
import { Writable } from 'node:stream'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.resolve(HERE, '..', '..', 'docs', 'screenshots')

const PLUGIN_ID = 'signalk-noaa-space-weather'
// The viewport every shot renders in, and the width of every full-page one;
// keep it that way. A `clip` shot comes out as wide as its element instead.
const WIDTH = 1400

const argv = parseArgs(process.argv.slice(2))
const BASE = (
  argv.url ||
  process.env.SK_URL ||
  'http://localhost:3010'
).replace(/\/$/, '')

// The hero banner's whole point is that its states differ, and on most days
// the sky is quiet -- so a shot of a live server pictures the one state
// anybody can already see for themselves. These four render the others from
// fixed payloads served to the page in place of NOAA's, which is also what
// makes them reproducible: the same four pictures a year from now.
const HOUR_MS = 60 * 60 * 1000

// Kp forecast points at NOAA's three-hour spacing.
function kpSeries(now, ...kps) {
  return kps.map((kp, i) => ({
    time: new Date(now + (i + 1) * 3 * HOUR_MS).toISOString(),
    kp,
    forecast: true
  }))
}

const HERO_STATES = {
  'hero-storm': {
    observedKp: 8.0,
    // Two storms at once: the worst leads, the other keeps its own line.
    observed: { G: 4, S: 4, R: 3 },
    peak24h: { G: 4, S: 4, R: 3 },
    kp: (now) => kpSeries(now, 8, 9, 7, 5)
  },
  'hero-brewing': {
    observedKp: 4.0,
    observed: { G: 1, S: 0, R: 0 },
    peak24h: { G: 1, S: 0, R: 0 },
    kp: (now) => kpSeries(now, 4, 4, 7, 7)
  },
  'hero-all-clear': {
    observedKp: 3.0,
    observed: { G: 1, S: 0, R: 0 },
    peak24h: { G: 3, S: 0, R: 0 },
    kp: (now) => kpSeries(now, 3, 2, 2)
  },
  'hero-stale': {
    observedKp: 2.0,
    observed: { G: 1, S: 0, R: 0 },
    peak24h: { G: 1, S: 0, R: 0 },
    kp: (now) => kpSeries(now, 2, 2),
    // Older than the webapp's three-hour staleness window.
    ageMs: 5 * HOUR_MS
  }
}

function heroShots() {
  return Object.fromEntries(
    Object.entries(HERO_STATES).map(([name, state]) => [
      name,
      {
        file: `${name}.png`,
        theme: 'dark',
        height: 700,
        full: false,
        clip: '.grid > .tile',
        run: (page) => shotHero(page, state)
      }
    ])
  )
}

// Each shot renders one file. `full` means fullPage; the data-browser tables
// are effectively endless, so those are captured at viewport height instead.
// `clip` names an element to shoot instead of the page.
const SHOTS = {
  webapp: {
    file: 'webapp.png',
    theme: 'dark',
    height: 1000,
    full: true,
    run: shotWebapp
  },
  'space-map': {
    file: 'space-map.png',
    theme: 'dark',
    height: 1000,
    // The map view is exactly one viewport tall by construction, so there is
    // nothing below the fold for a full-page shot to reach.
    full: false,
    run: shotSpaceMap
  },
  'hf-radio': {
    file: 'hf-radio.png',
    theme: 'dark',
    height: 700,
    full: true,
    run: (page) => openWebapp(page, 'hf')
  },
  'plugin-configuration': {
    file: 'plugin-configuration.png',
    theme: 'light',
    height: 940,
    full: true,
    admin: true,
    run: shotPluginConfiguration
  },
  'data-browser': {
    file: 'data-browser.png',
    theme: 'light',
    height: 940,
    full: false,
    run: shotDataBrowser
  },
  notifications: {
    file: 'notifications.png',
    theme: 'light',
    height: 940,
    full: false,
    run: shotNotifications
  },
  ...heroShots()
}

main().catch((err) => {
  console.error(`\n${err && err.stack ? err.stack : err}`)
  process.exit(1)
})

async function main() {
  const wanted = argv.only
    ? argv.only.split(',').map((s) => s.trim())
    : Object.keys(SHOTS)
  for (const name of wanted) {
    if (!SHOTS[name])
      throw new Error(
        `unknown shot "${name}" — known: ${Object.keys(SHOTS).join(', ')}`
      )
  }

  const { chromium } = await importPlaywright()
  await mkdir(OUT_DIR, { recursive: true })

  // A server with security switched off has no login endpoint and treats
  // everyone as admin, so don't ask for credentials it cannot check.
  const loginStatus = await getJson(`${BASE}/skServer/loginStatus`)
  const needsLogin = loginStatus.authenticationRequired !== false
  const username = needsLogin
    ? argv.username ||
      process.env.SK_USERNAME ||
      (await prompt('Signal K username: '))
    : null
  const password = needsLogin
    ? argv.password ||
      process.env.SK_PASSWORD ||
      (await prompt(`Password for ${username}: `, { silent: true }))
    : null

  console.log(
    `\ncapturing from ${BASE}${username ? ` as ${username}` : ' (no auth required)'}`
  )

  const browser = await chromium.launch()
  const skipped = []
  try {
    // One login, reused: every context is built from the resulting cookie jar
    // so the admin UI is not re-authenticated five times.
    const authContext = await browser.newContext()
    const userLevel = await login(authContext, username, password)
    const storageState = await authContext.storageState()
    await authContext.close()

    const isAdmin = !needsLogin || userLevel === 'admin'
    console.log(
      `  session: ${needsLogin ? `${userLevel || 'unknown'} user` : 'security disabled'}\n`
    )

    for (const name of wanted) {
      const shot = SHOTS[name]
      if (shot.admin && !isAdmin) {
        skipped.push(name)
        console.log(
          `  – ${name} skipped: needs an admin login (/skServer/plugins is admin-gated)`
        )
        continue
      }
      const context = await browser.newContext({
        viewport: { width: WIDTH, height: shot.height },
        deviceScaleFactor: 1,
        // Playwright defaults to light. Our own webapp is dark-only in the
        // README shots; the admin UI has no dark mode, so it stays light.
        colorScheme: shot.theme,
        storageState
      })
      try {
        const page = await context.newPage()
        await shot.run(page)
        await page.evaluate(() => window.scrollTo(0, 0))
        const file = path.join(OUT_DIR, shot.file)
        await (shot.clip
          ? page.locator(shot.clip).first().screenshot({ path: file })
          : page.screenshot({ path: file, fullPage: shot.full }))
        console.log(`  ✓ ${name} → docs/screenshots/${shot.file}`)
      } finally {
        await context.close()
      }
    }
  } finally {
    await browser.close()
  }
  if (skipped.length)
    console.log(`\n${skipped.length} shot(s) skipped: ${skipped.join(', ')}`)
  console.log('\ndone. `git diff --stat docs/screenshots` to see what moved.')
}

// --- auth ------------------------------------------------------------------

// Logging in through the browser context's own request object (rather than a
// bare fetch) means both cookies the server sets land in the jar: the httpOnly
// JAUTHENTICATION one the API checks, and the readable login-info one the
// admin UI uses to decide it is logged in. Setting only the first leaves the
// admin UI rendering its logged-out sidebar.
async function login(context, username, password) {
  if (!username) return null
  const res = await context.request.post(`${BASE}/signalk/v1/auth/login`, {
    data: { username, password, rememberMe: true },
    failOnStatusCode: false
  })
  if (!res.ok()) {
    throw new Error(
      `login failed: ${res.status()} ${(await res.text()).trim()}`
    )
  }
  const status = await (
    await context.request.get(`${BASE}/skServer/loginStatus`)
  ).json()
  if (status.status !== 'loggedIn')
    throw new Error(`login did not stick: ${JSON.stringify(status)}`)
  return status.userLevel || null
}

// --- the plugin's own webapp -----------------------------------------------

// The webapp is four views behind one segmented nav, and only the one on
// screen renders -- so a shot names the view it wants and gets there through
// the hash, the same way the back button does. The default is the dashboard,
// which is what an unqualified `/` shows.
async function openWebapp(page, view = 'dashboard') {
  await page.goto(`${BASE}/${PLUGIN_ID}/#${view}`, { waitUntil: 'networkidle' })
  if (await page.locator('#authBanner.show').count()) {
    throw new Error(
      'the webapp is showing its "not logged in" banner — the session cookie did not reach it'
    )
  }
  // The page paints placeholders first and fills them in from several
  // independent fetches. The footer timestamps are written on every poll
  // whatever view is up -- they are page chrome, not a view's own output --
  // so they stay the honest "everything arrived" signal for any of the four.
  await page.waitForFunction(
    () => {
      const stamped = (id) => {
        const t = (document.getElementById(id)?.textContent || '').trim()
        return t !== '' && t !== '–' && t !== '—'
      }
      return stamped('tsScales') && stamped('tsAurora') && stamped('tsKp')
    },
    null,
    { timeout: 30000 }
  )
  await page.evaluate(() => document.fonts.ready)
  await settle(page)
}

async function shotWebapp(page) {
  await openWebapp(page)
}

// Serves one hero state's payloads in place of the server's own, then shoots
// the banner alone. Only the three paths the hero reads are intercepted, so
// the rest of the page stays live and honest about what it is showing.
async function shotHero(page, state) {
  const now = Date.now()
  const stamp = new Date(now - (state.ageMs || 0)).toISOString()
  const leaf = (value) => ({ value, timestamp: stamp })
  const levels = (of) =>
    Object.fromEntries(Object.entries(of).map(([k, v]) => [k, leaf(v)]))

  await page.route(/scales\/observations\/latest/, (route) =>
    route.fulfill({ json: levels(state.observed) })
  )
  await page.route(/scales\/observations\/24_hours_maximums/, (route) =>
    route.fulfill({ json: levels(state.peak24h) })
  )
  await page.route(/swpc\/kp$/, (route) =>
    route.fulfill({
      json: {
        observed: leaf(state.observedKp),
        forecast: { series: leaf(state.kp(now)) }
      }
    })
  )
  await openWebapp(page)
}

async function shotSpaceMap(page) {
  await openWebapp(page, 'map')
  // The grids come from the plugin's cache over one more fetch each, then
  // paint to a canvas; the footer only exists once at least one succeeded.
  await page.waitForSelector('#spaceMapCanvas', {
    state: 'visible',
    timeout: 30000
  })
  await page.waitForSelector('.map-view .map-footer', { timeout: 30000 })
  // Zoomed out, with a path scored across it: the close-up is the duller
  // picture and the straight-line great circle is the thing a reader has to
  // see to understand what the projection is for.
  await page.$eval('#mapZoom', (el) => {
    el.value = '180'
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const canvas = page.locator('#spaceMapCanvas')
  await canvas.scrollIntoViewIfNeeded()
  const box = await canvas.boundingBox()
  await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.3)
  await settle(page)
}

// --- the admin UI ----------------------------------------------------------

// The admin UI is a hash-routed SPA that does not survive a hard navigation
// straight to a deep route, so every admin shot walks in from the dashboard
// by clicking the sidebar, the same way a person would.
async function openAdmin(page) {
  await page.goto(`${BASE}/admin/`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.sidebar', { timeout: 30000 })
}

// Change the SPA's route the same way clicking a sidebar link does, by moving
// the hash on the already-loaded app. What the admin UI cannot survive is a
// *hard* navigation straight to a deep route, which is why openAdmin() loads
// the dashboard first — a hash change after that is routed client-side and is
// fine.
//
// Clicking the sidebar is the more faithful simulation but is not worth it:
// the section toggles are all href="#" with the routing done in JS, their
// accessible names absorb count badges ("Data" is really "Data1"), and the
// child links sit inside a collapsed `li.nav-dropdown` where the toggle
// intercepts the click.
async function navigate(page, route) {
  await page.evaluate((r) => {
    window.location.hash = `#${r}`
  }, route)
}

async function shotPluginConfiguration(page) {
  await openAdmin(page)
  await navigate(page, '/apps/configuration/-')
  const row = page.locator(`[data-plugin-id="${PLUGIN_ID}"]`)
  await row.waitFor({ state: 'visible', timeout: 30000 })
  await row.click()
  await page.waitForSelector('#plugin-config-header', { timeout: 30000 })
  await settle(page)
}

async function dataBrowserSearch(page, term, expectRow) {
  await openAdmin(page)
  await navigate(page, '/data/browser')
  const search = page.locator('#databrowser-search')
  await search.waitFor({ state: 'visible', timeout: 30000 })
  await search.fill(term)
  // Rows arrive over the websocket, and the search input is debounced through
  // a deferred value, so wait for the plugin's own data rather than a delay.
  await page
    .getByText(expectRow, { exact: false })
    .first()
    .waitFor({ timeout: 30000 })
  await settle(page)
}

async function shotDataBrowser(page) {
  await dataBrowserSearch(page, 'swpc', 'environment.noaa.swpc')
}

// Note the `environment.` in the middle: zone notifications are raised at
// `notifications.<the watched path>`, and the watched paths all live under
// environment.noaa.swpc — so it is notifications.environment.noaa.swpc.*, not
// notifications.noaa.swpc.*.
async function shotNotifications(page) {
  await dataBrowserSearch(
    page,
    'notifications.environment.noaa',
    'notifications.environment.noaa.swpc'
  )
}

// --- plumbing --------------------------------------------------------------

// Animations, chart tweening and the aurora raster all land a frame or two
// after the data does; this keeps the shots from catching a half-drawn one.
async function settle(page) {
  await page.waitForTimeout(1200)
}

async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok)
    throw new Error(
      `GET ${url} → ${res.status}. Is a Signal K server running there?`
    )
  return res.json()
}

async function importPlaywright() {
  try {
    return await import('playwright')
  } catch {
    throw new Error(
      "playwright is not installed. It is kept out of the plugin's own devDependencies\n" +
        'on purpose (the registry scores this repo with an offline `npm ci`), so install it here:\n\n' +
        `  npm install --prefix ${HERE}\n` +
        `  npx --prefix ${HERE} playwright install chromium\n`
    )
  }
}

function parseArgs(args) {
  const out = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!arg.startsWith('--')) continue
    const eq = arg.indexOf('=')
    if (eq > -1) out[arg.slice(2, eq)] = arg.slice(eq + 1)
    else out[arg.slice(2)] = args[++i]
  }
  return out
}

// readline echoes to its `output` stream, so a password prompt gets one that
// writes the question and swallows everything after it.
function prompt(question, { silent = false } = {}) {
  let muted = false
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) process.stdout.write(chunk, encoding)
      callback()
    }
  })
  const rl = readline.createInterface({
    input: process.stdin,
    output,
    terminal: true
  })
  return new Promise((resolve, reject) => {
    rl.question(question, (answer) => {
      rl.close()
      if (silent) process.stdout.write('\n')
      resolve(answer.trim())
    })
    rl.on('error', reject)
    muted = silent
  })
}
