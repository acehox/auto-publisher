'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/**
 * Turning a channel off deletes its row, and the rule goes with it. Confirmed
 * only when there is a rule to lose; `/ap disable` has always warned here.
 */
export function ChannelDisableFiltersModal({
  channelName,
  filterCount,
  onConfirm,
  onCancel,
}: {
  channelName: string;
  filterCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const rule = filterCount === 1 ? 'filter' : 'filters';

  return (
    <AlertDialog
      open
      onOpenChange={open => {
        if (!open) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            This also deletes {filterCount} {rule}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Turning off {channelName} removes its {rule} for good. To pause publishing without
            losing them, revoke the bot&apos;s View Channel permission in Discord instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Turn off and delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
