import { Copy } from '@ap/copy';
import {
  ActionRowBuilder,
  type ButtonBuilder,
  type ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js';
import { Buttons } from '../lib/components/buttons.js';
import { emojis } from '../lib/constants/index.js';
import { Services } from '../services/index.js';
import { buildReply } from './reply.js';

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
