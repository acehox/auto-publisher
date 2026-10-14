import type { Subcommand } from '@sapphire/plugin-subcommands';
import { MessageFlags } from 'discord.js';
import { respawnClusters } from '#utils/process.js';

export async function chatInputRespawn(
  this: Subcommand,
  interaction: Subcommand.ChatInputCommandInteraction
) {
  await interaction.reply({ flags: [MessageFlags.Ephemeral], content: 'Respawning...' });
  respawnClusters();
}
