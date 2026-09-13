'use client';

import { ChevronRight, Crown, Plus, TriangleAlert } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { useGuildList } from '@/components/dashboard/guild-list-context';
import { useIsPublicInstance, useSiteConfig } from '@/components/site-config-context';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { DiscordGuild } from '@/lib/api/types';
import { guildIconUrl } from '@/lib/discord';
import { getBotInviteUrl } from '@/lib/invite';
import { useRefreshOnReturn } from '@/lib/use-refresh-on-return';

function hasBotPresent(guild: DiscordGuild): boolean {
  return guild.botPresent;
}

/** Guilds the bot is in first, then alphabetically within each group. */
function sortGuilds(guilds: DiscordGuild[]): DiscordGuild[] {
  return [...guilds].sort((a, b) => {
    const orderDiff = Number(b.botPresent) - Number(a.botPresent);
    if (orderDiff !== 0) return orderDiff;
    return a.name.localeCompare(b.name);
  });
}

export function ServerSelector() {
  const { guilds, error } = useGuildList();
  const siteConfig = useSiteConfig();
  // A self-hosted instance has no billing, so "premium" is not a distinction
  // worth badging, and a hand-typed ?upgrade= must not route into the
  // subscription tab — that route 404s there.
  const isPublicInstance = useIsPublicInstance();
  const sortedGuilds = sortGuilds(guilds);
  const armRefreshOnReturn = useRefreshOnReturn();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Set when the user arrived via a Premium page plan CTA (/dashboard?upgrade=
  // month|year). The flag's PRESENCE (any value) is the "wants to buy" signal:
  // a free guild then routes straight to its subscription tab; premium guilds
  // and plain visits land on /overview as usual. Intent-scoped on purpose — an
  // unconditional redirect would nag every free visit onto the pay page. The
  // VALUE is the interval they picked, forwarded so the panel preselects it.
  const upgradeParam = searchParams.get('upgrade');
  const upgradeIntent = isPublicInstance && upgradeParam !== null;
  const upgradeInterval = upgradeParam === 'month' || upgradeParam === 'year' ? upgradeParam : null;

  // Free guild + upgrade intent → subscription tab (carrying the chosen
  // interval); otherwise the guild root, which redirects to /overview.
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
  // re-fetches the list; once THAT guild shows a bot present, we navigate into
  // it. We never navigate to a still-botless guild (the invite may have been
  // cancelled, or guildCreate hasn't landed) — that would bounce with a Discord
  // "Missing Access". If it stays absent, the user just stays on the list.
  const pendingInviteRef = useRef<string | null>(null);

  useEffect(() => {
    const target = pendingInviteRef.current;
    if (!target) return;
    const invited = guilds.find(g => g.id === target);
    if (invited && hasBotPresent(invited)) {
      pendingInviteRef.current = null;
      router.push(guildHref(invited));
    }
  }, [guilds, router, guildHref]);

  return (
    <div className="flex-1 px-4 pt-24 pb-16">
      <div className="max-w-md mx-auto">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-4xl text-white">Select a Server</h1>
          </div>
        </div>

        {error ? (
          <Card className="bg-slate-900/50 border-slate-800 p-12 text-center">
            <TriangleAlert className="w-8 h-8 text-slate-500 mx-auto mb-3" />
            <p className="text-slate-400 mb-2">Something went wrong</p>
            <p className="text-slate-500 text-sm">Please try again later</p>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2">
              {sortedGuilds.map(guild => {
                const iconUrl = guildIconUrl(guild.id, guild.icon);
                const botAbsent = !hasBotPresent(guild);
                const content = (
                  <Card
                    key={guild.id}
                    className={`py-3 px-4 transition-all group cursor-pointer ${
                      botAbsent
                        ? 'bg-slate-900/30 border-slate-800/50 opacity-60 hover:opacity-100 hover:border-blue-500/50 hover:bg-blue-800/10'
                        : 'bg-slate-900/50 border-slate-800 hover:border-blue-500/50 hover:bg-blue-800/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-linear-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center text-3xl shrink-0 overflow-hidden">
                          {iconUrl ? (
                            <Image
                              src={iconUrl}
                              alt=""
                              className="w-full h-full object-cover"
                              width={64}
                              height={64}
                            />
                          ) : (
                            <span className="text-white text-xl font-semibold">
                              {guild.name.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-white text-lg truncate">{guild.name}</h3>
                            {guild.hasSubscription && isPublicInstance && (
                              <Crown className="w-5 h-5 text-yellow-500 shrink-0" />
                            )}
                            {/* MIGRATION: remove badge at sunset */}
                            {hasBotPresent(guild) && !guild.migrated && (
                              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 shrink-0">
                                Legacy
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      {botAbsent ? (
                        <Plus className="w-6 h-6 text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      ) : (
                        <ChevronRight className="w-6 h-6 text-slate-600 group-hover:text-blue-400 transition-colors shrink-0" />
                      )}
                    </div>
                  </Card>
                );

                if (botAbsent) {
                  const inviteUrl = getBotInviteUrl(siteConfig, guild.id);
                  if (!inviteUrl) {
                    return (
                      <div key={guild.id} className="block">
                        {content}
                      </div>
                    );
                  }
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
                      {content}
                    </a>
                  );
                }

                return (
                  <Link key={guild.id} href={guildHref(guild)} className="block">
                    {content}
                  </Link>
                );
              })}
            </div>

            {guilds.length === 0 && (
              <Card className="bg-slate-900/50 border-slate-800 p-12 text-center">
                <p className="text-slate-400 mb-2">No servers found</p>
                <p className="text-slate-500 text-sm">
                  Make sure you have Manage Server permission in the servers you want to manage
                </p>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
