# Design decisions

Settled arguments behind constraints named in [`CLAUDE.md`](../CLAUDE.md).
That file keeps the imperative and the issue number; the defence for each one
— why the alternative was rejected, what it cost when it was tried — lives
here instead, so it isn't reloaded into every session's context.

## Alerts are keyed by message code, not serial number

`/products/alerts.json` is a rolling 30-day archive, not a list of current
conditions: a couple of hundred messages per payload (docs/noaa-products.md
has the counts), nearly all describing events that ended weeks ago, and NOAA
mints a fresh serial number every time it extends or continues one condition.
Publishing a notification per entry keyed on the serial number — which is
what 0.11 and earlier did — raised a permanent notification for every one of
them at once and made a Pi 5 unusable
([#45](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/45)).

So: one path per **message code** under `ALERTS_BASE`, only while the message
is in force, and withdrawn ones actively set back to `normal`.
`currentAlertNotifications` in `parse.ts` owns all of that and is the thing to
change; don't reintroduce a per-message loop in the product.

## Loudness is two ordered thresholds, not one

`methodForState` is the single policy for whether a state interrupts the
user, and `zoneMethods` is derived from it so a NOAA level reads the same
whether it arrives as a zone transition or as a message. State is its only
input. Don't add a per-method override: it mutes every product at once, it is
a preference about the notification client rather than about space weather,
and measured against the fixtures a pair of visual/sound checkboxes changed 0
of 4 notifications on a quiet day.

**Alarm thresholds are deliberately conservative.** NOAA's frequency tables
put a level 1 event on roughly a quarter of all days and a level 5 on about
four days per 11-year solar cycle. Alarming below level 3 is noise on a boat.
Default mapping: 0 `nominal`, 1–2 `normal`, 3 `alert` with an **empty method
array**, 4 `warn` (visual), 5 `alarm` (visual + sound). Do not make this
louder without a frequency argument.

**That conservatism is about notifications, never about what the page says.**
The webapp describes conditions in NOAA's own vocabulary — None / Minor /
Moderate / Strong / Severe / Extreme, `SEV_WORDS` in `index.html`, mirroring
`NoaaScaleNames` in `parse.ts` — because "what is the sky doing" is a fact
and "how loud should this be" is a preference. The two got answered with one
word once: the banner carried the notification-state ladder, so an R2 that
NOAA's front page and the WWV bulletin both called *moderate* rendered as
**Quiet**, in the quiet green, with `Normal` under the badge
([#126](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/126)).
So `heroState` describes any level in force, `ALERT_FLOOR` only decides
precedence there, and level 2 has a colour step of its own. `quiet` means
level 0 in force *and* level 0 over 24 hours, and `hero.test.ts` pins that
nothing else reaches it.

**The hero reads both observed scale paths, and needs both.**
`observations/latest` is an instantaneous sample that is 0 in every payload
in `examples/`, including the day whose 24-hour maximum was G4
([#120](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/120));
`observations/24_hours_maximums` is what NOAA's front page and WWV report as
the day's condition. So the maximum decides what the banner *says* and the
instantaneous reading decides whether it is still running — `storm` versus
`recent`, or above the floor, `storm` versus `all-clear`. Leading from either
one alone puts the page back to reporting R0 through an R2.

**Two thresholds, each naming the level its own band opens at** —
`alarmLevel` sounds, `popupLevel` is visible and silent. Both are boundaries,
and that is the point of there being two: a single anchor with the quieter
rungs derived from it cannot be labelled honestly, because whatever the
dropdown claims, the level below it is doing something too. Every candidate
wording for the old one-knob control was false somewhere — "Notify me from 5"
notified from 3, and "Sound an alarm at…" named a sound the "Never" option
had just removed
([#71](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/71)).
Don't collapse them back into one.

The two are ordered — `popupLevel` is never louder than `alarmLevel`, since
above it the popup band would name levels the alarm has already taken — and
`settingsFrom` clamps the pair on the way in whatever the panel saved. Both
offer the full scale plus `ALARM_NEVER`. Neither range is clipped to the
levels a skipper would sensibly pick: clipping would also strand an existing
config that asked for something outside it.

`ALARM_NEVER` is exempt from that clamp on `popupLevel`, and the panel does
not drag the alarm up to meet it either. It is the one value above the alarm
that is not a mistake: the rest are inert by accident, that one asks for no
popup band at all. Clamping it redraws a chosen "Never" as a level on the
next load — the exact dishonest control the split was for — and, below
`ALERT_FLOOR` where the quiet rung follows the popup band down, it changes
behaviour too.

`ALERT_FLOOR` is level 3, and nothing turns it off. A G3 is several a year,
so there is no setting at which one should leave no trace — and `alert`
carries an empty method array, so being listed costs the user nothing but a
line. The quiet rung also follows the popup band down below the floor, rather
than leaving a gap of `normal` between two adjacent bands.

`ALARM_NEVER` is a value one past the scale, so no level reaches that band:
on `alarmLevel` it removes the sound, on `popupLevel` the popup. It is named
"Never" in both dropdowns and needs no explanation of what still happens,
which is exactly what the split bought — the other dropdown says so in its
own words.

Do not reintroduce a control that derives *upward* from a "worth your
attention" pivot. That runs off the end of a five-level scale: the pivot at 4
could never reach `alarm`, and at 5 never even `warn`, so the two
loudest-*sounding* choices in the dropdown were the two that silenced the
plugin. `stateForScaleValue` carries the argument, and `zones.test.ts` pins
that no threshold pair silences the level it names and that lowering either
one is monotonically louder.

## Thresholds are lines on the ladder, not dropdowns

In the panel the two thresholds are lines drawn across the ladder, not
dropdowns. A threshold is a boundary, so it is drawn as one: the line rests
on the bottom edge of the row its band opens at, and the band is everything
above it. `ALARM_NEVER` rests above the top row, where the band is empty —
"Never" is reached by running out of storms rather than by picking a word for
it. The table that showed the consequence of the setting *is* the setting, so
nothing on screen is neither a decision nor a result of one.

Two things about that are load-bearing. The line is a CSS border on the cells
of its row, so the browser places it and nothing measures a row height or
listens for a resize; it goes on the cells rather than the `tr` because
Bootstrap draws table borders cell by cell and a border on the row loses to
it. And the grips sit in a lane per kind, so two lines landing on one row sit
side by side rather than on top of each other, and neither grip slides
sideways as it moves up and down.

The grips are `role="slider"` with `aria-valuetext`, because the value is on
a scale and "5" on its own says nothing about what happens at 5. `stepLevel`
returns `null` for any key the grip does not claim, which is what keeps Tab
working — a boundary that swallowed it would be a keyboard trap. The
dropdowns still exist in the JSON schema and are what a server renders when
the panel fails to load, so both controls have to resolve a pair the same
way: `withLevel` is the panel's clamp and `config-panel.test.ts` pins that
nothing it can produce is a pair `settingsFrom` would rewrite.

## `main` must stay in package.json

The server loads plugins with `require()` on an absolute directory path, and
Node's CommonJS resolver ignores `exports` in that case. Removing `main`
reintroduces
[#1](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/1).

## NOAA changes payload shapes without notice

This has happened at least twice and both times it silently broke published
data:

- the solar wind summaries went from `{"Bt": 5, "Bz": -3}` to
  `[{"bt": 4, "bz_gsm": -1}]`, which made the plugin publish `NaN` for months
- the planetary K-index forecast alternates between a header-row table and a
  list of records

## A global grid is worth fetching before there is anywhere to index it

Aurora and D-RAP both used to check for `navigation.position` and return
before spending a fetch. That looked frugal and was not: NOAA serves one grid
for the whole globe, the same bytes wherever the boat is, so a position
changes nothing about what the fetch costs or returns. What it bought was a
plugin that published nothing at all until a GPS fix arrived — no map, no
chart-plotter tiles, no cached grid — and a configuration panel that had to
explain the dependency to the reader twice.

So the fetch is unconditional, the grid is cached
(`src/cache/entryCache.ts` and the two wrappers over it), and the value at the
vessel is published *out of* the cache — straight away when there is a
position, and otherwise the moment one turns up. `refresh()` says which by
returning `'awaiting-position'`, and the scheduler then retries through
`publishFromCache()` rather than through `refresh()`, on the same geometric
backoff: waiting for a fix is exactly the case that must not turn into repeat
NOAA traffic. The retry gives up after one interval, at which point either the
recurring schedule takes over with a fresh grid — an overlay drawn from an
hours-old capture is worse than one that says it has nothing — or, for an
unscheduled product refreshed once by hand, there was never anything more to
do. That last case is why the position-retry timers are a separate map from
`productTimers`: membership of `productTimers` is what says a product is on a
schedule, and a manual refresh must not quietly become one.

## `auroraEnabled` and `drapEnabled` govern the schedule, not the capability

Either setting says what the plugin may spend on its own initiative; a press
is not the plugin's own initiative. So `aurora-refresh` and `drap-refresh`
fetch whether or not the product is scheduled, and the setting being off is exactly the case it
exists for — otherwise the only route to one aurora reading is to turn the
recurring fetch on, wait out an interval, and turn it off again, which is four
steps and leaves a recurring cost behind when the last one is forgotten. Four
things fall out of that and none are optional:

- `start()` publishes `metadata()` only for the products it schedules, so the
  route publishes the product's metadata before the first value. Without it the
  value lands on a path with no units, no zones and no display name.
- A successful manual fetch defers the next scheduled run by a full interval.
  The payload has just been bought; a refresh a minute before the tick must
  not buy it twice, which is the same argument the two-hour default rests on.
  Deferring cannot cover a run whose timer has already fired, so `refreshOnce`
  holds one refresh per product and a second caller joins it rather than
  starting its own.
- The cooldown counts fetches, not presses — a scheduled one holds it down
  too. It no longer needs a refund path: every refresh now reaches NOAA, so
  the stamp is unconditional. While the grid products waited for a fix, one
  could return having sent nothing, and the stamp had to be rolled back so a
  boat still waiting for its first position was not also made to wait out a
  cooldown for traffic it never sent.
- A `refresh()` that returns without publishing is not a success. It returns
  normally when the payload carried no usable grid, so the route compares the
  cache's `fetchedAt` across the call and answers 502 when nothing new
  landed; otherwise the button reports a refresh that did not happen, over a
  reading that has not moved. `'awaiting-position'` is not one of those cases:
  the grid is what was asked for and the grid arrived.

The webapp may never turn its own polling into a NOAA fetch — the map draws
from cache, the poll reads Signal K, and only a press reaches NOAA.
`plugin.test.ts` pins that an on-demand fetch starts no schedule of its own.

## Tile rendering must not block the event loop

Measured on a 20-tile screenful: `zlib.deflateSync` back-to-back blocks for
the whole 75ms with zero timer ticks, while awaiting the async form one tile
at a time holds the worst lag to ~2.5ms for 11ms more wall clock.
`Promise.all` over tiles is worse than either — it runs every rasterize
synchronously before awaiting anything. This is a plugin inside somebody's
navigation server; it does not get to stall it.

## The icon lives in two places, and the second copy is generated

The App Store resolves `signalk.appIcon` server-side against the package
root, so `./icon.svg` works there. The admin Webapps page reads the
*top-level* `appIcon` and loads it as a plain URL from the browser, and
`mountWebModules` in signalk-server serves `public/` as the webapp's root
when that directory exists — so the file has to be at `public/icon.svg` or
the page renders a broken image. A symlink cannot be that file: npm's
packlist skips symlinked files instead of following them, and the copy is
simply missing from the tarball. `scripts/sync-icon.mjs` generates it on
`prebuild` and `prepare`; it is gitignored like `dist/`, and `icon.test.ts`
fails if the wiring comes undone.

## The dev server finds this plugin by symlink

The server finds plugins by scanning `node_modules/`, not by reading
`package.json`: `findModulesInDir` in signalk-server's `src/modules.ts` walks
each directory under `<configPath>/node_modules/` and checks that package's
own `keywords` for `signalk-node-server-plugin`. So a symlink dropped into
`~/.signalk/node_modules/` is enough to wire this plugin in, with no
dependency entry and no `npm install` — which matters, because installing
anything in that directory re-resolves every caret range in it and can upgrade
plugins you weren't touching.

`~/.signalk/node_modules/signalk-noaa-space-weather` is that symlink, and it
should stay one: a rebuild here reaches the server with no reinstall, which is
the whole point. Recreate it with `ln -s` if something replaces it — an `npm
install` in that directory will, since the `file:` dependency entry installs
as a *copy* of the packed files instead. Don't "fix" that with `npm link`: it
writes a `link:` spec that npm 9 refuses to install at all with
`EUNSUPPORTEDPROTOCOL`, which is what broke `~/.signalk-dev`.

## A merge does not publish; `release.yml` does, on a debounce

The version number is decided **before** the merge and the release happens
**after** it, and those are deliberately not the same moment.
`.husky/pre-commit` is the convenience and
`.github/workflows/version-gate.yml` is the guarantee — and only while the
ruleset requires the `version` check, since a red gate nothing requires can be
merged past.

`release.yml` runs hourly and tags `main` only once nothing has merged for
`RELEASE_WINDOW_HOURS`, so a busy afternoon ships one release when the
afternoon ends instead of one per pull request — 59 releases in the first 24
days is what the merge-publishes design cost. A `workflow_dispatch` run skips
the wait and flushes whatever is pending immediately; it skips nothing else,
since the tag is still what says what has already been published.

A version has to be ahead of the latest tag, never merely different from it: a
stale branch differs from it too, which is how
[#123](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/123)
squash-merged at a version already on npm and never published.

So the gate requires a version past the latest tag and pointedly not past
`main`'s own. Between a merge and the window closing, `main` sits at a version
that has not shipped, and a second pull request is meant to *join* it there.
That shared number is the batching, and it is why released versions stay
contiguous instead of skipping the ones a second concurrent branch would
otherwise have minted. Only a tagged version is spent. Do not reintroduce a
check that a pull request be ahead of the base — it was there when every merge
published, and under the window it is exactly what puts the gaps back.
