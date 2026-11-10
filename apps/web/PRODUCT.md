# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, weighted equally:

- **New admins** (marketing site, guides, pricing): Discord server admins who run announcement channels, especially ones where bots, webhooks or RSS and news feeds post messages that would otherwise be published by hand. Job: decide the bot is worth inviting, invite it, enable channels, and later decide whether Premium is worth paying for.
- **Existing admins** (dashboard, migration pages): admins of the servers already running the bot, including legacy-mode servers that must migrate before December 31, 2027. Job: see at a glance whether every channel is auto-publishing, fix what is broken (usually Discord permissions), change settings, migrate, manage a subscription.

Many readers are non-native English speakers.

## Product Purpose

Auto Publisher publishes messages in Discord announcement channels automatically, so they reach every server that follows those channels, whether the message came from a person, a bot or a webhook. Free for up to 5 channels per server; Premium adds unlimited channels, filters, and Rollover.

Success: servers invite the bot and keep it working without thinking about it; growth is measured in Premium subscriptions. Legacy servers migrate before the sunset date.

## Positioning

All four are true and may be claimed:

- **Scale and track record:** 17,000+ servers, one long-lived bot.
- **Rollover:** messages past Discord's limit of 10 published messages per channel per hour are published once the limit resets, in the order they were posted, for up to 24 hours (Premium).
- **Filters that read the whole message:** text conditions match embeds and Components V2 text, so feed and bot posts can be filtered, not only plain content (Premium).
- **Source-available:** the code is public on GitHub; a self-hosted copy gets every feature free.

## Operating Context

- Admins work across Discord and the dashboard. Slash commands (`/ap overview`, `/ap enable`, `/ap disable`, `/ap filters`, `/ap rollover`) mirror the dashboard, and both state the same facts in the same words.
- The most common failure is a missing Discord permission (View Channel, Send Messages, Manage Messages); the fix happens in Discord, not on the site.
- Dashboard login is Discord OAuth. Checkout is a Paddle overlay. Legal pages carry statutory duties (EU/Croatian consumer law) that constrain layout and wording on the subscription surface.
- The same web app runs in two modes: the public instance (billing, pricing, guides) and self-host (no billing surfaces, not indexed).

## Capabilities and Constraints

- Terminology: "publish" is the public word; "crosspost" is Discord's API name, named at most once per surface and never in a lead. Glossary and voice rules are binding (see Brand Commitments).
- Free plan cap is 5 channels; legacy sunset is December 31, 2027. Both are fixed, never presented as levers.
- No price or trial claim outside the surfaces that read the live configuration; static pages link to `/premium`.
- Undecided: whether named servers may be shown as users (see Evidence on Hand).

## Brand Commitments

- Name: Auto Publisher. Domain: auto-publisher.gg. Logo: `apps/web/public/auto-publisher.png`. Maintainer brand: acehox.
- Voice (dashboard and bot): state first, present tense, one idea per sentence, active voice, "you" for the admin, no idioms, no em dashes, no `!`, no negative contractions, sentence case, US spelling. Glossary: people post, Discord publishes, Auto Publisher auto-publishes; "server", never "guild"; "filter" made of "conditions", never "rule"; Rollover is a capitalised feature name. Marketing and legal pages keep their own voice.
- Premium has exactly one mark product-wide, and Free vs Premium gets no persistent chrome; the distinction shows only where it bites.
- Fix wrong facts with the smallest edit; do not rewrite existing brand copy (title, hero, FAQ voice) unasked.

## Evidence on Hand

- **Confirmed:** "17,000+ servers" (`values.activeServers` in `src/lib/constants.ts`). Keep that figure unless the maintainer changes it.
- **Possible later, not approved yet:** named servers that agree to be shown as users. Do not show any until the maintainer supplies them.
- **Absent, never fabricate:** testimonials, listing reviews or ratings, customer logos, benchmarks, uptime figures.

## Product Principles

1. **Working is the default state.** The product succeeds when admins stop thinking about it; every surface answers "is it working" before "what else can I do".
2. **One fact, one place, one wording.** The site, dashboard and bot never state the same thing two ways.
3. **Point to the real fix.** When the fix is in Discord, say exactly where and what, rather than offering a control that only explains.
4. **Premium is sold where it would act,** never by decorating the free experience.
5. **Plain words for a global audience.** Every sentence must read right the first time to a non-native speaker.

## Accessibility & Inclusion

- Readers include many non-native English speakers; copy follows the voice rules above.
- Dashboard must work at phone width (fixed bottom tab bar below 768px) through desktop.
