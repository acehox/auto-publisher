'use client';

import { Tag } from 'lucide-react';
import { PromoCodeButton } from '@/components/promo-code-button';
import { useSiteConfig } from '@/components/site-config-context';
import { promoHeadline, promoTerms } from '@/lib/promo';
import { cn } from '@/lib/utils';

/**
 * The current promo code with its conditions and a copy button, on the surfaces where Premium
 * is bought (`/premium`, the upgrade card). Renders nothing without one (`SiteConfig.promo`),
 * so call sites place it unconditionally. The top bar (`PromoTopBanner`) links here.
 */
export function PromoBanner({ className }: { className?: string }) {
  const { promo } = useSiteConfig();
  if (!promo) return null;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-left',
        className
      )}
    >
      <Tag className="size-5 shrink-0 text-green-400" aria-hidden="true" />
      <div className="min-w-48 flex-1">
        <p className="font-semibold text-white">{promoHeadline(promo)}</p>
        <p className="text-sm text-slate-300">{promoTerms(promo)}</p>
      </div>
      <PromoCodeButton code={promo.code} />
    </div>
  );
}
