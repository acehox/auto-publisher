import { config } from '@ap/config';
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
import { Buttons } from 'lib/components/buttons.js';
import { emojis, notes } from 'lib/constants/index.js';
import { Services } from 'services/index.js';
import { logger } from 'utils/logger.js';
import { formatNotes } from 'utils/notes.js';
import { checkChannelPermissions, renderPermissionSteps } from 'utils/permissions.js';
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
    title: `${emojis.warning} ${Copy.channels.filtersPremium.title}`,
    body: [
      Copy.channels.filtersPremium.body(`<#${channelId}>`, filterCount),
      Copy.channels.filtersPremium.clearOffer(filterCount),
    ],
  });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new Button()
      .setCustomId('enable_clear_filters')
      .setLabel(Copy.channels.filtersPremium.clearAction(filterCount))
      .setStyle(ButtonStyle.Danger),
    new Button()
      .setCustomId('enable_keep_filters')
      .setLabel(Copy.channels.filtersPremium.keepOff)
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

    // The ✅/❌ breakdown is additive — the dashboard cannot show which of the
    // three is missing — but the remedy below it is the shared five steps, so
    // an admin reads the same instructions on either surface.
    const errorContainer = buildReply({
      title: `${emojis.warning} <#${channel.id}> can't publish yet`,
      body: [Copy.permissions.intro, permissionsList],
    })
      .addSeparatorComponents(separator => separator)
      .addTextDisplayComponents(textDisplay => textDisplay.setContent(renderPermissionSteps()));

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
      title: `${emojis.checkmark} ${Copy.channels.outcome.enabled}`,
      body:
        Copy.channels.outcome.enabledDetail(`<#${channel.id}>`) +
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
              body: Copy.channels.outcome.alreadyEnabledDetail(`<#${channel.id}>`),
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
        return interaction.editReply({
          flags: [MessageFlags.IsComponentsV2],
          components: [
            buildReply({
              title: `${emojis.crossmark} ${Copy.channels.limit.title(config.limits.freeChannelsPerGuild)}`,
              body: Copy.channels.limit.body(`<#${channel.id}>`),
            }),
            // The copy no longer carries an inline upgrade link, so the CTA is
            // a button — the dashboard modal's "Upgrade to Premium" equivalent.
            new ActionRowBuilder<ButtonBuilder>().addComponents(Buttons.getPremium),
          ],
        });
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
