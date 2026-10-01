import {
  ArrowRight,
  Filter,
  Hash,
  LayoutDashboard,
  type LucideIcon,
  MessageCircle,
  ShieldCheck,
  SquareSlash,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { MigrationCheck } from '@/components/marketing/migration-check';
import { Button } from '@/components/ui/button';
import { legacySunsetLabel, links } from '@/lib/constants';
import { getSiteConfig } from '@/lib/site-config';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Migration Guide',
  alternates: { canonical: '/migration' },
  description:
    'Auto Publisher is entering a New Era. See what is changing and follow a few quick steps to keep your announcements publishing without interruption.',
};

const sections = {
  why: { id: 'why', title: 'Why we are changing' },
  whatsNew: { id: 'whats-new', title: 'What is new' },
  yourServer: { id: 'your-server', title: 'What happens to my server?' },
  howToMigrate: { id: 'how-to-migrate', title: 'How to migrate' },
};

const whatsNew: { icon: LucideIcon; title: string; description: ReactNode; wide?: boolean }[] = [
  {
    icon: SquareSlash,
    title: 'Slash commands',
    description: (
      <>
        Control everything from Discord. Use{' '}
        <code className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-200">/help</code> to get
        started.
      </>
    ),
  },
  {
    icon: LayoutDashboard,
    title: 'A new web dashboard',
    description:
      'Prefer a visual interface? Manage every server from the website. Just sign in with Discord and configure things in a few clicks.',
  },
  {
    icon: ShieldCheck,
    title: 'More reliable publishing',
    description:
      "Messages no longer go missing when Discord is busy, instead they wait their turn and then publish. The only limit left is Discord's own cap on how often a channel can publish.",
  },
  {
    icon: Hash,
    title: 'Choose which channels publish',
    description:
      'Pick exactly which announcement channels auto-publish and monitor them from one place, instead of publishing every one of them at once.',
  },
  {
    icon: Filter,
    title: 'Premium, if you want more',
    description:
      'Message filters and priority publishing, two of the most requested features, plus unlimited channels. More are on the way.',
    wide: true,
  },
];

const steps: { title: string; description: ReactNode }[] = [
  {
    title: 'Open the dashboard',
    description: (
      <>
        Head to the{' '}
        <Link
          href="/dashboard"
          className="text-blue-400 underline underline-offset-4 hover:text-blue-300"
        >
          dashboard
        </Link>{' '}
        and sign in with your Discord account.
      </>
    ),
  },
  {
    title: 'Pick your server',
    description: 'Select the server you want to migrate. Unmigrated servers show a "Legacy" badge.',
  },
  {
    title: 'Migrate and choose channels',
    description:
      'Click "Migrate now" and choose which announcement channels should keep publishing.',
  },
  {
    title: 'Confirm',
    description: 'That’s it! Publishing continues without interruption.',
  },
];

