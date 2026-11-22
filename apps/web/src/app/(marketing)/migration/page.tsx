import {
  ArrowRight,
  Bot,
  Clock,
  Filter,
  LayoutDashboard,
  ListChecks,
  MessageCircle,
  RotateCwFadingClock,
  ShieldCheck,
  Terminal,
  TriangleAlert,
  Zap,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LegacyTag } from '@/components/legacy-tag';
import { InviteBotButton } from '@/components/marketing/invite-bot-button';
import { IconTile } from '@/components/marketing/premium/feature-section';
import { FiltersDemo } from '@/components/marketing/premium/filters-demo';
import { RolloverDemo } from '@/components/marketing/premium/rollover-demo';
import { Button } from '@/components/ui/button';
import { legacySunsetLabel, links } from '@/lib/constants';
import { getSiteConfig } from '@/lib/site-config';
import { cn } from '@/lib/utils';

// MIGRATION: remove with the rest of the migration UX at sunset.

export const metadata: Metadata = {
  title: 'Migration Guide',
  alternates: { canonical: '/migration' },
  description:
    'Welcome to the New Era of Auto Publisher: near-instant publishing, a web dashboard, slash commands and Premium extras. Migrate your server in three steps.',
};

const PRIMARY_BUTTON =
  'bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white border-0 shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 group';

const steps: { title: string; description: ReactNode }[] = [
  {
    title: 'Sign in',
    description: (
      <>
        Open the{' '}
        <Link
          href="/dashboard"
          className="text-blue-400 underline underline-offset-4 hover:text-blue-300"
        >
          dashboard
        </Link>{' '}
        and sign in with Discord.
      </>
    ),
  },
  {
    title: 'Pick your server',
    description: (
      <>
        A server to migrate is marked <LegacyTag />
      </>
    ),
  },
  {
    title: 'Choose your channels',
    description: (
      <>
        In the dashboard, click <span className="font-medium text-slate-200">Migrate now</span> and
        select the channels to keep.
      </>
    ),
  },
];

const improvements: {
  icon: typeof Zap;
  iconClassName?: string;
  title: string;
  description: string;
}[] = [
  {
    icon: ShieldCheck,
    title: 'Near-instant publishing',
    description:
      'Delays are a thing of the past, and messages are no longer lost when Discord is busy.',
  },
  {
    icon: LayoutDashboard,
    title: 'A web dashboard',
    description:
      'See the status of every channel, fix a missing permission and change settings in one place.',
  },
  {
    icon: Terminal,
    title: 'Slash commands',
    description: 'Run /ap enable, /ap overview and more without leaving Discord.',
  },
  {
    icon: ListChecks,
    title: 'Your channels, your choice',
    description:
      'Auto Publisher publishes only in the channels you pick, so nothing goes out by surprise.',
  },
];

const premiumExtras: (typeof improvements)[number] = {
  icon: Zap,
  iconClassName: 'fill-yellow-500 text-yellow-500',
  title: 'Premium extras',
  description:
    "Rollover publishes the messages Discord's hourly limit held back, as soon as it resets. Filters publish only the messages you choose.",
};

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-200">{children}</code>;
}

