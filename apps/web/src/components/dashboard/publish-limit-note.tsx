import { Info } from 'lucide-react';

/**
 * Informational note about Discord's per-channel crosspost cap. Purely
 * educational — we surface no live counter (the SublimitCounter lives in the
 * proxy and is never plumbed to the web). Shared by the Overview status section
 * and the Channels tab.
 */
export function PublishLimitNote() {
  return (
    <p className="flex items-center gap-2 text-slate-500 text-sm">
      <Info className="w-4 h-4 shrink-0" />
      Discord allows up to 10 published messages per hour per channel.
    </p>
  );
}
