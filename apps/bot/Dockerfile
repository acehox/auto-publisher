FROM oven/bun:1.4.3-alpine AS base

# Stage 1: Install and Build
FROM base AS builder
# Install necessary packages (needed for optional dependencies)
RUN apk update && apk add --no-cache g++ make python3 linux-headers
WORKDIR /app

# Copy workspace configuration and package files
# Manifests only, so edits under packages/*/src reuse the cached install layer.
# `--parents` keeps the directory structure and needs frontend 1.20+, which is
# what the pinned syntax line guarantees.
COPY package.json bun.lock turbo.json ./
COPY --parents packages/*/package.json apps/bot/package.json ./

# Install all dependencies (including dev dependencies for build)
# Cache mount persists downloads across builds; BUN_INSTALL_CACHE_DIR is
# per-command to stay build-only and survive a USER change.
RUN --mount=type=cache,target=/bun-cache,sharing=locked \
    BUN_INSTALL_CACHE_DIR=/bun-cache bun install

# Copy source code
COPY . .

# Generate database client before building the bot (if needed by the build process)
RUN bun run db:generate

# Build the project
RUN bun run build --filter=bot

# Stage 2: Runtime
FROM base AS runtime
WORKDIR /app

# Create app user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 app

# Copy the built application and production dependencies from builder
COPY --from=builder --chown=app:nodejs /app .

USER app

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun --version || exit 1

# Start the application using the built JavaScript files
WORKDIR /app/apps/bot
CMD ["bun", "run", "./dist/index.js"]
