#!/bin/bash

# Stops the dev stack only when this worktree started it. Never fails: an archive must not
# be blocked by Docker being down.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../utils/common.sh"

WORKTREE="${ORCA_WORKTREE_PATH:-$(pwd)}"
cd "$WORKTREE" || exit 0

docker info >/dev/null 2>&1 || exit 0

# ConfigFiles holds the absolute compose paths of the checkout that last ran `up`.
if docker compose ls --all --filter name=auto-publisher-dev --format json | grep -qF "$WORKTREE/scripts/bot/"; then
  echo "🛑 Stopping the dev stack this worktree started (Redis data and Supabase kept)..."
  docker compose $BOT_COMPOSE_FILES_DEV down || true
fi

exit 0
