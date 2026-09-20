import { ArrowRight, Check, MessageCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CommandsReference } from '@/components/marketing/commands-reference';
import { FAQ } from '@/components/marketing/faq';
import { HowItWorks } from '@/components/marketing/how-it-works';
import { InviteBotButton } from '@/components/marketing/invite-bot-button';
import { PlanComparison } from '@/components/marketing/plan-comparison';
import { Button } from '@/components/ui/button';
import { links } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'How It Works | Auto Publisher',
  description:
    'Everything you need to set up Auto Publisher and keep your Discord announcements flowing — from your first invite to commands, permissions, and advanced filters.',
};

const permissions = [
  { name: 'View Channel', reason: 'so the bot can see the announcement channel.' },
  { name: 'Send Messages', reason: 'required by Discord to publish in the channel.' },
  { name: 'Manage Messages', reason: 'the permission that actually publishes announcements.' },
];

export default function HowItWorksPage() {
  return (
    <>
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-4 text-center">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">How It Works</h1>
        <p className="text-lg sm:text-xl text-slate-400 mb-8">
          Everything you need to set up Auto Publisher and keep your announcements flowing — from
          your first invite to commands, permissions, and advanced filters.
        </p>
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <InviteBotButton
            size="lg"
            className="bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white border-0 shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 group"
            showDashboardNudge
          >
            Invite Bot
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </InviteBotButton>
          <Link
            href={links.discordSupportServer}
            target="_blank"
            className="inline-flex items-center gap-2 text-slate-400 hover:text-blue-400 transition-colors group"
          >
            <MessageCircle className="w-4 h-4" />
            <span className="text-sm">Join our support server</span>
          </Link>
        </div>
      </section>

      <HowItWorks
        title="Get started in four steps"
        description="Auto Publisher does the work for you. Set it up once. Forget about it forever."
      />

      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">What the bot needs</h2>
          <p className="text-slate-400 max-w-2xl mx-auto">
            Auto Publisher needs these permissions in every announcement channel that&apos;s
            enabled. It only ever publishes messages, from you, another bot, or a webhook, it never
            creates them.
          </p>
        </div>

        <ul className="space-y-3">
          {permissions.map(permission => (
            <li
              key={permission.name}
              className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/50 px-5 py-4 backdrop-blur-sm"
            >
              <Check className="mt-0.5 h-5 w-5 shrink-0 text-green-400" />
              <p className="text-sm text-slate-300">
                <span className="font-medium text-white">{permission.name}</span>{' '}
                <span className="text-slate-400">— {permission.reason}</span>
              </p>
            </li>
          ))}
        </ul>
      </section>

      <CommandsReference />

      <PlanComparison />

      <FAQ id="faq" />

      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 px-6 py-10 text-center backdrop-blur-sm">
          <h2 className="text-2xl font-bold text-white mb-2">Still need help?</h2>
          <p className="text-slate-400 mb-6">
            Our team and community will do their best to answer your questions.
          </p>
          <Button
            size="lg"
            className="bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white border-0 shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 group"
            asChild
          >
            <Link href={links.discordSupportServer} target="_blank">
              <MessageCircle className="w-5 h-5" />
              Join the support server
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
