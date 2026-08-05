# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **"Show map" in the webapp's Aurora tile.** Fetches NOAA's OVATION grid
  directly from the browser (a separate request from the plugin's own
  server-side aurora fetch) and draws probability in a window around the
  vessel's position, marker at center. Opt-in only — never fetched
  automatically, since it's a second ~900 KB request on top of whatever the
  plugin itself is already doing. If the browser has no path to NOAA
  independent of the Signal K server, it says so rather than failing
  silently.

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
