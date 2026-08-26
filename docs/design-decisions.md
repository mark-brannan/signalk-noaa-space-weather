# Design decisions

Settled arguments behind constraints named in [`CLAUDE.md`](../CLAUDE.md)'s
"Non-obvious constraints". That file keeps the imperative and the issue
number; the defence for each one — why the alternative was rejected, what it
cost when it was tried — lives here instead, so it isn't reloaded into every
session's context.

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
