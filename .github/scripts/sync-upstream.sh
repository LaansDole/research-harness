#!/usr/bin/env bash
# sync-upstream.sh — merge upstream main into this fork and prep the PR branch.
# Fork-owned (LaansDole/research-harness). Procedure per
# docs/superpowers/specs/2026-09-19-fork-sync-workflow-design.md.
#
# Env: UPSTREAM_URL (default https://github.com/can1357/oh-my-pi.git)
#      SYNC_BRANCH  (default sync/upstream)
#      BASE_REF     (default origin/main)
#      SYNC_DRY_RUN (1 = stop before push)
# Exit: 0 synced | 0 + "UP-TO-DATE" when behind=0 | 1 conflict/failed gate | 2 usage
set -euo pipefail

UPSTREAM_URL="${UPSTREAM_URL:-https://github.com/can1357/oh-my-pi.git}"
SYNC_BRANCH="${SYNC_BRANCH:-sync/upstream}"
BASE_REF="${BASE_REF:-origin/main}"
DRY_RUN="${SYNC_DRY_RUN:-0}"

fail() { echo "ERROR: $*" >&2; exit 1; }

# --- prep (idempotent) -------------------------------------------------------
git remote get-url upstream >/dev/null 2>&1 || git remote add upstream "$UPSTREAM_URL"
git fetch -q origin main
git fetch -q upstream main

# --- README sync-note presence (fail BEFORE any branch/merge work) -----------
grep -qF 'Staying in sync with upstream' README.md \
  || fail "sync-note line missing from README.md — aborting before merge"

BEHIND=$(git rev-list --count "${BASE_REF}..upstream/main")
if [ "$BEHIND" -eq 0 ]; then
  echo "UP-TO-DATE"
  exit 0
fi
echo "upstream ahead by $BEHIND commits"

# --- merge on the FETCHED base ref (never a possibly-stale local main) -------
git checkout -q -B "$SYNC_BRANCH" "$BASE_REF"

if ! git merge upstream/main --no-ff -m "Merge upstream can1357/oh-my-pi main ($BEHIND commits) into main"; then
  CONFLICTS=$(git diff --name-only --diff-filter=U)
  if [ "$CONFLICTS" = "README.md" ]; then
    git checkout --ours README.md
    git add README.md
    git commit -q --no-edit
  else
    echo "Unexpected conflicts — refusing to auto-resolve:" >&2
    echo "$CONFLICTS" >&2
    exit 1
  fi
fi

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

# --- fork test gate ----------------------------------------------------------
bash research/tests/run.sh

# --- commit doc updates ------------------------------------------------------
git add docs/UPSTREAM.md README.md
if ! git diff --cached --quiet; then
  git commit -q -m "docs: refresh vendored upstream README to $UP_SHA"
fi

# --- ship --------------------------------------------------------------------
if [ "$DRY_RUN" = "1" ]; then
  echo "DRY-RUN-OK branch=$SYNC_BRANCH ahead_of_base=$(git rev-list --count "${BASE_REF}..HEAD")"
  exit 0
fi

git push -q origin "$SYNC_BRANCH" 2>/dev/null || git push -q origin "$SYNC_BRANCH" --force
echo "SYNCED branch=$SYNC_BRANCH"
