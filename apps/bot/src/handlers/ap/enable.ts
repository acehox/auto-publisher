import { config } from '@ap/config';
import type { Subcommand } from '@sapphire/plugin-subcommands';
import { type ChannelType, ContainerBuilder, MessageFlags } from 'discord.js';
import { emojis, links, notes } from 'lib/constants/index.js';
import { Services } from 'services/index.js';
import { logger } from 'utils/logger.js';
import { formatNotes } from 'utils/notes.js';
import { checkChannelPermissions } from 'utils/permissions.js';

export async function chatInputEnable(
  this: Subcommand,
  interaction: Subcommand.ChatInputCommandInteraction
) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  // This is handled by the GuildOnly precondition
  if (!interaction.inGuild()) return;

  // Get option values
  const channel = interaction.options.getChannel<ChannelType.GuildAnnouncement>('channel', true);

  const botMember = await interaction.guild?.members.me?.fetch();
  if (!botMember) {
    logger.error('Failed to fetch bot member information');

    const errorContainer = new ContainerBuilder().addTextDisplayComponents(textDisplay =>
      textDisplay.setContent(
        `${emojis.crossmark} Failed to enable auto-publishing in <#${channel.id}>. Please try again later.`
      )
    );

    return interaction.editReply({
      flags: [MessageFlags.IsComponentsV2],
      components: [errorContainer],
    });
  }

  const permissionCheck = checkChannelPermissions(botMember, channel);

  if (!permissionCheck.hasAll) {
    const title = `### ${emojis.warning} Missing Permissions`;
    const content = `Bot requires the following permissions in <#${channel.id}> channel to enable auto-publishing:`;
    const permissionsList = permissionCheck.permissions
      .map(perm => `- ${perm.has ? emojis.checkmark : emojis.crossmark} \`${perm.name}\``)
      .join('\n');
    const retryContent = 'Please review the permissions and try enabling auto-publishing again.';

    const errorContainer = new ContainerBuilder()
      .addTextDisplayComponents(textDisplay => textDisplay.setContent(title))
      .addSeparatorComponents(separator => separator)
      .addTextDisplayComponents(textDisplay => textDisplay.setContent(content))
      .addTextDisplayComponents(textDisplay => textDisplay.setContent(permissionsList))
      .addSeparatorComponents(separator => separator)
      .addTextDisplayComponents(textDisplay => textDisplay.setContent(retryContent));

    await interaction.editReply({
      flags: [MessageFlags.IsComponentsV2],
      components: [errorContainer],
    });
    return;
  }

  try {
    const response = await Services.Channel.enable(interaction.guildId, channel.id);

    if (!response.ok) {
      if (response.status === 409) {
        const infoContainer = new ContainerBuilder().addTextDisplayComponents(textDisplay =>
          textDisplay.setContent(
            `${emojis.info} Auto-publishing is already enabled in <#${channel.id}> channel.`
          )
        );

        return interaction.editReply({
          flags: [MessageFlags.IsComponentsV2],
          components: [infoContainer],
        });
      }

      if (response.status === 400) {
        // Both 400s from this route carry a `code`; NOT_ANNOUNCEMENT_CHANNEL
        // must be branched on BEFORE the limit copy, or a demoted channel
        // renders as "you hit your channel limit".
        const code = await response
          .clone()
          .json()
          .then(body => (body as { code?: string })?.code)
          .catch(() => undefined);
        // Reachable despite `channel_types` on the option — that only restricts
        // the picker, so the backend re-checks server-side.
        if (code === 'NOT_ANNOUNCEMENT_CHANNEL') {
          const typeContainer = new ContainerBuilder().addTextDisplayComponents(textDisplay =>
            textDisplay.setContent(
              `${emojis.crossmark} <#${channel.id}> isn't an announcement channel. Change its type in Discord's channel settings, then try again.`
            )
          );

          return interaction.editReply({
            flags: [MessageFlags.IsComponentsV2],
            components: [typeContainer],
          });
        }

        // Always the free cap: a Premium guild is uncapped, so this rejection
        // can only ever be a free one (`LIMIT_FREE` is the sole reason code).
        const limitContainer = new ContainerBuilder().addTextDisplayComponents(textDisplay =>
          textDisplay.setContent(
            `${emojis.crossmark} You have reached the maximum number of channels (${config.limits.freeChannelsPerGuild}) for auto-publishing.\n\n` +
              `✨ Upgrade to **Premium** at [${links.hostname}](<${links.website}>) to unlock unlimited channels and extra features!`
          )
        );

        return interaction.editReply({
          flags: [MessageFlags.IsComponentsV2],
          components: [limitContainer],
        });
      }

      logger.error(`Failed to enable auto-publishing: ${response.status} ${response.statusText}`);

      const errorContainer = new ContainerBuilder().addTextDisplayComponents(textDisplay =>
        textDisplay.setContent(
          `${emojis.crossmark} Failed to enable auto-publishing in <#${channel.id}>. Please try again later.`
        )
      );

      return interaction.editReply({
        flags: [MessageFlags.IsComponentsV2],
        components: [errorContainer],
      });
    }

    // Seed publish-state for this channel so the dashboard reflects it at once
    // (ADR 0008) — perms were just verified above, so this is a free push.
    void Services.Permissions.syncChannels(botMember.guild, [channel], {
      full: false,
      clearBlocked: false,
    });

    // The guild's plan decides which delay note to show. One bot serves both,
    // so this is a backend read, not a process constant. A failed read falls
    // back to the free note — over-promising speed is the worse error.
    const premium =
      (await Services.Channel.getGuildChannels(interaction.guildId))?.premium ?? false;

    const successMessage =
      `${emojis.checkmark} Auto-publishing has been enabled in <#${channel.id}> channel!` +
      formatNotes([notes.rateLimit, premium ? notes.publishDelayPremium : notes.publishDelayFree]);

    const successContainer = new ContainerBuilder().addTextDisplayComponents(textDisplay =>
      textDisplay.setContent(successMessage)
    );

    return interaction.editReply({
      flags: [MessageFlags.IsComponentsV2],
      components: [successContainer],
    });
  } catch (error) {
    logger.error(error, 'Failed to enable auto-publishing');

    const errorContainer = new ContainerBuilder().addTextDisplayComponents(textDisplay =>
      textDisplay.setContent(
        `${emojis.crossmark} Failed to enable auto-publishing in <#${channel.id}>. Please try again later.`
      )
    );

    return interaction.editReply({
      flags: [MessageFlags.IsComponentsV2],
      components: [errorContainer],
    });
  }
}
