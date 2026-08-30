# Design decisions

Settled arguments behind constraints named in [`CLAUDE.md`](../CLAUDE.md).
That file keeps the imperative and the issue number; the defence for each one
— why the alternative was rejected, what it cost when it was tried — lives
here instead, so it isn't reloaded into every session's context.

## `sendAdvisoryOutlook` gates the notification, not the fetch

The setting is titled "Send notifications for weekly Advisory Outlook", and
until 0.29.9 it was also the product's `enabled`, so turning it off stopped the
schedule. On one instance the flag went off on 2026-08-15 and the published
outlook sat at the 2026-08-10 issue for a fortnight.

What made it invisible rather than merely wrong is that `advisory` has no
manual-refresh route. `aurora` and `drap` carry the same kind of switch, but
their refresh button fetches regardless of it, so a stale number there is one
press from being disproved. Here the schedule was the only path to a fresh
bulletin.

So the flag is applied where the notification is published and nowhere else.
The fetch is under a kilobyte a day, which is no bandwidth argument against it.
Turning the flag off stands down whatever is raised, and turning it back on
re-raises the current bulletin rather than waiting a week.

The general rule: a setting named for an output must not also gate the input
feeding it, unless something else can fetch that input on demand.

## The advisory outlook is also published as plain data

The fix above landed narrow on purpose, to get the actual production bug (a
notification frozen for a fortnight) shipped without waiting on a further
question. That got settled in review and lands here.

**A plain-data path, not only a notification.** The notification setting is
titled "Send notifications for...", so a client that wants the bulletin
without opting into the alert had no path to read -- `sendAdvisoryOutlook`
off meant no data at all, not just no notification. Every new bulletin now
publishes plain data to `environment.noaa.swpc.advisory_outlook` regardless
of the setting, deduped against the cache the same way the notification is,
except once: an install upgrading straight into this feature already has
today's bulletin cached from before this path existed, so the plain dedupe
would leave it empty until next Monday without a one-time forced publish
when the path itself is still empty.

An earlier version of this also archived each bulletin at
`environment.noaa.swpc.advisory_outlook.<n>`, one per-week path, written
once and never touched again. Dropped before merge: minting a new path
every week, forever, is the same shape issue #104 removed for the
notification, and the plugin's own HTTP route already serves the full
bulletin text for a client that wants history.

**`EXPIRY_MS` carries slack, and gates re-raising too.** The narrow fix above
stands the notification down when the flag goes off, but nothing stood it
down if a fetch kept silently failing (NOAA changing the payload shape under
the parser, a dead network) while the flag stayed on — the same kind of
invisible staleness the flag bug was, one layer down. `expireIfStale` checks
the raised notification's age on every tick, ahead of that tick's own fetch,
so a broken parse or a dead network can't keep it from firing. The first
version of this check used a flat `WEEK_MS`, on the argument that expiry and
the next bulletin are due at the same moment so a healthy week never trips
it — our own fixtures say otherwise: consecutive issue dates as much as
7d3h25m apart, so a flat week stood the notification down and re-raised it a
few hours later, every week, on a perfectly healthy install. Two days of
slack (`WEEK_MS + 2 * DAY_MS`) covers every gap measured so far; the argument
is "NOAA is late", not "the week is up".

The same age check gates re-raising, not just expiry. Without it, a fetch
that keeps turning up the same bulletin past its expiry would see
`expireIfStale`'s stand-down (state now `normal`) as *not* already current,
and re-raise the identical stale bulletin on the very next tick — undoing the
expiry it had just enforced. Belt and suspenders: the fetch is what's
supposed to keep the notification current, the expiry (and the same check at
publish time) is what stops a broken fetch from lying about it.

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

## The storm notification collapses by level and rides a six-hour hold

