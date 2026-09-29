// The demo's own framing, and the only thing on the page that is not the
// shipping webapp (issue #239). scripts/build-demo.mjs appends one script tag
// for this module to a verbatim copy of public/index.html: the page a visitor
// gets is the page a boat owner gets, so nothing here may edit what that page
// draws -- it says what the page is, when the data behind it was captured,
// and where to get the real thing.
import { LIVE, snapshot } from './signalk.js'

const REPO = 'https://github.com/mark-brannan/signalk-noaa-space-weather'

// The two data layers are one URL apart, and the link between them is the
// honest way to say what each is: a reader on live data can go and see the
// saved moment, and a reader on the capture can go back to today.
const LIVE_URL = './'
const SNAPSHOT_URL = './?snapshot'

// Sized and ruled like the page's own footstrip, which it sits under: the
// page a visitor sees should read as the app, with the demo's framing as its
// last line rather than its first.
const STYLE = `
.demo-note {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--grid);
  color: var(--text-dim);
  font-size: 0.68rem;
  line-height: 1.5;
}
.demo-note a { color: var(--amber); }
.demo-note b { color: var(--text); font-weight: 600; }
.demo-note .demo-links { white-space: nowrap; margin-left: 6px; }
`

/**
 * UTC, to the minute: NOAA publishes in UTC and the capture is one moment, so
 * the reader's own zone would only suggest the page knows when they are.
 */
const captured = (iso) => {
  const date = new Date(iso)
  return isNaN(date)
    ? String(iso)
    : date.toUTCString().replace(/:\d\d GMT$/, ' UTC')
}

document.title = 'Space weather on a map — signalk-noaa-space-weather demo'

const icon = document.createElement('link')
icon.rel = 'icon'
icon.type = 'image/svg+xml'
icon.href = './icon.svg'
document.head.append(icon)

const style = document.createElement('style')
style.textContent = STYLE
document.head.append(style)

const plugin = `<a href="${REPO}">signalk-noaa-space-weather</a>`
const install = `<a href="${REPO}#installation">Run it on your boat</a>`
const links = (other) =>
  `<span class="demo-links">${other} · ${install}</span>`

const note = document.createElement('p')
note.className = 'demo-note'
// The position is the one thing on the page a reader would otherwise take as
// theirs: on the water the plugin reads the boat's own.
note.innerHTML = LIVE
  ? `Demo of the ${plugin} plugin, fetching live NOAA data from your browser` +
    ' for a stand-in position off Bergen.' +
    links(`<a href="${SNAPSHOT_URL}">Saved snapshot</a>`)
  : `<span id="demoCaptured">A saved NOAA snapshot — not live data.</span>` +
    ` Demo of the ${plugin} plugin, for a stand-in position off Bergen.` +
    links(`<a href="${LIVE_URL}">Live data</a>`)

document.querySelector('.shell').append(note)

// Last, and unawaited by everything above: a snapshot that fails to load
// should still leave the visitor with the note telling them what this is --
// which is why this catches rather than letting the rejection escape. The
// note already reads "A saved NOAA snapshot — not live data" without a date.
//
// Live has no equivalent to fill in: there is no one instant to name, because
// every product carries its own timestamp and the page already draws those.
if (!LIVE) {
  snapshot()
    .then((data) => {
      document.getElementById('demoCaptured').innerHTML =
        `A saved NOAA snapshot, captured <b>${captured(data.capturedAt)}</b> — not live data.`
    })
    .catch(() => {})
}
