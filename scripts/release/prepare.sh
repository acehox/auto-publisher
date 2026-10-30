#!/bin/bash
# Release preflight for the /release skill: refuses unless develop can be released,
# then prints everything the release notes are written from. Changes nothing.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

fail() {
    echo "❌ $*" >&2
    exit 1
}

[ "$(git branch --show-current)" = develop ] || fail "Run on develop."
[ -z "$(git status --porcelain)" ] || fail "The working tree has uncommitted changes."
git fetch --quiet --tags origin develop main
[ "$(git rev-parse develop)" = "$(git rev-parse origin/develop)" ] || fail "develop differs from origin/develop. Pull or push first."
git merge-base --is-ancestor origin/main develop || fail "main has commits develop lacks, so develop:main would not fast-forward."
[ "$(git rev-parse origin/main)" != "$(git rev-parse develop)" ] || fail "main already has every commit on develop."

last_tag="$(git tag --list --sort=-v:refname | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' | head -n 1)"
[ -n "$last_tag" ] || fail "No X.Y.Z tag found."

# Same patterns as `paths-ignore` in .github/workflows/release.yml: a push touching
# only these never builds, so its tag would get no images.
deployable="$(git diff --name-only origin/main develop |
    grep -vE '\.md$|^docs/|^\.claude/|^\.github/assets/' || true)"
[ -n "$deployable" ] || fail "Only docs changed since main. A release needs a change that builds."

echo "▶ Checks"
pnpm run --silent check-types >/dev/null || fail "check-types failed."
pnpm run --silent check >/dev/null || fail "check failed."
echo "passed"

range="$last_tag..develop"
subjects="$(git log --no-merges --format='%s' "$range")"
bump=patch
if git log --no-merges --format='%B' "$range" | grep -qE '^BREAKING[ -]CHANGE:' ||
    grep -qE '^[a-z]+(\([^)]*\))?!: ' <<<"$subjects"; then
    bump=major
elif grep -qE '^feat(\([^)]*\))?: ' <<<"$subjects"; then
    bump=minor
fi

echo
echo "▶ Last release: $last_tag"
echo "▶ Minimum bump from commit types: $bump"
echo
echo "▶ Commits since $last_tag (sha, subject, body)"
git log --no-merges --format='--- %h %s%n%b' "$range" | grep -v '^Co-Authored-By:'

# What a self-hoster has to act on: compose, env, image pins, schema.
self_host_files=(docker-compose.yml .env.example docs/self-hosting.md Dockerfile packages/database/migrations)
echo
echo "▶ Self-host-facing changes"
git diff --stat "$last_tag" develop -- "${self_host_files[@]}"
git diff "$last_tag" develop -- docker-compose.yml .env.example

echo
echo "▶ One-way changes (rollback cannot undo these)"
one_way=false
if git diff "$last_tag" develop -- docker-compose.yml scripts/bot | grep -qE '^[+-][[:space:]]*image: redis:'; then
    echo "- The Redis image pin changed. A newer minor's data does not load in an older one."
    one_way=true
fi
for file in $(git diff --name-only --diff-filter=AM "$last_tag" develop -- packages/database/migrations | grep '\.sql$' || true); do
    if grep -qiE '\b(DROP|RENAME)\b|SET NOT NULL' "$file"; then
        echo "- $file drops, renames or tightens schema. An older backend may not run on it."
        one_way=true
    fi
done
$one_way || echo "none"
