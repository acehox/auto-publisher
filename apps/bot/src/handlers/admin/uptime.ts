import { getDiscordFormat } from '@ap/utils';
import type { Subcommand } from '@sapphire/plugin-subcommands';
import { MessageFlags } from 'discord.js';
import { client } from '#lib/shard.js';

export async function chatInputUptime(
  this: Subcommand,
  interaction: Subcommand.ChatInputCommandInteraction
) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const uptimes = await client.cluster.broadcastEval(c => c.uptime);
  const formattedUptimes = uptimes.map(
    (uptime, index) =>
      `Cluster ${index + 1} - ${uptime ? `<t:${getDiscordFormat(Date.now() - uptime)}:f>` : 'unknown'}`
  );

  interaction.editReply(formattedUptimes.join('\n'));
}
