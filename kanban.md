# Open loops

Work in flight, and only that. Facts go to `docs/`, questions go to an issue,
history goes to `git log` — see [AGENTS.md](AGENTS.md#open-loops-live-in-kanbanmd)
for the rules. A card carries a link, the action, and — when it applies —
what it is blocked by. Delete it when it is done.

## Yours

- [ ] Decide how a release gets published: `main` is `0.29.0` and so is the
      latest tag `v0.29.0`, so `auto-version.yml` reports success and
      publishes nothing on every merge. Harmless for the docs and tooling
      landed so far; not harmless for
      [#135](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/135),
      which changes what the webapp's banner says and carries an
      `[Unreleased]` changelog entry. Either bump explicitly before merging it
      or land
      [#136](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/136),
      which needs a GitHub ruleset call only you can make

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
      (one unlanded commit each, no pull request) — real unlanded work, so
      not a sweep

## Claude's

- [ ] Subset the two unsubset embedded faces in `public/index.html` — Oswald
      (224 KB) and Space Mono (2 x ~128 KB) are the full character range, while
      Nunito and Red Hat Mono are already subset; ~450 KB of a 604 KB page
      ([#135](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/135))
- [ ] Add a `.coderabbit.yaml` scoping AGENTS.md's rules by path — with none in
      the repo it reads the whole file as coding guidelines and applied the
      commit-subject format to a CHANGELOG entry
      ([#119](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/119#discussion_r3857388486))
- [ ] Move the settled arguments out of CLAUDE.md's `## Non-obvious
      constraints` — 229 of its 524 lines, loaded by every session; keep the
      imperative and the issue number, move the defence to the issue or a
      `docs/decisions/` note
      ([audit](https://claude.ai/code/artifact/6150bdd6-8257-43fe-992c-e24263e340c7))
- [ ] Cut AGENTS.md's duplicates of `~/.claude/rules/code.md` — "Draft is a
      working state" (21 lines) and "Tell the maintainer once" (16), down to
      two lines each since a drive-by contributor sees only this file; and
      delete the `github-advanced-security` section if
      [#67](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/67)
      has closed
- [ ] Make `examples/` self-policing — 19 of 50 fixtures are named by no test,
      and #133's cron adds more; fail a test on any file `test/fixtures.ts`
      does not list, rather than pruning by hand again
      ([audit](https://claude.ai/code/artifact/6150bdd6-8257-43fe-992c-e24263e340c7))
- [ ] Merge [#124](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/124)
      once Mark has read it — rebased onto `main`, CI green, every review
      comment addressed, and the one open thread is his own question with a
      reply on it. Then rebase
      [#138](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/138)
      (stacked on it) onto `main` and merge that too
- [ ] Build the dead-field sweep — no field a user-facing surface draws may be
      `0`/null across every fixture — on top of #124's `public/scales.js`.
      blocked: needs #124's endpoint-list extraction; a sweep over `src/` alone
      cannot catch [#120](https://github.com/mark-brannan/signalk-noaa-space-weather/issues/120),
      because the plugin published both paths correctly
- [ ] Replace `examples/synthetic/wwv.no-storms.txt` with a real quiet bulletin
      once `capture.mjs fast` catches one — the invented wording is a guess and
      nothing should parse against it
      ([#134](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/134))
- [ ] Correct the "Tier 1 is done" claim in `docs/noaa-cross-check.md` — #124
      exists but has not landed
      ([#125](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/125#discussion_r3856210060))
