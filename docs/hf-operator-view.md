# The HF operator's view

What an HF/SSB operator on a boat actually needs from this plugin, which of
it we can answer today, and the thresholds that answer it.

Companion to [ham-radio-research.md](ham-radio-research.md), which surveys the
_products_. This one is about the _reading_: the operator's question, the
numbers that answer it, and where each number's authority comes from.

The thresholds in this file are the durable part. They belong in Signal K as
zone metadata whether or not the webapp ever draws them — see
[Thresholds as Signal K zones](#thresholds-as-signal-k-zones).

## The question is a window, and it has two edges

One question decides everything an operator does: **which frequency will get
through right now.** It is bounded from both sides, and the two sides come
from different layers of the ionosphere with different drivers:

- **The floor** — D-region absorption. Flare X-rays over-ionise the D layer
  within minutes and it _absorbs_ rather than reflects, lowest frequencies
  hardest. Solar protons do the same over the polar caps for days. Below the
  floor, loss climbs roughly as 1/f² — a decibel at the cutoff, tens of dB
  further down.
- **The ceiling** — F2-layer reflection. `foF2` caps near-vertical (NVIS,
  regional) paths; `MUF(3000)` — roughly 3× foF2 — caps a 3000 km oblique
  hop. EUV output sets its strength, geomagnetic storms depress it. Above the
  ceiling, signals pass into space instead of bending back.

[#82](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/82)
states the consequence exactly:

> Absorption says what's _blocked from below_; MUF/foF2 say what's _supported
> from above_. Together they bracket the usable window, which is the whole
> band-picking problem.

**Today the plugin measures the floor and cannot see the ceiling.** That
asymmetry is the single most important fact in this document. It is why the
webapp's HF gauge fills the absorbed floor and hatches everything above it as
_ceiling unmeasured_ rather than colouring it "good" — a claim above the
cutoff would be unbacked. The gauge is built to take a ceiling the day one
exists: `hfGauge` in `public/hf.js` reads
`environment.noaa.swpc.muf`, and a value on that path turns the hatch into an
open window and a closed region above the MUF with no further change to the
tile.

### The X-ray flux does not help with the ceiling

Worth stating because it is an inviting wrong turn: the X-ray channel acts on
the D region only. A rising X-ray flux raises the _floor_; it says nothing
about the F2 layer. What the trend does answer is **"is this blackout getting
worse or clearing"**, which is a real question and a separate one.

## What answers what

Ranked by whether it changes what the operator does in the next hour.

| Reading                          | Edge    | Timescale        | Verdict                                                                                                                                                    |
| -------------------------------- | ------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-RAP highest affected frequency | floor   | minutes          | **Actionable.** The floor, at the vessel, now. Measured.                                                                                                   |
| D-RAP `Estimated Recovery Time`  | floor   | minutes–hours    | **Actionable.** NOAA's own "when does this end". Not yet parsed.                                                                                           |
| X-ray flux _trend_               | floor   | minutes          | **Actionable.** Direction of the floor. Derivable from a payload already fetched.                                                                          |
| Solar flux (F10.7)               | ceiling | daily            | **Actionable-ish.** The "worth turning the radio on today" number, and a ceiling input.                                                                    |
| Proton flux (≥10 MeV)            | floor   | days             | **Conditionally actionable.** Polar-cap absorption; matters at high latitude, irrelevant at low — at the vessel; see below. The plugin knows the latitude. |
| Solar zenith angle / terminator  | both    | continuous       | **Actionable, and free.** Position + clock, no feed.                                                                                                       |
| Kp / A index                     | ceiling | 3-hourly / daily | Context. Storms depress foF2. Kp already has its own tile and chart.                                                                                       |
| Strongest flare (24 h)           | —       | history          | Context. A flare that peaked hours ago is over, and D-RAP already carries whatever absorption remains.                                                     |
| Sunspot number                   | ceiling | weeks            | Context. Tracks F10.7 closely enough to be a second answer to the same question.                                                                           |
| X-ray flux, absolute             | floor   | minutes          | **Redundant with the flare class.** M6.9 _is_ 6.9×10⁻⁵ W/m². One number in two notations.                                                                  |

### Every reading here is at the vessel

That is the right default for NVIS and regional work, and the wrong frame
for the uses that put HF on a cruising boat in the first place. Winlink or
SailMail to a fixed shore station, weatherfax, a long-haul net — those are
1,000–5,000 km paths, and absorption on them happens at the D-region
crossing points near the hop midpoints, which can be thousands of
kilometres from the boat. The proton row's "irrelevant at low latitude" is
true over the vessel and false for a path that crosses the polar cap.
After the floor/ceiling asymmetry, this is the limitation to keep in view,
and it should be read into every row above.

It is also the real argument for rendering D-RAP as map tiles (carded,
[#32](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/32)):
a map is the only surface in the plan that can answer the path question at
all — the operator eyeballs the route to their station and sees whether
the absorption sits on it. That makes the map operational, not decorative.

## Thresholds

The provenance column is the point. A NOAA-defined boundary and a number
somebody on a forum liked are both "thresholds", and treating them alike is
how a guess acquires unearned authority.

| Provenance     | Meaning                                                                     |
| -------------- | --------------------------------------------------------------------------- |
| **NOAA**       | Defined by NOAA/SWPC. Citable, stable, safe to publish as fact.             |
| **Convention** | Real operator practice, no published derivation. Usable, must be labelled.  |
| **Guess**      | Chosen by us to have _something_. Must be documented as such and revisited. |

### D-RAP highest affected frequency — NOAA

The published value _is_ a threshold: the highest frequency degraded by
**≥1 dB**. There is no ladder to invent. NOAA's polar product maps the ≥10 dB
frequency separately.

1 dB is degradation, not death — which is why the webapp says _absorbed_ and
_weakened_ rather than _unusable_. An earlier draft said "unreliable" and
overstated the measurement.

The cutoff is also the shallow end of the damage. Absorption grows roughly
as 1/f², so a band just under the HAF is down about 1 dB and copyable on a
good day, while two octaves below it is down tens of dB and simply gone.
NOAA publishes the shape itself — the global product is the 1 dB contour,
the polar product the 10 dB one — so a strip that fades its fill, or steps
it at NOAA's own 1 dB / 10 dB pair, would put that physics in the drawing
with no new data. Same argument as the ceiling: the uncertainty belongs in
the drawing, not in a legend.

### Flare class and the R scale — NOAA

From SWPC's R-scale table, already recorded in
[ham-radio-research.md](ham-radio-research.md):

| Flare class | W/m² (0.1–0.8 nm) | R level |
| ----------- | ----------------- | ------- |
| M1          | 1×10⁻⁵            | R1      |
| M5          | 5×10⁻⁵            | R2      |
| X1          | 1×10⁻⁴            | R3      |
| X10         | 1×10⁻³            | R4      |
| X20         | 2×10⁻³            | R5      |

### Proton flux and the S scale — NOAA

S1 begins at **10 pfu** at ≥10 MeV, each subsequent level ×10 (S2 = 100,
S3 = 1000, S4 = 10⁴, S5 = 10⁵). Published in SI as m⁻².s⁻¹.sr⁻¹; the pfu
figures above are NOAA's own units and the conversion lives in `parse.ts`.

### Solar flux (F10.7) — convention

The bands every operator quotes, borrowed from hamqsl.com's panel — the
most-embedded version — but **no published derivation exists**:
[its FAQ](https://www.hamqsl.com/FAQ.html) describes inputs and a confidence
factor, not the mapping. Real operator practice with no published derivation
is this file's own definition of Convention, above — not a Guess, which this
file reserves for numbers chosen by us rather than borrowed from established
practice. Whether hamqsl's mapping itself holds up is a separate question,
tracked against a GIRO calibration pass
([#85](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/85)),
not a reason to relabel the provenance.

| SFI     | Reading                       |
| ------- | ----------------------------- |
| < 70    | High bands essentially closed |
| 70–89   | Poor                          |
| 90–119  | Fair                          |
| 120–149 | Good                          |
| ≥ 150   | Excellent                     |

Adopted deliberately as convention rather than derivation — Mark's explicit
call, 2026-08-26 — on the reasoning that a defensible derivation is a scoping
decision we are choosing to descope, not a correctness problem. Ship it,
label it.

### foF2 and MUF — not yet, and deliberately not guessed here

Every input is already on hand and free:

| Input                            | Source                        | Marginal cost |
| -------------------------------- | ----------------------------- | ------------- |
| EUV proxy                        | F10.7, already published      | none          |
| Solar zenith angle at the vessel | `navigation.position` + clock | none          |
| Storm depression                 | Kp / A, already published     | none          |
| Latitude sensitivity             | `navigation.position`         | none          |

The form is textbook Chapman: production ∝ EUV × cos(χ), electron density
goes as its square root and critical frequency as the square root of that,
so foF2 ∝ (EUV × cos χ)^¼; MUF(3000) ≈ M-factor × foF2 with M ≈ 3, less a
storm penalty weighted by latitude.

**And the F2 layer is the one layer Chapman does not describe at night.**
A cos χ term drives the estimate to zero after sunset, but the real F2
layer survives the night on transport and plasmaspheric refill — which is
exactly why 40 m and 80 m open in the evening, the hours a sailor's nets
and Winlink sessions actually run. Fitted to daytime data alone, the
estimated ceiling crosses below the measured floor after dark and the
strip claims nothing works just as the low bands come good. So the
calibration pass must include night-time samples on purpose, or the
estimate must decline to render past some zenith angle rather than
extrapolate. Either is defensible; silent extrapolation is not.

**Coefficients are deliberately absent from this file.** A regression quoted
from memory is precisely the kind of plausible-and-wrong number that survives
review undetected. A first cut needs one calibration pass against GIRO
ionosonde spot values (free) or a published foF2/F10.7 regression — day and
night both, per the paragraph above. That is bounded work, and it is carded —
not a research project, and not a blocker for anything else here.

## Thresholds as Signal K zones

**The thresholds are worth publishing even where the webapp never draws
them.** A zone ladder on a path is read by Freeboard, Grafana, another
plugin, or a script — none of which have our tile. This is the plugin's data
hub role, independent of its dashboard role.

The machinery already exists and needs nothing new: a zone carries `lower`,
`upper`, `state` and `message`, and `zoneMethods()` derives the `method`
arrays from `methodForState` so a level reads the same whether it arrives as a
zone transition or as a NOAA message. `zonesForAurora` is the pattern to copy
for any continuous, non-scale value — a semantic ladder that deliberately tops
out at `warn` and never reaches `alarm`.

Two constraints carry straight over from CLAUDE.md and must not be
rediscovered:

- **The matcher is half-open** (`value >= lower && value < upper`) and
  `Infinity` is not representable in JSON, so a top zone must **omit** `upper`
  rather than set it — otherwise the highest value matches no zone at all.
- **Zone metadata generates notifications.** The server watches any path with
  `meta.zones` and raises `notifications.<path>` on transitions. A ladder is
  therefore never merely descriptive, and every state must go through
  `methodForState`.

### Two hazards specific to these paths

**F10.7 is inverted, and a naive ladder would alarm for years.** Every zone
ladder in the plugin today runs "higher = worse" — scales, Kp, aurora
probability, D-RAP. Solar flux is the opposite: high is _good_. A ladder that
put low SFI into `alert` would sit there continuously through solar minimum,
which is the #45 failure in slow motion — a permanent notification describing
a condition nobody can act on and nothing will change for years. If F10.7 gets
zones at all they should stay at `nominal`/`normal` with empty method arrays —
transitions still raise `notifications.<path>`, but at those states and
silent, the same trace every ladder's quiet rungs already leave. The
alternative is the `A_INDEX_BASE` precedent: no zones, with the reasoning
written on the path.

**D-RAP's ladder is a frequency, not a severity.** "9.9 MHz absorbed" is bad
for someone working 8 MHz and irrelevant to someone on 22 MHz, so the severity
depends on the reader's band rather than on the number. A defensible ladder
buckets by which marine SSB bands fall under the cutoff, and stays quiet:
being informative about a band the operator may not be using is not grounds to
interrupt them. The clean way out is the reader telling us their band — see
"My frequencies" under [Ideas](#ideas-raised-not-decided).

## Webapp decisions

Recorded so the layout isn't re-litigated. Full context, with rendered
mockups at 1180 / 900 / 760 px in both themes, on
[#110](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/110).

- **Three tiles across**, all `span-4`: aurora / Solar Activity / HF Radio.
  Solar Wind drops from `span-8`. The row measures flat at 290 px with
  nothing stretching.
- **[#115](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/115)'s
  `justify-self: start; max-width: 380px` stays.** It was proposed for removal
  as an obsolete workaround and that was wrong: measured, the aurora tile is
  290×270 under both `span-4 + span-8` and three `span-4`s, because its track
  is four columns either way.
- **Labels are spelled out** — "Solar flux (10.7 cm)", "Planetary A-index",
  never "SFI / A / K". NOAA's own WWV bulletin spells them out
  (`examples/wwv.2026_08_25.txt`: _"Solar flux 143 and estimated planetary
  A-index 6"_), so the shorthand is shack convention, not the authoritative
  form.
- **The tile renamed to Solar Activity is forced, not cosmetic.** A flare is
  not solar wind, so the tile cannot take the flare and proton rows and keep
  the old title honestly.
- **The gauge fills the floor and claims nothing above it.** When a ceiling
  estimate exists it must render _differently_ from the measurement — three
  zones (absorbed / likely usable / above the estimated ceiling), so the
  uncertainty lives in the drawing rather than in a paragraph of legend. Built
  as of 2026-08-27: the tile draws all three, and the middle one only appears
  once both ends are measured.
- **The gauge is a frequency axis, not a ladder of band names.** Nine
  equal-width chips put the 2→4 MHz gap as far apart as 18→22 and shared no
  scale with the map. It now runs 0–35 MHz, NOAA's own colorbar span, and
  `MARINE_SSB_BAND_EDGES_HZ` survives as ticks at their true positions rather
  than as the scale itself.
- **The solar flux gauge is drawn from `meta.zones` on the path.** The
  published ladder is the setting; `F107_BANDS` in `public/hf.js` is only the
  fallback for a server that sends no metadata.

## Ideas raised, not decided

Recorded because they were good and would otherwise be lost, not because they
are scheduled.

- **Clocks.** `Estimated Recovery Time` is literally a countdown, and the page
  already has countdown machinery (`renderTimer`, `.bar-countdown`). Anything
  built here should read
  [#126](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/126)
  first: a countdown and a banner disagreeing about the same condition is the
  bug that issue exists for. And capture a dated fixture while an event is
  actually in force before parsing the field — what it holds mid-event, under
  overlapping flares, or when quiet is only observable during one, and
  quiet-day captures can't pin any of it.
- **More gauges.** The stated preference is gauges and dials over text
  wherever they fit; the aurora ring and the band strip are the two precedents.
- **Day/night as a first-class dimension.** The terminator moves _both_ edges
  — the D region collapses after sunset so the floor falls away, while foF2
  drops so the ceiling comes down with it. Position and clock only. It changes
  what the strip _is_, not just what it reads, which is why it counts as a
  design revisit rather than an increment. It is also the tile's one chance
  at good news: every other signal here grades damage, while the gray-line
  window around sunrise and sunset — D layer gone, F2 not yet decayed — is a
  prized enhancement for low-band long-haul work, and many long-distance
  marine nets are scheduled around it. Position and clock give "gray-line in
  40 min", a countdown to something worth doing, on machinery the page
  already has.
- **"My frequencies."** A marine operator's channels are a short fixed list —
  the Winlink or SailMail station's three or four published frequencies, the
  fax schedule, a net or two. A configured list checked against the floor
  (and the ceiling, once one exists) turns "9.9 MHz absorbed" into "your
  8 MHz net is gone; the 12 MHz station clears", and it is the only severity
  a D-RAP zone ladder could carry honestly. A new setting has a bar to clear
  (AGENTS.md); the case that this one clears it is that the list is a fact
  about the vessel's installation, like position, not a preference about
  presentation. Raised in the #153 review, not decided.
- **D-RAP and aurora as one charting product.** NOAA's own
  [radio-communications dashboard](https://www.spaceweather.gov/communities/radio-communications)
  draws them side by side. `parseDrapGrid` already builds the full global grid
  and `drap.ts` reads one cell of it, so the fetch is already paid for — the
  grid's dimensions and wire cost are measured in
  [noaa-products.md](noaa-products.md).
