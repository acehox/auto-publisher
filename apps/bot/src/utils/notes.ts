import type { OverLimitState } from '@ap/copy';

export function formatNotes(items: (string | false | null | undefined)[]): string {
  const bullets = items.filter(Boolean) as string[];
  if (bullets.length === 0) return '';
  return `\n\n-# **Note:**\n${bullets.map(b => `-# - ${b}`).join('\n')}`;
}

/**
 * Premium decides whether Rollover exists, the server's setting whether it runs.
 * A failed read (`null`) reads as Free: promising a Rollover that will not run is
 * the worse error.
 */
export const overLimitState = (
  plan: { premium: boolean; rolloverEnabled: boolean } | null
): OverLimitState => (!plan?.premium ? 'upsell' : plan.rolloverEnabled ? 'on' : 'off');
