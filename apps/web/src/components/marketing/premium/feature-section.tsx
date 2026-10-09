import { Check, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export const ICON_TILE = {
  blue: 'from-blue-500 to-blue-600 shadow-blue-500/20',
  purple: 'from-purple-500 to-purple-600 shadow-purple-500/20',
  cyan: 'from-cyan-500 to-cyan-600 shadow-cyan-500/20',
} as const;

export function IconTile({
  icon: Icon,
  color,
}: {
  icon: LucideIcon;
  color: keyof typeof ICON_TILE;
}) {
  return (
    <div
      className={`flex size-11 items-center justify-center rounded-xl bg-linear-to-br shadow-lg ${ICON_TILE[color]}`}
    >
      <Icon className="size-5.5 text-white" aria-hidden="true" />
    </div>
  );
}

export function FeaturePoint({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-slate-300">
      <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20">
        <Check className="size-3 text-blue-400" aria-hidden="true" />
      </div>
      <span>{children}</span>
    </li>
  );
}

export function FeatureSection({
  id,
  icon,
  color,
  eyebrow,
  title,
  body,
  visual,
  reverse = false,
  children,
}: {
  id: string;
  icon: LucideIcon;
  color: keyof typeof ICON_TILE;
  eyebrow: string;
  title: string;
  body: string;
  visual: ReactNode;
  reverse?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="grid scroll-mt-28 items-center gap-12 lg:grid-cols-2 lg:gap-16"
    >
      <div className={`max-w-xl ${reverse ? 'lg:order-2' : ''}`}>
        <div className="mb-5 flex items-center gap-3">
          <IconTile icon={icon} color={color} />
          <span className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            {eyebrow}
          </span>
        </div>
        <h2
          id={`${id}-title`}
          className="mb-4 text-3xl font-bold leading-tight text-white sm:text-4xl"
        >
          {title}
        </h2>
        <p className="mb-6 text-lg text-slate-400">{body}</p>
        <ul className="space-y-3">{children}</ul>
      </div>
      <div className={reverse ? 'lg:order-1' : ''}>{visual}</div>
    </section>
  );
}
