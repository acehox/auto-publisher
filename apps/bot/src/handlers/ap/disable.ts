import type { Subcommand } from '@sapphire/plugin-subcommands';
import {
  ActionRowBuilder,
  ButtonBuilder as Button,
  type ButtonBuilder,
  ButtonStyle,
  type ChannelType,
  ComponentType,
  ContainerBuilder,
  MessageFlags,
} from 'discord.js';
import { emojis, notes } from 'lib/constants/index.js';
import { Services } from 'services/index.js';
import { logger } from 'utils/logger.js';
import { formatNotes } from 'utils/notes.js';

export async function chatInputDisable(
  this: Subcommand,
  interaction: Subcommand.ChatInputCommandInteraction
) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  // This is handled by the GuildOnly precondition
  if (!interaction.inGuild()) return;

  // Get option values
  const channel = interaction.options.getChannel<ChannelType.GuildAnnouncement>('channel', true);

  try {
    const channelStatus = await Services.Channel.getStatus(channel.id);

    if (!channelStatus?.enabled) {
      const infoContainer = new ContainerBuilder().addTextDisplayComponents(textDisplay =>
        textDisplay.setContent(
          `${emojis.crossmark} Auto-publishing is not enabled in <#${channel.id}> channel.`
        )
      );

      return interaction.editReply({
        flags: [MessageFlags.IsComponentsV2],
        components: [infoContainer],
      });
    }

    {
      const filters = channelStatus.filters;
      if (filters && filters.length > 0) {
        const warningContainer = new ContainerBuilder().addTextDisplayComponents(textDisplay =>
          textDisplay.setContent(
            `### ${emojis.warning} Disabling auto-publishing will also remove all filters set for <#${channel.id}> channel.\n\nIf you want to temporarily disable auto-publishing without removing filters, we suggest disabling \`View Channel\` permission instead.` +
              formatNotes([notes.permissionsExtendedDisable])
          )
        );

        const confirmButton = new Button()
          .setCustomId('confirm_disable')
          .setLabel('Disable Anyway')
          .setStyle(ButtonStyle.Danger);

        const cancelButton = new Button()
          .setCustomId('cancel_disable')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary);

        const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          confirmButton,
          cancelButton
        );

        const response = await interaction.editReply({
          flags: [MessageFlags.IsComponentsV2],
          components: [warningContainer, buttonRow],
        });

        const collectorFilter = (i: { user: { id: string } }) => i.user.id === interaction.user.id;

        try {
          const confirmation = await response.awaitMessageComponent({
            filter: collectorFilter,
            componentType: ComponentType.Button,
            time: 60_000,
          });

          if (confirmation.customId === 'confirm_disable') {
            await Services.Channel.disable(channel.id);

            const successContainer = new ContainerBuilder().addTextDisplayComponents(textDisplay =>
              textDisplay.setContent(
                `${emojis.checkmark} Auto-publishing has been disabled in <#${channel.id}> channel!`
              )
            );

            return confirmation.update({
              flags: [MessageFlags.IsComponentsV2],
              components: [successContainer],
            });
          }

          if (confirmation.customId === 'cancel_disable') {
            const cancelContainer = new ContainerBuilder().addTextDisplayComponents(textDisplay =>
              textDisplay.setContent(
                `${emojis.info} Action cancelled. Auto-publishing remains enabled.`
              )
            );

            return confirmation.update({
              flags: [MessageFlags.IsComponentsV2],
              components: [cancelContainer],
            });
          }
        } catch (error) {
          if (error instanceof Error && error.message.includes('time')) {
            const timeoutContainer = new ContainerBuilder().addTextDisplayComponents(textDisplay =>
              textDisplay.setContent(
                `${emojis.crossmark} Confirmation not received within 1 minute. Action cancelled.`
              )
            );

            return interaction.editReply({
              flags: [MessageFlags.IsComponentsV2],
              components: [timeoutContainer],
            });
          }

          throw error;
        }
      }
    }

    await Services.Channel.disable(channel.id);

    const successContainer = new ContainerBuilder().addTextDisplayComponents(textDisplay =>
      textDisplay.setContent(
        `${emojis.checkmark} Auto-publishing has been disabled in <#${channel.id}> channel!`
      )
    );

    return interaction.editReply({
      flags: [MessageFlags.IsComponentsV2],
      components: [successContainer],
    });
  } catch (error) {
    logger.error(error, 'Failed to disable auto-publishing');

    const errorContainer = new ContainerBuilder().addTextDisplayComponents(textDisplay =>
      textDisplay.setContent(
        `${emojis.crossmark} Failed to disable auto-publishing in <#${channel.id}>. Please try again later.`
      )
    );

    return interaction.editReply({
      flags: [MessageFlags.IsComponentsV2],
      components: [errorContainer],
    });
  }
}
