import Link from 'next/link';
import { StaticNavbar } from '@/components/layout/navbar-static';
import { SiteShell } from '@/components/layout/site-shell';
import { legalDocuments } from '@/lib/legal/documents';

/**
 * Shared chrome for the four legal documents. Holds no operative text: everything
 * binding lives in the .mdx files, so there is exactly one copy of each statement and
 * the documents cross-reference instead of duplicating clauses. The imprint block, for
 * instance, is stated once at /legal — ZEIT cl. 6 requires it be permanently accessible,
 * which a referenced ungated page satisfies.
 */
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
              className="text-slate-400 hover:text-blue-400 transition-colors"
            >
              {document.label}
            </Link>
          ))}
        </nav>

        <article
          className="prose prose-invert prose-slate max-w-none
          prose-headings:text-white prose-headings:font-semibold
          prose-h1:text-3xl prose-h1:sm:text-4xl prose-h1:mb-4
          prose-h2:mt-12 prose-h2:text-xl prose-h2:sm:text-2xl
          prose-h3:mt-8 prose-h3:text-lg
          prose-p:text-slate-300 prose-li:text-slate-300
          prose-strong:text-white
          prose-a:text-blue-400 prose-a:font-normal hover:prose-a:text-blue-300
          prose-table:text-slate-300 prose-th:text-white
          prose-code:text-blue-300 prose-code:before:content-none prose-code:after:content-none
          prose-hr:border-slate-800"
        >
          {children}
        </article>
      </section>
    </SiteShell>
  );
}
