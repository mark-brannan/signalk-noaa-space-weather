# Tier 2: the scheduled cross-source check

Design for the recurring live check in issue #121. **Nothing here is built
yet** — this file settles the open questions the issue lists so the
implementation is one reviewable step rather than five arguments.

The offline half (Tier 1) is done: `test/scales-render.test.ts` runs the real
product over every payload in `examples/` and fails if a rendered field is `0`
across all of them. That catches a surface wired to a dead path. It cannot
catch NOAA changing a payload shape tomorrow, because tomorrow's payload is
not in `examples/`. That is this check's job.

## What it asserts

Three independent NOAA products state the same fact — the worst G/S/R level in
the last 24 hours — and only one of them feeds the badges.

| Source | Form | What it gives |
| --- | --- | --- |
| `/products/noaa-scales.json` | JSON, index `-1` | the levels the card draws |
| `/text/wwv.txt` | prose | *"Geomagnetic storms reaching the G1 level occurred."* |
| `/products/alerts.json` | prose messages | `NOAA Scale: R2 - Moderate` on messages in force |

`wwv.txt` is the oracle. It is written by a different process for a different
audience, it states the same 24-hour maximum in words, and this plugin already
fetches it (the `aIndex` product) while deliberately ignoring those sentences.
`alerts.json` is the third opinion: `currentAlertNotifications` in `parse.ts`
already extracts the message code and its NOAA scale.

The assertion is that the card's `observed.G/S/R` matches WWV's stated maximum,
and that no message in force names a level above what the card shows.

## The hard question: teeth on a quiet day

The issue names this as the one that decides whether the check is worth
building — on a quiet day every scale legitimately reads 0 and agreement is
free. Three answers, in order of how much they buy:

**WWV states quiet positively, so a quiet day is still a real assertion.** The
bulletin does not go silent when nothing happened; it says so in a sentence.
So `card.observed.G === 0` is checked against a claim, not against an absence,
every day of the year. A card stuck at 0 through a G2 fails on the quiet-day
path just as it does on a storm day. This is most of the answer, and it is why
the check is worth building. *Open:* the exact quiet wording is unverified —
`examples/wwv.2026_08_20.txt` is a G1/R1 day. Capture a quiet bulletin before
writing the matcher, per the "capture a dated fixture before writing a parser"
rule.

**Shape checks are level-independent.** Assert that each field *parses*, not
only that it agrees: `-1` and `0` exist in the payload, `G/S/R` are present,
`Scale` is an integer, WWV's storm sentences are found at all. The two shape
changes in this plugin's history (solar wind `Bt`→`bt`, the Kp table
alternating form) would both have tripped this on a dead-quiet day.

**Say "unproven", not "green".** Agreement at 0/0/0 corroborates less than
agreement at G4. So the check records the last date any source reported a
non-zero level and reports how long it has been since the comparison last had a
storm in it. Weeks of quiet is normal and not a failure; it is context the run
summary must carry, so a green streak is never mistaken for a proven one.

## Recommendations

**Playwright does not earn its cost here, and Tier 1 is why.** The browser was
the only thing that could answer "what does the badge actually say" while the
wiring lived inline in `index.html`. It no longer does: `scalesCard()` is a
pure function from the endpoint table to the numbers on screen, so the check
can fetch NOAA, run the product transforms, build the API tree, call
`scalesCard()`, and compare — no server, no browser, seconds. What a browser
would add is "the model reached the DOM", a rendering regression, which is
rarer than a wiring or shape one and is what `scripts/screenshots/` already
looks at. Skip it; revisit if a rendering bug ever ships.

**Run it in GitHub Actions on a schedule, not on a machine.** A cron on a
desktop is invisible when the desktop is off, and this repo has already been
bitten once by an orphaned supervisor loop nobody could see. A workflow is
visible, its history is durable, and it needs no boat.

**Drive no server at all.** The `~/.signalk` dev instance and the Docker
published-package instance are both shared, neither is reliably up, and using
either would make a scheduled job contend for a lock with whoever is working.
The check needs the plugin's *code*, which it has, not the plugin *running*.

**Alarm by opening one issue, not by failing the job.** A red scheduled job is
easy to stop seeing. The run opens an issue labelled `noaa-drift` on
disagreement and updates that same issue rather than minting a new one per day
— the alerts.json lesson from #45, applied to ourselves.

**Live it in `scripts/noaa-cross-check/` with its own `package.json`**, the way
`scripts/screenshots/` already is, so a root `npm ci` never installs it. It
imports `src/` and `public/` directly and needs no dependency beyond what the
repo already builds, which is what makes that cheap.

## Off the registry path

The registry clones the default branch and runs `npm ci`, `npm run build`,
`npm test` under `firejail --net=none` with a 60 second cap. This check adds:

- no root dependency (its own `package.json`, never installed by the root one)
- no test file under `test/` (it is a script, not a vitest suite)
- no network on the `npm test` path (`test/offline.test.ts` still asserts that)
- a workflow file, which the registry never runs

## What to build

1. Capture a quiet `wwv.txt` into `examples/`, and a matching `noaa-scales.json`
   from the same day. Two fixtures, one dated pair.
2. A parser for WWV's three storm sentences, offline-tested against both the
   stormy and quiet fixtures. It belongs in the check, not in `parse.ts`: the
   plugin has no use for a second source of a value already on a path.
3. The comparison — fetch, transform, `scalesCard()`, compare against WWV and
   against the in-force alert scales.
4. The workflow: schedule, run, open-or-update the `noaa-drift` issue.
5. A row in `docs/noaa-products.md` for anything the runs measure.
