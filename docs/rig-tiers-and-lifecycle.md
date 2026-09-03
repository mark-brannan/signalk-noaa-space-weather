# Signal K rig tiers and lifecycle

Design, 2026-09-01. How a change in this repo becomes something you can
click, and how the thing serving it gets torn down again. The tier names are
shared with the other Signal K work, not invented here.

## Why

Three faults, all observed on this box on 2026-09-01, not recalled:

- A mock rig on :8732 had been running **4d 16h** out of the scratchpad of a
  worktree that no longer exists. Another on :8731 for 2d 13h, unattributable.
- `~/.signalk/locks/dev-server.lock` was claimed 2026-08-30 by a session whose
  stated purpose was already complete. Nothing releases a lock; it records
  intent only.
- The plugin symlink in `~/.signalk` points at the **main checkout**, so
  branch work in `.claude/worktrees/*` is structurally invisible to the rig.
  Every session either shows main while claiming the branch, or rebuilds the
  main checkout onto a branch and leaves it there.

Prose in CLAUDE.md has not held against any of this. The mechanism has to be
hooks and a control script, not instructions.

## Tiers

Mark's vocabulary, fixed 2026-09-01, and applicable beyond space weather:

| tier                         | meaning                                                                                                          | on this box                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| **alpha**                    | unstable dev: a branch or PR. Several may exist.                                                                 | does not exist yet -- this is the gap |
| **beta**                     | stable dev: `main`, or case-by-case a branch stacked on main carrying a sequenced set of changes                 | `~/.signalk` : 3010                   |
| **gamma** (pre-prod, master) | stable replica of prod: full prod-like config, optionally realistic injected data                                | `~/symphony` : 3000                   |
| **prod**                     | the boat. Testing against it, and modifying it to try things, is explicitly fine -- hobby, not mission-critical. | the boat                              |

`~/.signalk` **is** beta. An earlier draft of this design invented a fourth
tier (`~/.signalk-review`) to avoid touching 3010; that was wrong. The reason
branch work keeps landing on beta is that alpha has nowhere to live. Build
alpha and CLAUDE.md's existing "leave it on main and rebuilt" rule holds
itself.

## Seeding

**prod -> gamma -> beta -> alpha.** Each step is a copy of the tier above
**plus a well-defined override set** applied by the setup script. Never a
fresh empty install: the adjacent plugin configs and their data are part of
what makes a test real.

Overrides are a first-class input, not an afterthought. Minimally the port
and the plugin symlink; the script must leave room for deliberate per-tier
knobs (a fixed position, an injected dataset, a disabled plugin) so that
"seed plus overrides" is the only way a rig is ever built.

### What a seed actually moves

Measured on `~/.signalk`, 2026-09-01. Total 3.4 GB, of which **the
configuration is 152 KB**. That measurement is what makes per-alpha config
directories cheap and "fresh install is expensive" false.

- **Copy** (152 KB): `plugin-config-data/*.json` (22 plugins),
  `settings.json` (port rewritten), `baseDeltas.json`, `applicationData/`,
  `unitpreferences/`, `serverState/`, `package.json`.
- **Symlink, never copy**: `node_modules/`, `noaa-sonar-chart-provider/`,
  `charts/`, `charts-simple/`, `appstore-cache/`.
- **Never carry over**: `locks/`, `*.log`, and the user/token set in
  `security.json` -- copy that file only to inherit `readOnlyAccess: true`.
- **Override**: plugin symlink -> this worktree; the port; the tier's knobs.

`rig reseed` re-derives a tier's config from the tier above and re-applies
its override set, discarding local drift. Cheap by construction.

### The prod seed

`~/.signalk/signalk/` is a copy of **prod's** config directory taken
2026-08-06 14:13 (uniform mtimes = one copy operation), landed one level too
deep inside beta. It holds 42 plugin configs present nowhere else locally and
a `plugin-recovery.md` investigating a plugin-dependency wipe on prod between
2026-07-28 and 2026-07-29, with the full 65-plugin list preserved. It is the
prod->gamma seed this design needs. It must be re-sited, not deleted. See the
board card.

## Lifecycle

`Stop` fires at the end of **every assistant turn**, not at session end --
`stop-continuity.sh` already relies on that. So teardown cannot live there.

- **SessionStart** -- announce and reap. Say whether an alpha for this
  worktree is up and at which URL. Then reap per the rules below.
