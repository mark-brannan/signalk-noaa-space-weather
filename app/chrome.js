// The app's own framing: one script tag appended to a verbatim copy of
// public/index.html. It may say what the page is; it may not change what the
// page draws. Title, icon, manifest, service worker -- nothing else.

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

// Last, and failure-tolerant: an app that cannot register a worker is an app
// that works online. After load rather than during it, to keep the worker's
// install off the first paint's critical path.
if ('serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}
