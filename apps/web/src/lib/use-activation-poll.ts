'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useEffectEvent, useRef, useState } from 'react';

const POLL_INTERVAL_MS = 3000;
// 60s ceiling ÷ 3s cadence = 20 soft refreshes before we give up.
const MAX_POLLS = 20;

export type ActivationPhase = 'activating' | 'gaveUp';

/**
 * Post-checkout activation poller. Paddle's client-side `checkout.completed`
 * redirects here before its webhook has necessarily written the subscription
 * row, so `hasSubscription` (the signal the invite/pending banners key off) can
 * still be false on arrival. While `active` is false this calls
 * `router.refresh()` every 3s — a soft RSC re-fetch that re-seeds the guild
 * list so `hasSubscription` observes the webhook write (reads
 * stay in Server Components, no client fetch) — until it flips true or a 60s
 * ceiling is hit.
 *
 * Returns the phase: 'activating' while polling, 'gaveUp' after the ceiling
 * (caller then shows a manual-refresh fallback). The caller owns the arming
 * guard (`enabled = ?success=true && !hasSubscription`) and stops rendering the
 * card once `active`, at which point the real-state banners take over.
 */
export function useActivationPoll(enabled: boolean, active: boolean): ActivationPhase {
  const router = useRouter();
  const [gaveUp, setGaveUp] = useState(false);
  const pollsRef = useRef(0);

  // useEffectEvent so the interval reads the latest `active` without
  // re-subscribing every render; `active`/`gaveUp` in the effect deps still
  // tear the timer down on hand-off or ceiling.
  const tick = useEffectEvent(() => {
    if (active) return;
    if (pollsRef.current >= MAX_POLLS) {
      setGaveUp(true);
      return;
    }
    pollsRef.current += 1;
    router.refresh();
  });

  useEffect(() => {
    if (!enabled || active || gaveUp) return;
    const id = setInterval(() => tick(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled, active, gaveUp]);

  return gaveUp ? 'gaveUp' : 'activating';
}
