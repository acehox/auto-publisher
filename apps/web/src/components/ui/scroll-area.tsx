'use client';

import { ScrollArea as ScrollAreaPrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Radix hides the native scrollbar on the viewport and draws this one, which is
 * why dark surfaces (dropdown menus, the role picker) stop rendering the OS's
 * light scrollbar. `type="auto"` keeps the bar visible whenever the content
 * overflows — inside a popover it is the only cue that there is more below.
 *
 * `className` sizes the Root; the viewport inherits its max height so callers
 * can cap a list with a single `max-h-*`.
 */
function ScrollArea({
  className,
  viewportClassName,
  children,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root> & { viewportClassName?: string }) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      type="auto"
      className={cn('relative overflow-hidden', className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className={cn(
          'size-full max-h-[inherit] rounded-[inherit] outline-none',
          viewportClassName
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  className,
  orientation = 'vertical',
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        'flex touch-none select-none p-px transition-colors',
        orientation === 'vertical' && 'h-full w-2 border-l border-l-transparent',
        orientation === 'horizontal' && 'h-2 flex-col border-t border-t-transparent',
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-slate-700 transition-colors hover:bg-slate-600"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
}

export { ScrollArea, ScrollBar };
