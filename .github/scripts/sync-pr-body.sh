#!/usr/bin/env bash
# sync-pr-body.sh — write the sync PR body from git (trailers are the source of truth)
# plus the report files sync-upstream.sh / ai-resolve.sh left behind.
# Spec: docs/superpowers/specs/2026-09-27-fork-sync-conflict-capture-design.md §4
#
# Env: BASE_REF (default origin/main), SYNC_REPORT_DIR (default <git-dir>/sync-report),
#      GITHUB_SERVER_URL / GITHUB_REPOSITORY / GITHUB_RUN_ID (links; optional)
# Writes: $SYNC_REPORT_DIR/pr-body.md
# Stdout: "conflicts=<K> ai=<R>" (K = non-README conflicts, R = AI-resolved files)
set -euo pipefail
export GIT_LITERAL_PATHSPECS=1

HERE=$(cd "$(dirname "$0")" && pwd)
BASE_REF="${BASE_REF:-origin/main}"
REPORT_DIR="${SYNC_REPORT_DIR:-$(git rev-parse --absolute-git-dir)/sync-report}"
BODY="$REPORT_DIR/pr-body.md"
LIMIT=60000 # GitHub caps PR bodies at 65536 chars
mkdir -p "$REPORT_DIR"

M=$(git rev-list --merges --first-parent "$BASE_REF..HEAD" | tail -n 1)
[ -n "$M" ] || { echo "ERROR: no sync merge commit in $BASE_REF..HEAD" >&2; exit 1; }
MB=$(git merge-base "$M^1" "$M^2")
N=$(git rev-list --count "$M^1..$M^2")
AI_SHA=$(git log -1 --format=%h --grep='^Sync-AI-Resolved: ' "$BASE_REF..HEAD")
AI_MODEL=$(git log -1 --format=%s --grep='^Sync-AI-Resolved: ' "$BASE_REF..HEAD" | sed -n 's/.* via //p')
AI_PATHS=$(git log --format='%(trailers:key=Sync-AI-Resolved,valueonly)' "$BASE_REF..HEAD" | sed '/^$/d')
SERVER="${GITHUB_SERVER_URL:-https://github.com}"

ROWS="" K=0 R=0 U=0 T=0
while IFS= read -r line; do
  [ -n "$line" ] || continue
  code=${line%% *} p=${line#* }
  K=$((K + 1))
  case "$code" in
    UU | AA)
      if printf '%s\n' "$AI_PATHS" | grep -qxF -- "$p"; then
        cell="AI ($AI_SHA)"; R=$((R + 1))
      elif ! bash "$HERE/check-sync-markers.sh" "$p" >/dev/null; then
        cell="**UNRESOLVED**"; U=$((U + 1))
      else
        cell="resolved"
      fi ;;
    *)
      if [ -e "$p" ]; then cell="**TREE: kept present — review**"; else cell="**TREE: kept deleted — review**"; fi
      T=$((T + 1)) ;;
  esac
  ROWS+="| \`$p\` | $code | $cell |"$'\n'
done < <(git log -1 --format='%(trailers:key=Sync-Conflict,valueonly)' "$M")
OURS=$(git log -1 --format='%(trailers:key=Sync-Ours,valueonly)' "$M" | sed '/^$/d')
if [ -n "$OURS" ]; then
  ROWS+="| \`README.md\` | ${OURS%% *} | ours (README policy) |"$'\n'
fi

section() { # <title> <file> <cap-bytes>: collapsed block, truncated to cap
  local title=$1 file=$2 cap=$3
  [ -s "$file" ] || return 0
  printf '<details><summary>%s</summary>\n\n````\n' "$title"
  if [ "$(wc -c < "$file")" -gt "$cap" ]; then
    head -c "$cap" "$file"
    printf '\n… truncated — full file in the run artifact `sync-report`\n'
  else
    cat "$file"
  fi
  printf '\n````\n\n</details>\n\n'
}

head_part() {
  echo "Automated upstream sync: \`$(git rev-parse --short "$MB")..$(git rev-parse --short "$M^2")\` — **$N upstream commits**."
  echo
  if [ "$K" -eq 0 ]; then
    echo "No conflicts outside \`README.md\`. \`research/tests/run.sh\` passed on the merge result."
  else
    echo "**$K conflicts** — content: $((K - T)) ($R AI-resolved, $U unresolved), tree: $T. This PR stays a draft until every **UNRESOLVED**/**TREE** row is handled."
  fi
  if [ -n "$AI_SHA" ]; then
    echo
    if [ -n "${GITHUB_REPOSITORY:-}" ]; then
      echo "AI resolution by \`$AI_MODEL\`: review it at $SERVER/$GITHUB_REPOSITORY/compare/$(git rev-parse --short "$M")..$AI_SHA"
    else
      echo "AI resolution by \`$AI_MODEL\`: review it with \`git diff $(git rev-parse --short "$M") $AI_SHA\`."
    fi
    if [ -f "$REPORT_DIR/ai-gate.txt" ]; then
      echo
      echo "Research tests after AI resolution: **$(cat "$REPORT_DIR/ai-gate.txt")**."
    fi
  fi
  if [ -n "$ROWS" ]; then
    printf '\n| path | type | resolution |\n| --- | --- | --- |\n%s' "$ROWS"
  fi
  if [ -s "$REPORT_DIR/ai-notes.md" ]; then
    printf '\n**AI notes**\n\n'
    cat "$REPORT_DIR/ai-notes.md"
  fi
  if [ -s "$REPORT_DIR/overlap.txt" ]; then
    printf '\n**Auto-merged files both sides changed** (check for silent semantic conflicts):\n\n'
    sed 's/.*/- `&`/' "$REPORT_DIR/overlap.txt"
  fi
  cat <<'EOF'

## Review

- [ ] Every **UNRESOLVED** / **TREE** row handled (push commits to `sync/upstream`)
- [ ] AI resolution reviewed via the compare link
- [ ] Auto-merged overlap files skimmed
- [ ] `sync-guard` check green

Merge with **Create a merge commit** so upstream history stays intact. Never click GitHub's "Discard N commits": that deletes the research layer.

EOF
  if [ -n "${GITHUB_RUN_ID:-}" ] && [ -n "${GITHUB_REPOSITORY:-}" ]; then
    echo "Full report: $SERVER/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID (artifact \`sync-report\`)."
    echo
  fi
}

HEAD_MD=$(head_part)
BUDGET=$(( (LIMIT - ${#HEAD_MD} - 600) / 3 ))
[ "$BUDGET" -gt 0 ] || BUDGET=0
{
  printf '%s\n\n' "$HEAD_MD"
  section "Upstream commits (shortlog)" "$REPORT_DIR/shortlog.txt" "$BUDGET"
  section "Upstream diffstat" "$REPORT_DIR/diffstat.txt" "$BUDGET"
  section "Raw conflict hunks (as committed)" "$REPORT_DIR/conflicts.diff" "$BUDGET"
} > "$BODY"

echo "conflicts=$K ai=$R"
