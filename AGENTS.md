# Conventions

How to work in this repo. Adapted from
[signalk-server's AGENTS.md](https://github.com/SignalK/signalk-server/blob/master/AGENTS.md)
so a contribution here arrives in the shape the upstream project expects —
where this repo has to differ, the difference is called out rather than left
to be discovered.

`CLAUDE.md` is the companion: it holds what this codebase *is* (architecture,
the non-obvious constraints, local development, releasing). This file holds how
to behave. Read both.

## Scope

Follow YAGNI, DRY and KISS. Only make changes that were asked for or are
clearly necessary. A bug fix does not need the surrounding code cleaned up. A
new feature does not need extra configurability.

Do not add error handling or validation for cases that cannot happen. Validate
at the boundaries — the NOAA payload, the plugin's saved config, an HTTP
request — and trust internal code in between.

## Comments and docs

Comments explain **why**, never what. No echo comments restating the line
below them.

**Measured facts live in `docs/noaa-products.md`, not in comments.** Wire sizes,
publish cadence, whether a conditional request returns 304 — these are dated
observations against a live service, and a comment cannot carry a date anyone
will update. A comment gets to state an invariant ("a truncated payload must not
be recovered") and point at the doc for the number behind it. Re-measure with
`scripts/measure-noaa.mjs` rather than reasoning about what NOAA probably does;
that habit produced two wrong claims in one day, one of which contradicted this
repo's own changelog.

**Documentation describes the current state, not how it got there.** No
version archaeology in source or in the README: "0.12.0 did X, then 0.13.0
changed it to Y" is what `CHANGELOG.md` is for, and it goes stale everywhere
else. State the rule and the reason it holds. A version number earns its place
in a comment only when it is load-bearing — the migration in
`clearSerialNumberPaths` needs to say which releases left the old paths behind,
because that is the whole point of the code.

## Type safety

New code is TypeScript. `tsconfig.json` has `strict: false` for historical
reasons, so strictness is a convention here rather than a compiler guarantee:
don't add `any` to new code, and prefer narrowing to casting.

## Tests

All new code needs tests. Assert behaviour — values, states, paths, unit
conversions, boundaries — never display strings.

**Tests must run with no network and inside 60 seconds.** The plugin registry
scores this package under `firejail --net=none`. See `CLAUDE.md` for why, and
capture a dated fixture into `examples/` before writing any parser.

## Performance

This runs on a Pi 3-5, often on battery, inside somebody's navigation server.
CPU cycles cost watts, and a plugin does not get to stall the event loop.

- Guard `debug()` arguments — the string is built even when debug is off.
- Don't block on the tile-render path; see the measurements in `CLAUDE.md`.
- Publish deltas only when a value actually changed. Re-broadcasting an
  unchanged set to every connected client on every poll is what
  [#45](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/45)
  was made of.

## Configuration

A setting has to earn its place. The bar is a decision only the boat owner can
make — one where a sensible default would be wrong for someone, and where they
can tell the difference. If no default is defensible, that is a design problem
to solve, not a dial to add.

Before adding or defending one, **measure it**:

- Bandwidth means bytes on the wire. NOAA serves gzipped and Node's `fetch`
  asks for it, so a fixture's size on disk can overstate the real cost by ten
  times.
- Loudness means notifications a user would actually be interrupted by, counted
  against the captured payloads at the default threshold — not paths published.

Prefer a labelled `oneOf`/`const` select over a free number field. Keep `type`
and `default` on the property: without `type` the admin form renders nothing at
all, and without `default` it silently selects the first option. Out-of-range
saved values render as a blank select with no error and save back unchanged, so
`settingsFrom` is the only real validation — put it there.

## Commits

Conventional format: `<type>(<scope>): <subject>`, where type is one of
`feat|fix|docs|style|refactor|test|chore|perf`. Subject in the imperative, 50
characters or fewer, no trailing period. Body wrapped at 72, explaining what
and why. One-liners are fine for small changes.

One logical change per commit. Split unrelated work. Amend a correction into
the commit it belongs to rather than stacking "fix typo" on top — the history
should read as intentional steps, with no work-in-progress artifacts left in
it. Clean it up before pushing.

Stage by path. Never `git add -A`.

## Pull requests

- Branch from latest `main`
- `npm run format` and `npm test` must pass
- One logical change per PR. A refactor and a behaviour change are two PRs.
  If the work would produce two changelog entries, it is two PRs.
- Title as if it were the release note, because it becomes one
- Description: motivation and approach, not mechanics — the diff shows what
  changed. Call out breaking changes explicitly.
- Reference issues with `closes` / `fixes` / `resolves`
- Rebase onto `main`; never merge `main` into the branch

If a request arrives that is outside the current PR's topic, say so and propose
a separate PR rather than quietly folding it in.

### The red `github-advanced-security` check is not yours

**Temporary. Delete this section when
[#67](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/67)
closes.**

Every PR with anything scannable carries a failing `github-advanced-security`
check whose output is **empty** — no title, no summary, no text. It is a
GitHub-managed dynamic workflow with no file under `.github/workflows/`, so
nothing in this repo affects it, and it is not a required check: it has never
blocked a merge and cannot.

Read the job log rather than assuming, because the whole point is to tell this
apart from a real finding. The known signature is `CAPIError: 400 The requested
model is not supported` — the scanner asks for a model the account's Copilot
plan no longer carries, so it fails whenever it has actual work to do, and the
green runs are the ones that found nothing to scan. #67 carries the evidence.
If that is what the log says, note it in one line and move on.

**Anything else in that check is real.** A different error, or a run with
output attached, is the scanner working. Read it.

### Versions: this repo is the exception

Upstream says never to touch version numbers, because a maintainer sets them at
publish time. **Here, the version on `main` *is* the release trigger.**
`.husky/pre-commit` auto-patch-bumps when nothing on the branch has set one
explicitly, and `.github/workflows/auto-version.yml` tags and publishes whatever
lands on `main`. So bump explicitly for anything larger than a patch, and let
the hook cover the rest. Never create a tag locally — CI does that, and a local
tag makes it skip the publish.

**What makes a change minor is what a boat owner can observe, not which
`CHANGELOG.md` heading it lands under.** A new Signal K path, a new product, a
change in what gets published or how loudly — minor. A fix, or plumbing that
only this plugin's own webapp consumes, is a patch even when it adds code and
files under `### Added`. A new route under
`/signalk/v1/api/signalk-noaa-space-weather/` is usually the second kind: those
serve the bundled webapp and nothing outside the tarball can tell whether they
exist. The exception is a route we invite other software to point at — the
aurora tile endpoint is one — which is a capability like any other, and minor.

The webapp itself sits on both sides of that line, so say which side. A route
it consumes, a redraw, a fix to something already displayed: patch. A change in
**what the page tells its reader** — a condition it now distinguishes, a number
it now shows, a state that used to read as something else: minor, on the same
grounds as a change in what gets published. The bundled webapp is how most
owners meet this plugin, and "only the webapp" is not the same claim as "only
its plumbing."

Reviewers reach for the strict reading of semver here, where any new
non-breaking functionality is minor. That reading counts routes nobody outside
this package calls, and it burns a minor version on each one.

## Open loops live in `kanban.md`

Facts have homes already — `docs/noaa-products.md` for measurements, an issue
for anything with a question in it. `kanban.md` is the home for loose ends, and
especially for the ones that cannot become a commit: a stale review-bot
learning, an account setting, a decision only the maintainer can make.

**Write the card when the loop is found, never at the end of a session.** By
the end of a long one the context has been compacted, so the comment link, the
timestamp and the exact wording are gone and what is left is unactionable.
Discovery is the last moment the evidence still exists.

One file, two sections, because the useful edges cross between them — an
agent's card is routinely blocked on the maintainer's, and two files would show
each list clear while the work sits deadlocked.

- One line per card: a link, and the action in the imperative. Add `blocked:`
  and what by only when it is. The link is the part that is never optional —
  a card nobody but its author can resolve is not a card.
- Cards die when done. This is a work-in-progress list, not a log — `git log`
  and `CHANGELOG.md` already keep the history.
- Keep each section short. A list nobody can hold in their head is a second
  place to lose things, so finish or delete before adding.
- Sections and checkboxes, not a table. A markdown table stops being readable
  the first time a line wraps.

If a loop is not worth a card, it is not worth telling the maintainer about
either. That is the point of the file, not a side effect of it.

### End with a prompt, not a status bullet

A closing summary that reads "the vague thing is borked, your call" costs a
read and returns nothing actionable. It also cannot be acted on a week later,
which is when it is actually read.

So when a session ends with work still to do, end with **the follow-up prompt
that would start it** — ready to paste, naming the branch, PR or file it acts
on. Anything the maintainer must do personally is a `kanban.md` card and is
referenced by link. Nothing else goes in a closing message.

Both forms have to survive the session: written so somebody who was not in it
can act on them.
