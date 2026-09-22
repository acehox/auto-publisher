'use client';

import { Copy } from '@ap/copy';
import {
  AtSign,
  Check,
  ChevronDown,
  Loader2,
  type LucideIcon,
  TextAlignStart,
  Trash2,
  TriangleAlert,
  User,
  Webhook,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  filterValueError,
  MAX_VALUES,
  OPERATOR_OPTIONS,
  type RolesStatus,
  roleColorHex,
} from '@/components/dashboard/filter-meta';
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
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TagInput } from '@/components/ui/tag-input';
import type { FilterInput, FilterType, GuildRole } from '@/lib/api/types';
import { cn } from '@/lib/utils';

const FIELD_ICONS: Record<FilterType, LucideIcon> = {
  keyword: TextAlignStart,
  author: User,
  mention: AtSign,
  webhook: Webhook,
};

// Labels and order come from `@ap/copy`; only the icons are web-side.
const FIELD_OPTIONS: { value: FilterType; label: string; icon: LucideIcon }[] =
  Copy.filters.fields.order.map(value => ({
    value,
    label: Copy.filters.fields.labels[value],
    icon: FIELD_ICONS[value],
  }));

const selectClass =
  'flex h-9 cursor-pointer items-center gap-2 rounded-md border border-slate-700 px-2.5 text-xs text-slate-200 outline-none transition-colors hover:border-slate-600 disabled:cursor-not-allowed disabled:opacity-50';

interface ConditionRowProps {
  condition: FilterInput;
  roles: GuildRole[];
  rolesById: Record<string, GuildRole>;
  rolesStatus: RolesStatus;
  onRetryRoles: () => void;
  disabled?: boolean;
  onChange: (next: FilterInput) => void;
  onRemove: () => void;
}

/**
 * One condition, read as a sentence: field, operator, values, delete. Laid out
 * with explicit grid placement rather than two components, so the single-line
 * desktop row and the stacked phone row share one DOM order — controls, values,
 * delete — and therefore one tab order.
 *
 * Fully controlled — edits bubble up so the parent persists the whole rule.
 * Deleting a populated row asks first; an empty one goes silently.
 */
