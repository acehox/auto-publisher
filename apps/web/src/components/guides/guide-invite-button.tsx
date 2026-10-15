import { Plus } from 'lucide-react';
import { InviteBotButton } from '@/components/marketing/invite-bot-button';
import { cn } from '@/lib/utils';

// `not-prose` because the button renders as a link, which the guide's prose styles would recolour.
export function GuideInviteButton({ className }: { className?: string }) {
  return (
    <div className={cn('not-prose', className)}>
      <InviteBotButton
        size="lg"
        className="border-0 bg-linear-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30 hover:from-blue-600 hover:to-blue-700 hover:shadow-blue-500/50"
        showDashboardNudge
      >
        <Plus className="h-5 w-5" />
        Invite Auto Publisher
      </InviteBotButton>
    </div>
  );
}
