# Fork rebase-stack sync — Implementation Plan

> Executed inline (user: "run it fully unattended"). Spec: `docs/superpowers/specs/2026-10-17-fork-rebase-stack-design.md`.

**Goal:** replace the merge-PR fork sync with a daily rebase of a 3-commit fork stack onto `upstream/main`.

**Architecture:** `sync-upstream.sh` rebases locally (AI resolves conflicts in place, no credentials) and writes `result.env`; `sync-push.sh` (credentialed step) force-pushes `main` on a clean green run, else stages `sync/rebase` + PR; `fork-promote.yml` force-pushes a reviewed `sync/rebase` to `main` on label `promote`.

**Tech stack:** bash, git, GitHub Actions, `gh`, python3 unittest fixtures.

## Global constraints
- Agent step never holds a write credential.
- Every `main` push: `--force-with-lease=main:<sha seen at start>`, old `main` pushed to `main-prev` first.
- Conflicts never land on `main` without the `promote` label.
- Worktree only: the user's checkout (`main`) is in active use.

## Deviation from spec (recorded)
- Gate drops the two bun branding tests: they need the compiled `pi-natives` addon, which a fresh runner lacks (upstream CI builds it via bazel). Gate = `research/tests/run.sh` + `.github/tests/run_tests.sh`.
- `welcome.ts` stays as resolved: every remaining hunk uses `welcome.ts` internals (`theme`, `padding`, `gradientLogo`), so nothing moves to `branding.ts`.
- `docs/superpowers/` is untracked in this repo; it is not part of commit 1.

## Tasks
1. **Worktree** `.worktrees/rebase-stack` on `origin/sync/upstream` (`d6fc360fc6`, base `01e0b5c26e`, welcome.ts already resolved).
2. **`sync-upstream.sh`** rewrite (rebase loop, report dir, `result.env`: `STATUS OLD BASE UP K U TESTS`).
3. **`ai-resolve.sh`** rewrite: paths as args, mid-rebase safe (index + target backups), outputs resolved list; prompt rewritten for rebase stages (`:2:` upstream, `:3:` fork commit, `REBASE_HEAD`).
4. **`sync-push.sh`** new: PROMOTE (main-prev + lease push) or STAGE (push `sync/rebase`, write body, open/update PR, labels).
5. **`sync-pr-body.sh`** rewrite: range-diff body + `<!-- fork-sync-old: SHA -->` lease marker.
6. **`check-sync-markers.sh`**: no-arg mode scans stack files (`merge-base HEAD $UPSTREAM_REF..HEAD`).
7. **Workflows**: `fork-sync.yml` daily, calls 2+4; `sync-guard.yml` for `sync/rebase`, fetches upstream; new `fork-promote.yml`.
8. **Tests**: rewrite `test_sync_upstream.py` (clean→PROMOTED, conflict→STAGED, lease rejected, up-to-date) and `test_sync_ai_and_guard.py` (guard branches mid-rebase, marker scan scope, body).
9. **Docs**: `README.md` → `.github/README.md` (relative links fixed, sync paragraph rewritten), root `README.md` = upstream's, delete `docs/UPSTREAM.md`, rewrite `docs/ARCHITECTURE.md` §11 + line 23.
10. **Migration**: build 3-commit stack on `01e0b5c26e` from the worktree tree, diff-check vs `d6fc360fc6`, tag `pre-stack-main` (= `origin/main` `7eab14ac30`), force-push `main`, close PR #5, delete `sync/upstream`, dispatch `fork-sync.yml`, observe.
