'use client';

import {
  ArrowRight,
  Check,
  Filter,
  Hash,
  Headphones,
  type LucideIcon,
  Sparkles,
  Zap,
} from 'lucide-react';
import { easeOut, motion, useReducedMotion, useTime, useTransform } from 'motion/react';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { PREMIUM_PLAN_FEATURES } from '@/lib/plans';
import { PREMIUM_TRIAL_DAYS } from '@/lib/pricing';

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/**
 * Motion's own loading-ripple recipe (motion.dev/examples/react-loading-ripple):
 * stacked circles each running `scale: [0, 1]` against `opacity: [1, 0]` on a 2s
 * ease-out loop, staggered so a new one leaves the mark as the last fades. The
 * reference staggers by a flat 0.5s, which leaves a gap every cycle; spacing by
 * duration/count instead makes the emission rate constant.
 */
const RIPPLE_MS = 2000;
const RIPPLE_COUNT = 3;
const RIPPLE_START_MS = 350;

/** Static radii for the reduced-motion fallback, innermost first. */
const RIPPLE_STATIC_SCALE = [0.35, 0.65, 0.95];

const RING_CLASS =
  'pointer-events-none absolute size-48 rounded-full border border-violet-400/70 will-change-[transform,opacity]';

/**
 * Keyed on the copy rather than the array index so a reordered or reworded
 * feature degrades to the neutral mark instead of silently taking the icon of
 * the line above it. `Hash` rather than `Zap` for channels: Zap is Premium's one
 * mark and already sits in the header — spending it twice on one screen costs it
 * its meaning, and `#` is how a channel is written everywhere else in the app.
 */
const FEATURE_ICONS: Record<string, LucideIcon> = {
  'Unlimited channels': Hash,
  'Priority publishing': ArrowRight,
  'Advanced message filters': Filter,
  'Priority support': Headphones,
};

/**
 * One ring, driven off a single clock rather than an `animate` keyframe pair.
 *
 * `animate={{ scale: [0, 1], opacity: [1, 0] }}` looks equivalent and is what
 * the reference uses, but Motion accelerated only the opacity half to WAAPI here
 * and left `scale` on the main thread. At every loop boundary the compositor
 * reset opacity to 1 a frame before the main thread reset the scale to 0, so a
 * full-size ring at full opacity painted for exactly one frame per cycle —
 * measured at 1 frame per 2000ms, and visible as a circle flashing at the
 * outside edge. Deriving both values from one `useTime` makes them the same
 * number twice (`scale + opacity === 1` always), so they cannot come apart.
 */
function RippleRing({ index }: { index: number }) {
  const time = useTime();
  const progress = useTransform(time, elapsed => {
    const shifted = elapsed - RIPPLE_START_MS - (index * RIPPLE_MS) / RIPPLE_COUNT;
    return shifted <= 0 ? 0 : easeOut((shifted % RIPPLE_MS) / RIPPLE_MS);
  });
  const scale = useTransform(progress, value => value);
  const opacity = useTransform(progress, value => 1 - value);

  return <motion.span aria-hidden="true" className={RING_CLASS} style={{ scale, opacity }} />;
}

interface PremiumWelcomeModalProps {
  guildName: string;
  /** Trial checkouts complete at $0.00, so the subtitle must not imply a charge. */
  trialing: boolean;
  onClose: () => void;
}

/**
 * Replaces the green "Premium is active" strip that used to mark a completed
 * checkout. It is the one moment on the dashboard worth interrupting for, so it
 * takes the screen: no backdrop dismissal and no close affordance but the
 * button, which is also what clears `?success=true` from the URL so a refresh
 * cannot replay it.
 *
 * Everything animates on one hand-tuned timeline rather than a variant tree —
 * the header wipe, the mark's spring, the rows and the button each need their
 * own curve, and the ripple is a perpetual loop that no stagger can express.
 * Delays are literals in render order so the sequence is readable top to bottom.
 *
 * Deliberately states no first-charge date — the panel behind it already
 * carries the billing date, and a client-computed one would hydrate differently
 * from the server render.
 */
