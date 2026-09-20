'use client';

import { CreditCard, Filter, Hash, Home, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { useIsPublicInstance } from '@/components/site-config-context';
import type { GuildLoadFailure } from '@/lib/api/auth-expired';
import type { GuildDashboardData } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { ErrorBoundary } from './error-redirect-boundary';
import { GuildProvider } from './guild-context';
import { GuildDetailBoundary } from './guild-detail-boundary';
import { GuildErrorCard } from './guild-error-card';
import { useCurrentGuild, useGuildList } from './guild-list-context';
import { GuildSwitcher } from './server-switcher';
import { GuildDashboardShellSkeleton } from './skeletons';
import { useGuildAttention } from './use-guild-attention';

/**
 * Four destinations, and no persistent plan chrome on any of them: the
 * free/Premium distinction surfaces where it bites — the channel cap, the locked
 * Filters tab, the queue note — not as a badge riding the nav.
 */
const TABS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', icon: Home },
  { id: 'channels', label: 'Channels', icon: Hash },
  { id: 'filters', label: 'Filters', icon: Filter },
  { id: 'subscription', label: 'Subscription', icon: CreditCard },
];

interface GuildDashboardShellProps {
  guildId: string;
  dataPromise: Promise<GuildDashboardData | GuildLoadFailure>;
  children: React.ReactNode;
}

/**
 * Shell chrome for one guild. Three shapes, one nav model:
 *   - ≥1024px: a 252px sidebar (switcher + tabs), content capped at 760px and
 *     centred in the remaining space — one width for every tab, read top to
 *     bottom rather than as a grid of tiles.
 *   - 768–1023px: the switcher on its own row, tabs as an underlined strip.
 *   - <768px: a fixed bottom tab bar — thumb-reachable, four fixed targets, the
 *     attention badge always visible. Not a hamburger, which would hide the
 *     badge behind a tap. The switcher has no row here: it takes the navbar's
 *     left slot in place of the wordmark (`NavbarGuildBrand`), so the chrome
 *     above the content costs one row instead of two.
 *
 * The chrome renders instantly from the guild list + route param; only the
 * content and the badge suspend on the streamed detail promise (ADR 0007), so
 * switching guilds never blanks the switcher or tabs.
 */
export function GuildDashboardShell({ guildId, dataPromise, children }: GuildDashboardShellProps) {
  const guild = useCurrentGuild(guildId);
  const { error } = useGuildList();
  const router = useRouter();

  // A guild missing from a CLEANLY-loaded list = lost access, bot removed, or a
  // bad deep link — eject to the server list. Missing because the list FETCH
  // failed is transient: stay put and retry in place rather than bouncing to a
  // server list that failed the same way (ADR 0010).
  useEffect(() => {
    if (!guild && !error) {
      router.replace('/dashboard');
      router.refresh();
    }
  }, [guild, error, router]);

  if (!guild) {
    return error ? (
      <div className="mx-auto min-h-screen w-full max-w-6xl flex-1 px-4 pt-24 pb-16">
        <GuildErrorCard />
      </div>
    ) : (
      <GuildDashboardShellSkeleton />
    );
  }

  return (
    <GuildProvider guildId={guildId} dataPromise={dataPromise}>
      {/* A full viewport tall regardless of content, so the footer always
          starts just below the fold instead of riding up the screen on a short
          tab and down on a long one. */}
      <div className="flex min-h-screen flex-1 pt-16">
        <aside className="hidden w-63 shrink-0 border-slate-800/70 border-r p-4 lg:block">
          <div className="sticky top-20 space-y-2">
            <GuildSwitcher current={guild} />
            <nav className="space-y-0.5 pt-2">
              <SidebarTabs guildId={guildId} />
            </nav>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Tablet header: switcher on its own row, then the tab strip. */}
          <div className="hidden md:block lg:hidden">
            <div className="px-6 pt-4">
              <div className="max-w-65">
                <GuildSwitcher current={guild} />
              </div>
            </div>
            <div className="flex gap-1 border-slate-800/70 border-b px-6 pt-3">
              <StripTabs guildId={guildId} />
            </div>
          </div>

          <main className="flex-1 px-4 pt-5 pb-24 md:px-6 md:pt-6 md:pb-10 lg:pt-7 lg:pb-10">
            {/* The only region that suspends on guild detail. A failure throws at
                the child's useGuild(); the boundary redirects, re-logs in, or
                offers an in-place retry. Keyed by guildId so the retry
                orchestrator resets on a guild switch. */}
            {/* One column width for every tab, centred in the space the
                sidebar leaves — the tabs read as one place, not four. */}
            <div className="mx-auto w-full max-w-190">
              <GuildDetailBoundary key={guildId} guildId={guildId}>
                {children}
              </GuildDetailBoundary>
            </div>
          </main>
        </div>
      </div>

      <BottomTabs guildId={guildId} />
    </GuildProvider>
  );
}

