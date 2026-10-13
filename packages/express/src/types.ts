import type { Snowflake } from 'discord-api-types/globals';

export interface InfoResponse {
  channelsCacheSize: number;
  migratedGuildsCount: number;
  subscribedGuildsCount: number;
}

// Message Types
export interface ReceivedMessage {
  id: Snowflake;
  channel: {
    id: Snowflake;
  };
  content?: string;
  embeds?: unknown[];
}
