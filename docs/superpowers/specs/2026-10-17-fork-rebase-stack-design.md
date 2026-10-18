# Fork sync as a rebased patch stack

Supersedes the merge-based sync in `2026-09-19-fork-sync-workflow-design.md` and
`2026-09-27-fork-sync-conflict-capture-design.md`.

## Problem

Upstream `can1357/oh-my-pi` lands ~350 commits/day (2445 in the week after the
2026-10-10 sync; PR #5 alone carried 1659). A twice-weekly merge PR that a human
reviews cannot keep pace, and every merge commit buries the fork's own delta under
upstream history. Conflicts are not the bottleneck: the fork touches 9 upstream
paths, and only `packages/tui/src/prompt/welcome.ts` has ever conflicted.

The fork stays a fork (decided). The sync model changes.

## Decisions

| # | Decision |
|---|---|
| D1 | `main` = an upstream commit + a short stack of fork commits, rebased daily onto `upstream/main`. Force-pushed. |
| D2 | Rebase conflict → AI resolves on side branch `sync/rebase`, opens a PR showing the stack's range-diff. `main` never moves until promoted. |
| D3 | A `promote` label on that PR force-pushes `sync/rebase` to `main` and closes the PR. |
| D4 | Fork README moves to `.github/README.md`; root `README.md` is upstream's, untouched. GitHub shows `.github/README.md` first (GitHub Docs, "About the repository README file": order is `.github/`, root, `docs/`). |
| D5 | `docs/UPSTREAM.md`, the README sync-note line, and the README "ours" policy are deleted. |
| D6 | Cron runs daily. |
| D7 | No `git rerere`: a resolved conflict becomes the new stack commit, so the next rebase starts from it. A conflict recurs only when upstream touches the same lines again. |

## 1. Stack layout

The stack is `git merge-base main upstream/main..main`. No extra state is stored:
after each rebase the merge-base *is* the upstream commit the stack sits on.

Initial stack, ordered so only the last commit can conflict:

| # | Subject | Paths |
|---|---|---|
| 1 | `research: add research layer` | `research/`, `bin/research`, `setup.sh`, `assets/research/`, `docs/ARCHITECTURE.md`, `docs/RUNBOOK.md`, `docs/superpowers/`, `.github/README.md`, `.gitignore` line |
| 2 | `fork: rebase-stack sync CI` | `.github/workflows/fork-sync.yml`, `.github/workflows/sync-guard.yml`, `.github/workflows/fork-promote.yml`, `.github/scripts/`, `.github/tests/`, `.github/prompts/` |
| 3 | `fork: env-driven welcome branding` | `packages/utils/src/branding.ts`, `packages/utils/src/index.ts`, `packages/utils/test/branding.test.ts`, `packages/tui/src/prompt/welcome.ts`, `packages/tui/test/welcome-branding.test.ts` |

Commits 1–2 add files upstream does not have, so they cannot conflict unless
upstream creates the same path (`.gitignore` is the one shared file; its fork line
is appended at the end).

Commit 3 is shrunk to the smallest `welcome.ts` diff: one import plus the call
sites that read `getBrandLogo()`, `getBrandDisplayName()`, `getBrandTips()`. Width
math and lockup composition move into `branding.ts` wherever they do not need
`welcome.ts` internals. Behavior with the brand env vars unset stays byte-identical
to stock (existing `welcome-branding.test.ts` contract).

Commits pushed directly to `main` by a human join the stack automatically. Folding
them into commits 1–3 is an occasional manual `git rebase -i`, not automated.

## 2. Daily sync job — `fork-sync.yml` + `sync-upstream.sh` (rewritten)

```
fetch origin main, upstream main
BASE = merge-base(origin/main, upstream/main)
OLD  = origin/main
if upstream/main == BASE: print UP-TO-DATE, exit 0
skip if an open sync/rebase PR carries a human commit (existing preflight, new branch name)
checkout -B sync/rebase OLD
git rebase --onto upstream/main BASE
  on stop with conflicts (loop, max = stack length):
    ai-resolve.sh <conflicted paths>        # resolves in place, never commits
    files still holding markers are added as-is and listed in report/unresolved.txt
    git add -A conflicted paths; GIT_EDITOR=true git rebase --continue
run tests (section 5)
if no conflict happened AND tests pass:
    push OLD to main-prev (force)
    push --force-with-lease=main:OLD HEAD:main
    print PROMOTED
else:
    push --force-with-lease sync/rebase
    write PR body (section 3), open/update PR, labels sync-conflicts / ai-resolved
    print STAGED conflicts=<n> unresolved=<m> tests=<pass|fail>
```

- `--force-with-lease=main:OLD` rejects the push if anyone moved `main` during the
  run; the job then exits non-zero and the next run retries from the new `main`.
- `main-prev` is a single overwritten branch: one restore point, no ref pile-up.
- Tests failing on a clean rebase also go to the PR path, so a broken upstream
  never lands silently.
- `ai-resolve.sh` keeps its existing safety properties (no write credential in the
  agent step, guard check per file, drops agent-created untracked files), but now
  takes paths as arguments instead of reading `Sync-Conflict:` trailers off a merge
  commit, and leaves staging to the caller.
- If `COMMAND_CODE_API_KEY` is unset or the AI step fails, every conflicted file
  is committed with markers and listed as unresolved. The run still stages a PR.

## 3. Conflict PR

Title: `Rebase fork stack onto upstream <short sha> (<date>)`.

Body:
- upstream range `BASE..upstream/main`, commit count
- per-file table: path, which stack commit hit it, `AI` / `UNRESOLVED`
- test result
- `git range-diff BASE..OLD upstream/main..sync/rebase` in a fenced block. This is
  the review surface: the stack's 3 commits before and after, not upstream history.
- the compare link for the AI edits
- instructions: fix by pushing to `sync/rebase`, then add the `promote` label. Do
  not use the merge button.

Upstream shortlog/diffstat stay in the uploaded `sync-report` artifact, not the body.

## 4. Guard and promote

`sync-guard.yml` (on PRs from `sync/rebase` to `main`): `check-sync-markers.sh`
scans the files the stack touches (`git diff --name-only $(merge-base HEAD
upstream/main) HEAD`) for `^(<<<<<<<|>>>>>>>)( |$)`. Scoping to stack files keeps
upstream's legitimate marker fixtures out of the scan without trailers.

`fork-promote.yml` (on `pull_request: labeled`, label `promote`, head
`sync/rebase`):
1. require `sync-guard` green on the PR head (fail otherwise, remove the label)
2. push current `main` to `main-prev`
3. `push --force-with-lease=main:<main sha the PR was built on> sync/rebase:main`
4. close the PR with a comment naming the new `main` sha

The lease sha is the `OLD` recorded in the PR body by the sync job, so a `main`
that moved after staging is never overwritten.

Repo setting (manual, one-time): branch protection on `main` must allow force-push
by the `FORK_SYNC_TOKEN` identity.

## 5. Tests

Gate run by the sync job on the rebased tree:
- `bash research/tests/run.sh`
- `bash .github/tests/run_tests.sh`

The bun branding tests (`packages/utils/test/branding.test.ts`,
`packages/tui/test/welcome-branding.test.ts`) are not in the gate: they load the
compiled `pi-natives` addon, which a fresh runner does not have (upstream CI builds it
with bazel). Run them locally after a conflict on the branding commit.

`.github/tests/test_sync_upstream.py` is rewritten against throwaway local repos
(fake upstream + fake fork with a 3-commit stack). One test per contract:
1. clean rebase: `main` now has upstream's tip as merge-base, stack is preserved,
   `main-prev` is the old `main`
2. conflict: `main` unchanged; `sync/rebase` exists with the conflicted file
   marked; output reports `STAGED conflicts=1 unresolved=1`
3. lease: `main` moved mid-run → push rejected, `main` keeps the concurrent commit
4. up-to-date: no refs change, prints `UP-TO-DATE`

`test_sync_ai_and_guard.py` is updated for path arguments to `ai-resolve.sh` and
the stack-scoped marker scan.

## 6. One-time migration

1. Tag current `main` as `pre-stack-main` and push the tag.
2. Build the 3-commit stack on `01e0b5c26e` (the current merge base) from the
   current tree, split by the path table in section 1, with the README move,
   `UPSTREAM.md` deletion, and slimmed `welcome.ts` applied.
3. Check: `git diff pre-stack-main <new>` shows only the intended changes
   (README move, `UPSTREAM.md` gone, sync-note gone, CI rewrite, welcome slimming).
4. Force-push `main`. Close PR #5. Delete branch `sync/upstream`.
5. Run `fork-sync.yml` once via `workflow_dispatch` and observe it rebase onto the
   current upstream tip (~2445 commits ahead).

## 7. Removed

- the merge path in `sync-upstream.sh` (`git merge`, `Sync-Conflict:` / `Sync-Ours:`
  trailers, overlap report)
- README ownership rule, sync-note sha/date line, `docs/UPSTREAM.md` refresh and gate
- conflict-table logic in `sync-pr-body.sh` (replaced by section 3 body)
- branch `sync/upstream`
- Wed+Sat cron (now daily)

Docs updated in the same change: `.github/README.md` "Staying in sync" paragraph,
`docs/ARCHITECTURE.md` §11 and the line-23 `docs/UPSTREAM.md` reference.
