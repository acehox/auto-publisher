'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

/**
 * `router.back()` on a direct hit (pasted link, bookmark, crawler) leaves the
 * user on the same page with nothing to go back to, so fall back to the site
 * root when this entry is the first in the session's history.
 */
export function BackButton({ fallbackHref = '/' }: { fallbackHref?: string }) {
  const router = useRouter();

  return (
    <Button
      variant="outline"
      size="lg"
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
          return;
        }
        router.push(fallbackHref);
      }}
    >
      <ArrowLeft />
      Go back
    </Button>
  );
}
