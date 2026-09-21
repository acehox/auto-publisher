import { Copy } from '@ap/copy';
import { type Filter, FilterMatchMode, FilterType } from '@ap/validations';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  type Snowflake,
  StringSelectMenuBuilder,
} from 'discord.js';
import { emojis } from 'lib/constants/index.js';

/**
 * Component ids the panel collector routes on. Anything after the first `:` is the
 * action's parameter (page index, match mode, or condition id).
 */
export const PanelIds = {
  Type: 'filters_type',
  Add: 'filters_add',
  Page: 'filters_page',
  Mode: 'filters_mode',
  Focus: 'filters_focus',
  Edit: 'filters_edit',
  Remove: 'filters_remove',
  RemoveConfirm: 'filters_remove_confirm',
  Back: 'filters_back',
} as const;

/**
 * Conditions per page. Each one costs three of the message's 40 components (its
 * section, the line, the pencil), so the page size — not the 25-option select cap
 * it used to follow — is what keeps a full page renderable.
 */
const CONDITIONS_PER_PAGE = 8;

/** Keeps a rendered page inside the 4000-character Text Display ceiling. */
const PREVIEW_VALUE_LIMIT = 60;
const FOCUS_VALUE_LIMIT = 100;

/** A channel's whole rule as the panel renders it. Re-read after every mutation. */
export interface PanelState {
  channelId: Snowflake;
  filters: Filter[];
  filterMode: FilterMatchMode;
  /** Guild role ids — mention values carry no type tag, so roles are resolved by lookup. */
  roleIds: ReadonlySet<Snowflake>;
}

/** The panel is always one ephemeral Components V2 container, swapped in place. */
export interface PanelPayload {
  flags: [MessageFlags.IsComponentsV2];
  components: [ContainerBuilder];
}

export const panelPayload = (container: ContainerBuilder): PanelPayload => ({
  flags: [MessageFlags.IsComponentsV2],
  components: [container],
});

export const totalPages = (conditionCount: number): number =>
  Math.max(1, Math.ceil(conditionCount / CONDITIONS_PER_PAGE));

/** Standalone message for states that carry no controls (not enabled, expired, failed). */
export const buildNoticeView = (content: string): ContainerBuilder =>
  new ContainerBuilder().addTextDisplayComponents(textDisplay => textDisplay.setContent(content));

const truncate = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/**
 * One stored value, rendered: people and roles as mentions, text as code. Ids are
 * never truncated — only free text can outgrow its line.
 */
const formatValue = (
  filter: Filter,
  value: string,
  roleIds: ReadonlySet<Snowflake>,
  limit: number
): string => {
  if (filter.type === FilterType.Author) return `<@${value}>`;
  if (filter.type === FilterType.Mention) {
    return roleIds.has(value) ? `<@&${value}>` : `<@${value}>`;
  }
  return `\`${truncate(value, limit)}\``;
};

/** `first (+N more)` — the list view only has room for a taste of the values. */
const valuePreview = (filter: Filter, roleIds: ReadonlySet<Snowflake>): string => {
  const [first, ...rest] = filter.values;
  if (first === undefined) return '—';
  const head = formatValue(filter, first, roleIds, PREVIEW_VALUE_LIMIT);
  return rest.length > 0 ? `${head} (+${rest.length} more)` : head;
};

const conditionLabel = (filter: Filter): string =>
  `**${Copy.filters.fields.labels[filter.type]}** ${Copy.filters.operators.label(filter.type, filter.negate)}`;

const conditionEmoji = (filter: Filter): string =>
  filter.negate ? emojis.crossmark : emojis.checkmark;

const conditionLine = (filter: Filter, position: number, roleIds: ReadonlySet<Snowflake>): string =>
  `${position}. ${conditionEmoji(filter)} ${conditionLabel(filter)} ${valuePreview(filter, roleIds)}`;

/** The dashboard's rule sentence, with the match mode inlined where its control sits. */
const leadLine = (state: PanelState): string => {
  if (state.filters.length === 0) return Copy.filters.rule.empty;
  if (state.filters.length === 1) return Copy.filters.rule.single;
  return `${Copy.filters.rule.lead} **${Copy.filters.matchModes.labels[state.filterMode]}** ${Copy.filters.rule.tail}`;
};

const modeButton = (mode: FilterMatchMode, current: FilterMatchMode): ButtonBuilder => {
  const active = mode === current;
  const button = new ButtonBuilder()
    .setCustomId(`${PanelIds.Mode}:${mode}`)
    .setLabel(Copy.filters.matchModes.labels[mode])
    .setStyle(active ? ButtonStyle.Primary : ButtonStyle.Secondary)
    .setDisabled(active);

  if (active) button.setEmoji(emojis.checkmark);

  return button;
};

export interface ListViewOptions {
  /** Page of conditions (0-based); clamped to the current condition count. */
  page?: number;
  /** Transient result line, e.g. `✓ Condition added.` */
  notice?: string;
  /** Type picked but not yet added — kept selected so a dismissed form can be reopened. */
  selectedType?: FilterType | null;
}

/**
 * Whole-rule view: the conditions on the current page, each with an inline pencil,
 * plus the match mode and the add controls.
 */
