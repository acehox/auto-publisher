'use client';

import { Check, ChevronDown, LayoutGrid, Zap } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useGuildList } from '@/components/dashboard/guild-list-context';
import { useIsPublicInstance } from '@/components/site-config-context';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { DiscordGuild } from '@/lib/api/types';
import { guildIconUrl } from '@/lib/discord';
import { cn } from '@/lib/utils';

/** Switchable guilds only (bot present), alphabetical. */
function switchableGuilds(guilds: DiscordGuild[]): DiscordGuild[] {
  return guilds.filter(guild => guild.botPresent).sort((a, b) => a.name.localeCompare(b.name));
}

function GuildAvatar({ guild, size }: { guild: DiscordGuild; size: number }) {
  const iconUrl = guildIconUrl(guild.id, guild.icon);
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-linear-to-br from-blue-500 to-blue-600"
      style={{ width: size, height: size }}
    >
      {iconUrl ? (
        <Image src={iconUrl} alt="" className="size-full object-cover" width={size} height={size} />
      ) : (
        <span className="font-semibold text-white text-xs">
          {guild.name.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}

/**
 * The one place plan identity is stated — everything else shows only what this
 * control cannot. "All servers" lives inside it rather than beside it: it is the
 * control that changes servers.
 *
 * `compact` is the mobile shape, where the switcher IS the screen title and sits
 * in the navbar in place of the wordmark: name plus a caret, no plan line, no
 * bordered box. Its own padding is the tap target — nothing wraps it there.
 */
export function GuildSwitcher({ current, compact }: { current: DiscordGuild; compact?: boolean }) {
  const { guilds } = useGuildList();
  const items = switchableGuilds(guilds);
  // A self-hosted instance has no billing, so "premium" is not a distinction
  // worth badging — every guild has the full feature set.
  const isPublicInstance = useIsPublicInstance();

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        className={cn(
          'group flex w-full cursor-pointer items-center gap-2.5 outline-none transition-colors',
          compact
            ? 'py-2.5 text-left'
            : 'rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-2.5 hover:border-slate-700 data-[state=open]:border-blue-500/50'
        )}
      >
        <GuildAvatar guild={current} size={26} />
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate font-medium text-sm text-white">{current.name}</span>
          {!compact && (
            // MIGRATION: the Legacy line wins over the plan name — a legacy
            // guild's plan says nothing about what it publishes. Gone at sunset.
            <span
              className={cn(
                'block text-[11px]',
                current.botPresent && !current.migrated ? 'text-amber-400' : 'text-slate-500'
              )}
            >
              {current.botPresent && !current.migrated
                ? 'Legacy'
                : isPublicInstance
                  ? current.hasSubscription
                    ? 'Premium'
                    : 'Free plan'
                  : 'Self-hosted'}
            </span>
          )}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-slate-500 transition-transform group-data-[state=open]:rotate-180" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className="max-h-96 min-w-(--radix-dropdown-menu-trigger-width) overflow-y-auto"
      >
        {items.map(guild => (
          <DropdownMenuItem key={guild.id} asChild>
            <Link href={`/dashboard/${guild.id}`}>
              <GuildAvatar guild={guild} size={22} />
              <span className="min-w-0 flex-1 truncate">{guild.name}</span>
              {guild.hasSubscription && isPublicInstance && (
                <Zap className="size-3.5 shrink-0 text-yellow-500" />
              )}
              {guild.id === current.id && <Check className="size-3.5 shrink-0 text-blue-400" />}
            </Link>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard">
            <LayoutGrid className="size-4 shrink-0 text-slate-500" />
            <span>All servers</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
