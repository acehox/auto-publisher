import { Copy } from '@ap/copy';
import { type Filter, FilterType, MAX_VALUES, RegExPatterns } from '@ap/validations';
import {
  LabelBuilder,
  MentionableSelectMenuBuilder,
  ModalBuilder,
  type ModalSubmitInteraction,
  type Snowflake,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from 'discord.js';
import { logger } from '#utils/logger.js';

/** Custom id of the modal's single value input, whatever its component type. */
const VALUE_ID = 'value';

/** Custom id of the operator select. */
const OPERATOR_ID = 'operator';

const OPERATOR_INCLUDE = 'include';
const OPERATOR_EXCLUDE = 'exclude';

/** The caps are never shown up front, only in the error on the attempt past them. */
const VALUE_LABELS: Record<FilterType, string> = {
  [FilterType.Keyword]: 'Keywords',
  [FilterType.Author]: 'Users or bots',
  [FilterType.Mention]: 'Roles or users',
  [FilterType.Webhook]: 'Webhook IDs',
};

const VALUE_NOUNS: Record<FilterType, string> = {
  [FilterType.Keyword]: 'keywords',
  [FilterType.Mention]: 'roles or users',
  [FilterType.Author]: 'users or bots',
  [FilterType.Webhook]: 'webhook IDs',
};

const EMPTY_VALUE_ERRORS: Record<FilterType, string> = {
  [FilterType.Keyword]: 'Enter at least 1 keyword.',
  [FilterType.Mention]: 'Select at least 1 role or user.',
  [FilterType.Author]: 'Select at least 1 user or bot.',
  [FilterType.Webhook]: 'Enter at least 1 webhook ID.',
};

/**
 * What each operator matches, per field. Describes the condition, not the publish
 * outcome: "Don't publish messages that match" under "does not contain" read as a
 * double negative.
 */
const OPERATOR_DESCRIPTIONS: Record<FilterType, { positive: string; negative: string }> = {
  [FilterType.Keyword]: {
    positive: 'Matches messages that contain any of these keywords',
    negative: 'Matches messages that contain none of these keywords',
  },
  [FilterType.Author]: {
    positive: 'Matches messages from any of these users or bots',
    negative: 'Matches messages from anyone except these users or bots',
  },
  [FilterType.Mention]: {
    positive: 'Matches messages that mention any of these roles or users',
    negative: 'Matches messages that mention none of these roles or users',
  },
  [FilterType.Webhook]: {
    positive: 'Matches messages from any of these webhooks',
    negative: 'Matches messages from anything except these webhooks',
  },
};

/** How stored values are laid out in, and read back from, the text inputs. */
const VALUE_SEPARATOR = ', ';

/** The two fields edited as free text; the rest use auto-populated selects. */
type TextFilterType = typeof FilterType.Keyword | typeof FilterType.Webhook;

const isTextFilterType = (type: FilterType): type is TextFilterType =>
  type === FilterType.Keyword || type === FilterType.Webhook;

/**
 * Text-input ceilings. Keyword gets Discord's maximum: the backend allows 25 values
 * of 200 characters, which outgrows even a 4000-character input, so the tail of that
 * range is web-only by necessity (see {@link fitsEditModal}). Webhook needs only to
 * clear 25 snowflakes plus separators (~550 characters) with room to spare.
 */
const TEXT_INPUT_LIMITS: Record<TextFilterType, number> = {
  [FilterType.Keyword]: 4000,
  [FilterType.Webhook]: 1024,
};

/**
 * Whether an existing condition's values fit the form that would edit them. A rule
 * built on the dashboard can hold 25 × 200 characters of keywords, which outgrows
 * Discord's largest text input — and a modal cannot carry a value its own
 * `max_length` rejects, so such a condition has to be edited on the web.
 */
export const fitsEditModal = (filter: Filter): boolean =>
  !isTextFilterType(filter.type) ||
  filter.values.join(VALUE_SEPARATOR).length <= TEXT_INPUT_LIMITS[filter.type];

/**
 * Modal custom ids are minted per open from the triggering interaction id: modal
 * submits are collected client-wide, so two panels (or two opens on one panel)
 * must never match each other's `awaitModalSubmit` filter.
 */
export const modalCustomId = (interactionId: Snowflake): string => `filters_modal:${interactionId}`;

export interface FilterModalOptions {
  /** Condition being edited — prefills the form; omit to build the add form. */
  existing?: Filter;
  /** Guild role ids, so an edited mention list preselects roles as roles. */
  roleIds?: ReadonlySet<Snowflake>;
}

/**
 * Condition form, laid out like the dashboard's condition row: the field it edits,
 * then the operator, then the values. The field itself is fixed — changing it is a
 * remove plus an add — so it is stated rather than offered.
 * @param customId Per-open modal id (see {@link modalCustomId})
 * @param type Condition field
 */
export const buildFilterModal = (
  customId: string,
  type: FilterType,
  options: FilterModalOptions = {}
): ModalBuilder =>
  new ModalBuilder()
    .setCustomId(customId)
    .setTitle(options.existing ? 'Edit condition' : Copy.filters.condition.add)
    .addTextDisplayComponents(textDisplay =>
      textDisplay.setContent(
        `**${Copy.filters.fields.labels[type]}**\n${Copy.filters.fields.descriptions[type]}`
      )
    )
    .addLabelComponents(
      buildOperatorLabel(type, options.existing?.negate),
      buildValueLabel(type, options)
    );

/** Operator select, mapped to the stored `negate` flag. */
const buildOperatorLabel = (type: FilterType, currentNegate?: boolean): LabelBuilder => {
  const labels = Copy.filters.operators.labels[type];
  const descriptions = OPERATOR_DESCRIPTIONS[type];
  const select = new StringSelectMenuBuilder()
    .setCustomId(OPERATOR_ID)
    .setPlaceholder('Choose how this condition matches')
    .setRequired(true)
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(labels.positive)
        .setValue(OPERATOR_INCLUDE)
        .setDescription(descriptions.positive)
        .setDefault(currentNegate === false),
      new StringSelectMenuOptionBuilder()
        .setLabel(labels.negative)
        .setValue(OPERATOR_EXCLUDE)
        .setDescription(descriptions.negative)
        .setDefault(currentNegate === true)
    );

  return new LabelBuilder().setLabel('How to match').setStringSelectMenuComponent(select);
};