The collapsed G3+ notification (`STORM_BASE`, `publishStorm` in
`products/alerts.ts`) is a derived view over the same in-force set the
per-code paths are published from — not a new product, and not a second
reading of NOAA. It exists because the per-code stream is honest but noisy in
exactly the situation it matters: replaying the 2018–2025 SWPC archive
through `currentAlertNotifications` at hourly polls
([#297](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/297),
[#298](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/298)),
the May 2024 Gannon storm produced 26 G3+ path deltas in 35 hours, 16 of them
the same level under a fresh serial number.

Three choices came out of that replay, each against a measured alternative:

- **Collapse by level, not to a flat binary.** A delta is published on every
  change of the storm's G level, both directions, and the level follows the
  storm down so a return to G5 alarms again — a deepening storm is new
  actionable information (worse GNSS and HF degradation), and flattening the
  episode to raised/normal would hide every escalation. What is suppressed is
  the same level under a fresh serial, which is most of a storm's issuance.
- **"In force" alone flaps, so stand-down waits out a hold.** Storms dip
  below G3 between K-index synoptic periods: with no hold the collapsed
  signal raised and stood down 51 times in 7 years, with within-episode
  down-gaps of 1–6 hours (median 2). Six hours merges every observed gap and
  cuts the raises to 29 (~48 interrupting events over 7 years, ~20 of them
  in 2024); twelve buys one fewer. The hold state survives restarts in the
  cache (`stormCache.ts`), not the model — a server restart empties the
  model, and rereading the level from the path would re-alarm at an
  unchanged level.
- **Watches don't raise it.** Every collapsed transition in the replay was
  driven by `ALTK07–09`/`WARK07`; a `WATA` watch is a multi-day forecast, and
  including it raises "a storm is happening" days before one is. The watch
  already has its own per-code path.

Still open in [#298](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/298):
the path name (the current leaf is a deliberate placeholder) and whether
loudness stays on the shared `alarmLevel`/`popupLevel` thresholds — it does
for now, tentatively, so don't cite this section as settling either.

[gannon-storm-replay.html](gannon-storm-replay.html) is the felt version of
this argument: the Gannon storm replayed hourly through the shipped state
machine, with a scrubber showing what a client presents under each scheme.
Open it in a browser; it is self-contained.

## Loudness is three ordered thresholds, not one

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
Default mapping (`alarmLevel` 5, `popupLevel` 4, `listLevel` 3): 0
`nominal`, 1–2 `normal`, 3 `alert` with an **empty method array**, 4 `warn`
(visual), 5 `alarm` (visual + sound). Do not make this louder without a
frequency argument.

**That conservatism is about notifications, never about what the page says.**
The webapp describes conditions in NOAA's own vocabulary — None / Minor /
Moderate / Strong / Severe / Extreme, `SEV_WORDS` in `index.html`, mirroring
`NoaaScaleNames` in `parse.ts` — because "what is the sky doing" is a fact
and "how loud should this be" is a preference. The two got answered with one
word once: the banner carried the notification-state ladder, so an R2 that
NOAA's front page and the WWV bulletin both called _moderate_ rendered as
**Quiet**, in the quiet green, with `Normal` under the badge
([#126](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/126)).
So `heroState` describes any level in force, `NOTABLE` (public/hero.js) only
decides precedence there, and level 2 has a colour step of its own. `quiet`
means level 0 in force _and_ level 0 over 24 hours, and `hero.test.ts` pins
that nothing else reaches it. `NOTABLE` used to mirror `ALERT_FLOOR`; now
that the notification floor is the user-configurable `listLevel`, it stands
on its own — what the page describes and what the plugin interrupts about
are different questions, and only one of them has a setting.

**The hero reads both observed scale paths, and needs both.**
`observations/latest` is an instantaneous sample that is 0 in every payload
in `examples/`, including the day whose 24-hour maximum was G4
([#120](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/120));
`observations/24_hours_maximums` is what NOAA's front page and WWV report as
the day's condition. So the maximum decides what the banner _says_ and the
instantaneous reading decides whether it is still running — `storm` versus
`recent`, or above the floor, `storm` versus `all-clear`. Leading from either
one alone puts the page back to reporting R0 through an R2.

**Three thresholds, each naming the level its own band opens at** —
`alarmLevel` sounds, `popupLevel` is visible and silent, `listLevel` is
listed and silent. Each is a boundary, and that is the point of there being
three: a single anchor with the quieter rungs derived from it cannot be
labelled honestly, because whatever the dropdown claims, the level below it
is doing something too. Every candidate wording for the old one-knob control
was false somewhere — "Notify me from 5" notified from 3, and "Sound an
alarm at…" named a sound the "Never" option had just removed
([#71](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/71)).
Don't collapse them back into one.

The three are ordered — `popupLevel` is never louder than `alarmLevel`, and
`listLevel` is never louder than `popupLevel`, since a band above the
threshold that names it would name levels the threshold above it has already
taken — and `settingsFrom` clamps each threshold against the one directly
above it, on the way in, whatever the panel saved. All three offer the full
scale plus `ALARM_NEVER`. Neither range is clipped to the levels a skipper
would sensibly pick: clipping would also strand an existing config that
asked for something outside it.

`ALARM_NEVER` is exempt from that clamp on `popupLevel` and `listLevel`, and
the panel does not drag the threshold above it to meet it either. It is the
one value above a threshold that is not a mistake: the rest are inert by
accident, that one asks for no band at all. Clamping it redraws a chosen
"Never" as a level on the next load — the exact dishonest control the split
was for.

`listLevel` used to be `ALERT_FLOOR`, a constant pinned at `STRONG` (level 3)
that nothing could turn off: a G3 was always at least listed, whatever the
other two thresholds were set to, and there was no way to ask for every
storm to be listed, G1 up, either. Both directions are now the user's call —
`listLevel` is an ordinary third threshold, the same shape as the other two
(2026-08-29). The `alert` state it names still carries an empty method
array, so being listed costs the user nothing but a line, whatever
`listLevel` is set to.

`ALARM_NEVER` is a value one past the scale, so no level reaches that band:
on `alarmLevel` it removes the sound, on `popupLevel` the popup, on
`listLevel` the listing. It is named "Never" in all three dropdowns and needs
no explanation of what still happens, which is exactly what the split
bought — the dropdown above it says so in its own words.

Do not reintroduce a control that derives _upward_ from a "worth your
attention" pivot. That runs off the end of a five-level scale: the pivot at 4
could never reach `alarm`, and at 5 never even `warn`, so the two
loudest-_sounding_ choices in the dropdown were the two that silenced the
plugin. `stateForScaleValue` carries the argument, and `zones.test.ts` pins
that no threshold pair silences the level it names and that lowering either
one is monotonically louder.

## Thresholds are lines on the ladder, not dropdowns

In the panel the three thresholds are lines drawn across the ladder, not
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
it. And the grips sit in a lane per kind, so lines landing on one row sit
side by side rather than on top of each other, and neither grip slides
sideways as it moves up and down.

The grips are `role="slider"` with `aria-valuetext`, because the value is on
a scale and "5" on its own says nothing about what happens at 5. `stepLevel`
returns `null` for any key the grip does not claim, which is what keeps Tab
working — a boundary that swallowed it would be a keyboard trap. The
dropdowns still exist in the JSON schema and are what a server renders when
the panel fails to load, so both controls have to resolve a triple the same
way: `withLevel` is the panel's clamp and `config-panel.test.ts` pins that
nothing it can produce is a triple `settingsFrom` would rewrite.

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

## `observed` in the Kp feed is a column, not a timestamp comparison

`noaa-planetary-k-index-forecast.json` carries an `observed` column reading
`observed`, `estimated` or `predicted`, and it lags real time: a 3-hour bin
stays `estimated` until its measurement lands. Across the fixtures in
`examples/` that lag runs one to two bins — the last `observed` row is three
to six hours behind the payload's own capture time — so a row can be in the
past and still be a forecast.

Taking the latest row whose `time_tag` is behind `now` therefore published a
prediction as the observation: on 2026-08-29 at 01:51Z it put Kp 5.67 / G2 on
`kp.observed` and drew it as history on the webapp's timeline, while NOAA's
own site showed the measured 4.33 and G0 (the last `observed` row, 21:00Z the
previous day — `noaa-planetary-k-index.json`, the observed-only product,
agrees).

`parseKpForecast` splits on the column rather than on the clock. `kp.observed`
is the newest row marked `observed`. A payload with no such column is treated
as all measurement, which is the shape of the observed-only product, and the
timeline's `forecast` flag comes from the same column, so an estimated bin is
drawn as forecast rather than as history.

The forecast windows — `max24h`, `max72h`, `nextStormTime` — need a third
answer, because "not measured" and "still to come" are not the same set. They
take the rows ahead *plus* the bin now in progress, and drop an estimated bin
whose three hours have already run: it is neither a measurement nor a
prediction about anything left. The distinction is not academic. If NOAA's
observed column stalls — and this feed has broken before — most of a day's
rows sit in the past marked `estimated`, and `nextStormTime` would name a
storm onset hours behind the boat.

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

## release-please owns the version; no pull request does

Four mechanisms used to keep a version number in front of every merge: a husky
hook that patch-bumped at commit time, a `version` status check that failed a
pull request shipping without one, a guard on `main` that caught what the check
missed, and an hourly `release.yml` that waited for six quiet hours before
tagging. They shared one file, `scripts/publish-impact.sh`, holding a regex of
paths presumed not to reach the tarball.

All four existed to work around one constraint: `main`'s ruleset requires a
pull request and a signed commit, so nothing in CI could write `package.json`.
Every bump therefore had to ride inside somebody's pull request, and three of
the four mechanisms were there to make sure one did.

The cost was paid on every pull request. A version diff in a two-line docs
change, a red gate on a stale branch that merely _differed_ from the tag
([#123](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/123)),
a gate that blamed one branch for everything merged since it opened
([#141](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/141)),
a path regex whose own comment conceded that `docs/` sat in it as a judgement
call. The debounce had no upper bound either: merges every thirty minutes never
close a six-hour window, and a deliberate manual release meant choreographing a
bump commit by hand.

`release-please` inverts it. The batch is a standing pull request that
accumulates as work merges, and merging it is the release. The constraint that
produced the workarounds never comes up, because the bump arrives the way every
other change does — through a pull request. Nothing polls, nothing waits, and
no clock decides: work piles into the open release pull request until a human
merges it. Holding a release is leaving it open; cutting one now is merging it
now.

Three consequences worth naming.

**The release pull request must be squash-merged.** release-please's commits
are unsigned and the ruleset requires signatures; a squash replaces them with
one commit signed by GitHub's own key, which the rule accepts. A merge commit
carries the unsigned originals through and is refused.

**The version policy is configuration, not prose.**
`bump-patch-for-minor-pre-major` keeps `feat` a patch and
`bump-minor-pre-major` makes a breaking change a minor while this is pre-1.0.
The standing bias against minting minors — 59 releases in the first 24 days, 27
of them minors — is now enforced rather than argued per pull request.

**release-please runs as a GitHub App, not the default `GITHUB_TOKEN`.** The
default token doesn't fire other workflows for anything it creates — GitHub's
own loop prevention — so a release pull request opened with it never got its
required CI checks and sat permanently unmergeable (#243). An installation
token for a repo-scoped GitHub App gives it a real actor identity instead, so
the PR's own `pull_request` event fires CI normally.

**The publish still has to be dispatched by hand from the workflow.** The App
token means release-please's tag push *does* fire workflows now, which makes
`publish.yml`'s old `push: tags` trigger a hazard rather than a convenience —
it would start a second, racing publish alongside the explicit dispatch below.
That trigger is deliberately gone; `release-please.yml` calls
`gh workflow run publish.yml --ref <tag>` and waits on it, the same path a
human uses by hand. It is also the one npm's trusted publisher is configured
for: `workflow_call` was tried and npm rejects the token it mints.

What is given up: nothing enforces that a publish-impacting change gets
released. That was the point of the path regex, and it is now a judgement call
made once, when the release pull request is merged, instead of a guess encoded
in a list of directories.

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

## The demo is the shipping page, not a copy of it

The first browser demo (#199) was `demo/index.html`, 23 KB of hand-written
markup that reimplemented the map toolbar, the legends and the HF band strip
the webapp already drew. It worked, and it was already drifting: the hero
status tile, the storm-scale tiles and the Kp chart were simply absent,
because porting each one was a second piece of work nobody had done. A demo
that is a subset of the product is a demo of something that does not ship.

So `scripts/build-demo.mjs` copies `public/index.html` itself, and the demo
is the page a boat owner gets. What makes that possible is that the page has
exactly one seam: `public/signalk.js` is the only module it reaches the
server through, so `demo/signalk.js` lands in its place and everything above
it runs unchanged against a saved capture. Widening that seam — the grid
routes, the refresh routes and the unit-preferences API were still raw
`fetch` calls in the page — was the whole of the preparatory work, and
`test/webapp-seam.test.ts` is what keeps it shut.

Two consequences are deliberate. The demo's own framing is **appended** as
one script tag rather than edited in, because an edit is a fork with a
shorter half-life; `demo/chrome.js` may say what the page is and may not
change what it draws. And the copied file set is the transitive import
closure of the page, not a hand-kept list — a module added to `index.html`
cannot go missing from the demo, and the admin UI's config screen stays out
without being excluded, because nothing on the page imports it.

The snapshot carries route bodies as well as vessel-tree values. The page
reads the plugin's own routes for the two grids, the advisory bulletin and
`/status`, and those shapes are not the published paths' shapes:
`renderAdvisory` wants `{text, idLine}` and the published path carries
`{message, id}`. Answering the route from the published path would have
rendered "Waiting for data…" forever, in a way no test would have caught.

`/status` is the one whose absence was a claim rather than a blank. The page
reads `status.settings` to decide whether a product is scheduled, and with no
`status` at all every switch reads `undefined`: the demo told the visitor
"Automatic updates are off" about a plugin that ships with D-RAP on, while
D-RAP's own data was on screen above the sentence. So the capture runs with
explicit settings — aurora, D-RAP and the GOES flux tiles all on, because
those are surfaces the demo shows and all three default off on bandwidth
grounds — and saves *those* settings as the status body. The demo is then an
honest picture of a configured install rather than a contradictory picture of
a default one. The cost is that the refresh buttons read "Refresh" rather
than "Fetch once", which is optimistic: pressing one answers "PLUGIN STOPPED"
and explains itself in the same breath. A wrong label the visitor can resolve
by clicking is a smaller lie than a wrong statement about the product.

## The demo vessel is a viewpoint, not a boat

The capture runs from a fixed position in the approaches to Bergen. Without
one, `aurora.probability` and `drap.highest_affected_frequency` have nowhere
to be computed, and the HF band strip — which #199 names as a success
criterion — is permanently blank. A demo whose headline surface reads
"awaiting position" forever is not a demo of the plugin.

It costs no NOAA traffic to have one: both grids are global and are fetched
before any position is looked at, so the number at the vessel is computed out
of the cache either way. The honesty cost is real, though — a visitor sees a
mark on a map that is nobody's boat — so the position lands in the snapshot
as data at `navigation.position` rather than being implied by values nothing
accounts for, and `demo/chrome.js` says plainly that it is a viewpoint chosen
for the page.

That the reading at that viewpoint is often "no degradation" is not a fault
to tune away. The map shows the absorption footprint on the dayside while the
vessel sits in darkness reading zero, which is the phenomenon. Wanting the
demo to open on a storm is what the replay picker in #239 is for, and picking
a flattering position or hour instead would be the same mistake as picking a
flattering snapshot.

## The demo owns the clock

`public/index.html` decides for itself whether what it is showing is current:
`STALE_MS` is three hours, measured against the data's own timestamps. That is
right on a boat — a Signal K path sits at whatever it was last published as,
so a quiet reading and a dead plugin look identical, and saying "this is not
an all-clear" is the whole point of the state. Against a saved capture it is
simply wrong. From three hours after the capture until the end of time, the
demo's headline read **STALE DATA / No update since 02:52 UTC / This is not an
all-clear. Check the server log**, with every timestamp on the page marked
"(stale)". Nothing was broken. The moment was saved.

So the demo runs on the capture's clock. `demo/signalk.js` shifts `Date.now()`
and the zero-argument `new Date()` by `capturedAt - (the moment the snapshot
loaded)`, and nothing else: `new Date(iso)` has to keep parsing exactly what
it is handed, because the page parses every NOAA timestamp through it and
shifting those would corrupt every reading on the page rather than fix the one
number this is about. It is a `Proxy` over `Date` rather than a subclass, so
`Date.prototype`, `Date.parse` and every `x instanceof Date` keep the identity
they had.

An offset, not a freeze. The hero's countdown and the "since" counters have to
keep running, or the page reads as a screenshot. The consequence is that a tab
left open long enough does eventually go stale — exactly as a live page whose
plugin stopped would, and a reload resets it, so that is the honest behaviour
rather than a leak.

It is installed from `demo/signalk.js` at module scope, not from
`demo/chrome.js`, because a module's imports are evaluated before the
importing module's body: the page cannot read an unshifted `Date.now()` before
it is in place. `chrome.js` is appended and runs last, which is too late. The
offset comes from the snapshot, which is fetched, so the module holds the
page's first line with a top-level `await` rather than letting it race. A
snapshot that will not load leaves the page on the real clock and on its own
no-data state, which is the true reading of "there is no capture here".

Live data (#239 leg 2) is the real fix, and it removes this: a page fetching
NOAA itself has a real clock and real timestamps. This is what makes a
*saved* snapshot honest until then.

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

## The browser gets the product modules unbundled, and storage is a parameter

Leg 2 of [#199](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/239)
runs the plugin's own product modules in the browser against NOAA directly.
The plan for it assumed a bundler, kept in a separate package the way
`scripts/screenshots/` keeps Playwright, so it could never reach the plugin
registry's offline `npm ci` and its 60-second cap.

Measured instead of assumed, it turns out no bundler is needed. `tsc` already
emits ES modules whose every relative import carries a `.js` extension, which
is precisely what a browser resolves, and the plugin has no runtime
dependencies at all — `dependencies` is empty, and has always been. Serving
`dist/` over HTTP and importing each product in Chromium, nine of the twelve
loaded untouched. The three that did not — aurora, D-RAP and advisory — all
failed on one import: `src/cache/entryCache.ts` reaching for `fs` and `path`.

So the fix is the seam, not the tooling. `entryCache` takes a `CacheStore`
rather than a directory path, and `Publisher` extends it: `createPublisher`
supplies the file-backed store, the demo supplies one over memory. That is the
same rule publisher.ts already carried for the Signal K `app` object and
`noaa/client.ts` for the network — one module owns the host, everything
downstream takes it as a parameter — extended to the last host resource that
was still being reached for directly. All twelve products then load in the
browser.

The size argument never applied: the closure is 20 modules, 155 KB raw and
**45 KB gzipped**, against a single aurora grid that costs 926 KB on the wire.
The code is about five percent of one data fetch, so bundling would be
optimising the wrong thing.

What a bundler *would* have bought is protection against a bare specifier
appearing later — a runtime dependency, or another Node builtin — which breaks
the page exactly the way `fs` did, and invisibly. `test/browser-closure.test.ts`
buys that instead: it walks the closure from `src/products/` the way a browser
would and fails on any import a browser cannot resolve, naming the module that
did it. The type-only imports in that closure are written `import type` so the
walk sees the graph `tsc` emits rather than the one the type-checker sees —
publisher.ts does still touch the filesystem, and the products still name its
types.

The argument against ever adding a bundler is the one already made for the page
itself: the demo is the shipping page, never a fork. Unbundled, it also runs the
shipping *code* — the exact modules `tsc` emits for the plugin. A bundle is a
transformation, and a transformation is where "works in the demo, broken on the
boat" comes from.

CORS was the other gate, and it is measured for all sixteen endpoints in
[docs/noaa-products.md](noaa-products.md#every-endpoint-is-cors-open-but-only-to-a-request-with-no-extra-headers):
open to a plain GET, closed to the conditional-GET headers, which costs nothing
because no endpoint has ever answered 304 at a realistic poll interval.

## A board-only PR skips the matrix through a gate job, not a `paths-ignore`

Three board-only PRs (kanban.md edits, per AGENTS.md's "Open loops") cost 128
CI jobs in one day, because every `gh pr merge --auto`'s update-branch push
retriggers the whole reusable-workflow matrix, including a ~4 minute armv7
QEMU job that a one-line markdown diff has no way of touching.

The obvious fix — `paths-ignore: [kanban.md]` on `ci.yml` — is wrong for a
reason specific to this repo's ruleset. Three of the five required contexts
(`plugin-ci / Validate inputs`, `plugin-ci / Integration / signalk-server
latest / Node 24`, `plugin-ci / Linux / Node 24`) are reported by the
reusable `SignalK/signalk-server/.github/workflows/plugin-ci.yml@master`
this file calls, not by a job defined here. `paths-ignore` prevents the
calling job from running at all, which means those contexts never report —
and a required context that never reports leaves the PR pending forever,
not passing. This is a documented GitHub Actions failure mode, not
speculation.

A job-level `if:` skip behaves differently: the job still runs (briefly),
still reports its conclusion to the Checks API, and reports it as
`skipped` — which GitHub's required-status-checks evaluation accepts as
satisfying the requirement, the same way it accepts `success`. So the fix
is a `changes` job that runs the same diff test the merge rule and both
review-bot filters already use (AGENTS.md, "Open loops": exactly one
changed path, and it is `kanban.md`), and `plugin-ci` / `typecheck` gate on
its output with `if:` rather than `paths-ignore`.

That still leaves five required contexts, three of which now sometimes read
`skipped` instead of `success` — a ruleset that requires all five still
works, but a `ci-gate` job (`needs: [plugin-ci, typecheck]`, `if: always()`,
failing only if a dependency failed or was cancelled) collapses them to one
context the ruleset can require instead, so a future job added to the
matrix doesn't also need a ruleset edit to become required.

CodeQL's `Analyze (actions)` and `Analyze (javascript-typescript)` required
contexts are GitHub default setup, not a job in this repo's workflows, and
default setup has no `paths`/`paths-ignore` equivalent — only an advanced
setup (a checked-in workflow replacing default setup entirely) can filter by
path. CodeQL isn't the cost driver here — it runs in a couple of minutes,
not the four the armv7 QEMU job costs — so taking on advanced setup's extra
maintenance surface to filter a board-only PR out of it isn't worth what it
would save. They're dropped from the ruleset's required contexts instead;
they still run on every PR, just don't block merge.

The reported check context is a job's `id`, unless the job sets `name:` --
then the context is the name instead. The first version of `ci-gate` set
`name: CI gate`, the ruleset was pointed at the context `ci-gate`, and the
two never matched: every PR sat on "ci-gate — Expected — Waiting for status
to be reported" forever, the exact failure this job exists to prevent, just
moved one layer up. Caught live on #276 within minutes of applying the
ruleset. Fixed by dropping the `name:` so the reported context is the job id.
## The demo's third data layer is the plugin itself

The demo page has always been the shipping page rather than a fork of it,
reading through one seam — `public/signalk.js`, substituted at build time by
`demo/signalk.js`. Leg 2 of
[#239](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/239)
puts a third thing behind that seam: not a Signal K server, and not a saved
capture, but the plugin's own product modules fetching NOAA from the visitor's
tab. Twenty-six compiled modules, no bundler, no server, on `?live`.

Nothing in `src/products/` was written for this and nothing in it changed to
allow it. A product takes a client, a publisher and settings; the server hands
it one of each and so does the browser. What made it reachable was moving the
last host resources behind those parameters — the network into
`noaa/client.ts` long ago, and storage into the Publisher in
[#272](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/272).

**Live is opt-in, and the default stays the saved snapshot.** A page anyone can
open must not spend a fresh 927 KB aurora grid of NOAA's bandwidth on every
visit, and the snapshot shows the same surfaces for nothing. Opt-in also keeps
the cost of the live layer off a snapshot visitor entirely: the import is
dynamic, so a reader who never asks for live data downloads none of it —
verified in Chromium, zero requests under `plugin/`.

**The browser client is the shipping client with two flags, not a second
implementation.** `createClient` takes `conditionalGet` and `userAgent`, and
the browser turns both off for one measured reason each (see
[noaa-products.md](noaa-products.md#every-endpoint-is-cors-open-but-only-to-a-request-with-no-extra-headers)):
`User-Agent` is a forbidden header name, and NOAA's fixed
`Access-Control-Allow-Headers` excludes both conditional-GET headers, so a
preflight kills a request carrying either. A fork would have duplicated the
endpoint guard, the torn-payload recovery, the meter and the failure logging,
and then drifted from all four. Two flags on the real path cannot drift.

**`PRODUCTS` moved to `src/products/registry.ts`.** The browser has to drive
the plugin's own list rather than a copy — a hand-kept list is how the demo
once ended up with four values and a half-empty page — but `index.ts` owns the
plugin lifecycle, the HTTP routes and the tile renderer, and reaches the
filesystem through all three. The registry is the seam that lets the browser
have the list without the host; `index.ts` re-exports it, so `PRODUCTS` is
still one name. `test/browser-closure.test.ts` now walks `src/browser/` as
well as `src/products/`, which is what caught `noaa/client.ts` importing
`Publisher` as a value and dragging `fs` back in.

**A manual refresh keeps the plugin's own two rules**, because the button is
more exposed here rather than less: one refresh per product in flight at a
time, and the cooldown — now `src/refreshPolicy.ts`, so the demo cannot hold a
looser limit than the server. A refresh that returns without writing anything
fails on the same `fetchedAt` diff and with the same 502 the plugin's route
answers, which is what `refreshFailure` in `public/aurora.js` already knows how
to label.

**The page's first paint waits for the first pass, bounded by one request
timeout.** The page polls every 60 seconds, so a first read taken a moment too
early costs a minute of the hero saying "nothing received since the plugin
started" over data that has already arrived. The bound is what stops that
becoming an unbounded blank page when NOAA is the thing not answering — there
is nothing to paint then anyway, and the next poll picks up whatever did land.
Measured in Chromium, the full pass over twelve products — sixteen endpoints,
the 927 KB aurora grid among them — paints at about eight seconds.

**The size argument still does not apply.** The live closure is 26 modules,
202 KB raw and **59 KB gzipped**, against the single aurora grid it then goes
and fetches, which is 927 KB on the wire. The code is about six percent of one
data fetch. `pages.yml` gained a `tsc` step and nothing else: the root `npm ci`
is untouched, because the plugin registry scores this package by running that
install offline under a 60-second cap.

## Predicted-vs-measured has two thresholds and one window gate

`docs/instrumentation-design.md` proposed the cross-check and then left the
number open: *"a sustained divergence beyond, say, 25%"*, explicitly a
placeholder. The webapp's diagnostics panel is where a number had to be
chosen. It uses two, on two different comparisons, and refuses to make one of
them at all until it has the data to make it honestly.

**A row's payload size, at ±50%.** The mean wire size of one endpoint's
fetches against the size `src/endpoints.ts` declares for it. This needs no
time window: it is valid from the first fetches, and it is the comparison that
would have caught [#223](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/223)
fastest — 42 KB arriving where 5 KB was declared is visible immediately, a day
before any daily figure could say anything. It is set loose because a single
endpoint carries real variance. `/json/goes/primary/xray-flares-7-day.json` is
one record per flare and `/products/alerts.json` is a rolling 30-day archive;
both genuinely swell by a factor over an active week. A tighter line would
mark them during exactly the storm a reader opened the page for, and a panel
that cries wolf during storms is one nobody reads during storms. Three
successful fetches are required before a row is allowed to accuse anything: a
torn read is a short body, and one of those is not a drift.

**The total, at ±25%.** Every endpoint's measured bytes against
`predictedBytesPerDay`. Set tight, because the total's noise floor is far lower
than any row's: the two weather-dependent endpoints above are a few KB against
a prediction in the megabytes, so even at three times their declared size they
move the total by a fraction of a percent. What moves the total is structural —
an endpoint that grew a sibling, a cadence that is not what the settings say, a
payload that changed shape. 25% is comfortably above that noise and catches a
1.3× drift long before it becomes the 8× #223 was. So the placeholder number
survives, but as the number for the *total* and on that argument, not because
it was the placeholder.

**And the total is not judged until the 24-hour window has actually filled.**
This is the part that decides whether the panel is worth reading. The meter
starts empty at every plugin start, and the aurora grid alone is 147 KB
arriving in lumps two hours apart: three hours after a restart, measured sits
somewhere between a twelfth and a fifth of a day's prediction for no reason but
the clock. Pro-rating does not fix it — the problem is the lumpiness, not the
scale. Judging there would raise the alarm after every single restart, which is
the fastest way to build a diagnostic nobody looks at. Until the window fills,
the panel says how far along it is and shows the measured figure without a
verdict; the per-fetch comparison above stays live throughout, which is what
keeps the panel useful on day one.

`hoursCovered` reads the window off the meter's own buckets rather than off
`startedAt`, because the client — and so the meter — outlives a `stop()`/
`start()` cycle within one running server. A full window reads 24 and never 25:
tier 2 prunes to 24 buckets by `hourStart`, so the oldest bucket start is at
most 23 hours behind the newest, and the current partial hour is the
twenty-fourth.

**Two exceptions need no window, because no window could excuse them.** An
endpoint carrying traffic the settings predict at zero is fetching something
nobody asked for. And an endpoint the meter saw that the declarations do not
carry should be unreachable — the client refuses an undeclared fetch and
`test/endpoints.test.ts` walks the registry — which is exactly why it
gets a row rather than being dropped on the floor.

**The surfacing is a banner for the total and a marked row for an endpoint**,
plus the finding itself on the footstrip link, so a page nobody opens the panel
on still says when the numbers have parted company. The banner distinguishes
over-fetching from under-fetching rather than folding both into "diverged":
over is the configuration screen understating cost, which is #223's failure;
under almost always means something is not running rather than something is
cheap, and it wants a different first move.

**And nothing is judged at all where the transfer size is not reported.** This
was caught by opening the live demo, not by reasoning: every row read six to
thirteen times its declared size, on a plugin doing exactly what it should. A
browser's `fetch` decompresses transparently and does not expose the compressed
length, so `wireBytesFor` in `src/noaa/client.ts` falls back to the decoded size
and flags it — and comparing a decoded size against a declared, *measured* wire
size is a guaranteed tenfold over-fetch. `docs/instrumentation-design.md` says
never to quote a decoded size to a user as a cost, and a divergence verdict
computed from one is the same mistake with a conclusion attached.

So tier 2 carries an `estimated` count alongside `notModified`, per endpoint per
hour. A row whose bytes are estimated is marked and compared against nothing;
one estimated endpoint suppresses the *total* verdict as well, because its
decoded bytes are in that sum. The one finding that survives is traffic on an
endpoint the settings predict at zero — that a fetch happened at all does not
depend on what it weighed. The granularity is per endpoint rather than per
runtime for a reason the same demo showed: `/text/drap_global_frequencies.txt`
comes back with a `Content-Length` in the same tab where the JSON endpoints do
not.

**The thresholds live in `public/diagnostics.js`, not in the plugin.** The
`/telemetry` route serves the two halves keyed by the same `subPath` and
compares nothing. Where the line falls is a presentation decision, and a
scraper reading the same route — the Signal K paths from phase 3a are there for
exactly that — is free to draw its own.

## The Kp chart is one time axis at two spans, not two charts

The Conditions tab draws Kp at two horizons: NOAA's 3-day forecast at
three-hourly resolution, and the 27-day outlook at one daily maximum per UTC
day. They are one chart — 72 hours by default, expanding to the whole solar
rotation — and not two charts stacked, and not two series spliced onto one
static axis.

**Why not two series on one static axis.** Three days and twenty-seven share
no horizontal scale: at a width where the 3-hourly stretch is legible the
outlook is a smear, and at a width where the outlook fits the forecast is four
points. Worse, the outlook is a daily *maximum* where the forecast is a
3-hourly *sample*, so a daily maximum sits systematically above the samples
that produced it and joining the two end-to-end draws a step up on a week
where nothing is happening. `src/paths.ts` keeps the two `series` in separate
subtrees for that reason and says so.

**Why not two charts.** They were, for one round. Two charts is honest and it
is also inert: the reader has to hold one picture in their head while looking
at the other to answer the only question that spans them — is what is coming
worse than what is here. A zoom answers it by construction, because there is
only ever one picture.

**What makes the single axis honest is the mark, not the scale.** The outlook
draws as bars and the forecast as a line over them. Bars because a daily
maximum is a per-bucket statistic: a line between two of them would assert a
Kp at noon that NOAA never forecast, whereas a bar claims the bucket and
nothing else. And because the two marks are different, the 3-hourly line can
sit directly over the first three days of bars without the eye reading them as
one series — which is what lets both horizons occupy the same axis at all.
The bars a forecast day covers are ghosted: the line over them says the same
thing at eight times the resolution and far higher skill.

**Not a coloured strip per day**, which was the third option. A typical
outlook spends twenty of its twenty-seven days between Kp 2 and Kp 4, all
sub-G1 and all one colour on a severity palette, so the strip would be flat
across the great majority of a window whose only content is that variation.

**The x scale is therefore time, not index.** Index positions cannot animate
between spans, cannot put a 3-hourly point at the right place inside a day,
and cannot be shared by two series sampled differently. `padT` and the plot
height do not change with the span, so the G ladder stays on the same screen
rows and expanding moves the data under a fixed ladder rather than rescaling
both.

**The expansion is animated because the motion is the explanation.** The
outlook's bars are already at their true times behind the near view; opening
the window walks them into frame and shrinks the 3-day line into the first
tenth of it, which is what says the two are one axis at two zooms. A cross-fade
between two finished pictures would say they are two pictures. The bars fade in
with the span (`reveal`) rather than being drawn at 72 hours, where a single
day is a third of the chart wide and a slab that size behind the line is
furniture, not data. `prefers-reduced-motion` jumps to the final frame.

**The summary under the chart reports only what the outlook adds.**
`outlookAhead` in `public/hero.js` takes the peak and the first G1 day over the
stretch beyond the 3-day forecast — the same stretch the chart draws
un-ghosted, so the sentence and the peak marker cannot name different days. It
deliberately does *not* read `…outlook27.maxKp` and `…outlook27.nextStormTime`,
which the plugin publishes over all twenty-seven rows because it has no view to
answer to. NOAA fixes the window when it issues the table and the product polls
it daily, so those two can name a storm day that has already been and gone —
and in the mock's `storm` state, six days gone.
