// The demo's own framing, and the only thing on the page that is not the
// shipping webapp (issue #239). scripts/build-demo.mjs appends one script tag
// for this module to a verbatim copy of public/index.html: the page a visitor
// gets is the page a boat owner gets, so nothing here may edit what that page
// draws -- it says what the page is, when the data behind it was captured,
// and where to get the real thing.
import { LIVE, snapshot } from './signalk.js'

const REPO = 'https://github.com/mark-brannan/signalk-noaa-space-weather'

// The two data layers are one URL apart, and the link between them is the
// honest way to say what each is: a reader who doubts a saved capture can go
// and watch the same page fetch NOAA itself, and a reader who lands on the
// live one can go back to the moment that was worth saving.
const LIVE_URL = './?live'
const SNAPSHOT_URL = './'

const STYLE = `
.demo-note {
  border: 1px solid var(--grid);
  border-radius: 4px;
  background: var(--panel);
  box-shadow: var(--shadow);
  padding: 12px 16px;
  margin-bottom: 12px;
  color: var(--text-dim);
  font-family: var(--font-round);
  font-size: 0.82rem;
  line-height: 1.5;
}
.demo-note p { margin: 0 0 6px; }
.demo-note p:last-child { margin-bottom: 0; }
.demo-note a { color: var(--amber); }
.demo-note b { color: var(--text); font-weight: 600; }
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

const note = document.createElement('div')
note.className = 'demo-note'
// Above the status bar rather than below the page: a visitor who reads
// nothing else still has to learn where these numbers came from.
note.innerHTML = `
  <p>
    NOAA's radio-blackout model and the aurora oval, drawn over a coastline,
    and what the sun was doing to the marine HF bands at one position. No
    install and no server: this is the webapp of the
    <a href="${REPO}">signalk-noaa-space-weather</a> Signal K plugin, running
    ${
      LIVE
        ? 'in this tab against NOAA itself.'
        : 'on a saved NOAA capture.'
    }
  </p>
  <p id="demoCaptured">${
    LIVE
      ? 'Live data — the plugin\'s own code, fetching NOAA from your browser.' +
        ` <a href="${SNAPSHOT_URL}">See the saved snapshot instead</a>.`
      : 'A saved NOAA snapshot — not live data.' +
        ` <a href="${LIVE_URL}">Fetch it live instead</a>.`
  }</p>
  <p>
    The boat is a stand-in: the position everything here is worked out from —
    the aurora probability, the HF bands, the mark on the map — is a viewpoint
    chosen for this page, not a vessel anyone is on. On the water the plugin
    reads your own.
  </p>
  <p>
    Like it? <a href="${REPO}#installation">Run it on your own boat</a> — it
    installs from the Signal K app store, and then reads NOAA continuously
    from your own position.
  </p>
`

const shell = document.querySelector('.shell')
shell.prepend(note)

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
        `A saved NOAA snapshot, captured <b>${captured(data.capturedAt)}</b> — not live data.` +
        ` <a href="${LIVE_URL}">Fetch it live instead</a>.`
    })
    .catch(() => {})
}
