#!/usr/bin/env node
/**
 * Records each new issue of the 27-day outlook, to settle two open questions
 * in docs/noaa-products.md: whether it is issued on a Monday every week, and
 * how tightly the issue time clusters.
 *
 *   node scripts/watch-27day.mjs          # one check; save if the issue is new
 *   node scripts/watch-27day.mjs --report # print what has been collected
 *
 * Meant to be run on a timer a few times a day and then deleted once the
 * questions are answered -- it is measurement scaffolding, not part of the
 * plugin. Nothing here is imported by src/ and nothing in the test suite runs
 * it; the suite must stay offline.
 *
 * Only writes when the `:Issued:` line changes, so running it more often than
 * NOAA publishes costs 451 B and produces no files.
 *
 * The log is gitignored working state; the fixtures it saves are not, and each
 * one states its own issue time, so the log can be rebuilt from them if lost.
 * The conclusion belongs in docs/noaa-products.md, not here.
 */
import { readFileSync, writeFileSync, readdirSync, appendFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EXAMPLES = join(ROOT, 'examples')
const LOG = join(EXAMPLES, '27-day-outlook.issues.log')
const URL = 'https://services.swpc.noaa.gov/text/27-day-outlook.txt'

/** ':Issued: 2026 Aug 10 0153 UTC' -> a Date, or null. */
function issuedAt(text) {
  const line = text.match(/^:Issued: *(.+)$/m)
  if (!line) return null
  const parts = line[1].match(/(\d{4} [A-Za-z]{3} \d{1,2}) (\d{2})(\d{2}) UTC/)
  if (!parts) return null
  const at = new Date(`${parts[1]} ${parts[2]}:${parts[3]} UTC`)
  return isNaN(at.getTime()) ? null : at
}

/** Issue timestamps already recorded, read back from the log. */
function seen() {
  try {
    return new Set(
      readFileSync(LOG, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((row) => row.split('\t')[0])
    )
  } catch {
    return new Set()
  }
}

/**
 * Fixtures in this repo are named for the day they were captured, not the day
 * the payload says it was issued -- see the advisory fixtures, whose issue
 * dates are days earlier than their names. Keep to that.
 */
function fixtureName() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '_')
  const base = `27-day-outlook.${today}`
  const taken = readdirSync(EXAMPLES)
  if (!taken.includes(`${base}.txt`)) return `${base}.txt`
  let n = 2
  while (taken.includes(`${base}_${n}.txt`)) n++
  return `${base}_${n}.txt`
}

function report() {
  let log = ''
  try {
    log = readFileSync(LOG, 'utf8')
  } catch {
    console.log('No issues recorded yet.')
    return
  }
  const rows = log.trim().split('\n').filter(Boolean)
  console.log(`${rows.length} issue(s) recorded:\n`)
  for (const row of rows) console.log('  ' + row)

  const days = new Set(rows.map((r) => r.split('\t')[1]))
  const times = rows.map((r) => r.split('\t')[2])
  console.log(
    `\nweekday(s): ${[...days].join(', ')}` +
      `\nissue time(s) UTC: ${times.join(', ')}` +
      (rows.length < 4
        ? '\n\nToo few issues to conclude anything. Keep collecting.'
        : '')
  )
}

/**
 * Enough issues to tell a pattern from a coincidence. The watch stops itself
 * here rather than running forever: this is scaffolding for one question, and
 * a timer nobody remembers installing is worse than no measurement.
 */
const TARGET_ISSUES = 6

async function check() {
  if (seen().size >= TARGET_ISSUES) {
    console.log(
      `${seen().size} issues collected -- enough. Run with --report, write` +
        ' the answer into docs/noaa-products.md, then remove the cron entry' +
        ' and delete this script.'
    )
    return
  }

  const response = await fetch(URL)
  if (!response.ok) {
    console.error(`HTTP ${response.status} from ${URL}`)
    process.exitCode = 1
    return
  }
  const text = await response.text()
  const at = issuedAt(text)
  if (!at) {
    console.error('Could not read the :Issued: line -- shape may have changed.')
    process.exitCode = 1
    return
  }

  if (seen().has(at.toISOString())) {
    console.log(`No new issue (still ${at.toISOString()}).`)
    return
  }

  const name = fixtureName()
  writeFileSync(join(EXAMPLES, name), text)
  const weekday = at.toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC'
  })
  const time = at.toISOString().slice(11, 16)
  appendFileSync(LOG, `${at.toISOString()}\t${weekday}\t${time}\t${name}\n`)
  console.log(`New issue saved: ${name} (${weekday} ${time} UTC)`)
}

if (process.argv.includes('--report')) report()
else await check()
