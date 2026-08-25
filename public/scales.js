// What the Storm Scales card says, decided separately from how it is drawn.
//
// This is where issue #120 lived: the card read the instantaneous G/S/R
// sample instead of the 24-hour maximum, so it showed R0 through a live R2
// and G0 through a G4, and nothing in the suite could see it because the
// choice of path was a string inline in index.html's fetch list. Here the
// card names the endpoints it draws from -- see SCALES_CARD_SOURCES -- so a
// fixture can be pushed through the plugin's own transform and out the other
// side as the numbers the badges show.
//
// Same split as hero.js: the decision is testable without a browser, the
// wording and markup stay in index.html.
import { leafTime, leafValue } from './signalk.js'

/** The three scales, in the order the card lists them. */
export const LETTERS = ['G', 'S', 'R']

/**
 * Which entry of the fetched endpoint table each input comes from.
 *
 * The card resolves its own inputs rather than being handed three nodes by
 * the caller, because "which path feeds this element" is exactly the thing
 * that was wrong and unwatched. Passing the wrong one is no longer possible
 * at the call site; it would have to be changed here, where the tests are.
 */
export const SCALES_CARD_SOURCES = {
  // The rolling 24-hour maximum, never the instantaneous sample --
  // scales-source.js carries that argument in full.
  observed: 'scalesObserved',
  forecast: 'scalesForecast',
  flare: 'xrayFlare'
}

/** NOAA's three forecast days, as the plugin publishes them. */
const DAY_KEYS = ['1day', '2day', '3day']

/**
 * The card's numbers, from the endpoint table `readAll` produced.
 *
 * Probabilities arrive as 0-1 ratios, because Signal K wants them that way,
 * and the card draws "12%" labels. Converting here rather than in the markup
 * keeps it to one place instead of three call sites.
 *
 * Every value is a number or `null`; never `0` standing in for "no reading",
 * since 0 is a real and common level on all three scales.
 */
export function scalesCard(data) {
  const observedNode = data?.[SCALES_CARD_SOURCES.observed]
  const forecastNode = data?.[SCALES_CARD_SOURCES.forecast]
  const flareNode = data?.[SCALES_CARD_SOURCES.flare]

  const observed = Object.fromEntries(
    LETTERS.map((letter) => [letter, numberOrNull(observedNode?.[letter])])
  )

  return {
    observed,
    // The card's own timestamp. `time` is NOAA's stamp on the payload and G
    // is the first leaf published under it; either answers "how old is this",
    // and a product that failed mid-publish may have only one of them.
    observedAt: leafTime(observedNode?.G) || leafTime(observedNode?.time),
    // Labelled "Solar Flare Class" on the card, but issue #122 measured what
    // this path actually carries: the background X-ray flux at poll time, not
    // the class of any flare. Passed through unchanged here -- fixing what is
    // published is #122's job, and renaming it only here would leave the card
    // and the Signal K path disagreeing.
    flareClass: leafValue(flareNode?.class) ?? null,
    forecast: DAY_KEYS.map((key) => forecastDay(forecastNode?.[key]))
  }
}

/**
 * One forecast column. G is a predicted level; S and R are probabilities of
 * reaching a level, which is why the three cells do not look alike.
 *
 * `at` is the *value* at `<n>day.time` -- NOAA's own per-day DateStamp -- not
 * the leaf's timestamp. All three days publish in one update, so a timestamp
 * would label every column identically.
 */
function forecastDay(node) {
  return {
    at: leafValue(node?.time) ?? null,
    G: numberOrNull(node?.G),
    sProbability: percent(node?.S?.probability),
    rMinorProbability: percent(node?.R?.minorProbability),
    rMajorProbability: percent(node?.R?.majorProbability)
  }
}

function numberOrNull(node) {
  const value = leafValue(node)
  return Number.isFinite(value) ? value : null
}

function percent(node) {
  const ratio = numberOrNull(node)
  return ratio === null ? null : ratio * 100
}
