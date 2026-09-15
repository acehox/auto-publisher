'use client';

import {
  AtSign,
  Check,
  ChevronDown,
  type LucideIcon,
  TextAlignStart,
  Trash2,
  User,
  Webhook,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  filterValueError,
  KEYWORD_WILDCARD_EXAMPLES,
  MAX_VALUES,
  OPERATOR_OPTIONS,
  operatorLabel,
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
import { TagInput } from '@/components/ui/tag-input';
import type { FilterInput, FilterType, GuildRole } from '@/lib/api/types';
import { cn } from '@/lib/utils';

const FIELD_OPTIONS: { value: FilterType; label: string; icon: LucideIcon }[] = [
  { value: 'keyword', label: 'Content', icon: TextAlignStart },
  { value: 'author', label: 'Author', icon: User },
  { value: 'mention', label: 'Mention', icon: AtSign },
  { value: 'webhook', label: 'Webhook', icon: Webhook },
];

const selectClass =
  'flex h-8 cursor-pointer items-center gap-2 rounded-md border border-slate-700 px-2.5 text-xs text-slate-200 outline-none transition-colors hover:border-slate-600 disabled:cursor-not-allowed disabled:opacity-50';

interface ConditionRowProps {
  condition: FilterInput;
  roles: GuildRole[];
  rolesById: Record<string, GuildRole>;
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
  const roleIds = useMemo(() => values.filter(v => rolesById[v]), [values, rolesById]);
  const userIds = useMemo(() => values.filter(v => !rolesById[v]), [values, rolesById]);
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
              <span className="truncate">{operatorLabel(type, negate)}</span>
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

      <div className="col-span-2 space-y-2 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:pt-1">
        {type === 'keyword' && (
          <>
            <TagInput
              bare
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
              {KEYWORD_WILDCARD_EXAMPLES.map((example, index) => (
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
            bare
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
              bare
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
          <div className="space-y-2">
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  disabled={disabled}
                  className="w-full justify-between border-slate-700 font-normal text-slate-300"
                >
                  {roleIds.length > 0
                    ? `${roleIds.length} role${roleIds.length === 1 ? '' : 's'} selected`
                    : 'Pick roles…'}
                  <ChevronDown className="size-4 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-64 w-(--radix-dropdown-menu-trigger-width) overflow-y-auto"
              >
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
              </DropdownMenuContent>
            </DropdownMenu>

            {roleIds.length > 0 && (
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
                        style={{ backgroundColor: (role && roleColorHex(role.color)) ?? '#94a3b8' }}
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

            {/* One value list, two input affordances — roles above, raw ids here. */}
            <TagInput
              bare
              values={userIds}
              onChange={next => setValues([...roleIds, ...next])}
              disabled={disabled}
              maxItems={Math.max(0, max - roleIds.length)}
              placeholder="…or paste a user ID"
              validate={value => filterValueError('mention', value)}
            />
          </div>
        )}
      </div>

      {!disabled && (
        <button
          type="button"
          aria-label="Remove condition"
          onClick={handleRemove}
          className="col-start-2 row-start-1 cursor-pointer justify-self-end rounded-md p-1 text-slate-600 transition-colors hover:bg-red-500/10 hover:text-red-400 sm:col-start-3 sm:mt-1"
        >
          <Trash2 className="size-4" />
        </button>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this condition?</AlertDialogTitle>
            <AlertDialogDescription>
              {field.label} {operatorLabel(type, negate)} {values.length}{' '}
              {values.length === 1 ? 'value' : 'values'}. Removing it widens what the channel
              publishes.
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
