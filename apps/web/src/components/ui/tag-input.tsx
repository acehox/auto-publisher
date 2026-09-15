'use client';

import { X } from 'lucide-react';
import { type KeyboardEvent, useState } from 'react';
import { cn } from '@/lib/utils';

interface TagInputProps {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  maxItems?: number;
  /** Returns why a value is invalid, or null if it's valid. */
  validate?: (value: string) => string | null;
  /** Transforms each entry before it is stored (e.g. trimming). */
  transform?: (value: string) => string;
  className?: string;
}

/**
 * Chip input: type + Enter/comma (or paste comma/newline-separated) to add,
 * click ✕ or Backspace-on-empty to remove. Click a chip to edit it in place
 * (Enter/blur commits, Escape cancels). Dedupes and enforces an optional max.
 *
 * Values that fail `validate` are still accepted and rendered as red chips — the
 * caller drops them on save. Discarding a typo on entry loses what the user typed
 * and leaves nothing to correct.
 *
 * `maxItems` is enforced but never displayed: nobody adding a third keyword needs
 * to know about the twenty-fifth, so the cap surfaces only as an error on the
 * attempt that exceeds it.
 */
export function TagInput({
  values,
  onChange,
  placeholder,
  disabled = false,
  maxItems,
  validate,
  transform,
  className,
}: TagInputProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');

  const atMax = maxItems !== undefined && values.length >= maxItems;
  const valueErrors = values.map(value => validate?.(value) ?? null);
  const firstInvalid = valueErrors.find(message => message !== null) ?? null;

  const commit = (raw: string) => {
    const parts = raw
      .split(/[\n,]/)
      .map(part => part.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      setDraft('');
      return;
    }

    const next = [...values];
    let localError: string | null = null;

    for (const part of parts) {
      const candidate = transform ? transform(part) : part;
      if (maxItems !== undefined && next.length >= maxItems) {
        localError = `Maximum ${maxItems} values`;
        break;
      }
      if (next.includes(candidate)) continue;
      // Invalid entries are kept (flagged) so the user can fix them in place.
      next.push(candidate);
    }

    if (next.length !== values.length) onChange(next);
    setError(localError);
    setDraft('');
  };

  const startEditing = (index: number) => {
    if (disabled) return;
    setEditingIndex(index);
    setEditDraft(values[index]);
    setError(null);
  };

  const cancelEditing = () => {
    setEditingIndex(null);
    setEditDraft('');
  };

  const commitEdit = (index: number) => {
    const raw = editDraft.trim();
    // Empty edit removes the chip.
    if (raw === '') {
      onChange(values.filter((_, i) => i !== index));
      cancelEditing();
      return;
    }
    const candidate = transform ? transform(raw) : raw;
    if (candidate !== values[index]) {
      // Dedupe against every other chip (allow keeping the same value at this slot).
      onChange(
        values.some((value, i) => i !== index && value === candidate)
          ? values.filter((_, i) => i !== index)
          : values.map((value, i) => (i === index ? candidate : value))
      );
    }
    setError(null);
    cancelEditing();
  };

  const handleEditKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit(index);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEditing();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commit(draft);
    } else if (event.key === 'Backspace' && draft === '' && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div className={className}>
      <div
        className={cn(
          'flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/50 p-2',
          disabled && 'opacity-50'
        )}
      >
        {values.map((value, index) =>
          editingIndex === index ? (
            <input
              // biome-ignore lint/suspicious/noArrayIndexKey: editing a fixed slot
              key={`edit-${index}`}
              // biome-ignore lint/a11y/noAutofocus: focus the chip the user clicked to edit
              autoFocus
              value={editDraft}
              onChange={event => {
                setEditDraft(event.target.value);
                setError(null);
              }}
              onKeyDown={event => handleEditKeyDown(event, index)}
              onBlur={() => commitEdit(index)}
              className="min-w-16 rounded-md border border-blue-500/60 bg-slate-900 px-2 py-0.5 font-mono text-sm text-white outline-none"
              style={{ width: `${Math.max(editDraft.length + 1, 3)}ch` }}
            />
          ) : (
            <span
              key={value}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-sm',
                valueErrors[index]
                  ? 'border-red-500/60 bg-red-500/10 text-red-300'
                  : 'border-transparent bg-slate-700 text-slate-200'
              )}
            >
              {disabled ? (
                value
              ) : (
                <button
                  type="button"
                  onClick={() => startEditing(index)}
                  className="cursor-text rounded-sm hover:text-white"
                  title={valueErrors[index] ?? 'Click to edit'}
                >
                  {value}
                </button>
              )}
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Remove ${value}`}
                  onClick={() => onChange(values.filter((_, i) => i !== index))}
                  className={cn(
                    'hover:text-white',
                    valueErrors[index] ? 'text-red-400' : 'text-slate-400'
                  )}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          )
        )}
        {!disabled && !atMax && editingIndex === null && (
          <input
            value={draft}
            onChange={event => {
              setDraft(event.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            onBlur={() => draft.trim() && commit(draft)}
            placeholder={values.length === 0 ? placeholder : undefined}
            className="min-w-32 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
          />
        )}
      </div>
      {(error ?? firstInvalid) && (
        <p className="mt-1 text-xs text-red-400">
          {error ?? `${firstInvalid}. Highlighted values aren't saved.`}
        </p>
      )}
    </div>
  );
}