export default function MigrationPage() {
  const { isPublicInstance, legacySunsetDate } = getSiteConfig();
  const sunsetLabel = legacySunsetLabel(legacySunsetDate);
  // The server check is about the free cap, the retiring bots and Premium, none of which a self-host has.
  const contents = [
    sections.why,
    sections.whatsNew,
    ...(isPublicInstance ? [sections.yourServer] : []),
    sections.howToMigrate,
  ];

  return (
    <>
      <section className="relative pt-32 pb-4 text-center">
        {/* Background glow — clip container is tall enough that the cut falls below the faded blur (no seam) */}
        <div className="absolute inset-x-0 top-0 h-160 overflow-hidden pointer-events-none">
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-240 max-w-none h-96 bg-blue-500/20 rounded-full blur-[120px]" />
        </div>

        <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
            Welcome to the{' '}
            <span className="text-transparent bg-clip-text bg-linear-to-r from-blue-400 to-blue-600">
              New Era
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-400 mb-8 max-w-2xl mx-auto">
            We rebuilt Auto Publisher from the ground up. Here is what is changing, why, and what
            you need to do.
          </p>
          <div className="inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-3">
            <span className="text-base sm:text-lg text-amber-200">
              Legacy mode ends on <span className="font-bold text-white">{sunsetLabel}</span>.
              Migrate before then to keep publishing.
            </span>
          </div>

          <nav
            aria-label="On this page"
            className="mt-10 rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-left backdrop-blur-sm"
          >
            <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              On this page
            </p>
            <ol className="grid gap-1 sm:grid-cols-2">
              {contents.map((section, index) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800/60 hover:text-white"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-xs font-semibold text-blue-400">
                      {index + 1}
                    </span>
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </div>
      </section>

      <section id={sections.why.id} className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">{sections.why.title}</h2>
        </div>
        <div className="space-y-4 text-slate-300 leading-relaxed">
          <p>
            For years, Auto Publisher simply published every announcement channel automatically,
            based on permissions alone. That worked when we were small, but as the bot grew to
            thousands of servers, many admins found that approach confusing, and Discord{'’'}s rate
            limits made it fragile. Busy servers could hit those limits and see messages delayed or
            missed entirely.
          </p>
          <p>
            We have rebuilt how publishing works from the ground up. It is faster, handles Discord
            {'’'}s limits gracefully, and lets you choose exactly which channels publish, so the bot
            only does the work you actually want, and does it reliably.
          </p>
          <p>
            Just as importantly, these changes give Auto Publisher room to grow. They keep the
            project healthy, sustainable, and here for the long run, so your community can keep
            counting on it for years to come.
          </p>
        </div>
      </section>

      <section id={sections.whatsNew.id} className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            {sections.whatsNew.title}
          </h2>
          <p className="text-slate-400 max-w-2xl mx-auto">
            A quick look at what the New Era brings to your server.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {whatsNew.map(feature => (
            <div
              key={feature.title}
              className={cn(
                'flex items-start gap-4 rounded-xl border border-slate-800 bg-slate-900/50 px-5 py-5 backdrop-blur-sm',
                feature.wide && 'sm:col-span-2'
              )}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                <feature.icon className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <h3 className="font-medium text-white mb-1">{feature.title}</h3>
                <p className="text-sm text-slate-400">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {isPublicInstance && (
        <section
          id={sections.yourServer.id}
          className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-20"
        >
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
              {sections.yourServer.title}
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Answer a few questions to find out what this means for your server.
            </p>
          </div>
          <MigrationCheck />
        </section>
      )}

      <section
        id={sections.howToMigrate.id}
        className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20"
      >
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            {sections.howToMigrate.title}
          </h2>
          <p className="text-slate-400 max-w-2xl mx-auto">
            It only takes a moment, and publishing keeps working the whole time.
          </p>
        </div>
        <ol className="space-y-4">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="flex items-start gap-4 rounded-xl border border-slate-800 bg-slate-900/50 px-5 py-4 backdrop-blur-sm"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-sm font-semibold text-blue-400">
                {index + 1}
              </span>
              <div>
                <h3 className="font-medium text-white mb-1">{step.title}</h3>
                <p className="text-sm text-slate-400">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-10 flex items-center gap-5">
          <div className="h-px flex-1 bg-slate-800" />
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-blue-500/30 bg-blue-500/10 text-base font-semibold uppercase tracking-wide text-blue-300">
            or
          </span>
          <div className="h-px flex-1 bg-slate-800" />
        </div>
        <p className="mt-6 text-slate-300 leading-relaxed text-center">
          You can run{' '}
          <code className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-200">/ap enable</code> in a
          channel to migrate that channel without leaving your server. Your server is automatically
          migrated as soon as you enable its first channel.
        </p>
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 px-6 py-10 text-center backdrop-blur-sm">
          <h2 className="text-2xl font-bold text-white mb-2">Ready to migrate?</h2>
          <p className="text-slate-400 mb-6">
            Open your dashboard to switch over, or reach out if you have any questions.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button
              size="lg"
              className="bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white border-0 shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 group"
              asChild
            >
              <Link href="/dashboard">
                Open dashboard
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href={links.discordSupportServer} target="_blank">
                <MessageCircle className="w-5 h-5" />
                Join the support server
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
