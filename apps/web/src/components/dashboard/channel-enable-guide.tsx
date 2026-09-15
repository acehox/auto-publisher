'use client';

import { PermissionSteps } from '@/components/dashboard/channel-permission-steps';
import {
  publishDelayCopy,
  usePublishDelayEntitled,
} from '@/components/dashboard/publish-delay-note';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

/**
 * The only path to turning a channel on: permissions are a prerequisite, not an
 * afterthought. Built on AlertDialog so an outside click cannot dismiss it —
 * "I granted the permissions" commits, the corner control or ESC leaves the
 * channel off.
 *
 * Also the second and last place the 10/hour limit appears (the other is the
 * collapsed "How publishing works" on Channels): here it is decision-relevant,
 * so it earns the space.
 */
export function ChannelEnableGuideModal({
  channelName,
  hasSubscription,
  onConfirm,
  onCancel,
}: {
  channelName: string;
  /** Entitled guild → the priority copy; else the delay note. */
  hasSubscription: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const entitled = usePublishDelayEntitled(hasSubscription);

  return (
    <AlertDialog
      open
      onOpenChange={open => {
        // Only fires on ESC — AlertDialog ignores outside clicks by design.
        if (!open) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Before {channelName} can publish</AlertDialogTitle>
          <AlertDialogDescription>
            The bot needs three channel permissions in Discord before it can post here.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <PermissionSteps />

        <div className="space-y-1.5 border-slate-800 border-t pt-3 text-xs leading-relaxed text-slate-400">
          <p>Discord allows up to 10 published messages per hour, per channel.</p>
          <p>{publishDelayCopy(entitled)}</p>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <Button onClick={onConfirm}>I granted the permissions</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
