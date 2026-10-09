#!/bin/bash

set -e

# Load common functions and variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../utils/common.sh"

is_docker_running
is_docker_services_running "prod" "$BOT_COMPOSE_FILES_PROD"

# Production logs plain JSON (packages/logger); prettify here.
docker compose $BOT_COMPOSE_FILES_PROD logs -f --no-log-prefix | bunx pino-pretty
