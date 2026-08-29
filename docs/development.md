# Development environment

How to run this plugin against a real Signal K server on this machine, and the
two scripts that stand its webapp up without one. [`CLAUDE.md`](../CLAUDE.md)
keeps the handful of things that bite before you get this far — the shared
servers and their lock files, the branch the dev server follows, the ports —
and points here for the procedures.

Whenever Claude makes a local change likely to affect the UI, show it
running with 4 links, each one a bare URL in a list:

- mock rig on `localhost`
- test rig on `localhost`
- mock rig on a LAN- or Tailscale-reachable URL
- test rig on a LAN- or Tailscale-reachable URL

Windows and phone disagree on which URL resolves — `localhost` works from the
server's own machine but not the phone, and the LAN/Tailscale URL is the
reverse on Windows — so give both forms rather than picking one.

This is the norm: show all 4 links. Skip some only in these two cases:

- **UI-only change** (styling, layout, control wiring, most webapp changes)
  — show just the mock rig.
- **Backend-only change** (data handling, Signal K plugin code) — show just
  the test rig.

Anything else: show all 4.

Share it before re-running the test suite, not after — Mark can be looking at
it while the tests run. Start it
the way this file documents, with the flags this file documents — a port or
`--upstream` when the situation calls for one, never an ad hoc proxy, wrapper
or one-off invented on the spot. Find this machine's addresses with `hostname -I` (LAN is usually
the `192.168.x.x` one; Tailscale is the `100.x.x.x` one) and substitute
directly into the URL below — don't paste `127.0.0.1` and call it done.

## Running against a real server ("test rig", "dev rig")

A Docker Signal K installed from the published npm package backs any
"browse the live server" research — read-only checks against real, released
behavior, not this checkout's uncommitted changes. Don't restart,
reconfigure, or write through it without checking who else might be using
it first.

**Ports 3000 and 3001 belong to `~/symphony`, and its compose files are the
authority — read them, don't guess.** `compose-signalk.yml` publishes Signal K
on **3000** (the SignalK convention; mDNS and clients default to it) and
`compose-grafana.yml` publishes Grafana on **3001**. That allocation is
deliberate and each file carries the reason inline. A running container can
lag it — port bindings are fixed when a container is *created*, so a
`docker start` on an old container keeps the old mapping and the live box
disagrees with the committed intent until it is recreated. Trust the compose
file over `docker ps`, and check both before concluding anything about a port.

