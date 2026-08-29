# Open loops

Work in flight, and only that. Facts go to `docs/`, questions go to an issue,
history goes to `git log` — see [AGENTS.md](AGENTS.md#open-loops-live-in-kanbanmd)
for the rules. A card carries a link, the action, and — when it applies —
what it is blocked by. Delete it when it is done.

## Yours

- [ ] Rule on
      [#115](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/115),
      which shipped at 290x270 against a ~530x425 target
- [ ] Rule on the R-scale colouring in
      [#131](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/131)
      — colour currently tracks rarity, not severity, so 1% R1-R2 renders green
      directly above 55% R3-R5 in red; recommendation and evidence are in the
      issue comment, nothing ships until you pick
- [ ] Give [#177](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/177)
      the design pass it was opened to hold, and say what "done" means for it —
      the controls exist but were arrived at ad-hoc, not designed

- [ ] List your gripes with the demo page as it stands, for
      [#199](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/199)'s
      last boxes — most may be moot once phase 1 replaces `demo/index.html`
      with the real webapp, so this is wanted at phase 4, not before, unless
      one of them is structural
- [ ] Decide the map's Expand/Shrink control's fate — it does nothing at a
      narrow viewport, only grows the tile past the page's other columns at
      a wide one, and defaults to shrunk for now (round-3 review on
      [#198](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/198))
- [ ] Turn on GitHub Pages (Settings → Pages → Source: "GitHub Actions") so
      the demo deploy in
      [#202](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/202)
      has somewhere to publish — the URL in the README is dead until the first
      deploy. Then show the page to the Signal K community and write the
      feedback into
      [#199](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/199),
      the issue's own last checkbox
- [ ] Deliver the resource-delivery-layer detail you were holding, and open
      the upstream Signal K discussion once the coastline packages exist
      ([#179](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/179)).
      blocked: the packages shipping
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

- [ ] Two dead links survive into the browser demo, both in `public/`: the
      auth banner's `/admin/#/login` and the aurora empty state's
      `../admin/#/apps/configuration/…`. Both 404 on Pages. Currently
      unreachable there, so this is about the next person who makes them
      reachable

- [ ] Give the demo a real closure guard — `scripts/build-demo.mjs` finds the
      files to copy by regex over imports, and the test can only mirror that
      regex, so a dynamic `import()`, a `new Worker`, or an asset referenced
      from markup is invisible to both. The only true check is loading the
      built page; that belongs in `scripts/screenshots/`, which already has
      Playwright and is outside the registry's offline `npm ci`
- [ ] Revisit the Kp timeline's peak dot in
      [public/index.html](https://github.com/mark-brannan/signalk-noaa-space-weather/blob/main/public/index.html#L1636)
      — it marks nothing but the maximum of the plotted -24h/+72h window
      (earliest point on a tie), red above the G1 floor and amber below, and
      it has no legend entry. Mark's read on seeing it: "kinda funky". Decide
      what it should mark, or drop it

- [ ] Roll release-please out to the other packages that need release
      automation — `ampacity`, `wire-wright`, `coastlines`, `coast-wright`,
      `portolani`. This repo is the template: `release-please-config.json`,
      `.release-please-manifest.json` and
      [release-please.yml](https://github.com/mark-brannan/signalk-noaa-space-weather/blob/main/.github/workflows/release-please.yml).
      Check each one's ruleset for a required status check that no longer
      exists, and whether it signs commits (if so the release PR must be
      squash-merged)

- [ ] Confirm or reverse the call made landing
      [#231](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/231)
      (v0.29.9): it went ahead of
      [#225](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/225)
      while a session was still working that branch, and cut the scope to the
      fix alone. Landing tonight was instructed; those two were not

- [ ] Decide whether the weekly live check should also run the product parsers
      over what it fetched — it has the payloads in hand and today only asserts
      wire size
      ([check-noaa-live.mjs](https://github.com/mark-brannan/signalk-noaa-space-weather/blob/main/scripts/check-noaa-live.mjs))
- [ ] Make the HF tile read as "not enabled" rather than "still loading" when
      `goesFluxEnabled` is off — which is now the default, so a brand-new user
      sees a bare dash on Proton flux and X-ray trend from first load. Thread
      `status.settings.goesFluxEnabled` in the way `auroraScheduled` /
      `drapScheduled` already are, and render **Not enabled** on those two
      rows. Same edit should give the tile a **Fetch once** control for the
      new `goesflux-refresh` route (the route exists and is tested, but
      nothing calls it, so with the box unticked the only way to a reading is
      to tick it)
      ([#228](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/228)).
      blocked: `public/index.html`, which #228 deliberately did not touch
- [ ] Check whether the D-RAP legend's own labels collide in the plugin's
      tile the way they did on the demo page — at NOAA's 5 MHz interval and a
      190px bar, "35 MHz" runs back over the 30 next to it; the demo moved the
      unit to the row label instead
      ([drapLegendHtml](https://github.com/mark-brannan/signalk-noaa-space-weather/blob/main/public/index.html))

- [ ] Nothing guards the map tile's Expand geometry: `applyExpandedWidth` in
      `public/index.html` is layout behaviour, so it only fails in a real
      browser, and the two attempts at it
      ([#201](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/201))
      were both verified by a throwaway Playwright script. Decide whether a
      browser-level check earns a home in the repo — it cannot join `npm test`,
      which the registry runs offline under a 60s cap, so it would have to be a
      separate package like `scripts/screenshots/`

- [ ] Tidy `mapView`'s return shape in `public/projection.js` once
      [#191](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/191)
      lands — it returns `center` as the *settled* value but `radiusDeg` as the
      *requested* one (pass 0, get 0 back, render 1), and it computes
      `proj.radiusWorld(radiusDeg)` internally then throws it away so
      `spaceMap.js:213` re-derives it. Exposing the resolved `radius` fixes
      both. Also unreachable: `toPixel`'s `if (!world) return null`, which is
      why every call site carries a `!`. Not correctness bugs — the maths swept
      clean in
      [#194](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/194);
      carded because #191 is being split into tiers and the comment on it
      ([here](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/191#issuecomment-5433552941))
      would go with it
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

- [ ] Make a failed publish recoverable in
      [release-please.yml](https://github.com/mark-brannan/signalk-noaa-space-weather/blob/main/.github/workflows/release-please.yml)
      — release-please tags and creates the Release before `publish.yml` runs,
      so if the publish fails the tag exists, release-please considers the
      version shipped and never mentions it again. The red release run is the
      only signal; a re-dispatch of `publish.yml` at the tag is the manual fix
      ([#136](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/136))
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
- [ ] Trim the "The D-RAP map is the deliverable" section in
      [docs/design-decisions.md](https://github.com/mark-brannan/signalk-noaa-space-weather/blob/main/docs/design-decisions.md) —
      its colour-ramp paragraph re-argues "The D-RAP overlay is coloured by
      band, not by frequency" and its cache paragraph re-argues "A global grid
      is worth fetching before there is anywhere to index it". Cut to the
      map-is-the-input argument and the sampling / worst-and-mean choices, and
      link the other two. The same file also carries a half-finished
      `*emphasis*` → `_emphasis_` pass that rode in on
      [#169](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/169)
      (lines 167 and 341 still use `*`) — finish it or revert it, and decide
      whether `format:check` should cover markdown at all, since today it only
      covers `src/**/*.ts` and `test/**/*.ts`
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
- [ ] Carry the HF/D-RAP legends past 25 MHz — both the radio tile's band strip
      and the map tile's legend stop at 25.07 MHz, the top **marine SSB** band
      edge (`MARINE_SSB_BAND_EDGES_HZ` in `public/hf.js` / `src/parse.ts`), but
      HF operators work the whole band to ~30 MHz and NOAA's own D-RAP colorbar
      is labelled 0/5/10/15/20/25/30/35. The map bar already runs to 35
      (`LEGEND_MAX_MHZ`); it is the *ticks* that stop early. Decide whether the
      tick set becomes NOAA's fives, stays band edges, or carries both
- [ ] Offer meters as well as MHz on both tiles — HF operators name bands in
      wavelength ("20 meters") as often as in frequency, and the conversion is
      fixed (300/MHz). One click on either the radio tile's band strip or the
      map tile's legend should switch the labels, with the choice remembered.
      Depends on the tick decision above, since a meters scale is only legible
      on band-edge ticks, not on NOAA's even fives
- [ ] Fix the D-RAP legend's right edge — with NOAA's 0–35 MHz labels the last
      two run together, because "35 MHz" is far wider than the 1–2 characters
      the tick spacing was sized for. Still a visible defect, landed knowingly
      (Mark, 2026-08-27: "I would rather lock in what we have right now").
      Options not yet weighed: unit above or beside the bar instead of on the
      last tick, drop the 30 label, or right-align the last tick against the
      bar's end rather than centring it on its fraction
- [ ] Refine the in-force NOAA message surface. A stop-gap shipped on
      2026-08-29 (`public/messages.js` + the overlay off the hero link): the
      list draws every message under `ALERTS_BASE` with its verb, scale, issue
      time, a watch's per-day table and NOAA's own text folded behind a
      toggle. What it does *not* do, and what a design pass is for: a real
      tile rather than a second overlay, the validity window drawn as a window
      rather than a timestamp, a place for the S and R messages that are not
      about a storm at all, and a decision about history — the subtree keeps
      stood-down messages for two days and nothing longer is available without
      re-reading NOAA's 30-day archive.
      https://github.com/mark-brannan/signalk-noaa-space-weather/pull/242
