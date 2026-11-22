'use client';

import { ArrowRight, Tag, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useSiteConfig } from '@/components/site-config-context';
import { promoDeadlineShort, promoHeadline } from '@/lib/promo';

const dismissedKey = (code: string) => `promo-dismissed:${code}`;

/**
 * The current promo as a bar above the navbar, in the page flow so it scrolls away. The whole
 * bar links to `/premium`, where the code and its conditions are. The navbar is fixed, so this
 * publishes how much of the bar is still on screen as `--promo-offset`, which the navbar uses as
 * its `top`: it starts under the bar and docks at 0 once the bar has scrolled off. A dismissal is
 * remembered per code in this browser only; a new code shows again.
 */
export function PromoTopBanner() {
  const { promo } = useSiteConfig();
  const barRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!promo) return;
    try {
      setVisible(localStorage.getItem(dismissedKey(promo.code)) === null);
    } catch {
      setVisible(true);
    }
  }, [promo]);

  useEffect(() => {
    const bar = barRef.current;
    if (!visible || !bar) return;
    const root = document.documentElement;
    const sync = () => {
      const onScreen = Math.max(0, bar.offsetHeight - window.scrollY);
      root.style.setProperty('--promo-offset', `${onScreen}px`);
    };
    sync();
    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    return () => {
      window.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      root.style.removeProperty('--promo-offset');
    };
  }, [visible]);

  if (!promo || !visible) return null;

  function dismiss(code: string) {
    setVisible(false);
    try {
      localStorage.setItem(dismissedKey(code), '1');
    } catch {
      // Dismissed for this page view only.
    }
  }

  return (
    <aside
      ref={barRef}
      aria-label="Promotion"
      className="relative z-40 border-b border-green-500/30 bg-linear-to-r from-green-950 via-green-900/70 to-green-950"
    >
      <Link
        href="/premium"
        className="group mx-auto flex min-h-11 max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-12 py-2 text-sm text-slate-200 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-green-400"
      >
        <Tag className="size-4 shrink-0 text-green-400" aria-hidden="true" />
        <span>
          <span className="font-semibold text-white">{promoHeadline(promo)}</span> until{' '}
          {promoDeadlineShort(promo)}
        </span>
        <span className="inline-flex items-center gap-1 font-semibold text-green-300 group-hover:text-green-200">
          Get the code
          <ArrowRight
            className="size-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </span>
      </Link>
      <button
        type="button"
        onClick={() => dismiss(promo.code)}
        aria-label="Dismiss promotion"
        className="absolute right-1 top-0 inline-flex size-11 cursor-pointer items-center justify-center rounded-lg text-slate-300 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-400 sm:right-3"
      >
        <X className="size-5" aria-hidden="true" />
      </button>
    </aside>
  );
}
