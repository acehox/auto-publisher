# syntax=docker/dockerfile:1
FROM oven/bun:1.4.3-alpine AS base

FROM base AS builder
WORKDIR /app

# Manifests only, so edits under packages/*/src reuse the cached install layer.
COPY package.json bun.lock turbo.json ./
COPY --parents packages/*/package.json apps/helper/package.json ./

RUN --mount=type=cache,target=/bun-cache,sharing=locked \
    BUN_INSTALL_CACHE_DIR=/bun-cache bun install

COPY . .

RUN bun run build --filter=helper

FROM base AS runtime
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 app

COPY --from=builder --chown=app:nodejs /app .

USER app

WORKDIR /app/apps/helper
CMD ["bun", "run", "./dist/index.js"]
