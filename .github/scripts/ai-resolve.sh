#!/usr/bin/env bash
# ai-resolve.sh — let a Command Code model (headless omp) resolve the content conflicts
# sync-upstream.sh committed with markers, then keep only what passes the guard.
# Spec: docs/superpowers/specs/2026-09-27-fork-sync-conflict-capture-design.md §3
#
# Commits locally, never pushes: the agent runs in a step without write credentials.
# Env: COMMAND_CODE_API_KEY (required; unset -> AI-SKIPPED)
#      SYNC_AI_MODEL   (default commandcode/z-ai/glm-5.3-flash)
#      BASE_REF        (default origin/main)
#      SYNC_REPORT_DIR (default <git-dir>/sync-report)
# Output (last line): AI-SKIPPED <why> | AI-FAILED <why> | AI-RESOLVED <R>/<C>
# Exit: 0 unless git itself breaks — the marker commit is always the fallback.
set -euo pipefail
export GIT_LITERAL_PATHSPECS=1

HERE=$(cd "$(dirname "$0")" && pwd)
MODEL="${SYNC_AI_MODEL:-commandcode/z-ai/glm-5.3-flash}"
BASE_REF="${BASE_REF:-origin/main}"
export SYNC_REPORT_DIR="${SYNC_REPORT_DIR:-$(git rev-parse --absolute-git-dir)/sync-report}"
mkdir -p "$SYNC_REPORT_DIR"

M=$(git log --merges -1 --format=%H "$BASE_REF..HEAD")
[ -n "$M" ] || { echo "AI-SKIPPED no sync merge commit"; exit 0; }
TARGETS=()
while IFS= read -r p; do TARGETS+=("$p"); done < <(
  git log -1 --format='%(trailers:key=Sync-Conflict,valueonly)' "$M" | sed -nE 's/^(UU|AA) //p'
)
C=${#TARGETS[@]}
[ "$C" -gt 0 ] || { echo "AI-SKIPPED no content conflicts"; exit 0; }
[ -n "${COMMAND_CODE_API_KEY:-}" ] || { echo "AI-SKIPPED COMMAND_CODE_API_KEY unset"; exit 0; }
command -v omp >/dev/null || { echo "AI-SKIPPED omp not installed"; exit 0; }
git diff --quiet HEAD || { echo "AI-SKIPPED worktree not clean"; exit 0; }

START=$(git rev-parse HEAD)
UNTRACKED_BEFORE=$(git ls-files --others --exclude-standard)

drop_new_untracked() {
  comm -13 <(printf '%s\n' "$UNTRACKED_BEFORE" | sort) \
    <(git ls-files --others --exclude-standard | sort) \
    | while IFS= read -r p; do
        [ -n "$p" ] || continue
        rm -f -- "$p"
        echo "UNTRACKED $p removed"
      done
}
redact() { # keep the key out of anything that may be uploaded as an artifact
  [ -f "$1" ] && KEY="$COMMAND_CODE_API_KEY" perl -pi -e 's/\Q$ENV{KEY}\E/[REDACTED]/g' "$1"
  return 0
}
is_target() {
  local t
  for t in "${TARGETS[@]}"; do [ "$t" = "$1" ] && return 0; done
  return 1
}

set +e
omp -p --no-session --auto-approve --model "$MODEL" "@$HERE/../prompts/resolve-conflicts.md" \
  > "$SYNC_REPORT_DIR/ai-transcript.txt" 2>&1
rc=$?
set -e
redact "$SYNC_REPORT_DIR/ai-transcript.txt"
redact "$SYNC_REPORT_DIR/ai-notes.md"

# Undo anything the agent committed or staged; the guard judges the worktree only.
git reset -q --soft "$START"
git reset -q

if [ "$rc" -ne 0 ]; then
  git reset -q --hard "$START"
  drop_new_untracked
  echo "AI-FAILED omp exited $rc"
  exit 0
fi

# --- guard: trust nothing the agent claims -----------------------------------
CHANGED=()
while IFS= read -r -d '' p; do CHANGED+=("$p"); done < <(git diff --name-only -z HEAD)
for p in ${CHANGED[@]+"${CHANGED[@]}"}; do
  is_target "$p" && continue
  git checkout -q HEAD -- "$p"
  echo "OUT-OF-SCOPE $p reverted"
done
drop_new_untracked

RESOLVED=()
for p in "${TARGETS[@]}"; do
  git diff --quiet HEAD -- "$p" && continue # untouched: markers stay
  if [ -f "$p" ] && bash "$HERE/check-sync-markers.sh" "$p" >/dev/null; then
    RESOLVED+=("$p")
  else
    git checkout -q HEAD -- "$p"
    echo "PARTIAL $p reverted"
  fi
done
R=${#RESOLVED[@]}
[ "$R" -gt 0 ] || { echo "AI-RESOLVED 0/$C"; exit 0; }

if grep -qF -- "$COMMAND_CODE_API_KEY" < <(git diff HEAD -- "${RESOLVED[@]}"); then
  git checkout -q HEAD -- "${RESOLVED[@]}"
  echo "AI-FAILED API key found in resolution — reverted"
  exit 0
fi

git add -- "${RESOLVED[@]}"
TRAILERS=()
for p in "${RESOLVED[@]}"; do TRAILERS+=(--trailer "Sync-AI-Resolved: $p"); done
git commit -q -m "fix(sync): AI-resolve $R/$C conflicts via $MODEL" "${TRAILERS[@]}"

# Research gate is reported, not enforced: only meaningful once no conflict remains.
TREE=$(git log -1 --format='%(trailers:key=Sync-Conflict,valueonly)' "$M" | grep -cvE '^(UU|AA) |^$' || true)
if [ "$R" -eq "$C" ] && [ "$TREE" -eq 0 ]; then
  if bash research/tests/run.sh > "$SYNC_REPORT_DIR/ai-gate.log" 2>&1; then
    echo pass > "$SYNC_REPORT_DIR/ai-gate.txt"
  else
    echo fail > "$SYNC_REPORT_DIR/ai-gate.txt"
  fi
fi
echo "AI-RESOLVED $R/$C"
