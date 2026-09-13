import { anyKeywordMatches } from '@ap/utils';
import { type Filter, FilterMatchMode, FilterType } from '@ap/validations';
import type { Message, NewsChannel } from 'discord.js';
import { extractMessageText } from 'utils/messageText.js';
import { Services } from './index.js';

/**
 * Evaluate whether a message passes a channel's filter rule.
 *
 * Flat rule-builder model: a channel has one condition list combined by its
 * match mode (all = AND, any = OR). Each condition can be negated (`negate`),
 * which replaces the old allow/block split — "block X" is a negated condition.
 * An empty list publishes everything.
 *
 * No plan check: filters are Premium-only, and a free guild's filtered channels
 * are PAUSED rather than served unfiltered (ADR 0009), so they never reach the
 * allowlist this reads. A serving channel with conditions is, by construction,
 * a Premium guild's channel.
 * @param message Discord message
 * @param channel Announcement channel
 * @returns true if the message should be published, false otherwise
 */
const evaluate = async (message: Message, channel: NewsChannel): Promise<boolean> => {
  try {
    const channelStatus = await Services.Channel.getStatus(channel.id);

    if (!channelStatus || !channelStatus.filters || channelStatus.filters.length === 0) {
      return true;
    }

    const conditions = channelStatus.filters;
    const matchMode = channelStatus.filterMode || FilterMatchMode.All;
    // Embeds and Components V2 text included — see extractMessageText. Not lowercased:
    // the keyword patterns are case-insensitive, so a copy of the whole message text
    // would buy nothing.
    const content = extractMessageText(message);
    const authorId = message.author.id;

    const passes = (condition: Filter): boolean => {
      const matched = matchesFilter(condition, content, authorId, message);
      return condition.negate ? !matched : matched;
    };

    return matchMode === FilterMatchMode.All ? conditions.every(passes) : conditions.some(passes);
  } catch {
    // On error, allow publishing (fail open)
    return true;
  }
};

/**
 * Check if message matches a filter
 * @param filter Filter to check
 * @param content Flattened message text (content + embeds + Components V2)
 * @param authorId Message author ID
 * @param message Full message object
 * @returns true if matches, false otherwise
 */
const matchesFilter = (
  filter: Filter,
  content: string,
  authorId: string,
  message: Message
): boolean => {
  switch (filter.type) {
    case FilterType.Keyword: {
      // Whole-word matching with `*` wildcards (see @ap/utils keyword matcher).
      return anyKeywordMatches(content, filter.values);
    }

    case FilterType.Mention: {
      // Check if message mentions any of the specified users or roles
      return filter.values.some(
        id => message.mentions.users.has(id) || message.mentions.roles.has(id)
      );
    }

    case FilterType.Author: {
      // Check if author matches any of the specified author IDs
      return filter.values.includes(authorId);
    }

    case FilterType.Webhook: {
      // Check if webhook ID matches any of the specified webhook IDs
      return message.webhookId ? filter.values.includes(message.webhookId) : false;
    }

    default:
      return false;
  }
};

export const FilterService = {
  evaluate,
};
