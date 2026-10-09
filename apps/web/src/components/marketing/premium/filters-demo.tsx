import { Copy, type FilterField } from '@ap/copy';
import { Ban, CheckCheck, type LucideIcon, Rss, User } from 'lucide-react';
import { DemoWindow } from './demo-window';

const CONDITIONS: { field: FilterField; negate: boolean; value: string }[] = [
  { field: 'webhook', negate: false, value: 'Releases' },
  { field: 'keyword', negate: true, value: '[draft]' },
];

interface DemoMessage {
  author: string;
  icon: LucideIcon;
  app?: boolean;
  text: string;
  /** Absent = published; otherwise why the rule skipped it. */
  skippedBecause?: string;
}

const MESSAGES: DemoMessage[] = [
  { author: 'Releases', icon: Rss, app: true, text: 'v2.4 is out. Full changelog inside.' },
  {
    author: 'Releases',
    icon: Rss,
    app: true,
    text: '[draft] v2.5 notes, not final',
    skippedBecause: 'contains “[draft]”',
  },
  {
    author: 'acehox',
    icon: User,
    text: 'Quick reminder: game night is Friday!',
    skippedBecause: 'not from Releases',
  },
];

function Message({ author, icon: Icon, app, text, skippedBecause }: DemoMessage) {
  const published = skippedBecause === undefined;
  return (
    <li
      className={`flex gap-2.75 rounded-[11px] border px-3 py-2.5 ${published ? 'border-green-400/25 bg-green-400/5' : 'border-transparent'}`}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-slate-700 to-slate-800 text-white">
        <Icon className="size-4" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[13.5px] font-semibold text-slate-200">{author}</span>
          {app && (
            <span className="rounded bg-indigo-500 px-1 text-[10px] font-semibold leading-4 text-white">
              APP
            </span>
          )}
        </div>
        <p className={`mt-0.5 text-[13.5px] ${published ? 'text-slate-300' : 'text-slate-500'}`}>
          {text}
        </p>
        {published ? (
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-green-300">
            <CheckCheck className="size-4" aria-hidden="true" /> Published to all servers
          </p>
        ) : (
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] text-slate-500">
            <Ban className="size-3.5" aria-hidden="true" /> Not published · {skippedBecause}
          </p>
        )}
      </div>
    </li>
  );
}

/** The rule is worded with the dashboard's own vocabulary (`Copy.filters`), so the demo cannot drift from the editor. */
export function FiltersDemo() {
  return (
    <DemoWindow channel="game-updates">
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
          <p className="text-xs text-slate-400">
            {Copy.filters.rule.lead}{' '}
            <span className="rounded bg-blue-500/15 px-1.5 py-0.5 font-semibold text-blue-300">
              {Copy.filters.matchModes.labels.all}
            </span>{' '}
            {Copy.filters.rule.tail}
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {CONDITIONS.map(condition => (
              <li key={condition.field} className="flex flex-wrap items-center gap-1.5 text-[13px]">
                <span className="font-medium text-slate-200">
                  {Copy.filters.fields.labels[condition.field]}
                </span>
                <span className="text-slate-400">
                  {Copy.filters.operators.label(condition.field, condition.negate)}
                </span>
                <span className="rounded-md border border-slate-700 bg-slate-800/60 px-1.5 py-0.5 font-mono text-[12px] text-slate-200">
                  {condition.value}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <ul className="space-y-1">
          {MESSAGES.map(message => (
            <Message key={message.text} {...message} />
          ))}
        </ul>
      </div>
    </DemoWindow>
  );
}
