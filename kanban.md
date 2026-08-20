# Open loops

Work in flight, and only that. Facts go to `docs/`, questions go to an issue,
history goes to `git log` — see [AGENTS.md](AGENTS.md#open-loops-live-in-kanbanmd)
for the rules. A card carries a link, the action, and what it is blocked by.
Delete it when it is done.

## Yours

- [ ] Delete the stale CodeRabbit learning from
      [PR #91](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/91#discussion_r3819899195)
      at https://app.coderabbit.ai/learnings — the entry stamped
      `2026-08-20T08:33:57Z` on `src/products/aIndex.ts:57-67`, beginning
      "products intentionally republish unchanged values". It is wrong, it
      contradicts `AGENTS.md`'s publish-on-change rule, and the corrected
      learning stamped `08:37:29Z` replaced it. CodeRabbit cannot remove its
      own learning; only the UI can.
- [ ] Add the closing-message rule to `~/.claude/CLAUDE.md` so it applies to
      every repo, not just this one. Text to paste is in
      [PR #95](https://github.com/mark-brannan/signalk-noaa-space-weather/pull/95).
      Agents here run in ephemeral containers, so a global file written from a
      session is gone with the container — this one has to be done on a real
      machine.

## Claude's

- [ ] Nothing in flight.
