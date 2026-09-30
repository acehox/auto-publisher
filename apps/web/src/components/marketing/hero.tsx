'use client';

import { ArrowRight, MessageCircle } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { links } from '@/lib/constants';
import { Button } from '../ui/button';
import { HeroDemo } from './hero-demo';
import { InviteBotButton } from './invite-bot-button';

export function Hero() {
  return (
    <section id="home" className="relative mx-auto max-w-7xl px-4 pt-32 pb-20 sm:px-6 lg:px-8">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-15">
        {/* Left column */}
        <div className="relative z-10 text-center lg:text-left">
          {/* Headline with word-by-word animation */}
          <h1 className="mb-6 text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">
            <motion.span
              initial={{ opacity: 0, filter: 'blur(4px)', y: 10 }}
              animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
              transition={{
                duration: 0.2,
                delay: 0.05 * 0.05,
                ease: 'easeInOut',
              }}
              className="mr-2 inline-block"
            >
              Your announcements,
            </motion.span>
            <motion.span
              initial={{ opacity: 0, filter: 'blur(4px)', y: 10 }}
              animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
              transition={{
                duration: 0.2,
                delay: 0.05 + 1 * 0.05,
                ease: 'easeInOut',
              }}
              className="inline-block bg-linear-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent"
            >
              published automatically.
            </motion.span>
          </h1>

          {/* Subtext */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, delay: 0.4 }}
            className="mb-10 max-w-2xl text-lg text-slate-300 sm:text-xl lg:mx-0 mx-auto"
          >
            Auto Publisher publishes messages in your announcement channels automatically, whether
            they came from your team, a bot or a webhook. Publish everything, or only what matches
            your filters.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, delay: 0.5 }}
            className="flex flex-col items-center gap-4 sm:flex-row lg:justify-start justify-center"
          >
            <InviteBotButton
              size="xl"
              className="group rounded-lg border-0 bg-linear-to-r from-blue-500 to-blue-600 px-8 py-4 text-white shadow-lg shadow-blue-500/30 transition-all hover:-translate-y-0.5 hover:from-blue-600 hover:to-blue-700 hover:shadow-blue-500/50"
              showDashboardNudge
            >
              Invite Bot
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </InviteBotButton>

            <Button
              variant="outline"
              size="xl"
              className="rounded-lg border-slate-700 bg-slate-800/50 px-8 py-4 text-white transition-all hover:-translate-y-0.5 hover:bg-slate-800"
              asChild
            >
              <Link href="/how-it-works">How It Works</Link>
            </Button>
          </motion.div>

          {/* Support link */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.6 }}
            className="mt-8"
          >
            <Link
              href={links.discordSupportServer}
              target="_blank"
              className="group inline-flex items-center gap-2 text-slate-400 transition-colors hover:text-blue-400"
            >
              <MessageCircle className="h-4 w-4" />
              <span className="text-sm">Need help? Join our support server</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </motion.div>
        </div>

        {/* Right column: animated demo */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="relative z-10"
        >
          <HeroDemo />
        </motion.div>
      </div>
    </section>
  );
}
