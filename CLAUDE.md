# signalk-noaa-space-weather

A Signal K server plugin that publishes NOAA Space Weather Prediction Center
data to a boat's Signal K instance.

## Architecture

The parsers, the products, the publisher contract and the webapp page are the
[space-weather](https://github.com/mark-brannan/space-weather) package, this
plugin's one runtime dependency. Its `CLAUDE.md` holds that architecture, how
to add a data source, and the endpoint table every fetch is priced from. What
is here is only what makes it a Signal K plugin:

```
src/
  index.ts        plugin definition, start/stop, the HTTP routes, the
                  ONLY module that touches the Signal K `app` object
  tiles.ts        pure rendering: the aurora and D-RAP grids to PNG map tiles
public/           GENERATED -- the package's public/ copied in by
                  scripts/sync-webapp.mjs on prepare/prebuild, plus icon.svg
                  from scripts/sync-icon.mjs; gitignored, ships in the tarball
demo/, app/       the GitHub Pages demo and the standalone PWA: the same
                  page over a different signalk.js, assembled by
                  scripts/build-demo.mjs and build-app.mjs
```

The same page ships three ways, and none of them is a fork of it:

```
public/index.html   + public/signalk.js   -> the Signal K webapp
                    + demo/signalk.js     -> the GitHub Pages demo   (npm run demo:build)
                    + app/signalk.js      -> the standalone PWA      (npm run app:build)
```

`index.ts` imports the core by subpath (`space-weather/config`,
`space-weather/products/registry`, …) and `tsconfig.json` is `nodenext`, so
the package's exports map is what resolves them. A change to what the page
shows or where a number comes from is made in the core and arrives here as a
dependency bump; a change to `public/` here is overwritten on the next
`npm install`.

## Non-obvious constraints

Settled, not obvious, and has cost a release when violated. Argument for each
is in [docs/design-decisions.md](docs/design-decisions.md) (`[↳]`); this list
is the rule only. The constraints on the parsers, the products and the page
-- payload shapes, units, NaN, notifications, the map -- are the core's now,
listed in its `CLAUDE.md`.

- Tests run with no network, inside 60s (`test/offline.test.ts`), against the
  handful of captures under `test/fixtures/`; the corpus is the core's
  `examples/`.
- `main` requires signed commits; cloud sessions have no key -- run
  `resign-branch.sh <branch>` from a keyed machine, or flag it in the PR body.
- The grid fetches regardless of vessel position; retries go through
  `publishFromCache()`, never `refresh()`.
  [↳](docs/design-decisions.md#a-global-grid-is-worth-fetching-before-there-is-anywhere-to-index-it)
- `auroraEnabled`/`drapEnabled` gate the schedule, not a manual refresh,
  which always fetches and defers the next scheduled run.
  [↳](docs/design-decisions.md#auroraenabled-and-drapenabled-govern-the-schedule-not-the-capability)
- Map geography comes only from the core's `geo.js`; `tiles.ts` draws no
  coastline of its own.
  [↳](docs/design-decisions.md#every-webapp-map-draws-its-own-coastline-the-chart-overlay-draws-none)
- `tiles.ts` carries copies of the core's D-RAP colorbar and aurora ramp,
  because a browser cannot import the TypeScript;
  `test/colorbar-mirror.test.ts` pins them identical. Change a table in the
  core and that test is what fails.
- The browser demo is the shipping page: `build-demo.mjs` copies the
  package's `index.html` verbatim through one seam. Never fork it or
  hand-list its files.
  [↳](docs/design-decisions.md#the-demo-is-the-shipping-page-not-a-copy-of-it)
- The standalone app is the same seam with the device's own position,
  never reaching NOAA on a redraw; its worker precaches the shell only.
  [↳](docs/design-decisions.md#the-standalone-app-is-the-fourth-thing-behind-the-same-seam)
- Tile rendering must stay async, one at a time -- never `Promise.all`
  ([↳](docs/design-decisions.md#tile-rendering-must-not-block-the-event-loop)).
  `main` must stay in `package.json` -- `require()` on an absolute path
  ignores `exports`
  ([↳](docs/design-decisions.md#main-must-stay-in-packagejson)).
  `public/` is generated and gitignored, the icon included -- never commit a
  file under it or a symlink
  ([↳](docs/design-decisions.md#the-icon-lives-in-two-places-and-the-second-copy-is-generated)).

## Conventions

No semicolons, two-space indent, single quotes — `npm run format`
(`npm run format:check` verifies). Comments explain *why*, not what.

- **Scope.** YAGNI/DRY/KISS. No error handling for cases that can't happen;
  validate at the boundaries (NOAA payload, saved config, HTTP request) only.
- **Docs.** Measured NOAA facts live only in the core's
  `docs/noaa-products.md`, never in a comment here. Docs describe current
  state, not history — that's `CHANGELOG.md`.
- **Type safety.** `tsconfig.json` has `strict: false` for historical
  reasons — treat it as a convention anyway: no `any` in new code, narrow
  over cast.
- **Performance.** Runs on a Pi 3-5, often on battery. Guard `debug()`
  arguments; publish deltas only when a value changed
  ([#45](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/45)).
- **Configuration.** A setting earns its place only when a sensible default
  would be wrong for someone who can tell the difference. Measure bandwidth
  (gzipped wire bytes, not fixture size on disk) and loudness (notifications
  actually raised) before adding or defending one; `settingsFrom` is the real
  validation, not the schema.
- **Commits.** `<type>(<scope>): <subject>`,
  `feat|fix|docs|style|refactor|test|chore|perf`, imperative, ≤50 chars. One
  logical change per commit.

## Pull requests

`main` is branch-protected — every change lands via a PR;
`~/.claude/rules/code.md`'s branch-vs-main thresholds don't apply here (this
repo can't push straight to `main`). Otherwise same rule as `code.md`'s "PR
ownership": never a draft, never handed over red.

- Branch from latest `main`; `npm run format` and `npm test` must pass.
- One logical change per PR. Title as the release note — it becomes one.
  Rebase onto `main`, never merge it in.
- A PR touching what the page renders here (the tiles, the demo or app
  chrome, the core version) carries pictures: `node
  scripts/screenshots/states.mjs` against a built core checkout, attach the
  states touched.
- **Temporary, delete when [#67](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/67)
  closes:** every scannable PR carries a failing, **empty**-output
  `github-advanced-security` check (`CAPIError: 400`, a Copilot-plan issue,
  not a finding, and not required). Read the log; anything else in it is real.
- **Never touch version numbers.** `release-please` owns them (see
  Releasing). Commit `type` is the only input; `bump-patch-for-minor-pre-major`
  makes the anti-minor bias a config setting — decline a reviewer's
  strict-semver argument and point at the config.

**Board-only PRs merge themselves**, per `code.md`'s "A board-only PR merges
itself" — wired here via `paths-ignore`/`path_filters` in
`.github/workflows/claude-review.yml` and `.coderabbit.yaml`, gated through a
`changes`+`ci-gate` job rather than `paths-ignore` on CI itself (that leaves a
required context pending forever, not passing).
[↳](docs/design-decisions.md#a-board-only-pr-skips-the-matrix-through-a-gate-job-not-a-paths-ignore)

## Local development

```shell
npm install && npm run build && npm test
```

Full procedures — the shared dev server and its lock files, the browser demo
and standalone app builds, the screenshot scripts — are in
[docs/development.md](docs/development.md). Read it before starting a server
or working against a shared instance; `~/.signalk` and `~/symphony` are
shared, not one per session. The mock webapp rig runs from a checkout of the
core: see
[space-weather/docs/development.md](https://github.com/mark-brannan/space-weather/blob/main/docs/development.md).

## Releasing

`release-please` owns the version, the changelog and the tag; merging its
standing `chore: release` PR is the release. Squash-merge it (its commits are
unsigned; a squash gets GitHub's signature, a merge commit doesn't). Full
mechanics, including why publishing is dispatched explicitly rather than on
the tag push, are in
[docs/development.md#releasing](docs/development.md#releasing).