export const buildListView = (
  state: PanelState,
  options: ListViewOptions = {}
): ContainerBuilder => {
  const { filters, roleIds } = state;
  const pages = totalPages(filters.length);
  const page = Math.min(Math.max(options.page ?? 0, 0), pages - 1);
  const start = page * CONDITIONS_PER_PAGE;
  const pageFilters = filters.slice(start, start + CONDITIONS_PER_PAGE);

  const container = new ContainerBuilder().addTextDisplayComponents(textDisplay =>
    textDisplay.setContent(`### ${emojis.filter} Filters for <#${state.channelId}>`)
  );

  // The notice shares the rule sentence's block: two lines of prose are not worth
  // two of the 40 components a page has to fit conditions into.
  const lead = leadLine(state);
  container.addTextDisplayComponents(textDisplay =>
    textDisplay.setContent(options.notice ? `${options.notice}\n\n${lead}` : lead)
  );

  // The match mode is part of the rule sentence, so its toggle sits with the list.
  if (filters.length > 1) {
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        modeButton(FilterMatchMode.All, state.filterMode),
        modeButton(FilterMatchMode.Any, state.filterMode)
      )
    );
  }

  for (const [index, filter] of pageFilters.entries()) {
    const position = start + index + 1;
    container.addSectionComponents(section =>
      section
        .addTextDisplayComponents(textDisplay =>
          textDisplay.setContent(conditionLine(filter, position, roleIds))
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(`${PanelIds.Focus}:${filter.id}`)
            .setLabel('View')
            .setStyle(ButtonStyle.Secondary)
        )
    );
  }

  container
    .addSeparatorComponents(separator => separator)
    .addTextDisplayComponents(textDisplay => textDisplay.setContent('Add a new condition:'))
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(PanelIds.Type)
          .setPlaceholder('Choose a condition type…')
          .addOptions(
            Copy.filters.fields.order.map(type => ({
              label: Copy.filters.fields.labels[type],
              value: type,
              description: Copy.filters.fields.descriptions[type],
              default: type === options.selectedType,
            }))
          )
      )
    );

  // Picking a type only arms the form; this button opens it. Selecting used to open
  // it outright, which left a dismissed form unreopenable — the select fires on
  // change, and re-picking the same option is not a change.
  const actions = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(PanelIds.Add)
      .setLabel(Copy.filters.condition.add)
      .setStyle(ButtonStyle.Primary)
  );

  if (pages > 1) {
    actions.addComponents(
      new ButtonBuilder()
        .setCustomId(`${PanelIds.Page}:${page - 1}`)
        .setLabel('Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`${PanelIds.Page}:${page + 1}`)
        .setLabel('Next')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= pages - 1)
    );
  }

  container.addActionRowComponents(actions);

  if (pages > 1) {
    container.addTextDisplayComponents(textDisplay =>
      textDisplay.setContent(
        `-# Showing ${start + 1}–${start + pageFilters.length} of ${filters.length} conditions.`
      )
    );
  }

  return container;
};

export interface FocusViewOptions {
  /** Swap the action buttons for the inline delete confirmation. */
  confirmRemove?: boolean;
}

/** Single condition, full value list, with the per-condition actions. */
export const buildFocusView = (
  state: PanelState,
  filter: Filter,
  options: FocusViewOptions = {}
): ContainerBuilder => {
  const position = state.filters.findIndex(entry => entry.id === filter.id) + 1;
  const values = filter.values
    .map(value => formatValue(filter, value, state.roleIds, FOCUS_VALUE_LIMIT))
    .join(', ');

  const container = new ContainerBuilder()
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(PanelIds.Back)
          .setLabel('◀︎ Back')
          .setStyle(ButtonStyle.Secondary)
      )
    )
    .addTextDisplayComponents(textDisplay =>
      textDisplay.setContent(
        `### ${emojis.filter} Condition ${position} of ${state.filters.length} · <#${state.channelId}>`
      )
    )
    .addTextDisplayComponents(textDisplay =>
      textDisplay.setContent(`${conditionEmoji(filter)} ${conditionLabel(filter)}`)
    )
    .addTextDisplayComponents(textDisplay => textDisplay.setContent(`\n${values}`))
    .addSeparatorComponents(separator => separator);

  if (options.confirmRemove) {
    // Names the consequence, not merely the irreversibility — same as the
    // dashboard's condition-row confirm.
    return container
      .addTextDisplayComponents(textDisplay =>
        textDisplay.setContent(
          `${emojis.warning} **${Copy.filters.condition.removeTitle}**\n${Copy.filters.condition.removeBody(filter.type, filter.negate, filter.values.length)}`
        )
      )
      .addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`${PanelIds.RemoveConfirm}:${filter.id}`)
            .setLabel('Remove')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`${PanelIds.Focus}:${filter.id}`)
            .setLabel('Keep')
            .setStyle(ButtonStyle.Secondary)
        )
      );
  }

  return container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${PanelIds.Edit}:${filter.id}`)
        .setLabel('Edit')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${PanelIds.Remove}:${filter.id}`)
        .setLabel('Remove')
        .setStyle(ButtonStyle.Danger)
    )
  );
};
