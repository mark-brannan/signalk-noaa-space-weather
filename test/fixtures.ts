import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * The captured NOAA payloads these tests read, copied under test/fixtures/.
 * The corpus itself lives in the space-weather core, in its examples/, and is
 * not in the package it publishes: 2 MB of fixtures in every install, on a Pi,
 * for tests nobody runs there. So the plugin keeps the handful its own tests
 * need -- offline, and with no dependency on a core checkout being present.
 */
export function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)),
    'utf8'
  )
}

export function fixtureJson(name: string): any {
  return JSON.parse(fixture(name))
}

/**
 * One capture per parser: enough to prove the installed package parses with
 * no network, which is what offline.test.ts is for. Shape coverage across
 * every capture is the core's suite, not this one.
 */
export const ADVISORY_FIXTURES = ['advisory-outlook.2026_08_01.txt']
export const ALERT_FIXTURES = ['alerts.2026_08_01.json']
export const SCALES_FIXTURES = ['noaa-scales.2026_08_01.json']
export const KP_FORECAST_FIXTURES = [
  'noaa-planetary-k-index-forecast.2026_08_01.json'
]
export const AURORA_FIXTURES = ['ovation-aurora.2026_08_01.json']
export const OUTLOOK27_FIXTURES = ['27-day-outlook.2026_08_12.txt']