export function ConditionRow({
  condition,
  roles,
  rolesById,
  rolesStatus,
  onRetryRoles,
  disabled = false,
  onChange,
  onRemove,
}: ConditionRowProps) {
  const { type, negate, values } = condition;
  const max = MAX_VALUES[type];
  const [confirmOpen, setConfirmOpen] = useState(false);

  const field = FIELD_OPTIONS.find(option => option.value === type) ?? FIELD_OPTIONS[0];
  const FieldIcon = field.icon;

  // Mention is stored as one value list but edited as roles (picker) + user IDs.
  // The split is only meaningful once the role list is known: deriving it from an
  // empty `rolesById` files every saved role id under "user ids", so a slow or
  // failed fetch silently reshuffled the row. Until then the values render
  // read-only and neither bucket claims them.
  const rolesKnown = rolesStatus === 'ready';
  const roleIds = useMemo(
    () => (rolesKnown ? values.filter(v => rolesById[v]) : []),
    [values, rolesById, rolesKnown]
  );
  const userIds = useMemo(
    () => (rolesKnown ? values.filter(v => !rolesById[v]) : []),
    [values, rolesById, rolesKnown]
  );
  const selectedRoleSet = useMemo(() => new Set(roleIds), [roleIds]);

  const setValues = (next: string[]) => onChange({ ...condition, values: next });

  const changeField = (nextType: FilterType) => {
    if (nextType === type) return;
    // Values are field-specific; reset when the field changes.
    onChange({ type: nextType, negate: false, values: [] });
  };

  const toggleRole = (roleId: string) => {
    if (selectedRoleSet.has(roleId)) {
      setValues([...roleIds.filter(id => id !== roleId), ...userIds]);
      return;
    }
    if (roleIds.length + userIds.length >= max) return;
    setValues([...roleIds, roleId, ...userIds]);
  };

  const handleRemove = () => {
    if (values.length > 0) {
      setConfirmOpen(true);
      return;
    }
    onRemove();
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2.5 border-slate-800/70 border-b px-4 py-3.5 last:border-b-0 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Condition field"
              disabled={disabled}
              className={selectClass}
            >
              <FieldIcon className="size-3.5 shrink-0 text-blue-400" />
              <span className="truncate">{field.label}</span>
              <ChevronDown className="size-3 shrink-0 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-40">
            {FIELD_OPTIONS.map(option => {
              const OptionIcon = option.icon;
              return (
                <DropdownMenuItem key={option.value} onSelect={() => changeField(option.value)}>
                  <OptionIcon className="size-4 text-slate-400" />
                  <span className="flex-1">{option.label}</span>
                  {option.value === type && <Check className="size-4 text-blue-400" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Condition operator"
              disabled={disabled}
              className={cn(selectClass, 'text-slate-300')}
            >
              <span className="truncate">{Copy.filters.operators.label(type, negate)}</span>
              <ChevronDown className="size-3 shrink-0 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-40">
            {OPERATOR_OPTIONS[type].map(option => (
              <DropdownMenuItem
                key={String(option.negate)}
                onSelect={() => onChange({ ...condition, negate: option.negate })}
              >
                <span className="flex-1">{option.label}</span>
                {option.negate === negate && <Check className="size-4 text-blue-400" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="col-span-2 space-y-2 sm:col-span-1 sm:col-start-2 sm:row-start-1">
        {type === 'keyword' && (
          <>
            <TagInput
              values={values}
              onChange={setValues}
              disabled={disabled}
              maxItems={max}
              placeholder="Type a keyword…"
              transform={value => value.trim().toLowerCase()}
              validate={value => filterValueError('keyword', value)}
            />
            <p className="text-[11px] leading-relaxed text-slate-500">
              Whole words. Use * as a wildcard:{' '}
              {Copy.filters.keyword.wildcards.map((example, index) => (
                <span key={example.pattern}>
                  {index > 0 && ', '}
                  <code className="font-mono text-slate-400">{example.pattern}</code>
                </span>
              ))}
              .
            </p>
          </>
        )}

        {type === 'webhook' && (
          <TagInput
            values={values}
            onChange={setValues}
            disabled={disabled}
            maxItems={max}
            placeholder="Paste a webhook ID…"
            validate={value => filterValueError('webhook', value)}
          />
        )}

        {type === 'author' && (
          <>
            <TagInput
              values={values}
              onChange={setValues}
              disabled={disabled}
              maxItems={max}
              placeholder="Paste a user ID…"
              validate={value => filterValueError('author', value)}
            />
            <p className="text-[11px] leading-relaxed text-slate-500">
              Enable Developer Mode in Discord, then right-click a user → Copy User ID.
            </p>
          </>
        )}

        {type === 'mention' && (
          <div className="space-y-2.5">
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  disabled={disabled || !rolesKnown}
                  className="h-9 w-full justify-between border-slate-700 bg-slate-800/50 font-normal text-slate-300 hover:bg-slate-800 hover:text-white dark:bg-slate-800/50 dark:hover:bg-slate-800"
                >
                  {rolesStatus === 'loading'
                    ? 'Loading roles…'
                    : rolesStatus === 'error'
                      ? "Roles didn't load"
                      : roleIds.length > 0
                        ? `${roleIds.length} role${roleIds.length === 1 ? '' : 's'} selected`
                        : 'Pick roles…'}
                  {rolesStatus === 'loading' ? (
                    <Loader2 className="size-4 animate-spin opacity-60" />
                  ) : (
                    <ChevronDown className="size-4 opacity-60" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-(--radix-dropdown-menu-trigger-width) p-0"
              >
                <ScrollArea className="max-h-64">
                  <div className="p-1">
                    {roles.length === 0 && (
                      <div className="px-3 py-2 text-sm text-slate-500">No roles found</div>
                    )}
                    {roles.map(role => {
                      const selected = selectedRoleSet.has(role.id);
                      return (
                        <DropdownMenuItem
                          key={role.id}
                          className={cn('py-1.5', selected && 'bg-slate-800/60')}
                          onSelect={event => {
                            event.preventDefault();
                            toggleRole(role.id);
                          }}
                        >
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: roleColorHex(role.color) ?? '#94a3b8' }}
                          />
                          <span className="flex-1 truncate">{role.name}</span>
                          {selected && <Check className="size-4 shrink-0 text-blue-400" />}
                        </DropdownMenuItem>
                      );
                    })}
                  </div>
                </ScrollArea>
              </DropdownMenuContent>
            </DropdownMenu>

            {rolesStatus === 'error' && (
              <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-amber-400">
                <TriangleAlert className="size-3.5 shrink-0" />
                Couldn't load this server's roles.
                <button
                  type="button"
                  onClick={onRetryRoles}
                  className="cursor-pointer underline underline-offset-2 hover:text-amber-300"
                >
                  Try again
                </button>
              </p>
            )}

            {/* Roles unknown: show what is saved, but claim nothing about what
                each value is. Editing resumes once the list resolves. */}
            {!rolesKnown && values.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {values.map(id => (
                  <span
                    key={id}
                    className="inline-flex items-center rounded-md bg-slate-800 px-2 py-0.5 font-mono text-slate-400 text-sm"
                  >
                    {id}
                  </span>
                ))}
              </div>
            )}

            {rolesKnown && roleIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {roleIds.map(id => {
                  const role = rolesById[id];
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 px-2 py-0.5 text-xs text-slate-200"
                    >
                      <span
                        className="size-1.5 rounded-full"
                        style={{
                          backgroundColor: (role && roleColorHex(role.color)) ?? '#94a3b8',
                        }}
                      />
                      {role ? role.name : id}
                      {!disabled && (
                        <button
                          type="button"
                          aria-label="Remove role"
                          onClick={() => toggleRole(id)}
                          className="cursor-pointer text-slate-500 hover:text-white"
                        >
                          <X className="size-3" />
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
            )}

            {/* One value list, two input affordances — roles above, raw ids here.
                Labelled and boxed because unlabelled it read as caption text under
                the picker rather than as a field. */}
            {rolesKnown && (
              <div className="space-y-1">
                <p className="text-[11px] text-slate-500">Or add specific users</p>
                <TagInput
                  values={userIds}
                  onChange={next => setValues([...roleIds, ...next])}
                  disabled={disabled}
                  maxItems={Math.max(0, max - roleIds.length)}
                  placeholder="Paste a user ID…"
                  validate={value => filterValueError('mention', value)}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {!disabled && (
        <button
          type="button"
          aria-label="Remove condition"
          onClick={handleRemove}
          className="col-start-2 row-start-1 cursor-pointer justify-self-end rounded-md p-1 text-slate-600 transition-colors hover:bg-red-500/10 hover:text-red-400 sm:col-start-3 sm:mt-1.5"
        >
          <Trash2 className="size-4" />
        </button>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{Copy.filters.condition.removeTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {Copy.filters.condition.removeBody(type, negate, values.length)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-500"
              onClick={onRemove}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
