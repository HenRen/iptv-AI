'use client';

import { forwardRef, useState, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * The one focusable primitive in the app.
 *
 * Every interactive element goes through this so that (a) spatial navigation
 * can find it, and (b) the focus treatment is identical everywhere — which on
 * a television is the difference between usable and unusable.
 */
export interface FocusableProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Applied in addition to the base ring when focused. */
  focusClassName?: string;
  /** Suppress the default ring for elements that style focus themselves. */
  bare?: boolean;
}

export const Focusable = forwardRef<HTMLButtonElement, FocusableProps>(function Focusable(
  { className, focusClassName, bare, children, onFocus, onBlur, ...props },
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
        // Hover moves focus so mouse and remote never disagree about where
        // "here" is — pressing Enter after hovering does what you expect.
        e.currentTarget.focus({ preventScroll: true });
      }}
      {...props}
    >
      {children}
    </button>
  );
});
