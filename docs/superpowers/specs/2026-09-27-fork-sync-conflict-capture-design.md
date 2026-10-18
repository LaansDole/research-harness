# Fork-Sync Conflict Capture + AI Resolver — Design Spec

Date: 2026-09-27
Repo: LaansDole/research-harness (fork of can1357/oh-my-pi)
Supersedes: conflict policy (step 5), push (step 11), and PR step of
`2026-09-19-fork-sync-workflow-design.md`. Everything else there stands.

## Problem

1. `sync-upstream.sh` exits `1` on any non-README conflict. No PR opens; the
   conflict list lives only in the Actions log (run 35554055040, 2026-09-21:
   `packages/ai/test/issue-3528-repro.test.ts`). The fork falls further behind
   (979 commits on 2026-09-27) until someone repeats the merge by hand.
2. Upstream now modifies `.github/workflows/ci.yml` and
   `bazel-cache-warm.yml`. `github.token` cannot push commits touching workflow
   files, and `sync-upstream.sh:90` swallows the push error
   (`2>/dev/null || --force`) → silent failure. The existing
   `FORK_SYNC_TOKEN` secret is unused.
3. PRs opened with `github.token` never trigger `ci.yml` (`pull_request`), so
   the sync PR is untested.

## Goal

Every sync with upstream commits yields a PR on the fork that captures all
upstream changes and every conflict, verbatim. Optionally, a Command Code model
driven by headless omp attempts the resolution as a separate, reviewable
commit. A human always reviews and merges.

## Decisions (user-approved)

| Axis | Choice |
| --- | --- |
| Conflict capture | Merge commit contains the raw markers; PR opens as draft; marker guard check blocks until resolved. Accepted cost: that one merge commit on `main` carries markers (`git bisect skip` it). |
| AI trigger | Automatic on conflict, same job. Skipped silently without the secret; `workflow_dispatch` input `ai=false` disables per run. |
| AI engine | Headless omp: `omp -p --no-session --model <id>` from the released `@oh-my-pi/pi-coding-agent` package. |
| Default model | `commandcode/z-ai/glm-5.3-flash` (verified 2026-09-27: headless `-p` call returned in 9.7 s). Override via repo variable `SYNC_AI_MODEL`. |

## Components

### 1. `.github/scripts/sync-upstream.sh` (modified)

Unchanged: remote prep, fetch, sync-note presence check, `UP-TO-DATE` no-op,
branch built on fetched `BASE_REF`, `docs/UPSTREAM.md` refresh + gate,
sync-note sha/date update, `SYNC_DRY_RUN`.

Changed:

1. **Report dir.** `REPORT_DIR="${SYNC_REPORT_DIR:-$(git rev-parse --absolute-git-dir)/sync-report}"`,
   wiped at start. Inside `.git` by default so it can never be committed.
2. **Conflict capture.** On a failed merge:
   - `README.md` → `git checkout --ours` + `git add` (unchanged policy),
     recorded as trailer `Sync-Ours: <code> README.md` so the PR table can
     show it; it is not counted in K.
   - Every other unmerged path (from `git status --porcelain=v1`): if the path
     exists in the worktree → `git add` (markers kept); else → `git rm --cached`.
     Two classes:
     - **content conflicts** (`UU`, `AA`): the file carries markers;
     - **tree conflicts** (`DU`, `UD`, `AU`, `UA`, `DD`): no markers; the
       worktree holds whichever side survived.
   - Before staging, save `git diff` (combined diff with markers) to
     `$REPORT_DIR/conflicts.diff`, and one `<code> <path>` line per non-README
     conflict to `$REPORT_DIR/conflicts.txt`.
   - Commit the merge with message
     `Merge upstream can1357/oh-my-pi main (N commits, K unresolved conflicts) into main`
     and one git trailer per non-README conflict:
     `Sync-Conflict: <code> <path>`. The type is the first token, so git
     itself is the source of truth for every later step (AI, guard, PR body);
     nothing downstream needs the report dir to classify conflicts.
   - K = all non-README conflicts; C = the content-conflict subset.
   - K = 0 → message and trailers as before (no `Sync-Conflict` trailers).
3. **Change capture** (always, when behind > 0), with
   `MB=$(git merge-base "$BASE_REF" upstream/main)`:
   - `shortlog.txt` = `git shortlog --no-merges "$MB..upstream/main"`
   - `diffstat.txt` = `git diff --stat "$MB" upstream/main`
   - `overlap.txt` = paths changed in both `$MB..$BASE_REF` and
     `$MB..upstream/main` that are **not** in `conflicts.txt` and not
     `README.md` (auto-merged overlaps — silent semantic conflict risk).
