import { Copy } from '@ap/copy';
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
import { emojis } from '#lib/constants/index.js';
import { Services } from '#services/index.js';
import { logger } from '#utils/logger.js';
import { buildReply, replyPayload } from '#utils/reply.js';

const disabledContainer = (channelId: Snowflake) =>
  buildReply({
    title: `${emojis.checkmark} ${Copy.channels.outcome.disabled}`,
    body: Copy.channels.outcome.disabledDetail(`<#${channelId}>`),
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
            title: `${emojis.info} Not auto-publishing`,
            body: `<#${channel.id}> is not enabled for auto-publishing.`,
          })
        )
      );
    }

    {
      const filters = channelStatus.filters;
      if (filters && filters.length > 0) {
        // Same sentence as the dashboard's disable confirm — the deletion is the
        // same one, and "remove View Channel instead" is the only way to stop
        // auto-publishing without losing the filter. No auto-disable is threatened:
        // none exists.
        const warningContainer = buildReply({
          title: `${emojis.warning} ${Copy.channels.disableDeletesFilters.title(`<#${channel.id}>`)}`,
          body: Copy.channels.disableDeletesFilters.body(`<#${channel.id}>`, filters.length),
        });

        const confirmButton = new Button()
          .setCustomId('confirm_disable')
          .setLabel(Copy.channels.disableDeletesFilters.confirm)
          .setStyle(ButtonStyle.Danger);

        const cancelButton = new Button()
          .setCustomId('cancel_disable')
          .setLabel(Copy.actions.cancel)
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
                  title: `${emojis.info} Filter kept`,
                  body: `Auto-publishing is still enabled in <#${channel.id}>, with its filter.`,
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
                  body: `Auto-publishing is still enabled in <#${channel.id}>, with its filter. You did not confirm within 1 minute.`,
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
          body: `Auto-publishing in <#${channel.id}> is unchanged. Try again in a few minutes.`,
        })
      )
    );
  }
}
