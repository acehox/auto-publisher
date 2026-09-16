import { LayoutDashboard, Megaphone } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { BackButton } from '@/components/layout/back-button';
import { StaticNavbar } from '@/components/layout/navbar-static';
import { SiteShell } from '@/components/layout/site-shell';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Page not found | Auto Publisher',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <SiteShell nav={<StaticNavbar />}>
      <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-24 text-center">
        {/* Concentric rings, sized in vmin so the set stays centred on the numeral
          at every viewport instead of clipping on a phone. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <div className="absolute aspect-square w-[70vmin] rounded-full border border-slate-800/50" />
          <div className="absolute aspect-square w-[105vmin] rounded-full border border-slate-800/35" />
          <div className="absolute aspect-square w-[145vmin] rounded-full border border-slate-800/20" />
        </div>

        <div className="relative flex flex-col items-center">
          <p className="select-none font-semibold text-[7rem] leading-none tracking-tight text-slate-800 sm:text-[10rem] lg:text-[13rem]">
            4
            <span className="relative inline-block">
              0
              <Megaphone
                aria-hidden
                className="absolute inset-0 m-auto size-[0.15em] left-1.5 text-slate-700"
              />
            </span>
            4
          </p>

          <h1 className="mt-10 text-xl font-semibold text-white sm:text-2xl">Page not found</h1>
          <p className="mt-4 max-w-[34ch] text-sm leading-relaxed text-slate-400 sm:text-base">
            This URL doesn&apos;t exist or it was moved.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <BackButton />
            <Button asChild size="lg">
              <Link href="/dashboard">
                <LayoutDashboard />
                Dashboard
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
