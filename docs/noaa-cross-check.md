# Checking that the plugin still tells the truth

Design for issue #121's Tier 2 — the recurring live check — and for the rigs
around it. **Nothing here is built yet.** This file settles what is settled and
says plainly what is not, so the parts that are ready are one reviewable step
each rather than five arguments.

Tier 1 **has landed**, in #124 (`7a912bd`). The scales render is out of
`index.html` and in `public/scales.js` as `scalesCard()`, and
`test/scales-render.test.ts` runs the real product over every payload in
`examples/` and fails if a rendered field is `0` across all of them. That
catches a surface wired to a dead path. It cannot catch NOAA changing a payload
shape tomorrow, because tomorrow's payload is not in `examples/` — which is
what everything below is for. Nothing in this document is blocked any more.

## Three environments

Names used throughout, because "the dev server" has meant three different
things in three different sessions:

- **unstable dev** — a branch checkout, whatever is being worked on.
- **stable dev** — the published npm package, matching what an installer gets.
- **prod** — the boat. Bare metal today, a container eventually.

## The rigs

Two exist. The rest are what this document proposes.

| Rig | Code | Data | Observer | Runs on |
| --- | --- | --- | --- | --- |
| offline suite ✅ | branch | `examples/` fixtures | assertions, nothing rendered | `npm test`, every push |
| contact sheet ✅ | branch | mock states | **a human** | local, per webapp PR |
| review rig | branch | injected + replayed | **a human** | unstable dev |
| storm replay | `main` | a captured G4 set | browser assertion | hosted CI, scheduled |
| live cross-check | `main` | live NOAA | API assertion | hosted CI, scheduled |
| release check | published package | live NOAA + replay | assertion, then a human | stable dev |

Three axes, not one ladder — **which code**, **which data**, and **who is
looking**. The issue frames Tier 2 as one job that fetches live NOAA *and*
drives a browser, and that pairing is what makes both halves look
unaffordable: live data on a quiet day does not justify starting Chromium, and
a browser is only interesting when there is a storm to look at. Crossing the
axes the other way makes each rig cheap and gives each one teeth on every run.

**What only a human catches.** #120 was automatable — a wrong path, a number
wrong against another number. #126 was not: the page said *Quiet* in quiet
green during an R2 that NOAA and WWV both called *moderate*, and every value on
it was correct. An assertion written before that bug would have encoded the
same wrong idea and passed. Two of the last three webapp issues were of that
kind, which is why the human rigs are first-class here rather than a footnote.

## What the automated cross-check asserts

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
difference decides whether the quiet-day argument holds.

`examples/wwv.2026_08_25.txt`:

```text
Space weather for the past 24 hours has been moderate.
Radio blackouts reaching the R2 level occurred.
```

No G sentence, no S sentence. `examples/wwv.2026_08_20.txt`, a G1/R1 day, has
a G line and an R line and no S line. So **a per-scale sentence appears only
when that scale was non-zero**: per-scale quiet is stated by omission, and a
matcher that only looks for storm sentences reads a missing G line as "no
assertion" and loses its quiet-day teeth entirely.

What *is* positive, every day, is the summary line — *"Space weather for the
past 24 hours has been moderate."* That adjective is NOAA's own scale word
(`NoaaScaleNames` in `parse.ts`; `noaa-scales.json` spells the same word in its
`Text` field), and it names the maximum across all three scales. So the
load-bearing comparison is one line:

```text
NoaaScaleNames[max(G, S, R) of the card's observed] === the bulletin's summary adjective
```

true on a quiet day, on a G4 day, and on every day between, with the per-scale
sentences as a second, finer assertion where they exist.

*Still open:* the wording when the maximum is 0. Neither captured bulletin is
fully quiet — 2026-08-20 is *minor*, 2026-08-25 is *moderate*. The forecast
half of the 08-20 bulletin reads "No space weather storms are predicted for the
next 24 hours", which suggests the observed half has a matching form, but that
is inference. **Capture a genuinely quiet dated pair — `wwv.txt` and
`noaa-scales.json` from the same hour — before writing the matcher.** Both
2026-08-25 files are on `main` already; the fixture cron from #133 is what will
catch the quiet one, since a quiet day cannot be arranged.

That pair is also the evidence that this check has teeth on an ordinary day:
2026-08-25 was G0/S0, its `latest` block reads R0, its `-1` block reads R2, and
WWV says *moderate* / *R2 occurred*. Issue #120 reproduced from live data on a
day with nothing in the sky.

