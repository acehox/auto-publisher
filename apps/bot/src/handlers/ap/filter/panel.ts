import { config } from '@ap/config';
import { Copy } from '@ap/copy';
import { normalizeFilterValues } from '@ap/utils';
import { type Filter, FilterMatchMode, FilterType } from '@ap/validations';
import type { Subcommand } from '@sapphire/plugin-subcommands';
import { Data } from 'data/index.js';
import {
  type ChannelType,
  type ContainerBuilder,
  type MessageComponentInteraction,
  MessageFlags,
  type ModalSubmitInteraction,
  type Snowflake,
} from 'discord.js';
import { emojis } from 'lib/constants/index.js';
import { Services } from 'services/index.js';
import { handlePremiumCheck } from 'utils/interactions.js';
import { logger } from 'utils/logger.js';
import { buildFilterModal, extractModalValues, fitsEditModal, modalCustomId } from './modal.js';
import {
  buildFocusView,
  buildListView,
  buildNoticeView,
  PanelIds,
  type PanelState,
  panelPayload,
  totalPages,
} from './render.js';

/** Panel dies after 10 min of inactivity — well inside the 15-min interaction token life. */
const PANEL_IDLE_MS = 600_000;
/** Must stay under the panel's idle window: a form outliving its panel submits into a corpse. */
const MODAL_TIMEOUT_MS = 540_000;
/** Discord kills an interaction token 15 min after its interaction, margin included. */
const TOKEN_LIFETIME_MS = 870_000;

const EMPTY_ROLE_IDS: ReadonlySet<Snowflake> = new Set();

/** Anything that can edit the panel message: the command, or a later component/modal ack. */
type PanelResponder =
  | Subcommand.ChatInputCommandInteraction
  | MessageComponentInteraction
  | ModalSubmitInteraction;

/** Why the panel has no rule to show: the channel isn't registered, or the read failed. */
type PanelUnavailable = 'disabled' | 'unreadable';

/**
 * Whole-rule condition panel for one channel. Edits apply live: every action
 * persists through the per-filter endpoints, then the panel re-renders from a
 * fresh read, so the Discord and dashboard editors never disagree.
 */
