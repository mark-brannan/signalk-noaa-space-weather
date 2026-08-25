# Tier 2: the scheduled cross-source check

Design for the recurring live check in issue #121. **Nothing here is built
yet** — this file settles the open questions the issue lists so the
implementation is one reviewable step rather than five arguments.

The offline half (Tier 1) is **in review, not landed**: PR #124 extracts the
scales render out of `index.html` into `public/scales.js` and adds
`test/scales-render.test.ts`, which runs the real product over every payload in
`examples/` and fails if a rendered field is `0` across all of them. That
catches a surface wired to a dead path. It cannot catch NOAA changing a payload
shape tomorrow, because tomorrow's payload is not in `examples/`. That is this
check's job. **Everything below that calls `scalesCard()` is blocked on #124
landing**; nothing else here is.

## What it asserts

Three independent NOAA products state the same fact — the worst G/S/R level in
the last 24 hours — and only one of them feeds the badges.

| Source | Form | What it gives |
| --- | --- | --- |
| `/products/noaa-scales.json` | JSON, index `-1` | the levels the card draws |
| `/text/wwv.txt` | prose | *"Radio blackouts reaching the R2 level occurred."* |
| `/products/alerts.json` | prose messages | `NOAA Scale: R2 - Moderate` on messages in force |

`wwv.txt` is the oracle. It is written by a different process for a different
audience, it states the same 24-hour maximum in words, and this plugin already
fetches it (the `aIndex` product) while deliberately ignoring those sentences.
`alerts.json` is the third opinion: `currentAlertNotifications` in `parse.ts`
already extracts the message code and its NOAA scale.

The assertion is that the card's `observed.G/S/R` matches WWV's stated maximum,
and that no message in force names a level above what the card shows.

## The oracle, read properly

The captured bulletins do not say what a first reading suggests, and the
difference decides whether the quiet-day argument below holds.

`examples/wwv.2026_08_25.txt`:

```
Space weather for the past 24 hours has been moderate.
Radio blackouts reaching the R2 level occurred.
```

There is no G sentence and no S sentence. `examples/wwv.2026_08_20.txt`, a
G1/R1 day, has a G line and an R line and no S line. So **a per-scale sentence
appears only when that scale was non-zero**: per-scale quiet is stated by
omission, not positively, and a matcher that only looks for storm sentences
reads a missing G line as "no assertion" and loses its quiet-day teeth
entirely.

What *is* positive, every day, is the summary line — *"Space weather for the
past 24 hours has been moderate."* That adjective is NOAA's own scale word
(`NoaaScaleNames` in `parse.ts`; `noaa-scales.json` spells the same word in its
`Text` field), and it names the maximum across all three scales. So the
load-bearing comparison is one line:

```
NoaaScaleNames[max(G, S, R) of the card's observed] === the bulletin's summary adjective
```

true on a quiet day, on a G4 day, and on every day between, with the per-scale
sentences as a second, finer assertion where they exist.

*Still open:* the wording when the maximum is 0. Neither captured bulletin is
fully quiet — 2026-08-20 is *minor*, 2026-08-25 is *moderate*. The forecast half
of the 08-20 bulletin reads "No space weather storms are predicted for the next
24 hours", which suggests the observed half has a matching form, but that is
inference. **Capture a genuinely quiet dated pair — `wwv.txt` and
`noaa-scales.json` from the same hour — before writing the matcher**, per the
"capture a dated fixture before writing a parser" rule. The 2026-08-25 pair is
already captured and should be committed with it.

That pair is also the evidence that this check has teeth on an ordinary day:
2026-08-25 was G0/S0, its `latest` block reads R0, its `-1` block reads R2, and
WWV says *moderate* / *R2 occurred*. It is issue #120 reproduced from live data
on a day with nothing in the sky.

**Windows do not line up exactly.** That `-1` block is stamped 2026-08-24
18:24 and the bulletin was issued 2026-08-25 18:05 for "indices for 24 August".
Close, not identical, so a one-level disagreement around a transition is
normal. The rule that handles it is below, under alarming: **disagree twice in
a row before saying anything.**

## Teeth on a quiet day

The issue names this as the question that decides whether the check is worth
building — on a quiet day every scale legitimately reads 0 and agreement is
free. Four answers, in order of how much they buy:

**Replay a captured storm through the whole stack every run.** This is the one
that does not depend on the sky at all. A G4 fixture set is served to a real
server running this plugin, and the badges are read at the far end. It is
deterministic, it has a storm in it every single run, and it exercises the hop
the live check cannot: product → `publisher.ts` → Signal K path → API → the
page. Layer 2 below.

