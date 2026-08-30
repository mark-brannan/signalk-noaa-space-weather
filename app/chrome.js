// The app's own framing, and the only thing on the page that is not the
// shipping webapp. scripts/build-app.mjs appends one script tag for this
// module to a verbatim copy of public/index.html: the page a reader gets is
// the page a boat owner gets, so nothing here may change what that page draws
// -- it says where the readings are indexed, offers the location prompt again
// after a refusal, and installs the service worker.
import {
  onPosition,
  position,
  positionDenied,
  requestPosition
} from './signalk.js'

const REPO = 'https://github.com/mark-brannan/signalk-noaa-space-weather'

const STYLE = `
.app-note {
  border: 1px solid var(--grid);
  border-radius: 4px;
  background: var(--panel);
  box-shadow: var(--shadow);
  padding: 10px 14px;
  margin-bottom: 12px;
  color: var(--text-dim);
  font-family: var(--font-round);
  font-size: 0.82rem;
  line-height: 1.5;
  display: flex;
  gap: 12px;
  align-items: baseline;
  flex-wrap: wrap;
}
.app-note p { margin: 0; }
.app-note a { color: var(--amber); }
.app-note b { color: var(--text); font-weight: 600; }
.app-where { flex: 1 1 16rem; }
.app-locate {
  font: inherit;
  color: var(--text);
  background: transparent;
  border: 1px solid var(--grid);
  border-radius: 3px;
  padding: 4px 10px;
  cursor: pointer;
}
.app-locate:hover { border-color: var(--amber); color: var(--amber); }
`

/** Degrees with a hemisphere letter -- the form a chart plotter shows. */
const degrees = (value, [positive, negative]) =>
  `${Math.abs(value).toFixed(1)}°${value >= 0 ? positive : negative}`

const where = (fix) =>
  fix ? `${degrees(fix.latitude, 'NS')} ${degrees(fix.longitude, 'EW')}` : null

document.title = 'Space Weather'

const icon = document.createElement('link')
icon.rel = 'icon'
icon.type = 'image/svg+xml'
icon.href = './icon.svg'
document.head.append(icon)

const manifest = document.createElement('link')
manifest.rel = 'manifest'
manifest.href = './manifest.webmanifest'
document.head.append(manifest)

const style = document.createElement('style')
style.textContent = STYLE
document.head.append(style)

const note = document.createElement('div')
note.className = 'app-note'
note.innerHTML = `
  <p class="app-where"></p>
  <button class="app-locate" type="button" hidden>Use my location</button>
`
const shell = document.querySelector('.shell')
shell.prepend(note)

const line = note.querySelector('.app-where')
const button = note.querySelector('.app-locate')
button.addEventListener('click', () => requestPosition())

/**
 * Three states, and each says what it is rather than implying a fix that is
 * not there: a fix, a refusal we can offer to retry, and the moment before
 * either. The global maps draw in all three -- it is only the readings at a
 * place that wait -- so none of these is an error banner.
 */
function draw() {
  const fix = where(position())
  if (fix) {
    line.innerHTML =
      `NOAA space weather at <b>${fix}</b>, fetched live in this tab. ` +
      `<a href="${REPO}">What this is</a>.`
  } else if (positionDenied()) {
    line.innerHTML =
      'Showing the global maps only — nothing is indexed to a position yet. ' +
      '<a href="' +
      REPO +
      '">What this is</a>.'
  } else {
    line.textContent = 'Finding your location…'
  }
  button.hidden = !positionDenied()
}

draw()
onPosition(draw)

// Last, and failure-tolerant: an app that cannot register a worker is an app
// that works online, which is every other app. Registering after load rather
// than during it keeps the worker's install off the first paint's critical
// path.
if ('serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}
