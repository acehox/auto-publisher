import { config } from '@ap/config';
import type { Subcommand } from '@sapphire/plugin-subcommands';
import { type ChannelType, MessageFlags, type Snowflake } from 'discord.js';
import { emojis, links, notes } from 'lib/constants/index.js';
import { Services } from 'services/index.js';
import { logger } from 'utils/logger.js';
import { formatNotes } from 'utils/notes.js';
import { checkChannelPermissions } from 'utils/permissions.js';
import { buildReply, replyPayload } from 'utils/reply.js';

const failureContainer = (channelId: Snowflake) =>
  buildReply({
    title: `${emojis.crossmark} Failed to enable auto-publishing`,
    body: `Something went wrong while enabling auto-publishing in <#${channelId}>. Please try again later.`,
  });

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

    return interaction.editReply(replyPayload(failureContainer(channel.id)));
  }

  const permissionCheck = checkChannelPermissions(botMember, channel);

  if (!permissionCheck.hasAll) {
    const permissionsList = permissionCheck.permissions
      .map(perm => `- ${perm.has ? emojis.checkmark : emojis.crossmark} \`${perm.name}\``)
      .join('\n');

    const errorContainer = buildReply({
      title: `${emojis.warning} Missing Permissions`,
      body: [
        `Bot requires the following permissions in <#${channel.id}> channel to enable auto-publishing:`,
        permissionsList,
      ],
    })
      .addSeparatorComponents(separator => separator)
      .addTextDisplayComponents(textDisplay =>
        textDisplay.setContent(
          'Please review the permissions and try enabling auto-publishing again.'
        )
      );

    await interaction.editReply(replyPayload(errorContainer));
    return;
  }

  try {
    const response = await Services.Channel.enable(interaction.guildId, channel.id);

    if (!response.ok) {
      if (response.status === 409) {
        return interaction.editReply(
          replyPayload(
            buildReply({
              title: `${emojis.info} Already enabled`,
              body: `Auto-publishing is already enabled in <#${channel.id}> channel.`,
            })
          )
        );
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
          return interaction.editReply(
            replyPayload(
              buildReply({
                title: `${emojis.crossmark} Not an announcement channel`,
                body: `<#${channel.id}> isn't an announcement channel. Change its type in Discord's channel settings, then try again.`,
              })
            )
          );
        }

        // Always the free cap: a Premium guild is uncapped, so this rejection
        // can only ever be a free one (`LIMIT_FREE` is the sole reason code).
        return interaction.editReply(
          replyPayload(
            buildReply({
              title: `${emojis.crossmark} Channel limit reached`,
              body: [
                `You have reached the maximum number of channels (${config.limits.freeChannelsPerGuild}) for auto-publishing.`,
                `Upgrade to **Premium** at [${links.hostname}](<${links.website}>) to unlock unlimited channels and extra features!`,
              ],
            })
          )
        );
      }

      logger.error(`Failed to enable auto-publishing: ${response.status} ${response.statusText}`);

      return interaction.editReply(replyPayload(failureContainer(channel.id)));
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
      `Auto-publishing has been enabled in <#${channel.id}> channel` +
      formatNotes([notes.rateLimit, premium ? notes.publishDelayPremium : notes.publishDelayFree]);

    return interaction.editReply(
      replyPayload(
        buildReply({ title: `${emojis.checkmark} Auto-publishing enabled!`, body: successMessage })
      )
    );
  } catch (error) {
    logger.error(error, 'Failed to enable auto-publishing');

    return interaction.editReply(replyPayload(failureContainer(channel.id)));
  }
}
