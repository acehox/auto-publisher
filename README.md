<img src=".github/assets/banner.png" alt="Auto Publisher" width="580"/>

# Auto Publisher

Auto Publisher publishes messages in your [announcement channels](https://support.discord.com/hc/en-us/articles/360032008192-Announcement-Channels-) automatically, whether they came from your team, a bot or a webhook. Publish everything, or only what matches your filters.

Visit [auto-publisher.gg](https://auto-publisher.gg) to find out more.

## Get started

It takes less than a minute to automate your first channel:

1. [Invite the bot](https://invite.auto-publisher.gg/) to your server.
2. Pick the channels to publish from, in the [dashboard](https://auto-publisher.gg/dashboard) or with `/ap enable #channel`.
3. In each of those channels, give the bot `View Channel`, `Send Messages` and `Manage Messages`.
4. Done!

`/ap overview` or the dashboard shows what is publishing and which permissions are missing.

Need help? Join the [support server](https://discord.gg/xcEeJkdQX8).

## Commands

| Command                | What it does                                   |
| ---------------------- | ---------------------------------------------- |
| `/ap overview`         | What's publishing, and any missing permissions |
| `/ap enable #channel`  | Start publishing from a channel                |
| `/ap disable #channel` | Stop publishing from a channel                 |
| `/ap filters #channel` | Choose which messages get published            |

## Good to know

- Discord allows 10 published messages per hour per channel, for bots and people alike.
- A channel with heavy traffic (chat, moderation logs) should not be an announcement channel.
- Servers set up before v7 run in legacy mode, which ends on December 31, 2027. They must migrate before then; the [migration guide](https://auto-publisher.gg/migration) explains how.

## Self-hosting

The code is public for transparency and to help other developers build the same thing into their own bots. The hosted bot is free and is the right choice for almost everyone.

You can run your own copy for servers you look after. No support is given for self-hosted copies. Hosting a copy for other people, whether by publishing an invite link, or adding it to servers you don't run, is not allowed by the [licence](LICENSE).

Guide: **[Self-hosting](docs/self-hosting.md)**
