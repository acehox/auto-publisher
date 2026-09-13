import type { Subcommand } from '@sapphire/plugin-subcommands';
import {
  ActionRowBuilder,
  ButtonBuilder as Button,
  type ButtonBuilder,
  ButtonStyle,
  type ChannelType,
  ComponentType,
  MessageFlags,
  type Snowflake,
} from 'discord.js';
import { emojis, notes } from 'lib/constants/index.js';
import { Services } from 'services/index.js';
import { logger } from 'utils/logger.js';
import { formatNotes } from 'utils/notes.js';
import { buildReply, replyPayload } from 'utils/reply.js';

const disabledContainer = (channelId: Snowflake) =>
  buildReply({
    title: `${emojis.checkmark} Auto-publishing disabled`,
    body: `Auto-publishing has been disabled in <#${channelId}> channel.`,
  });

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
      return interaction.editReply(
        replyPayload(
          buildReply({
            title: `${emojis.crossmark} Auto-publishing isn't enabled`,
            body: `There is nothing to disable in <#${channel.id}> channel.`,
          })
        )
      );
    }

    {
      const filters = channelStatus.filters;
      if (filters && filters.length > 0) {
        const warningContainer = buildReply({
          title: `${emojis.warning} This will also remove all filters`,
          body:
            `Disabling auto-publishing in <#${channel.id}> channel will remove every filter set for it.\n\nIf you want to temporarily disable auto-publishing without removing filters, we suggest disabling \`View Channel\` permission instead.` +
            formatNotes([notes.permissionsExtendedDisable]),
        });

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

            return confirmation.update(replyPayload(disabledContainer(channel.id)));
          }

          if (confirmation.customId === 'cancel_disable') {
            return confirmation.update(
              replyPayload(
                buildReply({
                  title: `${emojis.info} Action cancelled`,
                  body: `Auto-publishing remains enabled in <#${channel.id}> channel.`,
                })
              )
            );
          }
        } catch (error) {
          if (error instanceof Error && error.message.includes('time')) {
            return interaction.editReply(
              replyPayload(
                buildReply({
                  title: `${emojis.crossmark} Confirmation timed out`,
                  body: `No confirmation was received within 1 minute, so auto-publishing remains enabled in <#${channel.id}> channel.`,
                })
              )
            );
          }

          throw error;
        }
      }
    }

    await Services.Channel.disable(channel.id);

    return interaction.editReply(replyPayload(disabledContainer(channel.id)));
  } catch (error) {
    logger.error(error, 'Failed to disable auto-publishing');

    return interaction.editReply(
      replyPayload(
        buildReply({
          title: `${emojis.crossmark} Failed to disable auto-publishing`,
          body: `Something went wrong while disabling auto-publishing in <#${channel.id}>. Please try again later.`,
        })
      )
    );
  }
}
