# syntax=docker/dockerfile:1
# One file for every image: compose picks `target` (app, dev, web) and `args: { APP }`.
# `--parents` below needs frontend 1.20+, which the syntax line pins.
ARG BUN_IMAGE=oven/bun:1.4.4-alpine
ARG NODE_IMAGE=node:26-alpine
# Wall-clock cap on every registry-bound pnpm step; a cold install takes 6-60 s.
ARG INSTALL_TIMEOUT=600

# Version and sha512 come from the lockfile's leading document, which `pnpm install` writes
# from `packageManager`. A lockfile without it fails here rather than installing an
# unverified binary.
FROM ${BUN_IMAGE} AS pnpm-pin
ARG TARGETARCH
COPY pnpm-lock.yaml /tmp/
RUN set -eu; \
    case "$TARGETARCH" in amd64) a=x64 ;; arm64) a=arm64 ;; *) exit 1 ;; esac; \
    entry=$(sed -n '1{/^---$/!q};2,/^---$/p' /tmp/pnpm-lock.yaml | grep -A1 -m1 "^  '@pnpm/exe.linux-$a-musl@" || true); \
    version=$(echo "$entry" | sed -n "1s/.*@\(.*\)':\$/\1/p"); \
    sum=$(echo "$entry" | sed -n '2s/.*integrity: sha512-\([^,}]*\).*/\1/p' | base64 -d 2>/dev/null | od -An -v -tx1 | tr -d ' \n'); \
    if [ -z "$version" ] || [ ${#sum} -ne 128 ]; then \
      echo "pnpm-lock.yaml has no valid @pnpm/exe.linux-$a-musl sha512 in its leading document (missing, or its format changed)." >&2; exit 1; \
    fi; \
    echo "https://registry.npmjs.org/@pnpm/exe.linux-$a-musl/-/exe.linux-$a-musl-$version.tgz $sum" > /pin

# Standalone binary (no Node needed), so it runs on both bases. Takes only the pin, so a
# lockfile change that leaves pnpm alone keeps the download cached.
FROM ${BUN_IMAGE} AS pnpm
COPY --from=pnpm-pin /pin /tmp/
RUN set -eu; \
    read -r url sum < /tmp/pin; \
    wget -q -T 60 -O /tmp/pnpm.tgz "$url"; \
    echo "$sum  /tmp/pnpm.tgz" | sha512sum -c -; \
    tar -xzf /tmp/pnpm.tgz -C /tmp; install -D -m 755 /tmp/package/pnpm /out/usr/local/bin/pnpm

# Everything an install needs, so both bases take it in one COPY. Manifests only, so a
# source edit keeps the install layer cached.
FROM scratch AS install-inputs
COPY --from=pnpm /out/ /
# A fully silent npm CDN makes pnpm drop to one request at a time and time out each package
# in turn (24+ min measured), so its own timeouts never end the build. The message checks
# elapsed time because an OOM kill also ends pnpm by signal. This script, not pnpm, is PID 1:
# no signal from inside the container kills PID 1, so a pnpm exec'd there would outlive the cap.
COPY --chmod=755 <<'EOF' /usr/local/bin/pnpm-capped
#!/bin/sh
start=$(date +%s)
timeout -k 10 "$INSTALL_TIMEOUT" pnpm "$@" && exit 0
rc=$?
[ $(($(date +%s) - start)) -ge "$INSTALL_TIMEOUT" ] && echo "pnpm stopped after ${INSTALL_TIMEOUT}s: the npm registry is not answering" >&2
exit $rc
EOF
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml /app/
COPY --parents apps/*/package.json packages/*/package.json /app/

# --trust-lockfile: skips pnpm 12's per-entry registry re-check (~935 lookups per build).
# --prod: no container runs a devDependency (bun runs `src/`; type checks, lint and
# db:generate run on the host), so the root dev tools stay out too. Not --no-optional: it
# also dropped esbuild's platform package (drizzle-kit, via @ap/database devDependencies),
# whose postinstall then fetched the binary outside pnpm's integrity check, and the dev
# proxy's native msgpack.
FROM ${BUN_IMAGE} AS deps
ARG APP
ARG INSTALL_TIMEOUT
# The default (`download`) silently fetches whatever version `packageManager` names.
ENV pnpm_config_pm_on_fail=error
COPY --from=install-inputs / /
WORKDIR /app
RUN --mount=type=cache,id=pnpm-store-${APP},target=/pnpm-store,sharing=locked \
    pnpm-capped install --frozen-lockfile --trust-lockfile --prod --store-dir /pnpm-store --filter "${APP}..."

FROM deps AS dev
ARG APP
COPY --chown=bun:bun . .
USER bun
WORKDIR /app/apps/${APP}
CMD ["bun", "run", "start"]

# No compile step: bun runs `src/` directly, so tsc output would go unused (type checking is
# `check-types`). The runtime still reads tsconfig.json, which is why `@ap/tsconfig` is a
# dependency, not a devDependency: without it bun silently drops `experimentalDecorators`.
FROM deps AS build
ARG APP
ARG INSTALL_TIMEOUT
COPY . .
RUN --mount=type=cache,id=pnpm-store-${APP},target=/pnpm-store,sharing=locked \
    pnpm-capped deploy --filter "${APP}" --prod --trust-lockfile --store-dir /pnpm-store /prod

FROM ${BUN_IMAGE} AS app
WORKDIR /app
COPY --from=build --chown=bun:bun /prod .
RUN bun run --if-present check:native
USER bun
CMD ["bun", "run", "."]

# Full install: `next build` needs devDependencies (typescript, tailwindcss).
FROM ${NODE_IMAGE} AS web-build
ARG INSTALL_TIMEOUT
ENV pnpm_config_pm_on_fail=error
COPY --from=install-inputs / /
WORKDIR /app
RUN --mount=type=cache,id=pnpm-store-web,target=/pnpm-store,sharing=locked \
    pnpm-capped install --frozen-lockfile --trust-lockfile --store-dir /pnpm-store --filter "web..."
COPY . .
RUN pnpm --filter web run build

FROM ${NODE_IMAGE} AS web
WORKDIR /app
ENV NODE_ENV=production PORT=3100 HOSTNAME=0.0.0.0
# Static assets and public files are not traced into the standalone bundle.
COPY --from=web-build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=web-build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build --chown=node:node /app/apps/web/public ./apps/web/public
# A missing sharp prebuild only shows up as a failed /_next/image at runtime.
RUN node -e "require(require.resolve('sharp', { paths: [require.resolve('next/package.json', { paths: ['apps/web'] })] }))"
USER node
# 127.0.0.1, not localhost: Next binds IPv4 only and `localhost` resolves to [::1] first here.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3100/login || exit 1
CMD ["node", "apps/web/server.js"]
