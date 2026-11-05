import { Copy } from '@ap/copy';
import type { Subcommand } from '@sapphire/plugin-subcommands';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ContainerBuilder,
  type MessageComponentInteraction,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';
import { emojis } from '#lib/constants/index.js';
import { Services } from '#services/index.js';
import { premiumLockedPayload } from '#utils/interactions.js';
import { logger } from '#utils/logger.js';
import { buildPanelClosedNotice, buildReply, PANEL_IDLE_MS, replyPayload } from '#utils/reply.js';

/** `rollover:on` / `rollover:off`: the state the button sets, so a double click cannot flip it back. */
const TOGGLE_PREFIX = 'rollover';

const premiumPitch = [Copy.rollover.premiumOnly, Copy.rollover.description];

interface PanelView {
  on: boolean;
  /** Set right after a write landed: the outcome line replaces the plain status. */
  changed?: boolean;
  error?: string;
}

/** The mark states what holds, so turning it off reads as a cross, not a success. */
const statusLine = ({ on, changed }: PanelView): string => {
  const mark = on ? emojis.checkmark : emojis.crossmark;
  if (!changed) return `${mark} **${Copy.rollover.status(on)}.**`;
  const outcome = on ? Copy.rollover.turnedOn : Copy.rollover.turnedOff;
  return `${mark} **${outcome.title}.** ${outcome.detail}`;
};

/** Laid out like the filter panel: what it is above the separator, its state and control below. */
const buildPanel = (view: PanelView): ContainerBuilder =>
  new ContainerBuilder()
    .addTextDisplayComponents(
      textDisplay => textDisplay.setContent(`### ${emojis.rollover} ${Copy.rollover.name}`),
      textDisplay => textDisplay.setContent(Copy.rollover.description)
    )
    .addSeparatorComponents(separator => separator)
    .addTextDisplayComponents(textDisplay =>
      textDisplay.setContent(
        view.error ? `${statusLine(view)}\n${emojis.crossmark} ${view.error}` : statusLine(view)
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${TOGGLE_PREFIX}:${view.on ? 'off' : 'on'}`)
          .setLabel(view.on ? 'Turn off' : 'Turn on')
          .setStyle(view.on ? ButtonStyle.Secondary : ButtonStyle.Success)
      )
    );

const noticePayload = (title: string, body: string) => replyPayload(buildReply({ title, body }));

/** Server-wide setting, so Manage Server, like the dashboard. Re-read from each click's own payload. */
const canManageServer = (component: MessageComponentInteraction): boolean =>
  component.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;

export async function chatInputRollover(
  this: Subcommand,
  interaction: Subcommand.ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  // This is handled by the GuildOnly precondition
  if (!interaction.inGuild()) return;
  const { guildId } = interaction;
  const command = `</ap rollover:${interaction.commandId}>`;

  const loadFailed = noticePayload(
    `${emojis.crossmark} Failed to load ${Copy.rollover.name}`,
    'Try again in a few minutes.'
  );

  try {
    // Not `handlePremiumCheck`: the panel needs `rolloverEnabled` from the same read,
    // and a failed read is an error here rather than the upgrade message, which
    // would tell a Premium server it lacks Premium.
    const guildChannels = await Services.Channel.getGuildChannels(guildId);
    if (!guildChannels) {
      await interaction.editReply(loadFailed);
      return;
    }
    if (!guildChannels.premium) {
      await interaction.editReply(premiumLockedPayload(premiumPitch));
      return;
    }

    let on = guildChannels.rolloverEnabled;
    // The panel is edited through whichever interaction acked last, so its token
    // is always younger than the idle window when the panel expires.
    let lastResponder: Subcommand.ChatInputCommandInteraction | MessageComponentInteraction =
      interaction;

    const panel = await interaction.editReply(replyPayload(buildPanel({ on })));

    const collector = panel.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: component => component.user.id === interaction.user.id,
      idle: PANEL_IDLE_MS,
    });

    collector.on('collect', async component => {
      logger.debug({ customId: component.customId }, 'Rollover panel action');

      try {
        await component.deferUpdate();
        lastResponder = component;

        if (!canManageServer(component)) {
          await component.editReply(
            noticePayload(
              `${emojis.crossmark} Missing permission`,
              `To change ${Copy.rollover.name}, you need the Manage Server permission.`
            )
          );
          collector.stop('forbidden');
          return;
        }

        const enabled = component.customId === `${TOGGLE_PREFIX}:on`;
        const result = await Services.Guild.setRollover(guildId, enabled);

        if (result.ok) {
          on = result.rolloverEnabled;
          await component.editReply(replyPayload(buildPanel({ on, changed: true })));
          return;
        }

        // The plan lapsed while the panel was open.
        if (result.reason === 'premiumInactive') {
          await component.editReply(premiumLockedPayload(premiumPitch));
          collector.stop('premiumInactive');
          return;
        }

        await component.editReply(
          replyPayload(
            buildPanel({
              on,
              error: `Could not turn ${enabled ? 'on' : 'off'} ${Copy.rollover.name}. Try again in a few minutes.`,
            })
          )
        );
      } catch (error) {
        logger.error(error, 'Rollover panel action failed');
        await lastResponder
          .editReply(
            noticePayload(
              `${emojis.crossmark} Failed to change ${Copy.rollover.name}`,
              `Run ${command} to try again.`
            )
          )
          .catch(() => {});
      }
    });

    collector.on('end', (_collected, reason) => {
      if (reason !== 'idle') return;
      lastResponder
        .editReply(replyPayload(buildPanelClosedNotice(`${Copy.rollover.name} panel`, command)))
        .catch(() => {});
    });
  } catch (error) {
    logger.error(error, 'Failed to open the rollover panel');
    await interaction.editReply(loadFailed).catch(() => {});
  }
}
