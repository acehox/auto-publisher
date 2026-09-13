import { capitalize } from '@ap/utils';
import type { ChatInputCommandInteraction } from 'discord.js';
import { emojis, links } from '../lib/constants/index.js';
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
  featureName = 'this feature'
): Promise<boolean> {
  const guildChannels = await Services.Channel.getGuildChannels(guildId);
  if (guildChannels?.premium) return false;

  await interaction.editReply(
    replyPayload(
      buildReply({
        title: `${emojis.warning} ${capitalize(featureName)} is a Premium feature`,
        body: `Upgrade at [${links.hostname}](<${links.website}>) to unlock ${featureName} and the rest of Premium!`,
      })
    )
  );

  return true;
}
