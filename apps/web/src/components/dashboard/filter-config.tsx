'use client';

import { Filter as FilterIcon, Loader2, Plus, RotateCcw, Save } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConditionRow } from '@/components/dashboard/condition-row';
import { EmptyState } from '@/components/dashboard/empty-state';
import { FilterChannelSelect } from '@/components/dashboard/filter-channel-select';
import {
  DEFAULT_MATCH_MODE,
  filterValueError,
  MATCH_MODE_OPTIONS,
} from '@/components/dashboard/filter-meta';
import { useSiteConfig } from '@/components/site-config-context';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { getGuildRoles, setChannelFilters } from '@/lib/api/actions';
import { signInOnAuthExpired } from '@/lib/api/client-auth';
import type { FilterInput, FilterMatchMode, GuildChannel, GuildRole } from '@/lib/api/types';
import { useUnsavedChangesWarning } from '@/lib/use-unsaved-changes';
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
    conditions: conditions.map(c => ({ type: c.type, negate: c.negate, values: c.values })),
  });
}

/**
 * One rule at a time, chosen by a channel select. The channel rides the URL as
 * `?channel=<id>` rather than a route segment: it selects a view inside one
 * tool, not a separate resource, and the Channels tab already deep-links that
 * shape. The write goes through `history.replaceState` — Next's supported
 * shallow update — so switching costs no navigation, no RSC fetch, and no back
 * entry, leaving Back meaning "leave Filters".
 */
export function FilterManager({ guildId, channels }: FilterManagerProps) {
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

  const searchParams = useSearchParams();
  const requested = searchParams.get('channel');
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    requested && enabledChannels.some(c => c.channelId === requested)
      ? requested
      : (enabledChannels[0]?.channelId ?? null)
  );
  const selected = enabledChannels.find(c => c.channelId === selectedId) ?? enabledChannels[0];

  // The URL always names the channel on screen, including the default one, so
  // the address bar is shareable without the user having touched the select.
  useEffect(() => {
    if (!selected) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('channel') === selected.channelId) return;
    params.set('channel', selected.channelId);
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
  }, [selected]);

  if (enabledChannels.length === 0 || !selected) {
    return (
      <EmptyState
        icon={FilterIcon}
        title="No channels enabled yet"
        action={
          <Button asChild size="sm">
            <Link href={`/dashboard/${guildId}/channels`}>Go to Channels</Link>
          </Button>
        }
      >
        Filters apply per channel. Enable a channel first, then set its rule here.
      </EmptyState>
    );
  }

  return (
    <ChannelRuleEditor
      key={selected.channelId}
      guildId={guildId}
      channel={selected}
      roles={roles}
      rolesById={rolesById}
      selector={
        <FilterChannelSelect
          channels={enabledChannels}
          selected={selected}
          onSelect={setSelectedId}
        />
      }
    />
  );
}

/**
 * One channel's rule: a match mode plus an editable condition list, persisted on
 * demand via explicit Save (no autosave). Local state is the source of truth so
 * a background refresh never clobbers an edit; `baseline` holds the last-saved
 * rule, powering Revert and dirty detection.
 *
 * A real `<form>`, so Save is a submit and the browser's own semantics apply.
 * The channel select heads the form and the actions close it, both outside the
 * card; the action row is sticky because a rule can run to 50 conditions.
 */
function ChannelRuleEditor({
  guildId,
  channel,
  roles,
  rolesById,
  selector,
}: {
  guildId: string;
  channel: GuildChannel;
  roles: GuildRole[];
  rolesById: Record<string, GuildRole>;
  selector: ReactNode;
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

  // Half-built rows (no values) stay on screen but never persist. Values that
  // fail validation stay too — flagged in place — and count as dirty so Save
  // stays reachable; saving drops them.
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

  useUnsavedChangesWarning(dirty);

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
      toast.success('Filter rule saved.', {
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
      toast.error(`Up to ${filtersPerChannel} conditions per channel.`);
      return;
    }
    if (result.code === 'PREMIUM_INACTIVE') {
      toast.error('Premium is not active for this server.');
      return;
    }
    toast.error("Couldn't save the rule. Nothing was changed.");
  };

  const addCondition = () => {
    // The cap is never displayed — it surfaces only on the attempt past it.
    if (conditions.length >= filtersPerChannel) {
      toast.error(`Up to ${filtersPerChannel} conditions per channel.`);
      return;
    }
    setConditions(previous => [...previous, { type: 'keyword', negate: false, values: [] }]);
  };

  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        if (dirty && !saving) void save();
      }}
      className="space-y-4"
    >
      <div className="max-w-sm">{selector}</div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        {/* The sentence framing is what makes the feature self-explanatory. */}
        <div className="flex flex-wrap items-center gap-2 border-slate-800/70 border-b px-4 py-3.5">
          <span className="text-sm text-slate-200">Messages will be published when</span>
          <SegmentedControl
            options={MATCH_MODE_OPTIONS}
            value={matchMode}
            onChange={setMatchMode}
            size="sm"
          />
          <span className="text-sm text-slate-200">of these conditions match:</span>
        </div>

        {conditions.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-500">
            No conditions, add one to start filtering.
          </p>
        ) : (
          conditions.map((condition, index) => (
            <ConditionRow
              // Index key is fine: rows are only added/removed at the ends and
              // reconcile positionally with the local array.
              // biome-ignore lint/suspicious/noArrayIndexKey: positional rows
              key={index}
              condition={condition}
              roles={roles}
              rolesById={rolesById}
              onChange={next =>
                setConditions(previous => previous.map((c, i) => (i === index ? next : c)))
              }
              onRemove={() => setConditions(previous => previous.filter((_, i) => i !== index))}
            />
          ))
        )}

        <div className="border-slate-800/70 border-t px-4 py-3">
          <button
            type="button"
            onClick={addCondition}
            className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-blue-400 transition-colors hover:text-blue-300"
          >
            <Plus className="size-4" />
            Add condition
          </button>
        </div>
      </div>

      {/* Sticky so Save stays in reach through a 50-condition rule; the mobile
          offset clears the fixed bottom tab bar. */}
      <div className="sticky bottom-22 z-20 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-slate-800 bg-slate-950/85 px-3.5 py-3 backdrop-blur-sm md:bottom-4">
        <p className={cn('text-xs', dirty ? 'text-slate-200' : 'text-slate-500')}>
          {dirty ? 'Unsaved changes' : 'All changes saved'}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setMatchMode(baseline.matchMode);
            setConditions(baseline.conditions);
          }}
          disabled={!dirty || saving}
          className="text-slate-400 hover:text-white"
        >
          <RotateCcw />
          Revert
        </Button>
        <Button type="submit" size="sm" disabled={!dirty || saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          Save
        </Button>
      </div>
    </form>
  );
}
