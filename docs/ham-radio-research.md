# Space weather for HF operators — research notes

Research behind the `ham-radio` initiative
([#87](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/87)
and its sub-issues). Compiled 2026-08-20. Prompted by the
[r/amateurradio space-weather wiki](https://www.reddit.com/r/amateurradio/wiki/space_weather/)
and the standard HF-operator toolkit it reflects; checked against the wiki's
full text, whose recommendations (the SWPC
[Radio Communications Dashboard](https://www.swpc.noaa.gov/communities/radio-communications),
the KC2G maps, the flux graphs, the solar-cycle report) all map onto the
issues below. Its longer companion read is Paul Harden NA5N's
_Solar Activity & HF Propagation_.

**Verification status matters here.** These notes were researched from
published documentation and secondary sources; none of the endpoints below
have been measured from this repo yet. Per [AGENTS.md](../AGENTS.md), every
claim about an endpoint's size, cadence, or shape must be re-established with
`scripts/measure-noaa.mjs` and a dated fixture in `examples/` before a parser
is written — and those measurements belong in
[noaa-products.md](noaa-products.md), not here. This file records _why_ each
product matters to an operator and _where_ it lives, so the issues stay
readable after link rot.

Its companion is [hf-operator-view.md](hf-operator-view.md): where this file
surveys the _products_, that one records the _reading_ — the operator's
question, the thresholds that answer it with each one's provenance, and what
those thresholds mean as Signal K zone metadata whether or not the webapp
draws them.

## How the ionosphere reads to an HF operator

Three layers, three failure modes, and every product maps onto one of them:

- **D region** (60–90 km): is strongest during daylight and normally weakens
  after sunset, _absorbs_ HF rather than reflecting it, lowest frequencies
  hardest. Solar flare X-rays over-ionise it
  within minutes → shortwave fadeout on the whole sunlit hemisphere (the R
  scale). Solar energetic protons over-ionise it above the polar caps for
  _days_ → polar cap absorption (the S scale's HF consequence).
- **F2 region** (~250–400 km): the reflecting layer that makes skywave work.
  Its critical frequency **foF2** caps near-vertical (NVIS, regional) paths;
  **MUF(3000)** — roughly 3× foF2 — caps a 3000 km oblique hop. UV/EUV output
  (tracked by F10.7/SFI and sunspot number) sets its strength; geomagnetic
  storms (Kp/A) depress and destabilise it, worst at high latitudes.
- **The terminator**: at dawn/dusk the D region collapses before the F region
  weakens — the greyline enhancement on 160/80/40 m. Pure astronomy, no data
  feed needed.

The plugin already covers the _hazard_ view (G/S/R scales, alerts, Kp, solar
wind, aurora, F10.7, X-ray flare class). The gap is the _operator_ view:
absorption and reflection as maps and numbers at the vessel's position.

## Products investigated

### D-RAP — D-Region Absorption Predictions → [#81](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/81)

- Global grid of the highest frequency degraded by ≥1 dB, updated on a
  minutes cadence; the polar product maps the ≥10 dB frequency for SEP
  events. Product page:
  <https://www.swpc.noaa.gov/products/d-region-absorption-predictions-d-rap>;
  model description (DRAP2):
  <https://www.ncei.noaa.gov/sites/default/files/2025-07/SWxDRAP2.pdf>.
- Machine-readable global grid:
  `https://services.swpc.noaa.gov/text/drap_global_frequencies.txt` — plain
  text, header with valid time plus X-ray/proton status lines, then a
  lat/lon frequency table. `docs/noaa-products.md`'s "D-RAP global
  frequencies (#81)" section already measured the grid directly: 90
  latitude rows (89° to −89°, step −2°) by 90 longitude columns (−178° to
  178°, step 4°) — 8100 points.
- Same host and text style the plugin already handles; the natural second
  tile layer after aurora.

### MUF(3000) and foF2 nowcast maps → [#82](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/82)

- NOAA's SWPC does run a global MUF nowcast — the WAM-IPE model — but its
  public NetCDF inventory only exposes lon/lat/den400/ON2, not a directly
  consumable foF2/MUF feed, so there is no drop-in NOAA product here. The
  community standard for a usable MUF/foF2 feed is KC2G, <https://prop.kc2g.com/>:
  IRI-2020 conditioned on near-real-time GIRO + INGV ionosonde soundings,
  refit ~every 15 minutes with Gaussian-process smoothing (method:
  <https://prop.kc2g.com/about/>; WWROF funded; source at
  <https://github.com/arodland/prop>).
- Station-level data: <https://prop.kc2g.com/api/stations.json>. A
  machine-readable _grid_ export was requested in
  [arodland/prop#9](https://github.com/arodland/prop/issues/9) — its current
  state, and permission/licence to poll at all, are the open questions to
  settle before any code. This would be the plugin's first non-NOAA source;
  fallbacks are nearest-ionosonde point values or raw GIRO data.
- Operator rules of thumb worth carrying into display and derivation work
  (from the wiki): a path only needs the MUF above it at the _control
  points_ where it actually bounces, so a single mid-path sample is a fair
  first read for one low-angle hop; for hops under 3000 km the usable
  ceiling slides from the MUF down toward foF2 as the radiation angle
  steepens; and foF2 reads directly as band behaviour — around 7 MHz and up,
  40 m "goes short" (NVIS works), below about 3 MHz, 80 m "goes long" and
  local stations disappear.

### GOES X-ray and proton flux series → [#83](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/83)

- JSON series on the host already polled:
  `https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json` (X-ray
  records, ~1-minute cadence) and `integral-protons-6-hour.json` (proton
  records, ~5-minute cadence), with `-1-day` / `-3-day` variants also
  available. `docs/noaa-products.md` already measured all three windows for
  #83 and found `-6-hour` the right poll target — `-1-day` is ~4x the bytes,
  `-3-day` ~12x, for the same latest value the plugin would publish.
  `https://services.swpc.noaa.gov/json/goes/instrument-sources.json` maps
  primary/secondary satellites. Product page:
  <https://www.swpc.noaa.gov/products/goes-x-ray-flux>.
- Flux, not just class/level, is what shows a flare building vs. decaying —
  the "when does this blackout end" question — and gives days of lead on
  polar cap absorption. Class thresholds for context, per NOAA's SWPC
  R-scale table: M1 = 1e-5 W/m² = R1, M5 = 5e-5 W/m² = R2, X1 = 1e-4 W/m² =
  R3, X10 = 1e-3 W/m² = R4, X20 = 2e-3 W/m² = R5; S1 = 10 pfu at ≥10 MeV.
- X-ray flux in W/m² is genuinely SI. Proton flux is per-cm²·s·sr (pfu);
  the honest Signal K treatment needs deciding.

### A-index, sunspot number, WWV text → [#84](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/84)

- The Geophysical Alert Message — the text read on WWV at :18 — is
  `https://services.swpc.noaa.gov/text/wwv.txt`: SFI, estimated planetary
  A-index, current K, and a plain-English 24 h summary/forecast, ~3-hourly
  per NOAA's own broadcast schedule (unmeasured — `docs/noaa-products.md`'s
  probe window was too short to establish the actual issue cadence), a few
  hundred bytes. Product page:
  <https://www.swpc.noaa.gov/products/geophysical-alert-wwv-text>.
- "SFI / A / K / SSN" is the phrase every ham reads conditions in; the
  plugin has SFI and Kp, lacks A and SSN. `docs/noaa-products.md`'s
  "Sunspot number (#84)" section already settled the SSN source: the
  `/json/solar-cycle/` products are monthly-only or the unbounded full
  history per poll, so it picked `/text/daily-solar-indices.txt` (DSD.txt)
  instead. The `current-space-weather-indices` fixture already in
  `examples/` shows the related text-product family (Boulder running A,
  proton/electron/X-ray readings).

### Band-conditions panel and greyline → [#85](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/85)

- The most-embedded operator view is N0NBH's hamqsl.com panel
  (<https://www.hamqsl.com/solar.html>): per-band-group day/night
  Good/Fair/Poor. Its inputs are the indices above; its exact formulas are
  not published (<https://www.hamqsl.com/FAQ.html> describes inputs and a
  confidence factor, not the mapping), so the plugin's version must document
  its own derivation and label the output an estimate rather than clone a
  black box.
- The greyline terminator is computed from vessel position and time — the one
  feature in the initiative that needs no network feed and cannot go stale
  because of endpoint failure offshore.

### HF email delivery and ingest → [#86](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/86)

- Offshore boats already run store-and-forward email over HF: Winlink (ham),
  Sailmail (marine), clients Airmail / Winlink Express /
  [Pat](https://getpat.io) (open source, Pi-friendly).
- Transmit routes that already exist, no infrastructure to build:
  [Saildocs](https://www.saildocs.com/) returns any URL as plain text by
  email (`send <url>`, plus `sub` subscriptions) — `wwv.txt` and
  `advisory-outlook.txt` are byte-for-byte the right payloads; and SWPC's
  own e-mail subscription service
  (<https://www.swpc.noaa.gov/content/subscription-services>) can deliver
  alerts directly to a Winlink/Sailmail address.
- The plugin-side feature is ingest: watch a mailbox directory (or IMAP),
  recognise known product texts, reuse the existing pure parsers, and feed
  the normal cache with an honest observation time. Received emails are the
  test fixtures, so the no-network test rule holds by construction.

## What was deliberately left out

- **Sporadic E** (summer short skip when the E layer briefly turns
  reflective): real, and the wiki mentions it, but there is no reliable
  nowcast feed to build a product on — Es is spotted, not forecast. Nothing
  to poll, so nothing to file.

- **Live propagation truth** (PSKReporter, WSPRnet, Reverse Beacon Network):
  what is actually being heard, the empirical complement to all of the
  above. Left out because the APIs are rate-sensitive, the data is
  station-dependent, and the value on a boat (usually without a spotting
  receiver) is thinner. Worth revisiting if operators using the plugin ask.
- **VOACAP-style point-to-point prediction** (coverage/reliability between
  the vessel and a named station): real operator value but a heavyweight
  model with a large parameter surface — a plugin of its own if ever.
- **Per-entry alert mirroring, louder defaults**: the existing notification
  policy (`methodForState`, the two thresholds) already carries the alerting
  story; nothing in this initiative adds a new alarm source.
