'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  /**
   * ReactNode, not string, so an option can carry an adornment — the billing
   * toggle hangs a "Save N%" pill off "Yearly". Plain strings still work.
   */
  label: ReactNode;
  /** Accessible name, required when `label` isn't readable text on its own. */
  ariaLabel?: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

/** A button-group toggle for small mutually-exclusive enum choices. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  size = 'md',
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      className={cn(
        'inline-flex rounded-lg border border-slate-700 bg-slate-800/50 p-0.5',
        className
      )}
    >
      {options.map(option => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            aria-label={option.ariaLabel}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
              active
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-slate-200 disabled:hover:text-slate-400'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
