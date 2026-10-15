import Link from 'next/link';
import { StaticNavbar } from '@/components/layout/navbar-static';
import { SiteShell } from '@/components/layout/site-shell';
import { Prose } from '@/components/prose';
import { legalDocuments } from '@/lib/legal/documents';

/**
 * Shared chrome for the legal documents. Holds no operative text: everything
 * binding lives in the .mdx files, so each English statement has exactly one copy and
 * the documents cross-reference instead of duplicating clauses. The imprint block, for
 * instance, is stated once at /legal — ZEIT cl. 6 requires it be permanently accessible,
 * which a referenced ungated page satisfies.
 *
 * Rendered per request: each document's canonical URL resolves against
 * `WEB_APP_ORIGIN`, which a build-time prerender would freeze at `localhost`.
 */
export const dynamic = 'force-dynamic';

export default function LegalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <SiteShell nav={<StaticNavbar />}>
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-20">
        <nav aria-label="Legal documents" className="mb-12 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {legalDocuments.map(document => (
            <Link
              key={document.href}
              href={document.href}
              lang={document.lang}
              hrefLang={document.lang}
              className="text-slate-400 hover:text-blue-400 transition-colors"
            >
              {document.label}
            </Link>
          ))}
        </nav>

        <Prose>{children}</Prose>
      </section>
    </SiteShell>
  );
}
