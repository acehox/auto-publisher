// Canonical publish permissions (PUBLISH_PERMISSION_FLAGS in @ap/utils). Always
// all three rather than a computed missing-subset: when ViewChannel is absent
// Discord's permission math collapses the missing set to just ViewChannel (the
// channel is invisible), which would have the admin grant one permission that
// still won't publish. "Grant these three" is always correct.
const PUBLISH_PERMISSIONS = ['View Channel', 'Send Messages', 'Manage Messages'];

const STEPS = [
  'In Discord, select the channel → Edit Channel → Permissions.',
  'Add Auto Publisher (or its role) and grant all three permissions:',
  'Save. Publishing starts on the next message.',
];

/**
 * The one set of permission instructions in the product, reached from both the
 * enable guide and the Fix dialog so the two can never drift.
 */
export function PermissionSteps() {
  return (
    <ol className="space-y-3">
      {STEPS.map((text, index) => (
        <li key={text} className="flex items-start gap-3">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-slate-700 font-mono text-[11px] text-slate-300">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm leading-relaxed text-slate-200">{text}</p>
            {index === 1 && (
              <div className="flex flex-wrap gap-2">
                {PUBLISH_PERMISSIONS.map(permission => (
                  <span
                    key={permission}
                    className="rounded-md border border-slate-700 px-2 py-1 font-mono text-[11px] text-slate-300"
                  >
                    {permission}
                  </span>
                ))}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