4. **Test gate.** `bash research/tests/run.sh` runs only when K = 0.
   Failure still exits `1` (a clean merge that breaks the research layer is a
   real failure).
5. **Push.** `git fetch origin "$SYNC_BRANCH"` (absence tolerated) so the
   lease has a fresh tracking ref, then
   `git push --force-with-lease origin "$SYNC_BRANCH"` with stderr visible;
   failure exits `1`. The branch is pushed before any AI step so the raw
   capture survives an AI crash.
6. **Output.** Last line `SYNCED branch=<b> conflicts=<K>`; dry-run prints
   `DRY-RUN-OK branch=<b> conflicts=<K> ahead_of_base=<n>`.

Exit codes: `0` synced (with or without conflicts) / dry-run ok /
`UP-TO-DATE`; `1` gate or push failure; `2` usage.

### 2. `.github/scripts/check-sync-markers.sh` (new)

It reads the `Sync-Conflict` trailers of every commit in
`${BASE_REF:-origin/main}..HEAD`
(`git log --format='%(trailers:key=Sync-Conflict,valueonly)'`) and keeps only
the `UU`/`AA` entries. For each of those paths that exists at `HEAD`, it looks
for lines matching `^<<<<<<< ` or `^>>>>>>> `. It prints `path:line` for each
hit and exits `1` if there are any, else `0`. It only scans content-conflict
paths because upstream ships legitimate conflict-marker fixtures (omp's
`:conflicts` read selector); a whole-tree scan would give false positives.
Tree conflicts have no markers; the PR table flags them instead.

### 3. `.github/scripts/ai-resolve.sh` + `.github/prompts/resolve-conflicts.md` (new)

Preconditions (checked by the script; any unmet → print `AI-SKIPPED <reason>`,
exit `0`): the sync merge commit (`git log --merges -1 BASE_REF..HEAD`) has ≥1
`UU`/`AA` `Sync-Conflict` trailer (C ≥ 1); `COMMAND_CODE_API_KEY` non-empty;
`omp` on PATH; worktree clean vs HEAD. Tree conflicts are never given to the AI.

The script **never pushes**. The workflow runs it in a step that has no write
credentials, and pushes afterwards (§5).

Flow:

1. Record `START=HEAD` and snapshot untracked files
   (`git ls-files --others --exclude-standard`).
2. Run `omp -p --no-session --auto-approve --model "${SYNC_AI_MODEL:-commandcode/z-ai/glm-5.3-flash}" @.github/prompts/resolve-conflicts.md`,
   with `SYNC_REPORT_DIR` exported for the notes file. Output goes to
   `$REPORT_DIR/ai-transcript.txt`. Then redact the key from the transcript
   and `ai-notes.md` (both can end up in the artifact). Then
   `git reset --soft START && git reset` (this folds away anything the agent
   committed or staged). A non-zero exit → `git reset --hard START`, remove
   new untracked files, print `AI-FAILED`, exit `0`.
3. The prompt is static; no templating. It tells the agent to:
   - find the merge commit `M=$(git log --merges -1 --format=%H origin/main..HEAD)`
     (HEAD is the docs commit, not the merge) and read the conflict list from
     `git log -1 --format='%(trailers:key=Sync-Conflict,valueonly)' "$M"`;
     act only on `UU`/`AA` entries; tree-conflict entries are for the human;
   - get the fork side from `$M^1:<path>`, the upstream side from
     `$M^2:<path>`, and the base from `$(git merge-base "$M^1" "$M^2"):<path>`;
   - remove the markers so both intents are kept, with fork-side customizations
     always surviving;
   - edit only the listed files, never commit, and never run git write
     commands;
   - when unsure, leave that file's markers in place and write one line per
     unresolved file to `$SYNC_REPORT_DIR/ai-notes.md`.
4. **Guard** (trusts nothing the agent says):
   - Any changed tracked path not in the content-conflict list →
     `git checkout HEAD -- <path>`, logged `OUT-OF-SCOPE <path> reverted`.
   - New untracked files (vs the snapshot) → removed.
   - For each conflict path the agent changed: if it still has a marker line
     (same regex as `check-sync-markers.sh`, via a shared function or by
     invoking it per path) → revert to HEAD, logged `PARTIAL <path> reverted`.
     Invariant: each conflict file is either fully resolved or byte-identical
     to the marker commit.
