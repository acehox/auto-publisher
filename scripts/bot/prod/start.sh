#!/bin/bash

set -e

# Load common functions and variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../utils/common.sh"

echo "🚀 Starting production environment..."

is_docker_running
check_env_exists ".env"
check_env_var_set ".env" "TUNNEL_TOKEN"

echo "📦 Building production images..."

# One image at a time: five installs and `next build` side by side exceed this host's memory.
for SERVICE in $(docker compose $BOT_COMPOSE_FILES_PROD config --services); do
    docker compose $BOT_COMPOSE_FILES_PROD build "$SERVICE"
done

echo "🚀 Starting production services..."
docker compose $BOT_COMPOSE_FILES_PROD up -d

echo "✅ Production environment started!"
echo ""
echo "📋 Service Status:"
docker compose $BOT_COMPOSE_FILES_PROD ps
echo ""
print_resource_usage "$BOT_COMPOSE_FILES_PROD"
echo ""
echo "📄 View logs: npm run prod:logs"
echo "🛑 Stop services: npm run prod:stop"