#!/bin/bash
# Publishes an approved release for the /release skill:
#   bash scripts/release/publish.sh <X.Y.Z> <notes-file>
# Tags develop, pushes it to main with the tag in one atomic push, opens a draft
# GitHub Release and publishes it once release.yml has built and deployed.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

fail() {
    echo "❌ $*" >&2
    exit 1
}

version="${1:-}"
notes="${2:-}"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "Usage: publish.sh <X.Y.Z> <notes-file>"
[ -s "$notes" ] || fail "Notes file '$notes' is missing or empty."

# Re-checked: time passes between prepare.sh and the maintainer's approval.
[ "$(git branch --show-current)" = develop ] || fail "Run on develop."
[ -z "$(git status --porcelain)" ] || fail "The working tree has uncommitted changes."
git fetch --quiet --tags origin develop main
[ "$(git rev-parse develop)" = "$(git rev-parse origin/develop)" ] || fail "develop differs from origin/develop."
git merge-base --is-ancestor origin/main develop || fail "develop:main would not fast-forward."

last_tag="$(git tag --list --sort=-v:refname | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' | head -n 1)"
newest="$(printf '%s\n%s\n' "$last_tag" "$version" | sort -V | tail -n 1)"
if [ "$version" = "$last_tag" ] || [ "$newest" != "$version" ]; then
    fail "$version is not newer than $last_tag."
fi

sha="$(git rev-parse develop)"
git tag --annotate "$version" --message "$version" "$sha"
# One push: the build sees the version tag on the commit main moves to.
if ! git push --atomic origin develop:main "refs/tags/$version"; then
    git tag --delete "$version" >/dev/null
    fail "Push refused. Nothing was published."
fi

gh release create "$version" --draft --verify-tag --title "$version" --notes-file "$notes"
echo "▶ Draft release $version created. Waiting for the Release workflow on ${sha:0:7}..."

run_id=""
for _ in $(seq 60); do
    run_id="$(gh run list --workflow release.yml --commit "$sha" --event push --limit 1 \
        --json databaseId --jq '.[0].databaseId // empty')"
    [ -n "$run_id" ] && break
    sleep 5
done
[ -n "$run_id" ] || fail "No Release workflow run started for ${sha:0:7}. The draft stays unpublished."

if gh run watch "$run_id" --exit-status --interval 30 >/dev/null; then
    gh release edit "$version" --draft=false --latest
    echo "✅ $version is deployed and published: $(gh release view "$version" --json url --jq .url)"
else
    fail "The Release workflow failed: $(gh run view "$run_id" --json url --jq .url). Production rolled back if the deploy step failed. The draft stays unpublished."
fi
