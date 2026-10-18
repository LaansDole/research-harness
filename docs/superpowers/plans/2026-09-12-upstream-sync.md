# Upstream Sync (fork ↔ can1357/oh-my-pi) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-subagent-driven-development (recommended) or superpowers-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear the fork's "conflicts with the base fork" state by merging upstream `can1357/oh-my-pi` main into `LaansDole/research-harness` main, resolving the single conflicting file (`README.md`) in favour of the fork, and updating the README for the new upstream state.

**Architecture:** A merge commit (never a rebase — the fork's 42 research commits must not be rewritten). The research layer is purely additive, so upstream's 778 commits auto-merge; only `README.md` conflicts because both sides own it. The fork keeps its own README; upstream's is preserved verbatim in `docs/UPSTREAM.md`, which gets refreshed to the new upstream tip.

**Tech Stack:** git (merge), bash, Python 3 stdlib (research tests), Bun/TypeScript (fork sanity build).

**Verified context (parent session, this run — do not re-derive):**

| Fact | Value |
| --- | --- |
| Repo | `/Users/laansdole/Projects/research-harness` (fork of `can1357/oh-my-pi`) |
| `upstream` remote | added + fetched this session |
| `upstream/main` tip | `f97fa5c95010b62ac34c7357f9a1cae6975e12d6` (2026-09-12) |
| merge-base | `5964a0f7649275bcde818f20073193fd032451f2` |
| fork main | `f8ce687974f4648cdb897508a13a9ed1e1cdeddb` — **42 ahead / 778 behind** |
| Conflict set (probed in a throwaway worktree) | **exactly one: `README.md`** |
| Upstream commits touching `research/` or `assets/research/` | **0 of 778** |
| Upstream README delta since merge-base | 2 lines: `Command Code` added to the provider list; `@oh-my-pi/hashline` package row → `crates/pi-edit` crate row |
| Pre-merge baselines | `bash research/tests/run.sh` → `Ran 91 tests ... OK (skipped=1)`; `bun run dev --version` → `omp/18.1.10` |
| Extension points still present upstream | `--append-system-prompt` (`cli/flag-tables.ts:169`), `omp plugin install/list/doctor` (`cli/plugin-cli.ts:62-70`), prompt discovery `cwd/.omp/prompts/ + agentDir/prompts/` (`sdk.ts:532`), `~/.omp/agent/agents/*.md` (`task/discovery.ts:5`), plugin manifest from package.json `omp`/`pi` field (`extensibility/plugins/types.ts:2,27`) |

**Files:**
- Modify (conflict resolution): `README.md` — keep the fork's version
- Modify: `docs/UPSTREAM.md` — refresh body to `upstream/main:README.md`
- Modify: `README.md` — align upstream-facing claims, document the sync procedure
- Untracked (never committed): `docs/superpowers/plans/2026-09-12-upstream-sync.md`

**Out of scope:** pushing (the parent session pushes after independent verification), any change under `research/`, `assets/research/`, `packages/`, `crates/`, or the lockfiles.

---

### Task 1: Merge upstream/main, resolve the single conflict

**Files:**
- Modify: `README.md` (resolution only — final content unchanged from `main`)

- [ ] **Step 1: Confirm the starting state**

```bash
cd /Users/laansdole/Projects/research-harness
git status --short          # clean, except the untracked plan file
git rev-parse HEAD          # f8ce687974f4648cdb897508a13a9ed1e1cdeddb
```

- [ ] **Step 2: Create the sync branch**

```bash
git checkout -b sync/upstream-2026-09-12 main
```

- [ ] **Step 3: Merge upstream**

```bash
git merge upstream/main --no-ff
```

Expected: `CONFLICT (content): Merge conflict in README.md` and `Automatic merge failed`.
Expected conflict count: `git status --short | grep -c '^UU'` → `1`.
If ANY other path conflicts, run `git merge --abort` and STOP — report the paths instead of resolving them.

- [ ] **Step 4: Resolve by keeping the fork's README**

```bash
git checkout --ours README.md
git add README.md
git status --short                       # no UU left
git diff --cached --name-only | grep -E '^research/|^assets/research/'   # must print nothing
```

- [ ] **Step 5: Commit the merge**

```bash
git commit -m "Merge upstream can1357/oh-my-pi main (778 commits) into main" -m "Fork was 778 behind / 42 ahead of 5964a0f7. Upstream tip f97fa5c9 (2026-09-12). The only conflicting file is README.md, which both sides own; it is resolved in favour of this fork's README. Upstream's README is preserved verbatim at docs/UPSTREAM.md. No upstream commit touches research/ or assets/research/."
```

- [ ] **Step 6: Verify the merge is complete**

```bash
git rev-list --count HEAD..upstream/main   # 0
```

### Task 2: Refresh the vendored upstream README

**Files:**
- Modify: `docs/UPSTREAM.md`

- [ ] **Step 1: Confirm the current header is 4 lines**

```bash
head -4 docs/UPSTREAM.md
```

- [ ] **Step 2: Rebuild the file — 4-line header + verbatim upstream README**

Header lines 1-4 become:

```
# Upstream oh-my-pi README

> Preserved verbatim from [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi) at f97fa5c95010b62ac34c7357f9a1cae6975e12d6 (2026-09-12). The fork's own README lives at the repo root.

```

```bash
git show upstream/main:README.md > /tmp/upstream-readme-body.md
```

- [ ] **Step 3: Gate — the body must be byte-identical to upstream**

```bash
diff <(tail -n +5 docs/UPSTREAM.md) /tmp/upstream-readme-body.md && echo BODY-IDENTICAL
```

- [ ] **Step 4: Commit**

```bash
git add docs/UPSTREAM.md
git commit -m "docs: refresh vendored upstream README to f97fa5c9"
```

### Task 3: Update README.md for the merged state

**Files:**
- Modify: `README.md` (surgical edits; structure and section order unchanged)

- [ ] **Step 1: Gather every number from a real command** (paste each command + output in the report)

```bash
ls research/prompts/*.md | wc -l     # prompt commands
ls research/agents/*.md | wc -l      # agents
ls -d research/skills/*/ | wc -l     # skills
ls research/skills/literature-search/scripts/*.py research/skills/paper-graph/scripts/*.py
bash research/tests/run.sh 2>&1 | tail -3
git show upstream/main:README.md | sed -n '27p'
```

- [ ] **Step 2: Align the upstream capability numbers** in `## Everything oh-my-pi has` with upstream's current claims (its README line 27): `**60+** providers · **31** built-in tools · **14** LSP ops · **28** DAP ops · **~80k** lines of Rust core`.

- [ ] **Step 3: Replace the unverified "purely additive … merge clean" sentence** with what the merge actually proved: the research layer only ADDS paths (`research/`, `research/tests/`, `assets/research/`, `setup.sh`, `bin/research`, `docs/ARCHITECTURE.md`, `docs/UPSTREAM.md`) and wires into stock omp through its plugin/prompt/agent extension points; upstream's 778-commit merge touched none of them; the only file both sides own is `README.md`.

- [ ] **Step 4: Add a short "Staying in sync with upstream" note** (3-6 lines, same section) with the verified procedure and the synced-to provenance (`f97fa5c9`, 2026-09-12):

```sh
git remote add upstream https://github.com/can1357/oh-my-pi.git   # one-time
git fetch upstream main
git merge upstream/main
git checkout --ours README.md && git add README.md                # the fork keeps its README
git show upstream/main:README.md > body.md                        # then refresh docs/UPSTREAM.md
```

- [ ] **Step 5: Audit every other factual claim** against the merged tree — prompt/agent/skill/test counts, the Mermaid script lists, and every `assets/research/...` path. Fix only what is now false; leave correct claims alone. ASCII hyphens only.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs(readme): sync fork README with upstream f97fa5c9 (778-commit merge)"
```

### Task 4: Gates

- [ ] **Step 1: Research suite** — `bash research/tests/run.sh 2>&1 | tail -5` → `Ran 91 tests` + `OK (skipped=1)`
- [ ] **Step 2: Merge completeness** — `git rev-list --count HEAD..upstream/main` → `0`
- [ ] **Step 3: No absolute paths in agent/prompt files** — `grep -rc "/Users/" research/agents/*.md research/prompts/*.md | grep -v ':0' || echo "no absolute paths"`
- [ ] **Step 4: Shadow-library policy** — `grep -ric "sci-hub\|scihub\|libgen" research/ README.md | grep -v ':0' || echo clean`
- [ ] **Step 5: README asset audit** — every `assets/research/...` reference exists on disk
- [ ] **Step 6: Fork unbroken** — `bun run dev --version` prints `omp/18.x`
- [ ] **Step 7: Tree state** — `git status --short` clean except the untracked plan file; `git log --oneline -4`