export async function chatInputFilters(
  this: Subcommand,
  interaction: Subcommand.ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  // This is handled by the GuildOnly precondition
  if (!interaction.inGuild()) return;

  // Filters are Premium, resolved per guild — the bot has no plan of its own
  if (await handlePremiumCheck(interaction, interaction.guildId)) return;

  // Get option values
  const channel = interaction.options.getChannel<ChannelType.GuildAnnouncement>('channel', true);

  const notEnabled = `${emojis.crossmark} Auto-publishing is not enabled in <#${channel.id}> channel.\n\n-# Use </ap enable:${interaction.commandId}> to enable auto-publishing in this channel.`;
  const unreadable = `${emojis.crossmark} Failed to load the filters for <#${channel.id}>. Please try again in a moment.`;

  const unavailableNotice = (reason: PanelUnavailable): string =>
    reason === 'disabled' ? notEnabled : unreadable;

  // Mention conditions store role and user ids in one untagged list, so rendering
  // them needs the guild's role ids. Only paid for when a mention condition exists,
  // and this is a command path — the "never fetch" rule guards the publish hot path.
  const resolveRoleIds = async (filters: Filter[]): Promise<ReadonlySet<Snowflake>> => {
    if (!filters.some(filter => filter.type === FilterType.Mention)) return EMPTY_ROLE_IDS;

    const { guild } = interaction;
    if (!guild) return EMPTY_ROLE_IDS;

    // Read the gateway cache, not a snapshot, so a role created while the panel is
    // open still renders as a role. Fetching only covers an empty cache, and it
    // populates the cache for the renders that follow.
    if (guild.roles.cache.size === 0) {
      try {
        await guild.roles.fetch();
      } catch (error) {
        logger.warn(error, `Failed to resolve roles for guild ${guild.id}`);
        return EMPTY_ROLE_IDS;
      }
    }

    return new Set(guild.roles.cache.keys());
  };

  /** Fresh read of the channel's rule. */
  const readState = async (): Promise<PanelState | PanelUnavailable> => {
    const status = await Services.Channel.getStatus(channel.id);
    // A channel that isn't registered comes back as `{ enabled: false }`; `null` means
    // the read itself failed, which must not be reported as "not enabled".
    if (!status) return 'unreadable';
    if (!status.enabled) return 'disabled';

    const filters = status.filters ?? [];
    return {
      channelId: channel.id,
      filters,
      filterMode: status.filterMode ?? FilterMatchMode.All,
      roleIds: await resolveRoleIds(filters),
    };
  };

  // Current page, kept across re-renders so a mutation doesn't jump the user back
  // to page one.
  let page = 0;

  // Type picked in the select but not yet added. Held so the form can be reopened
  // after a dismissal, and so a rejected submission doesn't cost the pick.
  let pendingType: FilterType | null = null;

  // The panel is edited through whichever interaction acked last: the command's own
  // token would be older than 15 minutes by the time an idle panel expires.
  let lastResponder: PanelResponder = interaction;
  let responderMintedAt = interaction.createdTimestamp;

  /** How long the panel can still be edited — and therefore retired — by its owner. */
  const responderTimeLeft = (): number =>
    Math.max(TOKEN_LIFETIME_MS - (Date.now() - responderMintedAt), 0);

  // Wired to the collector once the panel message exists. Modal submits are not
  // collector events, so a render has to defer the idle timeout by hand — a panel
  // the user just acted on must not expire out from under them.
  let deferExpiry = (): void => {};

  /** Swap the panel in place, acknowledging `source` if it hasn't been already. */
  const showView = async (
    source: MessageComponentInteraction | ModalSubmitInteraction,
    container: ContainerBuilder
  ): Promise<void> => {
    if (!source.deferred && !source.replied) await source.deferUpdate();
    await source.editReply(panelPayload(container));
    lastResponder = source;
    responderMintedAt = source.createdTimestamp;
    deferExpiry();
  };

  /** Read state, or render why there's nothing to show and return null. */
  const readStateOrNotify = async (
    source: MessageComponentInteraction | ModalSubmitInteraction
  ): Promise<PanelState | null> => {
    const state = await readState();
    if (typeof state === 'string') {
      await showView(source, buildNoticeView(unavailableNotice(state)));
      return null;
    }
    return state;
  };

  const listView = (state: PanelState, notice?: string): ContainerBuilder => {
    page = Math.min(Math.max(page, 0), totalPages(state.filters.length) - 1);
    return buildListView(state, { page, notice, selectedType: pendingType });
  };

  const showList = async (
    source: MessageComponentInteraction | ModalSubmitInteraction,
    notice?: string,
    options: { toLastPage?: boolean } = {}
  ): Promise<void> => {
    const state = await readState();

    if (typeof state === 'string') {
      // Keep the outcome visible — the write it describes may well have landed.
      const reason = unavailableNotice(state);
      await showView(source, buildNoticeView(notice ? `${notice}\n\n${reason}` : reason));
      return;
    }

    // A new condition lands at the end of the list, which may be a page away.
    if (options.toLastPage) page = totalPages(state.filters.length) - 1;

    await showView(source, listView(state, notice));
  };

  const showFocus = async (
    source: MessageComponentInteraction,
    filterId: string,
    options: { confirmRemove?: boolean } = {}
  ): Promise<void> => {
    const state = await readStateOrNotify(source);
    if (!state) return;

    const filter = state.filters.find(entry => entry.id === filterId);
    if (!filter) {
      await showView(
        source,
        listView(state, `${emojis.crossmark} That condition no longer exists.`)
      );
      return;
    }

    await showView(source, buildFocusView(state, filter, options));
  };

  /**
   * Open a condition form and wait for it. Returns null when the user dismisses the
   * modal or lets it lapse — the panel is left untouched in that case.
   */
  const openModal = async (
    source: MessageComponentInteraction,
    state: PanelState,
    type: FilterType,
    existing?: Filter
  ): Promise<ModalSubmitInteraction | null> => {
    const customId = modalCustomId(source.id);
    await source.showModal(buildFilterModal(customId, type, { existing, roleIds: state.roleIds }));

    return source
      .awaitModalSubmit({
        filter: submit => submit.customId === customId && submit.user.id === interaction.user.id,
        time: MODAL_TIMEOUT_MS,
      })
      .catch(() => null);
  };

  /** Persist a submitted condition, then swap the panel back to the list. */
  const persistCondition = async (
    submit: ModalSubmitInteraction,
    type: FilterType,
    filterId?: string
  ): Promise<void> => {
    await submit.deferUpdate();

    const extracted = extractModalValues(submit, type);
    if (!extracted.valid) {
      await showList(submit, `${emojis.crossmark} ${extracted.error}`);
      return;
    }

    const filterData = {
      type,
      negate: extracted.negate,
      values: normalizeFilterValues(extracted.values, type),
    };

    const response = filterId
      ? await Data.API.Backend.updateFilter(channel.id, filterId, filterData)
      : await Data.API.Backend.addFilter(channel.id, filterData);

    const verb = filterId ? 'updated' : 'added';
    const notice = response.ok
      ? `${emojis.checkmark} Condition ${verb}.`
      : `${emojis.crossmark} ${await describeFailure(response, {
          notFound: filterId
            ? 'That condition no longer exists.'
            : 'Auto-publishing is no longer enabled in this channel.',
          fallback: `Failed to ${filterId ? 'update' : 'add'} the condition. Please try again later.`,
        })}`;

    const added = response.ok && !filterId;
    // The pick is spent only once it has become a condition; a rejected form keeps
    // it selected so the user can correct the values without re-picking the type.
    if (added) pendingType = null;

    await showList(submit, notice, { toLastPage: added });
  };

  const route = async (component: MessageComponentInteraction): Promise<void> => {
    const [action, param] = component.customId.split(':');

    switch (action) {
      case PanelIds.Type: {
        if (!component.isStringSelectMenu()) return;

        // Recorded without a re-render: the client already shows the pick, and
        // leaving the message alone keeps the panel from flickering per pick.
        pendingType = component.values[0] as FilterType;
        await component.deferUpdate();
        return;
      }

      case PanelIds.Add: {
        if (!pendingType) {
          await sendNotice(
            component,
            `${emojis.crossmark} Choose a condition type first, then add it.`
          );
          return;
        }

        // Only acks when it fails, so the modal below is still free to answer.
        const state = await readStateOrNotify(component);
        if (!state) return;

        if (state.filters.length >= config.limits.filtersPerChannel) {
          await showView(
            component,
            listView(
              state,
              `${emojis.crossmark} ${Copy.filters.condition.limit(config.limits.filtersPerChannel)}`
            )
          );
          return;
        }

        const type = pendingType;
        const submit = await openModal(component, state, type);
        if (submit) await persistCondition(submit, type);
        return;
      }

      case PanelIds.Focus: {
        if (param) await showFocus(component, param);
        return;
      }

      case PanelIds.Page: {
        const state = await readStateOrNotify(component);
        if (!state) return;

        page = Number.parseInt(param ?? '', 10) || 0;
        await showView(component, listView(state));
        return;
      }

      case PanelIds.Mode: {
        const mode = param === FilterMatchMode.Any ? FilterMatchMode.Any : FilterMatchMode.All;
        await component.deferUpdate();

        const response = await Data.API.Backend.setFilterMode(channel.id, mode);
        const notice = response.ok
          ? `${emojis.checkmark} Match mode set to **${Copy.filters.matchModes.labels[mode]}**.`
          : `${emojis.crossmark} ${await describeFailure(response, {
              notFound: 'Auto-publishing is no longer enabled in this channel.',
              fallback: 'Failed to update the match mode. Please try again later.',
            })}`;

        // The panel's own rule sentence and toggle already state the mode, so the
        // outcome is its own ephemeral reply rather than a line inside the panel.
        await showList(component);
        await sendNotice(component, notice);
        return;
      }

      case PanelIds.Edit: {
        if (!param) return;

        const state = await readStateOrNotify(component);
        if (!state) return;

        const filter = state.filters.find(entry => entry.id === param);
        if (!filter) {
          await showView(
            component,
            listView(state, `${emojis.crossmark} That condition no longer exists.`)
          );
          return;
        }

        if (!fitsEditModal(filter)) {
          await showView(
            component,
            listView(
              state,
              `${emojis.crossmark} That condition's values are too long to edit from Discord — edit it on the dashboard.`
            )
          );
          return;
        }

        const submit = await openModal(component, state, filter.type, filter);
        if (submit) await persistCondition(submit, filter.type, filter.id);
        return;
      }

      case PanelIds.Remove: {
        if (param) await showFocus(component, param, { confirmRemove: true });
        return;
      }

      case PanelIds.RemoveConfirm: {
        if (!param) return;
        await component.deferUpdate();

        const response = await Data.API.Backend.removeFilter(channel.id, param);
        const notice = response.ok
          ? `${emojis.checkmark} Condition removed.`
          : `${emojis.crossmark} ${await describeFailure(response, {
              notFound: 'That condition no longer exists.',
              fallback: 'Failed to remove the condition. Please try again later.',
            })}`;

        await showList(component, notice);
        return;
      }

      case PanelIds.Back: {
        await showList(component);
        return;
      }
    }
  };

  try {
    const state = await readState();

    if (typeof state === 'string') {
      await interaction.editReply(panelPayload(buildNoticeView(unavailableNotice(state))));
      return;
    }

    const panel = await interaction.editReply(panelPayload(listView(state)));

    const collector = panel.createMessageComponentCollector({
      filter: component => component.user.id === interaction.user.id,
      idle: PANEL_IDLE_MS,
    });

    deferExpiry = () => collector.resetTimer();

    collector.on('collect', async component => {
      // The only trace a collector-driven panel leaves: a restart silently kills
      // every open one, and without this there is no way to tell that from a bug.
      logger.debug({ customId: component.customId }, 'Filter panel action');

      try {
        await route(component);
      } catch (error) {
        logger.error(error, 'Filter panel action failed');

        const failure = buildNoticeView(
          `${emojis.crossmark} Something went wrong. Please try again.`
        );

        // A modal ack spends `component` on a response that owns no message, so
        // editing it would 404 — report through the panel's owner instead.
        if (component.replied) {
          await lastResponder.editReply(panelPayload(failure)).catch(() => {});
        } else {
          await showView(component, failure).catch(() => {});
        }
      }

      // Collecting resets the idle window even on a branch that only opened a modal
      // and never refreshed the responder. The panel can only be retired through that
      // token, so it must never outlive it.
      collector.resetTimer({ idle: Math.min(PANEL_IDLE_MS, responderTimeLeft()) });
    });

    collector.on('end', (_collected, reason) => {
      if (reason !== 'idle') return;

      lastResponder
        .editReply(
          panelPayload(
            buildNoticeView(
              `${emojis.info} Panel expired — run </ap filters:${interaction.commandId}> again.`
            )
          )
        )
        .catch(() => {});
    });
  } catch (error) {
    logger.error(error, 'Failed to open the filters panel');

    await interaction
      .editReply(
        panelPayload(
          buildNoticeView(
            `${emojis.crossmark} Failed to open the filters panel. Please try again later.`
          )
        )
      )
      .catch(() => {});
  }
}

/**
 * One-off result sent beside the panel instead of into it, for outcomes the panel
 * already shows on its own. Replies when the component is still unacknowledged and
 * follows up once it isn't — the panel's edit spends the initial response.
 */
const sendNotice = async (source: MessageComponentInteraction, content: string): Promise<void> => {
  const payload = {
    flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2] as const,
    components: [buildNoticeView(content)],
  };

  if (source.deferred || source.replied) {
    await source.followUp(payload);
    return;
  }

  await source.reply(payload);
};

/** Map a per-filter endpoint failure to user-facing copy. */
const describeFailure = async (
  response: Response,
  messages: { notFound: string; fallback: string }
): Promise<string> => {
  if (response.status === 404) return messages.notFound;

  if (response.status === 400) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
      code?: string;
    } | null;

    if (body?.code === 'FILTER_LIMIT') {
      return Copy.filters.condition.limit(config.limits.filtersPerChannel);
    }
    // Backend zod failures already read as prose; anything else is not actionable.
    if (body?.message?.startsWith('Invalid input:')) return body.message;
    return 'Invalid request. Please try again.';
  }

  return messages.fallback;
};
