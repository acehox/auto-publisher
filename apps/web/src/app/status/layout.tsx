import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Status',
  description: 'Real-time monitoring of Auto Publisher bot performance and service health.',
};

/**
 * Hard 404 until this page reads real data. `page.tsx` renders
 * `generateMockStatus()` — fabricated uptime, queue depth and rate-limit
 * figures — so leaving the route reachable publishes commercial claims nothing
 * in the system measures. That is the same problem that removed the "99,9%
 * Uptime" card from the landing page; a footer link commented out does not fix
 * it, because the URL still resolves.
 *
 * Blocked here rather than by deleting the route, because the page is a planned
 * feature. Delete this call to bring it back — and only once it reads live
 * data.
 *
 * In the layout, not the page: this is a server component, so the 404 happens
 * before any render and `page.tsx` never reaches a client bundle.
 */
export default function StatusLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  notFound();

  return children;
}