- **PreToolUse (Bash)** -- the early trigger. When the command matches
  `npm test|vitest|gh pr create|gh pr ready|git push`, kick off
  build-and-restart in the **background** and print the URL, then let the
  command run. The rig warms while the test run burns, so the change is
  clickable by the time results are reported. Precedent for command-regexing
  PreToolUse hooks already exists: `no-git-reset-hard.sh`, `no-draft-pr.sh`.
- **Stop** -- once-per-turn reconcile, the fallback. If dirty: a `public/**`
  change needs no restart (served from disk, reload suffices); a `src/**`
  change needs `tsc` + restart, because signalk-server does not reload a
  plugin in place.
- **SessionEnd** -- teardown, conditional. Leave the alpha up if the branch
  has an open PR (standing instruction: never tear one down before Mark has
  clicked it). Otherwise stop it.
- **Statusline** -- where the URL lives permanently, at zero tokens. Prose
  names it once at stand-up and again only when it changes.

Open: whether archiving a session in the UI fires `SessionEnd` at all. Not
established. The 118 unpushed commits are the real archive exposure and are
fixed by pushing, not by a hook.

## Ownership and reaping

With per-alpha ports there is no shared resource and no lock. Ownership is
**derived, never declared** -- the same principle the core's `webapp-ctl.mjs` already
uses for the mock rig (`lsof` for who is listening, `ps comm` for what it
actually is).

The primary alpha records the worktree and session it serves. A session that
wants it and finds it **idle or its own** takes it. Finds it **held and
live** -> starts a secondary alpha on the next free port and says so in the
same breath as the URL. Multiplicity is what the mechanism produces under
contention, not a policy chosen in advance.

Reaper rules, all restrictive:

1. Never touch a port it has no record of starting. 3000 and 3010 are not in
   the registry and are therefore not reapable, ever.
2. Never auto-reap the primary alpha. Secondaries only.
3. A secondary dies only when its worktree is gone **or** its PR is closed --
   both verifiable, neither a guess.
4. `rig reap` prints and exits. `rig reap --yes` acts.

Rule 3 alone would have killed the 4-day orphan on the first SessionStart
after its worktree vanished.

Always pass an **absolute** config dir, and refuse a path nested under
another config dir -- that is the failure that produced `~/.signalk/signalk/`.

## Manual control

`scripts/rig-ctl.mjs`, the core's `webapp-ctl.mjs` idiom, same no-pidfile discipline
and the same no-dependency constraint as the rest of `scripts/`:

    rig status | start [tier] | stop | switch <branch> | reseed | reap

Procedure in this repo's `docs/development.md` -- it is this plugin's dev
tooling, the same argument #312 used to move `signalk-webapp` out of dotfiles.
A `rig` shell alias goes in dotfiles so no repo path need be typed. If it
later goes multi-plugin, RUNBOOK.md gets a pointer, not a copy.

## URLs

WSL networking mode is **mirrored**, so Windows reaches WSL services on
`localhost` directly -- which is why loopback works from the Windows PC while
LAN and Tailscale IPs time out. **One link, `http://localhost:<port>`.** The
dual localhost/IP workaround can be deleted; the IP form only ever mattered
for the phone, which is a separate card (Hyper-V firewall rule).

`xdg-open` is dropped. It resolves here but `xdg-settings` reports "unknown
desktop environment" and there is no `wslview`; it does nothing. The working
opener would be `explorer.exe <url>`, which takes over the desktop unasked --
not worth it. Print the URL.

## After the core extraction

`public/` and the mock rig (`mock-webapp.mjs`, `webapp-ctl.mjs`) live in the
`space-weather` core. The Signal K rig stays here: it runs `index.ts` in a
server through the symlink in `~/.signalk/node_modules/`, and `index.ts` is
this repo's.

That splits the dirty-detection above. In this repo `public/` is generated
and gitignored -- a copy of the installed package's, made by
`scripts/sync-webapp.mjs` on `npm install` -- so `src/**` is the only watch
set, and a webapp change is not visible here at all: it is made in the core
checkout. The rig therefore has to be able to follow a **linked** core
(`npm link` or a `file:` dependency), rebuild both, and restart. Until it
can, a core-repo session can offer the mock rig but no real Signal K URL,
which breaks the standing rule that both are handed over every cycle; say so
plainly rather than offering the mock alone. The core's
`docs/development.md` says the same from its side.

## Open

- Which of the three link renderings (bare, markdown, labelled) is actually
  clickable in the desktop app.
- Whether alpha's knobs need anything beyond port and plugin symlink on day
  one, or whether the override mechanism ships empty and grows.
- Whether gamma is re-seeded from prod on a cadence or on demand.
