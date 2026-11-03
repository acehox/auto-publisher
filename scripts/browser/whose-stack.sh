#!/bin/bash

# Prints which checkout serves the dashboard on 3100 and which started the dev stack. Both are one
# per machine, so a worktree's agent can be looking at another worktree's code.

pid=$(lsof -nP -iTCP:3100 -sTCP:LISTEN -t 2>/dev/null | head -1)
if [ -n "$pid" ]; then
  cwd=$(lsof -a -p "$pid" -d cwd -Fn | sed -n 's/^n//p')
  echo "dashboard: ${cwd%/apps/web}"
else
  echo "dashboard: not running"
fi

stack=$(docker compose ls --all --filter name=auto-publisher-dev --format json 2>/dev/null |
  grep -o '"Status":"[^"]*","ConfigFiles":"[^"]*' |
  sed -E 's#"Status":"([^"]*)","ConfigFiles":"([^,"]*)/scripts/bot/.*#\2 (\1)#')
echo "dev stack: ${stack:-not running}"
echo "this checkout: $(git rev-parse --show-toplevel)"
