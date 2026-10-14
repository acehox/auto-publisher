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

  const guildsContent = [
    '### Guilds',
    `> Total: ${guildsCount}`,
    `> Migrated: ${backend?.migratedGuildsCount ?? 'N/A'}`,
    `> Subscribed: ${backend?.subscribedGuildsCount ?? 'N/A'}`,
  ].join('\n');

  const channelsContent = [
    '### Channels',
    `> Enabled: ${backend?.channelsCacheSize ?? 'N/A'}`,
    `> Rate-limited: ${proxy?.sublimitCount ?? 'N/A'}`,
    `> Blocked: ${proxy?.blockedCount ?? 'N/A'}`,
  ].join('\n');

  const restContent = [
    '### REST',
    `> Global remaining: ${proxy?.rest.globalRemaining ?? 'N/A'}`,
    `> Handlers: ${proxy?.rest.activeHandlers ?? 'N/A'} active / ${proxy?.rest.handlers ?? 'N/A'} total`,
    `> Crosspost queue: ${proxy?.queue.waiting ?? 'N/A'} waiting / ${proxy?.queue.active ?? 'N/A'} active`,
    `> Invalid requests: ${formatInvalidRequests(proxy?.rest.invalidRequests)}`,
  ].join('\n');

  const replyContainer = new ContainerBuilder()
    .addTextDisplayComponents(textDisplay => textDisplay.setContent(guildsContent))
    .addSeparatorComponents(separator => separator)
    .addTextDisplayComponents(textDisplay => textDisplay.setContent(channelsContent))
    .addSeparatorComponents(separator => separator)
    .addTextDisplayComponents(textDisplay => textDisplay.setContent(restContent));

  return interaction.editReply({
    flags: [MessageFlags.IsComponentsV2],
    components: [replyContainer],
  });
}
