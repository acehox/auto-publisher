import type { Snowflake } from 'discord-api-types/globals';
import { type APIChannel, ChannelType } from 'discord-api-types/v10';
import { Discord } from '../discord.js';
import { Guilds } from '../guilds.js';
import { PublishState } from '../publishState.js';

/**
 * Discord's private-channel obfuscation OMITS a channel the bot cannot view from
 * `GET /guilds/{id}/channels` entirely — no row, no flag. So the dashboard list is
 * the union of REST with our own rows: both are durable, no cache decides
 * membership. Without it a registered channel would silently vanish from the
 * payload at the moment ViewChannel was revoked — the commonest way one breaks —
 * taking its Fix dialog with it while row, filters and pause state stayed in
 * Postgres. Publishing is unaffected either way (no MESSAGE_CREATE arrives for an
 * unviewable channel).
 *
 * A registered channel converted to a text channel is listed with its real
 * `type`, which is how clients tell it from a hidden one. Its row keeps its
 * free-plan slot: freeing it would let convert → enable another → convert back
 * exceed the cap.
 *
 * `Channels.add` / `Guilds.migrate` stay REST-only: a channel Discord won't tell
 * us about is one nobody should be able to newly register. Tradeoff: a hidden
 * channel nobody enabled is undiscoverable.
 */
export const getChannelsForDashboard = async (guildId: Snowflake) => {
  const [records, guildChannels] = await Promise.all([
    Guilds.getChannelRecords(guildId),
    Discord.getGuildChannels(guildId),
  ]);

  const recordMap = new Map(records.map(ch => [ch.channelId, ch]));

  const isAnnouncement = (c: APIChannel) => c.type === ChannelType.GuildAnnouncement;
  const restChannels = guildChannels.filter(c => isAnnouncement(c) || recordMap.has(c.id));

  // Other types can't publish: nothing to look up or write back.
  const publishMap = await PublishState.getMap(guildId, restChannels.filter(isAnnouncement));

  // Serving = a row exists AND is not paused. A paused row is a
  // disabled channel with retained config → surfaced via hasSavedSetup.
  const listed = restChannels.map(c => {
    const record = recordMap.get(c.id);
    const publish = publishMap[c.id];
    return {
      channelId: c.id,
      name: c.name ?? null,
      type: c.type,
      enabled: !!record && !record.pausedAt,
      filters: record?.filters ?? [],
      filterMode: record?.filterMode ?? 'all',
      canPublish: publish?.canPublish ?? false,
      ...(record?.pausedAt ? { hasSavedSetup: true } : {}),
    };
  });

  const listedIds = new Set(restChannels.map(c => c.id));

  // Appended, not ordered: a hidden channel carries no position to honour.
  const hidden = records
    .filter(record => !listedIds.has(record.channelId))
    .map(record => ({
      channelId: record.channelId,
      name: null,
      type: ChannelType.GuildAnnouncement,
      enabled: !record.pausedAt,
      filters: record.filters ?? [],
      filterMode: record.filterMode ?? 'all',
      // Absent from REST *is* the proof it can't publish.
      canPublish: false,
      ...(record.pausedAt ? { hasSavedSetup: true } : {}),
    }));

  return [...listed, ...hidden];
};
