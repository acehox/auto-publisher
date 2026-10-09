import { ArrowRight, Check, Clock, RotateCwFadingClock, X, Zap } from 'lucide-react';
import { DemoWindow } from './demo-window';

const HOURLY_LIMIT = 10;
const POSTED = 14;
const MESSAGES = Array.from({ length: POSTED }, (_, index) => index + 1);
const HELD = MESSAGES.slice(HOURLY_LIMIT);

type ChipState = 'published' | 'waiting' | 'dropped';

const CHIP_STYLES: Record<ChipState, string> = {
  published: 'border-green-400/30 bg-green-400/12 text-green-300',
  waiting: 'border-amber-400/40 bg-amber-400/12 text-amber-300',
  dropped: 'border-slate-700/80 bg-slate-800/30 text-slate-600 line-through',
};

const LEGEND: { state: ChipState; label: string; icon: typeof Check }[] = [
  { state: 'published', label: 'Published', icon: Check },
  { state: 'waiting', label: 'Waiting for the reset', icon: Clock },
  { state: 'dropped', label: 'Never published', icon: X },
];

function Chip({ number, state }: { number: number; state: ChipState }) {
  return (
    <li
      className={`flex aspect-square items-center justify-center rounded-md border text-[11px] font-semibold tabular-nums ${CHIP_STYLES[state]}`}
    >
      {number}
    </li>
  );
}

function Lane({
  label,
  caption,
  overLimit,
  premium = false,
}: {
  label: string;
  caption: string;
  overLimit: ChipState;
  premium?: boolean;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3 text-xs">
        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-200">
          {premium && <Zap className="size-3.5 text-yellow-500" aria-hidden="true" />}
          {label}
        </span>
        <span className="text-slate-500">{caption}</span>
      </div>
      {/* The caption carries the meaning for screen readers; 14 numbered tiles would not. */}
      <ol aria-hidden="true" className="grid grid-cols-7 gap-1.5 sm:grid-cols-14">
        {MESSAGES.map(number => (
          <Chip
            key={number}
            number={number}
            state={number <= HOURLY_LIMIT ? 'published' : overLimit}
          />
        ))}
      </ol>
    </div>
  );
}

/** Static on purpose: the still frame is the whole story, so there is nothing for reduced motion to lose. */
export function RolloverDemo() {
  return (
    <DemoWindow
      channel="patch-notes"
      badge={
        <span className="rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-[11px] font-medium text-slate-400">
          {POSTED} messages in one hour
        </span>
      }
    >
      <div className="space-y-5">
        <Lane
          label="Free"
          caption={`${HOURLY_LIMIT} published · ${HELD.length} never published`}
          overLimit="dropped"
        />
        <div className="h-px bg-indigo-400/8" />
        <div>
          <Lane
            label="Premium"
            caption={`${HOURLY_LIMIT} published · ${HELD.length} waiting`}
            overLimit="waiting"
            premium
          />
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-green-400/25 bg-green-400/5 p-3">
            <RotateCwFadingClock className="size-4 shrink-0 text-green-400" aria-hidden="true" />
            <div className="min-w-44 flex-1 text-xs">
              <p className="font-semibold text-green-300">Limit resets</p>
              <p className="text-slate-400">Published in the order they were posted</p>
            </div>
            <ol aria-hidden="true" className="flex items-center gap-1">
              {HELD.map((number, index) => (
                <li key={number} className="flex items-center gap-1">
                  {index > 0 && <ArrowRight className="size-3 text-green-400/50" />}
                  <span
                    className={`flex size-7 items-center justify-center rounded-md border text-[11px] font-semibold tabular-nums ${CHIP_STYLES.published}`}
                  >
                    {number}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-indigo-400/8 pt-4 text-[11px] text-slate-400">
          {LEGEND.map(({ state, label, icon: Icon }) => (
            <li key={state} className="inline-flex items-center gap-1.5">
              <span
                className={`flex size-4 items-center justify-center rounded border ${CHIP_STYLES[state]}`}
              >
                <Icon className="size-2.5" aria-hidden="true" />
              </span>
              {label}
            </li>
          ))}
        </ul>
      </div>
    </DemoWindow>
  );
}
