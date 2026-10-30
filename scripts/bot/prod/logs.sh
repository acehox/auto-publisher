#!/bin/bash

set -e

# Load common functions and variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../utils/common.sh"

is_docker_running
use_deployed_images_if_any
is_docker_services_running "prod" "$BOT_COMPOSE_FILES_PROD"

# Production logs plain JSON (packages/logger); prettify here.
docker compose $BOT_COMPOSE_FILES_PROD logs -f --no-log-prefix "$@" | npx --yes pino-pretty@13
