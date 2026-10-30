#!/bin/bash
# Deploys one commit of `main` from its GHCR images and, if that fails, redeploys
# the previous one. Run by the `deploy` user's SSH forced command (sha in
# SSH_ORIGINAL_COMMAND) or by hand on the host: bash scripts/bot/prod/deploy.sh <sha>.

set -euo pipefail

alert() {
    echo "$1"
    local url
    url="$(sed -n 's/^DISCORD_ALERT_WEBHOOK_URL=//p' .env | tail -n 1 | tr -d "\"'")"
    [ -n "$url" ] || return 0
    curl -fsS --max-time 10 -H 'Content-Type: application/json' \
        -d "{\"content\":\"**Deploy:** $1\"}" "$url" >/dev/null || echo "Alert webhook failed"
}

# Chained with && because `set -e` is ignored inside a function an `if` tests.
# The compose files must come from the same commit as the images.
deploy() {
    echo "Deploying ${1:0:7}" &&
        git checkout --quiet --detach "$1" &&
        export IMAGE_TAG="sha-${1:0:7}" &&
        docker compose $BOT_COMPOSE_FILES_PROD pull --quiet &&
        docker compose $BOT_COMPOSE_FILES_PROD up -d --no-build --remove-orphans --wait --wait-timeout 600 &&
        curl -fsS --max-time 15 -o /dev/null https://auto-publisher.gg
}

# One function, so bash has read all of it before `git checkout` rewrites this file.
main() {
    local sha="${1:-${SSH_ORIGINAL_COMMAND:-}}" previous
    [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "Usage: deploy.sh <full 40-character commit sha>"; exit 1; }

    cd "$(dirname "${BASH_SOURCE[0]}")/../../.."
    source scripts/utils/common.sh
    check_env_var_set ".env" "TUNNEL_TOKEN"
    git fetch --quiet origin
    git merge-base --is-ancestor "$sha" origin/main || { echo "$sha is not on origin/main"; exit 1; }
    previous="$(deployed_sha || true)"

    if deploy "$sha"; then
        echo "$sha" >"$DEPLOYED_SHA_FILE"
        # Only our images no container uses; a rollback pulls again from GHCR.
        docker image prune -af --filter "label=org.opencontainers.image.source=https://github.com/acehox/auto-publisher" >/dev/null
        echo "✅ Deployed ${sha:0:7}"
        exit 0
    fi

    if [ -z "$previous" ]; then
        alert "${sha:0:7} failed and there is no earlier deploy to roll back to. Production needs attention."
    elif alert "${sha:0:7} failed. Rolling back to ${previous:0:7}." && deploy "$previous"; then
        alert "Rolled back to ${previous:0:7}."
    else
        alert "Rollback to ${previous:0:7} failed too. Production needs attention."
    fi
    exit 1
}

main "$@"
