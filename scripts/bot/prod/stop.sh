#!/bin/bash

set -e

# Load common functions and variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../utils/common.sh"

echo "🛑 Stopping production environment (preserving Redis data)..."

is_docker_running

# Stop production services
docker compose $BOT_COMPOSE_FILES_PROD down

echo "✅ Production services stopped!"
echo "💡 Redis data is preserved"
echo "🚀 To restart: npm run prod:start"