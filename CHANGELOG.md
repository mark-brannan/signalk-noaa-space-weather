# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
as read in [AGENTS.md](AGENTS.md): the version tracks what a boat owner can
observe, so internal plumbing lands in a patch even when it adds something.

## [0.29.13](https://github.com/mark-brannan/signalk-noaa-space-weather/compare/v0.29.12...v0.29.13) (2026-08-29)


### Fixed

* address CodeRabbit findings on PR [#252](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/252) ([#257](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/257)) ([1ad9e55](https://github.com/mark-brannan/signalk-noaa-space-weather/commit/1ad9e55a8b752668b5d9eb03f11911fe9b031f21))
* **kp:** keep an elapsed estimated bin out of the forecast windows ([#266](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/266)) ([f168d35](https://github.com/mark-brannan/signalk-noaa-space-weather/commit/f168d3574e552688f85ec82d3bda65ef7f9b9b87))
* **kp:** read the observed Kp from NOAA's column, not the clock ([#254](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/254)) ([37d4706](https://github.com/mark-brannan/signalk-noaa-space-weather/commit/37d47066165d705b2803fe6cc2a79fe8fde2bec3))
* **webapp:** keep an open message from folding itself up on the poll ([#258](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/258)) ([400a042](https://github.com/mark-brannan/signalk-noaa-space-weather/commit/400a04206aa2f1eb82bfce141aeaca3730329f44))

## [0.29.12](https://github.com/mark-brannan/signalk-noaa-space-weather/compare/v0.29.11...v0.29.12) (2026-08-29)


### Added

* **webapp:** let NOAA's watches speak in the hero banner ([#242](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/242)) ([ee24ab0](https://github.com/mark-brannan/signalk-noaa-space-weather/commit/ee24ab009d52781602494093bd0b62f60b8bf0ea))
* **webapp:** show NOAA's own messages, off a link in the hero ([#255](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/255)) ([b2f7fd3](https://github.com/mark-brannan/signalk-noaa-space-weather/commit/b2f7fd3e64d700a289139be8369aa4599445fe1c))


### Fixed

* **noaa:** bound wireBytes() with a deadline, and catch up release docs ([#251](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/251)) ([ca40093](https://github.com/mark-brannan/signalk-noaa-space-weather/commit/ca4009356663a32346583c859b88962f50966135))
* **release:** give the publish dispatch step a repo to target ([#247](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/247)) ([5afcc35](https://github.com/mark-brannan/signalk-noaa-space-weather/commit/5afcc3561bf0cdab86de0ec59f6805cce65d0e5e))

## [0.29.11](https://github.com/mark-brannan/signalk-noaa-space-weather/compare/v0.29.10...v0.29.11) (2026-08-28)


### Fixed

* **config:** tell the user what a poll actually costs ([#223](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/223)) ([ab07ca1](https://github.com/mark-brannan/signalk-noaa-space-weather/commit/ab07ca1eaa6323cf91a4af89843741825ce9fe62))
* **release:** give release-please a GitHub App token ([#246](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/246)) ([d0c4a2c](https://github.com/mark-brannan/signalk-noaa-space-weather/commit/d0c4a2c4545923f45a25c8964eb65bb090ba3c2c))

## [0.29.10](https://github.com/mark-brannan/signalk-noaa-space-weather/compare/v0.29.9...v0.29.10) (2026-08-28)


### Added

* **advisory:** plain-data value path, per-bulletin archive, expiry slack ([#225](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/225)) ([db4f866](https://github.com/mark-brannan/signalk-noaa-space-weather/commit/db4f8660858b521d8d7e85056b69aba6fde7c029))


### Fixed

* **release:** tag plain vX.Y.Z, not &lt;package-name&gt;-vX.Y.Z ([#234](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/234)) ([5935ffe](https://github.com/mark-brannan/signalk-noaa-space-weather/commit/5935ffe9464239892258b1028ff8659cf8a3dda7))

## [0.29.3] - 2026-08-26

### Added

- **One map, with layers, a projection and a zoom.** The regional aurora
  window and the global absorption rectangle were two maps behind a dropdown
  that showed one and hid the other. They are now one tile: tick either layer
  or both, pick **Great circle** (centred on the boat, where a straight line
  from the vessel is a great circle and so is the HF path) or **Flat**, and
  drag the zoom from a regional close-up out to the whole world. Aurora is
  drawn on the global view for the first time.
- **Marine band edges as contours on the absorption map.** NOAA's colours say
  how much is absorbed; a labelled ring says which of your bands has gone
  under. Switchable from the map's own toolbar.

### Changed

- **Both absorption maps now use NOAA's own published D-RAP colorbar** -- the
  chart-plotter overlay and the webapp's map alike, so a reader comparing this
  plugin against NOAA's image sees one picture rather than two. The webapp's
  map panel is deliberately dark in both themes, because that palette was
  drawn to sit on a black globe.
- **The webapp's absorption map is no longer blocky.** It was one filled
  rectangle per grid cell; it is now sampled per pixel and interpolated, the
  same as NOAA's own image and this plugin's chart tiles.

## [0.29.2] - 2026-08-26

### Added

- **The aurora map has a coastline.** It was a coloured band and a dot before,
  with nothing in it to say whether the bright patch was over your passage or
  over Siberia. Drawn from a coastline the plugin ships, because every chart
  source Signal K can offer is Web Mercator and cannot show a pole.

### Changed

- **The banner says what is still in force.** A storm quieter than the day's
  peak used to read as "conditions have since eased" or "nothing in force
  right now" while it was still running -- an R2 under an earlier R3, a G1
  under a G2. Both now name the level still on.
- **The quiet banner no longer overclaims the forecast.** It only bounds G3
  and above, and says nothing about the forecast when there is no forecast to
  read.

### Fixed

- A D-RAP grid whose `Product Valid At` header did not survive the read is
  skipped rather than published stamped with the local clock.

## [0.29.1] - 2026-08-26

### Fixed

- **Oswald and Space Mono subset to Latin.** The webapp shipped the full font
  files for a page that renders Latin text only.

### Changed

- **The scales card's Signal K wiring moved out of `index.html`** into
  `public/scales.js` and `public/signalk.js`, so the path plumbing can be
  tested rather than read.

## [0.29.0] - 2026-08-25

### Changed

- **Webapp layout and copy tidy-up.** Dead hero CSS, redundant tile
  subheadings, a squarer aurora tile that names the position it read at,
  educational-only Learn More links, and a status bar that shrinks below 520px
  and gives the countdown its own line below 410px rather than wrapping
  raggedly.

## [0.27.0] - 2026-08-21

### Added

- **D-RAP highest affected frequency.**
  `environment.noaa.swpc.drap.highest_affected_frequency` (Hz), sampled from
  NOAA's D-Region Absorption Predictions grid at the vessel's own position —
  the highest HF frequency currently degraded by 1dB or more, the same
  "value at the vessel" treatment the aurora probability gets. The map
  overlay the same issue proposes is a larger, separate piece of work and
  is not part of this change.

## [0.26.0] - 2026-08-21

### Added

- **GOES X-ray and proton flux.** `environment.noaa.swpc.xray_flux` (W/m²,
  the 0.1-0.8nm channel the flare class is defined on) and
  `environment.noaa.swpc.proton_flux` (the >=10 MeV channel the S scale is
  defined on, converted from NOAA's pfu to m⁻².s⁻¹.sr⁻¹). The R and S scale
  levels already published only the bucketed severity; this is the raw
  number behind them, so a history tool such as Grafana can show whether a
  flare-driven blackout is building or already decaying, and give days of
  lead on a polar cap absorption event.

## [0.25.0] - 2026-08-21

### Changed

- **The weekly Advisory Outlook now stays on one path.** It used to publish to
  `notifications.noaa.swpc.advisory_outlook.<bulletin number>`, so every Monday
  the notification a client was watching went quiet and a sibling appeared at a
  new path. It now publishes to `notifications.noaa.swpc.advisory_outlook`
  itself, with the bulletin number carried in the value's `shortId` field. The
  per-bulletin paths raised by earlier versions are stood down to `normal` on
  the first refresh after upgrading.

## [0.24.1] - 2026-08-21

### Added

- **Community health files.** `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`
  (Contributor Covenant 2.1), `SECURITY.md`, GitHub issue forms for bugs and
  feature requests, and a pull request template. The bug form asks for the
  plugin version, server version, hardware and log up front, which is what
  makes a report actionable. Security reports go through a private GitHub
  advisory rather than a public issue.
- The README now says where to take a bug, an idea, a patch or a vulnerability,
  and names the licence in the body rather than only in `LICENSE`.

## [0.24.0] - 2026-08-20

### Changed

- **The webapp's statusbar carries the verdict.** The severity chip and the
  countdown moved out of the hero tile and into the bar, and what was left of
  the hero merged with the advisory into one tile. On a 1280 viewport the Kp
  panel now starts at 226px rather than 289px; on the 800x480 kiosk the bar is
  one row of 42px rather than two of 69px. The header compacts at 900px rather
  than 760px, because 800 is the width this was drawn for and the bar cannot
  hold the countdown and the local time on one row there.
- **The vessel name is gone from the webapp**, and `navigation.position`'s
  sibling `name` path is no longer read at all. Position moved to the aurora
  tile, where it reads as that map's extent ("+/-25 degrees latitude around
  47.6578, -122.3773") -- centring the map was the only thing the page ever
  did with it.

### Added

- **`npm run dev:webapp`** serves `public/` against fabricated Signal K data
  with a state switcher, so the webapp's five hero states -- including a G4
  storm and "no data since the plugin started" -- can be worked on without a
  Signal K server running. Dev-only: no dependencies and nothing imports it.

## [0.23.0] - 2026-08-20

### Added

- **The two indices an HF operator was still missing.** The estimated
  planetary A index publishes at `environment.noaa.swpc.a_index`, from NOAA's
  WWV geophysical alert bulletin, and the SESC sunspot number at
  `environment.noaa.swpc.sunspot_number`, from the daily solar indices table.
  With the 10.7cm flux and Kp the plugin already had, that completes the phrase
  every club bulletin, contest forecast and WWV broadcast states conditions in:
  SFI, A, K, SSN.

  A is the linearised daily average of the 3-hourly K, and stays high after K
  has dropped — a disturbed field, degraded high-latitude paths, noisy bands.
  SSN is the slow one: whether the high bands open at all this month.

  Neither carries `zones`, so neither can raise a notification. Both describe a
  day that has largely already happened, and everything they would raise the Kp
  forecast and the alerts have already raised sooner and louder.

  Both are dimensionless, so neither carries `units`. Together they cost about
  7 KB a day on the wire; there is no setting for either, for the reason
  `docs/noaa-products.md` gives.

- **The webapp status bar shows the phrase**: `SFI · A · K · SSN`, with each
  term left as a gap when its reading has not arrived rather than shifting the
  others along. K keeps the one decimal the Kp panel shows rather than WWV's
  spoken integer, so a Kp of 4.7 cannot read as the G1 storm it isn't.

## [0.22.1] - 2026-08-20

### Changed

- **The test suite is type-checked.** `tsconfig.json` excludes `test/` because
  the build compiles `src/` into `dist/`, and vitest transpiles without
  checking types, so nothing checked them at all: a test double that had
  drifted from the interface it stands in for only showed up as an `undefined`
  at runtime. `npm run typecheck` covers `src/` and `test/` together and runs
  as its own CI job. No change to what the plugin publishes or how it behaves.

## [0.22.0] - 2026-08-20

### Changed

- **The 27-day outlook moved under the Kp forecast.** Its six paths are now
  `environment.noaa.swpc.kp.forecast.outlook27.*` instead of
  `environment.noaa.swpc.outlook_27day.*`. The outlook is the same index and
  the same G mapping as the Kp forecast at a third horizon, so a consumer
  asking what the worst Kp coming is should not have to know which NOAA
  product answered. It is a branch under `forecast` rather than a sibling of
  `max24h` and `max72h`, because a whole-day maximum from a recurrence
  forecast is not interchangeable with a 3-hourly value. The old paths are
  gone with no alias: they shipped in 0.14.0 flagged as pre-release, and
  nothing in the plugin or its webapp reads them.

## [0.21.1] - 2026-08-14

### Fixed

- **Saving from the configuration screen clears out settings that no longer
  exist.** It used to write its own keys over whatever was already in the file,
  so a config that had been through a few releases kept every key it had ever
  been saved with — `notificationVisual`, `minScaleAlert`,
  `observationsInterval` and the rest sitting alongside the ones in force, with
  nothing to say which was which. It now writes the six current settings and
  nothing else. Nothing about what the plugin runs changes: all six are written
  explicitly, so an old key that was being migrated had already been superseded
  by the value next to it.

## [0.21.0] - 2026-08-14

### Changed

- **The aurora button works with automatic updates switched off.** That setting
  now governs the recurring fetch and nothing else: it says what the plugin may
  spend on its own initiative, and pressing a button is not the plugin's own
  initiative. Leave the two-hourly fetch off and ask for a reading on the night
  you want one — the probability, the map and the chart overlay tiles all come
  from that single fetch, the same as they would from a scheduled one.

  Before this, the button was there and enabled and could not succeed, and the
  map's **Retry** re-read the same empty cache for as long as anyone was willing
  to press it. The only route to one aurora reading was to turn the recurring
  fetch on, wait out an interval, and turn it off again.

- **The aurora tile says which kind of "nothing yet" it is showing** — waiting
  for a schedule, waiting for somebody to ask, or a plugin that is not running.
  The three used to render as the same sentence, and only one of them was ever
  true. When a reading did come from a press, the tile now says so, because
  "observed 21:40" on a tile that will never update again reads as live.

- **A manual fetch restarts the aurora interval** rather than being spent on top
  of it, and a press while a scheduled fetch is already running waits for that
  one instead of starting a second. A press near the tick used to buy the
  145 KB payload twice. The minimum spacing between fetches is now measured
  from the last fetch rather than the last press, so a scheduled one holds it
  down too.

- **Chart overlay tiles now say how old the oval is**, as a `Last-Modified`
  header taken from the fetch behind them. The webapp always showed it; a chart
  plotter had nothing, and with automatic updates off the grid moves only when
  somebody asks for one, so it can be days old without anything being wrong.
  Reported rather than enforced — the plugin serves what it has and leaves
  "too old" to whoever is navigating by it.

- **A refused fetch says which refusal it hit** — how many seconds are left on
  the cooldown, waiting for a GPS fix, not logged in, the plugin not running,
  an error from NOAA — where all five used to read "Refresh failed". Being told
  to wait for a position is the difference between a fault and a countdown, and
  a fetch that never left the server no longer costs the minute either: NOAA is
  asked for nothing until the vessel has a position, so there is nothing for the
  cooldown to bound.
  A fetch that came back with nothing usable now reports that as a failure,
  instead of quietly reporting success over the reading that was already there.

## [0.20.0] - 2026-08-13

### Changed

- **The two thresholds are now lines you drag across the ladder.** A threshold
  is a boundary, so the configuration screen draws it as one: the line rests on
  the row its band opens at, and the band is everything above it. Push a line
  above Extreme and its band is empty — that is "Never", arrived at by running
  out of storms rather than by picking the word out of a list.

  The table that showed what the setting *did* is now the setting itself, so
  there is nothing on the screen that is not either a decision or the result of
  one. Drag a grip, or focus it and use the arrow keys; Home and End go straight
  to the ends.

  The dropdowns have not gone anywhere — they are what a server renders when the
  plugin's own screen fails to load, and they still offer every level plus
  "Never". Both controls resolve a pair of thresholds identically, so it makes
  no difference to what gets saved which one you used.

- **The ladder says how often each level happens in words**, the same words the
  dropdown uses — "several times a decade", "once or twice a year" — rather
  than a count of storm days per year. The counts came from a median year, and
  at that resolution Extreme rounds to zero, which reads as "never" for the
  level the alarm defaults to. The words also carry the uncertainty the
  measurement supports, where a bare number claims more than it can.

## [0.19.0] - 2026-08-13

### Added

- **Popups and alarms are now two separate settings.** "Sound an alarm at…"
  is visible and audible; "Show a popup at…" is visible and silent, from its
  level up to the alarm. Each names the level its own band opens at and says
  nothing about the other.

  The old single setting derived the quieter rungs from the loud one — one
  level below it popped up, two below it was listed — which meant no label
  could be true. Whatever the dropdown claimed, the level underneath it was
  doing something too. The "Never" option added in 0.18.0 made that plain: it
  left the control named after a sound it had just removed. Splitting the
  setting fixes the wording by making it unnecessary. "Never" is now offered on
  both, and reads as plain "Never" on each, because the other one says what
  still happens.

  Silencing the alarm also stops dragging the popup band down a level with it.
  It stays where it was put.

- **Strong (3) and above is now always listed**, however quiet the two
  settings are. A listed event carries an empty method array: it appears in
  the notification list and interrupts nobody. A G3 happens several times a
  year, and there should be no setting at which one leaves no trace at all.

Nothing changes for an existing configuration. A config saved before this
release keeps the exact ladder it had, including one saved as "Never".

## [0.18.0] - 2026-08-13

### Added

- **"Never" is now a choice on the alarm level.** Every option so far sounded
  at some level; there was no way to say "show me everything, wake me for
  nothing" — a reasonable position on a boat where somebody is already watching
  the screen, or on a delivery where a 3 a.m. buzzer costs more than a missed
  G5.

  It removes the sound, not the storm. A G5 still raises a popup and a G4 is
  still listed; only the audible state goes away. Silencing by treating every
  level as routine would have hidden an Extreme event outright, which is not
  what "never sound an alarm" should mean.

  The dropdown reads "Never — show everything, sound nothing", deliberately not
  as a severity. This plugin has shipped a setting that looked loud and was
  silent before, and the label is the whole difference between that bug and
  this feature. The configuration screen's ladder shows it like any other
  choice: pick it and the table redraws with no `alarm` row.

## [0.17.0] - 2026-08-13

### Added

- **The plugin's configuration screen is now the plugin's own, and it costs
  the bandwidth out for you.** Signal K lets a package replace the form the
  server generates from its JSON schema; this release takes that up. Every
  setting is the same setting, saving the same values — what changes is that
  the screen can now compute, and that it is laid out for the reading rather
  than for the schema. The weekly Advisory Outlook leads, since it is the one
  choice that needs no arithmetic, and its label links NOAA's own page so a
  bulletin can be read before deciding to receive them. The alarm ladder and
  the aurora setting link NOAA's pages for the scales and the aurora forecast
  the same way.

  What it computes first is the download budget. Under the two interval fields
  is a running total: what the observations, forecasts and alerts cost per day,
  what the aurora grid costs per day, what the weekly and daily bulletins cost
  on their own cadence — a floor of a few KB that neither interval moves — and
  all of it per day and per month. It moves as you type. Set aurora to every
  fifteen minutes and it says 13.7 MB a day and 411.5 MB a month, before you
  save.

  That number was previously a sentence — "about 1.7 MB a day" — which was true
  at the default two-hour interval and silently wrong at every other. Anyone
  who tightened the interval to get a fresher aurora map was reading a figure
  eight times under what they were about to spend, on a link where that is
  metered. The sentence is gone; the schema description now states the measured
  per-fetch size and leaves the arithmetic to the screen that can do it.

  The screen also says when the plugin is running values that were never
  saved — a default, or an alarm level carried across from the setting it
  replaced two releases ago. Saving writes all five explicitly and the notice
  clears.

- **The alarm ladder is a table now, and it redraws as you choose.** One
  setting decides four outcomes across five levels, and until now that mapping
  was a sentence you had to reassemble in your head while looking at a
  dropdown. Under the dropdown is a row per NOAA level: the notification state
  it raises, whether that pops up, makes a sound or does neither, and how many
  days a year a geomagnetic storm reaches it. The rows that do nothing but get
  written down are green rather than greyed out, because quiet is the plugin
  working, not a disabled setting. Change the dropdown and the whole table
  moves, so the consequence is visible before you commit to it.

  The rows are the plugin's own behaviour, not a description of it: the table
  is generated from the same rule `stateForScaleValue` applies, and a test
  fails the build if the two ever disagree at any of the thirty combinations
  they cover.

- **The screen says what the sky is doing, and where that lands on your
  choice.** Under the ladder: the G, S and R levels observed now, the current
  Kp, which of them is worst, and the row that one is sitting on — "the worst
  in force is G2, which at this setting is `alert` — listed, no popup, no
  sound" — plus the highest Kp forecast for the next 24 hours and the storm
  level it would reach. It moves with the dropdown too, so a level can be
  judged against a real day rather than an abstraction.

  It reads the paths the plugin already publishes and adds no fetching of its
  own. When nothing has been published it says nothing at all rather than
  reading as quiet — the plugin's status and last error sit a few lines above,
  which is the better place to find out it is not working.

### Changed

- **The aurora setting says what it is for.** It read "Publish aurora
  visibility at the vessel position", which named the smallest of the three
  things it does and led with a precondition. It now reads "Fetch NOAA's
  aurora forecast grid", and says that the grid draws the webapp's aurora map
  and the chart-overlay tiles as well as publishing the probability at the
  vessel position — and that nothing is fetched at all until there is a
  position. Same setting, same default; the schema form gets the same wording.

- The configuration screen follows 0.16.0's G banding, so the level it reads
  off a Kp is the level everything else publishes, and its ladder quotes
  0.16.1's re-measured storm-day rates — the same figures the alarm-level
  dropdown carries.

- `GET /signalk/v1/api/signalk-noaa-space-weather/status` now reports the
  settings the plugin is running alongside its start time. These are the
  settings after defaults and migration have been applied, which is not the
  same thing as the saved configuration, and is what lets the screen above tell
  the two apart.

### Notes

- The generated form has not been removed and is not going anywhere: a server
  older than this mechanism, or one where the panel fails to load, still gets
  it. `plugin.schema` remains the source of truth for defaults and for the
  migration of superseded keys, both of which stay on the server.
- The panel ships as plain JavaScript, with no bundler and no dependencies
  added to this package. The admin UI loads it on every page it draws, so it
  had to stay small.

## [0.16.1] - 2026-08-13

### Changed

- **The alarm-level dropdown's top option now says "several times a decade"
  where it said "once or twice a decade".** 0.16.0 moved the G bands onto
  NOAA's Kp thirds but could not re-count the storm days behind the labels, so
  every rate in `docs/noaa-products.md` was still the one measured under the
  old integer banding. Counted again over the same 94 years of GFZ's archive,
  the median year holds 72 G1+ days rather than 53, 27 G2+ rather than 20, 10
  G3+ rather than 7, and 3 G4+ rather than 2.

  G5 moved furthest, because the third of the scale it gained — Kp 9− at
  8.667 — is where most extreme days actually are: 34 of the 94 years have a
  G5 day, against 17 under the old banding. The median year still has none,
  which is why the label counts in decades rather than years, but "once or
  twice" was about three times too quiet for the level this plugin now alarms
  on by default.

  The other four labels still describe their new numbers and are unchanged.
  Nothing about the setting itself moved — same field, same five values, same
  behaviour at each of them.

## [0.16.0] - 2026-08-13

### Changed

- **The G scale is now banded where NOAA bands it, so storms near a boundary
  grade one level higher than before.** Kp is reported in thirds, and NOAA's
  `G4 = Kp 8` means the whole 8 band — 8−, 8o, 8+ — which starts at 7.667. This
  plugin banded on the integer instead, so every boundary sat a third of a step
  high: a Kp of 8− was published as G3 here while NOAA's own page called the
  same storm G4, and 7− was G2 here and G3 there. Bands now open a third below
  the Kp they are named after: G1 at 4.667, G2 at 5.667, G3 at 6.667, G4 at
  7.667, G5 at 8.667.

  **This will make some installs noisier.** A third of the Kp scale moves up a
  level, and at the default `alarmLevel` of 5 a Kp of 9− (8.667) now sounds an
  alarm where it previously showed as a visual-only G4. Anyone who wants the old
  loudness back has `alarmLevel`; there is no way to have NOAA's grading and
  the old thresholds at once, and matching NOAA is the point.

  It moves published values as well as notifications: `maxNoaaScale` on the Kp
  forecast and the 27-day outlook, the Kp path's zone metadata, the G level the
  webapp's hero banner shows, the G1–G5 threshold lines on its Kp chart, and
  "next storm", which now means the next Kp reaching G1's floor rather than a
  flat Kp 5.

  The storm-day rates quoted by the alarm-level dropdown and by
  [`docs/noaa-products.md`](docs/noaa-products.md) were measured under the old
  banding and now read low — wider bands take in more days. The labels are
  unchanged, and the table is marked as pending a re-run of
  `scripts/measure-kp.mjs` rather than adjusted by hand.

## [0.15.3] - 2026-08-13

### Fixed

- **No icon on the admin Webapps page** — a broken image, while the App Store
  page a click away showed it correctly. `public/icon.svg` had been made a
  symlink to the root `icon.svg` to avoid maintaining two copies of the same
  artwork, and npm's packlist skips symlinked files rather than following
  them: 0.15.0's tarball shipped `public/index.html` and `public/hero.js` and
  no icon at all, so the URL the Webapps page loads had nothing behind it.

  The two paths are both still needed — the App Store resolves
  `signalk.appIcon` server-side against the package root, the Webapps page
  loads the top-level `appIcon` as a URL under the webapp's mount, and
  signalk-server serves `public/` as that mount. So there is still one icon to
  maintain, but the second copy is now generated from it by
  `scripts/sync-icon.mjs` on `prebuild` and `prepare`, and gitignored the way
  `dist/` is. A new icon reaches both readers by being committed.

  The previous test compared the two files' contents, which a symlink passes
  trivially — it read the root icon twice. It now also asserts the copy is a
  regular file, and since the copy is no longer in git, the test fails on a
  fresh clone if the generation ever comes undone.

## [0.15.2] - 2026-08-13

### Changed

- **The README pictures the hero banner in the states a quiet day hides.** Its
  screenshots showed the webapp as it was before 0.15.0, and the one state a
  live server almost always has is the one that needed showing least. Four
  crops of the banner alone now cover a storm in force, a storm forecast, the
  quiet after one, and stale data.

## [0.15.1] - 2026-08-13

### Fixed

- **The alarm-level dropdown quoted event rates about twice what an ordinary
  year sees.** The labels came from NOAA's published per-cycle event counts
  divided by eleven, which describes an average solar cycle rather than the
  year you are in — and NOAA's long-run average includes cycles stronger than
  any since. Storm days also cluster into a roughly five-year active stretch,
  so a per-cycle average is loud in the peak years and wrong in the rest.

  The labels now quote geomagnetic storm days in a **median** year, measured
  from GFZ's Kp archive over the 94 complete years from 1932 to 2025 and banded
  the way this plugin's own zones band, not the way NOAA's scale page does.
  Levels 1 and 2 are unchanged; 3 moves from "about monthly" to "several times
  a year", 4 from "a few times a year" to "once or twice a year", and 5 from
  "once every few years" to "once or twice a decade".

  Saying what the rate *is* meant saying what it is a rate of, so the same
  field now names its own terms: the title reads "Sound an alarm at…" and the
  description gives the median-year basis, notes that the rates roughly double
  during a cycle's active stretch, and spells out the ladder the choice sets —
  one level below shows a popup without sound, two below is listed silently.

  The setting itself is untouched — same field, same five values, same
  behaviour. Only the words changed, and a saved configuration means exactly
  what it meant before. `scripts/measure-kp.mjs` regenerates the table in
  [`docs/noaa-products.md`](docs/noaa-products.md) from the source archive, so
  the numbers can be re-derived rather than trusted.

## [0.15.0] - 2026-08-13

### Changed

- **The webapp's hero banner no longer calls a day "quiet" when something
  happened on it.** It said "space weather is quiet -- no storm scale has
  reached strong" whether the last 24 hours had been genuinely empty or had
  carried a G2, which reads as "nothing happened" when the honest claim was
  only "nothing crossed our threshold". It now reads NOAA's 24-hour observed
  maximum -- already published, never displayed -- and says what the peak was.

  The banner also stopped folding the forecast into the present. A G3 expected
  tomorrow used to render exactly like a G3 happening now. Those are separate
  states, and the one still coming wins: quiet-now-with-a-storm-ahead says so,
  and counts down to it.

  Two storms at once are both reported. The worst leads, ties break G before R
  before S -- by what the level costs a boat, not alphabetically -- and every
  other scale at level 3 or above adds its own line, so a G4 with an S4
  alongside no longer hides the polar HF blackout. The effects come from NOAA's
  own scale descriptions, per level, so a G5 and a G3 no longer read alike.

- **The hero's countdown always counts something real.** It showed an amber
  em-dash whenever no storm was forecast, which reads as an alarm rather than
  as an absence, and it counted toward the next storm even while one was
  already running. It now counts to whatever changes next: the level above the
  one in force, the drop back down, or the forecast storm ahead. With nothing
  forecast it reads 00:00 against "no storm inbound", and when there is no
  forecast at all it says so in the same colour as stale data -- not knowing is
  not an all-clear.

- **An empty page now distinguishes "starting up" from "stopped working"**,
  using the plugin's own start time. Stale data says plainly that this is not
  an all-clear.

- **The Kp chart marks where measurement ends and prediction begins**, with a
  dotted divider and UTC day boundaries. The divider was already there and
  solid, which made it read as part of the plot.

- **The top row is a little less top-heavy**: the hero takes seven columns
  rather than eight, and the advisory teaser is trimmed to two lines, taking
  60px off the page. The trim is measured rather than a CSS line clamp, whose
  single-glyph ellipsis is one cell wide in this tile's monospace font and
  vanishes; three periods do not.

## [0.14.3] - 2026-08-13

### Fixed

- **The webapp's aurora panel quoted the wrong payload size.** Its empty state
  justified aurora being off by default with ~900 KB, which is the decoded
  size; the fetch costs ~145 KB on the wire, so the bandwidth argument it was
  making overstated itself by about six times.

### Changed

- **Facts that were stated in several places now have one home each.** An audit
  found thirteen such facts, three of which had already drifted apart: the
  number of messages in an alerts payload (documented as 88–200, actually
  118–200 across the captured fixtures), the number of notifications a quiet
  day raises, and a claim that the April 2025 storm produced an audible
  notification at the default alarm level — no captured payload does, since
  that storm peaked at an observed G4, which is visual-only until `alarmLevel`
  is lowered to 4. Storm-frequency rates are flagged as provisional pending a
  measured replacement rather than restated.

## [0.14.1] - 2026-08-12

### Added

- **The plugin now reports when it started**, at
  `/signalk/v1/api/signalk-noaa-space-weather/status`. Until now a webapp with
  no values could not tell "the first fetch has not landed yet" from "this has
  been running since breakfast and NOAA is unreachable" — Signal K keeps no
  trace of a value that was never published, so both look like an empty page.
  The start time is the one fact that separates them.

## [0.14.0] - 2026-08-12

### Added

- **The 27-day outlook, under `environment.noaa.swpc.outlook_27day`.** Every
  other forecast here stops at 72 hours; this one runs a full solar rotation at
  one row per UTC day. Published as the peak Kp over the window, the day it
  falls on, its G scale, the first day forecast to reach storm level, and a
  `series` of the 27 daily rows (10.7cm flux, planetary A index, largest Kp)
  for plotting.

  **None of it carries `zones`, so none of it raises a notification.** 27 days
  is the solar rotation period, which is the whole basis of the product: it
  assumes the same coronal holes come back around, so it is a recurrence
  estimate rather than a forecast with the skill of the 3-day products, at a
  tenth of their resolution. A G1 day falls somewhere in a 27-day window
  roughly monthly — the captured fixture has two — so putting it on the alarm
  ladder would fire constantly on low-confidence data and dilute the 3-day
  alerts that are worth interrupting for.

  No new setting, and a deliberately slow poll: NOAA issues the outlook weekly
  as part of its Weekly Highlights bulletin, so it is fetched once a day rather
  than on `updateInterval`. 451 B on the wire, about 3 KB a week.

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
    bandwidth is ~5 KB gzipped per poll — about 120 KB a day — not the 71–146 KB
    the fixtures suggest: NOAA serves the endpoint gzipped and Node's fetch asks
    for it.
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
  reports a lower level. Measured over the three archive fixtures this is one
  episode per geomagnetic storm: none in April 2025, 5.5 hours in the 16 April
  storm, and 22 hours over 4–5 July 2026. Levels arriving in ascending order —
  a storm ramping up — are untouched.

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
