import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { SiteConfigProvider } from '@/components/site-config-context';
import { ToastProvider } from '@/components/ui/toast';
import { getSiteConfig } from '@/lib/site-config';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Auto Publisher | Automate Your Discord Announcements Easily',
  applicationName: 'Auto Publisher',
  description:
    'Auto Publisher automatically publishes messages in your announcement channels, ensuring they reach your followers automatically. Trusted by 17,000+ Discord servers.',
  keywords: ['Discord', 'bot', 'announcements', 'auto publish', 'Discord bot'],
  authors: [{ name: 'acehox' }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolved server-side and handed to the client tree, so the deployment is
  // configured purely at runtime — no NEXT_PUBLIC_* baked in at build time.
  const siteConfig = getSiteConfig();

  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${geistSans.className} antialiased`}
      >
        <SiteConfigProvider config={siteConfig}>
          <div className="relative min-h-screen overflow-hidden bg-slate-950">
            {/* Radial blue glow */}
            <div
              className="pointer-events-none fixed inset-0 z-0"
              style={{
                background:
                  'radial-gradient(1100px 620px at 72% -6%, rgba(47,107,255,.20), transparent 60%), radial-gradient(900px 560px at 8% 8%, rgba(59,130,246,.12), transparent 55%)',
              }}
            />
            {/* Faint grid */}
            <div
              className="pointer-events-none fixed inset-0 z-0 opacity-50"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(120,150,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(120,150,255,.05) 1px, transparent 1px)',
                backgroundSize: '56px 56px',
                maskImage: 'radial-gradient(900px 520px at 60% 0%, #000, transparent 75%)',
                WebkitMaskImage: 'radial-gradient(900px 520px at 60% 0%, #000, transparent 75%)',
              }}
            />
            {children}
            <ToastProvider />
          </div>
        </SiteConfigProvider>
      </body>
    </html>
  );
}
