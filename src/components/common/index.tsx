'use client';

import { useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon, LiveIcon } from '@/components/icons';

export { Focusable } from './Focusable';
export { Artwork } from './Artwork';
export { Icon, LiveIcon } from '@/components/icons';

/* ------------------------------------------------------------------ */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-tile', className)} />;
}

export function ProgressBar({
  value,
  className,
  tone = 'accent',
  height = 3,
}: {
  value: number;
  className?: string;
  tone?: 'accent' | 'live' | 'ok';
  height?: number;
}) {
  return (
    <div
      className={cn('w-full overflow-hidden rounded-pill bg-white/10', className)}
      style={{ height }}
    >
      <div
        className={cn('h-full rounded-pill transition-[width] duration-500', {
          'bg-accent': tone === 'accent',
          'bg-live': tone === 'live',
          'bg-ok': tone === 'ok',
        })}
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
      />
    </div>
  );
}

/** The LIVE badge. Its dot pulses, so "live" is legible without reading. */
export function LiveBadge({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-pill bg-live font-bold uppercase tracking-label text-white',
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]',
        className,
      )}
    >
      <span className="h-1.5 w-1.5 animate-signal rounded-full bg-white" />
      Live
    </span>
  );
}

export function Chip({
  children,
  className,
  tone = 'neutral',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'neutral' | 'accent';
}) {
  return (
    <span
      className={cn(
        'rounded-pill border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-label',
        tone === 'accent'
          ? 'border-accent/40 bg-accent/10 text-accent'
          : 'border-line bg-white/[0.03] text-ink-mute',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** The AI marker. Cobalt and the Intelligence Node — never a sparkle. */
export function AiTag({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-kicker text-accent',
        className,
      )}
    >
      <Icon name="iptv-ai" size={14} />
      {children ?? 'AI Pick'}
    </span>
  );
}

export function Spinner({ className, size = 22 }: { className?: string; size?: number }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn('inline-block animate-spin-x rounded-full border-[3px]', className)}
      style={{
        width: size,
        height: size,
        borderColor: 'rgba(91,140,255,0.2)',
        borderTopColor: '#5B8CFF',
      }}
    />
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon = 'iptv-live',
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: Parameters<typeof Icon>[0]['name'];
}) {
  return (
    <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-4 px-10 text-center">
      <Icon name={icon} size={44} className="text-ink-dim" />
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      {description ? (
        <p className="max-w-lg text-sm leading-relaxed text-ink-mute text-balance">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

export function ErrorNotice({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-card border border-live/30 bg-live/[0.08] px-5 py-4">
      <Icon name="iptv-info" size={18} className="mt-0.5 shrink-0 text-live" />
      <div className="flex-1">
        <p className="text-sm leading-relaxed text-ink">{message}</p>
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Horizontal content rail. The 56px page gutter is part of the design's
 * rhythm, so the rail bleeds to the right edge while keeping that gutter on
 * the left — content reads as continuing off-screen rather than stopping.
 */
export function Rail({
  title,
  subtitle,
  children,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  const nudge = (direction: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.round(el.clientWidth * 0.8), behavior: 'smooth' });
  };

  return (
    <section className={cn('group/rail', className)}>
      <header className="mb-4 flex items-end justify-between gap-4 pl-14 pr-14">
        <div>
          <h2 className="sw-label text-ink">{title}</h2>
          {subtitle ? <p className="mt-1 text-[13px] text-ink-mute">{subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {action}
          {/*
            Pointer-only affordance. Deliberately outside the focus order:
            on a remote, moving focus along the rail already scrolls it, so
            adding arrows would cost two extra presses per rail for no new
            capability. Marked aria-hidden and tabIndex -1 so this is an
            explicit decision rather than an element that merely happens to
            be hard to reach.
          */}
          <div
            aria-hidden
            className="hidden items-center gap-1.5 opacity-0 transition-opacity group-hover/rail:opacity-100 lg:flex"
          >
            <button
              type="button"
              tabIndex={-1}
              title={`Scroll ${title} left`}
              onClick={() => nudge(-1)}
              className="rounded-pill border border-line p-1.5 text-ink-mute hover:border-line-strong hover:text-ink"
            >
              <Icon name="iptv-prev" size={16} />
            </button>
            <button
              type="button"
              tabIndex={-1}
              title={`Scroll ${title} right`}
              onClick={() => nudge(1)}
              className="rounded-pill border border-line p-1.5 text-ink-mute hover:border-line-strong hover:text-ink"
            >
              <Icon name="iptv-next" size={16} />
            </button>
          </div>
        </div>
      </header>
      <div ref={scroller} className="rail-scroll flex gap-4 overflow-x-auto scroll-smooth pb-3 pl-14 pr-14">
        {children}
      </div>
    </section>
  );
}

/** Uppercase page heading with the design's kicker treatment above it. */
export function ScreenTitle({
  kicker,
  title,
  className,
}: {
  kicker?: string;
  title: string;
  className?: string;
}) {
  return (
    <div className={className}>
      {kicker ? <div className="mb-2 sw-kicker text-accent">{kicker}</div> : null}
      <h1 className="text-[34px] font-bold leading-none tracking-tight text-ink">{title}</h1>
    </div>
  );
}

export { LiveIcon as LiveGlyph };
