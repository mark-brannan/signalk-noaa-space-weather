# Design decisions

Settled arguments behind constraints named in [`CLAUDE.md`](../CLAUDE.md).
That file keeps the imperative and the issue number; the defence for each one
— why the alternative was rejected, what it cost when it was tried — lives
here instead, so it isn't reloaded into every session's context.

## The "Learn more" links are ordered for our reader, not NOAA's menu

The strip runs scales explained, impacts, phenomena, then the general
overview. That is close to the reverse of the order spaceweather.gov uses in
its own "About Space Weather" menu, and the disagreement is deliberate.

NOAA's menu is ordered for someone arriving at spaceweather.gov with no
particular question, so it opens with the overview and files the scales
explanation last under Additional Info. Our reader arrives with the opposite
problem: they are already looking at a G/S/R badge, a Kp chart and an
absorption map, and the thing they most likely want explained is the number
in front of them. So the order runs most specific to what is on screen first
and general background last — the scales they are reading, then what those
conditions do to a vessel, then the phenomena behind them, then the overview
for anyone still curious.

This was reordered once to match NOAA's menu (#114) on the argument that a
reader who follows a link should not meet a different order on the other
side. That is true and it is not worth the cost: the ordering the reader
benefits from is the one in the app they are using, and the menu they land in
is NOAA's to arrange. Keep the existing order; the markup carries a comment
saying so.

## The sun mark is labelled "Subsolar point", not "Sun"

`drawSun` in `public/spaceMap.js` plots the point on the globe directly
under the sun — that's what D-region absorption is keyed to, not the sun
itself. "Sun" as a label was wrong on the merits, not just naive-looking:
the mark isn't the sun, it's a projection of it onto the earth's surface.
"Subsolar point" with "(Sun's zenith)" as smaller subtext under it says
what the mark actually is and reads clearly to anyone who doesn't know the
term.

