'use client';

import { ChevronRight, ServerOff, Zap } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { EmptyState } from '@/components/dashboard/empty-state';
import { GuildErrorCard } from '@/components/dashboard/guild-error-card';
import { useGuildList } from '@/components/dashboard/guild-list-context';
import { useIsPublicInstance, useSiteConfig } from '@/components/site-config-context';
import { Button } from '@/components/ui/button';
import type { DiscordGuild } from '@/lib/api/types';
import { guildIconUrl } from '@/lib/discord';
import { getBotInviteUrl } from '@/lib/invite';
import { useRefreshOnReturn } from '@/lib/use-refresh-on-return';
import { cn } from '@/lib/utils';

/** Guilds the bot is in first, then alphabetically within each group. */
function sortGuilds(guilds: DiscordGuild[]): DiscordGuild[] {
  return [...guilds].sort((a, b) => {
    const orderDiff = Number(b.botPresent) - Number(a.botPresent);
    return orderDiff !== 0 ? orderDiff : a.name.localeCompare(b.name);
  });
}

/**
 * One flat list, one row shape: icon, name, chevron. A person picking a server
 * recognises it by its icon, not by a status line — so no groups, no channel
 * counts, no per-row buttons. Servers without the bot are dimmed and
 * chevron-less and lead to the Discord invite; the only qualifiers on a name are
 * a gold Zap for Premium and an amber Legacy tag with a matching left edge.
 *
 * No tabs and no switcher here: there is no server in scope yet.
 */
export function ServerSelector() {
  const { guilds, error } = useGuildList();
  const siteConfig = useSiteConfig();
  // A self-hosted instance has no billing, so "premium" is not a distinction
  // worth badging, and a hand-typed ?upgrade= must not route into the
  // subscription tab — that route 404s there.
  const isPublicInstance = useIsPublicInstance();
  const armRefreshOnReturn = useRefreshOnReturn();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Set when the user arrived via a Premium page plan CTA
  // (/dashboard?upgrade=month|year). The flag's PRESENCE is the "wants to buy"
  // signal: a free guild then routes straight to its subscription tab.
  // Intent-scoped on purpose — an unconditional redirect would nag every free
  // visit onto the pay page. The VALUE is the interval, forwarded so the panel
  // preselects it.
  const upgradeParam = searchParams.get('upgrade');
  const upgradeIntent = isPublicInstance && upgradeParam !== null;
  const upgradeInterval = upgradeParam === 'month' || upgradeParam === 'year' ? upgradeParam : null;

  const guildHref = useCallback(
    (guild: DiscordGuild): string => {
      if (upgradeIntent && !guild.hasSubscription) {
        return upgradeInterval
          ? `/dashboard/${guild.id}/subscription?upgrade=${upgradeInterval}`
          : `/dashboard/${guild.id}/subscription`;
      }
      return `/dashboard/${guild.id}`;
    },
    [upgradeIntent, upgradeInterval]
  );

  // Guild the user just clicked "invite" for. On return, useRefreshOnReturn
  // re-fetches the list; once THAT guild shows a bot present we navigate into
  // it. Never to a still-botless guild (the invite may have been cancelled, or
  // guildCreate hasn't landed) — that would bounce with a Discord "Missing
  // Access". If it stays absent the user simply stays on the list.
  const pendingInviteRef = useRef<string | null>(null);
  useEffect(() => {
    const target = pendingInviteRef.current;
    if (!target) return;
    const invited = guilds.find(g => g.id === target);
    if (invited?.botPresent) {
      pendingInviteRef.current = null;
      router.push(guildHref(invited));
    }
  }, [guilds, router, guildHref]);

  return (
    <div className="mx-auto min-h-screen w-full max-w-140 flex-1 px-4 pt-24 pb-16">
      <h1 className="mb-6 text-xl font-semibold tracking-tight text-white">Select a server</h1>

      {error ? (
        <GuildErrorCard
          title="Could not load your servers"
          description="A temporary problem reaching Discord. Try again in a moment."
        />
      ) : guilds.length === 0 ? (
        <EmptyState
          icon={ServerOff}
          title="No servers found"
          action={
            <Button size="sm" onClick={() => router.refresh()}>
              Reload
            </Button>
          }
        >
          You need the Manage Server permission in a Discord server to set it up here. Ask an owner
          to grant it, then reload.
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {sortGuilds(guilds).map(guild => {
            const iconUrl = guildIconUrl(guild.id, guild.icon);
            const absent = !guild.botPresent;
            // MIGRATION: the Legacy tag and its amber edge go at sunset.
            const legacy = guild.botPresent && !guild.migrated;

            const row = (
              <div
                className={cn(
                  'flex items-center gap-3.5 rounded-xl border border-l-2 py-2.5 pr-3.5 pl-3 transition-colors',
                  absent
                    ? 'border-slate-800/60 border-l-slate-800/60 hover:border-slate-700'
                    : legacy
                      ? 'border-amber-500/25 border-l-amber-400 bg-amber-500/5 hover:border-amber-500/40'
                      : 'border-slate-800 border-l-slate-800 bg-slate-900 hover:border-blue-500/40'
                )}
              >
                <div
                  className={cn(
                    'flex size-9.5 shrink-0 items-center justify-center overflow-hidden rounded-xl',
                    absent ? 'bg-slate-800/50' : 'bg-linear-to-br from-blue-500 to-blue-600'
                  )}
                >
                  {iconUrl ? (
                    <Image
                      src={iconUrl}
                      alt=""
                      className="size-full object-cover"
                      width={64}
                      height={64}
                    />
                  ) : (
                    <span
                      className={cn(
                        'font-semibold text-sm',
                        absent ? 'text-slate-500' : 'text-white'
                      )}
                    >
                      {guild.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>

                <span
                  className={cn(
                    'min-w-0 truncate font-medium text-sm',
                    absent ? 'text-slate-500' : 'text-slate-100'
                  )}
                >
                  {guild.name}
                </span>

                {guild.hasSubscription && isPublicInstance && (
                  <Zap className="size-4 shrink-0 text-yellow-500" />
                )}
                {legacy && (
                  <span className="shrink-0 rounded border border-amber-500/45 bg-amber-500/10 px-2 py-0.5 font-semibold text-[10px] uppercase tracking-wider text-amber-400">
                    Legacy
                  </span>
                )}

                <span className="flex-1" />
                {!absent && <ChevronRight className="size-4 shrink-0 text-slate-600" />}
              </div>
            );

            if (absent) {
              const inviteUrl = getBotInviteUrl(siteConfig, guild.id);
              if (!inviteUrl) return <div key={guild.id}>{row}</div>;
              return (
                <a
                  key={guild.id}
                  href={inviteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    pendingInviteRef.current = guild.id;
                    armRefreshOnReturn();
                  }}
                  className="block"
                >
                  {row}
                </a>
              );
            }

            return (
              <Link key={guild.id} href={guildHref(guild)} className="block">
                {row}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
