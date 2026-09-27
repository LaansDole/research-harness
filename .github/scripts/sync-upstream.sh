#!/usr/bin/env bash
# sync-upstream.sh — merge upstream main into this fork and prep the PR branch.
# Fork-owned (LaansDole/research-harness). Procedure per
# docs/superpowers/specs/2026-09-19-fork-sync-workflow-design.md, conflict capture per
# docs/superpowers/specs/2026-09-27-fork-sync-conflict-capture-design.md.
#
# Env: UPSTREAM_URL    (default https://github.com/can1357/oh-my-pi.git)
#      SYNC_BRANCH     (default sync/upstream)
#      BASE_REF        (default origin/main)
#      SYNC_DRY_RUN    (1 = stop before push)
#      SYNC_REPORT_DIR (default <git-dir>/sync-report; never inside the worktree)
# Exit: 0 synced (conflicts committed with markers) | 0 + "UP-TO-DATE" when behind=0
#       1 failed gate/push | 2 usage
set -euo pipefail
export GIT_LITERAL_PATHSPECS=1 # conflict paths are data, never globs

UPSTREAM_URL="${UPSTREAM_URL:-https://github.com/can1357/oh-my-pi.git}"
SYNC_BRANCH="${SYNC_BRANCH:-sync/upstream}"
BASE_REF="${BASE_REF:-origin/main}"
DRY_RUN="${SYNC_DRY_RUN:-0}"
REPORT_DIR="${SYNC_REPORT_DIR:-$(git rev-parse --absolute-git-dir)/sync-report}"

fail() { echo "ERROR: $*" >&2; exit 1; }

# git-status XY code for an unmerged path, from which index stages exist
# (1=base 2=ours/fork 3=theirs/upstream).
conflict_code() {
  case "$(git ls-files -u -- "$1" | awk '{print $3}' | sort -u | tr -d '\n')" in
    123) echo UU ;; 23) echo AA ;; 12) echo UD ;; 13) echo DU ;;
    2) echo AU ;; 3) echo UA ;; 1) echo DD ;;
    *) fail "cannot classify conflict for $1" ;;
  esac
}

# --- prep (idempotent) -------------------------------------------------------
git remote get-url upstream >/dev/null 2>&1 || git remote add upstream "$UPSTREAM_URL"
git fetch -q origin main
git fetch -q upstream main
rm -rf "$REPORT_DIR"
mkdir -p "$REPORT_DIR"

# --- README sync-note presence (fail BEFORE any branch/merge work) -----------
grep -qF 'Staying in sync with upstream' README.md \
  || fail "sync-note line missing from README.md — aborting before merge"

BEHIND=$(git rev-list --count "${BASE_REF}..upstream/main")
if [ "$BEHIND" -eq 0 ]; then
  echo "UP-TO-DATE"
  exit 0
fi
echo "upstream ahead by $BEHIND commits"

# --- change capture (independent of how the merge goes) ----------------------
MB=$(git merge-base "$BASE_REF" upstream/main)
git shortlog --no-merges "$MB..upstream/main" </dev/null > "$REPORT_DIR/shortlog.txt"
git diff --stat "$MB" upstream/main > "$REPORT_DIR/diffstat.txt"

# --- merge on the FETCHED base ref (never a possibly-stale local main) -------
git checkout -q -B "$SYNC_BRANCH" "$BASE_REF"

