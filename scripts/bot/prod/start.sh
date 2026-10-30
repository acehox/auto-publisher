#!/bin/bash

set -e

# Load common functions and variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../utils/common.sh"

echo "🚀 Starting production environment..."

is_docker_running
check_env_exists ".env"
check_env_var_set ".env" "TUNNEL_TOKEN"

if ! use_deployed_images; then
    echo "⚠️  No deploy recorded. Deploy a commit of main: bash scripts/bot/prod/deploy.sh <sha>"
    exit 1
fi

# The host never builds: a build needs ~2 GiB and the host has ~1.2 GiB free with prod up.
echo "🚀 Starting the last deployed images ($IMAGE_TAG)..."
docker compose $BOT_COMPOSE_FILES_PROD up -d --no-build --pull missing

echo "✅ Production environment started!"
echo ""
echo "📋 Service Status:"
docker compose $BOT_COMPOSE_FILES_PROD ps
echo ""
print_resource_usage "$BOT_COMPOSE_FILES_PROD"
echo ""
echo "📄 View logs: npm run prod:logs"
echo "🛑 Stop services: npm run prod:stop"