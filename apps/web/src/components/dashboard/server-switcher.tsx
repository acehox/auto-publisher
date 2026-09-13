'use client';

import { Check, ChevronDown, Crown, LayoutGrid } from 'lucide-react';
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

interface GuildSwitcherProps {
  current: DiscordGuild;
}

/** Switchable guilds only (bot present), alphabetical. */
function switchableGuilds(guilds: DiscordGuild[]): DiscordGuild[] {
  return guilds.filter(guild => guild.botPresent).sort((a, b) => a.name.localeCompare(b.name));
}

function GuildAvatar({ guild, size }: { guild: DiscordGuild; size: number }) {
  const iconUrl = guildIconUrl(guild.id, guild.icon);
  return (
    <div
      className="bg-linear-to-br from-blue-500 to-blue-600 rounded-md flex items-center justify-center shrink-0 overflow-hidden"
      style={{ width: size, height: size }}
    >
      {iconUrl ? (
        <Image
          src={iconUrl}
          alt=""
          className="w-full h-full object-cover"
          width={size}
          height={size}
        />
      ) : (
        <span className="text-white text-xs font-semibold">
          {guild.name.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}

export function GuildSwitcher({ current }: GuildSwitcherProps) {
  const { guilds } = useGuildList();
  const items = switchableGuilds(guilds);
  // A self-hosted instance has no billing, so "premium" is not a distinction
  // worth badging — every guild has the full feature set.
  const isPublicInstance = useIsPublicInstance();

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        className={cn(
          'group w-full flex items-center gap-3 px-3.5 py-3 rounded-lg outline-none transition-colors',
          'bg-slate-900/50 border border-slate-800 text-white',
          'hover:border-slate-700 focus:outline-none focus-visible:outline-none data-[state=open]:border-blue-500/50'
        )}
      >
        <GuildAvatar guild={current} size={34} />
        <span className="flex-1 min-w-0 truncate text-left text-base font-medium">
          {current.name}
        </span>
        {current.hasSubscription && isPublicInstance && (
          <Crown className="w-4 h-4 text-yellow-500 shrink-0" />
        )}
        <ChevronDown className="w-4 h-4 text-slate-500 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className="min-w-(--radix-dropdown-menu-trigger-width) max-h-96 overflow-y-auto"
      >
        {items.map(guild => {
          const isCurrent = guild.id === current.id;
          return (
            <DropdownMenuItem key={guild.id} asChild>
              <Link href={`/dashboard/${guild.id}`}>
                <GuildAvatar guild={guild} size={22} />
                <span className="flex-1 min-w-0 truncate">{guild.name}</span>
                {guild.hasSubscription && isPublicInstance && (
                  <Crown className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                )}
                {isCurrent && <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
              </Link>
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard">
            <LayoutGrid className="w-4 h-4 text-slate-500 shrink-0" />
            <span>All servers</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
