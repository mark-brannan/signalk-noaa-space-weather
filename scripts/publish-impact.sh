# Whether a change ships, and whether it has a version to ship under. Sourced
# by .husky/pre-commit and both version workflows; keep it the only copy.

# Paths that cannot change how the plugin behaves. Most are outside
# package.json's "files" and never reach the published tarball.
#
# docs/ is the one judgement call: it IS in "files", so screenshots really do
# ship. It sits here anyway because they change often and change nothing a
# boat can observe -- the tarball's copy just lags a release behind.
#
# Deliberately absent, and keep them that way: src/ compiles into dist/, and
# tsconfig.json changes what dist/ emits.
NO_PUBLISH_IMPACT='^(\.github/|\.husky/|\.gitignore|\.prettierrc|\.editorconfig|scripts/|test/|examples/|docs/|CLAUDE\.md|AGENTS\.md|kanban\.md|vitest\.config\.ts)'

# Reads a file list on stdin; true when any of it reaches the tarball.
publish_impacting() {
  grep -qvE "$NO_PUBLISH_IMPACT"
}

# True when $1 is strictly greater than $2. Strictly, because a stale branch
# also *differs* from the latest tag -- see CLAUDE.md's Releasing section.
version_is_ahead() {
  node -e '
const core = (v) => String(v || "0.0.0").split("-")[0].split(".").map((n) => Number(n) || 0)
const [a, b] = [process.argv[1], process.argv[2]].map(core)
const i = [0, 1, 2].find((i) => a[i] !== b[i])
process.exit(i !== undefined && a[i] > b[i] ? 0 : 1)
' "$1" "$2"
}

# A patch above whichever is higher, the working version or the last release.
next_patch_version() {
  node -e '
const core = (v) => String(v || "0.0.0").split("-")[0].split(".").map((n) => Number(n) || 0)
const [a, b] = [process.argv[1], process.argv[2]].map(core)
const i = [0, 1, 2].find((i) => a[i] !== b[i])
const hi = i === undefined || a[i] > b[i] ? a : b
console.log([hi[0], hi[1], hi[2] + 1].join("."))
' "$1" "$2"
}

# Hours of quiet on main before a pending version publishes. A merge restarts
# the wait, so a busy afternoon ships once when it ends rather than once per
# pull request -- 59 releases in this repo's first 24 days is what that costs
# otherwise. Nothing is left unpublished: the window closing is the trigger.
RELEASE_WINDOW_HOURS=6

# True when the last commit on main ($1, unix seconds) is far enough back
# against now ($2). Now is a parameter so a test can name both ends.
release_window_elapsed() {
  [ "$(($2 - $1))" -ge "$((RELEASE_WINDOW_HOURS * 3600))" ]
}
