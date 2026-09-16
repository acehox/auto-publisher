'use client';

import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Logo } from './logo';
import type { NavLinkItem } from './nav-config';

interface NavbarBarProps {
  /**
   * The dashboard is an app shell, not a page in the marketing site: full width
   * to line up with the sidebar below it, and the marketing links give way to
   * the two an admin needs from inside a server's settings. Below md the
   * account menu takes the hamburger's slot, so those two ride the footer there.
   */
  variant: 'site' | 'dashboard';
  links: NavLinkItem[];
  account: React.ReactNode;
  mobileAccount: React.ReactNode;
}

/** Client only for the active-link mark and the mobile panel's open state. */
export function NavbarBar({ variant, links, account, mobileAccount }: NavbarBarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  // Closing here rather than per link is what lets the panel's contents stay
  // server markup. A render-time reset, not an effect: an effect would paint the
  // open panel over the new route for a frame.
  const [renderedPath, setRenderedPath] = useState(pathname);
  if (renderedPath !== pathname) {
    setRenderedPath(pathname);
    setMobileMenuOpen(false);
  }

  const inDashboard = variant === 'dashboard';

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-lg border-b border-slate-800/50"
      style={{ paddingRight: 'var(--removed-body-scroll-bar-size, 0px)' }}
    >
      <div className={cn('px-4 sm:px-6 lg:px-8', inDashboard ? 'w-full' : 'max-w-7xl mx-auto')}>
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-12">
            <Link href="/" className="flex items-center gap-3">
              <Logo className="w-8 h-8" />
              <span className="text-white text-base font-semibold">Auto Publisher</span>
            </Link>

            <div className="hidden md:flex items-center gap-8">
              {links.map(link => (
                <Link
                  key={link.label}
                  href={link.href}
                  target={link.external ? '_blank' : undefined}
                  aria-current={!link.external && pathname === link.href ? 'page' : undefined}
                  className={cn(
                    'text-sm transition-colors',
                    !link.external && pathname === link.href
                      ? 'text-blue-400'
                      : 'text-slate-300 hover:text-white'
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className={cn('items-center gap-3', inDashboard ? 'flex' : 'hidden sm:flex')}>
              {account}
            </div>

            <button
              type="button"
              aria-label="Toggle navigation menu"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-nav"
              className={cn(
                'cursor-pointer p-2 text-slate-400 hover:text-white',
                inDashboard ? 'hidden' : 'md:hidden'
              )}
              onClick={() => setMobileMenuOpen(open => !open)}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {mobileMenuOpen && !inDashboard && (
        <div
          id="mobile-nav"
          className="md:hidden bg-slate-900/95 backdrop-blur-lg border-b border-slate-800"
        >
          <div className="px-4 py-4 space-y-3">
            {links.map(link => (
              <Link
                key={link.label}
                href={link.href}
                target={link.external ? '_blank' : undefined}
                aria-current={!link.external && pathname === link.href ? 'page' : undefined}
                className={cn(
                  'block transition-colors py-2',
                  !link.external && pathname === link.href
                    ? 'text-blue-400'
                    : 'text-slate-300 hover:text-white'
                )}
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-4">{mobileAccount}</div>
          </div>
        </div>
      )}
    </nav>
  );
}
