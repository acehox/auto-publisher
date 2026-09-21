import { Copy } from '@ap/copy';
import { ButtonBuilder, ButtonStyle, type Snowflake } from 'discord.js';
import { emojis, links } from 'lib/constants/index.js';

export const website = new ButtonBuilder()
  .setLabel(links.hostname)
  .setURL(links.website)
  .setStyle(ButtonStyle.Link);

// Names its destination, like the dashboard's locked card — "Get Premium" read
// as the upgrade itself, which the next screen then asks for again.
export const getPremium = new ButtonBuilder()
  .setLabel(Copy.premium.seePlans)
  .setURL(links.premiumPage)
  .setStyle(ButtonStyle.Link);

// Built per call, not at module scope: `emojis.botBrand` is only resolved to the
// app emoji at startup, so a builder created at import time would capture the
// unicode fallback forever.
export const botInvite = () =>
  new ButtonBuilder()
    .setEmoji(emojis.botBrand)
    .setLabel('Invite the bot!')
    .setURL(links.botInvite)
    .setStyle(ButtonStyle.Link);

export const supportServer = new ButtonBuilder()
  .setLabel('Support server')
  .setURL(links.supportGuildInvite)
  .setStyle(ButtonStyle.Link);

// Guild-scoped, so necessarily a factory. `/dashboard/:guildId` redirects to
// the Overview tab — the short URL is the stable one to link.
export const dashboard = (guildId: Snowflake) =>
  new ButtonBuilder()
    .setLabel('Open dashboard')
    .setURL(`${links.dashboard}/${guildId}`)
    .setStyle(ButtonStyle.Link);

// MIGRATION: the legacy card's pair, mirroring the dashboard's migrate banner.
// Guild-scoped, so a factory for the same reason `dashboard` is. Deleted with
// the rest of the legacy UX at sunset.
export const migrateNow = (guildId: Snowflake) =>
  new ButtonBuilder()
    .setLabel('Migrate now')
    .setURL(`${links.dashboard}/${guildId}`)
    .setStyle(ButtonStyle.Link);

// MIGRATION: the banner's secondary link. Deleted at sunset.
export const learnWhatIsChanging = new ButtonBuilder()
  .setLabel('Learn what is changing')
  .setURL(links.migration)
  .setStyle(ButtonStyle.Link);

export const terms = new ButtonBuilder()
  .setLabel('Terms of Service')
  .setURL(links.terms)
  .setStyle(ButtonStyle.Link);

export const privacy = new ButtonBuilder()
  .setLabel('Privacy Policy')
  .setURL(links.privacy)
  .setStyle(ButtonStyle.Link);

export const Buttons = {
  website,
  getPremium,
  botInvite,
  supportServer,
  dashboard,
  migrateNow,
  learnWhatIsChanging,
  terms,
  privacy,
};
