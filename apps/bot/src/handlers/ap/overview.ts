import { config } from '@ap/config';
import { PUBLISH_PERMISSION_FLAGS, sortBySidebarOrder } from '@ap/utils';
import type { Subcommand } from '@sapphire/plugin-subcommands';
import {
  ActionRowBuilder,
  type ButtonBuilder,
  ChannelType,
  type ContainerBuilder,
  type Guild,
  type GuildMember,
  MessageFlags,
  type NewsChannel,
  type Snowflake,
} from 'discord.js';
import { Buttons } from 'lib/components/buttons.js';
import { emojis, legacySunsetTimestamp, notes } from 'lib/constants/index.js';
import { Services } from 'services/index.js';
import { logger } from 'utils/logger.js';
import { formatNotes } from 'utils/notes.js';
import { checkChannelPermissions } from 'utils/permissions.js';
import { buildReply, replyPayload } from 'utils/reply.js';

/**
 * Rows listed before the rest collapse into an overflow line. A hydrated app
 * emoji is ~32 characters, so a row costs ~73 of the message's 4000-character
 * Text Display ceiling; 25 rows + 10 paused + ~960 of fixed chrome lands ~3.1k.
 *
 * Broken channels sort first, so truncation only ever drops healthy rows — keep
 * that ordering if the sort is ever revisited.
 */
const MAX_LISTED_CHANNELS = 25;
const MAX_LISTED_PAUSED = 10;

/** One registered channel, resolved against the guild's channel cache. */
interface OverviewChannel {
  channelId: Snowflake;
  /** Bot has View + Send + Manage here. False also covers unresolvable channels. */
  canPublish: boolean;
}

/** Everything one render needs, resolved before any copy is built. */
interface OverviewState {
  guildId: Snowflake;
  /** MIGRATION: false = legacy guild (publishes every announcement channel). */
  migrated: boolean;
  /** Whether the guild is on Premium — decides which publish-delay note shows. */
  premium: boolean;
  /** Registered + serving channels, broken-first. Empty for a legacy guild. */
  channels: OverviewChannel[];
  /** Retained but over the free limit (ADR 0009), in sidebar order. */
  pausedChannelIds: Snowflake[];
  /**
   * Announcement channels that exist in the guild at all, from the bot's cache.
   * `null` = no channel cache to read (uncached interaction), i.e. unknown —
   * never render a count or a "you have none" claim off it.
   */
  announcementChannelCount: number | null;
  /** Of those, how many the bot can publish in. Only rendered for legacy guilds. */
  legacyPublishingCount: number;
  /** This command's own id, for rendering `</ap enable:id>` as a real mention. */
  apCommandId: Snowflake;
}

const resolveAnnouncementChannel = (
  guild: Guild,
  channelId: Snowflake
): NewsChannel | undefined => {
  const resolved = guild.channels.cache.get(channelId);
  return resolved?.type === ChannelType.GuildAnnouncement ? resolved : undefined;
};

/**
 * Every announcement channel in the guild, from the bot's own cache. Bots
 * receive the full channel list in GUILD_CREATE and `makeCache` never trims
 * `GuildChannelManager`, so this is complete without a REST call — the same
 * cache {@link resolveAnnouncementChannel} already trusts.
 */
const announcementChannelsIn = (guild: Guild | null): NewsChannel[] =>
  guild
    ? [...guild.channels.cache.values()].filter(
        (channel): channel is NewsChannel => channel.type === ChannelType.GuildAnnouncement
      )
    : [];

/**
 * Registered channel ids in Discord sidebar order, via the same shared sort the
 * dashboard's channel list is built with, so the two surfaces can't disagree.
 * A `null` guild means there is no channel cache to read (uncached interaction)
 * — the backend's order is then passed through untouched.
 */
const orderChannelIds = (channelIds: Snowflake[], guild: Guild | null): Snowflake[] => {
  if (!guild) return channelIds;

  const categoryPositions = new Map<Snowflake, number>();
  for (const c of guild.channels.cache.values()) {
    if (c.type === ChannelType.GuildCategory) categoryPositions.set(c.id, c.rawPosition);
  }

  return sortBySidebarOrder(
    channelIds,
    channelId => {
      // Unresolvable channels have no position — sink them past their group,
      // still tiebroken by id, so the order stays deterministic.
      const resolved = resolveAnnouncementChannel(guild, channelId);
      return {
        id: channelId,
        position: resolved?.rawPosition ?? Number.MAX_SAFE_INTEGER,
        parentId: resolved?.parentId ?? null,
      };
    },
    categoryPositions
  );
};