/** Value field for a condition field type, prefilled from `existing` when editing. */
const buildValueLabel = (type: FilterType, options: FilterModalOptions): LabelBuilder => {
  const { existing, roleIds } = options;
  const label = new LabelBuilder().setLabel(VALUE_LABELS[type]);

  switch (type) {
    case FilterType.Keyword: {
      const input = new TextInputBuilder()
        .setCustomId(VALUE_ID)
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('announcement, giveaway, update')
        .setMinLength(1)
        .setMaxLength(TEXT_INPUT_LIMITS[type])
        .setRequired(true);

      if (existing) input.setValue(existing.values.join(VALUE_SEPARATOR));

      return label
        .setDescription(`Separate with commas. ${Copy.filters.keyword.hint}`)
        .setTextInputComponent(input);
    }

    case FilterType.Author: {
      const select = new UserSelectMenuBuilder()
        .setCustomId(VALUE_ID)
        .setPlaceholder('Select users or bots')
        .setMinValues(1)
        .setMaxValues(MAX_VALUES[type])
        .setRequired(true);

      if (existing) select.setDefaultUsers(existing.values);

      return label
        .setDescription('The users or bots to compare with the message author.')
        .setUserSelectMenuComponent(select);
    }

    case FilterType.Mention: {
      const select = new MentionableSelectMenuBuilder()
        .setCustomId(VALUE_ID)
        .setPlaceholder('Select roles or users')
        .setMinValues(1)
        .setMaxValues(MAX_VALUES[type])
        .setRequired(true);

      if (existing) {
        // A mention condition stores role and user ids in one untagged list, so
        // the role lookup decides which half of the picker each id preselects.
        const roles = existing.values.filter(value => roleIds?.has(value));
        const users = existing.values.filter(value => !roleIds?.has(value));
        if (roles.length > 0) select.addDefaultRoles(roles);
        if (users.length > 0) select.addDefaultUsers(users);
      }

      return label
        .setDescription('The roles or users to look for in the message mentions.')
        .setMentionableSelectMenuComponent(select);
    }

    case FilterType.Webhook: {
      const input = new TextInputBuilder()
        .setCustomId(VALUE_ID)
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('1234567890123456789, 9876543210987654321')
        .setMinLength(17)
        .setMaxLength(TEXT_INPUT_LIMITS[type])
        .setRequired(true);

      if (existing) input.setValue(existing.values.join(VALUE_SEPARATOR));

      return label
        .setDescription(
          'Separate with commas. The ID is the number after /webhooks/ in the webhook URL.'
        )
        .setTextInputComponent(input);
    }
  }
};

export type FilterModalValues =
  | { valid: true; values: string[]; negate: boolean }
  | { valid: false; error: string };

/** Comma-separated text input → trimmed, non-empty entries. */
const splitList = (raw: string): string[] =>
  raw
    .split(',')
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0);

const readValues = (submit: ModalSubmitInteraction, type: FilterType): string[] => {
  if (isTextFilterType(type)) return splitList(submit.fields.getTextInputValue(VALUE_ID));

  // Auto-populated selects report their picks as ids on the component itself.
  const field = submit.fields.getField(VALUE_ID);
  return 'values' in field ? [...field.values] : [];
};

/** Read the operator select back as a `negate` boolean; null if missing/invalid. */
const readNegate = (submit: ModalSubmitInteraction): boolean | null => {
  const label = submit.components.find(
    entry => 'component' in entry && entry.component.customId === OPERATOR_ID
  );
  if (!label || !('component' in label)) return null;

  const component = label.component;
  const value =
    'values' in component && Array.isArray(component.values) ? component.values[0] : undefined;

  if (value === OPERATOR_INCLUDE) return false;
  if (value === OPERATOR_EXCLUDE) return true;
  return null;
};

/** Read and validate a condition form. Backend refines (no-op keywords, value length) still apply. */
export const extractModalValues = (
  submit: ModalSubmitInteraction,
  type: FilterType
): FilterModalValues => {
  try {
    const negate = readNegate(submit);
    if (negate === null) return { valid: false, error: 'Choose how this condition matches.' };

    const values = readValues(submit, type);
    if (values.length === 0) return { valid: false, error: EMPTY_VALUE_ERRORS[type] };

    const max = MAX_VALUES[type];
    if (values.length > max) {
      return {
        valid: false,
        error: `A condition can have up to ${max} ${VALUE_NOUNS[type]}. Remove ${values.length - max} and try again.`,
      };
    }

    if (type === FilterType.Webhook) {
      const invalid = values.find(value => !RegExPatterns.snowflake.test(value));
      if (invalid) {
        return {
          valid: false,
          error: `\`${invalid}\` is not a webhook ID. ${Copy.filters.errors.webhookId}`,
        };
      }
    }

    return { valid: true, values, negate };
  } catch (error) {
    logger.error(error, 'Failed to read filter modal values');
    return { valid: false, error: 'Auto Publisher could not read the form. Try again.' };
  }
};
