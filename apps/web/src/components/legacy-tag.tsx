/** MIGRATION: the mark of a server still in legacy mode. Removed with the legacy UX at sunset. */
export function LegacyTag() {
  return (
    <span className="shrink-0 rounded border border-amber-500/45 bg-amber-500/10 px-2 py-0.5 font-semibold text-[10px] uppercase tracking-wider text-amber-400">
      Legacy
    </span>
  );
}
