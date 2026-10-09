# Self-hosting Auto Publisher

Adding [the public bot](https://invite.auto-publisher.gg/) is free and is the right choice for
almost everyone. Self-host if you want to read the code, experiment, or keep everything on your
own infrastructure.

> **Licence.** Running your own instance for servers you run is fine. Hosting an instance for
> other people, such as publishing an invite link, or adding your copy to servers you don't run, is not permitted. See [LICENSE](../LICENSE).
>
> **Support.** None is provided for self-hosted instances. Do it at your own risk.

## Before you start

You need Docker and minimum 1 GB of free memory. This guide assumes
you already know how to run Docker on your system. Installing and operating it is not covered
here.

## 1. Create a Discord application

Go to [discord.com/developers/applications](https://discord.com/developers/applications) and
create an application.

- **Bot** tab → _Reset Token_ → copy it. This is `DISCORD_BOT_TOKEN`.
- **Bot** tab → turn on the **Message Content Intent**. Without it the bot cannot read message
  text, so keyword filters silently match nothing.
- **OAuth2** tab → copy the **Client ID** (`DISCORD_CLIENT_ID`), then _Reset Secret_ and copy
  the **Client Secret** (`DISCORD_CLIENT_SECRET`).
- **OAuth2** tab → **Redirects** → add `http://localhost:3100/api/auth/callback/discord`.
  Dashboard login fails without it. Use your own domain/IP instead if you plan to expose the
  dashboard publicly (not recommended).

## 2. Fill in the configuration

Copy `.env.example` to `.env`, then paste in the three values from step 1.

The fourth value, `AUTH_SECRET`, you make up yourself: any random string of 32 or more
characters. A password generator is the easiest way to get one.

## 3. Start it

From the project folder:

```
docker compose up -d --build
```

The first run builds the images and takes a few minutes. Database migrations run
automatically.

## 4. Add the bot to your server

Open the dashboard at <http://localhost:3100> (or your custom domain/IP) and sign in with Discord once the bot is in a server. Both give you an invite link for **your** application.

## 5. Choose which channels publish

Use the dashboard, or run `/ap enable #your-channel` in Discord to enable publishing in desired announcement channels. `/ap overview` shows what is publishing and what is missing permissions, and `/ap filters #channel` sets per-channel rules.

## Things worth knowing

- **Discord allows 10 publishes per hour per channel.** A hard platform limit. Messages beyond it
  are published automatically once the limit resets, oldest first, for up to 24 hours after
  posting; after that they are not published.
- **Don't make a busy channel an announcement channel.** Moderation logs or general chat will
  sit permanently against that rate limit.
- **Messages with a link are held for 5 seconds** so Discord can generate the embed first.

## Troubleshooting

**A service exits immediately with "Missing required environment variable".**
`DISCORD_BOT_TOKEN` is empty, or `.env` was never created from `.env.example`.

**Login redirects back with an error.** The OAuth2 redirect URL in the Discord application
doesn't exactly match where you're browsing from, scheme and port included.

**Port 3100 is already in use.** Set `WEB_PORT` in `.env` to a free port, then start again.

**The bot is in the server but nothing publishes.** Run `/ap overview` — it will show you which channels are missing permissions.

**Filters never match.** The Message Content Intent is likely off (step 1).
