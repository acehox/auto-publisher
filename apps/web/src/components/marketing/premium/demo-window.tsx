import { Hash } from 'lucide-react';
import type { ReactNode } from 'react';

/** The hero mockup's window chrome, without its tilt and float, so the Premium demos read as the same family. */
export function DemoWindow({
  channel,
  badge,
  children,
}: {
  channel: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="absolute -inset-x-[6%] -top-[8%] -bottom-[10%] bg-radial-[circle_closest-side] from-blue-600/25 to-transparent to-72% blur-[20px]"
      />
      <div className="relative overflow-hidden rounded-3xl border border-indigo-400/16 bg-slate-900 shadow-[0_40px_90px_-30px_rgba(0,0,0,.85),0_0_0_1px_rgba(120,150,255,.04)]">
        <div className="flex items-center justify-between gap-3 border-b border-indigo-400/8 px-4 py-3.25">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Hash className="size-4 text-slate-500" aria-hidden="true" />
            {channel}
          </div>
          {badge}
        </div>
        <div className="p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}
