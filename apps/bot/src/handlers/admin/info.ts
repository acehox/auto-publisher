import type { Subcommand } from '@sapphire/plugin-subcommands';
import { ContainerBuilder, MessageFlags } from 'discord.js';
import { client } from 'lib/shard.js';
import { Services } from 'services/index.js';

export async function chatInputInfo(
  this: Subcommand,
  interaction: Subcommand.ChatInputCommandInteraction
) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const { proxy, backend } = await Services.Info.get();
  const guildsCount = await client.cluster
    .broadcastEval('this.guilds.cache.size')
    .then((results: number[]) => results.reduce((p: number, n: number) => p + n));

  const botContent = [
    '### Overview:',
    `> Guilds: ${guildsCount}`,
    `> Enabled channels: ${backend?.channelsCacheSize ?? 'N/A'}`,
    `> Rate-limited channels: ${proxy?.sublimitCount ?? 'N/A'}`,
    `> Blocked channels: ${proxy?.blockedCount ?? 'N/A'}`,
  ].join('\n');

  const queueContent = [
    '### Crosspost queue:',
    `> Waiting: ${proxy?.queue.waiting ?? 'N/A'}`,
    `> Active: ${proxy?.queue.active ?? 'N/A'}`,
  ].join('\n');

  const restContent = [
    '### REST:',
    `> Global remaining: ${proxy?.rest.globalRemaining ?? 'N/A'}`,
    `> Handlers: ${proxy?.rest.activeHandlers ?? 'N/A'} active / ${proxy?.rest.handlers ?? 'N/A'} total`,
    `> Hashes: ${proxy?.rest.hashes ?? 'N/A'}`,
    `> Invalid requests: ${proxy?.rest.invalidRequests.count ?? 'N/A'} (resets <t:${
      proxy
        ? Math.floor(Date.now() / 1_000 + proxy.rest.invalidRequests.expiresInMs / 1_000)
        : 'N/A'
    }:R>)`,
  ].join('\n');

  const replyContainer = new ContainerBuilder()
    .addTextDisplayComponents(textDisplay => textDisplay.setContent(botContent))
    .addSeparatorComponents(separator => separator)
    .addTextDisplayComponents(textDisplay => textDisplay.setContent(queueContent))
    .addSeparatorComponents(separator => separator)
    .addTextDisplayComponents(textDisplay => textDisplay.setContent(restContent));

  return interaction.editReply({
    flags: [MessageFlags.IsComponentsV2],
    components: [replyContainer],
  });
}
