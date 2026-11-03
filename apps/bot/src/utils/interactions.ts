import { Copy } from '@ap/copy';
import {
  ActionRowBuilder,
  type BaseInteraction,
  type ButtonBuilder,
  type ChatInputCommandInteraction,
  type GuildChannel,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';
import { Buttons } from '../lib/components/buttons.js';
import { emojis } from '../lib/constants/index.js';
import { Services } from '../services/index.js';
import { buildReply, replyPayload } from './reply.js';

/**
 * Premium gate for a guild-scoped command. One bot serves both plans, so the
 * answer comes from the backend per guild — nothing about this process implies
 * it. Replies with the upgrade message and returns true when the caller should
 * stop.
 *
 * A failed read is treated as NOT Premium: the alternative is opening a control
 * whose every write the backend then rejects with 403.
 */
export async function handlePremiumCheck(
  interaction: ChatInputCommandInteraction,
  guildId: string,
  pitch = Copy.filters.locked.pitch
): Promise<boolean> {
  const guildChannels = await Services.Channel.getGuildChannels(guildId);
  if (guildChannels?.premium) return false;

  // Mirrors the dashboard's locked Filters card: the eyebrow names the gate, the
  // sentence says what the feature does, and the CTA names its destination
  // rather than promising the upgrade itself.
  await interaction.editReply({
    flags: [MessageFlags.IsComponentsV2],
    components: [
      buildReply({ title: `${emojis.warning} ${Copy.filters.locked.eyebrow}`, body: pitch }),
      new ActionRowBuilder<ButtonBuilder>().addComponents(Buttons.getPremium),
    ],
  });

  return true;
}

/**
 * The only member-permission rule for a command that names a channel. The
 * interaction carries the member's permissions in the channel the command was
 * typed in, so checking those let Manage Channels on any one channel (a ticket or
 * a temporary voice channel) reach every announcement channel in the server, and
 * refused a member who manages only the target. View Channel is checked too:
 * Discord grants nothing in a channel the member cannot view, and discord.js does
 * not apply that rule.
 */
export const canManageChannel = (interaction: BaseInteraction, channel: GuildChannel): boolean =>
  interaction.inCachedGuild() &&
  channel
    .permissionsFor(interaction.member)
    .has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels]);

export const manageChannelRequired = (channelId: string): string =>
  `To change auto-publishing in <#${channelId}>, you need the Manage Channels permission in that channel.`;

/** Replies and returns true when the member cannot manage the target channel. */
export async function handleManageChannelCheck(
  interaction: ChatInputCommandInteraction,
  channel: GuildChannel
): Promise<boolean> {
  if (canManageChannel(interaction, channel)) return false;

  await interaction.editReply(
    replyPayload(
      buildReply({
        title: `${emojis.crossmark} Missing permission`,
        body: manageChannelRequired(channel.id),
      })
    )
  );

  return true;
}