**Windows do not line up exactly.** That `-1` block is stamped 2026-08-24 18:24
and the bulletin was issued 2026-08-25 18:05 for "indices for 24 August".
Close, not identical, so a one-level disagreement around a transition is
normal — hence the two-runs rule under alarming.

## Teeth on a quiet day

The issue names this as the question that decides whether the check is worth
building: on a quiet day every scale legitimately reads 0 and agreement is
free. Four answers, in order of how much they buy:

**Replay a captured storm through the whole stack every run.** The one that
does not depend on the sky. A G4 fixture set is served to a real server running
this plugin, and the badges are read at the far end: deterministic, a storm in
it every single run, and it exercises the hop the live check cannot — product →
`publisher.ts` → Signal K path → API → the page.

**The summary-adjective assertion is a real comparison at level 0.** Per above,
WWV names the maximum in words whatever it is, so `card.observed` is checked
against a claim rather than against an absence, every day of the year.

**Shape checks are level-independent.** Assert that each field *parses*, not
only that it agrees: `-1` and `0` exist in the payload, `G/S/R` are present,
`Scale` is an integer, WWV's summary line is found at all. Both shape changes
in this plugin's history (solar wind `Bt`→`bt`, the Kp table alternating form)
would have tripped this on a dead-quiet day.

**Say "unproven", not "green".** Agreement at 0/0/0 corroborates less than
agreement at G4, so the summary reports how long it has been since the live
comparison had a storm in it. Weeks of quiet is normal and not a failure; it is
context the summary must carry, so a green streak is never mistaken for a
proven one.

**That figure is derived, not stored.** A scheduled run holds no state between
invocations, and every store that could carry one — a committed file, an
artifact, the run cache — is a second thing to keep correct for a line of prose.
It does not need one: `/products/alerts.json` is a rolling 30-day archive, each
message carrying an `issue_datetime` and its `NOAA Scale:` line, and the run
already fetches it for the third opinion. The most recent message naming a
non-zero level *is* the date, computed fresh every run from a payload already in
hand. Past 30 days the archive says nothing, and neither does the summary: it
reports **"more than 30 days"** rather than a number, which is the honest
statement and not a degraded one — the question the line answers is "has this
check seen a storm lately", and past a month the answer is no either way.

## The review rig — deliberately not settled

**This section is a placeholder for a design that has not happened yet. Do not
build from it, and do not let it hold up anything else in this document.**

What it is for is settled: a human, looking at the real page, driven by branch
code, with data chosen rather than whatever the sky is doing — a G5, a reading
going stale under observation, an aurora value at a specific position. That is
a quality pass before a merge, and it is the rig that would have caught #126.

Two mechanisms are on the table and are not exclusive:

- **Replay** — the plugin fetches captured payloads instead of NOAA, via the
  `NOAA_API_BASE` seam below. Enters at the top of the stack, so client →
  parse → product → `publisher.ts` → paths → zones → API → page is all real.
  Limited to states that exist in `examples/`.
- **Injection** — deltas written straight into the Signal K data model, the way
  `~/.signalk/scripts/set-value.mjs` already does over the server's own WS
  stream. Enters below the plugin, so it proves the *page* reads a path but not
  that the plugin publishes it. In exchange it reaches any state at all,
  instantly, by hand. Two sources on one path race, so the product's schedule
  wants stopping first. **Never inject into prod.**

What is **not** settled is the environment it runs in, and the first sketch was
wrong in an instructive way: it assumed `~/.signalk` on port 3010 with a lock
file, all of which is one host's local configuration and none of which a
contributor cloning this repo has. A rig that only works on one desktop is not
a rig. The portable shapes to weigh:

- a **compose file in this repo** with overridable ports, so any contributor
  gets a plugin-development Signal K without colliding with whatever else they
  run;
- a **command** that builds and links this checkout into a dedicated
  plugin-development environment, owned by the repo rather than by `$HOME`.

Both, one, or something else. This needs a design pass of its own before any
of it is written down as decided.

## Where the automated rigs run, and what they cost

**Hosted CI, and the constraint on that is narrower than it first looked.** A
GitHub-hosted runner cannot reach a desktop's Signal K or symphony's container
— but the storm replay does not want either. It installs signalk-server, links
this plugin, starts it on its own loopback and drives Chromium at it, with no
tailnet, no secret, and no shared instance to contend for. Standing up a server
and reaching *someone else's* server are different asks, and only the second is
blocked.