5. R = number of resolved files. R = 0 → print `AI-RESOLVED 0/C`, exit `0`
   with nothing committed. If the diff of the resolved files contains the
   API key → revert them, print `AI-FAILED`, exit `0` (this is a public repo).
   Otherwise commit `fix(sync): AI-resolve R/C conflicts via <model>` with one
   `Sync-AI-Resolved: <path>` trailer per resolved file. If R = C and there
   are no tree conflicts, run `bash research/tests/run.sh` and record
   pass/fail in `$REPORT_DIR/ai-gate.txt` (it is reported, not enforced).
   Print `AI-RESOLVED R/C`.

### 4. `.github/scripts/sync-pr-body.sh` (new)

This script writes `$REPORT_DIR/pr-body.md` from git plus the report dir:

- Header: upstream SHA range, N commits, K conflicts (C content: R
  AI-resolved, U unresolved; T tree), model if AI ran.
- Conflict table: `path | type | resolution` where resolution is
  `ours (README policy)`, `AI (<short sha>)`, `**UNRESOLVED**` (content
  conflict still carrying markers), or `**TREE: kept <present|deleted> — review**`
  (tree conflict). Every `Sync-Conflict` trailer gets a row; the README row
  appears when it conflicted.
- Compare link from the marker commit to the AI commit, when there is an AI
  commit: `https://github.com/$GITHUB_REPOSITORY/compare/<merge>..<ai>`.
- AI gate result and `ai-notes.md` contents, if present.
- Overlap list (auto-merged files both sides touched).
- `<details>` blocks: shortlog, diffstat, raw `conflicts.diff`.
- Review checklist, including "Never click Discard N commits".
- Size cap: if the body exceeds 60 000 chars, the `<details>` blocks are
  truncated with a pointer to the run artifact. The table and overlap list
  are never truncated.

### 5. `.github/workflows/fork-sync.yml` (modified)

- `workflow_dispatch.inputs.ai`: boolean, default `true`.
- `permissions: contents: read`. `github.token` never writes. Every write goes
  through `secrets.FORK_SYNC_TOKEN`, which needs contents + workflows +
  pull-requests write. `GH_TOKEN` is set to that secret, so the PR triggers
  `ci.yml`.
- `actions/checkout` with `fetch-depth: 0` and `persist-credentials: false`,
  so no token is ever written to `.git/config`, where the agent could read it.
  Push auth is **step-scoped**: only the merge step and the PR step get
  `GIT_CONFIG_COUNT=1`,
  `GIT_CONFIG_KEY_0=url.https://x-access-token:<token>@github.com/.insteadOf`
  and `GIT_CONFIG_VALUE_0=https://github.com/`. The AI step gets only
  `COMMAND_CODE_API_KEY`.
- **Pre-flight:** if an open PR with head `sync/upstream` exists and
  `origin/sync/upstream`'s tip author email is not the bot email → log
  `Sync PR has human commits — skipping` and end the job successfully.
  Otherwise continue; the branch gets rebuilt and the PR updated.
- Run `sync-upstream.sh` → parse `conflicts=<K>` / `UP-TO-DATE`.
- If K > 0 and AI is enabled and the secret is present: `oven-sh/setup-bun`,
  `bun install -g @oh-my-pi/pi-coding-agent`, then `ai-resolve.sh` with
  `COMMAND_CODE_API_KEY: ${{ secrets.COMMAND_CODE_API_KEY }}`,
  `SYNC_AI_MODEL: ${{ vars.SYNC_AI_MODEL }}`, step `timeout-minutes: 20`,
  `continue-on-error: true`. "AI enabled" =
  `github.event_name == 'schedule' || inputs.ai`. Don't write
  `inputs.ai != false`: on schedule runs `inputs.ai` is null, and Actions
  coerces null and false both to 0, so that expression would silently
  disable AI on every scheduled run.
- PR step: `git reset --hard HEAD`, so leftovers from a killed AI step never
  describe unpushed work. Then `git push origin HEAD:sync/upstream` (it
  fast-forwards to the AI commit, if there is one), then `sync-pr-body.sh`,
  then create or update the PR:
  - new → `gh pr create` (add `--draft` if K > 0);
  - existing → REST `PATCH pulls/<n>` (title + body), then `gh pr ready --undo`
    if K > 0, else `gh pr ready`. Never `gh pr edit`: its GraphQL read of team
    reviewers needs `read:org`, which a `repo` + `workflow` PAT lacks;
  - labels `sync-conflicts` (K > 0) and `ai-resolved` (R > 0) are added or
    removed to match via the REST issue-labels endpoints; each is created
    first with `gh label create --force`.
