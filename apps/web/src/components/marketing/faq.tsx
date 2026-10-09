'use client';

import type { ReactNode } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { links } from '@/lib/constants';

const ANNOUNCEMENT_CHANNELS_HELP =
  'https://support.discord.com/hc/en-us/articles/360032008192-Announcement-Channels-';

function InlineLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-blue-400 underline-offset-2 hover:text-blue-300 hover:underline"
    >
      {children}
    </a>
  );
}

const faqs: { question: string; answer: ReactNode }[] = [
  {
    question: 'What does Auto Publisher do?',
    answer: (
      <>
        It automatically publishes messages posted in your{' '}
        <InlineLink href={ANNOUNCEMENT_CHANNELS_HELP}>announcement channels</InlineLink> — the same
        as pressing the publish button yourself — so your announcements reach the servers that
        follow your channel. It is especially handy for messages from other bots or webhooks that
        you would otherwise have to publish by hand. Note: Auto Publisher never creates messages; it
        only publishes ones already posted by you, another bot, or a webhook.
      </>
    ),
  },
  {
    question: 'How do I set it up?',
    answer: (
      <>
        Invite the bot, then use <code className="text-slate-200">/ap enable</code> or the web
        dashboard to choose the announcement channels it should manage. Make sure the bot has these
        permissions in each of those channels:{' '}
        <span className="text-slate-200">View Channel, Send Messages, and Manage Messages</span>.
      </>
    ),
  },
  {
    question: 'Why can only 10 messages per channel per hour be published?',
    answer: (
      <>
        That is a limit set by Discord, not by us — even a person cannot publish more than 10
        messages per channel per hour. On the Free plan, messages beyond that limit can&apos;t be
        published. Premium publishes them automatically once the limit resets, oldest first, for up
        to 24 hours after they were posted.
      </>
    ),
  },
  {
    question: 'Can I self-host the bot?',
    answer: (
      <>
        Yes, for servers you run yourself. The full source is published on{' '}
        <InlineLink href={links.githubRepo}>GitHub</InlineLink> under a source-available licence, so
        you are welcome to read it, learn from it, and run your own copy. Hosting an instance for
        other people is not covered by that licence — and there is no need to, since adding the
        public bot is free. Auto Publisher is built to run at scale across many servers, and we do
        not provide support for self-hosted instances, so treat those as a project for tinkering.
      </>
    ),
  },
];

export function FAQ({ id }: { id: string }) {
  return (
    <section id={id} className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
      <div className="text-center mb-12">
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
          Frequently Asked Questions
        </h2>
        <p className="text-slate-400">Got questions? We&apos;ve got answers.</p>
      </div>

      <Accordion type="single" collapsible defaultValue="item-0" className="space-y-4">
        {faqs.map((faq, index) => (
          <AccordionItem
            key={faq.question}
            value={`item-${index}`}
            className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-xl overflow-hidden hover:border-slate-700 transition-all data-[state=open]:border-slate-700"
          >
            <AccordionTrigger className="px-6 py-5 text-white hover:no-underline text-left [&>svg]:text-slate-400">
              {faq.question}
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-5 text-slate-400">{faq.answer}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
