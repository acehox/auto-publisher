import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Zap } from 'lucide-react';

/**
 * The locked Filters tab for a free server. Deliberately one small card, not a
 * pricing hero and not a mock of the editor: a small card here versus a full
 * pricing screen after the CTA is what stops the two places reading as the same
 * place — the failure that made pressing the button feel like a no-op.
 */
export function LockedFeature({
  guildId,
}: {
  guildId: string;
  trialAvailable: boolean;
}) {
  return (
    <div className="space-y-3.5 rounded-xl border border-slate-800 bg-slate-900 p-5">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-yellow-500">
        <Zap className="size-3.5 shrink-0" aria-hidden="true" />
        Premium feature
      </p>
      <p className="text-sm leading-relaxed text-slate-200">
        Filters let a channel publish only the messages you choose — by keyword, author, mention or
        webhook.
      </p>
      <ul className="space-y-2 text-xs text-slate-400">
        <li>Keep routine posts out of followers&apos; feeds</li>
        <li>One rule per channel, all or any conditions</li>
      </ul>
      <div className="flex flex-wrap items-center gap-3.5 pt-1">
        <Button asChild size="sm">
          <Link href={`/dashboard/${guildId}/subscription`}>See Premium plans</Link>
        </Button>
      </div>
    </div>
  );
}
