'use client';

import { Filter as FilterIcon, Hash, Loader2, Plus, RotateCcw, Save } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ConditionRow } from '@/components/dashboard/condition-row';
import {
  DEFAULT_MATCH_MODE,
  filterValueError,
  MATCH_MODE_OPTIONS,
} from '@/components/dashboard/filter-meta';
import { useSiteConfig } from '@/components/site-config-context';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { getGuildRoles, setChannelFilters } from '@/lib/api/actions';
import { signInOnAuthExpired } from '@/lib/api/client-auth';
import type { FilterInput, FilterMatchMode, GuildChannel, GuildRole } from '@/lib/api/types';
import { cn } from '@/lib/utils';

interface FilterManagerProps {
  guildId: string;
  channels: GuildChannel[];
}

/** Map a channel's stored conditions into the editable builder shape. */
function toInputs(channel: GuildChannel): FilterInput[] {
  return channel.filters.map(filter => ({
    type: filter.type,
    negate: filter.negate,
    values: [...filter.values],
  }));
}

/** Stable string of a rule's savable shape — used for dirty detection. */
function serializeRule(matchMode: FilterMatchMode, conditions: FilterInput[]): string {
  return JSON.stringify({
    matchMode,
    conditions: conditions.map(condition => ({
      type: condition.type,
      negate: condition.negate,
      values: condition.values,
    })),
  });
}

/**
 * Inline rule builder for one channel: a match-mode toggle + an editable
 * condition list, persisted on demand via explicit Save (no autosave). Local
 * state is the source of truth, so a background refresh never clobbers an edit;
 * `baseline` holds the last-saved rule to power Revert + dirty detection.
 */
