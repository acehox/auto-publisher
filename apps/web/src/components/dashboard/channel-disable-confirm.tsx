'use client';

import { Copy } from '@ap/copy';
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
            {Copy.channels.disableDeletesFilters.title(filterCount)}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {Copy.channels.disableDeletesFilters.body(channelName, filterCount)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {Copy.channels.disableDeletesFilters.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
