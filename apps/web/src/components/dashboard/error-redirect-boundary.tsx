'use client';

import { useRouter } from 'next/navigation';
import { Component, type ReactNode, useEffect } from 'react';
import { AuthExpiredSignal, BotAbsentSignal, TransientErrorSignal } from '@/lib/api/auth-expired';

interface ErrorBoundaryProps {
  fallback: ReactNode;
  /**
   * Rendered instead of `fallback` when the caught error is an AuthExpiredSignal
   * (dead Discord token), so the boundary can route to re-login rather than the
   * generic server-list redirect. Omit to treat auth-expiry like any
   * other error (used by the badge boundary, which just renders null).
   */
  authFallback?: ReactNode;
  /**
   * Rendered instead of `fallback` when the caught error is a TransientErrorSignal
   * (upstream 5xx / network blip), so the boundary can offer an in-place retry
   * rather than ejecting to the server list. Omit to treat a transient
   * failure like any other error (redirect via `fallback`).
   */
  transientFallback?: ReactNode;
  /**
   * Rendered instead of `fallback` on a BotAbsentSignal, to offer the bot invite
   * in place. Omit to keep the redirect.
   */
  botAbsentFallback?: ReactNode;
  /**
   * Clears a caught error when any element changes between renders (shallow
   * compare), re-mounting `children` so a streamed promise is re-consumed. A
   * class error boundary never self-resets; `router.refresh()` alone gets a
   * fresh server promise but the latched boundary keeps rendering the fallback
   * and never reads it. Retry orchestration bumps a value here to recover.
   * Omit to keep the old behaviour (reset only via React `key`).
   */
  resetKeys?: readonly unknown[];
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

function resetKeysChanged(a?: readonly unknown[], b?: readonly unknown[]): boolean {
  if (a === b) return false;
  if (!a || !b || a.length !== b.length) return true;
  return a.some((value, index) => !Object.is(value, b[index]));
}

/**
 * Minimal client error boundary. The guild-detail payload is streamed as a
 * promise consumed with `use()`; a rejection (botless/unauthorized guild, or a
 * transient backend error) throws at the consuming component, which this
 * catches. Key it by guildId so switching guilds resets a prior error; pass
 * `resetKeys` to clear an error in place (retry).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.error && resetKeysChanged(prevProps.resetKeys, this.props.resetKeys)) {
      this.setState({ error: null });
    }
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    if (this.props.authFallback && this.state.error instanceof AuthExpiredSignal) {
      return this.props.authFallback;
    }
    if (this.props.transientFallback && this.state.error instanceof TransientErrorSignal) {
      return this.props.transientFallback;
    }
    if (this.props.botAbsentFallback && this.state.error instanceof BotAbsentSignal) {
      return this.props.botAbsentFallback;
    }
    return this.props.fallback;
  }
}

/**
 * Fallback that navigates to `path`. Mirrors the old server-side
 * `catch { redirect('/dashboard') }` for a guild whose detail read failed —
 * now client-side because the detail promise resolves in the browser.
 */
export function RedirectTo({ path, children }: { path: string; children?: ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(path);
  }, [router, path]);
  return children ?? null;
}