- `actions/upload-artifact` of `.git/sync-report/` with
  `include-hidden-files: true` (v4 skips dot-paths otherwise),
  `if-no-files-found: ignore`, `retention-days: 30`, and
  `if: always() && steps.merge.outcome != 'skipped'`, so a failed gate still
  uploads its report.
- `GH_REPO: ${{ github.repository }}` stays (gh otherwise targets the parent).

### 6. `.github/workflows/sync-guard.yml` (new)

`pull_request` to `main`, job `if: github.head_ref == 'sync/upstream'`:
checkout with `fetch-depth: 0` and `ref: ${{ github.event.pull_request.head.sha }}`,
`git fetch origin main`, then `bash .github/scripts/check-sync-markers.sh`.
Making it a required status check through branch protection is optional and
left to the user.

## Tests (`.github/tests/`, stdlib unittest, offline fixtures)

Contract changes:

- `test_unexpected_conflict_fails_loudly` → **replaced** by
  `test_unexpected_conflict_committed_with_markers`: exit 0; merge commit has
  2 parents; the file at HEAD contains `<<<<<<< `; trailer
  `Sync-Conflict: UU docs/SHARED.md`; `conflicts.txt` lists it with `UU`;
  research gate marker absent; output ends `conflicts=1`.

New:

- `test_delete_modify_conflict_captured`: upstream deletes a file the fork
  modified → exit 0, trailer `Sync-Conflict: UD <path>`, merge committed,
  fork's version kept in the tree.
- `test_overlap_lists_auto_merged_shared_files`: both sides edit different
  hunks of the same non-README file → no conflict; path appears in
  `overlap.txt`.
- `test_readme_only_conflict_is_not_counted`: a README conflict alone →
  `conflicts=0`, gate runs, `Sync-Ours` trailer present, no `Sync-Conflict`.
- ai-resolve with a stub `omp` executable prepended to `PATH`, one test per
  guard branch:
  - clean resolve → commit with `Sync-AI-Resolved` trailer, no markers;
  - edit to an out-of-scope file → that file reverted, in-scope resolution
    kept;
  - leftover markers → file byte-identical to the marker commit, no commit,
    `AI-RESOLVED 0/1`;
  - stub exits 1 → worktree clean, no commit, `AI-FAILED`;
  - no `COMMAND_CODE_API_KEY` → `AI-SKIPPED`, stub never invoked.
  - resolution containing the API key → `AI-FAILED`, nothing committed,
    key absent from the file;
  - agent commits despite instructions → folded into exactly one guarded
    commit carrying the trailer.
- `check-sync-markers.sh`: markers in a trailer-listed path → exit 1 with
  `path:line`; markers in an unlisted fixture path → exit 0.
- `sync-pr-body.sh`: with three conflicts (one AI-resolved, one content
  unresolved, one tree), every conflicted path appears in the table with its
  correct resolution cell.
- `sync-pr-body.sh` size cap: a ~600 KB conflict diff → body under 65 536
  chars, conflict table row intact.
- Fixture fix: commit the stub gate's exec bit (a dirty mode change made the
  worktree look unclean to `ai-resolve.sh`).

Workflow YAML: run `actionlint` (config `.github/actionlint.yaml`) if
installed.

## Verification (post-implementation)

1. `bash .github/tests/run_tests.sh`: all pass.
2. `bash research/tests/run.sh`: still green.
3. Real-remote dry run: `SYNC_DRY_RUN=1 bash .github/scripts/sync-upstream.sh`
   → today it is behind with a README-only conflict, so the expected output
   is `DRY-RUN-OK … conflicts=0`.
4. Local AI smoke: on a fixture repo with a real conflict, run
   `ai-resolve.sh` with the real `omp` and `commandcode/z-ai/glm-5.3-flash`.
   Expect the guard verdict and a commit (or a clean revert).
5. After landing on `main`: `workflow_dispatch` → PR opens (ready, since only
   README conflicts today); `ci.yml` runs on it (token check).

## Prerequisites (user)

- Add repo secret `COMMAND_CODE_API_KEY`.
- Confirm `FORK_SYNC_TOKEN` has contents + workflows + pull-requests write
  (a classic PAT needs `repo` + `workflow`).
- Optional: repo variable `SYNC_AI_MODEL`; branch protection requiring the
  `sync-guard` check.

## Out of scope

Auto-merge; comment-triggered `/resolve`; pinning the omp version; any change
under `packages/`, `crates/`, root `package.json`, or lockfiles; resolving
README conflicts by AI (the fork owns its README).
