'use client';

import Link from 'next/link';
import { useSiteConfig } from '@/components/site-config-context';
import { footerLegalDocuments, linkedFor } from '@/lib/legal/documents';

/**
 * A client component because the footer also renders in the dashboard's Suspense fallback,
 * where an async server component would suspend the fallback itself.
 */
export function FooterLegalNav() {
  const { croatianVisitor } = useSiteConfig();

  return (
    <nav aria-label="Legal">
      <ul className="flex flex-wrap items-center justify-center sm:justify-end gap-x-3 gap-y-1 sm:gap-x-2">
        {linkedFor(footerLegalDocuments, croatianVisitor).map((document, index) => (
          <li key={document.href} className="flex items-center gap-x-2">
            {/* Separators only from sm up: below that the row wraps, and a wrapped
                line would start with a stray divider. */}
            {index > 0 && (
              <span aria-hidden="true" className="hidden sm:inline text-slate-700">
                |
              </span>
            )}
            <Link
              href={document.href}
              lang={document.lang}
              hrefLang={document.lang}
              className="hover:text-slate-300 transition-colors"
            >
              {document.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
