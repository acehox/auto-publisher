'use client';

import { ChevronLeft, ChevronRight, Filter as FilterIcon, Loader2, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConditionRow } from '@/components/dashboard/condition-row';
import { EmptyState } from '@/components/dashboard/empty-state';
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
import { channelLabel, cn } from '@/lib/utils';

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
 * List-and-detail, not an accordion: enabled channels are a list, a rule is a
 * page. Desktop shows both; mobile drills in and back, which is what lets a
 * condition have the full width instead of four controls squeezed onto one line.
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

  // Deep link: the Channels tab's filter pill arrives with ?channel=<id>, which
  // selects that channel — on mobile that means opening its rule directly.
  const searchParams = useSearchParams();
  const requested = searchParams.get('channel');
  const deepLinked =
    requested && enabledChannels.some(c => c.channelId === requested) ? requested : null;

  const [selectedId, setSelectedId] = useState<string | null>(
    () => deepLinked ?? enabledChannels[0]?.channelId ?? null
  );
  // Mobile is one pane at a time; a deep link lands straight on the rule.
  const [mobileDetail, setMobileDetail] = useState(deepLinked !== null);

  const selected = enabledChannels.find(c => c.channelId === selectedId) ?? enabledChannels[0];

  if (enabledChannels.length === 0) {
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
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
      <div className={cn('lg:w-59 lg:shrink-0', mobileDetail && 'hidden lg:block')}>
        <p className="px-0.5 pb-2 text-[11px] uppercase tracking-wider text-slate-400">
          Enabled channels
        </p>
        <div className="space-y-1.5">
          {enabledChannels.map(channel => {
            const active = channel.channelId === selected?.channelId;
            const count = channel.filters.length;
            return (
              <button
                key={channel.channelId}
                type="button"
                onClick={() => {
                  setSelectedId(channel.channelId);
                  setMobileDetail(true);
                }}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
                  active
                    ? 'border-blue-500/40 bg-blue-500/10'
                    : 'border-slate-800 bg-slate-900 hover:border-slate-700'
                )}
              >
                <span className="min-w-0 flex-1 truncate text-sm text-slate-100">
                  {channelLabel(channel.name)}
                </span>
                <span className="whitespace-nowrap text-xs text-slate-400">
                  {count > 0 ? `${count} condition${count !== 1 ? 's' : ''}` : 'Publishes all'}
                </span>
                <ChevronRight className="size-3.5 shrink-0 text-slate-600 lg:hidden" />
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className={cn('min-w-0 flex-1 space-y-3', !mobileDetail && 'hidden lg:block')}>
          <div className="flex items-center gap-2.5 lg:hidden">
            <button
              type="button"
              onClick={() => setMobileDetail(false)}
              className="flex cursor-pointer items-center gap-1 text-xs text-blue-400"
            >
              <ChevronLeft className="size-3.5" />
              Channels
            </button>
            <span className="min-w-0 truncate font-semibold text-sm text-white">
              {channelLabel(selected.name)}
            </span>
          </div>
          <ChannelRuleEditor
            key={selected.channelId}
            guildId={guildId}
            channel={selected}
            roles={roles}
            rolesById={rolesById}
          />
        </div>
      )}
    </div>
  );
}

/**
 * One channel's rule: a match mode plus an editable condition list, persisted on
 * demand via explicit Save (no autosave). Local state is the source of truth so
 * a background refresh never clobbers an edit; `baseline` holds the last-saved
 * rule, powering Revert and dirty detection.
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
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        {/* The sentence framing is what makes the feature self-explanatory. */}
        <div className="flex flex-wrap items-center gap-2 border-slate-800/70 border-b px-4 py-3.5">
          <span className="text-sm text-slate-200">Publish a message when</span>
          <SegmentedControl
            options={MATCH_MODE_OPTIONS}
            value={matchMode}
            onChange={setMatchMode}
            size="sm"
          />
          <span className="text-sm text-slate-200">of these match</span>
        </div>

        {conditions.length === 0 ? (
          <p className="px-4 py-4 text-xs text-slate-500">
            No conditions — every message in {channelLabel(channel.name)} publishes. Add one to
            narrow it.
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

        <div className="px-4 py-3">
          <button
            type="button"
            onClick={addCondition}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 border-dashed px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-slate-600 hover:text-white"
          >
            <Plus className="size-3.5" />
            Add condition
          </button>
        </div>
      </div>

      {/* Sticky so Save is reachable from anywhere in a long rule; inert until dirty. */}
      <div className="sticky bottom-22 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/85 px-3.5 py-3 backdrop-blur-sm md:bottom-4">
        <span
          className={cn('min-w-32 flex-1 text-xs', dirty ? 'text-amber-400' : 'text-slate-500')}
        >
          {dirty ? 'Unsaved changes' : 'All changes saved'}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setMatchMode(baseline.matchMode);
            setConditions(baseline.conditions);
          }}
          disabled={!dirty || saving}
          className="text-slate-400 hover:text-white"
        >
          Revert
        </Button>
        <Button size="sm" onClick={save} disabled={!dirty || saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          Save changes
        </Button>
      </div>
    </div>
  );
}
