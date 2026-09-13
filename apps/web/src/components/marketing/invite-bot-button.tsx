'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ComponentProps, ReactNode } from 'react';
import { toast } from 'sonner';
import { useBotInviteUrl } from '@/components/site-config-context';
import { Button } from '../ui/button';

interface InviteBotButtonProps {
  children: ReactNode;
  className?: string;
  size?: ComponentProps<typeof Button>['size'];
  /**
   * Offer a one-tap route to the dashboard after the invite opens. The invite
   * opens in a new tab and — logged out, with no guild context — its success is
   * unverifiable, so this is a persistent, dismissible nudge, never an
   * auto-redirect. See CONTEXT.md "Marketing bot invite".
   */
  showDashboardNudge?: boolean;
}

/**
 * Marketing "Invite Bot" button. Opens the guild-agnostic free-bot invite in a
 * new tab; renders nothing when the client ID is unconfigured. Styling and
 * label are supplied by the caller via `children`/`className`/`size`.
 */
export function InviteBotButton({
  children,
  className,
  size,
  showDashboardNudge,
}: InviteBotButtonProps) {
  const router = useRouter();
  const inviteUrl = useBotInviteUrl();

  if (!inviteUrl) return null;

  const handleClick = () => {
    if (!showDashboardNudge) return;
    toast('Added the bot?', {
      id: 'invite-dashboard',
      description: 'Head to your dashboard to choose which channels publish.',
      action: {
        label: 'Go to dashboard',
        onClick: () => {
          toast.dismiss('invite-dashboard');
          router.push('/dashboard');
        },
      },
      position: 'top-center',
      duration: Number.POSITIVE_INFINITY,
    });
  };

  return (
    <Button size={size} className={className} asChild>
      <Link href={inviteUrl} target="_blank" onClick={handleClick}>
        {children}
      </Link>
    </Button>
  );
}