`~/signalk-server` and `~/.signalk` already exist on this machine and are
meant to stay — **check for them before doing anything else here, don't
re-clone or rebuild from scratch.** `~/signalk-server` is a persistent clone
of the real [SignalK/signalk-server
repo](https://github.com/SignalK/signalk-server), built once
(`npm install && npm run build:all`, per its own
[CONTRIBUTING.md](https://github.com/SignalK/signalk-server/blob/master/CONTRIBUTING.md#running-the-development-server)).
If it is genuinely missing (check first — `ls ~/signalk-server/dist` — don't
assume from a failed command), set it up per that CONTRIBUTING.md; otherwise
`git pull` and rebuild only when picking up upstream changes, never a fresh
clone.

**`~/.signalk` is the integration environment.** It is the default config
directory, so plain `bin/signalk-server` uses it with no environment variables
at all. **It listens on 3010**, set as `port` in its own `settings.json` —
bound to all interfaces (`ss -tlnp | grep 3010` shows `*:3010`, not
`127.0.0.1:3010`), so it's already reachable at
`http://<lan-or-tailscale-ip>:3010/` from another device with no proxy needed
— get the address with `hostname -I` and use that form, per the note at the
top of this file. Clear of both 3000 and 3001 whichever way symphony's stack is currently
running, which is the whole point of picking it. 3000 is the signalk-server
default and collides with too much else, so nothing here should be on it.
`PORT` still overrides, which is what the `nmea-from-file`
recipe below relies on. Feature work here is almost always additive —
one more position source, one more chart provider, one more sample log — and
a fresh scratch directory silently loses the settings that make the last
feature testable. So work in `~/.signalk` and add to it. Scratch directories
are still right for genuinely destructive experiments, but they are not the
default.

Two other configs exist and are not for writing through: symphony's own
config, which mirrors the real boat and is reference-only, and
`~/.signalk-dev`, an earlier alternative being consolidated into `~/.signalk`.
Anything in `~/.signalk-dev` should be treated as stale.

`~/.signalk` already has `signalk-fixed-position`, `signalk-datetime`,
`signalk-derived-data`, `@meri-imperiumi/signalk-autostate`,
`signalk-set-gps-timezone`, `@signalk/freeboard-sk`, `@signalk/charts-plugin`
and `signalk-charts-provider-simple` installed. Look before assuming — that
list grows.

This plugin is wired in by `~/.signalk/node_modules/signalk-noaa-space-weather`,
a symlink to this repo — recreate it with `ln -s` if something has replaced it
with a copy. `CLAUDE.md` carries the two rules that fall out of that (don't
`npm install` in that directory, and the shared server runs whatever branch
this repo has checked out) and
[design-decisions.md](design-decisions.md#the-dev-server-finds-this-plugin-by-symlink)
the reasoning.

Most of what this plugin does needs `navigation.position` to exist.
`signalk-fixed-position` is enabled in `~/.signalk` and will contend with any
sample-data playback over that path — left as-is on purpose, since two sources
racing on one path is exactly the kind of thing signalk-lint should be
catching, not something to route around here. For a genuinely moving vessel,
override the config directory and port so the default instance is left alone:

```shell
cd ~/signalk-server && SIGNALK_NODE_CONFIG_DIR=~/.signalk PORT=3100 bin/nmea-from-file
```

`bin/nmea-from-file` plays back a real NMEA 0183 log (`samples/plaka.log`,
throttled) as the vessel "Volare," publishing a genuinely moving position —
`SIGNALK_NODE_CONFIG_DIR` outranks the sample settings file in signalk-server's
own config-directory resolution, so the linked plugin and the sample data
both take effect together. `bin/n2k-from-file` is the NMEA 2000 equivalent.
Without sample data, `bin/signalk-server` starts with an empty config and no
position source. Run `npm run watch` in `~/signalk-server` for continuous
rebuild if you're also changing the server itself, not just this plugin.

For driving the vessel to a specific place (or moving it) on demand instead
of replaying a fixed log, `~/.signalk/scripts/set-value.mjs` sends a
delta straight over the server's own WS stream — no plugin, no PUT-handler
registration, works for any path:

```shell
node ~/.signalk/scripts/set-value.mjs navigation.position '{"latitude":69.65,"longitude":18.96}'
node ~/.signalk/scripts/set-value.mjs --sweep 69.65,18.96 60.1,24.9 --seconds 60
```

This plugin loads from `dist/`, so rebuild (`npm run build` or `npm run
watch`, in this repo) and restart the server to pick up a change — and see
the copy-versus-symlink note above before concluding the change didn't work.
These are shared instances, not one per session: 3010 is the `~/.signalk`
server, and the published-package Docker instance is whatever port symphony
currently publishes Signal K on. Neither is reliably up — check what is
actually listening before starting anything, the same way you'd check before
touching a shared branch, and take the lock file `CLAUDE.md` describes.

Start it detached, or it dies with the shell that launched it:

```shell
cd ~/signalk-server && setsid nohup node bin/signalk-server > /tmp/sk.log 2>&1 < /dev/null &
```

Don't leave a `while true; do npm start; done` supervisor behind. One got
orphaned that way and spent an afternoon respawning every two seconds, losing
on `EADDRINUSE` against the real server and making every port question harder
to answer.

`~/.signalk` has `allow_readonly` **on**, matching `~/symphony/signalk` — check
`allow_readonly` in the relevant `security.json` rather than assuming, since
this has already been documented backwards once. So a plain GET against the
data API needs no token at all.

Writes and the admin API still do. There is an approved read-only device
`claude-dev-tools` in `~/.signalk/security.json`, and
`bin/signalk-generate-token` only signs user ids, not device ids, so getting a
working token is a real step — ask rather than minting an admin one.

If the admin UI 500s on `/admin/`, npm has hoisted `@signalk/server-admin-ui`
somewhere the server doesn't look; symlink it into
`node_modules/signalk-server/node_modules/@signalk/`.

## Working on the webapp ("rig") without a server

```shell
npm run dev:webapp        # http://127.0.0.1:8731, or pass a port
```

It binds every interface, and prints one URL per address it can be reached
at — loopback, LAN, Tailscale. Showing a change on another device (per the
note at the top of this file) is a matter of pasting the right line of that
output; no proxy, and nothing to look up with `hostname -I`. To narrow it
back to loopback on a network you don't trust, `npm run dev:webapp -- --host
127.0.0.1` — the `--` is not optional, npm swallows the flag without it and
leaves the server bound to every interface, which is the one mistake this
option exists to prevent. Kill it when done; don't leave stray listeners
behind.

**In a sandboxed agent session, background it with `&` and `disown` in the
same shell call, and don't use `pkill` to manage it.** `pkill` gets killed
by the sandbox itself the instant it runs — even `pkill -f
some-pattern-that-matches-nothing` dies with exit 144 — so any command chain
that runs it can take the whole chain down, including a freshly backgrounded
server. `pgrep -f mock-webapp` to find the pid and plain `kill` to stop it
both work fine.

`scripts/mock-webapp.mjs` serves `public/` with a state switcher appended and
answers the Signal K paths it understands with fabricated data, so the real
`heroState`/`renderTimer`/`renderKp` decide what renders. A strip at the
bottom of the page switches between the states in `STATES`: quiet, an R2 in
the past 24h, a G3 forecast, a G3 eased to G1 and still in force, a G4+S4 in
force, stale data, and no-data-since-start. Most are impractical to reach
against a live server -- a G4 happens a few times a solar cycle, and the last
one means breaking the plugin on purpose -- which is the whole reason the
file exists. **The switcher strip is part of this harness, not the product**
-- a synthetic click meant for the map can land on it instead (it's fixed at
the bottom of the viewport and a tall expanded tile scrolls underneath it),
which navigates the page and looks exactly like the app misbehaving. Verify
a synthetic click's target with `elementFromPoint` before trusting what it
did.

Reach for it instead of hand-editing the DOM in devtools, and add a state
there rather than faking one in the console.

It has no dependencies and nothing imports it. Keep it that way — it has to
stay invisible to the registry's offline `npm ci`, build and test run.

The map's grids are the one thing here that is not fabricated: a made-up
aurora or D-RAP grid would be mocking `tiles.ts` rather than the webapp. The
four routes behind them -- `aurora-grid`, `drap-grid`, `aurora-refresh`,
`drap-refresh` -- fall through to the real products, loaded out of `dist/`, so
pressing **Fetch** on the map does a real NOAA request and caches a real grid
on disk under the OS temp dir, with or without `--upstream`. Those buttons are
therefore the one part of this that needs `npm run build` first and needs the
network; everything else stays fabricated and offline. Until a real fetch has
landed, the map renders its own empty state and the aurora and D-RAP readings
come from `payload()` like every other path. A real `refresh()` also publishes
the point value at the vessel, which the mock captures in place of an `app`
object and serves back on those paths.

`--upstream <base-url>` trades the fabricated states for a running
server's real numbers: the same paths are proxied there verbatim instead of
going through `payload()`, so a branch's `public/` -- a changed card, new
copy -- can be checked against genuine data without repointing
`~/.signalk/node_modules/signalk-noaa-space-weather` at this worktree, which
would move every other session on that shared server onto this branch's
build too.

```shell
node scripts/mock-webapp.mjs --upstream http://127.0.0.1:3010
```

3010 is the shared dev server described above -- check
`~/.signalk/locks/dev-server.lock` before relying on it being idle, same as
any other use of that instance. `--upstream` and the state switcher are
mutually exclusive; passing it replaces the switcher strip with one naming
the upstream instead.

## The browser demo

```shell
npm install && npm run build           # the live layer is the compiled plugin
npm run demo:build                     # assembles demo-dist/
npx http-server demo-dist              # any static server works
```

Then `/` for the saved snapshot, and `/?live` for live NOAA data.

The public demo ([issue #199](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/199))
is the shipping webapp page itself, served as static files, with exactly one
substitution: `demo/signalk.js` lands in the assembled site as `signalk.js`,
so `public/index.html` and everything it imports resolve `./signalk.js` to a
version that answers every read from one of two data layers instead of a
Signal K server. `public/index.html` is the entry page, copied verbatim with
one script tag for `demo/chrome.js` appended; `test/demo.test.ts` pins the swap
contract and that every import among the copied modules stays inside the copied
set.

The two layers behind that one seam:

| URL | Layer | Reaches NOAA |
| --- | --- | --- |
| `/` | `demo/snapshot.json`, one saved capture | no |
| `/?live` | the plugin's own products, from `plugin/` | yes, all 16 endpoints |

Live ([#239](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/239)
leg 2) is `src/browser/live.ts` driving `PRODUCTS` against a browser publisher
and an in-memory cache, with `createClient` in its no-extra-headers mode. The
build copies `dist/` into the site under `plugin/`, following the emitted
imports, so **`npm run build` has to have run** — `demo:build` says so and
stops if it has not. It is opt-in and dynamically imported: a visitor who never
asks for live data downloads none of those modules and makes no NOAA request.
Why it is shaped this way is in
[design-decisions.md](design-decisions.md#the-demos-third-data-layer-is-the-plugin-itself).

**Load the built site in a browser before you believe it — both URLs.** The
import walk follows `import` statements only, so a `new Worker(...)`, a
`new URL('./x.js', import.meta.url)` or an asset referenced from markup or CSS
is copied by neither the build nor the test — and the test cannot catch what
the build cannot see. For the live layer a browser is the *only* place the
thing can be checked at all: it is the one that decides whether a CORS
preflight kills a request, and `npm test` runs under `firejail --net=none`
with a 60-second cap, so nothing about reaching NOAA can be pinned there.

What to look for on `/?live`: every tile populated within about ten seconds,
the aurora oval and the D-RAP layer drawn on the map, and an empty console. A
`plugin/` module failing to resolve shows up as one import error and a page
that never leaves its no-data state.

`.github/workflows/pages.yml` deploys `demo-dist/` to GitHub Pages on every
push to `main` that touches the demo or `public/`. To refresh the committed
snapshot:

```shell
npm run build && node scripts/capture-demo-snapshot.mjs
```

It runs the real products out of `dist/` against a capturing publisher — the
same pattern as the mock's `loadRealProducts` — so it needs the network and a
build, and it is deliberately outside the test suite. It takes its position and
its settings from `src/browser/live.ts` (`DEMO_POSITION`, `DEMO_PROPS`), the
same two the live layer runs, so the page's two modes cannot end up claiming
different viewpoints; `test/browser-live.test.ts` holds the committed snapshot
to both. It runs with the aurora, D-RAP and GOES flux products switched on, and
saves those settings into the snapshot as the `/status` route's body, so the
demo represents a configured install rather than claiming defaults it is not
running. It refuses to write a
snapshot with a hole in it: a product that throws, or that refreshes without
publishing anything, fails the run and leaves the committed capture alone.

## Regenerating the README screenshots

`scripts/screenshots/capture.mjs` rewrites all five PNGs in `docs/screenshots/`
against a running server. It is a **separate npm package** on purpose —
Playwright would blow both the registry's offline `npm ci` and its 60 second
cap — so install it on its own:

```shell
npm install --prefix scripts/screenshots
npx --prefix scripts/screenshots playwright install chromium
SK_USERNAME=... SK_PASSWORD=... node scripts/screenshots/capture.mjs
```

It defaults to the dev server on `http://localhost:3010`, hard-coded in
`capture.mjs`; `SK_URL` or `--url` points it somewhere else. `--only
webapp,space-map` limits the run. Which one you want is a real choice, and the
default takes the side of feature work: shots are part of the change that alters
the UI, so capturing them against the published package means a PR that rewrote
a panel ships a picture of the old one. Point `--url` at the published-package
Docker instance when the point is to match what a registry installer sees
instead — and read symphony's compose files for its port rather than assuming
one.

Four of the five shots need only a **readonly** login. Just `plugin-configuration`
needs admin, because `/skServer/plugins` is admin-gated — with a readonly session
that one shot is skipped and the others still render. Note the plugin's own data
endpoints are readable by a readonly user only because they are mounted under
`/signalk/v1/api/*` rather than `/plugins/*`; see the comment in `src/index.ts`.

To get an account without handing over an admin password, POST
`{"userId":..., "password":...}` to `/signalk/v1/access/requests` (unauthenticated,
returns 202) and approve it in the admin UI under Security → Access Requests,
picking the permission level there. Delete the user again at Security → Users.

Two things about the admin UI that cost an afternoon, so don't rediscover them:
its sidebar section toggles are all `href="#"` with the routing done in JS, and
their labels absorb count badges ("Data" is really "Data1") — so the script moves
`window.location.hash` on the already-loaded SPA instead of clicking through. A
*hard* navigation straight to a deep route still doesn't work, which is why it
loads `/admin/` first.

## Pictures for a webapp pull request

`scripts/screenshots/states.mjs` is the other half of that package, and the two
answer different questions. `capture.mjs` shoots a live server and rewrites the
five PNGs the README ships; `states.mjs` starts `scripts/mock-webapp.mjs`
itself, walks every state it declares, and writes a gitignored
`.hero-states/` with the PNGs and an `index.html` contact sheet. Nothing is
committed — these are review material for one pull request, and pinning them
would mean recapturing on every unrelated change to the page.

```shell
node scripts/screenshots/states.mjs        # --out, --port, --theme
```

Defaults to dark only, since that's the only rendering worth reviewing on a
pull request; pass `--theme light` for a one-off check of the light theme,
which the app still supports.

It reads the state list off the mock's own startup line rather than importing
it, so a state added there appears here with no second edit. The clip is the
statusbar and the hero tile together, never one without the other: the chip and
the countdown live in the first and the words in the second, and #126 was
precisely a disagreement between the two.

