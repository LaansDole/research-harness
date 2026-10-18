# Fork-Sync Weekly PR Workflow — Design Spec

Date: 2026-09-19
Repo: LaansDole/research-harness (fork of can1357/oh-my-pi)

## Problem

The fork drifts from upstream `can1357/oh-my-pi`. Syncing is a manual,
multi-step git dance (verified procedure in the research-harness skill) that
must be re-done by hand every time. GitHub shows a "This branch has conflicts"
banner while the fork is behind, and clicking "Discard N commits" would delete
the research layer.

## Goal

A weekly automated job that performs the exact manual sync procedure and
opens a PR on the fork. Zero manual steps when there is nothing to do.

## Decision: GitHub Actions scheduled workflow (not a hermes cronjob)

- Runs on GitHub infrastructure — fires even when the Mac is off/asleep.
- Scheduled workflows only trigger from the default branch, so the workflow
  must land on `main`.
- Public repo → Actions minutes are free; `GITHUB_TOKEN` can push branches and
  open PRs on the same repo with explicit `permissions:`.
- Flagged alternative (not chosen): a hermes cronjob dispatching omp locally.
  It would only run while the Mac is on, and burns a local LLM session for a
  mechanical git procedure.

## Components

### 1. `.github/scripts/sync-upstream.sh` (fork-owned, the logic)

Environment (all overridable, sensible defaults for CI):

| Var            | Default                              | Purpose                          |
| -------------- | ------------------------------------ | -------------------------------- |
| `UPSTREAM_URL` | `https://github.com/can1357/oh-my-pi`| upstream remote URL              |
| `SYNC_BRANCH`  | `sync/upstream`                      | fixed PR branch (reused weekly)  |
| `BASE_REF`     | `origin/main`                        | base to build the merge on       |
| `SYNC_DRY_RUN` | unset                                | `1` = stop before push/PR steps  |

Behavior (mirrors the verified manual procedure exactly):

1. Idempotent repo prep: add `upstream` remote if missing; `git fetch origin
   main && git fetch upstream main`.
2. Count upstream commits ahead of `BASE_REF`
   (`git rev-list --count $BASE_REF..upstream/main`). If `0` → print
   `UP-TO-DATE` and exit `0` (workflow skips PR creation).
3. `git checkout -B "$SYNC_BRANCH" "$BASE_REF"` — build on the FETCHED ref,
   never a possibly-stale local `main` (this bit a previous session).
4. `git merge upstream/main --no-ff -m "Merge upstream can1357/oh-my-pi main (N commits) into main"`.
   N is the counted number from step 2 (no commit-count prose in READMEs; a
   commit message is fine and truthful).
5. On `README.md` conflict (the only file both sides own — verified across
   three syncs): `git checkout --ours README.md && git add README.md`. Any
   OTHER conflict → `exit 1` with the conflict list on stderr (fail loudly,
   never auto-resolve the unknown).
6. Refresh `docs/UPSTREAM.md`: fixed 4-line header (with new upstream sha +
   date) + `git show upstream/main:README.md` as body; gate with
   `diff <(tail -n +5 docs/UPSTREAM.md) <(git show upstream/main:README.md)`
   → must be empty.
7. Update the README sync-note line:
   `**Staying in sync with upstream** (synced to upstream \`main\` <sha>, <date>):`
   → new sha + date (sed on the exact prefix; fail if the line is absent).
8. `bash research/tests/run.sh` — must pass (baseline 91 tests, 1 skipped).
9. `git commit` the doc updates (amend into the merge commit is NOT used;
   a second commit `docs: refresh vendored upstream README to <sha>` keeps
   provenance legible).
10. If `SYNC_DRY_RUN=1` → stop here, print `DRY-RUN-OK` + branch state.
11. `git push origin "$SYNC_BRANCH" --force-with-lease` (fixed branch name
    reused weekly).

Exit codes: `0` synced (or dry-run ok), `0` + `UP-TO-DATE` when behind=0,
`1` unexpected conflict/failed gate, `2` usage error.

### 2. `.github/workflows/fork-sync.yml`

- Triggers: `schedule: cron '17 3 * * 1'` (Mon 03:17 UTC = Mon 10:17 +07) +
  `workflow_dispatch` (manual test button).
- `permissions: contents: write, pull-requests: write`.
- `concurrency: group: fork-sync, cancel-in-progress: false`.
- One job on `ubuntu-latest`:
  1. `actions/checkout@v4` with `fetch-depth: 0` (merge needs full history).
  2. git identity config (`github-actions[bot]`).
  3. Run `sync-upstream.sh`, capture its exit + `UP-TO-DATE` marker.
  4. If not up-to-date: `gh pr create --base main --head sync/upstream`
     with title `Sync upstream can1357/oh-my-pi (YYYY-MM-DD)` and a body
     summarizing N commits + the standard resolution note; skip creation if
     the PR already exists (`gh pr view` check).
  5. Never merges the PR automatically — the human reviews and merges
     (Covidence-bar: the user is the reviewer).

### 3. Tests: `.github/tests/test_sync_upstream.py`

Python stdlib unittest (repo convention: offline, temp dirs, one command).
Builds tiny git fixture repos in `tempfile.TemporaryDirectory()` to exercise
the real script end-to-end offline:

- `test_up_to_date_is_noop` — behind=0 → prints UP-TO-DATE, no branch.
- `test_merge_commits_and_updates_docs` — synthetic upstream ahead (non-README
  change) → branch exists, merge commit present, UPSTREAM.md body matches
  upstream README, sync-note sha updated, research tests invoked (stubbed
  marker file counts invocations).
- `test_readme_conflict_resolved_ours` — divergent README histories → merge
  succeeds, README identical to fork's, exit 0.
- `test_unexpected_conflict_fails_loudly` — divergent non-README file → exit 1.
- `test_dry_run_pushes_nothing` — DRY_RUN=1 → branch created locally, no push
  attempted (assert remote has no branch).
- `test_sync_note_missing_aborts` — README without the sync line → exit 1,
  no commit.

## Out of scope

- Auto-merge of the sync PR (human review stays).
- Any change under `packages/`, `crates/`, root `package.json`, lockfiles.
- The hermes cronjob variant.

## Verification (coordinator gates, post-dispatch)

1. `python3 -m unittest discover -s .github/tests -v` — all pass.
2. `bash research/tests/run.sh` — still 91 tests OK.
3. Real-remote dry run: `SYNC_DRY_RUN=1 bash .github/scripts/sync-upstream.sh`
   → `UP-TO-DATE` today (we just synced), exit 0.
4. Push, `workflow_dispatch` run on GitHub → job logs show `UP-TO-DATE`,
   no PR opened.
5. `git show --name-only` per commit — only the three new fork-owned paths.
