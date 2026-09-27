#!/usr/bin/env bash
# check-sync-markers.sh — fail while a sync content-conflict file still carries markers.
# Spec: docs/superpowers/specs/2026-09-27-fork-sync-conflict-capture-design.md §2
#
# No args: scan the UU/AA paths named in `Sync-Conflict:` trailers of BASE_REF..HEAD.
# Args:    scan exactly the given paths (ai-resolve.sh uses this per file).
# Only conflict paths are scanned: upstream ships legitimate marker fixtures
# (omp's `:conflicts` read selector), so a whole-tree scan would false-positive.
# Env: BASE_REF (default origin/main)
# Output: path:line:text per marker line. Exit: 0 clean | 1 markers found
set -euo pipefail
BASE_REF="${BASE_REF:-origin/main}"

if [ "$#" -eq 0 ]; then
  PATHS=()
  while IFS= read -r p; do PATHS+=("$p"); done < <(
    git log --format='%(trailers:key=Sync-Conflict,valueonly)' "$BASE_REF..HEAD" \
      | sed -nE 's/^(UU|AA) //p' | sort -u
  )
  [ "${#PATHS[@]}" -gt 0 ] || exit 0
  set -- "${PATHS[@]}"
fi

hits=0
for p in "$@"; do
  [ -f "$p" ] || continue
  if grep -HnE '^(<<<<<<<|>>>>>>>)( |$)' -- "$p"; then hits=1; fi
done
exit "$hits"
