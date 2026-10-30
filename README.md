<img src=".github/assets/banner.png" alt="Auto Publisher" width="580"/>

# Auto Publisher

[![Release](https://github.com/acehox/auto-publisher/actions/workflows/release.yml/badge.svg?branch=main)](https://github.com/acehox/auto-publisher/actions/workflows/release.yml)
[![Latest release](https://img.shields.io/github/v/release/acehox/auto-publisher)](https://github.com/acehox/auto-publisher/releases/latest)

Auto Publisher ([auto-publisher.gg](https://auto-publisher.gg)) is a Discord bot that automatically publishes the messages posted in your [announcement channels](https://support.discord.com/hc/en-us/articles/360032008192-Announcement-Channel-FAQ), so they reach every server that follows those channels. It is for Discord server admins who run announcement channels, especially ones where other bots, webhooks or RSS and news feeds post messages that would otherwise have to be published by hand.

Publish everything, or only what matches your filters.

## Free and Premium

Auto Publisher is free for up to 5 announcement channels per server. [Premium](https://auto-publisher.gg/premium) adds unlimited channels, filters, and publishing past Discord's hourly limit.

- **Filters:** Premium filters let a channel publish only the messages you choose: by text, author, mention or webhook. Text filters also read embeds, so feed posts can be filtered too.
- **Hourly limit:** Discord lets each channel publish 10 messages per hour. On Premium, messages beyond that are published automatically once the limit resets, in the order they were posted, for up to 24 hours.

## Get started

It takes less than a minute to automate your first channel:

1. [Invite the bot](https://invite.auto-publisher.gg/) (bot ID `739823232651100180`) to your server.
2. Pick the channels to publish from, in the [dashboard](https://auto-publisher.gg/dashboard) or with `/ap enable #channel`.
3. In each of those channels, give the bot three permissions: `View Channel`, `Send Messages` and `Manage Messages`.
4. Run `/ap overview`, or open the dashboard, to see what is publishing and which permissions are missing.

Step-by-step [guides](https://auto-publisher.gg/guides) cover setup, filters and the hourly limit. Need help? Join the [support server](https://discord.gg/xcEeJkdQX8).

## Commands

| Command                | What it does                                               |
| ---------------------- | ---------------------------------------------------------- |
| `/ap overview`         | Show the publishing status of every channel in this server |
| `/ap enable #channel`  | Auto-publish new messages in an announcement channel       |
| `/ap disable #channel` | Stop auto-publishing in an announcement channel            |
| `/ap filters #channel` | Choose which messages a channel auto-publishes (Premium)   |
| `/help`                | See the available commands and where to get help           |

## Good to know

- Publishing is what Discord's API calls a crosspost.
- A channel with heavy traffic (chat, moderation logs) should not be an announcement channel.
- Servers set up before v7 run in legacy mode, which ends on December 31, 2027. They must migrate before then; the [migration guide](https://auto-publisher.gg/migration) explains how.

## Self-hosting

The source code is on GitHub ([github.com/acehox/auto-publisher](https://github.com/acehox/auto-publisher)) under the [PolyForm Perimeter License 1.0.1](LICENSE), which is source-available, not open source. You may run your own copy with Docker for servers you run, but not host it for other people, whether by publishing an invite link or by adding it to servers you don't run.

A self-hosted copy gets every feature for free. No support is given for it. The code is public for transparency and to help other developers build the same thing into their own bots; the hosted bot is the right choice for almost everyone.

Prebuilt x86 images are on the [GitHub Container Registry](https://github.com/acehox?tab=packages&repo_name=auto-publisher) (`ghcr.io/acehox/auto-publisher-bot`, `-proxy`, `-backend`, `-web`), tagged with each release version and `latest`.

Guide: **[Self-hosting](docs/self-hosting.md)**