K=0
: > "$REPORT_DIR/conflicts.txt"
if ! git merge upstream/main --no-ff -m "Merge upstream can1357/oh-my-pi main ($BEHIND commits) into main"; then
  UNMERGED=()
  while IFS= read -r -d '' p; do UNMERGED+=("$p"); done < <(git diff --name-only --diff-filter=U -z)
  [ "${#UNMERGED[@]}" -gt 0 ] || fail "merge failed without conflicts (see git output above)"
  git diff > "$REPORT_DIR/conflicts.diff" || true
  TRAILERS=()
  for p in "${UNMERGED[@]}"; do
    code=$(conflict_code "$p")
    if [ "$p" = "README.md" ]; then
      # The fork owns its README; upstream's lives on in docs/UPSTREAM.md.
      git checkout --ours README.md
      git add README.md
      TRAILERS+=(--trailer "Sync-Ours: $code README.md")
      continue
    fi
    if [ -e "$p" ]; then git add -- "$p"; else git rm -q --cached -- "$p"; fi
    printf '%s %s\n' "$code" "$p" >> "$REPORT_DIR/conflicts.txt"
    TRAILERS+=(--trailer "Sync-Conflict: $code $p")
    K=$((K + 1))
  done
  if [ "$K" -eq 0 ]; then
    SUBJECT="Merge upstream can1357/oh-my-pi main ($BEHIND commits) into main"
  else
    SUBJECT="Merge upstream can1357/oh-my-pi main ($BEHIND commits, $K unresolved conflicts) into main"
  fi
  git commit -q -m "$SUBJECT" "${TRAILERS[@]}"
fi

# auto-merged files both sides touched: silent semantic-conflict candidates
comm -12 \
  <(git -c core.quotePath=false diff --name-only "$MB" "$BASE_REF" | sort) \
  <(git -c core.quotePath=false diff --name-only "$MB" upstream/main | sort) \
  | grep -vxF -f <(cut -d' ' -f2- "$REPORT_DIR/conflicts.txt"; echo README.md) \
  > "$REPORT_DIR/overlap.txt" || true

# --- refresh vendored upstream README (docs/UPSTREAM.md) ---------------------
UP_SHA=$(git rev-parse --short upstream/main)
UP_DATE=$(git log -1 --format=%ad --date=short upstream/main)
{
  printf '%s\n' \
    "<!-- Vendored verbatim from can1357/oh-my-pi README.md @ $UP_SHA ($UP_DATE) for fork reference." \
    "     Refresh each sync: git show upstream/main:README.md > body, keep this 4-line header." \
    "     Provenance: LaansDole/research-harness fork of can1357/oh-my-pi (itself derived from badlogic/pi-mono)." \
    "     Gate: diff <(tail -n +5 docs/UPSTREAM.md) <(git show upstream/main:README.md) -> empty -->"
  git show upstream/main:README.md
} > docs/UPSTREAM.md
if [ -n "$(diff <(tail -n +5 docs/UPSTREAM.md) <(git show upstream/main:README.md))" ]; then
  fail "docs/UPSTREAM.md body does not match upstream README"
fi

# --- update README sync-note sha/date ---------------------------------------
grep -qF 'Staying in sync with upstream' README.md \
  || fail "sync-note line missing from README.md — aborting before commit"
# sha token = whatever sits between the fixed prefix and the comma (short sha, long sha, placeholder)
perl -pi -e 's/\Q**Staying in sync with upstream** (synced to upstream `main` \E[^,]+, \d{4}-\d{2}-\d{2}\Q):\E/**Staying in sync with upstream** (synced to upstream `main` '"$UP_SHA"', '"$UP_DATE"'):/' README.md
grep -qF "(synced to upstream \`main\` $UP_SHA, $UP_DATE):" README.md \
  || fail "sync-note update did not land"

# --- fork test gate (markers in the tree would make it meaningless) ----------
if [ "$K" -eq 0 ]; then
  bash research/tests/run.sh
fi

# --- commit doc updates ------------------------------------------------------
git add docs/UPSTREAM.md README.md
if ! git diff --cached --quiet; then
  git commit -q -m "docs: refresh vendored upstream README to $UP_SHA"
fi

# --- ship --------------------------------------------------------------------
if [ "$DRY_RUN" = "1" ]; then
  echo "DRY-RUN-OK branch=$SYNC_BRANCH conflicts=$K ahead_of_base=$(git rev-list --count "${BASE_REF}..HEAD")"
  exit 0
fi

# fresh tracking ref so the lease compares against what origin really has
git fetch -q origin "$SYNC_BRANCH" 2>/dev/null || true
git push -q --force-with-lease origin "$SYNC_BRANCH" || fail "push of $SYNC_BRANCH failed"
echo "SYNCED branch=$SYNC_BRANCH conflicts=$K"
