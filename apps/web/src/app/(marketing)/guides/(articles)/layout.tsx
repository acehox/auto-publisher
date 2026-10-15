import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Prose } from '@/components/prose';

export default function GuideArticleLayout({ children }: { children: React.ReactNode }) {
  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-20">
      <Link
        href="/guides"
        className="mb-10 inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-blue-400"
      >
        <ArrowLeft className="h-4 w-4" />
        All guides
      </Link>

      <Prose>{children}</Prose>
    </section>
  );
}
