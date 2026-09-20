import { config } from '@ap/config';
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
import { Buttons } from 'lib/components/buttons.js';
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

/**
 * A choice rather than a flat refusal: the Filters panel that would let an admin
 * clear the rule by hand is itself Premium-gated, so an error alone strands them
 * with a channel they cannot turn on. Mirrors the dashboard dialog.
 *
 * Returns true only on a succeeded retry — the caller owns the success copy;
 * every other outcome is replied to here.
 */
async function offerFilterChoice(
  interaction: Subcommand.ChatInputCommandInteraction,
  channelId: Snowflake,
  filterCount: number,
  retry: () => Promise<Response>
): Promise<boolean> {
  const rule = filterCount === 1 ? 'filter' : 'filters';
  const prompt = buildReply({
    title: `${emojis.warning} Filters only run on Premium`,
    body: [
      `<#${channelId}> has ${filterCount} ${rule} saved from a Premium plan. The Free plan can't run them, so this channel either publishes **every** message or stays off.`,
      `Removing the ${rule} can't be undone.`,
    ],
  });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new Button()
      .setCustomId('enable_clear_filters')
      .setLabel(`Remove ${rule} and enable`)
      .setStyle(ButtonStyle.Danger),
    new Button()
      .setCustomId('enable_keep_filters')
      .setLabel('Keep it off')
      .setStyle(ButtonStyle.Secondary),
    Buttons.getPremium
  );

  const message = await interaction.editReply({
    flags: [MessageFlags.IsComponentsV2],
    components: [prompt, row],
  });

  let choice: Awaited<ReturnType<typeof message.awaitMessageComponent>>;
  try {
    choice = await message.awaitMessageComponent({
      filter: i => i.user.id === interaction.user.id,
      componentType: ComponentType.Button,
      time: 60_000,
    });
  } catch {
    // Only ever the collector timeout — the link button dispatches no event.
    await interaction.editReply(
      replyPayload(
        buildReply({
          title: `${emojis.crossmark} Confirmation timed out`,
          body: `No confirmation was received within 1 minute, so <#${channelId}> stays off and keeps its ${rule}.`,
        })
      )
    );
    return false;
  }

  if (choice.customId !== 'enable_clear_filters') {
    await choice.update(
      replyPayload(
        buildReply({
          title: `${emojis.info} Nothing changed`,
          body: `<#${channelId}> stays off and keeps its ${rule}, ready to run again the moment this server is on Premium.`,
        })
      )
    );
    return false;
  }

  await choice.deferUpdate();

  const response = await retry();
  if (!response.ok) {
    logger.error(
      `Failed to enable after clearing filters: ${response.status} ${response.statusText}`
    );
    await interaction.editReply(replyPayload(failureContainer(channelId)));
    return false;
  }

  return true;
}

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

  const successReply = async () => {
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

    return buildReply({
      title: `${emojis.checkmark} Auto-publishing enabled!`,
      body:
        `Auto-publishing has been enabled in <#${channel.id}> channel` +
        formatNotes([
          notes.rateLimit,
          premium ? notes.publishDelayPremium : notes.publishDelayFree,
        ]),
    });
  };

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
        // Every 400 from this route carries a `code`; the specific ones must be
        // branched on BEFORE the limit copy, or a demoted channel — or one
        // holding a Premium-only rule — renders as "you hit your channel limit".
        const body = await response
          .clone()
          .json()
          .then(json => json as { code?: string; data?: { filterCount?: number } })
          .catch(() => undefined);
        const code = body?.code;

        // Must state the same consequence as the dashboard's dialog.
        if (code === 'FILTERS_PREMIUM') {
          const cleared = await offerFilterChoice(
            interaction,
            channel.id,
            body?.data?.filterCount ?? 0,
            () => Services.Channel.enable(interaction.guildId, channel.id, { clearFilters: true })
          );
          if (!cleared) return;
          return interaction.editReply(replyPayload(await successReply()));
        }
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

    return interaction.editReply(replyPayload(await successReply()));
  } catch (error) {
    logger.error(error, 'Failed to enable auto-publishing');

    return interaction.editReply(replyPayload(failureContainer(channel.id)));
  }
}
