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
 * Scoped to this route group deliberately: the legal pages carry no runtime
 * config and stay static, and the dashboard is already dynamic.
 */
export const dynamic = 'force-dynamic';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell nav={<Navbar />}>{children}</SiteShell>;
}
