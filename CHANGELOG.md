# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.13.0] - 2026-08-09

### Changed

- **The aurora setting now states its real bandwidth cost, in the config UI.**
  It said ~900 KB per fetch, which is the decoded size; on the wire it is 145 KB,
  because NOAA serves it gzipped. Still about thirty times everything else this
  plugin downloads combined, so the switch keeps earning its place — but the
  number someone decides on should be the one they'd actually be billed for,
  and the config page is where that decision gets made, not the README.

- **`zoneAlertThreshold` becomes `alarmLevel`, and now names the level that
  sounds an alarm** rather than the lowest level worth noticing. The quiet
  states derive downward from it: one level below shows a popup, two below is
  listed but silent.

  The old direction ran off the end of the scale. Loudness derived *upward* from
  the pivot, so a pivot of 4 could never reach `alarm` and a pivot of 5 could
  not even reach `warn` — the two loudest-sounding choices a user could make
  were the two that silenced the plugin, which is not something a label can
  explain away. Anchoring on the alarm leaves the levels above the pivot to
  absorb that, so every option is live and turning the number down is
  monotonically louder. Measured on the April 2025 storm payload, dropping from
  5 to 1 takes it from 1 notification and no sound to 5 of each, with no step
  going backwards.

  **Default behaviour does not change.** The new default of 5 produces exactly
  the old default's mapping — `alarm` at level 5, `warn` at 4, `alert` at 3 — and
  a saved `zoneAlertThreshold` migrates by adding two, so an existing config
  keeps behaving the same way. Old values of 4 and 5 clamp to 5; those were the
  settings that could never sound at all.

  It is also a dropdown now rather than a free number field, labelled with how
  often each level happens (`Strong (3) and above — about monthly`) instead of
  NOAA's days-per-solar-cycle, which is the frequency of the *event* rather than
  of the interruption being chosen. A non-integer or out-of-range saved value
  falls back to the default, since the admin form renders one as a blank select
  with no error and saves it back untouched.

