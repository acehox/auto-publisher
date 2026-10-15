import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { guidePath, guides } from '@/lib/guides';

export const metadata: Metadata = {
  title: 'Guides',
  description:
    'Step-by-step guides to publishing Discord announcement channel messages automatically with Auto Publisher.',
  alternates: { canonical: '/guides' },
};

export default function GuidesPage() {
  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-24">
      <h1 className="mb-4 text-3xl font-bold text-white sm:text-4xl">Guides</h1>
      <p className="mb-12 text-lg text-slate-400">
        How to publish your Discord announcements automatically with Auto Publisher.
      </p>

      <ul className="space-y-3">
        {guides.map(guide => (
          <li key={guide.slug}>
            <Link
              href={guidePath(guide.slug)}
              className="group flex items-start justify-between gap-6 rounded-xl border border-slate-800 bg-slate-900 px-5 py-5 transition-colors hover:border-slate-700"
            >
              <div>
                <h2 className="font-semibold text-white group-hover:text-blue-400">
                  {guide.title}
                </h2>
                <p className="mt-1 text-sm text-slate-400">{guide.description}</p>
              </div>
              <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-slate-500 transition-transform group-hover:translate-x-1 group-hover:text-blue-400" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