**Cost: nothing.** This repository is public, and GitHub Actions is free with
unlimited minutes for public repositories on standard GitHub-hosted runners
(measured against GitHub's billing documentation, 2026-08-25). `ubuntu-latest`
is 4 vCPU / 16 GB, which is enough. *Larger* runners are billed even on public
repositories, so do not reach for one. GitHub provisions and destroys the VM
per job: there are no ephemeral containers for anyone here to operate, and
cache and artifact storage do not bill on a public repository either. The only
non-zero options on the table are larger runners and self-hosted hardware, and
both are declined below.

**No self-hosted runner.** This repository is public, and a self-hosted runner
on a public repository will execute a fork's pull request on the machine it is
registered to. Trigger restrictions narrow that; not having the runner closes
it. If one is ever wanted anyway: its own workflow, `schedule` and
`workflow_dispatch` only, a dedicated label, and `if: vars.SELF_HOSTED_CHECK ==
'true'` — because a job targeting a label with no runner registered does not
fail, it queues for 24 hours and then expires, which reads as neither pass nor
fail.

**Rejected: Tailscale in CI** to reach a desktop or the boat. It puts a tailnet
auth key in a public repository's secrets and gives a cloud runner a route onto
the network, to answer a question a local timer answers with no key at all.

**The release check is a local timer, not CI**, for the same reason, and it can
only ever produce information rather than gate anything: the machine is off
most of the time. Its silence is reported the way a quiet streak is — "last
release check: 9 days ago" — so nobody reads an absent result as a passing one.

**What the storm replay costs in wall clock is unmeasured.** A Chromium
download (cacheable, and `scripts/screenshots/` already depends on Playwright),
a signalk-server install, and a boot. Measure it before committing to the full
form, and record the numbers in `docs/noaa-products.md` with their date the way
every other measurement in this repo is. If boot dominates, there is a cheaper
form: skip the server, synthesise the API tree from the plugin's own
transforms, and serve it to `index.html` under Playwright. That keeps model →
DOM and drops signalk-server's tree assembly and the webapp mount — a strict
subset, so it is a fallback rather than a competing design.

## Feeding fixtures to a real server

Every rig that wants chosen data instead of live data needs the plugin to fetch
a captured payload. `API` in `src/noaa/client.ts` is a single exported const,
so the whole seam is:

```ts
const NOAA = 'https://services.swpc.noaa.gov'
const base = process.env.NOAA_API_BASE
if (base !== undefined && base.trim() === '') {
  throw new Error('NOAA_API_BASE is set but empty')
}
export const API = (base ?? NOAA).replace(/\/+$/, '')
```

with the caller serving `examples/` on loopback under NOAA's own subpaths (a
small path table, since fixture names are dated and endpoint names are not). In
a container it is one `environment:` line.

Two details that are not decoration. **Set-but-empty throws**, because it is a
harness that failed to compute a base, and both quiet answers are worse than a
crash: falling back to the default turns the storm replay into a live-data run
that stays green while testing nothing it claims to, and an empty string makes
every request relative and fails somewhere less obvious. Unset is the only
thing that means "use NOAA" — fail closed on a gate, the way `pre_commit` and
the guards in this repo already do. And the trailing slash goes, because the
client builds requests as `API + subPath` and a base ending in `/` yields
`//products/...`, which NOAA tolerates and a fixture server matching exact
paths does not.

The trade-off is worth stating: that is a line of production code whose only
callers are harnesses. It rots silently if nothing else touches it, so the
offline suite asserts both sides of the default with a stubbed `fetch` — no
server, no network, a few lines — the default, an override, a trailing slash
stripped, and set-but-empty throwing. `API` is read once at import, so each case
sets the environment, imports the module fresh (`vi.resetModules()`), and
restores both afterwards; a test that only sets the variable asserts the value
the *first* import happened to see.

Considered and rejected: intercepting global `fetch` from a `--require` preload
with undici's `MockAgent`. It needs no production change, but it works by
setting the symbol Node's internal fetch reads, so a Node upgrade that moves
that arrives looking like a plugin bug rather than a harness one.

## Alarming

**Open one issue, do not fail the job.** A red scheduled job is easy to stop
seeing. The run opens an issue labelled `noaa-drift` on disagreement and
updates that same issue rather than minting a new one per day — the
`alerts.json` lesson from #45, applied to ourselves. One issue at a time, edited
in place, is also what makes it usable as the check's memory below.

