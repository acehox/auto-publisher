import { config } from '@ap/config';
import { Copy } from '@ap/copy';
import { sortBySidebarOrder } from '@ap/utils';
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
  type NonThreadGuildBasedChannel,
  type Snowflake,
} from 'discord.js';
import { Buttons } from '#lib/components/buttons.js';
import { emojis, legacySunsetTimestamp, notes } from '#lib/constants/index.js';
import type { PausedChannel } from '#services/channel.js';
import { Services } from '#services/index.js';
import { logger } from '#utils/logger.js';
import { formatNotes } from '#utils/notes.js';
import {
  checkChannelPermissions,
  renderDiscordSteps,
  renderPermissionSteps,
} from '#utils/permissions.js';
import { buildReply, replyPayload } from '#utils/reply.js';

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
  /** Converted to a text channel since it was registered. */
  converted: boolean;
}

/** Everything one render needs, resolved before any copy is built. */
interface OverviewState {
  guildId: Snowflake;
  /** MIGRATION: false = legacy guild (publishes every announcement channel). */
  migrated: boolean;
  /** Whether the guild is on Premium — decides which hourly-limit note shows. */
  premium: boolean;
  /** Registered + serving channels, broken-first. Empty for a legacy guild. */
  channels: OverviewChannel[];
  /** Retained but not serving, in sidebar order, with filter counts. */
  pausedChannels: PausedChannel[];
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

/** Any type: a registered channel may have been converted to a text channel since. */
const resolveRegisteredChannel = (
  guild: Guild,
  channelId: Snowflake
): NonThreadGuildBasedChannel | undefined => {
  const resolved = guild.channels.cache.get(channelId);
  return resolved && !resolved.isThread() ? resolved : undefined;
};

/**
 * Every announcement channel in the guild, from the bot's own cache. Bots
 * receive the full channel list in GUILD_CREATE and `makeCache` never trims
 * `GuildChannelManager`, so this is complete without a REST call — the same
 * cache {@link resolveRegisteredChannel} already trusts.
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
      const resolved = resolveRegisteredChannel(guild, channelId);
      return {
        id: channelId,
        position: resolved?.rawPosition ?? Number.MAX_SAFE_INTEGER,
        parentId: resolved?.parentId ?? null,
      };
    },
    categoryPositions
  );
};

/** {@link orderChannelIds} for paused rows, keeping each one's filter count. */
const orderPausedChannels = (paused: PausedChannel[], guild: Guild | null): PausedChannel[] => {
  const byId = new Map(paused.map(entry => [entry.channelId, entry]));
  return orderChannelIds([...byId.keys()], guild).flatMap(id => {
    const entry = byId.get(id);
    return entry ? [entry] : [];
  });
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
 * ViewChannel so it never entered the cache), or it was converted to a text
 * channel. Without a resolvable bot member every announcement channel is reported
 * publishing rather than mislabelling all of them.
 */
const buildOverviewChannels = (
  channelIds: Snowflake[],
  guild: Guild | null,
  botMember: GuildMember | null
): OverviewChannel[] =>
  orderChannelIds(channelIds, guild)
    .map(channelId => {
      const registered = guild ? resolveRegisteredChannel(guild, channelId) : undefined;
      const converted = !!registered && registered.type !== ChannelType.GuildAnnouncement;
      const resolved = registered?.type === ChannelType.GuildAnnouncement ? registered : undefined;
      const canPublish = converted
        ? false
        : !guild || !botMember
          ? true
          : !!resolved && checkChannelPermissions(botMember, resolved).hasAll;
      return { channelId, canPublish, converted };
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
    pausedChannels: orderPausedChannels(guildChannels.pausedChannels, guild),
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
  /** Null when the title says it all — the healthy header is one sentence. */
  body: string | null;
}

/**
 * Header for a guild with nothing serving, mirroring the dashboard's Welcome
 * state. The two variants exist because "enable a channel" is useless advice
 * to a server that has no announcement channels to enable. An unresolvable
 * guild counts as having them — never accuse a server of having none on
 * incomplete evidence.
 */
const renderGetStartedHeader = (state: OverviewState): OverviewHeader =>
  state.announcementChannelCount === 0
    ? {
        title: `${emojis.botBrand} ${Copy.channels.empty.noAnnouncement}`,
        body: `${Copy.channels.empty.noAnnouncementLead}. Then use </ap enable:${state.apCommandId}> to enable auto-publishing in it.`,
      }
    : {
        title: `${emojis.botBrand} ${Copy.channels.empty.getStarted}`,
        body: Copy.channels.empty.getStartedBody,
      };

/** Only shown when there is actually a channel to enable. */
const renderEnableHint = (state: OverviewState): string | null =>
  state.announcementChannelCount === 0
    ? null
    : `-# ${emojis.greenCircle} Use </ap enable:${state.apCommandId}> to enable auto-publishing in a channel.`;

/** Channels that cannot publish, split by the fix each one needs. */
const countBlocked = (state: OverviewState): { permissions: number; converted: number } => {
  const blocked = state.channels.filter(c => !c.canPublish);
  const converted = blocked.filter(c => c.converted).length;
  return { permissions: blocked.length - converted, converted };
};

/**
 * Mirrors the dashboard Overview's header precedence and copy: the outage owns
 * the headline when there is one, otherwise the auto-publishing count.
 */
const renderHealthHeader = (state: OverviewState): OverviewHeader => {
  const { permissions, converted } = countBlocked(state);
  const blockedCount = permissions + converted;
  const count = state.channels.length;

  return blockedCount > 0
    ? {
        title: `${emojis.crossmark} ${Copy.channels.health.notPublishing(blockedCount)}`,
        body: [
          permissions > 0 && Copy.permissions.missingSummary(permissions),
          converted > 0 && Copy.channels.notAnnouncement.summary(converted),
        ]
          .filter(Boolean)
          .join(' '),
      }
    : { title: `${emojis.checkmark} ${Copy.channels.health.allGood(count)}`, body: null };
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
    .map(({ channelId, canPublish, converted }) =>
      canPublish
        ? `${emojis.checkmark} <#${channelId}> — ${Copy.channels.status.publishing}`
        : `${emojis.crossmark} <#${channelId}> — ${converted ? Copy.channels.status.notAnnouncement : Copy.channels.status.missingPermissions}`
    );

  const hidden = state.channels.length - rows.length;
  if (hidden > 0) {
    rows.push(`-# The dashboard lists **${hidden}** more channel${hidden !== 1 ? 's' : ''}.`);
  }

  return rows.join('\n');
};

/**
 * The dashboard Fix dialog's remedies, inlined once because Components V2 has
 * no room for a button per row. Setup is retained, so either remedy restores
 * auto-publishing with the next message.
 */
const renderFixBlock = (state: OverviewState): string[] | null => {
  const { permissions, converted } = countBlocked(state);
  if (permissions + converted === 0) return null;

  const block: string[] = [];
  if (permissions > 0) {
    block.push(
      permissions === 1
        ? 'To fix the channel that is missing permissions, follow these steps:'
        : 'To fix the channels that are missing permissions, follow these steps in each one:',
      renderPermissionSteps()
    );
  }
  if (converted > 0) {
    block.push(
      converted === 1
        ? 'To fix the channel that is not an announcement channel, follow these steps:'
        : 'To fix the channels that are not announcement channels, follow these steps in each one:',
      renderDiscordSteps(Copy.channels.notAnnouncement.steps)
    );
  }
  return block;
};

/**
 * Paused channels are retained but not serving — surfaced so the user
 * understands why they went quiet, with the path back. Trails the serving
 * channels, matching the Overview's paused rows.
 *
 * Stated by CAUSE, like the dashboard's `PausedStrip`: a channel paused for
 * carrying a Premium-only filter is not over the cap, and quoting the cap to a
 * guild under it was simply wrong. Every paused channel holding a filter is the
 * only case the filters sentence applies to — a mixed set falls back to the cap
 * reason, which is then the reason at least one of them is paused.
 */
const renderPausedBlock = (state: OverviewState): string[] | null => {
  const total = state.pausedChannels.length;
  if (total === 0) return null;

  const rows = state.pausedChannels
    .slice(0, MAX_LISTED_PAUSED)
    .map(({ channelId }) => `<#${channelId}> — ${Copy.channels.status.paused}`);
  const hidden = total - rows.length;
  if (hidden > 0) {
    rows.push(
      `-# The dashboard lists **${hidden}** more paused channel${hidden !== 1 ? 's' : ''}.`
    );
  }

  const forFiltersOnly = state.pausedChannels.every(entry => entry.filterCount > 0);
  const reason = forFiltersOnly
    ? Copy.channels.paused.filtersReason(total)
    : Copy.channels.paused.capReason(config.limits.freeChannelsPerGuild);

  return [`${emojis.warning} ${Copy.channels.paused.count(total)} ${reason}`, rows.join('\n')];
};

const renderNotes = (premium: boolean): string =>
  formatNotes([premium ? notes.overLimitPremium : notes.overLimitFree]).trimStart();

const addDashboardSection = (container: ContainerBuilder, guildId: Snowflake, text: string) =>
  container.addSectionComponents(section =>
    section
      .addTextDisplayComponents(textDisplay => textDisplay.setContent(text))
      .setButtonAccessory(Buttons.dashboard(guildId))
  );

/**
 * Nothing serving and nothing paused. Kept compact — the hourly-limit note is
 * noise for a server that hasn't enabled anything yet.
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
    'Prefer a visual interface? Manage your channels on the dashboard.'
  );
};

/**
 * MIGRATION: delete at sunset along with the rest of the legacy UX.
 *
 * Mirrors the dashboard's two legacy surfaces — `LegacyCard` in
 * `guild-notices.tsx` and `LegacyStatus` in `channel-status.tsx` — collapsed
 * into one card, since the bot has a single ephemeral reply where the dashboard
 * has a page. The card's one sentence is shared verbatim through `@ap/copy`.
 * Still deliberately not itemized: the dashboard withholds per-channel detail
 * from legacy guilds to steer them to migrate.
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
        ? `${Copy.channels.empty.noAnnouncement}.`
        : `Auto-publishing in **${state.legacyPublishingCount}** of **${total}** announcement channel${total !== 1 ? 's' : ''}.`;

  const container = buildReply({
    title: `${emojis.warning} ${Copy.legacy.title}`,
    body: Copy.legacy.body(`<t:${legacySunsetTimestamp}:D>`),
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
    'Migrate on the dashboard and choose which channels keep auto-publishing.'
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
    'You can also manage these channels on the dashboard.'
  );
};

const buildErrorContainer = (): ContainerBuilder =>
  buildReply({
    title: `${emojis.crossmark} Failed to load this server's channels`,
    body: 'Try again in a few minutes.',
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
      : state.channels.length === 0 && state.pausedChannels.length === 0
        ? buildEmptyContainer(state)
        : buildOverviewContainer(state);

    return interaction.editReply(replyPayload(container));
  } catch (error) {
    logger.error(error, 'Failed to build auto-publishing overview');

    return interaction.editReply(replyPayload(buildErrorContainer()));
  }
}
