'use client';

import { useEffect } from 'react';

const LEAVE_PROMPT = 'You have unsaved changes. Leave without saving?';

/**
 * Guards a dirty editor against the two ways the work gets lost.
 *
 * `beforeunload` covers tab close / reload / typed-in URL and is the only API
 * that can. It is attached ONLY while dirty: a permanently registered handler
 * disqualifies the page from the back/forward cache.
 *
 * It does not fire for App Router client navigation and the router exposes no
 * blocker, so in-app links are intercepted in the capture phase instead. Native
 * `confirm` deliberately — a dialog component cannot answer a click
 * synchronously, so blocking with one means letting the navigation start and
 * then undoing it.
 */
export function useUnsavedChangesWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers key off the assignment rather than preventDefault.
      event.returnValue = '';
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target !== '' && anchor.target !== '_self') return;
      if (anchor.href === window.location.href) return;
      if (new URL(anchor.href).origin !== window.location.origin) return;
      if (window.confirm(LEAVE_PROMPT)) return;
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);
}
