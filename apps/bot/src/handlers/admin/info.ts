import type { Subcommand } from '@sapphire/plugin-subcommands';
import { ContainerBuilder, MessageFlags } from 'discord.js';
import { client } from 'lib/shard.js';
import { Services } from 'services/index.js';
import type { ProxyInfo } from 'services/info.js';

const formatInvalidRequests = (
  invalidRequests: ProxyInfo['rest']['invalidRequests'] | undefined
) => {
  if (!invalidRequests) return 'N/A';
  if (invalidRequests.count === 0) return '0';
  const resetsAt = Math.floor((Date.now() + invalidRequests.expiresInMs) / 1_000);
  return `${invalidRequests.count} (resets <t:${resetsAt}:R>)`;
};

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
    `> Migrated guilds: ${backend?.migratedGuildsCount ?? 'N/A'}`,
    `> Subscribed guilds: ${backend?.subscribedGuildsCount ?? 'N/A'}`,
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
    `> Invalid requests: ${formatInvalidRequests(proxy?.rest.invalidRequests)}`,
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
