import { Footer } from './footer';

/**
 * Page chrome, rendered per section rather than from the root layout: that is
 * what lets each section choose its own navbar — and with it its own rendering
 * mode. The legal pages pair a session-free bar with a static prerender; every
 * section that already renders per request reads the session on the server.
 *
 * `*:w-full` because a flex item with `mx-auto` (every page section) has auto
 * cross-axis margins, which cancel the default stretch and size it to its
 * content — collapsing sections to their widest line.
 */
export function SiteShell({ nav, children }: { nav: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      {nav}
      <main className="flex flex-1 flex-col *:w-full">{children}</main>
      <Footer />
    </div>
  );
}