**The summary-adjective assertion is a real comparison at level 0.** Per the
section above: WWV names the maximum in words whatever it is, so
`card.observed` is checked against a claim rather than against an absence,
every day of the year.

**Shape checks are level-independent.** Assert that each field *parses*, not
only that it agrees: `-1` and `0` exist in the payload, `G/S/R` are present,
`Scale` is an integer, WWV's summary line is found at all. The two shape
changes in this plugin's history (solar wind `Bt`→`bt`, the Kp table
alternating form) would both have tripped this on a dead-quiet day.

**Say "unproven", not "green".** Agreement at 0/0/0 corroborates less than
agreement at G4. The check records the last date any live source reported a
non-zero level and reports how long it has been since the live comparison had a
storm in it. Weeks of quiet is normal and not a failure; it is context the run
summary must carry, so a green streak is never mistaken for a proven one.

## Four layers, one library

The issue frames this as one job that fetches NOAA *and* drives a browser, and
that pairing is what makes both halves look unaffordable. Live data on a quiet
day barely justifies starting Chromium; a browser is only interesting when
there is a storm to look at. **Live-versus-captured and headless-versus-browser
are separate axes.** Cross them the other way and every layer is cheap and
every layer has teeth on every run:

| | What it runs against | What only it can catch | When |
| --- | --- | --- | --- |
| **L0** offline suite | fixtures in `examples/` | a card wired to a dead path (#120) | every push, `npm test` |
| **L1** live cross-source | today's NOAA, pure transforms | NOAA changed shape or the sources disagree | scheduled, minutes |
| **L2** storm replay | a captured G4 set, real server + browser | a broken publish path, zone metadata, the webapp mount, model→DOM | scheduled, every run |
| **L3** deployed instance | whatever is actually installed | this install, this config, this hardware | opportunistic, local |

L0 is #124. L1 and L2 are what this document proposes building. L3 is a mode of
the same script, not a fourth program.

They share one library — `scripts/noaa-cross-check/`, its own `package.json`
the way `scripts/screenshots/` already is, so a root `npm ci` never installs
it. It exports the comparison; the layers differ only in where the payloads
come from and whether a browser reads the far end.

**L2 is where Playwright earns its cost, and only there.** The browser buys one
hop — "the model reached the DOM" — which is genuinely rarer than a wiring or
shape bug. But it is the *last* hop of the only path that runs the real
`publisher.ts` against a real server, and pointed at a captured storm it costs
nothing in flakiness from NOAA being down or quiet. Against live data it would
have bought the same hop at three times the cost and only on storm days; that
is the version worth declining, and declining it is not the same as declining
the browser.

A cheaper L2 exists if the full one proves flaky: skip the server, synthesize
the API tree from the plugin's own transforms, and serve it to `index.html`
under Playwright. That keeps model→DOM and drops signalk-server's tree assembly
and the webapp mount. It is a strict subset, so it is the fallback rather than
a competing design — but it drops exactly the pieces `scripts/mock-webapp.mjs`
already fabricates, which is most of the reason to build L2 at all.

## Where each layer runs

**Both, and the constraint is narrower than it looks.** GitHub-hosted runners
cannot reach 3000 on this desktop or symphony's instance — but L2 does not want
either of them. A hosted runner installs signalk-server, links this plugin,
starts it on its own loopback and drives Chromium at it, with no tailnet, no
secret, and no shared lock to contend for. Standing up a server and *reaching
someone else's* server are different asks, and only the second is blocked.

So:

- **L1 and L2: GitHub Actions, cloud-hosted, one scheduled workflow.** Visible,
  durable history, needs no machine to be awake. A cron on a desktop is
  invisible when the desktop is off, and this repo has been bitten once already
  by an orphaned supervisor loop nobody could see.
- **L3: a local timer, not a self-hosted runner.** This repo is public, and a
  self-hosted runner on a public repo will execute a fork's pull request on the
  machine it is registered to. Trigger restrictions narrow that; not having the
  runner closes it. The same script, run from a systemd timer or a cron with
  `--url http://localhost:3010`, reports into the same issue through `gh` and
  needs no runner registration at all.
- If a self-hosted runner is ever wanted anyway: its own workflow, `schedule`
  and `workflow_dispatch` triggers only, a dedicated label, and
  `if: vars.SELF_HOSTED_CHECK == 'true'` — because a job targeting a label with
  no runner registered does not fail, it queues for 24 hours and then expires,
  which reads as neither pass nor fail.
- **Rejected: Tailscale in CI to reach the boat or the desktop.** It puts a
  tailnet auth key in a public repo's secrets and gives a cloud runner a route
  onto the network, to answer a question a local timer answers with no key at
  all.

L3 can only ever produce information, never a gate: the machine is off most of
the time, and marine internet is not a CI dependency. Its silence is reported
the same way a quiet streak is — "last deployed check: 9 days ago" — so nobody
reads an absent result as a passing one.

## Feeding a storm to a real server

L2 needs the plugin to fetch a captured payload instead of NOAA, inside a
runner with no special networking. `API` in `src/noaa/client.ts` is a single
exported const, so the whole seam is:

```ts
export const API = process.env.NOAA_API_BASE ?? 'https://services.swpc.noaa.gov'
```

with the check serving `examples/` on loopback under NOAA's own subpaths (a
small path table in the check, since fixture names are dated and endpoint names
are not).

