import {
  ArrowRight,
  Filter,
  Hash,
  LayoutDashboard,
  MessageCircle,
  ShieldCheck,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { legacySunsetLabel, links } from '@/lib/constants';
import { getSiteConfig } from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'Migration Guide | Auto Publisher',
  description:
    'Auto Publisher is entering a New Era. See what is changing and follow a few quick steps to keep your announcements publishing without interruption.',
};

const whatsNew = [
  {
    icon: Hash,
    title: 'Choose which channels publish',
    description:
      'You now pick exactly which announcement channels auto-publish, instead of every one of them at once.',
  },
  {
    icon: LayoutDashboard,
    title: 'A new web dashboard',
    description:
      'Manage every server from the website. Just sign in with Discord and configure things in a few clicks.',
  },
  {
    icon: Filter,
    title: 'Premium, if you want more',
    description: 'Premium adds unlimited channels, message filters, and priority publishing.',
  },
  {
    icon: ShieldCheck,
    title: 'More reliable publishing',
    description:
      "Messages no longer go missing when Discord is busy, instead they wait their turn and then publish. The only limit left is Discord's own cap on how often a channel can publish.",
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
            What is changing and how to keep your announcements flowing?
          </p>
          <div className="inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-3">
            <span className="text-base sm:text-lg text-amber-200">
              Legacy mode ends on{' '}
              <span className="font-bold text-white">
                {legacySunsetLabel(getSiteConfig().legacySunsetDate)}
              </span>
              . Migrate before then to keep publishing.
            </span>
          </div>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">Why we are changing</h2>
        </div>
        <div className="space-y-4 text-slate-300 leading-relaxed">
          <p>
            For years, Auto Publisher simply published every announcement channel automatically.
            That worked when we were small, but as the bot grew to thousands of servers, Discord
            {'’'}s rate limits made that all-or-nothing approach fragile. Busy servers could hit
            those limits and see messages delayed or missed entirely.
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

      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">What is new</h2>
          <p className="text-slate-400 max-w-2xl mx-auto">
            A quick look at what the New Era brings to your server.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {whatsNew.map(feature => (
            <div
              key={feature.title}
              className="flex items-start gap-4 rounded-xl border border-slate-800 bg-slate-900/50 px-5 py-5 backdrop-blur-sm"
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

      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">How to migrate</h2>
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
          migrated as soon as you enable at first channel.
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
