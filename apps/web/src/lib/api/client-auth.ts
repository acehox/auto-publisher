'use client';

import { signIn } from 'next-auth/react';

/**
 * Seam 3 of reactive re-login (CONTEXT.md): a mutation whose result is
 * `{ ok: false, status: 401 }` means the Discord token expired. Fire re-login,
 * preserving the live URL + query so intent survives the round-trip (as
 * AuthRedirect does). Returns true when it handled an auth failure so the caller
 * can stop before showing a generic error.
 */
export function signInOnAuthExpired(status: number | undefined): boolean {
  if (status !== 401) return false;
  const callbackUrl = window.location.pathname + window.location.search;
  void signIn('discord', { callbackUrl });
  return true;
}