function MigrateButton() {
  return (
    <Button size="xl" className={PRIMARY_BUTTON} asChild>
      <Link href="/dashboard">
        Migrate now
        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
      </Link>
    </Button>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="text-balance text-2xl font-bold text-white sm:text-3xl">{children}</h2>;
}

function PremiumFeature({
  icon,
  color,
  name,
  title,
  children,
  visual,
}: {
  icon: typeof Filter;
  color: 'blue' | 'purple';
  name: string;
  title: string;
  children: ReactNode;
  visual: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="mb-4 flex items-center gap-3">
          <IconTile icon={icon} color={color} />
          <span className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            {name}
          </span>
        </div>
        <h3 className="mb-2 text-balance text-xl font-bold text-white">{title}</h3>
        <p className="max-w-[65ch] text-slate-400">{children}</p>
      </div>
      {visual}
    </div>
  );
}

export default async function MigrationPage() {
  const { isPublicInstance, legacySunsetDate, freeChannelLimit } = await getSiteConfig();
  const sunsetLabel = legacySunsetLabel(legacySunsetDate);
  // One bot and Premium exist only on the public instance.
  const items = isPublicInstance
    ? [
        ...improvements,
        {
          icon: Bot,
          title: 'One bot, all functionality',
          description:
            'Everything now lives in the main Auto Publisher, including what Auto Publisher 2 and Auto Publisher 3 offered.',
        },
        premiumExtras,
      ]
    : improvements;

  return (
    <div className="relative">
      {/* Background glow — clip container is tall enough that the cut falls below the faded blur (no seam) */}
      <div className="absolute inset-x-0 top-0 h-160 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-240 max-w-none h-96 bg-blue-500/20 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <section className="grid items-center gap-12 pt-32 pb-14 md:grid-cols-2 lg:gap-16">
          <div className="text-center md:text-left">
            <h1 className="mb-6 text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">
              Welcome to the New Era
            </h1>
            <p className="mx-auto mb-8 max-w-xl text-pretty text-lg text-slate-300 sm:text-xl md:mx-0">
              Auto Publisher is rebuilt for near-instant publishing and easier control. Switch your
              server over in three steps.
            </p>
            <p className="mb-8 inline-flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-amber-200">
              <Clock className="size-5 shrink-0 text-amber-400" aria-hidden="true" />
              <span>
                Switch over before legacy mode ends on{' '}
                <span className="whitespace-nowrap font-bold text-white">{sunsetLabel}</span> to
                keep publishing.
              </span>
            </p>
            <div className="flex flex-col items-center gap-4 md:items-start">
              <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
                <MigrateButton />
                <Button size="xl" variant="outline" asChild>
                  <Link href="#whats-new">See what&apos;s new</Link>
                </Button>
              </div>
              <p className="text-sm text-slate-400">
                Your channels keep publishing while you migrate.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:p-8">
            <h2 className="mb-6 text-xl font-bold text-white">How to migrate</h2>
            <ol className="space-y-6">
              {steps.map((step, index) => (
                <li key={step.title} className="flex items-start gap-4">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-blue-500/10 font-semibold text-blue-400">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-lg font-medium text-white">{step.title}</h3>
                    <p className="text-slate-400">{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-8 border-t border-slate-800 pt-6 text-sm text-slate-400">
              <span className="font-medium text-slate-200">Prefer Discord?</span> Run{' '}
              <Code>/ap enable</Code> in each channel you want to keep. Your server migrates when
              you enable its first channel, and from then on only enabled channels publish.
            </p>
          </div>
        </section>

        {isPublicInstance && (
          <section className="py-6">
            <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <div className="flex items-start gap-3">
                <TriangleAlert
                  className="mt-0.5 size-5 shrink-0 text-amber-400"
                  aria-hidden="true"
                />
                <p className="max-w-[65ch] text-slate-300">
                  <span className="font-semibold text-white">
                    Using Auto Publisher 2 or Auto Publisher 3?
                  </span>{' '}
                  These bots retire on{' '}
                  <span className="whitespace-nowrap font-semibold text-white">{sunsetLabel}</span>.
                  Invite the main Auto Publisher, choose its channels, then remove the old bot.
                </p>
              </div>
              <InviteBotButton showDashboardNudge>Invite Auto Publisher</InviteBotButton>
            </div>
          </section>
        )}

        <section id="whats-new" className="grid scroll-mt-24 gap-10 py-14 md:grid-cols-2 lg:gap-16">
          <div>
            <SectionHeading>What you get when you migrate</SectionHeading>
            <p className="mt-4 max-w-[65ch] text-lg leading-relaxed text-slate-300">
              We rebuilt how publishing works, so Auto Publisher does only the work you want and
              does it reliably.
            </p>
          </div>
          <dl className="divide-y divide-slate-800 border-y border-slate-800">
            {items.map(improvement => (
              <div key={improvement.title} className="flex items-start gap-4 py-5">
                <improvement.icon
                  className={cn('mt-0.5 size-6 shrink-0 text-blue-400', improvement.iconClassName)}
                  aria-hidden="true"
                />
                <div>
                  <dt className="mb-1 font-medium text-white">{improvement.title}</dt>
                  <dd className="text-slate-400">{improvement.description}</dd>
                </div>
              </div>
            ))}
          </dl>
        </section>

        {/* Premium does not exist on a self-host. */}
        {isPublicInstance && (
          <section id="premium" className="scroll-mt-24 py-14">
            <h2 className="flex items-center gap-3 text-2xl font-bold text-white sm:text-3xl">
              <Zap className="size-7 shrink-0 fill-yellow-500 text-yellow-500" aria-hidden="true" />
              Go further with Premium
            </h2>
            <p className="mt-3 max-w-[65ch] text-lg text-slate-400">
              Rollover and message filters, built into Auto Publisher Premium. Upgrade any time
              after you migrate.
            </p>

            <div className="mt-12 grid gap-14 lg:grid-cols-2 lg:gap-16">
              <PremiumFeature
                icon={RotateCwFadingClock}
                color="blue"
                name="Rollover"
                title="Busy channels keep publishing"
                visual={<RolloverDemo />}
              >
                Discord limits each channel to 10 published messages per hour. Premium publishes the
                rest once the limit resets, in the order they were posted, for up to 24 hours.
              </PremiumFeature>
              <PremiumFeature
                icon={Filter}
                color="purple"
                name="Message filters"
                title="Publish only what you choose"
                visual={<FiltersDemo />}
              >
                Give each channel a filter. Only messages that match it are published. It works on
                embeds from RSS, GitHub and news bots too.
              </PremiumFeature>
            </div>

            <div className="mt-14 flex flex-col gap-x-6 gap-y-4 sm:flex-row sm:items-center">
              <Button size="xl" asChild>
                <Link href="/premium">
                  See Premium plans
                  <ArrowRight />
                </Link>
              </Button>
              <p className="text-sm text-slate-400">
                Free plan: up to {freeChannelLimit} channels. Premium: unlimited channels and
                priority support.
              </p>
            </div>
          </section>
        )}

        <section className="pt-6 pb-24">
          <div className="flex flex-col items-start gap-6 rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:p-10 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="mb-1 text-2xl font-bold text-white">Ready to migrate?</h2>
              <p className="text-slate-400">Any questions? Ask in the support server.</p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <MigrateButton />
              <Button size="xl" variant="outline" asChild>
                <Link href={links.discordSupportServer} target="_blank">
                  <MessageCircle className="w-5 h-5" />
                  Join the support server
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
