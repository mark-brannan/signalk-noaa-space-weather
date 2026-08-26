# Open loops

Work in flight, and only that. Facts go to `docs/`, questions go to an issue,
history goes to `git log` — see [AGENTS.md](AGENTS.md#open-loops-live-in-kanbanmd)
for the rules. A card carries a link, the action, and — when it applies —
what it is blocked by. Delete it when it is done.

## Yours

- [ ] Paste the cloud-environment setup blob from
      [dotfiles RUNBOOK](https://github.com/mark-brannan/dotfiles/blob/main/RUNBOOK.md#create-a-cloud-environment)
      into all three Claude Code environments — only the web UI can set it, and
      `Default (with tailscale)` currently has no seed, so sessions there get
      no `~/.claude/CLAUDE.md`
- [ ] Decide how a session that isn't `claude-review.yml` (Claude Code web,
      mobile, a plain checkout) gets `~/.claude/CLAUDE.md` — an
      environment-level sync only you can configure
      ([context](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/97#discussion_r3823818406))

## Claude's

Nothing in flight.
- [ ] Revisit the HF Radio tile's design when any of its four deferred inputs
      lands — the tile was designed *around* not having them, so each one
      reopens the design rather than just adding a number. The band strip
      currently shows only the floor (D-RAP absorption, measured) and makes no
      claim above it, because there is no ceiling to draw: **(a)** MUF/foF2
      ([#82](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/82))
      gives the strip a real upper edge and collapses its three-line legend to
      one; **(b)** the estimated ceiling and the SFI colour thresholds
      ([#85](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/85))
      are going in as *deliberate guesses* — Mark's call, 2026-08-26 — so they
      need a documented derivation in `docs/ham-radio-research.md` and a
      calibration pass against GIRO ionosonde spot values before anyone treats
      them as defensible; **(c)** the day/night terminator moves *both* edges
      of the strip and needs no feed at all, so it changes the rendering, not
      just the numbers; **(d)** the X-ray/proton overlay chart
      ([#108](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/108))
      takes over "when does this blackout end", which is currently the tile's
      job to imply. Design context and rendered mockups:
      [#110](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/110)
- [ ] Render the D-RAP grid as map tiles alongside the aurora overlay —
      `parseDrapGrid` already builds the full 90x90 global grid (42.5 KB
      measured 2026-08-26) and `drap.ts` reads **one cell of 8,100** and
      discards the rest, so the fetch is already paid for. `tiles.ts` is
      nearly generic: `rasterizeTile` and `isValidTile` are grid-agnostic and
      only `auroraGridFrom` and `renderAuroraTile` are aurora-specific, so
      this is a `drapGridFrom`, a colour ramp and a route. NOAA's own radio
      dashboard draws it as a map beside the same OVATION forecast
      ([spaceweather.gov/communities/radio-communications](https://www.spaceweather.gov/communities/radio-communications)),
      which is the argument for these being one charting product rather than
      two ([#32](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/32))
- [ ] Surface the D-RAP header fields the parser currently reads past —
      `Estimated Recovery Time`, `X-RAY Message` and `Proton Message` are
      NOAA's own answer to "when does this blackout end", already inside the
      42.5 KB payload we fetch and throw away. That is the actionable sentence
      the HF tile wants, written by NOAA, at zero extra bandwidth; today it is
      only reachable by re-deriving it from an X-ray flux slope
      ([#32](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/32))
- [ ] Build the HF Radio tile and the data behind it
      ([#110](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/110)) —
      design is settled and recorded on the issue and in
      [docs/hf-operator-view.md](https://github.com/mark-brannan/signalk-noaa-space-weather/blob/main/docs/hf-operator-view.md);
      this is the implementation. Six paths reach `ENDPOINTS` in
      `public/signalk.js`; the three-across row (aurora / Solar Activity / HF
      Radio, all `span-4`) with Solar Wind renamed and dropped from `span-8`;
      the band strip filling only the measured floor;
      [#122](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/122)'s
      two flare values with a dated `xray-flares-7-day` fixture (28.2 KB
      measured 2026-08-26); the X-ray trend, derived from the ~700 records
      already fetched every poll and currently discarded; the F10.7 bands as
      labelled convention; and zone metadata on the HF paths — reading the
      two hazards in `hf-operator-view.md` first, since F10.7 is inverted and
      D-RAP's value is a frequency rather than a severity
- [ ] Review the two HF markdown docs for accuracy and overlap —
      [hf-operator-view.md](https://github.com/mark-brannan/signalk-noaa-space-weather/blob/main/docs/hf-operator-view.md)
      is new and unreviewed, and it deliberately splits from
      [ham-radio-research.md](https://github.com/mark-brannan/signalk-noaa-space-weather/blob/main/docs/ham-radio-research.md)
      along products-versus-reading, which is a line worth checking someone
      else agrees with. Verify every threshold's provenance label, and confirm
      nothing restates a measurement that belongs in
      [noaa-products.md](https://github.com/mark-brannan/signalk-noaa-space-weather/blob/main/docs/noaa-products.md)
      ([#153](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/153))
