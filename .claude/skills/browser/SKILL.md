---
name: browser
description: Open the local dashboard (http://localhost:3100) in a logged-in headless Chrome to see a web change working, click through flows, read console errors and failed requests, and take screenshots. Use when verifying dashboard UI, layout or behaviour in the running app, or when the user shares a localhost:3100 link.
allowed-tools: Bash(pnpm exec playwright cli:*) Bash(bash scripts/browser/whose-stack.sh)
---

# Browser access to the local dashboard

The browser is Playwright's agent CLI (`pnpm exec playwright cli <command>`). Run it from this checkout's root: sessions belong to the folder holding `.playwright/`, so each worktree has its own. Defaults (system Chrome, headless, 1440×900, output in `.playwright-cli/`) are in `.playwright/cli.config.json`.

## 1. Check whose code is running

```bash
bash scripts/browser/whose-stack.sh
```

The dashboard (`pnpm dev:web`, port 3100) and the dev stack (`pnpm dev:start`: backend, bot, proxy) are one per machine. If either one is not running, or another checkout is running it, tell the user before testing. Ask before starting or restarting either one, because starting them here replaces another worktree's copy.

## 2. Start a session

```bash
pnpm exec playwright cli open
pnpm exec playwright cli state-load .playwright/auth/state.json
pnpm exec playwright cli goto http://localhost:3100/api/auth/session
pnpm exec playwright cli eval "document.body.innerText"
```

The session is signed in when that text is a JSON object with a `user`. It is signed out when `state-load` reports a missing file or the text is `null`. Then stop and ask the user to run `pnpm browser:login`. That command needs a person: they sign in to Discord in a Chrome window. Never type into a discord.com page yourself.

Check this before you open `/dashboard`, and never open it while signed out. A signed-out dashboard shows a spinner, then sends the browser to discord.com by itself.

Once signed in, open the dashboard:

```bash
pnpm exec playwright cli goto http://localhost:3100/dashboard
```

The session is now signed in as the test Discord account. That account administers test servers that run the dev bot.

## 3. Work with the page

```bash
pnpm exec playwright cli snapshot                                     # structure + element refs (e15)
pnpm exec playwright cli click e15                                    # also fill, select, hover, press
pnpm exec playwright cli screenshot --filename=.playwright-cli/x.png  # then Read the PNG
pnpm exec playwright cli console error                                # runtime errors
pnpm exec playwright cli requests                                     # network; `request <n>` for one
pnpm exec playwright cli resize 390 844                               # phone layout (tab bar below 768px)
```

After you load a page you changed, check `console` and `requests` as well as the screenshot. A failed server action or a 4xx/5xx from `/api` can look fine on screen.

Outbound mail, such as the withdrawal acknowledgement, lands in Mailpit at http://localhost:8025.

## Rules

- **Change data freely on the dev stack.** That means enabling channels and editing filters. The stack runs the dev bot and test servers, never production.
- **Use localhost only.** Never act on discord.com. Driving a Discord user account outside OAuth is a self-bot, and Discord terminates accounts for it. If a test needs a message posted in Discord, ask the user.
- **Close the session when done:** `pnpm exec playwright cli close`. The user can watch or take over a session with `pnpm exec playwright cli show`.

`pnpm exec playwright cli --help` prints every command and the path of Playwright's full CLI skill (mocking, tracing, video, test generation).
