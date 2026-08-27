# Development environment

How to run this plugin against a real Signal K server on this machine, and the
two scripts that stand its webapp up without one. [`CLAUDE.md`](../CLAUDE.md)
keeps the handful of things that bite before you get this far — the shared
servers and their lock files, the branch the dev server follows, the ports —
and points here for the procedures.

## Running against a real server

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
clear of both 3000 and 3001 whichever way symphony's stack is currently
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

## Working on the webapp without a server

```shell
npm run dev:webapp        # http://127.0.0.1:8731, or pass a port
```

`scripts/mock-webapp.mjs` serves `public/` with a state switcher appended and
answers the Signal K paths it understands with fabricated data, so the real
`heroState`/`renderTimer`/`renderKp` decide what renders. A strip at the
bottom of the page switches between the states in `STATES`: quiet, an R2 in
the past 24h, a G3 forecast, a G3 eased to G1 and still in force, a G4+S4 in
force, stale data, and no-data-since-start. Most are impractical to reach
against a live server -- a G4 happens a few times a solar cycle, and the last
one means breaking the plugin on purpose -- which is the whole reason the
file exists. Reach for it instead of hand-editing the DOM in devtools, and
add a state there rather than faking one in the console.

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

