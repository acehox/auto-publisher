'use client';

import { Copy } from '@ap/copy';
import { PermissionSteps } from '@/components/dashboard/channel-fix-steps';
import { useOverLimitState } from '@/components/dashboard/use-over-limit-state';
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
 * "Enable auto-publishing" commits, the corner control or ESC leaves the
 * channel off.
 *
 * Repeats the 10/hour limit from `HowPublishingWorks`: here it is
 * decision-relevant, so it earns the space.
 */
export function ChannelEnableGuideModal({
  channelName,
  onConfirm,
  onCancel,
}: {
  channelName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const overLimitState = useOverLimitState();

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
          <AlertDialogTitle>Before {channelName} can auto-publish</AlertDialogTitle>
          <AlertDialogDescription>{Copy.permissions.intro}</AlertDialogDescription>
        </AlertDialogHeader>

        <PermissionSteps />

        <p className="border-slate-800 border-t pt-3 text-xs leading-relaxed text-slate-400">
          {Copy.publishing.overLimit.body(overLimitState)}
        </p>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <Button onClick={onConfirm}>Enable auto-publishing</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