function useVisibleTabs() {
  // A self-hosted instance has no billing: nothing to subscribe to.
  const isPublicInstance = useIsPublicInstance();
  return isPublicInstance ? TABS : TABS.filter(tab => tab.id !== 'subscription');
}

function SidebarTabs({ guildId }: { guildId: string }) {
  const pathname = usePathname();
  const tabs = useVisibleTabs();

  return (
    <>
      {tabs.map(tab => {
        const href = `/dashboard/${guildId}/${tab.id}`;
        const active = pathname.startsWith(href);
        return (
          <Link
            key={tab.id}
            href={href}
            className={cn(
              'flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors',
              active
                ? 'bg-blue-500/15 text-white'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
            )}
          >
            <tab.icon className={cn('size-4', active ? 'text-blue-400' : 'text-slate-500')} />
            <span className="flex-1">{tab.label}</span>
            {tab.id === 'overview' && <AttentionBadge guildId={guildId} />}
          </Link>
        );
      })}
    </>
  );
}

function StripTabs({ guildId }: { guildId: string }) {
  const pathname = usePathname();
  const tabs = useVisibleTabs();

  return (
    <>
      {tabs.map(tab => {
        const href = `/dashboard/${guildId}/${tab.id}`;
        const active = pathname.startsWith(href);
        return (
          <Link
            key={tab.id}
            href={href}
            className={cn(
              'flex items-center gap-2 border-b-2 px-3.5 pb-2.5 text-sm transition-colors',
              active
                ? 'border-blue-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            )}
          >
            {tab.label}
            {tab.id === 'overview' && <AttentionBadge guildId={guildId} />}
          </Link>
        );
      })}
    </>
  );
}

function BottomTabs({ guildId }: { guildId: string }) {
  const pathname = usePathname();
  const tabs = useVisibleTabs();

  return (
    <nav
      data-dashboard-tabbar
      className="fixed inset-x-0 bottom-0 z-40 flex border-slate-800 border-t bg-slate-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg md:hidden"
    >
      {tabs.map(tab => {
        const href = `/dashboard/${guildId}/${tab.id}`;
        const active = pathname.startsWith(href);
        return (
          <Link
            key={tab.id}
            href={href}
            className={cn(
              'relative flex flex-1 flex-col items-center gap-1 border-t-2 pt-2 pb-2.5 transition-colors',
              active ? 'border-blue-500 text-white' : 'border-transparent text-slate-400'
            )}
          >
            <tab.icon className={cn('size-4', active ? 'text-blue-400' : 'text-slate-500')} />
            <span className="text-[10px]">{tab.label}</span>
            {tab.id === 'overview' && (
              <span className="absolute top-1 left-1/2 ml-2.5">
                <AttentionBadge guildId={guildId} />
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The count of unresolved problems, visible from every tab. Reads guild detail,
 * so it suspends — wrapped in a null fallback so the chrome paints first and the
 * badge appears a beat later. Hidden at zero, which makes the late arrival
 * invisible when there is nothing to flag.
 */
function AttentionBadge({ guildId }: { guildId: string }) {
  return (
    <ErrorBoundary key={guildId} fallback={null}>
      <Suspense fallback={null}>
        <AttentionCount />
      </Suspense>
    </ErrorBoundary>
  );
}

function AttentionCount() {
  const { badgeCount } = useGuildAttention();
  if (badgeCount === 0) return null;
  return (
    <output
      className="inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-red-400 px-1.5 font-medium text-[11px] text-slate-950"
      aria-label={`${badgeCount} item${badgeCount !== 1 ? 's' : ''} need attention`}
    >
      {badgeCount}
    </output>
  );
}
