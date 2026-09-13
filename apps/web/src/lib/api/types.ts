export type {
  ChannelFilterRule,
  ChannelLimitReason,
  CheckoutResponse,
  DiscordGuild,
  FilterMatchMode,
  FilterType,
  GuildChannel,
  GuildDashboardData,
  GuildRole,
  SubscriptionData,
  SubscriptionDetail,
  WithdrawalResult,
  WithdrawalState,
} from '@ap/api-types';

/** One filter condition as edited in the dashboard rule builder */
export interface FilterInput {
  type: import('@ap/api-types').FilterType;
  /** true = negated operator ("doesn't contain"/"is not") */
  negate: boolean;
  values: string[];
}