export function PremiumWelcomeModal({ guildName, trialing, onClose }: PremiumWelcomeModalProps) {
  // Explicit rather than <MotionConfig reducedMotion="user">: that only drops
  // transforms, which would leave the rings pinned at their start scale
  // blinking in and out. Here they become static concentric circles instead.
  const reduce = useReducedMotion() ?? false;
  const contentRef = useRef<HTMLDivElement>(null);

  /** Fade-and-rise entrance; rise is dropped under reduced motion, fade is not. */
  const rise = (delay: number) => ({
    initial: { opacity: 0, y: reduce ? 0 : 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduce ? 0.2 : 0.45, delay: reduce ? 0 : delay, ease: EASE_OUT },
  });

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent
        ref={contentRef}
        tabIndex={-1}
        showCloseButton={false}
        onInteractOutside={event => event.preventDefault()}
        onOpenAutoFocus={event => {
          // Radix focuses the CTA, painting a focus ring over the one element
          // this screen exists to celebrate. Park focus on the dialog instead —
          // Tab still reaches the button and the focus trap is unaffected.
          event.preventDefault();
          contentRef.current?.focus();
        }}
        className="max-w-md gap-0 overflow-hidden border-slate-800 p-8 text-center shadow-2xl shadow-black/60 outline-none"
      >
        {/* Violet-to-nothing border, painted as a 1px ring rather than a border
            colour so it can be a gradient: two identical mask layers, one
            clipped to the content box, subtracted from each other to leave only
            the frame. Longhands, never the `mask` shorthand — Tailwind emits the
            shorthand after `mask-composite`, which resets it back to `add` and
            paints the gradient across the whole card. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit] p-px [background:linear-gradient(to_bottom,rgba(167,139,250,0.6),rgba(59,130,246,0.2)_38%,rgba(148,163,184,0.05)_75%)] [mask-clip:content-box,border-box] mask-exclude mask-[linear-gradient(#fff_0_0),linear-gradient(#fff_0_0)]"
        />

        {/* The blue-purple hairline the Premium cards carry, wiped in from the
            centre. It fades into the card's own corners, so overflow-hidden has
            nothing to cut. */}
        <motion.div
          aria-hidden="true"
          initial={{ scaleX: reduce ? 1 : 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: reduce ? 0.2 : 0.75, ease: EASE_OUT }}
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-blue-400 to-transparent"
        />
        <motion.div
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduce ? 0.2 : 0.9, delay: reduce ? 0 : 0.1, ease: 'easeOut' }}
          className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-linear-to-b from-blue-500/12 to-transparent"
        />

        {/* Fixed height so the widest ring clears the card edge instead of being
            clipped — the ripple is the reward, not a cropped arc. */}
        <div className="relative flex h-52 items-center justify-center">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute size-28 rounded-full bg-violet-500/25 blur-2xl"
          />
          {RIPPLE_STATIC_SCALE.map((staticScale, index) =>
            reduce ? (
              // Plain spans, so the perpetual frame loop never starts.
              <span
                key={staticScale}
                aria-hidden="true"
                className={RING_CLASS}
                style={{ transform: `scale(${staticScale})`, opacity: 0.16 }}
              />
            ) : (
              <RippleRing key={staticScale} index={index} />
            )
          )}
          <motion.div
            initial={{ scale: reduce ? 1 : 0.35, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={
              reduce
                ? { duration: 0.2 }
                : { type: 'spring', stiffness: 280, damping: 16, delay: 0.12 }
            }
            className="relative flex size-16 items-center justify-center rounded-2xl bg-linear-to-br from-violet-500 to-blue-500 shadow-lg shadow-violet-500/40"
          >
            <Zap className="size-8 text-white" aria-hidden="true" />
          </motion.div>
        </div>

        <DialogTitle asChild>
          <motion.h2 {...rise(0.38)} className="text-2xl font-semibold text-white">
            You&apos;re now{' '}
            <span className="bg-linear-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent">
              Premium
            </span>
            !
          </motion.h2>
        </DialogTitle>
        <DialogDescription asChild>
          <motion.p {...rise(0.46)} className="mt-2 text-sm text-slate-300">
            {trialing ? `${PREMIUM_TRIAL_DAYS}-day free trial active on ` : 'Premium is active on '}
            <span className="font-medium text-white">{guildName}</span>.
          </motion.p>
        </DialogDescription>

        {/* Full-bleed so it reads as a division of the card, not a rule drawn
            inside it, and fading at both ends so it never collides with the
            gradient frame. */}
        <motion.div
          aria-hidden="true"
          initial={{ opacity: 0, scaleX: reduce ? 1 : 0.6 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: reduce ? 0.2 : 0.5, delay: reduce ? 0 : 0.52, ease: EASE_OUT }}
          className="-mx-8 mt-7 h-px bg-linear-to-r from-transparent via-slate-700 to-transparent"
        />

        <ul className="mt-7 space-y-3 text-left">
          {PREMIUM_PLAN_FEATURES.map((feature, index) => {
            const delay = 0.56 + index * 0.08;
            const FeatureIcon = FEATURE_ICONS[feature] ?? Sparkles;
            return (
              <motion.li
                key={feature}
                initial={{ opacity: 0, x: reduce ? 0 : -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  duration: reduce ? 0.2 : 0.4,
                  delay: reduce ? 0 : delay,
                  ease: EASE_OUT,
                }}
                className="flex items-center gap-3 text-sm text-slate-100"
              >
                <motion.span
                  initial={{ scale: reduce ? 1 : 0 }}
                  animate={{ scale: 1 }}
                  transition={
                    reduce
                      ? { duration: 0.2 }
                      : { type: 'spring', stiffness: 420, damping: 15, delay: delay + 0.06 }
                  }
                  className="flex size-6 shrink-0 items-center justify-center rounded-full border border-green-500/40 bg-green-500/10"
                >
                  <Check className="size-3.5 text-green-400" aria-hidden="true" />
                </motion.span>
                {feature}
                <FeatureIcon
                  className="ml-auto size-4 shrink-0 text-slate-600"
                  aria-hidden="true"
                />
              </motion.li>
            );
          })}
        </ul>

        <motion.div {...rise(0.56 + PREMIUM_PLAN_FEATURES.length * 0.08)} className="mt-9">
          <Button
            size="xl"
            onClick={onClose}
            className="w-full bg-linear-to-r from-violet-600 to-blue-600 text-base text-white shadow-[0_10px_30px_-8px_rgba(139,92,246,0.7)] hover:from-violet-500 hover:to-blue-500 hover:shadow-[0_12px_34px_-8px_rgba(139,92,246,0.9)]"
          >
            Start exploring Premium
          </Button>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
