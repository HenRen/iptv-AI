'use client';

import { useRef, type ReactNode } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export { Focusable } from './Focusable';
export { Artwork } from './Artwork';

/* ------------------------------------------------------------------ */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-tile', className)} />;
}

export function ProgressBar({
  value,
  className,
  tone = 'accent',
}: {
  value: number;
  className?: string;
  tone?: 'accent' | 'live';
}) {
  return (
    <div className={cn('h-[3px] w-full overflow-hidden rounded-full bg-surface-4', className)}>
      <div
        className={cn('h-full rounded-full transition-[width] duration-500', {
          'bg-accent': tone === 'accent',
          'bg-live': tone === 'live',
        })}
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
      />
    </div>
  );
}

export function LiveBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white',
        'bg-live/90',
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-white" />
      Live
    </span>
  );
}

export function Chip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'rounded border border-line bg-surface-2/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-mute',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-accent', className)} aria-hidden />;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 px-8 text-center">
      <div className="text-ink-faint">{icon ?? <AlertTriangle className="h-8 w-8" aria-hidden />}</div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description ? <p className="max-w-md text-sm text-ink-mute text-balance">{description}</p> : null}
      {action}
    </div>
  );
}

export function ErrorNotice({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-card border border-live/30 bg-live/10 px-4 py-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-live" aria-hidden />
      <div className="flex-1">
        <p className="text-sm text-ink">{message}</p>
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Horizontal content rail. Scrolls with the mouse wheel, with arrows for
 * pointer users; on a remote, spatial navigation handles it and
 * `scrollIntoView` on focus does the scrolling.
 */
export function Rail({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  const nudge = (direction: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.round(el.clientWidth * 0.8), behavior: 'smooth' });
  };

  return (
    <section className="group/rail">
      <header className="mb-3 flex items-end justify-between gap-4 px-8">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-ink-mute">{subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {action}
          <div className="hidden items-center gap-1 opacity-0 transition-opacity group-hover/rail:opacity-100 lg:flex">
            <button
              type="button"
              aria-label={`Scroll ${title} left`}
              onClick={() => nudge(-1)}
              className="rounded-full border border-line bg-surface-2/80 p-1 text-ink-mute hover:text-ink"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label={`Scroll ${title} right`}
              onClick={() => nudge(1)}
              className="rounded-full border border-line bg-surface-2/80 p-1 text-ink-mute hover:text-ink"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </header>
      <div
        ref={scroller}
        className="rail-scroll flex gap-3 overflow-x-auto scroll-smooth px-8 pb-2"
      >
        {children}
      </div>
    </section>
  );
}