Deferred, not decided: an info bubble on the mark, and drawing the
computed solar zenith angle at the vessel alongside it. Both are additive —
neither changes the label — and need their own scope call (bubble
placement/trigger on a canvas with no existing hover-bubble pattern; where
the zenith-angle number would live in `parse.ts`/`paths.ts` if it's ever
published as a Signal K value versus computed client-side only for the
map). Revisit when there's a concrete want driving one of them, same as
[The D-RAP map is the deliverable; a station list is not](#the-d-rap-map-is-the-deliverable-a-station-list-is-not)
argues for not building ahead of demand.

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
NOAA's front page and the WWV bulletin both called _moderate_ rendered as
**Quiet**, in the quiet green, with `Normal` under the badge
([#126](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/126)).
So `heroState` describes any level in force, `ALERT_FLOOR` only decides
precedence there, and level 2 has a colour step of its own. `quiet` means
level 0 in force _and_ level 0 over 24 hours, and `hero.test.ts` pins that
nothing else reaches it.

**The hero reads both observed scale paths, and needs both.**
`observations/latest` is an instantaneous sample that is 0 in every payload
in `examples/`, including the day whose 24-hour maximum was G4
([#120](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/120));
`observations/24_hours_maximums` is what NOAA's front page and WWV report as
the day's condition. So the maximum decides what the banner _says_ and the
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

Do not reintroduce a control that derives _upward_ from a "worth your
attention" pivot. That runs off the end of a five-level scale: the pivot at 4
could never reach `alarm`, and at 5 never even `warn`, so the two
loudest-_sounding_ choices in the dropdown were the two that silenced the
plugin. `stateForScaleValue` carries the argument, and `zones.test.ts` pins
that no threshold pair silences the level it names and that lowering either
one is monotonically louder.

## Thresholds are lines on the ladder, not dropdowns

In the panel the two thresholds are lines drawn across the ladder, not
dropdowns. A threshold is a boundary, so it is drawn as one: the line rests
on the bottom edge of the row its band opens at, and the band is everything
above it. `ALARM_NEVER` rests above the top row, where the band is empty —
"Never" is reached by running out of storms rather than by picking a word for
it. The table that showed the consequence of the setting _is_ the setting, so
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
vessel is published _out of_ the cache — straight away when there is a
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

## Both D-RAP surfaces draw NOAA's colorbar; the bands are contours over it

Both used to carry a palette of this plugin's own, one stop per marine SSB
band edge, on the argument `zonesForDrap` in parse.ts still makes: the
published value is a frequency, not a severity, and 9.9 MHz absorbed ends the
working day for someone on 8 MHz while meaning nothing to someone on 22. A
smooth rainbow over MHz draws a gradient across what is really a set of steps.

That was right about what a sailor needs and wrong about where to put it. A
picture of NOAA's grid that sits beside NOAA's own picture of the same grid
has to be the same picture — a reader who compares the two reads a mismatch as
a bug in this plugin, and they are not wrong to. So both surfaces draw NOAA's
published 0–35 MHz colorbar, sampled from the legend image because NOAA
publishes no numeric definition of it: `NOAA_DRAP_STOPS` in
public/drap-colors.js for the webapp's map and legend, the same table in
src/tiles.ts for the chart tiles, pinned identical by `drap-colors.test.ts`.
One cell in two colours on two screens on the same boat is the failure that
pin exists to prevent.

The band ladder did not go away, it changed shape. "Which of my bands has gone
under" is a set of thresholds, and thresholds draw as lines: `drawBandContours`
in public/spaceMap.js traces the cutoff where it crosses each marine SSB band
edge and labels the contour with the band's name. NOAA's bar answers how much
is absorbed; the contour answers what that costs this reader. It is drawn over
NOAA's colours rather than instead of them — additive, not a fork.

What survives from the old ramp is the treatment of the bottom of the scale.
NOAA's 0 MHz stop is `#000000` and neither surface can publish it literally:
an opaque black cell reads as a hole in the chart, or as no data on the
webapp's map, which is the opposite of what a quiet grid means. Both fade
alpha in from invisible at 0 MHz instead — a fade and not a cutoff, since a
crisp threshold contour is exactly what a reader over-trusts on a 2°×4° grid
— and reach *full* opacity by 4 MHz, because hue carries the severity now and
a half-transparent cell would carry a second, contradicting one: the same
violet composites to lavender over a paper chart and to near-black over a dark
page. The overlay puts that on the owner's own charts and gets no ground of
its own; the webapp's map has the opposite problem, below.

`DRAP_BAND_RAMP` in public/hf.js is still the band ladder, but only for the HF
Radio tile's band strip, which is a ladder rather than a field. It is no
longer a map palette and no longer pinned against src/tiles.ts.

## Band-edge contour labels are large, yellow, and offset from the line

At the size and colour the ramp's own labels first shipped at, "which of my
bands has gone under" was answered in text a reader had to hunt for: 13px
near-white sitting directly on the contour it named, on a canvas that is
mostly dark absorption and a hairline coastline in the same tonal range. A
label competing with the thing it labels for the same pixels is not legible,
it is technically present.

The fix is three changes to the same label, not one: roughly 2.3x the size
(30px, weight 800), a colour the ramp does not otherwise use at any severity
(`#ffe600`, a saturated yellow against a palette that runs
black→violet→orange→desaturated yellow), and a position pushed clear of the
line by most of its own height rather than centred on it, with a thin leader
stroke back to the point it actually marks — so the offset does not cost the
"which line is this" link that centring gave away for free.

Where on the contour still follows the existing rule: the topmost segment
inside the viewport (`labelContour` in public/spaceMap.js). That rule is what
keeps a label from jumping around the ring as the field reshapes between
redraws — a "nearest the centre" or "most prominent" rule would chase the
data and never stay in the same place, which is worse for noticing a label
than being a few pixels from the optimal spot. Size and colour made it
legible; the placement rule already did its job.

## One map: the products are layers, the projection is a control

The webapp used to have two maps behind a dropdown, a regional aurora window
and a global D-RAP rectangle, and it showed one while hiding the other. Each
collected its own list of complaints, and they turned out to be one redesign
rather than two patches
([#177](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/177)):

- The oval and the dayside absorption footprint could not be seen at once,
  which is the comparison worth most to a reader deciding whether tonight's
  schedule works.
- Each product was welded to a projection it never asked for. Aurora was a
  latitude band with a longitude correction applied by hand; absorption was a
  whole-world rectangle. Neither can show a pole, and polar absorption is half
  of what these grids exist to show.
- The global view carried no aurora at all — the one view where the oval is a
  whole shape rather than a stripe across the top.

So the products became **layers** on one canvas and the projection and the
extent became **controls**. `radiusDeg` is the whole zoom: degrees of arc from
the centre to the nearer edge of the viewport, 15 for a regional close-up and
180 for everywhere, meaning the same thing in both projections and at every
latitude. The projections live in public/projection.js behind one interface,
so nothing downstream branches on which is in use; a third is one more entry
in `PROJECTIONS`. The vessel-centred azimuthal equidistant one is the default
because a straight line from the centre of it *is* a great circle, so the
line the probe draws is the propagation path rather than a decoration.

Inverting the renderer is what made that one change instead of four.
public/mapRaster.js walks *destination* pixels, asks the projection where each
one is on the planet, and samples the grid there, rather than filling one
rectangle per grid cell. A cell is only a rectangle on a cylindrical map, so
the old way had a projection baked into the drawing; this way the projection
is a parameter, an oblique azimuthal disc costs what a rectangle costs, and
the picture is interpolated because the sampler is. That last part closed
[#186](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/186):
NOAA's own image and this plugin's chart tiles both interpolate this grid, and
the webapp's map was the last blocky surface in the product.

## The map draws on its own dark ground

This one was found by looking. Composited onto the light dashboard, NOAA's
near-black violet low end turned an ordinary quiet day — 1–3 MHz over most of
the dayside — into a purple sheet that buried the coastline.

NOAA's colorbar was sampled against a black globe, where dark reads as nothing
happening, so matching their colours means matching their ground. The map
panel is therefore dark in both themes (`MAP_GROUND` in public/spaceMap.js)
rather than inheriting the page's, and the ink for everything drawn over the
data is fixed there rather than taken from the theme. Every published
space-weather map makes the same choice.

The chart overlay is the opposite case and stays that way: it has the owner's
own charts underneath, so it gets an alpha ramp and no ground of its own.

The ground is also why the coastline and the band-edge contours are each drawn
twice, a dark wide pass under a light narrow one. No single ink reads over both
the violet low end and the yellow peak of the same ramp: a light line
disappears into the peak, which is the part of the map somebody is looking
hardest at, and a dark one disappears into the quiet ground.

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
_top-level_ `appIcon` and loads it as a plain URL from the browser, and
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
as a _copy_ of the packed files instead. Don't "fix" that with `npm link`: it
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
that has not shipped, and a second pull request is meant to _join_ it there.
That shared number is the batching, and it is why released versions stay
contiguous instead of skipping the ones a second concurrent branch would
otherwise have minted. Only a tagged version is spent. Do not reintroduce a
check that a pull request be ahead of the base — it was there when every merge
published, and under the window it is exactly what puts the gaps back.

## Every webapp map draws its own coastline; the chart overlay draws none

A grid of numbers over a sphere is not a map. Without a coastline the aurora
tile shows a coloured band and a dot, and the reader cannot tell whether the
bright patch is over their passage or over Siberia.

Borrowing the boat's own charts is the obvious way to avoid shipping
geography, and it does not work here. Every chart source Signal K can offer —
`@signalk/charts-plugin`, OpenSeaMap, whatever Freeboard-SK is showing — is
Web Mercator, which cannot render a pole; polar-cap absorption is half of what
a D-RAP map exists to show, and the aurora oval is the other half. Charts are
also optional, and usually absent: two chart providers installed and an empty
`charts/` directory is the normal state of a Signal K install. Fetching OSM
tiles instead would put an internet request behind every pan, from a boat, for
a plugin that meters its own NOAA polling to the byte — a cost this plugin
doesn't pay anywhere else, for a source it would depend on staying free and
reachable underway.

So `public/geo.js` carries a coastline and draws it through whatever projection
the webapp's map hands it, over either product. The
decoding and drawing are now the `coast-wright` and `coastlines` packages,
extracted from this plugin and vendored into `public/` on build; the argument
below is unchanged, only where the data comes from. The cost is the thing
that was actually in question, and it was
measured
([#32](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/32#issuecomment-5429065591)):
Natural Earth's 110m coastline is 140 KB as published, but simplified to a
quarter degree — still four times finer than a D-RAP cell — and delta-encoded
it is under 8 KB, against a tarball that already ships 1.2 MB of README
screenshots. `test/coastline.test.ts` pins that ceiling rather than the
tolerance, because the ceiling is what the argument rests on. Natural Earth is
public domain, which the NOAA colour scales are not
([#12](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/12)).

Drawing it takes two paths, because the library only has one. `limn`,
coast-wright's drawing side, takes `x(lon)` and `y(lat)` as *separate*
functions, and that can only express a cylindrical projection: on an azimuthal
map the pixel column a point lands in depends on its latitude too. So the flat
view still goes through the library, where its `lonCenter` seam guard is
better than anything measured in pixels, and `strokeRings` in
public/spaceMap.js strokes the azimuthal one against a different
discontinuity. An azimuthal equidistant map has no antimeridian to break at,
but a segment straddling the antipode of the centre is drawn as a chord
straight across the disc; a pixel-length cap catches that and nothing else,
since neighbouring coastline points are a degree apart on the ground.

The chart-plotter tiles are the opposite case and must stay that way. They are
drawn _over_ the user's real charts, so geography is already there and ours
would be a second, wronger coastline printed on top of it. `tiles.ts` renders
data and nothing else.

## The D-RAP map is the deliverable; a station list is not

`environment.noaa.swpc.drap.highest_affected_frequency` has always been the
cutoff at the vessel, and that number is not the operational one:
[#167](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/167)
is right that what a skipper wants to know is whether a band will reach _a
station_ — the net, the shore contact, Winlink — and that absorption over the
great-circle path is not the absorption overhead.

The issue then proposes a path query with a configured destination, and its
three open questions are all about that destination: where it comes from, how
finely to sample the circle, worst or mean. Two of the three are settled by
building the map instead, and the third turns out not to need answering:

- **The map is the input.** A click on the grid names a destination with no
  callsign database, no route integration and no new configuration setting.
  Every station list this could have grown — a waypoint, a saved set, a
  callsign lookup — is a feature _on top of_ a picture that answers the
  question directly, and none of them are worth building before somebody has
  used the picture and said what they actually reach for.
- **Sampling is tied to the cell size**, not to a fixed number of points:
  about 100 km per step, which is under a degree of arc and so finer than the
  2°×4° grid everywhere, bounded at 400 samples so an antipodal path stays
  cheap. A fixed count would oversample a harbour hop and step over cells on
  a Pacific crossing.
- **Worst _and_ mean, both**, with the worst as the headline. Absorption
  anywhere on the path attenuates the whole path, so a band that clears the
  mean and not the worst does not get through; the mean is reported beside it
  because one bad cell on an otherwise clear path is a different situation
  from a path that is bad end to end, and only the pair distinguishes them.

The grid is cached (`src/cache/drapCache.ts`) the way the aurora grid is, and
for the same reasons — one server-side fetch, a browser that only talks to the
server it loaded the page from — which also gives the tile route something to
draw from. Unlike aurora, the product no longer waits for a vessel position
before fetching: the grid is readable without knowing where the boat is, and
the payload is a hundredth of OVATION's.

The colour is NOAA's own, and the marine SSB band edges are drawn over it as
contours — the argument is above, under
[Both D-RAP surfaces draw NOAA's colorbar](#both-d-rap-surfaces-draw-noaas-colorbar-the-bands-are-contours-over-it).

A clicked destination is a mouse-precision guess, and a keyboard is the tool
for refining one without another blind click across an ocean. The arrow keys
nudge the target in screen pixels (`Shift` for a bigger step) through the same
viewport the click used, and re-score the path against the current grid; Escape
clears the path outright, the undo a reader reaches for by habit and cheaper
than hit-testing the marker itself. Both are gated on the canvas actually being
the thing focused — a click focuses it, same as a tab-to would — and both stay
off the page's text inputs and the advisory overlay, so an unrelated Escape or
arrow key does not reach across the page and move a path nobody was looking at.

Unchecking the HF absorption layer used to null the path too, on the argument
that a path scored against a picture nobody can see is worse than none kept
around. That argument does not survive a reader unticking the layer to compare
the absorption footprint against the aurora oval and reticking it a moment
later: the destination is not part of what the layer draws, and losing it to a
two-click detour costs more than a dimmed line costs by staying. The path now
survives the checkbox in both directions; only turning the layer off dims its
display, per the same rule the footer sections and the help line already
follow.
