import type { Subcommand } from '@sapphire/plugin-subcommands';
import { MessageFlags } from 'discord.js';
import { shutdown } from '#utils/process.js';

export async function chatInputShutdown(
  this: Subcommand,
  interaction: Subcommand.ChatInputCommandInteraction
) {
  await interaction.reply({ flags: [MessageFlags.Ephemeral], content: 'Shutting down...' });
  shutdown();
}
