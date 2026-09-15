'use client';

import Link from 'next/link';
import { shouldOfferWithdrawal, WithdrawalPanel } from '@/components/dashboard/withdrawal-panel';
import { useBotInviteUrl, useIsPublicInstance } from '@/components/site-config-context';
import { Button } from '@/components/ui/button';
import { useRefreshOnReturn } from '@/lib/use-refresh-on-return';
import { useSubscriptionDetail } from '@/lib/use-subscription-detail';

/**
 * Replaces every tab on `BOT_NOT_PRESENT` (409) — the guild is viewable, no bot
 * is in it, and only a fresh OAuth authorization restores one. A downgrade no
 * longer empties a guild (nothing leaves on a plan change), so this is only ever
 * a kick or a missed join.
 *
 * It still carries the statutory withdrawal control (ZZP čl. 81.a / CRD Art
 * 11a): this card replaces the subscription tab too, so a consumer whose bot was
 * kicked on day 3 would otherwise lose a control st. 2 requires throughout the
 * remaining 11 days.
 */
export function BotAbsentCard({ guildId }: { guildId: string }) {
  const inviteUrl = useBotInviteUrl(guildId, { lockGuildSelect: true });
  const armRefreshOnReturn = useRefreshOnReturn();
  // Self-host has no billing routes, so asking would only 404.
  const isPublicInstance = useIsPublicInstance();
  const { detail } = useSubscriptionDetail(guildId, isPublicInstance);
  const withdrawal = detail?.withdrawal ?? null;

  return (
    <div className="space-y-4">
      <div className="space-y-3.5 rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center gap-2.5">
          <span className="size-2 shrink-0 rounded-full bg-amber-400" />
          <h2 className="text-base font-semibold text-white">
            Auto Publisher isn&apos;t in this server
          </h2>
        </div>
        <p className="text-xs leading-relaxed text-slate-400">
          Nothing is publishing until the bot is added back. Discord does not let a bot add itself,
          so this has to come from your side. Your channel and filter setup is kept for 30 days.
        </p>
        <div className="flex flex-wrap items-center gap-3.5">
          {inviteUrl && (
            <Button asChild size="sm" onClick={armRefreshOnReturn}>
              <a href={inviteUrl} target="_blank" rel="noopener noreferrer">
                Invite Auto Publisher
              </a>
            </Button>
          )}
          <Link
            href="/dashboard"
            className="text-xs text-slate-400 transition-colors hover:text-slate-200"
          >
            Back to your servers
          </Link>
        </div>
      </div>

      {shouldOfferWithdrawal(withdrawal) && withdrawal && (
        <WithdrawalPanel guildId={guildId} withdrawal={withdrawal} />
      )}
    </div>
  );
}
