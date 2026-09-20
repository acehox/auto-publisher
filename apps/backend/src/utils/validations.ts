import {
  CreateFilterSchema,
  FilterMatchModeSchema,
  SetChannelFiltersSchema,
  Validations,
} from '@ap/validations';
import { z } from 'zod';

export const ChannelReqSchema = z.object({
  params: z.object({
    channelId: Validations.snowflakeId,
  }),
});

export const ChannelEnableReqSchema = z.object({
  params: z.object({
    channelId: Validations.snowflakeId,
  }),
  body: z.object({
    guildId: Validations.snowflakeId,
    // Without it the service rejects a filtered unpause with FILTERS_PREMIUM.
    clearFilters: z.boolean().optional(),
  }),
});

export const GuildReqSchema = z.object({
  params: z.object({
    guildId: Validations.snowflakeId,
  }),
});

/** Bot presence removal (guildDelete) */
export const GuildDeleteReqSchema = z.object({
  params: z.object({
    guildId: Validations.snowflakeId,
  }),
});

export const GuildRegisterReqSchema = z.object({
  params: z.object({
    guildId: Validations.snowflakeId,
  }),
  body: z.object({
    // Live announcement channels from the GUILD_CREATE payload; absent = no prune.
    // 500 = Discord's per-guild channel cap
    announcementChannelIds: z.array(Validations.snowflakeId).max(500).optional(),
  }),
});

/** Bot-pushed publish-state batch (ADR 0008): per-channel capability */
export const PublishStatePushReqSchema = z.object({
  params: z.object({
    guildId: Validations.snowflakeId,
  }),
  body: z.object({
    // A full sweep (bot reconnect) replaces the stale fields; an incremental
    // push (single permission event) only upserts.
    full: z.boolean().optional(),
    // 500 = Discord's per-guild channel cap
    channels: z
      .array(
        z.object({
          channelId: Validations.snowflakeId,
          canPublish: z.boolean(),
          missing: z.array(z.string()).max(16),
        })
      )
      .max(500),
  }),
});

export const GuildChannelReqSchema = z.object({
  params: z.object({
    guildId: Validations.snowflakeId,
    channelId: Validations.snowflakeId,
  }),
});

/** Same consent flag as the bot's `/ap enable`. */
export const GuildChannelEnableReqSchema = z.object({
  params: z.object({
    guildId: Validations.snowflakeId,
    channelId: Validations.snowflakeId,
  }),
  body: z
    .object({
      clearFilters: z.boolean().optional(),
    })
    .optional()
    .default({}),
});

// MIGRATION: Remove after migration period (6 months)
export const GuildMigrateReqSchema = z.object({
  params: z.object({
    guildId: Validations.snowflakeId,
  }),
  body: z.object({
    // 500 = Discord's per-guild channel cap; the plan limit is enforced in Guilds.migrate
    channelIds: z.array(Validations.snowflakeId).max(500),
  }),
});

export const SubscriptionCheckoutReqSchema = z.object({
  params: z.object({
    guildId: Validations.snowflakeId,
  }),
  body: z.object({
    interval: z.enum(['month', 'year']),
    // Paddle requires sellers to have the buyer accept the terms and refund policy
    // before purchase. `literal(true)` makes the checkbox a real gate: a checkout
    // that never carried an acceptance is rejected here, not merely discouraged in
    // the UI. The version is recorded, not validated — see LEGAL_DOCUMENTS_VERSION.
    acceptedTerms: z.literal(true),
    termsVersion: z.string().min(1).max(32),
  }),
});

/**
 * The statutory withdrawal statement (ZZP čl. 81.a st. 3). ONE field: t. 1 (name) and
 * t. 2 (contract) are composed server-side and never accepted from the client; t. 3, the
 * address for the confirmation, is all the consumer supplies. 254 = RFC 5321 max length.
 */
export const WithdrawalSubmitReqSchema = z.object({
  params: z.object({
    guildId: Validations.snowflakeId,
  }),
  body: z.object({
    notificationAddress: z.email({ message: 'Enter a valid email address' }).trim().max(254),
  }),
});

export const FilterReqSchema = z.object({
  params: z.object({
    channelId: Validations.snowflakeId,
  }),
});

export const AddFilterReqSchema = z.object({
  params: z.object({
    channelId: Validations.snowflakeId,
  }),
  body: CreateFilterSchema,
});

export const RemoveFilterReqSchema = z.object({
  params: z.object({
    channelId: Validations.snowflakeId,
    filterId: z.string(),
  }),
});

export const UpdateFilterReqSchema = z.object({
  params: z.object({
    channelId: Validations.snowflakeId,
    filterId: z.string(),
  }),
  body: CreateFilterSchema,
});

export const SetFilterModeReqSchema = z.object({
  params: z.object({
    channelId: Validations.snowflakeId,
  }),
  body: z.object({
    mode: FilterMatchModeSchema,
  }),
});

// Guild-scoped rule replacement for the authenticated dashboard API. Unlike the
// internal channel routes above, this carries guildId so the handler can verify
// the channel belongs to the requester's guild before mutating filters. The
// dashboard inline builder saves the whole rule atomically.
export const GuildSetChannelFiltersReqSchema = z.object({
  params: z.object({
    guildId: Validations.snowflakeId,
    channelId: Validations.snowflakeId,
  }),
  body: SetChannelFiltersSchema,
});