The trade-off is honest and worth stating: that is a line of production code
whose only caller is a test. It rots silently if nothing else touches it, so
the offline suite asserts both sides of the default with a stubbed `fetch` —
no server, no network, a few lines. It also makes the plugin runnable offline
for webapp work against real captured payloads rather than
`mock-webapp.mjs`'s fabricated ones.

Considered and rejected: intercepting global `fetch` from a `--require`
preload with undici's `MockAgent`. It needs no production change, but it works
by setting the symbol Node's internal fetch reads, and when a Node upgrade
moves that, the failure arrives looking like a plugin bug rather than a harness
one.

## Cost, and what has not been measured

- **L1** adds no dependency beyond what the repo already builds and runs in
  seconds. Effectively free.
- **L2** costs a Chromium download (cacheable, and `scripts/screenshots/`
  already depends on Playwright) plus a signalk-server install and a boot.
  **This is unmeasured.** Measure it before committing to L2 — install, boot to
  first published delta, and one badge read — and put the numbers in
  `docs/noaa-products.md` with their date, the way every other measurement in
  this repo is. If boot dominates, the cheaper L2 above is the answer.
- **Flake budget.** L2 is the flakiest thing in this repo's orbit by
  construction. It never sits on the release path — schedule and
  `workflow_dispatch` only, never `pull_request` — and the two-consecutive-runs
  rule below means one bad run is not an alarm.

## Alarming

**Open one issue, do not fail the job.** A red scheduled job is easy to stop
seeing. The run opens an issue labelled `noaa-drift` on disagreement and
updates that same issue rather than minting a new one per day — the
`alerts.json` lesson from #45, applied to ourselves.

**Disagree twice in a row before writing anything.** The 24-hour windows the
three sources describe do not start at the same minute (see above), so a
single-run one-level disagreement across a transition is expected and is not
drift. Two consecutive runs disagreeing the same way is. This is also what
absorbs an L2 flake and a NOAA 502.

Each update carries the run context the quiet-day argument requires: which
layer disagreed, the three values, and how long it has been since the live
comparison last had a storm in it.

## Off the registry path

The registry clones the default branch and runs `npm ci`, `npm run build`,
`npm test` under `firejail --net=none` with a 60 second cap. This check adds:

- no root dependency (its own `package.json`, never installed by the root one)
- no test file under `test/` (it is a script, not a vitest suite)
- no network on the `npm test` path (`test/offline.test.ts` still asserts that)
- a workflow file, which the registry never runs

The one production line it does add — the `NOAA_API_BASE` default above — is
inert unless the variable is set, and the offline suite covers both sides.

## What to build

1. Capture a quiet `wwv.txt` and its matching `noaa-scales.json` into
   `examples/`, and commit the already-captured 2026-08-25 pair alongside.
2. A parser for WWV's summary adjective and its three storm sentences, offline
   tested against the quiet, minor and moderate fixtures. It belongs in the
   check, not in `parse.ts`: the plugin has no use for a second source of a
   value already on a path.
3. **L1** — fetch, transform, `scalesCard()`, compare against the bulletin and
   against the in-force alert scales. *(Blocked on #124.)*
4. Measure what L2 costs. Decide between the full and cheap forms on the
   numbers, and record them in `docs/noaa-products.md`.
5. **L2** — the `NOAA_API_BASE` seam, the fixture server, a real signalk-server
   with the plugin linked, and one Playwright assertion that the badges read
   the captured storm.
6. The workflow: schedule, both layers, open-or-update the `noaa-drift` issue
   on a second consecutive disagreement.
7. **L3** — the same script behind a `--url`, and a line in `RUNBOOK.md` for
   installing the timer.