/**
 * Registered channels in the dashboard Overview's order: channels that can't
 * publish first, then the rest, sidebar order preserved within each group (a
 * stable sort over the pre-ordered ids — mirrors `statusRank` in
 * `apps/web/src/components/dashboard/channel-status.tsx`).
 *
 * `canPublish` is a cache-only permission check, so it matches the dashboard's
 * own okay/not-okay state. A channel counts as broken when the bot lacks any
 * publish permission or the channel can't be resolved at all (deleted, or no
 * ViewChannel so it never entered the cache). Without a resolvable bot member
 * every channel is reported publishing rather than mislabelling all of them.
 */
const buildOverviewChannels = (
  channelIds: Snowflake[],
  guild: Guild | null,
  botMember: GuildMember | null
): OverviewChannel[] =>
  orderChannelIds(channelIds, guild)
    .map(channelId => {
      const resolved = guild ? resolveAnnouncementChannel(guild, channelId) : undefined;
      const canPublish =
        !guild || !botMember
          ? true
          : !!resolved && checkChannelPermissions(botMember, resolved).hasAll;
      return { channelId, canPublish };
    })
    .sort((a, b) => Number(a.canPublish) - Number(b.canPublish));

const loadOverviewState = async (
  interaction: Subcommand.ChatInputCommandInteraction
): Promise<OverviewState | null> => {
  if (!interaction.inGuild()) return null;

  const guildChannels = await Services.Channel.getGuildChannels(interaction.guildId);
  if (!guildChannels) return null;

  const guild = interaction.guild;
  const botMember = (await guild?.members.me?.fetch()) ?? null;
  const announcementChannels = announcementChannelsIn(guild);

  return {
    guildId: interaction.guildId,
    migrated: guildChannels.migrated,
    premium: guildChannels.premium,
    channels: buildOverviewChannels(guildChannels.channelIds, guild, botMember),
    pausedChannelIds: orderChannelIds(guildChannels.pausedChannelIds, guild),
    announcementChannelCount: guild ? announcementChannels.length : null,
    // Same three permission bits as the dashboard's `canPublish !== false`.
    // No bot member resolvable → count them all rather than under-report.
    legacyPublishingCount: botMember
      ? announcementChannels.filter(channel => checkChannelPermissions(botMember, channel).hasAll)
          .length
      : announcementChannels.length,
    // This *is* an `/ap` invocation, so the interaction already carries the id
    // — no `application.commands.fetch()` round-trip needed to build a mention.
    apCommandId: interaction.commandId,
  };
};

/** Title line and the copy that follows the separator under it. */
interface OverviewHeader {
  title: string;
  body: string;
}

/**
 * Header for a guild with nothing serving, mirroring the dashboard's Welcome
 * state. The two variants exist because "enable a channel" is useless advice
 * to a server that has no announcement channels to enable. An unresolvable
 * guild counts as having them — never accuse a server of having none on
 * incomplete evidence.
 */
const renderGetStartedHeader = (state: OverviewState): OverviewHeader => ({
  title: `${emojis.botBrand} Ready to get started?`,
  body:
    state.announcementChannelCount === 0
      ? `This server has no announcement channels yet. Create one in Discord, then enable it with </ap enable:${state.apCommandId}>.`
      : 'Enable an announcement channel to start auto-publishing.',
});

/** Only shown when there is actually a channel to enable. */
const renderEnableHint = (state: OverviewState): string | null =>
  state.announcementChannelCount === 0
    ? null
    : `-# ${emojis.greenCircle} Use </ap enable:${state.apCommandId}> to enable auto-publishing in a channel.`;

/**
 * Mirrors the dashboard Overview's header precedence and copy: the outage owns
 * the headline when there is one, otherwise "All good" + the count.
 */
