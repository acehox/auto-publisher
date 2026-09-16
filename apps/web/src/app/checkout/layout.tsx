import { isPublicInstance } from '@ap/config';
import { notFound } from 'next/navigation';
import { Navbar } from '@/components/layout/navbar';
import { SiteShell } from '@/components/layout/site-shell';

/**
 * Checkout is a hosted-service surface: a self-hosted instance has no billing,
 * so there is no transaction to resume and the route must not resolve at all.
 *
 * In the layout, not the page: `page.tsx` is a client component, so the 404 has
 * to happen in a server component above it — before any render, and without
 * shipping the Paddle overlay to a client bundle that can never use it.
 *
 * Rendered per request so the gate reads the running environment. Prerendered,
 * it would freeze whatever `DEPLOYMENT_MODE` happened to be set at build time —
 * so a public image built in CI without it would 404 checkout in production.
 */
export const dynamic = 'force-dynamic';

export default function CheckoutLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  if (!isPublicInstance) notFound();

  return <SiteShell nav={<Navbar />}>{children}</SiteShell>;
}
