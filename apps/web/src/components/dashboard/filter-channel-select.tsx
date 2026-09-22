'use client';

import { Check, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { GuildChannel } from '@/lib/api/types';
import { channelLabel } from '@/lib/utils';

/** The status line, identical in the trigger and in the list. */
export function conditionSummary(count: number): string {
  return count === 0 ? 'Publishes all' : `${count} condition${count === 1 ? '' : 's'}`;
}

interface FilterChannelSelectProps {
  channels: GuildChannel[];
  selected: GuildChannel;
  onSelect: (channelId: string) => void;
}

/**
 * Which channel's rule is on screen — the Filters tab's equivalent of the server
 * switcher, and the only place the channel is named (the rule card no longer
 * repeats it).
 */
export function FilterChannelSelect({ channels, selected, onSelect }: FilterChannelSelectProps) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger className="group flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2.5 text-left outline-none transition-colors hover:border-slate-700 data-[state=open]:border-blue-500/50">
        <span className="min-w-0 flex-1 truncate text-sm">
          <span className="font-medium text-white">{channelLabel(selected.name)}</span>
          <span className="text-slate-500"> · {conditionSummary(selected.filters.length)}</span>
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-slate-500 transition-transform group-data-[state=open]:rotate-180" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className="min-w-(--radix-dropdown-menu-trigger-width) p-0"
      >
        <ScrollArea className="max-h-96">
          <div className="p-1">
            {channels.map(channel => (
              <DropdownMenuItem
                key={channel.channelId}
                onSelect={() => onSelect(channel.channelId)}
                className="gap-3"
              >
                <span className="min-w-0 flex-1 truncate">{channelLabel(channel.name)}</span>
                <span className="shrink-0 text-[11px] text-slate-500">
                  {conditionSummary(channel.filters.length)}
                </span>
                {channel.channelId === selected.channelId && (
                  <Check className="size-3.5 shrink-0 text-blue-400" />
                )}
              </DropdownMenuItem>
            ))}
          </div>
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
