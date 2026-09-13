#!/bin/bash

set -e

# Load common functions and variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../utils/common.sh"

echo "🛑 Stopping development environment..."

is_docker_running

# Stop services and remove images and volumes
docker compose $BOT_COMPOSE_FILES_DEV down --rmi local --volumes

# Stop Supabase
echo "Stopping Supabase database..."
supabase stop

# Cleanup: remove only this project's dangling images (orphaned <none> images
# left by repeated --build/watch rebuilds; down --rmi local only sees tagged ones).
# Scoped by compose project label so other projects are untouched.
# NOTE: no `docker builder prune` — it wipes the BuildKit build cache (the
# `bun install` layer), forcing a full re-download of packages on next start.
echo "🧽 Cleaning up this project's dangling images..."
docker image prune -f --filter "label=com.docker.compose.project=auto-publisher-dev"
docker network prune -f 2>/dev/null || true
docker container prune -f 2>/dev/null || true

echo "✅ Development environment stopped and cleaned up!"
echo ""
echo "📝 Note: All Redis data has been removed"
echo "🚀 To start again: bun run dev:start"
