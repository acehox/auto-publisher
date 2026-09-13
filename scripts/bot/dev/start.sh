#!/bin/bash

set -e

# Load common functions and variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../utils/common.sh"

# Args: [--watch]
WATCH=false
for arg in "$@"; do
  case "$arg" in
    --watch) WATCH=true ;;
    *) echo "❌ Unknown argument: $arg (expected '--watch')"; exit 1 ;;
  esac
done

echo "🚀 Starting development environment..."

is_docker_running
check_env_exists ".env.local"

# Start Supabase (database)
echo "Starting Supabase database..."
supabase start

echo "📋 Using .env.local for environment configuration"

if [ "$WATCH" = true ]; then
  echo "👀 Starting with watch mode enabled..."
  echo "📦 Building and starting services with file watching..."

  # Run Docker Compose from project root with watch mode
  # --build so the initial image reflects current source (watch syncs edits after)
  docker compose $BOT_COMPOSE_FILES_DEV up --build --watch
else
  echo "📦 Building and starting services..."

  # Run Docker Compose from project root
  # --build so a code change since the last start is actually picked up
  # (layer cache keeps this fast — only the source-copy layer re-runs)
  docker compose $BOT_COMPOSE_FILES_DEV up -d --build
  echo "✅ Development environment started!"
  echo "📬 Mail UI: http://localhost:8025"

  # Show continuous logs after starting
  docker compose $BOT_COMPOSE_FILES_DEV logs -f
fi


info() {
  echo "📬 Mail UI: http://localhost:8025"
  echo "📄 View logs: bun run dev:logs"
  echo "📋 Check status: bun run dev:ps"
  echo "🛑 Stop services: bun run dev:stop"
}

# Run info() when Ctrl+C (SIGINT) is received
trap info SIGINT
