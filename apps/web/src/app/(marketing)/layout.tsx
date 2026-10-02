import { Navbar } from '@/components/layout/navbar';
import { SiteShell } from '@/components/layout/site-shell';

/**
 * Marketing pages render at request time rather than being prerendered.
 *
 * They show the bot invite button, whose client id comes from `getSiteConfig()`
 * in the root layout. A self-hosted image is built before its `.env` exists
 * (Docker supplies it at runtime via `env_file`), so a statically prerendered
 * page would bake in an empty client id and render no invite button, for good —
 * defeating the point of keeping the dashboard free of build-time config.
 *
 * The legal pages are dynamic for the same reason: their canonical URL is built
 * from `WEB_APP_ORIGIN`, so prerendered they would point at `localhost`.
 */
export const dynamic = 'force-dynamic';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell nav={<Navbar />}>{children}</SiteShell>;
}
