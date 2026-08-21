// The four numbers an HF operator reads conditions in, in the order they are
// always spoken: "SFI 145, A 8, K 2" is how every club bulletin, contest
// forecast and the WWV broadcast states them, and SSN is the cycle context
// behind them.
//
// Built here rather than in index.html so that which terms appear, and at what
// precision, can be tested without a browser -- the same split hero.js makes.

/**
 * The strip's terms, always all four and always in this order.
 *
 * A term with no reading carries `value: null` rather than being dropped: the
 * phrase is read positionally, so a missing A index has to leave its gap
 * visible instead of shifting K into where A was.
 *
 * `digits` follows the page's existing precision for each number rather than
 * WWV's spoken one. WWV rounds K to an integer; the Kp tile a few rows down
 * shows a decimal, and rounding 4.7 up to "K 5" here would name a G1 storm
 * that the rest of the page does not.
 *
 * @param input.f107     10.7cm solar flux, in solar flux units
 * @param input.aIndex   estimated planetary A index
 * @param input.kp       observed planetary K index
 * @param input.sunspot  SESC sunspot number
 */
export function hfIndices({ f107, aIndex, kp, sunspot } = {}) {
  return [
    { key: 'SFI', value: reading(f107), digits: 0 },
    { key: 'A', value: reading(aIndex), digits: 0 },
    { key: 'K', value: reading(kp), digits: 1 },
    { key: 'SSN', value: reading(sunspot), digits: 0 }
  ]
}

/**
 * A gap, rather than a zero, for anything unreadable. Zero is a real value on
 * three of these four scales -- a sunspot number of 0 is a blank Sun, and an A
 * index of 0 a dead-quiet field -- so a missing reading shown as one would read
 * as the calmest possible conditions.
 */
function reading(value) {
  return Number.isFinite(value) ? value : null
}
