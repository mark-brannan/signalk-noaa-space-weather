// Everything the plugin configuration panel decides, with no React and no DOM.
//
// Splitting it out is the same trade public/hero.js makes: the panel renders
// inside the admin UI, which needs a browser and a logged-in server, and none
// of the decisions below need either. remoteEntry.js is the rendering half.
//
// Some of what is here is a copy of a rule that lives in src/, on purpose: the
// panel is served as plain JavaScript out of public/ and cannot import from
// dist/. test/config-panel.test.ts pins each copy against the original over its
// whole input domain, so a divergence fails the build rather than shipping a
// panel that describes something the plugin does not do.

/**
 * What an absent key means, mirroring the `default` on each property of
 * `schema` in src/config.ts.
 *
 * The saved configuration is shown as-is with these filled in, which is what
 * the generated form did: migration of the superseded keys belongs to
 * `settingsFrom`, on the server, and stays there. `settingsDiffer` below is how
 * the panel finds out what it made of them.
 */
export const DEFAULTS = Object.freeze({
  sendAdvisoryOutlook: true,
  alarmLevel: 5,
  auroraEnabled: false,
  auroraInterval: 120,
  updateInterval: 60
})

/** Mirrors `NoaaScaleNames` in src/parse.ts, less the zero entry. */
export const SCALE_NAMES = Object.freeze([
  null,
  'Minor',
  'Moderate',
  'Strong',
  'Severe',
  'Extreme'
])

/**
 * Wire sizes per fetch, from the payload-size table in docs/noaa-products.md.
 * They are the only measured numbers the panel holds, and it holds them so
 * that what it shows a user is arithmetic rather than a sentence: the daily
 * and monthly figures below move with the intervals, which is the whole
 * reason this panel exists. Re-measure with scripts/measure-noaa.mjs.
 */
export const AURORA_WIRE_KB = 145
export const OTHER_WIRE_KB = 5

const MINUTES_PER_DAY = 24 * 60
/** Long enough to be worth quoting, short enough that every month has one. */
export const DAYS_PER_MONTH = 30

/**
 * A minute interval as the plugin will read it. Same rule as `minutes` in
 * src/config.ts, because a half-typed or cleared number field must cost what
 * the plugin will actually spend, not NaN and not zero.
 */
export function minutes(raw, fallback) {
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/** Kilobytes a day, split the way the two intervals split the cost. */
export function dailyKb(settings) {
  const aurora = settings.auroraEnabled
    ? (MINUTES_PER_DAY /
        minutes(settings.auroraInterval, DEFAULTS.auroraInterval)) *
      AURORA_WIRE_KB
    : 0
  const other =
    (MINUTES_PER_DAY /
      minutes(settings.updateInterval, DEFAULTS.updateInterval)) *
    OTHER_WIRE_KB
  return { aurora, other, total: aurora + other }
}

/**
 * Bytes at the scale a boat owner buys them in. Satellite airtime is sold by
 * the megabyte, so KB below a megabyte and GB above a thousand keeps every
 * figure comparable to a plan without arithmetic.
 */
export function formatKb(kb) {
  if (kb >= 1024 * 1024) return `${(kb / 1024 / 1024).toFixed(2)} GB`
  if (kb >= 1024) return `${(kb / 1024).toFixed(kb < 10 * 1024 ? 2 : 1)} MB`
  return `${Math.round(kb)} KB`
}

/**
 * The alarm-level choices, mirroring the `oneOf` on `alarmLevel` in
 * src/config.ts. Quietest first, so reading down the list turns the plugin up.
 */
export const ALARM_LEVEL_OPTIONS = Object.freeze([
  { value: 5, rate: 'once or twice a decade' },
  { value: 4, rate: 'once or twice a year' },
  { value: 3, rate: 'several times a year' },
  { value: 2, rate: 'a couple of times a month' },
  { value: 1, rate: 'most weeks' }
])

/**
 * A NOAA scale value is one of five integers; mirrors `scaleValue` in
 * src/config.ts so the panel cannot offer a level the plugin would discard.
 */
export function scaleValue(raw, fallback) {
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 5
    ? parsed
    : fallback
}

/**
 * The saved configuration as five values the panel can render, and as five
 * values `settingsFrom` will read back unchanged. Superseded keys are left
 * alone rather than translated here; `settingsDiffer` is where the panel finds
 * out what they turned into.
 */
export function panelSettings(configuration) {
  const c = configuration ?? {}
  return {
    sendAdvisoryOutlook: c.sendAdvisoryOutlook !== false,
    alarmLevel: scaleValue(c.alarmLevel, DEFAULTS.alarmLevel),
    auroraEnabled: c.auroraEnabled === true,
    auroraInterval: minutes(c.auroraInterval, DEFAULTS.auroraInterval),
    updateInterval: minutes(c.updateInterval, DEFAULTS.updateInterval)
  }
}

/**
 * Whether the running plugin disagrees with what the panel would show for a
 * saved configuration -- which happens exactly when a key it has never been
 * saved with is being supplied by `settingsFrom`, either as a default or as a
 * migration of a superseded key. Saying so is the difference between a screen
 * that describes this boat and one that describes a fresh install.
 *
 * `running` is null until the status route answers, and an unreachable server
 * must not manufacture a disagreement, so that case is "no".
 */
export function settingsDiffer(shown, running) {
  if (!running) return false
  return Object.keys(shown).some((key) => shown[key] !== running[key])
}