- **Ten settings down to five.** Nothing about what the plugin does changes on
  a default install except that the alerts product is now always on. Old
  configs keep working — the removed keys are ignored, and the two intervals
  carry over automatically.

  - `notificationVisual` and `notificationSound` are gone. They were a ceiling
    on `methodForState`, applied to every product at once, and on most days
    they changed nothing observable: measured across the captured fixtures,
    toggling both changed 0 of 4 notifications on a quiet day and 2 of 8 during
    the April 2025 G4 storm. Severity already says how loud something should
    be, and `alarmLevel` moves the whole ladder — which is the setting
    that reflects the decision actually being made. Muting one method across
    every product is a preference about the notification client. This matches
    what the rest of the community does; hoeken's anchor alarm, the most
    notification-heavy plugin out there, picks severity once and derives the
    method from it.
  - `alertMaxAgeHours` is now a fixed 24 hours. It only ever applied to NOAA
    messages that state no expiry of their own, nobody can answer it better
    than the value matching how NOAA issues them, and both directions of
    getting it wrong are invisible until they aren't — too low drops live
    conditions, too high rebuilds [#45] one poll at a time.
  - `observationsInterval` and `notificationsInterval` merged into
    **`updateInterval`** (still 60 minutes). They shared a default and had no
    reason to differ; NOAA publishes on its own cadence and polling faster than
    it publishes only costs bandwidth. A saved config that customised either
    one keeps its cadence — the lower of the two wins, since that is the rate
    the install was already polling at. `auroraInterval` stays separate because
    of the payload size.
  - `sendAlertsWatchesWarnings` is gone; the alerts product is always on.
    Neither justification for the switch survived being measured. Severity is
    `alarmLevel`'s job — at the default this product raises four
    notifications on an ordinary day and none of them make a sound. And the
    bandwidth is ~5 KB per poll, not the 71–146 KB the fixtures suggest: NOAA
    serves the endpoint gzipped, Node's fetch asks for it, and the client's
    existing `If-None-Match` means an unchanged payload is a 304 with no body.
    It was off by default because enabling it used to raise ~120 permanent
    notifications with a sound on all of them ([#45]); that is fixed, and
    leaving it off shipped the fix to nobody.

## [0.12.4] - 2026-08-09

### Fixed

- **The webapp showed `[object Object]` for the X-ray flare class.** A path that
  carries only `meta` — described at startup, but never published because that
  product's fetch failed — fell through `leafValue` to the node itself. It now
  reads as "–", the same as any other missing value.

- **A NOAA payload read mid-rewrite lost the whole reading.** NOAA rewrites these
  files in place about once a minute, and a read landing mid-write returns the
  new content followed by the tail of the old, longer content — `JSON.parse`
  rejects all of it. The client now takes the complete leading JSON value and
  logs how many trailing bytes it ignored. A payload that is merely truncated
  still fails, because there is no complete value to recover and publishing half
  a payload as though it were whole would be worse than skipping a poll.

  This is what left the flare class with metadata and no value, and it is not
  specific to that product: every endpoint is rewritten on the same cycle.

## [0.12.3] - 2026-08-09

### Fixed

- **A downgraded storm level stayed raised.** NOAA's `ALT` messages state no
  expiry, so a `ALTK07` (G3) kept its notification for a full 24 hours even
  after the next synoptic period had already reported `ALTK05`. Cancellations
  and the observed-value zones both missed this — nothing was cancelled and
  nothing was wrong, the storm had simply eased. A K-index or storm-watch
  message code is now stood down when a later message on the same ladder
  reports a lower level. Measured
  over the three archive fixtures this is one episode per geomagnetic storm:
  none in April 2025, 5.5 hours in the 16 April storm, and 22 hours over 4–5
  July 2026. Levels arriving in ascending order — a storm ramping up — are
  untouched.

## [0.12.2] - 2026-08-09

### Fixed

- **A NOAA scale of "G3 or greater" was graded as level 5**, which inverted the
  severity ladder: a hedged *forecast* (`WARK07`, "G3 or greater") sounded an
  alarm, while an *observed* G4 (`ALTK08`) only reached `warn`. "Or greater" is
  a floor NOAA is asserting, not a ceiling it is predicting, so it now grades
  at the level stated. On the April 2025 G4 storm fixture this takes the
  audible notifications from 2 to 1 — the observed G4, visual only. The hedge
  is still visible in the notification's `scale` field.

  Introduced in 0.12.0: that release started running `scaleValue` through the
  zone ladder instead of collapsing everything to `alert`, which made a
  previously inert `or greater → EXTREME` mapping load-bearing. A test caught
  it and its assertion was rewritten to match.

## [0.12.1] - 2026-08-09

### Fixed

- **`notificationSound` was resolved by testing `notificationVisual`**, so each
  setting's default was gated on the other one's presence. Turning the sound
  off without also saving the visual checkbox kept the sound on; turning the
  visual off silently dropped the sound too. Each field now resolves its own
  default. Only ever affected hand-edited configs — both fields carry
  `default: true` in the schema, so the admin UI always writes the pair, which
  is why it went unnoticed.

## [0.12.0] - 2026-08-09

### Fixed

- **The alerts product raised a notification for every message in NOAA's
  30-day archive, and asked for a sound on all of them** ([#45]). A Pi 5 was
  unusable within ten minutes of enabling it, and a second Signal K instance
  subscribed to the first saw an endless list of alarms.

  `/products/alerts.json` is a rolling archive, not a list of current
  conditions — 88 to 200 messages in every payload captured so far. Each one
  became its own notification at `notifications.noaa.swpc.sn:<serial>`, with
  `method: ['visual', 'sound']` attached regardless of state, so ~110
  informational messages per poll each asked clients to sound an alarm. NOAA
  also mints a fresh serial number every time it extends or continues a
  condition, so one ongoing K-index warning became 19 separate permanent
  paths in a month, and the whole set was re-published every hour forever.

  Four changes:

  - **Only messages that describe the present are raised.** Warnings and
    watches carry their own expiry (`Valid To` / `Now Valid Until`) and are
    dropped when it passes; event summaries expire at their stated `End Time`;
    plain alerts state no expiry and are bounded by the new
    `alertMaxAgeHours`. Against the captured payloads this reduces 88–200
    messages to 1–8 notifications, and 8 is the April 2025 G4 storm.
  - **One path per NOAA message code**, at
    `notifications.noaa.swpc.alerts.<CODE>` (`alerts.WARK05`, `alerts.ALTEF3`).
    A code names one condition, so extensions, continuations and
    cancellations now update the path in place instead of accumulating beside
    it, and the path count is bounded for the life of the server.
  - **Severity decides loudness**, through the same ladder the scale and Kp
    zones already use and the same `zoneAlertThreshold`: `normal` and `alert`
    are silent, `warn` is visual, `alarm` is visual and audible. A real G4
    storm still sounds. `notificationVisual` / `notificationSound` are now a
    ceiling on that rather than a floor under it.
  - **Withdrawn notifications are actively stood down**, and unchanged ones
    are not re-published at all — so a quiet hour now produces no deltas
    instead of the whole set.

  Upgrading also clears the `sn:` notifications left over from earlier
  versions. Signal K cannot delete a path, so without that they would stay
  raised and audible in every client that had already seen them.

- The weekly advisory outlook is `state: 'alert'`, which this project's own
  documented policy makes silent — but it was attaching visual+sound, so a
  default install sounded an alarm every Monday for an informational bulletin.
  It now follows the policy: visible in the notifications UI, no popup, no
  sound.

### Added

- `alertMaxAgeHours` (default 24, clamped to 168) — how long a NOAA message
  that states no expiry of its own stays raised. The clamp is deliberate:
  without an upper bound, setting this to 720 would reconstruct [#45].

[#45]: https://github.com/mark-brannan/signalk-noaa-space-weather/issues/45

## [0.11.0] - 2026-08-06

### Added

- **GOES X-ray flare class** (e.g. `M2.1`) at `environment.noaa.swpc.xray_flare.class`
  — the same underlying measurement the R scale buckets into 0-5, at the
  letter+number resolution HF operators actually use. Fetched alongside the
  existing scales product; a failure to fetch it never blocks the primary
  scales publish. Shown next to the R gauge in the webapp.

  From the metrics-research issue's two recommendations (#12), this is the
  cheap one — one field off an already-small payload. D-RAP (frequency
  usability by position) is the other, larger recommendation; tracked
  separately since it needs a new text-grid parser, not a bolt-on.

## [0.10.3] - 2026-08-06

### Changed

- **Version bumps are now enforced locally, not by CI trying to create and
  auto-merge a PR of its own.** `.husky/pre-commit` auto-patch-bumps
  `package.json` at commit time if nothing on the branch has already given
  it an explicit bump. `auto-version.yml` got simpler in the same move: it
  no longer bumps anything, only tags and publishes whatever version is
  already on `main`.

  The bot-PR approach it replaces hit a different GitHub anti-abuse gate on
  every real attempt — Actions forbidden from creating pull requests,
  repo-wide auto-merge disabled, a bot-authored PR's own CI needing manual
  approval — each only discoverable by hitting it. The local hook sidesteps
  all of it: a normal push never touches the machinery those gates exist to
  gate.

## [0.10.2] - 2026-08-06

### Fixed

- **The admin Webapps sidebar page was showing a stale icon.** It reads
  `public/icon.svg` (a separate top-level `appIcon` field, different from
  the App Store's `signalk.appIcon`), which was a real copy last updated
  when it was first added and never touched again after the icon was
  redesigned. Copied the current icon over, and added a test asserting
  the two files stay identical so this can't silently drift apart again.

## [0.10.1] - 2026-08-05

### Fixed

- **The webapp couldn't tell "not logged in" from "nothing published yet."**
  On a server with `allow_readonly: false` (a realistic security posture,
  not a dev-only edge case), every read 401s without a valid session. The
  webapp silently rendered that identically to a disabled product or a
  quiet day — blank vessel name, zero gauges, zero aurora probability, no
  indication anything was wrong. It now shows an explicit banner with a
  login link whenever the server rejects a request for authentication,
  instead of guessing.
- **The vessel name never rendered, on every single refresh, silently.**
  `/vessels/self/name` returns a bare string, not the usual
  `{value, timestamp, ...}` leaf shape every other path uses. `leafValue()`
  did `'value' in name` on that string, which throws in JavaScript — after
  position had already updated but before anything past it in that refresh
  cycle ran. Found by reproducing the page with a real, validly-signed
  session rather than guessing from the symptom.

## [0.10.0] - 2026-08-05

### Added

- **Refresh button on the Aurora tile and the map.** Both now fetch NOAA
  off-schedule on demand instead of waiting for the configured interval
  (two hours by default), server-side via a new
  `GET /signalk/v1/api/signalk-noaa-space-weather/aurora-refresh` route.
  Rate-limited to once a minute regardless of how often it's clicked or
  called, so a mashed button (or a script hitting the URL) can't turn the
  interval's whole reason for existing — bounding an ~900 KB fetch — into a
  busy loop.

### Fixed

- `package-lock.json`'s version field had been stuck at `0.2.0` since that
  release; every bump since only touched `package.json`. Back in sync now.

## [0.9.0] - 2026-08-05

### Changed

- **The aurora map no longer fetches NOAA from the browser.** The plugin's
  own aurora product already fetches the ~900 KB OVATION grid server-side to
  compute the probability at the vessel's position; it now also caches that
  same fetch to disk (`app.getDataDirPath()`, the same mechanism other
  plugins use for a cache or a small database), and serves it back to the
  webapp over its own route. One fetch now does both jobs, and the browser
  only ever talks to the Signal K server it already loaded the page from —
  which fully retires the "does this browser have its own path to the
  internet" question the client-fetch version depended on.

  The route lives at `/signalk/v1/api/signalk-noaa-space-weather/aurora-grid`,
  not the more obvious `/plugins/signalk-noaa-space-weather/aurora-grid`.
  Found out why the hard way: `signalk-server` hardcodes the entire
  `/plugins/*` prefix to admin-only
  (`adminAuthenticationMiddleware`, applied unconditionally, with no
  per-route override), which would have made viewing the map require an
  admin login unlike every other read in this webapp. `/signalk/v1/api/*`
  carries no such gate on GET — only PUT/POST/DELETE are restricted there —
  so mounting via `signalKApiRoutes` instead of `registerWithRouter` matches
  the read-level access the rest of the plugin's data already has.

## [0.8.0] - 2026-08-05

### Changed

- **Merged `minScaleAlert` into `zoneAlertThreshold`.** Both were 1-5
  thresholds, both defaulted to 3 ("strong"), and both answered the same
  question — how bad before this plugin makes noise about it — just for two
  different pipelines (the alarm zones on scale/Kp values, and NOAA
  alert/watch/warning notifications). One setting now drives both. If you
  had customised `minScaleAlert` away from `zoneAlertThreshold`, the saved
  value is picked up as the new combined threshold rather than silently
  dropped; if you'd never touched either, nothing changes, since they always
  defaulted to the same number.
- **`auroraInterval` default raised from 60 to 120 minutes.** Aurora is a
  glance-at-it feature, not one that needs to track in real time, so there
  was little reason to default to spending the ~900 KB payload twice an
  hour rather than once.

## [0.7.0] - 2026-08-05

### Added

- **"Show map" in the webapp's Aurora tile.** Fetches NOAA's OVATION grid
  directly from the browser (a separate request from the plugin's own
  server-side aurora fetch) and draws probability in a window around the
  vessel's position, marker at center. Opt-in only — never fetched
  automatically, since it's a second ~900 KB request on top of whatever the
  plugin itself is already doing. If the browser has no path to NOAA
  independent of the Signal K server, it says so rather than failing
  silently.

### Changed

- New app icon: a sailboat under the aurora, with satcom and HF radio failing.

## [0.6.1] - 2026-08-05

### Changed

- npm/store description rewritten to say what the plugin surfaces instead of
  misnaming NOAA's SWPC as a "Service" (it's the Space Weather Prediction
  Center).
- README opener no longer restates the store description a second time;
  settings (`zoneAlertThreshold`, `auroraEnabled`, etc.) are now documented.

## [0.6.0] - 2026-08-05

### Added

- Conditional GET (`ETag`/`If-None-Match`) on every NOAA fetch. A `304`
  reuses the last parsed value instead of re-downloading and re-parsing.

  Checked against the live endpoints before writing this off as a clean win:
  NOAA regenerates these files every 15-45 seconds, well under any sane poll
  interval, so at the default 60-minute interval a `304` essentially never
  happens — this doesn't cut real-world bandwidth the way it would if NOAA's
  cache-control header (`max-age=60`) reflected how often the data actually
  changes. It does help if you set a short interval, and it's free
  insurance against duplicate work on a rapid restart.

## [0.5.2] - 2026-08-04

### Fixed

- **No icon or display name on the admin Webapps page**, though both showed
  correctly in the App Store and on npm. The App Store resolves the icon
  server-side; the Webapps page just serves the raw `package.json`, and the
  admin UI reads `appIcon`/`displayName` off the *top level* of that object,
  not the nested `signalk.appIcon` convention everything else uses. Added
  top-level `appIcon`/`displayName` fields (the nested ones stay, for the App
  Store and npm) and copied the icon into `public/` so it's actually served
  at the path the webapp is mounted on — `signalk.appIcon`'s `./icon.svg` is
  relative to the package root, not to whatever admin page happens to be
  open in the browser, so it never resolved there.

## [0.5.1] - 2026-08-04

### Changed

- Webapp: the storm scale tile now spells out "Geomagnetic Storm," "Solar
  Radiation Storm," and "Radio Blackout" instead of just the letter, with a
  large colored G/S/R badge next to each gauge.
- The "alert" severity color was too close to the accent amber to tell apart
  at a glance (2° apart in hue). Shifted it to a clearer yellow-gold.

## [0.5.0] - 2026-08-04

### Added

- **`environment.noaa.swpc.kp.forecast.series`**: the 3-hourly Kp points from
  24 hours in the past to 72 hours ahead, as `{time, kp, forecast}`. This is
  the same NOAA feed already fetched for the summary paths — no new network
  request, just no longer discarding the parsed rows.
- The webapp's Kp tile now draws a real timeline from that series (observed
  in grey, forecast in amber, the Kp 5 storm threshold marked, the 72h peak
  highlighted) instead of a three-bar peak comparison. Falls back to the bars
  if the series hasn't arrived yet.
- A "Learn more" links row in the webapp: NOAA's own explanations of the
  G/S/R scales, the Kp index, the aurora dashboard, and radio/GPS impact
  pages.

## [0.4.0] - 2026-08-04

### Added

- **A companion webapp.** No configuration: it reads whatever the plugin has
  already published. Storm scale gauges, the Kp observed/24h/72h peaks, solar
  wind readouts, and — when aurora is enabled — probability at the vessel's
  position. Static HTML/CSS/JS, no build step, no external requests; the
  Signal K server serves it automatically from `public/` at
  `/signalk-noaa-space-weather/`. Every tile degrades to a plain message
  rather than showing nothing when its data isn't available yet (aurora
  disabled, no position, first fetch cycle still pending).

## [0.3.0] - 2026-08-04

### Added

- **Aurora visibility at the vessel's own position.** "Can I see the aurora
  from here?" `environment.noaa.swpc.aurora.probability` (a 0-1 ratio) reads
  NOAA's OVATION model and bilinearly interpolates the vessel's position
  from the surrounding grid cells rather than snapping to the nearest one.
  The grid is a coarse 1° (~60nm of latitude), and the aurora oval's edge is
  exactly where nearest-neighbour would produce visible jumps as the vessel
  moves.

  Off by default and on its own configurable interval (60 min default) to
  avoid bloating data transfer costs: the payload is roughly 900 KB. Aurora
  is treated as an opportunity, not a hazard. Its alarm zones never reach
  `alarm` and never carry a sound method at any probability.

- **Geometric backoff for a product with an unmet precondition.** Aurora
  needs a vessel position, which may not exist for the first few seconds
  after boot (or ever, on a dev server). Rather than fail or wait out a full
  interval, a product can now report `not-ready` and be retried with
  geometric backoff: 5s, 10s, 20s and capped at an upper bound of 5 minutes
  or the interval of that product (NOAA resource).

## [0.2.0] - 2026-08-01

### Fixed

- **The plugin failed to start on some servers with `Cannot find module`**
  ([#1](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/1)).
  `package.json` declared `exports` but no `main`. Signal K loads a plugin with
  `importOrRequire(moduleDir)`, which calls `require()` on an absolute directory
  path, and Node's CommonJS loader does not consult `exports` in that case — it
  reads `main`, finds none, falls back to `./index.js` and throws. Recent
  servers mask this with an `esm-resolve` fallback; older ones do not.
- **Alert notifications never reflected the storm scale.** `state` and
  `scaleText` were shadowed by `const` declarations inside the scale-line
  branch, so every alert was published with `state: "normal"` and an empty
  scale, and the `minScaleAlert` setting had no effect at all.
- **Solar wind published `NaN`.** NOAA changed the summary products from
  `{"WindSpeed": ...}` and `{"Bt": ..., "Bz": ...}` to
  `[{"proton_speed": ...}]` and `[{"bt": ..., "bz_gsm": ...}]`. Reading an array
  with the old object accessors left the speed silently absent and made Bt and
  Bz `undefined * 1`. Both payload shapes are now accepted, as are both shapes
  of the planetary K-index forecast, which NOAA has likewise switched between a
  header-row table and a list of records.
- **`observations.latest.*` had no metadata.** All three "latest observed"
  entries pointed at the 24-hour maximum paths, which also overwrote the
  24-hour descriptions. Metadata is now generated from the range table instead
  of being written out by hand.
- The advisory outlook notification sent `props.defaultMethod`, which is
  undefined, instead of the configured notification method.
- A malformed product could throw inside a promise with no `catch`, and one
  unparseable alert discarded the whole batch. Parsing now fails soft per item,
  and fetches have a timeout.
- `stop()` only cleared the repeating intervals, so stopping within the first
  five seconds left the initial fetch pending and it still emitted deltas.

### Added

- **Planetary K-index forecast.** Kp defines the G scale directly
  (G1 = Kp5 ... G5 = Kp9) and the NOAA feed is 3-hourly out to three days, so
  it answers *when* a geomagnetic storm arrives at eight times the resolution
  of the single daily G value in `noaa-scales.json`. This feed was already
  being fetched and its result discarded. New paths:
  - `environment.noaa.swpc.kp.observed`
  - `environment.noaa.swpc.kp.forecast.max24h`
  - `environment.noaa.swpc.kp.forecast.max72h`
  - `environment.noaa.swpc.kp.forecast.maxNoaaScale`
  - `environment.noaa.swpc.kp.forecast.nextStormTime`
  - `environment.noaa.swpc.kp.forecast.nextStormKp`
- **Zone metadata on every scale and Kp path**, so any Signal K gauge colours
  itself without extra configuration. Zones drive server-generated
  notifications, so the mapping is deliberately quiet: NOAA's own frequencies
  put a level 1 event on roughly a quarter of all days and a level 5 on four
  days per solar cycle, so levels at or below the threshold carry no visual or
  sound method and only levels above it can interrupt.
- `zoneAlertThreshold` setting (default 3) to move that pivot.
- A test suite — 78 tests over captured NOAA payloads, with no network access.
- `CHANGELOG.md`, `LICENSE` (the ISC licence was declared but the file was
  missing), an app icon, and screenshots.

### Changed

- **Breaking:** `solar_wind.Bt` and `solar_wind.Bz` are now published in Tesla
  with `units: "T"` rather than nanotesla, per Signal K's SI convention.
- **Breaking:** forecast S and R probabilities move from nested object values
  to their own leaf paths, so ordinary consumers can subscribe to them:
  - `scales.forecast.<n>day.S` → `scales.forecast.<n>day.S.probability`
  - `scales.forecast.<n>day.R` → `scales.forecast.<n>day.R.minorProbability`
    and `.majorProbability`
- **Breaking:** those probabilities are now 0–1 ratios with `units: "ratio"`
  rather than whole percents.
- `units: "none"` was dropped from the dimensionless G/S/R and Kp paths; the
  admin UI renders the units string verbatim and displayed "2 none".
- The published package no longer ships 20 stray working-directory files. It
  now contains only `dist`, `docs`, the icon, and the documentation.
- Dropped the `node-fetch` dependency in favour of the `fetch` built into
  Node 18+. The plugin now has no runtime dependencies.

## [0.1.2] - 2025-04-19

### Added

- Solar wind speed, and interplanetary magnetic field strength (Bt) and
  orientation (Bz).
- Metadata for the advisory outlook.

### Changed

- Longer fetch timeouts.

## [0.1.1] - 2025-04-19

### Added

- Explicit timestamps on Signal K updates.

### Fixed

- Removed a noisy console log.

## [0.1.0] - 2025-04-15

### Added

- First published release.
- NOAA G/S/R storm scales for latest observed, 24-hour observed maximums, and
  the three-day forecast.
- The weekly Space Weather Advisory Outlook as a Signal K notification.
- NOAA alerts, warnings, and watches as notifications, with a configurable
  scale threshold.

[0.11.0]: https://github.com/mark-brannan/signalk-noaa-space-weather/compare/v0.10.3...v0.11.0
[0.10.3]: https://github.com/mark-brannan/signalk-noaa-space-weather/compare/v0.10.2...v0.10.3
[0.10.2]: https://github.com/mark-brannan/signalk-noaa-space-weather/compare/v0.10.1...v0.10.2
[0.10.1]: https://github.com/mark-brannan/signalk-noaa-space-weather/compare/v0.10.0...v0.10.1
[0.10.0]: https://github.com/mark-brannan/signalk-noaa-space-weather/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/mark-brannan/signalk-noaa-space-weather/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/mark-brannan/signalk-noaa-space-weather/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/mark-brannan/signalk-noaa-space-weather/compare/v0.6.1...v0.7.0
[0.6.1]: https://github.com/mark-brannan/signalk-noaa-space-weather/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/mark-brannan/signalk-noaa-space-weather/compare/v0.5.2...v0.6.0
[0.5.2]: https://github.com/mark-brannan/signalk-noaa-space-weather/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/mark-brannan/signalk-noaa-space-weather/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/mark-brannan/signalk-noaa-space-weather/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/mark-brannan/signalk-noaa-space-weather/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/mark-brannan/signalk-noaa-space-weather/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/mark-brannan/signalk-noaa-space-weather/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/mark-brannan/signalk-noaa-space-weather/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/mark-brannan/signalk-noaa-space-weather/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/mark-brannan/signalk-noaa-space-weather/releases/tag/v0.1.0
