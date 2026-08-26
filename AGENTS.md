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
- Don't block on the tile-render path; the measurements are in
  [docs/design-decisions.md](docs/design-decisions.md#tile-rendering-must-not-block-the-event-loop).
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
- A PR that changes the webapp carries pictures. `node
  scripts/screenshots/states.mjs` renders every hero state from the mock in
  both themes; attach the ones the change touches. Words about a banner are
  not a picture of it, and #126 is what a wrong banner nobody looked at costs.

If a request arrives that is outside the current PR's topic, say so and propose
a separate PR rather than quietly folding it in.

### Draft is a working state, not a resting state

Same rule as `~/.claude/rules/code.md` under "PR ownership": never rest in
draft, never hand over a red check. The one exception here is [the red
`github-advanced-security` check](#the-red-github-advanced-security-check-is-not-yours) below.

### Tell the maintainer once, when it is actually their turn

Same rule as `~/.claude/rules/code.md` under "Babysitting a PR is cheap;
polling for it is not": send one message, when everything that can finish
without Mark already has.

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
publish time. Here the version on `main` is what a release carries.

**Bias hard towards no bump at all.** `.husky/pre-commit` writes the patch and
`.github/workflows/version-gate.yml` blocks a pull request that shipped without
one, so an agent that touches the version at all is overriding a decision the
tooling already made correctly. If the hook stood down because `main` is already
past the latest tag, that is the batching working: your change joins the pending
version rather than minting another. Leave it alone. Never create a tag locally
— CI does that, and a local tag makes it skip the publish.

**A minor bump is the maintainer's call, not yours.** Not "ask and then do it":
the number stays a patch unless Mark types `npm version minor` himself. This is
a standing bias, not a judgement to re-litigate per change — the plugin cut 59
releases in its first 24 days and 27 of them were minors, which is not semver
working, it is every author finding their own change significant. Reviewers,
including review bots, will argue the strict reading where any new non-breaking
functionality is minor. That reading counts routes nobody outside this package
calls and burns a version on each one. Decline it and say why.

Revisit this once release cadence has settled; the card is on `kanban.md`.

## Open loops live in `kanban.md`

Facts have homes already — `docs/noaa-products.md` for measurements, an issue
for anything with a question in it. `kanban.md` is this project's board, and
the home for loose ends that cannot become a commit: a stale review-bot
learning, an account setting, a decision only the maintainer can make.

**A board edit is its own pull request, and it is merged in the session that
opened it.** A card is capture — it exists so a loop survives the session, and
a card sitting on an unmerged branch has failed at the one job it had. So don't
carry `kanban.md` along on a feature branch, and don't leave the board PR for
the maintainer to notice: open it, and merge it yourself.

A pull request whose diff touches **only** `kanban.md` needs no review and no
approval to ask for. Merge it as soon as the `version` check is green — the
repo already allows auto-merge, requires no approving review, and deletes the
branch on merge, so one command does all of it:

```shell
gh pr merge --squash --auto --delete-branch
```

**When that merge doesn't land, assume another session's board PR merged
first.** `kanban.md` has no publish impact, so `version` goes green before the
branch has finished pushing — the rule shortens the collision window to
minutes, it does not close it. Rebase onto `main` and push again, and
**resolve the conflict by keeping both sides.** A conflict here is two
sessions having captured different loops, so taking `ours` deletes a card
somebody else just wrote — the one failure the board exists to prevent. If two
cards genuinely contradict, still keep both: the next session to read the
board settles it in the same breath. A duplicate costs a line. A dropped card
costs the loop.

**The review bots don't race that merge, because they don't start.** Left to
themselves they would: `version` is the only required check, so it goes green
in seconds while a reviewer is still booting, and whatever it eventually found
would be posted into a pull request that closed minutes earlier — a comment on
a merged PR is not a finding, it is a message nobody is going to read. So both
reviewers are filtered on the same diff test the merge rule uses, in
`.github/workflows/claude-review.yml` (`paths-ignore`) and `.coderabbit.yaml`
(`path_filters`). Both filters skip a run only when `kanban.md` is the entire
diff, which is exactly the case that merges without waiting.

That trade is deliberate and it is not free: a card with a dead link or a
duplicate of a card three lines up now ships unreviewed. It is worth it because
the board is not code — nothing installs it, and the next session to pull from
it reads every line and can fix one in the same breath. Keep the two filters
and the merge rule matched to each other. Widening the merge rule without
widening the filters gives back the unread review; widening the filters without
the merge rule silently drops review from PRs that still want it.

That authorisation is exactly the diff test and nothing wider: one file, no
other path in the diff. A board edit riding alongside any source, doc or
config change is an ordinary pull request and waits like one.

The card contract, writing one at discovery instead of at wrap-up, and closing
a session with a paste-ready prompt instead of a status bullet are standing
orders now, in `~/.claude/CLAUDE.md`'s "Open loops" section
([dotfiles#15](https://github.com/mark-brannan/dotfiles/pull/15), merged).

That file lives on the maintainer's machine, not in this checkout, so an
agent working this repo has it only if something put it there — that
mechanism belongs to whatever launched the session, not to this file. If
you're missing it, that's the gap to close, not a reason to restate the
rules here.
