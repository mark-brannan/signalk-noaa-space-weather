# The HF operator's view

What an HF/SSB operator on a boat actually needs from this plugin, which of
it we can answer today, and the thresholds that answer it.

Companion to [ham-radio-research.md](ham-radio-research.md), which surveys the
*products*. This one is about the *reading*: the operator's question, the
numbers that answer it, and where each number's authority comes from. Written
during the #110 design session, 2026-08-26.

The thresholds in this file are the durable part. They belong in Signal K as
zone metadata whether or not the webapp ever draws them — see
[Thresholds as Signal K zones](#thresholds-as-signal-k-zones).

## The question is a window, and it has two edges

One question decides everything an operator does: **which frequency will get
through right now.** It is bounded from both sides, and the two sides come
from different layers of the ionosphere with different drivers:

- **The floor** — D-region absorption. Flare X-rays over-ionise the D layer
  within minutes and it *absorbs* rather than reflects, lowest frequencies
  hardest. Solar protons do the same over the polar caps for days. Below the
  floor, nothing gets out.
- **The ceiling** — F2-layer reflection. `foF2` caps near-vertical (NVIS,
  regional) paths; `MUF(3000)` — roughly 3× foF2 — caps a 3000 km oblique
  hop. EUV output sets its strength, geomagnetic storms depress it. Above the
  ceiling, signals pass into space instead of bending back.

[#82](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/82)
states the consequence exactly:

> Absorption says what's *blocked from below*; MUF/foF2 say what's *supported
> from above*. Together they bracket the usable window, which is the whole
> band-picking problem.

**Today the plugin measures the floor and cannot see the ceiling.** That
asymmetry is the single most important fact in this document. It is why the
webapp's band strip fills absorbed bands and merely outlines the rest rather
than colouring them "good" — a claim above the cutoff would be unbacked.

### The X-ray flux does not help with the ceiling

Worth stating because it is an inviting wrong turn: the X-ray channel acts on
the D region only. A rising X-ray flux raises the *floor*; it says nothing
about the F2 layer. What the trend does answer is **"is this blackout getting
worse or clearing"**, which is a real question and a separate one.

## What answers what

Ranked by whether it changes what the operator does in the next hour.

| Reading | Edge | Timescale | Verdict |
| --- | --- | --- | --- |
| D-RAP highest affected frequency | floor | minutes | **Actionable.** The floor, at the vessel, now. Measured. |
| D-RAP `Estimated Recovery Time` | floor | minutes–hours | **Actionable.** NOAA's own "when does this end". Not yet parsed. |
| X-ray flux *trend* | floor | minutes | **Actionable.** Direction of the floor. Derivable from a payload already fetched. |
| Solar flux (F10.7) | ceiling | daily | **Actionable-ish.** The "worth turning the radio on today" number, and a ceiling input. |
| Proton flux (≥10 MeV) | floor | days | **Conditionally actionable.** Polar-cap absorption; matters at high latitude, irrelevant at low. The plugin knows the latitude. |
| Solar zenith angle / terminator | both | continuous | **Actionable, and free.** Position + clock, no feed. |
| Kp / A index | ceiling | 3-hourly / daily | Context. Storms depress foF2. Kp already has its own tile and chart. |
| Strongest flare (24 h) | — | history | Context. A flare that peaked hours ago is over, and D-RAP already carries whatever absorption remains. |
| Sunspot number | ceiling | weeks | Context. Tracks F10.7 closely enough to be a second answer to the same question. |
| X-ray flux, absolute | floor | minutes | **Redundant with the flare class.** M6.9 *is* 6.9×10⁻⁵ W/m². One number in two notations. |

## Thresholds

The provenance column is the point. A NOAA-defined boundary and a number
somebody on a forum liked are both "thresholds", and treating them alike is
how a guess acquires unearned authority.

| Provenance | Meaning |
| --- | --- |
| **NOAA** | Defined by NOAA/SWPC. Citable, stable, safe to publish as fact. |
| **Convention** | Real operator practice, no published derivation. Usable, must be labelled. |
| **Guess** | Chosen by us to have *something*. Must be documented as such and revisited. |

### D-RAP highest affected frequency — NOAA

The published value *is* a threshold: the highest frequency degraded by
**≥1 dB**. There is no ladder to invent. NOAA's polar product maps the ≥10 dB
frequency separately.

1 dB is degradation, not death — which is why the webapp says *absorbed* and
*weakened* rather than *unusable*. An earlier draft said "unreliable" and
overstated the measurement.

### Flare class and the R scale — NOAA

From SWPC's R-scale table, already recorded in
[ham-radio-research.md](ham-radio-research.md):

| Flare class | W/m² (0.1–0.8 nm) | R level |
| --- | --- | --- |
| M1 | 1×10⁻⁵ | R1 |
| M5 | 5×10⁻⁵ | R2 |
| X1 | 1×10⁻⁴ | R3 |
| X10 | 1×10⁻³ | R4 |
| X20 | 2×10⁻³ | R5 |

### Proton flux and the S scale — NOAA

S1 begins at **10 pfu** at ≥10 MeV, each subsequent level ×10 (S2 = 100,
S3 = 1000, S4 = 10⁴, S5 = 10⁵). Published in SI as m⁻².s⁻¹.sr⁻¹; the pfu
figures above are NOAA's own units and the conversion lives in `parse.ts`.

### Solar flux (F10.7) — convention

The bands every operator quotes, and **no published derivation exists** —
hamqsl.com's panel is the most-embedded version and
[its FAQ](https://www.hamqsl.com/FAQ.html) describes inputs and a confidence
factor, not the mapping.

| SFI | Reading |
| --- | --- |
| < 70 | High bands essentially closed |
| 70–89 | Poor |
| 90–119 | Fair |
| 120–149 | Good |
| ≥ 150 | Excellent |

Adopted deliberately as convention rather than derivation — Mark's explicit
call, 2026-08-26 — on the reasoning that a defensible position is a scoping
decision we are choosing to descope, not a correctness problem. Ship the
guess, label it, revisit it.

### foF2 and MUF — not yet, and deliberately not guessed here

Every input is already on hand and free:

| Input | Source | Marginal cost |
| --- | --- | --- |
| EUV proxy | F10.7, already published | none |
| Solar zenith angle at the vessel | `navigation.position` + clock | none |
| Storm depression | Kp / A, already published | none |
| Latitude sensitivity | `navigation.position` | none |

The form is textbook Chapman: electron density ∝ EUV × cos(χ), foF2 ∝ (that)^¼,
MUF(3000) ≈ M-factor × foF2 with M ≈ 3, less a storm penalty weighted by
latitude.

**Coefficients are deliberately absent from this file.** A regression quoted
from memory is precisely the kind of plausible-and-wrong number that survives
review undetected. A first cut needs one calibration pass against GIRO
ionosonde spot values (free) or a published foF2/F10.7 regression. That is
bounded work, and it is carded — not a research project, and not a blocker for
anything else here.

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
probability, D-RAP. Solar flux is the opposite: high is *good*. A ladder that
put low SFI into `alert` would sit there continuously through solar minimum,
which is the #45 failure in slow motion — a permanent notification describing
a condition nobody can act on and nothing will change for years. If F10.7 gets
zones at all they should stay at `nominal`/`normal` with empty method arrays,
descriptive only. The alternative is the `A_INDEX_BASE` precedent: no zones,
with the reasoning written on the path.

**D-RAP's ladder is a frequency, not a severity.** "9.9 MHz absorbed" is bad
for someone working 8 MHz and irrelevant to someone on 22 MHz, so the severity
depends on the reader's band rather than on the number. A defensible ladder
buckets by which marine SSB bands fall under the cutoff, and stays quiet:
being informative about a band the operator may not be using is not grounds to
interrupt them.

## Webapp decisions from this session

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
  (`examples/wwv.2026_08_25.txt`: *"Solar flux 143 and estimated planetary
  A-index 6"*), so the shorthand is shack convention, not the authoritative
  form.
- **The tile renamed to Solar Activity is forced, not cosmetic.** A flare is
  not solar wind, so the tile cannot take the flare and proton rows and keep
  the old title honestly.
- **The band strip fills the floor and claims nothing above it.** When a
  ceiling estimate exists it must render *differently* from the measurement —
  three zones (absorbed / likely usable / above the estimated ceiling), so the
  uncertainty lives in the drawing rather than in a paragraph of legend.

## Ideas raised, not decided

Recorded because they were good and would otherwise be lost, not because they
are scheduled.

- **Clocks.** `Estimated Recovery Time` is literally a countdown, and the page
  already has countdown machinery (`renderTimer`, `.bar-countdown`). Anything
  built here should read
  [#126](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/126)
  first: a countdown and a banner disagreeing about the same condition is the
  bug that issue exists for.
- **More gauges.** The stated preference is gauges and dials over text
  wherever they fit; the aurora ring and the band strip are the two precedents.
- **Day/night as a first-class dimension.** The terminator moves *both* edges
  — the D region collapses after sunset so the floor falls away, while foF2
  drops so the ceiling comes down with it. Position and clock only. It changes
  what the strip *is*, not just what it reads, which is why it counts as a
  design revisit rather than an increment.
- **D-RAP and aurora as one charting product.** NOAA's own
  [radio-communications dashboard](https://www.spaceweather.gov/communities/radio-communications)
  draws them side by side. `parseDrapGrid` already builds the full 90×90 grid
  (42,499 bytes, measured 2026-08-26) and `drap.ts` reads one cell of 8,100,
  so the fetch is already paid for.
