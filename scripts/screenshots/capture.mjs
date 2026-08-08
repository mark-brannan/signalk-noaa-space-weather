#!/usr/bin/env node
//
// Regenerates docs/screenshots/*.png against a running Signal K server.
//
// Usage:
//   npm install --prefix scripts/screenshots
//   npx --prefix scripts/screenshots playwright install chromium
//   SK_USERNAME=admin SK_PASSWORD=... node scripts/screenshots/capture.mjs
//   node scripts/screenshots/capture.mjs --url http://localhost:3100 --only webapp,aurora-map
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
const WIDTH = 1400 // every checked-in screenshot is this wide; keep it that way

const argv = parseArgs(process.argv.slice(2))
const BASE = (
  argv.url ||
  process.env.SK_URL ||
  'http://localhost:3001'
).replace(/\/$/, '')

// Each shot renders one file. `full` means fullPage; the data-browser tables
// are effectively endless, so those are captured at viewport height instead.
const SHOTS = {
  webapp: {
    file: 'webapp.png',
    theme: 'dark',
    height: 1000,
    full: true,
    run: shotWebapp
  },
  'aurora-map': {
    file: 'aurora-map.png',
    theme: 'dark',
    height: 1000,
    full: true,
    run: shotAuroraMap
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
  }
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
        await page.screenshot({ path: file, fullPage: shot.full })
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

async function openWebapp(page) {
  await page.goto(`${BASE}/${PLUGIN_ID}/`, { waitUntil: 'networkidle' })
  if (await page.locator('#authBanner.show').count()) {
    throw new Error(
      'the webapp is showing its "not logged in" banner — the session cookie did not reach it'
    )
  }
  // The page paints placeholders first and fills them in from several
  // independent fetches. The footer timestamps are the last thing written, so
  // they are the honest "everything arrived" signal.
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

async function shotAuroraMap(page) {
  await openWebapp(page)
  await page.click('#mapToggle')
  // The grid comes from the plugin's cache over one more fetch, then paints to
  // a canvas; the footer only exists once that succeeded.
  await page.waitForSelector('#auroraMapCanvas', {
    state: 'visible',
    timeout: 30000
  })
  await page.waitForSelector('#mapBody .map-footer', { timeout: 30000 })
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
