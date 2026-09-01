# Testing strategy

What is tested at each level, what each level actually proves, and where the
gaps are. Written 2026-09-01 against an inventory of the repo, not recall.

The axiom everything else is shaped by: **`npm test` must pass under
`firejail --net=none` in 60 seconds**, because the Signal K plugin registry
scores this package that way. That is why there is no browser and no network
in the default test run, and why anything needing either lives outside it.
`test/offline.test.ts` asserts the no-network property so a stray request
fails here rather than in the registry.

## The levels

### 0 · Static

`prettier --check`, `tsc` (build), `tsc -p tsconfig.test.json` (typecheck of
the tests). Platform-independent, so CI runs it once rather than across the
matrix.

**Proves:** it compiles, the types line up, the style is uniform.

### 1 · Pure unit

vitest over `parse`, `paths`, `config`, `meter`, `advisory`, `alerts`,
`client`, against **69 dated fixtures** in `examples/`. The largest layer --
`parse.test.ts` alone is 1,399 lines, `alerts.test.ts` 877.

**Proves:** a NOAA payload becomes the right published value. This is where
the "NOAA changes payload shapes without notice" defence lives: a fixture is
captured before a parser is written, and the parser accepts the old shape as
well as the new.

### 2 · Architecture guards

Unusual, and the strongest thing in the suite. Each one pins a decision that
prose alone had already failed to hold:

- `endpoints.test.ts` -- every declared endpoint against
  `docs/noaa-products.md`, byte for byte, so an undeclared fetch is a test
  failure rather than traffic nobody was told about.
- `endpoint-coverage.test.ts` -- every product's endpoints are declared.
- `browser-closure.test.ts` -- walks `src/browser/` and fails if a filesystem
  or server-only edge reappears.
- `webapp-seam.test.ts` -- the page must not regrow a `fetch`, a `WebSocket`
  or a server URL of its own, which is what lets the demo run the shipping
  page unchanged.
- `offline.test.ts` -- the no-network property above.
- `coastline.test.ts` -- the vendored coastline's size ceiling, which is the
  entire argument for shipping it.
- `icon.test.ts`, `dead-fields.test.ts`, `webapp-fonts.test.ts`,
  `scales-source.test.ts`, and the mirror `describe` in `drap-colors.test.ts`.

**Proves:** the shape of the codebase has not drifted. These catch the class
of regression that no amount of value-level testing would.

### 3 · Render

`hero` (500), `hf-render` (598), `scales-render`, `map-raster`, `projection`,
`drap-map`, `tiles`, `aurora-webapp`.

**Proves:** drawing code executes and emits the right operations. It does
**not** prove appearance -- see the critique.

### 4 · Plugin integration, against a fake `app`

`plugin.test.ts` (1,542 lines) plus `test/harness.ts`, a stand-in for the
Signal K `app` object.

**Proves:** start/stop, the refresh routes, scheduling, `refreshOnce`
coalescing, and that a manual refresh never creates a schedule of its own.

### 5 · Live NOAA

`noaa-drift.yml` (Mondays 07:17 UTC) running `check-noaa-live.mjs`, plus
`measure-noaa.mjs`, `capture.mjs` and `watch-drap.mjs` on demand. This is
Tier 1 of the #121 plan.

**Proves:** NOAA's wire shapes and sizes still match what is declared. It
reports; it does not commit.

### 6 · Visual, manual

`scripts/mock-webapp.mjs` with seven fabricated states, `--upstream` to
proxy a real server, and `scripts/screenshots/` -- a **separate npm package**,
because Playwright would blow the registry's offline `npm ci` and its 60
second cap. `capture.mjs` rewrites the README shots; `states.mjs` walks every
mock state into a gitignored contact sheet.

**Proves:** what it looks like, to a human, on demand.

### 7 · A real server

`~/.signalk` (beta), `~/symphony` (gamma), the boat (prod). See
[rig-tiers-and-lifecycle.md](rig-tiers-and-lifecycle.md).

**Proves:** that a real signalk-server actually publishes these paths and
behaves. Entirely manual.

### CI

`ci.yml` gates a merge on levels 0-4, behind a change-detection job so a
docs-only change does not pay for the ~4 minute armv7 QEMU leg.
`claude-review.yml`, `pages.yml`, `release-please.yml` and `publish.yml` are
the rest. **Levels 5, 6 and 7 gate nothing.**

## Critique

The strategy is strong up to the process boundary and absent past it.
Everything that needs a real server or a real pixel is done by a person, on
demand, ungated. Five problems, worst first.

**1. There is no level between a fake `app` object and a human clicking a
rig.** `plugin.test.ts` asserts against a harness, not signalk-server, so
"does the real server publish these paths" is verified only by someone
looking. That gap is why per-branch rigs have been improvised by hand at
least twice with no name or writeup. #121 Tier 2 was designed for this and
never built.

**2. The highest-risk path has the weakest coverage.** `meta.zones` becoming
`notifications.<path>` is the safety-relevant behaviour, and its consumer is
signalk-server's _own_ `zones.ts`. `zones.test.ts` tests the metadata this
repo emits; nothing tests the interaction. The half-open matcher and the
omit-`upper`-on-the-top-zone trap are documented in CLAUDE.md precisely
because they bit, and they are still guarded only by prose.

**3. The default development surface fabricates.** The mock rig proves
rendering and never data, so a plugin-side regression is invisible in the
thing actually being looked at -- which has already cost one round of
misplaced alarm. Live data should be the default and the fabricated states
the opt-in, not the reverse.

**4. The visual layer has no regression detection.** The screenshot package
is correctly outside `npm test`, `states.mjs` output is gitignored, and
neither gates anything. A rendering change is caught only if a human looks at
the right state. Level 3 asserts canvas _operations_, which is not
appearance.

**5. Fixture capture proves shape, not meaning.** The drift cron reports that
NOAA's structure changed, and the parsers deliberately accept old and new. A
silent semantic change -- units, a sign convention, a rescaled column --
passes every level. `outlookRow` taking a `1151` radio-flux value straight
onto a published path is exactly this failure.

## The one addition worth making

A **real headless signalk-server, scratch config, this plugin only, asserted
against over the REST API**: `npm run test:server`, outside `npm test` so the
offline cap is untouched. Boot the server, wait for the paths, assert the
published values and metadata, and assert that a zone crossing actually
raises `notifications.*`.

That closes gap 1 and most of gap 2, and it needs no browser. It is #121's
Tier 2 minus Playwright, which is the part that made Tier 2 look expensive.

With it in place, level 7 stops carrying weight it should not: the tiered
rigs become pre-release validation against beta and gamma, not the mechanism
that catches regressions.
