# Open loops

Work in flight, and only that. Facts go to `docs/`, questions go to an issue,
history goes to `git log` — see [AGENTS.md](AGENTS.md#open-loops-live-in-kanbanmd)
for the rules. A card carries a link, the action, and — when it applies —
what it is blocked by. Delete it when it is done.

## Yours

- [ ] Send the three coastline-package outreach drafts, in order — the
      SignalK/signalk "Show and tell" discussion first (highest reach), then
      Aitonos, then Flyguy86. All three packages are on npm now, but
      `coastlines` and `coast-wright` are at `0.0.1-alpha.0`; decide whether
      to point strangers at an alpha or cut a real release first. Text, send
      order and a re-verify list are held in the private state repo at
      `state/global/drafts/coastlines-outreach.md`
      ([#179](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/179))
- [ ] Decide whether the webapp should split into tab-like views instead of one
      long scrolling page — the map (and maybe other sections) as its own
      selectable pane, with switcher controls near the top; still a single-page
      app, no real navigation, just controls that read as tabs. Needs your
      call on scope before it's worth an issue
      ([raised on this PR](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/196))
- [ ] Pick how the D-RAP map tiles and webapp map should color-match NOAA's
      colorbar — match NOAA exactly on both surfaces (as asked) or repeat
      aurora's chart-overlay-exact/webapp-adapted split; the measured NOAA
      color stops are on the issue
      ([#170](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/170)).
      Blocks the D-RAP map-tiles card below
- [ ] Decide the fate of `claude-review.yml` after the scope-down — keep the
      narrow version, or drop it entirely (delete the workflow and the
      `CLAUDE_CODE_OAUTH_TOKEN` secret) and let CodeRabbit be the one
      reviewer; also decide whether CodeRabbit itself stays
      ([context](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/156))
- [ ] Review the corpus-canary deletion in `test/scales-render.test.ts` —
      [#146](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/146)
      moved "no number the card draws is dead across the whole corpus" into
      the broader `test/dead-fields.test.ts` sweep rather than deleting the
      coverage outright, and pinned the two storm days by name in the new
      home; worth eyeballing that nothing was lost in the move
- [ ] Decide the fate of the scratch signalk-server on port 3110 — still
      running this branch against live NOAA, spun up during the #146
      false-regression chase
      ([log](https://github.com/mark-brannan/claude_prompts_scratch/blob/main/state/global/log/2026-08-25-dead-field-sweep-and-a-false-regression.md)).
      Kill it once you're done, or fold it into a standing test-rig strategy
      (2026-08-26: nothing listening on 3110 on the dev host — may be gone
      already). Deferred — may overlap with the review-rig design card below
      (portable Docker test instance vs. one-host `~/.signalk`); check there
      first before designing this separately
- [ ] Enable **private vulnerability reporting** (Settings → Code security), so
      the advisory link in
      [SECURITY.md](https://github.com/mark-brannan/signalk-noaa-space-weather/blob/main/SECURITY.md)
      and the Code of Conduct's enforcement contact both work — only a repo
      admin can turn it on
      ([#106](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/106))

- [ ] Paste the cloud-environment setup blob from
      [dotfiles RUNBOOK](https://github.com/mark-brannan/dotfiles/blob/main/RUNBOOK.md#create-a-cloud-environment)
      into all three Claude Code environments — only the web UI can set it, and
      `Default (with tailscale)` currently has no seed, so sessions there get
      no `~/.claude/CLAUDE.md`
- [ ] Decide how a session that isn't `claude-review.yml` (Claude Code web,
      mobile, a plain checkout) gets `~/.claude/CLAUDE.md` — an
      environment-level sync only you can configure
      ([context](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/97#discussion_r3823818406))

- [ ] Decide the three stale branches: `docs/readme` (45 commits ahead of
      main, untouched since 2026-08-01),
      [`claude/plugin-low-hanging-fruit-qms3w6`](https://github.com/mark-brannan/signalk-noaa-space-weather/tree/claude/plugin-low-hanging-fruit-qms3w6)
      and
      [`claude/synthetic-fixtures`](https://github.com/mark-brannan/signalk-noaa-space-weather/tree/claude/synthetic-fixtures)
      (one unlanded commit each; the last is
      [#134](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/134),
      open; the other two have no open pull request) — real unlanded work, so
      not a sweep

- [ ] Design #121's Tier 2 — a recurring live check that fetches NOAA
      directly, drives a real running instance of this plugin in a browser,
      and compares the two, outside `npm test`. Open questions before
      building it: where it runs, which server it drives (`~/.signalk` dev
      instance vs. the published-package Docker instance), whether it asserts
      on the DOM or only the Signal K API, how it alarms, and how it has teeth
      on a quiet day when every scale legitimately reads 0. Whether Playwright
      earns its cost is part of that, not settled in advance — it's the
      heaviest dependency in the repo's orbit. Tier 1 (offline, in `npm test`)
      is done as of
      [#178](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/178)
      ([#121](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/121))
- [ ] Decide whether **Band edges** stays a map control, becomes always-on, or
      goes — the marine SSB band-edge contours over NOAA's colorbar are a
      Claude proposal you asked to see rather than discuss, and the toolbar
      checkbox is the A/B, not a settled design. Judge it during an actual
      event: the quiet-day grid draws one contour and decides nothing.
      Judged 2026-08-26 against a synthetic dayside blackout injected at the
      drap-grid route — quiet draws a single line that reads as a stray
      graticule, a storm draws seven that say which band has gone under, which
      is the case for an off-by-default switch rather than always-on
      ([#170](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/170),
      [#191](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/191))

## Claude's

- [ ] Round 3 on the unified map, from Mark's live review of
      `claude/aurora-draps-map-work` (`public/spaceMap.js`,
      `public/index.html`) after round 2 landed
      ([#198](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/198)):
      - Stack mean/worst directly on top of each other, centered over the
        path line; distance goes directly below that, in the user's own unit
        preference read from Signal K (not hardcoded nmi); all three a size
        larger than they are now
      - The coordinate label at the destination is too busy — keep it small
        and push it out to the far side of the destination/path, away from
        the MHz and distance labels
      - The bearing chip ("218°T") is the initial true bearing from the
        vessel to the clicked target — the heading you'd steer or point a
        directional antenna along to follow that great-circle path
        (`bearingDeg` in `public/drapMap.js`). Real value for a ham operator
        beaming an antenna, distinct from distance. Mark's call on keeping
        it — if kept, stack it below MHz/distance
      - Band-edge contour label: double the size again and use the same
        yellow already used for the aurora % and Kp plot, not the white-halo
        treatment round 2 shipped
      - Stop the "Fetch" button from clearing a scored path — the probe
        should survive a refresh. Card a "Clear path" control separately,
        deferred, not built this round
      - Drop the Expand/Shrink button; always render at the expanded size
      - Match the aurora and D-RAP legend widths — they currently differ
      - Thin out the D-RAP band-edge tick labels on the legend scale itself —
        too many, numbers overlapping/garbled
      - The page shifts width when a Fetch button is clicked or a layer
        checkbox is toggled — find and kill the reflow
      - Drop the dynamic "HF absorption and Aurora" / "Aurora" / "HF
        absorption" caption line entirely — no value, and the coordinates and
        zoom-radius wording it also carries duplicate other readouts. If the
        "N degrees around" wording is worth keeping, move it to sit with the
        zoom slider itself and drop it from everywhere else
      - Fix the last-layer-can't-be-unchecked checkbox: with one layer
        checked-and-disabled and the other unchecked, clicking the
        disabled one should flip both, XOR-style, not no-op
      - Clicking Fetch while one overlay layer is off has "unexpected
        effects" (Mark's wording, not yet reproduced/diagnosed) — investigate
        `handleRefreshClick`/`refetchLayer` interaction with `layerOn()`
- [ ] Once [#191](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/191)
      lands, work through Mark's test-rig punch list on the unified map
      (`public/spaceMap.js`, `public/index.html`):
      - Give the current-position and clicked-target markers distinct icons —
        a small white ship/vessel glyph for the vessel, crosshairs (or a
        station/receiver icon) for the target — instead of two identical dots
      - Cut the map's text density; a lot of what's on it now duplicates
        another readout on the same tile
      - Put the path's headline metric (the worst-cutoff cliff) as a label
        drawn on the path itself, not off in a corner
      - Stack the aurora and D-RAP scales vertically instead of side by side,
        and widen them enough to show the range with real numbers, the way
        NOAA's own scale graphics do — not pixel-identical, just legible with
        a few numeric points on each
      - Drop "Nothing selected" as a map-layer option — either it renders an
        empty map or it isn't offered; removing the whole map tile is wrong
      - Fix the band-edge contour rendering: keep the labelled ticks inside
        the visible range instead of off the edge, stop drawing them directly
        on top of the scale lines (reads as "mucky"), make the numbers read
        clearly as labels, and give them units — "2 MHz" or "< 2 MHz", not
        bare "2"
      - Stack the aurora/HF refresh buttons the same way the scales stack
      - Reflow each map section as: label (e.g. "HF Absorption"), then its
        refresh button to the label's right, then its timestamp to the
        button's right, with that section's scale further right again on a
        wide viewport — dropping down below, still stacked as a group, as the
        viewport narrows
      - Move the help text up and shorten it to something like "Click any
        point to score a path"; an info bubble can carry any extra context,
        if it's worth having at all
      - Stop listing multiple lat/lon pairs down at the bottom of the map —
        if the far end of a path gets a coordinate readout, put it right next
        to that point, and put the distance and worst/mean cutoff figures on
        the path itself, as labels, not in a separate list
- [ ] Fix the other D-RAP path-scoring bug that landed with
      [#169](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/169) —
      `greatCirclePoints`'s fixed 100km step in `public/drapMap.js` can skip
      narrow polar cells (a 4° longitude cell is ~7.8km wide at 89°, so a
      polar-cap blackout can be missed). Pre-dates the rebase; flagged by
      CodeRabbit and left unfixed as out of scope for it —
      [polar coverage](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/169#discussion_r3866708876).
      The antipodal half of this card and the hardcoded grid geometry shipped
      in
      [#183](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/183)
- [ ] Cut the README down — 246 lines and still growing, and every feature
      lands one more paragraph in it. The getting-started path is buried under
      design rationale that belongs in
      [docs/design-decisions.md](https://github.com/mark-brannan/signalk-noaa-space-weather/blob/main/docs/design-decisions.md)
      and measurements that belong in
      [docs/noaa-products.md](https://github.com/mark-brannan/signalk-noaa-space-weather/blob/main/docs/noaa-products.md);
      the settings list has drifted twice already (a count that said six when
      there were seven, a precondition that had stopped being true), which is
      the tell that it is restating what `src/config.ts` already says rather
      than pointing at it. Mark has asked for hands off it until now, so agree
      what the first screen is *for* before cutting: what an installer needs,
      what a reader deciding whether to install needs, and what moves out to a
      `docs/` page. Blocked: that call is Mark's, and the cut is not worth
      making twice

- [ ] Design the review rig with Mark — what portable environment it runs in
      (a compose file in this repo with overridable ports, or a command that
      builds and links into a dedicated plugin-dev Signal K), not one host's
      `~/.signalk`; purpose and both mechanisms are settled, the environment is
      not
      ([#125](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/125)),
      blocked: a one-on-one design pass, deliberately not blocking the rest of
      the #121 plan
- [ ] Range-check the columns in `outlookRow` (`src/parse.ts:1069`) — NOAA
      shipped `1151` in the Sep 01 radio-flux column on 2026-08-24 and
      corrected it by reissuing the same Monday 15 hours later. Only
      `Number.isFinite` guards it, so the bad value went straight onto
      `...outlook27.series`. A corrupt Kp column would likewise reach
      `gScaleForKp`, which has no upper bound, and publish a false level on
      `...outlook27.maxNoaaScale` — a wrong number, not an alarm: outlook27
      carries no `zones` on any path by design and no webapp surface reads
      one. Fixtures for the pair are
      `examples/27-day-outlook.2026_08_24_0259.txt` (corrupt) and
      `...1801.txt` (corrected)
      ([#144](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/144))
- [ ] Add a `.coderabbit.yaml` scoping AGENTS.md's rules by path — with none in
      the repo it reads the whole file as coding guidelines and applied the
      commit-subject format to a CHANGELOG entry
      ([#119](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/119#discussion_r3857388486))
- [ ] Make `examples/` self-policing — 19 of 50 fixtures are named by no test,
      and #133's cron adds more; fail a test on any file `test/fixtures.ts`
      does not list, rather than pruning by hand again
      ([audit](https://claude.ai/code/artifact/6150bdd6-8257-43fe-992c-e24263e340c7))
- [ ] Replace `examples/synthetic/wwv.no-storms.txt` with a real quiet bulletin
      once `capture.mjs fast` catches one — the invented wording is a guess and
      nothing should parse against it
      ([#134](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/134))
- [ ] **2026-09-02**: revisit `RELEASE_WINDOW_HOURS` in
      [scripts/publish-impact.sh](https://github.com/mark-brannan/signalk-noaa-space-weather/blob/main/scripts/publish-impact.sh)
      — started at 6h in [#136](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/136),
      drop to 3 if a week of `git tag --list` shows releases still batching
      well at that cadence. Revisit AGENTS.md's "bias hard towards no bump"
      in the same pass
- [ ] Make a failed publish recoverable in
      [release.yml](https://github.com/mark-brannan/signalk-noaa-space-weather/blob/main/.github/workflows/release.yml)
      — the tag is pushed before `publish.yml` runs, so if the publish fails
      the tag exists, `version_is_ahead` goes false and neither `release.yml`
      nor the version guard ever mentions it again. The red release run is the
      only signal; a re-dispatch of `publish.yml` at the tag is the manual fix
      ([#136](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/136))
- [ ] Fix the three defects the review sweep found on merged PRs: the banner
      claims nothing is in force while a level quieter than the day's peak is
      still running
      ([#127](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/127#discussion_r3856428331)),
      the quiet subtext overclaims a forecast it only bounds at G3
      ([#127](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/127#discussion_r3856431336)),
      and `parseDrapGrid` publishes a torn header's grid stamped with the local
      clock
      ([#101](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/101#discussion_r3828245008)).
      Written and tested on `claude/repo-structure-review-75idam`, closed
      unmerged as out of scope for the audit
      ([#135](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/135))
      — reopen as its own PR. That branch also carries three unrelated fixes
      from the same sweep (the `SCALE_WORDS` reference that never existed,
      `isRaised` typed `any`, a truncated-grid test that passes on an empty
      payload); they are not this card, so split them out
- [ ] Revisit the HF Radio tile's design when any of its four deferred inputs
      lands — MUF/foF2
      ([#82](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/82)),
      the guessed ceiling and SFI thresholds plus their GIRO calibration pass
      ([#85](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/85)),
      the day/night terminator, or the X-ray/proton overlay
      ([#108](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/108));
      the tile is designed _around_ not having them, so each one reopens the
      design rather than adding a number. Context, mockups and the reasoning:
      [#110](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/110)
      and
      [docs/hf-operator-view.md](https://github.com/mark-brannan/signalk-noaa-space-weather/blob/main/docs/hf-operator-view.md)
- [ ] Decide whether a *named* destination is worth building on top of the
      absorption map's click-to-score probe — a route waypoint, a saved
      station list, a callsign lookup. The map answers the path question by
      clicking, so this is a convenience now rather than the feature; wait
      until the map has been used and it is clear which one gets reached for
      ([#167](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/167))
- [ ] Surface the D-RAP header fields the parser currently reads past —
      `Estimated Recovery Time`, `X-RAY Message` and `Proton Message` are
      NOAA's own "when does this blackout end", already inside a payload we
      fetch and throw away. Capture a dated fixture while an R1+ event is in
      force before writing the parser — quiet-day payloads can't pin the
      field's in-event shape
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
      two flare values with a dated `xray-flares-7-day` fixture (the
      endpoint is measured in `docs/noaa-products.md`); the X-ray trend,
      derived from the ~700 records already fetched every poll and currently
      discarded; the F10.7 bands as a labelled convention; and zone metadata on
      the HF paths — reading the
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
- [ ] Take the non-separable-projection gap upstream to
      [coast-wright](https://github.com/mark-brannan/coast-wright) — `limn`
      takes `x(lon)` and `y(lat)` as *separate* functions, which only a
      cylindrical projection can satisfy: on an azimuthal map the pixel column
      a point lands in depends on its latitude too. The webapp now strokes its
      own rings for that case (`strokeRings` in `public/spaceMap.js`), which is
      the second copy of the seam logic the extraction was meant to prevent.
      Either widen `limn`'s signature to `project(lon, lat)` or say in its docs
      that it is cylindrical-only
- [ ] Give the merged 0.29.3 batch a CHANGELOG entry — the version on `main`
      was bumped to 0.29.3 by the commit hook, but nothing between `v0.29.2`
      and the map work wrote to the file: the D-RAP grid drawing
      ([#169](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/169),
      [#183](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/183)),
      the coastline vendoring
      ([#184](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/184))
      and FUNDING.yml
      ([#188](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/188))
      all ship under it unrecorded. The map PR opened the section; the rest of
      the batch belongs in it
- [ ] Recapture `docs/screenshots/space-map.png` against the real dev server —
      the one on the map PR came off `scripts/mock-webapp.mjs`, whose grids are
      genuine NOAA payloads but whose surrounding values are fabricated.
      `scripts/screenshots/capture.mjs --only space-map` does it once
      `~/.signalk` is up on 3010