const renderHealthHeader = (state: OverviewState): OverviewHeader => {
  const blockedCount = state.channels.filter(c => !c.canPublish).length;
  const count = state.channels.length;

  return blockedCount > 0
    ? {
        title: `${emojis.crossmark} **${blockedCount}** channel${blockedCount !== 1 ? "s aren't" : " isn't"} publishing`,
        body: 'Grant the missing permissions — see the list below.',
      }
    : {
        title: `${emojis.checkmark} All good`,
        body: `Publishing in **${count}** channel${count !== 1 ? 's' : ''}.`,
      };
};

/**
 * One row per channel with its own status label, same as the Overview's cards.
 * Deliberately one joined string in a single Text Display: the list costs one
 * component whether the guild has 3 channels or 300, which is what keeps this
 * message far under the 40-component cap. Never give a row its own Section.
 */
const renderChannelList = (state: OverviewState): string => {
  const rows = state.channels
    .slice(0, MAX_LISTED_CHANNELS)
    .map(({ channelId, canPublish }) =>
      canPublish
        ? `${emojis.checkmark} <#${channelId}> — Publishing`
        : `${emojis.crossmark} <#${channelId}> — Not publishing`
    );

  const hidden = state.channels.length - rows.length;
  if (hidden > 0) {
    rows.push(
      `-# …and **${hidden}** more channel${hidden !== 1 ? 's' : ''}. See them all on the dashboard.`
    );
  }

  return rows.join('\n');
};

/**
 * The fix instructions the Overview puts behind its per-row "Fix" button (same
 * required permissions, same "resumes on its own" promise), inlined once
 * because Components V2 has no room for a button per row. No auto-disable
 * exists; setup is retained.
 */
const renderFixBlock = (state: OverviewState): string[] | null => {
  const blockedCount = state.channels.filter(c => !c.canPublish).length;
  if (blockedCount === 0) return null;

  return [
    `Auto Publisher is missing permissions in the ${emojis.crossmark}-flagged channel${blockedCount !== 1 ? 's' : ''} above, so ${blockedCount !== 1 ? "they won't" : "it won't"} publish. Grant ${blockedCount !== 1 ? 'them' : 'it'} these permissions and publishing resumes on its own:`,
    PUBLISH_PERMISSION_FLAGS.map(perm => `- \`${perm.name}\``).join('\n'),
  ];
};

/**
 * Paused channels are retained but over the free limit (ADR 0009) — surfaced
 * so the user understands why they went quiet, with the path back. Trails the
 * serving channels, matching the Overview's paused rows.
 *
 */
const renderPausedBlock = (state: OverviewState): string[] | null => {
  const total = state.pausedChannelIds.length;
  if (total === 0) return null;

  const rows = state.pausedChannelIds.slice(0, MAX_LISTED_PAUSED).map(id => `<#${id}> — Paused`);
  const hidden = total - rows.length;
  if (hidden > 0) rows.push(`-# …and **${hidden}** more.`);

  return [
    `${emojis.warning} **${total}** channel${total !== 1 ? 's are' : ' is'} paused — over the free limit of ${config.limits.freeChannelsPerGuild}. Upgrade to Premium to restore ${total !== 1 ? 'them' : 'it'}:`,
    rows.join('\n'),
  ];
};

const renderNotes = (premium: boolean): string =>
  formatNotes([
    notes.rateLimit,
    premium ? notes.publishDelayPremium : notes.publishDelayFree,
  ]).trimStart();

const addDashboardSection = (container: ContainerBuilder, guildId: Snowflake, text: string) =>
  container.addSectionComponents(section =>
    section
      .addTextDisplayComponents(textDisplay => textDisplay.setContent(text))
      .setButtonAccessory(Buttons.dashboard(guildId))
  );

/**
 * Nothing serving and nothing paused. Kept compact — the rate-limit and delay
 * notes are noise for a server that hasn't enabled anything yet.
 */
const buildEmptyContainer = (state: OverviewState): ContainerBuilder => {
  const header = renderGetStartedHeader(state);

  const container = buildReply({
    title: header.title,
    body: [header.body, renderEnableHint(state)],
  });

  container.addSeparatorComponents(separator => separator);

  return addDashboardSection(
    container,
    state.guildId,
    'Prefer a web UI? Manage this server there.'
  );
};