**Disagree twice in a row before calling it drift.** The 24-hour windows the
three sources describe do not start at the same minute, so a single-run
one-level disagreement across a transition is expected and is not drift. Two
consecutive runs disagreeing the same way is. This also absorbs a replay flake
— a NOAA outage is handled a paragraph further down, by not counting at all.

**Which only works if the runs are far apart, so the schedule is daily.** Two
runs minutes apart would both sample the same in-flight transition and
"confirm" one disagreement seen twice. NOAA documents `wwv.txt` as three-hourly
and this repo has not measured that (docs/noaa-products.md's Unmeasured list
says so), which is the argument for daily rather than hourly: a day is eight
documented publish cycles, so the rule survives that figure being wrong by a
large factor. Nothing here wants freshness — drift is a property of weeks, and
a check that notices a day late costs nothing.

**The streak is the one thing that must persist, and the issue is where it
lives.** A run that disagrees for the first time opens `noaa-drift` and says so
in the title — *unconfirmed* — rather than staying silent and needing somewhere
else to remember; the second consecutive run confirms it in place. That keeps
one store rather than two, and the store is the artifact a human reads anyway.
An open `noaa-drift` naming the same disagreement as this run is the streak;
absent or naming a different one, this run is the first. Nothing needs a
fallback for missing state, because missing state *is* the initial state.

**A failed or incomplete run neither confirms nor clears.** A NOAA 502, a
replay that did not boot, a source that parsed to `null` — none of that is
evidence of agreement, so the streak is only advanced by a run in which every
compared value was read and parsed. An agreeing run closes `noaa-drift`; a
failed one leaves it exactly as it found it.

Each update carries the context the quiet-day argument requires: which rig
disagreed, the three values, and how long since the live comparison last had a
storm in it.

## Off the registry path

The registry clones the default branch and runs `npm ci`, `npm run build`,
`npm test` under `firejail --net=none` with a 60-second cap. Everything here
adds:

- no root dependency (each rig its own `package.json`, the way
  `scripts/screenshots/` already is, never installed by the root one)
- no test file under `test/` (they are scripts, not vitest suites)
- no network on the `npm test` path (`test/offline.test.ts` still asserts that)
- workflow files, which the registry never runs

The one production line it does add — the `NOAA_API_BASE` default above — is
inert unless the variable is set, and the offline suite covers every branch of
it.

**Where the rigs' own tests live, since not under `test/`.** Each rig is its own
package under `scripts/`, the way `scripts/screenshots/` already is, and its
tests sit beside it — `scripts/cross-check/*.test.mjs`, run by that package's
own `npm test`, never by the root one. The WWV matcher is the first of these:
pure, offline, fed the `examples/` fixtures by path, and no reason it could not
run on every pull request. So it gets a CI job of its own that installs only
that package and runs only its tests. That keeps it visible per-PR without
putting a rig dependency in the root `package.json` or a file the registry's
`npm test` would try to run.

## Plan

Ordered by what unblocks what. **Nothing here waits on the review rig.**

1. **The `NOAA_API_BASE` seam**, plus its two-sided offline test. One line of
   `src/`, and it unblocks both the storm replay and whatever the review rig
   turns out to be.
2. **Fixtures** — a fully quiet `wwv.txt` and its matching `noaa-scales.json`.
   Not a task so much as a wait: #133's cron captures what the sky gives, and
   the matcher's quiet case cannot be written honestly until one arrives.
3. **The WWV matcher** — summary adjective and the three storm sentences, in
   `scripts/cross-check/` with its own package and its own tests, plus the CI
   job that runs them per pull request. Offline, against the quiet, minor and
   moderate fixtures. It belongs in the check, not in `parse.ts`: the plugin has
   no use for a second source of a value already on a path.
4. **Live cross-check** — fetch, transform, `scalesCard()`, compare against the
   bulletin and the in-force alert scales.
5. **Measure the storm replay**, then build it in whichever form the numbers
   justify. It reads the badges through a browser rather than by calling
   `scalesCard()`, so it never depended on Tier 1 and can be measured first if
   that is more convenient.
6. **One scheduled workflow** for 4 and 5, daily, opening or updating
   `noaa-drift` on a second consecutive disagreement.
7. **Release check** — the same comparison behind a `--url`, on a local timer,
   with a line in `RUNBOOK.md` for installing it.

**Review rig: design pass with Mark first.** It is not on this list and does
not block anything on it. See the section above for what is settled (the
purpose, and both mechanisms) and what is not (the environment).