function ChannelRuleEditor({
  guildId,
  channel,
  roles,
  rolesById,
}: {
  guildId: string;
  channel: GuildChannel;
  roles: GuildRole[];
  rolesById: Record<string, GuildRole>;
}) {
  const router = useRouter();
  const { filtersPerChannel } = useSiteConfig();
  const [baseline, setBaseline] = useState<{
    matchMode: FilterMatchMode;
    conditions: FilterInput[];
  }>(() => ({
    matchMode: channel.filterMode ?? DEFAULT_MATCH_MODE,
    conditions: toInputs(channel),
  }));
  const [matchMode, setMatchMode] = useState<FilterMatchMode>(baseline.matchMode);
  const [conditions, setConditions] = useState<FilterInput[]>(baseline.conditions);
  const [saving, setSaving] = useState(false);

  // Half-built rows (no values) stay in the UI but never persist. Values that fail
  // client-side validation stay too — flagged red in the chip input so they can be
  // fixed — and they count as dirty so Save stays reachable; saving drops them.
  const populated = conditions.filter(condition => condition.values.length >= 1);
  const cleaned = conditions.map(condition => ({
    ...condition,
    values: condition.values.filter(value => !filterValueError(condition.type, value)),
  }));
  const savable = cleaned.filter(condition => condition.values.length >= 1);
  const countValues = (rule: FilterInput[]) =>
    rule.reduce((total, condition) => total + condition.values.length, 0);
  const invalidCount = countValues(conditions) - countValues(cleaned);
  const dirty =
    serializeRule(matchMode, populated) !== serializeRule(baseline.matchMode, baseline.conditions);

  const save = async () => {
    setSaving(true);
    const result = await setChannelFilters(guildId, channel.channelId, {
      matchMode,
      conditions: savable,
    });
    setSaving(false);
    if (result.ok) {
      // Only now are the flagged values discarded — the user chose to save past them.
      setConditions(cleaned);
      setBaseline({ matchMode, conditions: savable });
      toast.success('Filters saved', {
        description:
          invalidCount > 0
            ? `${invalidCount} invalid ${invalidCount === 1 ? 'value was' : 'values were'} removed.`
            : undefined,
      });
      router.refresh();
      return;
    }
    if (signInOnAuthExpired(result.status)) return;
    if (result.code === 'FILTER_LIMIT') {
      toast.error(`Up to ${filtersPerChannel} conditions per channel`);
      return;
    }
    if (result.code === 'PREMIUM_INACTIVE') {
      toast.error('Premium is not active for this server.');
      return;
    }
    toast.error("Couldn't save filters", { description: 'Please try again.' });
  };

  const revert = () => {
    setMatchMode(baseline.matchMode);
    setConditions(baseline.conditions);
  };

  const addCondition = () => {
    if (conditions.length >= filtersPerChannel) {
      toast.error(`Up to ${filtersPerChannel} conditions per channel`);
      return;
    }
    setConditions(previous => [...previous, { type: 'keyword', negate: false, values: [] }]);
  };

  const updateCondition = (index: number, next: FilterInput) =>
    setConditions(previous => previous.map((condition, i) => (i === index ? next : condition)));

  const removeCondition = (index: number) =>
    setConditions(previous => previous.filter((_, i) => i !== index));

  return (
    <div className="space-y-3">
      {conditions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-sm text-slate-300">Messages will be published when</span>
          {conditions.length > 1 ? (
            <>
              <SegmentedControl
                options={MATCH_MODE_OPTIONS}
                value={matchMode}
                onChange={setMatchMode}
                size="sm"
              />
              <span className="text-sm text-slate-300">of these conditions match:</span>
            </>
          ) : (
            <span className="text-sm text-slate-300">this condition matches:</span>
          )}
        </div>
      )}

      {conditions.length === 0 ? (
        <p className="text-sm text-slate-500">
          No conditions — every message in this channel publishes. Add one to filter.
        </p>
      ) : (
        <div className="space-y-3">
          {conditions.map((condition, index) => (
            <ConditionRow
              // Index key is fine: rows are only added/removed at the ends and
              // reconcile positionally with the local array.
              // biome-ignore lint/suspicious/noArrayIndexKey: positional rows
              key={index}
              condition={condition}
              roles={roles}
              rolesById={rolesById}
              onChange={next => updateCondition(index, next)}
              onRemove={() => removeCondition(index)}
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <button
          type="button"
          onClick={addCondition}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-400 transition-colors hover:text-blue-300"
        >
          <Plus className="h-4 w-4" />
          Add condition
        </button>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={revert}
            disabled={!dirty || saving}
            className="text-slate-400 hover:text-white"
          >
            <RotateCcw className="h-4 w-4" />
            Revert
          </Button>
          <Button size="sm" onClick={save} disabled={!dirty || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}

export function FilterManager({ guildId, channels }: FilterManagerProps) {
  // Always editable: the page renders this only for an entitled guild (or any
  // guild on a self-host), and the backend re-checks with PREMIUM_INACTIVE.
  const [roles, setRoles] = useState<GuildRole[]>([]);

  const rolesById = useMemo(() => Object.fromEntries(roles.map(role => [role.id, role])), [roles]);

  useEffect(() => {
    let cancelled = false;
    // Roles power the mention picker + resolve role names for display. A failure
    // is non-fatal — the UI falls back to raw IDs.
    getGuildRoles(guildId)
      .then(fetched => {
        if (!cancelled) setRoles(fetched);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [guildId]);

  const enabledChannels = channels.filter(channel => channel.enabled);

  // Deep-link target: the Channels page links its filter pill here with
  // `?channel=<id>` so we open (and scroll to) that channel's accordion.
  const searchParams = useSearchParams();
  const requestedChannelId = searchParams.get('channel');
  const targetChannelId =
    requestedChannelId && enabledChannels.some(c => c.channelId === requestedChannelId)
      ? requestedChannelId
      : undefined;

  const accordionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!requestedChannelId) return;
    accordionRef.current
      ?.querySelector(`[data-channel-id="${requestedChannelId}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [requestedChannelId]);

  return (
    <div className="space-y-6">
      {enabledChannels.length === 0 ? (
        <Card className="border-slate-800 bg-slate-900/50 p-12 text-center">
          <FilterIcon className="mx-auto mb-4 h-16 w-16 text-slate-600" />
          <p className="mb-2 text-slate-400">No enabled channels yet</p>
          <p className="text-sm text-slate-500">
            Enable a channel on the{' '}
            <Link href={`/dashboard/${guildId}/channels`} className="text-blue-400 hover:underline">
              Channels
            </Link>{' '}
            tab, then add filters here.
          </p>
        </Card>
      ) : (
        <div ref={accordionRef}>
          <Accordion type="single" collapsible defaultValue={targetChannelId} className="space-y-4">
            {enabledChannels.map(channel => {
              const conditionCount = channel.filters.length;
              return (
                <AccordionItem
                  key={channel.channelId}
                  value={channel.channelId}
                  data-channel-id={channel.channelId}
                  className={cn(
                    'overflow-hidden rounded-xl border transition-colors',
                    conditionCount > 0
                      ? 'border-blue-500/20 bg-blue-500/4 hover:border-blue-500/40 data-[state=open]:border-blue-500/40'
                      : 'border-slate-800 bg-slate-900/50 hover:border-slate-700 data-[state=open]:border-slate-700'
                  )}
                >
                  <AccordionTrigger className="cursor-pointer px-6 py-4 hover:no-underline [&>svg]:text-slate-400">
                    <div className="flex flex-1 items-center gap-2">
                      <Hash className="h-5 w-5 text-blue-400" />
                      <span className="text-lg text-white">{channel.name}</span>
                      {conditionCount > 0 && (
                        <Badge className="ml-auto border-slate-600 bg-slate-700/50 text-xs text-slate-400">
                          {conditionCount} {conditionCount === 1 ? 'condition' : 'conditions'}
                        </Badge>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-6 pb-6">
                    <ChannelRuleEditor
                      guildId={guildId}
                      channel={channel}
                      roles={roles}
                      rolesById={rolesById}
                    />
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>
      )}
    </div>
  );
}
