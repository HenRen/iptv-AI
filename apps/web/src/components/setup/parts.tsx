'use client';

import { cn } from '@/lib/utils/cn';
import { Focusable, Icon } from '@/components/common';
import type { IconName } from '@/components/icons';

/**
 * Shared furniture for the first-run flow.
 *
 * The setup screens are the only part of the app a user sees before they have
 * any content, so they carry the identity harder than anywhere else: big
 * confident type, a lot of ground, one accent.
 */

export function SetupShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <main className="sw-ground relative h-dvh overflow-y-auto">
      {/* A quiet cinematic wash — depth without competing with the content. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(120% 80% at 50% -10%, rgba(91,140,255,0.18), transparent 62%), radial-gradient(80% 60% at 90% 110%, rgba(91,140,255,0.09), transparent 60%)',
        }}
      />
      <div className={cn('relative mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-10', className)}>
        {children}
      </div>
    </main>
  );
}

export function SetupHeader({
  kicker,
  title,
  subtitle,
  onBack,
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  onBack?: () => void;
}) {
  return (
    <header className="pt-16">
      {onBack ? (
        <Focusable
          onClick={onBack}
          className="mb-8 inline-flex items-center gap-2.5 rounded-pill px-3 py-1.5 text-[13px] font-semibold uppercase tracking-label text-ink-mute hover:text-ink"
        >
          <Icon name="iptv-prev" size={16} />
          Back
        </Focusable>
      ) : null}
      {kicker ? <div className="sw-kicker mb-4 text-accent">{kicker}</div> : null}
      <h1 className="max-w-3xl text-[46px] font-bold leading-[1.05] tracking-tight text-ink text-balance">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-ink-mute text-balance">
          {subtitle}
        </p>
      ) : null}
    </header>
  );
}

export function SourceCard({
  icon,
  title,
  description,
  onSelect,
}: {
  icon: IconName;
  title: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <Focusable
      onClick={onSelect}
      lift="sm"
      bare
      className="group w-full rounded-panel border border-line bg-gradient-to-b from-surface-2 to-surface-1 p-10 text-left data-[focused=true]:border-accent data-[focused=true]:shadow-lift"
    >
      <span className="mb-7 grid h-14 w-14 place-items-center rounded-tile bg-accent/12 text-accent">
        <Icon name={icon} size={28} />
      </span>
      <span className="block text-[21px] font-semibold text-ink">{title}</span>
      <span className="mt-2.5 block text-[14px] leading-relaxed text-ink-mute">{description}</span>
    </Focusable>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[12px] font-semibold uppercase tracking-label text-ink-mute">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1.5 block text-[12px] text-ink-dim">{hint}</span> : null}
    </label>
  );
}

export function Input({
  value,
  onChange,
  className,
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <input
      data-focusable=""
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'w-full rounded-tile border border-line bg-surface-1 px-4 py-3.5 text-[15px] text-ink',
        'placeholder:text-ink-dim focus:border-accent focus:shadow-focus',
        className,
      )}
      {...rest}
    />
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = 'button',
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}) {
  return (
    <button
      type={type}
      data-focusable=""
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'tv-focus rounded-pill bg-accent px-10 py-4 text-[16px] font-bold uppercase tracking-label text-ground',
        'hover:brightness-110 focus:shadow-focus-strong',
        'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-dim disabled:hover:brightness-100',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <Focusable
      onClick={onClick}
      className={cn(
        'rounded-pill border border-line-strong px-7 py-3.5 text-[14px] font-semibold uppercase tracking-label text-ink-mute hover:border-white hover:text-ink',
        className,
      )}
    >
      {children}
    </Focusable>
  );
}

/** The stat blocks shown after a successful connect. */
export function StatGrid({ stats }: { stats: Array<[string, number | string]> }) {
  return (
    <div className="grid w-full grid-cols-2 gap-4 sm:grid-cols-4">
      {stats.map(([label, value]) => (
        <div key={label} className="sw-card px-6 py-7 text-center">
          <div className="text-[30px] font-bold tabular-nums leading-none text-ink">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </div>
          <div className="mt-2.5 text-[11px] font-semibold uppercase tracking-label text-ink-mute">
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}

/** A single step in the multi-stage progress screens. */
export function StepRow({
  label,
  state,
}: {
  label: string;
  state: 'done' | 'active' | 'pending';
}) {
  return (
    <li
      className={cn(
        'flex items-center gap-4 rounded-tile px-5 py-3.5 transition-colors duration-300',
        state === 'active' && 'bg-accent/10',
      )}
    >
      <span
        className={cn(
          'grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] font-bold',
          state === 'done' && 'border-ok bg-ok text-ground',
          state === 'active' && 'border-accent text-accent',
          state === 'pending' && 'border-line text-ink-dim',
        )}
      >
        {state === 'done' ? '✓' : state === 'active' ? <PulseDot /> : ''}
      </span>
      <span
        className={cn(
          'text-[15px]',
          state === 'done' && 'text-ink-mute',
          state === 'active' && 'font-semibold text-ink',
          state === 'pending' && 'text-ink-dim',
        )}
      >
        {label}
      </span>
    </li>
  );
}

function PulseDot() {
  return <span className="h-1.5 w-1.5 animate-signal rounded-full bg-accent" />;
}
