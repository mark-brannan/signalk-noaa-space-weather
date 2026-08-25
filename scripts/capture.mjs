#!/usr/bin/env node
/**
 * Captures NOAA payloads into `examples/` as test fixtures.
 *
 *   node scripts/capture.mjs slow --commit    # daily, small, tracked
 *   node scripts/capture.mjs fast             # 3-hourly, into examples/captures/
 *
 * Deliberately outside the test suite: it needs the live service, and the
 * plugin registry scores this package with `npm test` under --net=none.
 *
 * The point is a corpus with *variety* in it. Issue #120 shipped a badge wired
 * to a field that reads 0 in every fixture we had, and the whole suite stayed
 * green because nothing in `examples/` disagreed with it. A fixture set where
 * every capture says the same thing makes every test that reads it vacuous.
 *
 * So this does not keep everything it fetches. Each endpoint declares an
 * "interest key" -- the handful of values that decide whether a payload is a
 * new *case* rather than a new *moment* -- and a capture is written only when
 * its key has never been seen before. Without that, dedupe is impossible:
 * every one of these payloads carries an issue time or a `time_tag`, so a
 * content hash marks a dead-quiet wwv bulletin as new eight times a day and
 * the corpus becomes a log.
 */
import { createHash } from 'crypto'
import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

const API = 'https://services.swpc.noaa.gov'
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Timeout per fetch. NOAA is usually fast; a hung socket must not wedge cron. */
const FETCH_TIMEOUT_MS = 30_000

const sha = (text) => createHash('sha1').update(text).digest('hex').slice(0, 12)

/**
 * Interest keys.
 *
 * Each returns the values that make a payload a distinct case. Anything not in
 * the key is a detail we are happy to have only one example of. A key that
 * throws (NOAA sent a shape we don't recognise) falls back to a content hash,
 * so an unparseable payload is always kept rather than silently dropped -- a
 * shape change is the most interesting capture there is.
 */

/** wwv: the severity words and the storm sentences, not the issue time. */
const wwvKey = (body) =>
  body
    .split('\n')
    .filter((line) => /has been|predicted to be|reaching the|are likely/.test(line))
    .map((line) => line.trim())
    .join(' | ')

/** noaa-scales: all five slots, which is exactly what #120 confused. */
const scalesKey = (body) => {
  const data = JSON.parse(body)
  return ['-1', '0', '1', '2', '3']
    .map((index) => {
      const slot = data[index] ?? {}
      return ['G', 'S', 'R']
        .map((letter) => {
          const cell = slot[letter] ?? {}
          // Forecast rows carry probabilities where observations carry a level.
          return cell.Scale ?? `${cell.Prob ?? ''}/${cell.MinorProb ?? ''}/${cell.MajorProb ?? ''}`
        })
        .join(',')
    })
    .join(' ')
}

/**
 * Flares: the flare's own begin and max class at full resolution, because that
 * pair is what identifies the event -- plus only the *letter* of the current
 * reading. The current class drifts within its letter every few minutes (B7.6
 * to B7.5), and keying on it would file every one of those as a new case.
 */
const flareKey = (body) => {
  const [flare] = JSON.parse(body)
  const letter = String(flare?.current_class ?? '').charAt(0)
  return `${letter} ${flare?.begin_class} ${flare?.max_class}`
}

/** Protons: the order of magnitude per channel, not the exact flux. */
const protonKey = (body) => {
  const latest = {}
  for (const row of JSON.parse(body)) latest[row.energy] = row.flux
  return Object.entries(latest)
    .sort()
    .map(([energy, flux]) => `${energy}:${Math.floor(Math.log10(Math.max(flux, 1e-6)))}`)
    .join(' ')
}

/** Solar wind: 50 km/s and 1 nT buckets. Finer than that is the same weather. */
const windSpeedKey = (body) => {
  const [row] = JSON.parse(body)
  return String(Math.round((row?.proton_speed ?? 0) / 50) * 50)
}
const windMagKey = (body) => {
  const [row] = JSON.parse(body)
  return `${Math.round(row?.bt ?? 0)} ${Math.round(row?.bz_gsm ?? 0)}`
}

/** DRAP: the two message lines and whether a warning or recovery time is set. */
const drapKey = (body) =>
  body
    .split('\n')
    .filter((line) => /X-RAY Message|X-RAY Warning|Proton Message|Recovery Time/.test(line))
    .map((line) => line.trim())
    .join(' | ')

