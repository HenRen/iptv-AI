'use client';

import { forwardRef, useState, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * The one focusable primitive.
 *
 * Everything interactive goes through this so that spatial navigation can
 * find it and the focus treatment is identical everywhere. `lift` adds the
 * scale the prototype uses on cards (1.03) and posters (1.06); flat controls
 * take the ring alone.
 */
export interface FocusableProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Scale on focus: cards 'sm', posters 'lg', none by default. */
  lift?: 'sm' | 'lg';
  /** Suppress the default white ring for elements that style focus themselves. */
  bare?: boolean;
  focusClassName?: string;
}

export const Focusable = forwardRef<HTMLButtonElement, FocusableProps>(function Focusable(
  { className, focusClassName, lift, bare, children, onFocus, onBlur, ...props },
  ref,
) {
  const [focused, setFocused] = useState(false);

  return (
    <button
      ref={ref}
      type="button"
      data-focusable=""
      data-focused={focused || undefined}
      className={cn(
        'tv-focus relative text-left no-select',
        lift === 'sm' && 'tv-lift',
        lift === 'lg' && 'tv-lift-lg',
        !bare && 'rounded-tile',
        !bare && focused && 'shadow-focus',
        focused && focusClassName,
        className,
      )}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      onMouseEnter={(e) => {
        // Hover moves focus, so mouse and remote never disagree about where
        // "here" is — pressing OK after hovering does what you expect.
        e.currentTarget.focus({ preventScroll: true });
      }}
      {...props}
    >
      {children}
    </button>
  );
});
