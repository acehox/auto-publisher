import { missingPublishPermissions } from '@ap/utils';
import type { Snowflake } from 'discord-api-types/globals';
import {
  type APIChannel,
  type APIGuildMember,
  type APIRole,
  OverwriteType,
  PermissionFlagsBits,
  Routes,
} from 'discord-api-types/v10';
import { Discord } from './discord.js';

/** Publish capability in one channel: can the bot crosspost, and if not, what's missing. */
export type PublishEntry = { canPublish: boolean; missing: string[] };

/**
 * Effective channel permissions for a member: guild-level role union, then
 * @everyone / role / member overwrites (Administrator bypasses everything).
 */
const computeChannelPermissions = (
  guildId: Snowflake,
  member: APIGuildMember,
  roles: APIRole[],
  channel: APIChannel
): bigint => {
  const roleMap = new Map(roles.map(r => [r.id, r]));

  let base = BigInt(roleMap.get(guildId)?.permissions ?? 0);
  for (const roleId of member.roles) {
    base |= BigInt(roleMap.get(roleId)?.permissions ?? 0);
  }

  if ((base & PermissionFlagsBits.Administrator) === PermissionFlagsBits.Administrator) {
    return ~0n;
  }

  const overwrites =
    'permission_overwrites' in channel ? (channel.permission_overwrites ?? []) : [];

  let permissions = base;

  const everyoneOverwrite = overwrites.find(o => o.type === OverwriteType.Role && o.id === guildId);
  if (everyoneOverwrite) {
    permissions &= ~BigInt(everyoneOverwrite.deny);
    permissions |= BigInt(everyoneOverwrite.allow);
  }

  let roleAllow = 0n;
  let roleDeny = 0n;
  for (const overwrite of overwrites) {
    if (overwrite.type === OverwriteType.Role && member.roles.includes(overwrite.id)) {
      roleAllow |= BigInt(overwrite.allow);
      roleDeny |= BigInt(overwrite.deny);
    }
  }
  permissions &= ~roleDeny;
  permissions |= roleAllow;

  const memberOverwrite = overwrites.find(
    o => o.type === OverwriteType.Member && o.id === member.user.id
  );
  if (memberOverwrite) {
    permissions &= ~BigInt(memberOverwrite.deny);
    permissions |= BigInt(memberOverwrite.allow);
  }

  return permissions;
};

/**
 * `{channelId → {canPublish, missing}}` for the given channels, evaluated via
 * the proxy (two REST calls: guild roles + bot member). This is the REST
 * fallback for the bot-pushed publish-state cache (ADR 0008) — the bot normally
 * supplies this data for free off its gateway cache.
 */
const getPublishMap = async (
  guildId: Snowflake,
  channels: APIChannel[]
): Promise<Record<string, PublishEntry>> => {
  const [roles, member] = await Promise.all([
    Discord.cachedGet<APIRole[]>(Routes.guildRoles(guildId)),
    Discord.getBotUserId().then(id =>
      Discord.cachedGet<APIGuildMember>(Routes.guildMember(guildId, id))
    ),
  ]);

  const map: Record<string, PublishEntry> = {};
  for (const channel of channels) {
    const permissions = computeChannelPermissions(guildId, member, roles, channel);
    const missing = missingPublishPermissions(permissions);
    map[channel.id] = { canPublish: missing.length === 0, missing };
  }

  return map;
};

export const BotPermissions = {
  getPublishMap,
};
