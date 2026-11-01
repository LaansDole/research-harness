#!/usr/bin/env bash
# Cut a research-harness release: move research/CHANGELOG.md's [Unreleased] entries
# under "## [x.y.z] - <today UTC>", open a fresh empty [Unreleased], set research/VERSION.
# Prints the release notes on stdout. Run by research-release.yml; works locally too.
# Usage: research-release.sh <x.y.z>
set -euo pipefail

die() {
	echo "research-release: $1" >&2
	exit 1
}

root="$(cd "$(dirname "$0")/../.." && pwd)"
changelog="$root/research/CHANGELOG.md"
vfile="$root/research/VERSION"
ver="${1:-}"

[[ "$ver" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "version must look like 1.2.3, got '$ver'"
cur="$(tr -d '[:space:]' <"$vfile")"
IFS=. read -r a b c <<<"$cur"
IFS=. read -r x y z <<<"$ver"
if ! ((x > a || (x == a && (y > b || (y == b && z > c))))); then
	die "$ver is not newer than the current version $cur"
fi
grep -q '^## \[Unreleased\]' "$changelog" || die "no '## [Unreleased]' heading in research/CHANGELOG.md"

notes="$(awk '
	/^## \[Unreleased\]/ { on = 1; next }
	on && /^## \[/ { exit }
	on { print }' "$changelog")"
grep -qv -e '^#' -e '^[[:space:]]*$' <<<"$notes" || die "[Unreleased] has no entries; add what changed first"

tmp="$(mktemp)"
awk -v head="## [$ver] - $(date -u +%F)" '
	!done && /^## \[Unreleased\]/ { print; print ""; print head; done = 1; next }
	{ print }' "$changelog" >"$tmp"
mv "$tmp" "$changelog"
echo "$ver" >"$vfile"
printf '%s\n' "$notes" | sed '/./,$!d'
