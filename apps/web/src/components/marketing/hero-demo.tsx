'use client';

import { Check, CheckCheck, Hash, LoaderCircle, Megaphone, Newspaper } from 'lucide-react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import Image from 'next/image';
import type { PointerEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

// Max tilt in degrees the mockup leans toward the pointer.
const MAX_TILT = 9;
// Tilt only engages from the `lg` breakpoint up (laptop and wider).
const TILT_QUERY = '(min-width: 1024px)';

export function HeroDemo() {
  // Pointer position as -0.5..0.5 offsets from the card center.
  const px = useMotionValue(0);
  const py = useMotionValue(0);

  const springConfig = { stiffness: 220, damping: 22, mass: 0.6 };
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [MAX_TILT, -MAX_TILT]), springConfig);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-MAX_TILT, MAX_TILT]), springConfig);

  // Whether the tilt is active, kept in a ref so pointer moves don't re-query matchMedia.
  const tiltEnabled = useRef(false);
  useEffect(() => {
    const media = window.matchMedia(TILT_QUERY);
    const sync = () => {
      tiltEnabled.current = media.matches;
      // Reset any lingering tilt when dropping below the breakpoint.
      if (!media.matches) {
        px.set(0);
        py.set(0);
      }
    };
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [px, py]);

  // Set after mount: the page is prerendered at build, so a render-time clock would
  // bake in the build's time and timezone and fail hydration.
  const [postedAt, setPostedAt] = useState('');
  useEffect(() => {
    setPostedAt(new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }));
  }, []);

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!tiltEnabled.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    px.set((event.clientX - rect.left) / rect.width - 0.5);
    py.set((event.clientY - rect.top) / rect.height - 0.5);
  };

  const resetTilt = () => {
    px.set(0);
    py.set(0);
  };

  return (
    <div
      className="relative perspective-[1024px] motion-reduce:perspective-none"
      onPointerMove={handlePointerMove}
      onPointerLeave={resetTilt}
    >
      <motion.div
        className="relative"
        style={{
          rotateX,
          rotateY,
          transformStyle: 'preserve-3d',
        }}
      >
        {/* Breathing glow behind the mockup */}
        <div className="animate-glow-breath absolute -inset-x-[6%] -top-[10%] -bottom-[12%] z-0 bg-radial-[circle_closest-side] from-blue-600/35 to-transparent to-72% blur-[20px]" />
        {/* Floating window */}
        <div className="animate-floaty relative z-10 overflow-hidden rounded-4xl border border-indigo-400/16 bg-slate-900 shadow-[0_40px_90px_-30px_rgba(0,0,0,.85),0_0_0_1px_rgba(120,150,255,.04)]">
          <div className="flex min-h-75">
            {/* Server rail */}
            <div className="hidden w-15 flex-col items-center gap-3 border-r border-indigo-400/7 bg-slate-950 py-4 sm:flex">
              <div className="flex size-10 items-center justify-center rounded-[13px] bg-linear-to-br from-blue-500 to-blue-600 text-white shadow-[0_6px_16px_-6px_rgba(47,107,255,.9)]">
                <Megaphone className="size-4.75" />
              </div>
              <div className="size-10 rounded-full bg-slate-900" />
              <div className="size-10 rounded-full bg-slate-900" />
              <div className="size-10 rounded-full bg-slate-900 opacity-60" />
            </div>

            {/* Channel */}
            <div className="flex flex-1 flex-col">
              <div className="flex items-center justify-between border-b border-indigo-400/8 px-4 py-3.25">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                  <Hash className="size-4 text-slate-500" /> announcements
                </div>
                <div className="hidden items-center gap-1.5 rounded-full border border-green-400/28 bg-green-400/10 px-2.5 py-1 text-[11px] font-semibold text-green-300 uppercase sm:inline-flex">
                  <span className="animate-live-ping inline-block size-1.5 rounded-full bg-green-400" />
                  Auto-Publishing on
                </div>
              </div>

              <div className="flex flex-1 flex-col gap-2 p-4">
                {/* Bot message: pops in colorless, then gains green background + border with the success toast */}
                <div className="animate-hero-message relative flex gap-2.75 rounded-[11px] border border-transparent px-3 py-2.5 text-[13.5px] leading-normal">
                  {/* Discord-style publish action: active megaphone until 5.0s, then greys out ("Published") */}
                  <div className="animate-hero-publish-btn group absolute -top-2 right-4 flex size-7 items-center justify-center rounded-lg border border-indigo-400/12 bg-slate-800/90 shadow-[0_6px_16px_-8px_rgba(0,0,0,.8)]">
                    <Megaphone className="size-3.5" />
                    {/* Tooltip: centered over the button; each label is its own pill so it
                      hugs its text (no trailing space). Label swaps with the publish phase. */}
                    <div className="pointer-events-none absolute bottom-full left-1/2 mb-1 grid -translate-x-1/2 justify-items-center opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="animate-hero-publish-label-pre col-start-1 row-start-1 whitespace-nowrap rounded-md border border-indigo-400/15 bg-slate-950 px-2 py-1 text-[11px] font-medium text-slate-200 shadow-lg">
                        Publish
                      </span>
                      <span className="animate-hero-publish-label-post col-start-1 row-start-1 whitespace-nowrap rounded-md border border-indigo-400/15 bg-slate-950 px-2 py-1 text-[11px] font-medium text-slate-200 shadow-lg">
                        Published
                      </span>
                    </div>
                  </div>
                  <div className="flex size-9 shrink-0 rounded-full items-center justify-center bg-linear-to-br from-slate-700 to-slate-800 text-white">
                    <Newspaper className="size-4.25" />
                  </div>
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-[13.5px] font-semibold text-slate-200">News bot</span>
                      <span className="text-[11px] text-slate-500">Today at {postedAt}</span>
                    </div>
                    <div className="mt-0.5 text-[13.5px] leading-normal text-slate-300">
                      Game update is live, huge thanks to everyone who tested! 🚀
                    </div>
                  </div>
                </div>
                <div className="ml-2 grid justify-items-start">
                  {/* Pending: spinning loader + "Auto-publishing..." in the message color, non-bold */}
                  <div className="animate-hero-tag-pending col-start-1 row-start-1 inline-flex items-center gap-1.5 text-[12px] text-slate-300">
                    <LoaderCircle className="animate-spin size-4" /> Auto-publishing...
                  </div>
                  {/* Published: swaps in with the success toast at 5.0s */}
                  <div className="animate-hero-tag col-start-1 row-start-1 inline-flex items-center gap-1.5 text-[12px] font-semibold text-green-300">
                    <CheckCheck className="size-4" /> Published to all servers
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Floating toast - pending */}
        <div className="animate-hero-toast-pending absolute -right-2.5 bottom-6 z-20 inline-flex items-center gap-2.5 rounded-[14px]  bg-blue-950/75 px-4 py-3 shadow-[0_20px_50px_-18px_rgba(0,0,0,.8)]">
          <Image
            src="/auto-publisher.png"
            alt="Auto Publisher"
            width={32}
            height={32}
            className="size-8 rounded-[9px]"
          />
          <div>
            <div className="text-[11px] font-bold text-slate-400">Auto Publisher</div>
            <div className="text-[13px] text-slate-300">
              New announcement detected
              <br />
              publishing now...
            </div>
          </div>
        </div>

        {/* Floating toast - success (replaces pending at 4.5s) */}
        <div className="animate-hero-toast-success absolute -right-2.5 bottom-6 z-20 inline-flex items-center gap-2.5 rounded-[14px] border border-green-400/30 bg-slate-900 px-4 py-3 shadow-[0_20px_50px_-18px_rgba(0,0,0,.8)]">
          <div className="flex size-8 items-center justify-center rounded-[9px] bg-green-400/16 text-green-400">
            <Check className="size-4" />
          </div>
          <div>
            <div className="text-[13px] font-bold text-slate-100">Published successfully</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
