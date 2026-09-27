'use client';

import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { useBotInviteUrl } from '@/components/site-config-context';
import { Button } from '../ui/button';

interface InviteBotButtonProps {
  children: ReactNode;
  className?: string;
  size?: ComponentProps<typeof Button>['size'];
  /** Ignored: the dashboard is not part of this build. */
  showDashboardNudge?: boolean;
}

/**
 * Marketing "Invite Bot" button. Opens the guild-agnostic free-bot invite in a
 * new tab; renders nothing when the client ID is unconfigured. Styling and
 * label are supplied by the caller via `children`/`className`/`size`.
 */
export function InviteBotButton({ children, className, size }: InviteBotButtonProps) {
  const inviteUrl = useBotInviteUrl();

  if (!inviteUrl) return null;

  return (
    <Button size={size} className={className} asChild>
      <Link href={inviteUrl} target="_blank">
        {children}
      </Link>
    </Button>
  );
}
