#!/usr/bin/env bash

# Common variables
BOT_COMPOSE_FILES_DEV="--env-file .env.local -f scripts/bot/docker-compose.base.yml -f scripts/bot/dev/docker-compose.yml"
BOT_COMPOSE_FILES_PROD="--env-file .env -f scripts/bot/docker-compose.base.yml -f scripts/bot/prod/docker-compose.yml"

# Check that an env file exists. Takes the filename: dev overrides live in
# `.env.local`, every deployment reads `.env`.
check_env_exists() {
    local ENV_FILE="$1"

    if [ ! -f "$ENV_FILE" ]; then
        echo "⚠️  $ENV_FILE file not found. See docs/public-instance/.env.example"
        exit 1
    fi
}

check_env_var_set() {
    local ENV_FILE="$1"
    local VAR_NAME="$2"

    if ! grep -Eq "^[[:space:]]*${VAR_NAME}[[:space:]]*=[[:space:]]*[\"']?[^\"'[:space:]]" "$ENV_FILE"; then
        echo "⚠️  $VAR_NAME is not set in $ENV_FILE. See docs/public-instance/.env.example"
        exit 1
    fi
}

# Check if Docker is running
is_docker_running() {
    if ! docker info >/dev/null 2>&1; then
        echo "❌ Docker is not running. Please start Docker first."
        exit 1
    fi
}

# Check if Docker services are running
is_docker_services_running() {
    local ENV_NAME="$1"
    local FILES="$2"

    if ! docker compose $FILES ps --services --filter "status=running" | grep -q "bot\|backend\|proxy"; then
        echo "⚠️  Bot services are not running. Start them first with: bun run $ENV_NAME:start"
        exit 1
    fi
}

# Print resource usage of the Docker containers
print_resource_usage() {
    local FILES="$1"
    echo "📊 Resource Usage:"
    # Get container names from the compose project and show their stats
    local CONTAINER_NAMES=$(docker compose $FILES ps --format "{{.Name}}" | tr '\n' ' ')
    if [ -n "$CONTAINER_NAMES" ]; then
        docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" $CONTAINER_NAMES
    else
        echo "No containers running for this project"
    fi
}