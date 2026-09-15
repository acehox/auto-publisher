import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeletons mirror the real row rhythm so the first paint does not move: a
 * header line, one surface, then rows at the height the tab actually renders.
 * The shell is interactive while these show — only the content region suspends
 * on guild detail (ADR 0007).
 */

const bar = 'bg-slate-800';

function Rows({ count, height = 'h-13' }: { count: number; height?: string }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder
        <Skeleton key={index} className={`${height} w-full rounded-lg ${bar}`} />
      ))}
    </div>
  );
}

/** Header + one card + rows — the shape every tab settles into. */
export function TabContentSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className={`h-6 w-45 rounded-md ${bar}`} />
      <Skeleton className={`h-20 w-full rounded-xl ${bar}`} />
      <Rows count={3} />
    </div>
  );
}

/** Skeleton for the /dashboard server list. */
export function ServerSelectorSkeleton() {
  return (
    <div className="mx-auto min-h-screen w-full max-w-140 flex-1 px-4 pt-24 pb-16">
      <Skeleton className={`mb-6 h-7 w-45 rounded-md ${bar}`} />
      <Rows count={4} height="h-15" />
    </div>
  );
}

/** Shell chrome + content, for a cold load of a guild route. */
export function GuildDashboardShellSkeleton() {
  return (
    <div className="flex min-h-screen flex-1 pt-16">
      <aside className="hidden w-63 shrink-0 border-slate-800/70 border-r p-4 lg:block">
        <div className="space-y-2">
          <Skeleton className={`h-12 w-full rounded-lg ${bar}`} />
          <div className="space-y-1 pt-2">
            <Rows count={4} height="h-9" />
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1 px-4 pt-5 pb-24 md:px-6 md:pt-6 md:pb-10">
        <div className="mx-auto w-full max-w-190">
          <TabContentSkeleton />
        </div>
      </div>
    </div>
  );
}
