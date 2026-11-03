#!/bin/bash

set -e

# Gitignored per-machine files, symlinked so every worktree reads the main checkout's copy.
LOCAL_FILES=(.env.local .mcp.json .claude/settings.local.json)

if [ -n "$ORCA_ROOT_PATH" ] && [ "$ORCA_ROOT_PATH" != "$ORCA_WORKTREE_PATH" ]; then
  for file in "${LOCAL_FILES[@]}"; do
    if [ -e "$ORCA_ROOT_PATH/$file" ] && [ ! -e "$file" ]; then
      mkdir -p "$(dirname "$file")"
      ln -s "$ORCA_ROOT_PATH/$file" "$file"
      echo "🔗 Linked $file"
    fi
  done

  # Created in the main checkout when missing, so a browser login made later reaches this worktree.
  mkdir -p "$ORCA_ROOT_PATH/.playwright/auth" .playwright
  if [ ! -e .playwright/auth ]; then
    ln -s "$ORCA_ROOT_PATH/.playwright/auth" .playwright/auth
    echo "🔗 Linked .playwright/auth"
  fi
fi

# Relative, so each worktree runs its own checkout's hooks.
git config core.hooksPath scripts/git-hooks

pnpm install --frozen-lockfile
