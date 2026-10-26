import { Copy } from '@ap/copy';
import type { ReactNode } from 'react';

function StepList({
  steps,
  detail,
}: {
  steps: readonly string[];
  detail?: (index: number) => ReactNode;
}) {
  return (
    <ol className="space-y-3">
      {steps.map((text, index) => (
        <li key={text} className="flex items-start gap-3">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-slate-700 font-mono text-[11px] text-slate-300">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm leading-relaxed text-slate-200">{text}</p>
            {detail?.(index)}
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * The one set of permission instructions in the product, reached from both the
 * enable guide and the Fix dialog so the two can never drift — and shared with
 * the bot's `/ap enable` and `/ap overview` through `@ap/copy`.
 */
export function PermissionSteps() {
  return (
    <StepList
      steps={Copy.permissions.steps}
      detail={index =>
        index === Copy.permissions.stepWithNames && (
          <div className="flex flex-wrap gap-2">
            {Copy.permissions.names.map(permission => (
              <span
                key={permission}
                className="rounded-md border border-slate-700 px-2 py-1 font-mono text-[11px] text-slate-300"
              >
                {permission}
              </span>
            ))}
          </div>
        )
      }
    />
  );
}

export function AnnouncementSteps() {
  return <StepList steps={Copy.channels.notAnnouncement.steps} />;
}
