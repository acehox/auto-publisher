import { ArrowRight, BadgeCheck, InfinityIcon, type LucideIcon } from 'lucide-react';
import { type ICON_TILE, IconTile } from './feature-section';

interface Perk {
  icon: LucideIcon;
  color: keyof typeof ICON_TILE;
  title: string;
  free: string;
  premium: string;
  body: string;
}

function PerkCard({ icon, color, title, free, premium, body }: Perk) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:p-8">
      <div className="mb-5 flex items-center gap-3">
        <IconTile icon={icon} color={color} />
        <h3 className="text-xl font-semibold text-white">{title}</h3>
      </div>
      <p className="mb-3 flex flex-wrap items-center gap-2 text-lg font-semibold">
        <span className="text-slate-500">{free}</span>
        <ArrowRight className="size-4 text-slate-600" aria-label="becomes" />
        <span className="text-blue-300">{premium}</span>
      </p>
      <p className="text-slate-400">{body}</p>
    </div>
  );
}

/** Support wording tracks Terms §3.5: same channels on both plans, Premium handled first. Never a response time. */
export function PremiumPerks({ freeChannelLimit }: { freeChannelLimit: number }) {
  return (
    <section aria-label="More with Premium" className="grid gap-6 md:grid-cols-2">
      <PerkCard
        icon={InfinityIcon}
        color="cyan"
        title="Unlimited channels"
        free={`Up to ${freeChannelLimit}`}
        premium="Unlimited"
        body="No limit on announcement channels per server."
      />
      <PerkCard
        icon={BadgeCheck}
        color="purple"
        title="Priority support"
        free="Standard"
        premium="Priority"
        body="Your requests are handled before Free ones, by email or in our Discord support server."
      />
    </section>
  );
}
