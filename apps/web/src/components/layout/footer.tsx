import { isPublicInstance } from '@ap/config';
import { Heart } from 'lucide-react';
import Link from 'next/link';
import { links, values } from '@/lib/constants';
import { legalDocuments } from '@/lib/legal/documents';
import { formatNumberFull } from '@/lib/utils';
import { Logo } from './logo';

const quickLinks = [
  { href: '/', label: 'Home' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/how-it-works', label: 'How It Works' },
  { href: '/premium', label: 'Premium' },
  { href: links.githubRepo, label: 'GitHub' },
  // TODO: re-enable when the Status page is ready.
  // { href: '/status', label: 'Status' },
];

const supportLinks = [
  { href: links.discordSupportServer, label: 'Support Server' },
  { href: '/migration', label: 'Migration Guide' },
];

export function Footer() {
  // A self-hosted instance has no billing, so /premium 404s — don't link to it.
  const visibleQuickLinks = isPublicInstance
    ? quickLinks
    : quickLinks.filter(link => link.href !== '/premium');

  return (
    <footer className="border-t border-slate-800 bg-slate-950/50 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
          <div className="sm:col-span-2">
            <Link href="/" className="flex items-center gap-3 mb-4">
              <Logo className="w-8 h-8" />
              <span className="text-white text-base font-semibold">Auto Publisher</span>
            </Link>
            <p className="text-slate-400 max-w-sm">
              The most trusted Discord bot for automatically publishing announcement channel
              messages.{' '}
              {/* Install count describes the public bot, not a self-hosted copy of it. */}
              {isPublicInstance && `${formatNumberFull(values.activeServers)} servers worldwide.`}
            </p>
          </div>

          <div>
            <h4 className="text-white font-medium mb-4">Quick Links</h4>
            <ul className="space-y-2">
              {visibleQuickLinks.map(link => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-slate-400 hover:text-blue-400 transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-white font-medium mb-4">Support</h4>
            <ul className="space-y-2">
              {supportLinks.map(link => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-slate-400 hover:text-blue-400 transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-slate-800 space-y-4 text-slate-500 text-xs">
          <nav aria-label="Legal">
            <ul className="flex flex-wrap items-center justify-center sm:justify-end gap-x-3 gap-y-1 sm:gap-x-2">
              {legalDocuments.map((document, index) => (
                <li key={document.href} className="flex items-center gap-x-2">
                  {/* Separators only from sm up: below that the row wraps, and a wrapped
                      line would start with a stray divider. */}
                  {index > 0 && (
                    <span aria-hidden="true" className="hidden sm:inline text-slate-700">
                      |
                    </span>
                  )}
                  <Link href={document.href} className="hover:text-slate-300 transition-colors">
                    {document.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-sm">
            <p>
              Copyright &copy; 2020&ndash;{new Date().getFullYear()} Auto Publisher. All rights
              reserved.
            </p>

            <div className="flex items-center gap-1">
              Crafted with <Heart className="h-4 w-4" /> by{' '}
              <Link
                href={links.githubAuthor}
                target="_blank"
                className="text-blue-400 hover:text-blue-500 transition-colors"
              >
                acehox
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
