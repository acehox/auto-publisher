'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/** The promo code as one copyable control. */
export function PromoCodeButton({ code, className }: { code: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // The code is selectable text, so a blocked clipboard costs nothing.
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={copyCode}
        aria-label={`Copy code ${code}`}
        className={cn(
          'inline-flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border border-dashed border-green-400/50 bg-slate-950/60 px-3 py-2 text-sm font-semibold text-green-300 transition-colors hover:border-green-400 hover:text-green-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-400',
          className
        )}
      >
        <span className="select-all font-mono tracking-wide">{code}</span>
        <span className="inline-flex items-center gap-1.5 border-l border-green-400/30 pl-2.5">
          {copied ? (
            <Check className="size-4" aria-hidden="true" />
          ) : (
            <Copy className="size-4" aria-hidden="true" />
          )}
          {copied ? 'Copied' : 'Copy'}
        </span>
      </button>
      <span className="sr-only" role="status">
        {copied ? 'Code copied' : ''}
      </span>
    </>
  );
}
