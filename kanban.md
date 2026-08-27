# Open loops

Work in flight, and only that. Facts go to `docs/`, questions go to an issue,
history goes to `git log` — see [AGENTS.md](AGENTS.md#open-loops-live-in-kanbanmd)
for the rules. A card carries a link, the action, and — when it applies —
what it is blocked by. Delete it when it is done.

## Yours

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
      event: the quiet-day grid draws one contour and decides nothing
      ([#170](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/170))
- [ ] Rule on the map panel being dark in **both** themes — NOAA's D-RAP
      colorbar starts at `#000000` and was sampled against a black globe, so
      matching their colours on a light dashboard meant giving the panel its
      own ground; the alternative is a lighter palette that no longer matches
      NOAA
      ([argument](https://github.com/mark-brannan/signalk-noaa-space-weather/blob/main/docs/design-decisions.md#the-map-draws-on-its-own-dark-ground))

## Claude's

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
- [ ] Add `npm run format:check` to the typecheck job in
      [ci.yml](https://github.com/mark-brannan/signalk-noaa-space-weather/blob/main/.github/workflows/ci.yml)
      — AGENTS.md orders it and no check enforces it
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