/** Text bulletins: the body with the issue timestamp lines removed. */
const bulletinKey = (body) =>
  sha(
    body
      .split('\n')
      .filter((line) => !/^:(Issued|Product)|^#/.test(line))
      .join('\n')
      .trim()
  )

/** Alerts: the set of message codes in force, not the 30-day archive's churn. */
const alertsKey = (body) => {
  const codes = new Set()
  for (const alert of JSON.parse(body)) {
    const match = /Space Weather Message Code:\s*(\S+)/i.exec(alert.message ?? '')
    if (match) codes.add(match[1])
  }
  return [...codes].sort().join(',')
}

/** Kp forecast: the peak Kp and which G levels appear, not the rolling window. */
const kpForecastKey = (body) => {
  const rows = JSON.parse(body)
  const peak = Math.max(...rows.map((row) => Number(row.kp) || 0))
  const scales = [...new Set(rows.map((row) => row.noaa_scale).filter(Boolean))].sort()
  return `${peak} ${scales.join(',')}`
}

/** X-ray flux: the peak per band as a flare class, which is what a reader sees. */
const xrayFluxKey = (body) => {
  const peak = {}
  for (const row of JSON.parse(body)) {
    peak[row.energy] = Math.max(peak[row.energy] ?? 0, Number(row.flux) || 0)
  }
  return Object.entries(peak)
    .sort()
    .map(([band, flux]) => `${band}:${Math.floor(Math.log10(Math.max(flux, 1e-12)))}`)
    .join(' ')
}

/**
 * F10.7 in 5 sfu buckets -- a one-unit drift is the same solar activity.
 *
 * Picks the newest "Noon" entry rather than trusting the array's order, the
 * same way `parseF107` does: the feed is not sorted, and its last element is
 * routinely weeks old.
 */
const f107Key = (body) => {
  let latest = null
  for (const row of JSON.parse(body)) {
    if (row?.reporting_schedule !== 'Noon') continue
    if (!latest || row.time_tag > latest.time_tag) latest = row
  }
  return String(Math.round((Number(latest?.flux) || 0) / 5) * 5)
}

/** JSON payloads with no better key: every value except the timestamps. */
const jsonKey = (body) =>
  sha(JSON.stringify(JSON.parse(body), (key, value) => (/time_tag|time_stamp/i.test(key) ? undefined : value)))

/**
 * `slow` lands in `examples/` and is committed: daily or slower, and small
 * enough that a year of them is a rounding error in the repo.
 *
 * `fast` lands in `examples/captures/`, which is gitignored: sub-daily, or
 * large enough that tracking every distinct case would bloat the tree. Promote
 * an interesting one by hand with `git mv`.
 */
const ENDPOINTS = [
  // --- slow: daily, tracked -------------------------------------------------
  ['slow', '/text/27-day-outlook.txt', '27-day-outlook', 'txt', bulletinKey],
  ['slow', '/text/advisory-outlook.txt', 'advisory-outlook', 'txt', bulletinKey],
  ['slow', '/text/daily-solar-indices.txt', 'daily-solar-indices', 'txt', bulletinKey],
  ['slow', '/json/f107_cm_flux.json', 'f107_cm_flux', 'json', f107Key],
  ['slow', '/json/goes/primary/xray-flares-latest.json', 'xray-flares-latest', 'json', flareKey],

  // --- fast: 3-hourly, gitignored -------------------------------------------
  ['fast', '/text/wwv.txt', 'wwv', 'txt', wwvKey],
  ['fast', '/products/noaa-scales.json', 'noaa-scales', 'json', scalesKey],
  ['fast', '/products/noaa-planetary-k-index-forecast.json', 'noaa-planetary-k-index-forecast', 'json', kpForecastKey],
  ['fast', '/products/summary/solar-wind-speed.json', 'solar-wind-speed', 'json', windSpeedKey],
  ['fast', '/products/summary/solar-wind-mag-field.json', 'solar-wind-mag-field', 'json', windMagKey],
  ['fast', '/products/alerts.json', 'alerts', 'json', alertsKey],
  ['fast', '/text/drap_global_frequencies.txt', 'drap-global-frequencies', 'txt', drapKey],
  ['fast', '/json/goes/primary/integral-protons-6-hour.json', 'integral-protons-6-hour', 'json', protonKey],
  ['fast', '/json/goes/primary/xrays-6-hour.json', 'xrays-6-hour', 'json', xrayFluxKey]
]

/** Where a group's captures land, and whether they are tracked. */
const GROUPS = {
  slow: { dir: 'examples', tracked: true },
  fast: { dir: join('examples', 'captures'), tracked: false }
}

async function fetchText(path) {
  const response = await fetch(API + path, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  })
  // Without this an error page is written to disk as though it were a fixture,
  // which is worse than capturing nothing: it looks like data until it is read.
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`)
  return response.text()
}

/** Keys already represented in `dir`, so a case is captured once and not again. */
function seenKeys(dir, prefix, key) {
  let names
  try {
    names = readdirSync(dir)
  } catch {
    return new Set()
  }
  const seen = new Set()
  for (const name of names) {
    if (!name.startsWith(prefix + '.')) continue
    // A file named `<prefix>.<date>.<ext>` for a *different* product would be
    // caught by the dot: `wwv.` never prefixes `wwv-something`.
    let body
    try {
      body = readFileSync(join(dir, name), 'utf8')
    } catch {
      continue
    }
    seen.add(safeKey(key, body))
  }
  return seen
}

/** A key function that throws means an unrecognised shape -- always interesting. */
function safeKey(key, body) {
  try {
    const value = key(body)
    return value === undefined || value === null ? sha(body) : String(value)
  } catch {
    return 'unparseable:' + sha(body)
  }
}

/** `<prefix>.YYYY_MM_DD.<ext>`, matching the fixtures already in `examples/`. */
function fileName(prefix, ext, existing) {
  const now = new Date()
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0')
  ].join('_')
  let name = `${prefix}.${stamp}.${ext}`
  // Two distinct cases can land on one UTC day -- a storm arriving is exactly
  // when that happens, and it is the day we least want to overwrite.
  let suffix = 2
  while (existing.has(name)) name = `${prefix}.${stamp}_${suffix++}.${ext}`
  return name
}

function git(args, cwd = REPO) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

/**
 * Commits only the paths just written, named explicitly.
 *
 * Cron runs this in a working tree somebody is also using. A bare `git commit`
 * or a `git add .` there would sweep up work in progress, so every path is
 * passed to both `add` and `commit`. `--no-verify` skips `.husky/pre-commit`,
 * which auto-patch-bumps `package.json` -- without it every nightly capture
 * would tag and publish a release.
 */
function commit(paths) {
  if (!paths.length) return
  const gitDir = resolve(REPO, git(['rev-parse', '--git-dir']))
  const inProgress = ['rebase-merge', 'rebase-apply', 'MERGE_HEAD', 'CHERRY_PICK_HEAD'].find(
    (marker) => existsSync(join(gitDir, marker))
  )
  if (inProgress) {
    console.error(`skipping commit: ${inProgress} in progress`)
    return
  }
  git(['add', '--', ...paths])
  const subject = `test: capture NOAA fixtures (${paths.length} new case${paths.length === 1 ? '' : 's'})`
  git(['commit', '--no-verify', '-m', subject, '--', ...paths])
  console.log(`committed ${paths.length} file(s)`)
}

async function main() {
  const [group, ...flags] = process.argv.slice(2)
  const config = GROUPS[group]
  if (!config) {
    console.error(`usage: capture.mjs <${Object.keys(GROUPS).join('|')}> [--commit]`)
    process.exit(2)
  }

  const dir = join(REPO, config.dir)
  mkdirSync(dir, { recursive: true })
  const existing = new Set(readdirSync(dir))
  const written = []
  let failures = 0

  for (const [endpointGroup, path, prefix, ext, key] of ENDPOINTS) {
    if (endpointGroup !== group) continue
    let body
    try {
      body = await fetchText(path)
    } catch (error) {
      // One bad endpoint must not cost us the rest of the run.
      console.error(`${prefix}: fetch failed -- ${error.message}`)
      failures++
      continue
    }

    const thisKey = safeKey(key, body)
    if (seenKeys(dir, prefix, key).has(thisKey)) {
      console.log(`${prefix}: no new case (${thisKey.slice(0, 40)})`)
      continue
    }

    const name = fileName(prefix, ext, existing)
    writeFileSync(join(dir, name), body)
    existing.add(name)
    written.push(join(config.dir, name))
    console.log(`${prefix}: NEW ${name} (${thisKey.slice(0, 40)})`)
  }

  if (config.tracked && flags.includes('--commit')) commit(written)
  // Exit non-zero only if nothing worked, so cron mail means something.
  if (failures && !written.length) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