/**
 * MIGRATION: delete at sunset along with the rest of the legacy UX.
 *
 * Mirrors the dashboard's two legacy surfaces — the migrate banner in
 * `dashboard-banners.tsx` and `LegacyStatus` in `channel-status.tsx` — collapsed
 * into one card, since the bot has a single ephemeral reply where the dashboard
 * has a page. The banner's wording wins because it is the one that states the
 * consequence (publishing stops); the section's shorter sentence would repeat
 * its first clause verbatim. Still deliberately not itemized: the dashboard
 * withholds per-channel detail from legacy guilds to steer them to migrate.
 *
 * The sunset date is a `<t:…:D>` timestamp rather than a formatted string so
 * Discord renders it in each viewer's own locale and timezone.
 */
const buildLegacyContainer = (state: OverviewState): ContainerBuilder => {
  const total = state.announcementChannelCount;
  // Unknown count → no summary line at all. The header already says what the
  // guild does; an invented "0 of 0" would be worse than saying nothing.
  const summary =
    total === null
      ? null
      : total === 0
        ? "This server doesn't have any announcement channels."
        : `Publishing in **${state.legacyPublishingCount}** of **${total}** announcement channel${total !== 1 ? 's' : ''}.`;

  const container = buildReply({
    title: `${emojis.warning} This server runs in legacy mode`,
    body: `Every announcement channel is published automatically. Legacy mode will be discontinued, and the bot may stop publishing in this server once it is retired. Migrate now to keep publishing without interruption, choose exactly which channels publish, and unlock new features.\n### Legacy mode ends on <t:${legacySunsetTimestamp}:D>`,
  }).addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      Buttons.migrateNow(state.guildId),
      Buttons.learnWhatIsChanging
    )
  );

  if (summary) {
    container
      .addSeparatorComponents(separator => separator)
      .addTextDisplayComponents(textDisplay => textDisplay.setContent(summary));
  }

  container.addTextDisplayComponents(textDisplay =>
    textDisplay.setContent(renderNotes(state.premium))
  );

  container.addSeparatorComponents(separator => separator);

  return addDashboardSection(
    container,
    state.guildId,
    'Migrate from the dashboard — your channels keep publishing.'
  );
};

/**
 * The allowlist view. Also covers the "nothing serving but something paused"
 * case (a downgraded guild): the header falls back to Get started, but the
 * paused rows still render — they are the only explanation of where the
 * channels went.
 */
const buildOverviewContainer = (state: OverviewState): ContainerBuilder => {
  const hasChannels = state.channels.length > 0;

  const header = hasChannels ? renderHealthHeader(state) : renderGetStartedHeader(state);

  const container = buildReply({
    title: header.title,
    body: [header.body, hasChannels && renderChannelList(state)],
  });

  for (const block of [renderFixBlock(state), renderPausedBlock(state)]) {
    if (!block) continue;
    container.addSeparatorComponents(separator => separator);
    for (const content of block) {
      container.addTextDisplayComponents(textDisplay => textDisplay.setContent(content));
    }
  }

  container.addTextDisplayComponents(textDisplay =>
    textDisplay.setContent(renderNotes(state.premium))
  );

  container.addSeparatorComponents(separator => separator);

  return addDashboardSection(
    container,
    state.guildId,
    'Manage channels, filters and billing from the dashboard.'
  );
};

const buildErrorContainer = (): ContainerBuilder =>
  buildReply({
    title: `${emojis.crossmark} Failed to load this server's channels`,
    body: 'Something went wrong while retrieving auto-publishing channels. Please try again later.',
  });

export async function chatInputOverview(
  this: Subcommand,
  interaction: Subcommand.ChatInputCommandInteraction
) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  // This is handled by the GuildOnly precondition
  if (!interaction.inGuild()) return;

  try {
    const state = await loadOverviewState(interaction);
    if (!state) throw new Error('Failed to load guild channels');

    const container = !state.migrated
      ? buildLegacyContainer(state)
      : state.channels.length === 0 && state.pausedChannelIds.length === 0
        ? buildEmptyContainer(state)
        : buildOverviewContainer(state);

    return interaction.editReply(replyPayload(container));
  } catch (error) {
    logger.error(error, 'Failed to build auto-publishing overview');

    return interaction.editReply(replyPayload(buildErrorContainer()));
  }
}
