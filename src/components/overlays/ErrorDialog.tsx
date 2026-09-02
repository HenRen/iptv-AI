'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUiStore, type ErrorKind } from '@/stores/uiStore';
import { usePlayerStore } from '@/stores/playerStore';
import { cn } from '@/lib/utils/cn';
import { Focusable, Icon, Spinner } from '@/components/common';
import type { IconName } from '@/components/icons';

/**
 * Full-screen error dialogs (PROTOTYPE.md §15).
 *
 * The rule that shapes all three: **no credentials, URLs, hostnames or HTTP
 * codes**. A viewer sitting on a sofa cannot act on "502 from
 * line.provider.tv" — they can act on "try a backup stream". Technical detail
 * belongs in Settings → Diagnostics, where someone is deliberately looking
 * for it, not on the television.
 */

interface ErrorAction {
  label: string;
  run: () => void;
  primary?: boolean;
  danger?: boolean;
}

interface ErrorSpec {
  icon: IconName;
  kicker: string;
  title: string;
  body: string;
  /** Shown with a spinner — the app is already retrying on its own. */
  retrying?: boolean;
}

const SPEC: Record<ErrorKind, ErrorSpec> = {
  stream: {
    icon: 'iptv-health',
    kicker: 'Playback',
    title: 'Stream failed',
    body: 'This channel did not start. It may be temporarily unavailable from your provider, or another device may be using your connection limit.',
  },
  conn: {
    icon: 'iptv-connection',
    kicker: 'Network',
    title: 'IPTV connection lost',
    body: 'Your TV cannot reach the provider right now. This is usually the network rather than the provider itself.',
    retrying: true,
  },
  auth: {
    icon: 'iptv-parental',
    kicker: 'Account',
    title: 'Your IPTV connection needs attention',
    body: 'The provider is no longer accepting this connection. Your subscription may have expired, or the details may have changed.',
  },
};

export function ErrorDialog() {
  const router = useRouter();
  const kind = useUiStore((s) => s.errorDialog);
  const dismiss = useUiStore((s) => s.dismissError);

  const nowPlaying = usePlayerStore((s) => s.nowPlaying);
  const zap = usePlayerStore((s) => s.zap);
  const source = usePlayerStore((s) => s.source);
  const playChannel = usePlayerStore((s) => s.playChannel);
  const zapList = usePlayerStore((s) => s.zapList);

  useEffect(() => {
    if (!kind) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Backspace') {
        e.preventDefault();
        dismiss();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [kind, dismiss]);

  if (!kind) return null;
  const spec = SPEC[kind];

  const actions: ErrorAction[] =
    kind === 'stream'
      ? [
          {
            label: 'Retry',
            primary: true,
            run: () => {
              const current = zapList.find((c) => c.id === nowPlaying?.id);
              if (current) void playChannel(current);
              dismiss();
            },
          },
          {
            label: 'Next channel',
            run: () => {
              void zap(1);
              dismiss();
            },
          },
          { label: 'Dismiss', run: dismiss },
        ]
      : kind === 'conn'
        ? [
            {
              label: 'Retry now',
              primary: true,
              run: () => {
                window.location.reload();
              },
            },
            {
              label: 'Open network settings',
              run: () => {
                router.push('/settings?tab=network');
                dismiss();
              },
            },
          ]
        : [
            {
              label: 'Open connection settings',
              primary: true,
              run: () => {
                router.push('/settings/playlists');
                dismiss();
              },
            },
            { label: 'Dismiss', run: dismiss },
          ];

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={spec.title}
      className="fixed inset-0 z-[80] grid place-items-center bg-ground-deep/95 p-10 backdrop-blur-md animate-fade-in"
    >
      <div className="w-full max-w-xl text-center animate-zap-in">
        <span
          className={cn(
            'mx-auto mb-8 grid h-20 w-20 place-items-center rounded-full border',
            kind === 'stream'
              ? 'border-live/30 bg-live/10 text-live'
              : kind === 'conn'
                ? 'border-warn/30 bg-warn/10 text-warn'
                : 'border-accent/30 bg-accent/10 text-accent',
          )}
        >
          <Icon name={spec.icon} size={38} />
        </span>

        <div className="sw-kicker mb-3 text-ink-dim">{spec.kicker}</div>
        <h2 className="text-[38px] font-bold leading-tight tracking-tight text-ink text-balance">
          {spec.title}
        </h2>
        <p className="mx-auto mt-5 max-w-md text-[16px] leading-relaxed text-ink-mute text-balance">
          {spec.body}
        </p>

        {spec.retrying ? (
          <p className="mt-6 inline-flex items-center gap-3 text-[13px] uppercase tracking-label text-ink-faint">
            <Spinner size={16} />
            Trying to reconnect…
          </p>
        ) : null}

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          {actions.map((action) => (
            <Focusable
              key={action.label}
              onClick={action.run}
              className={cn(
                'rounded-pill px-8 py-3.5 text-[15px] font-bold uppercase tracking-label',
                action.primary
                  ? 'bg-accent text-ground hover:brightness-110'
                  : 'border border-line-strong text-ink-soft hover:border-white hover:text-ink',
              )}
              focusClassName={action.primary ? 'shadow-focus-strong' : undefined}
            >
              {action.label}
            </Focusable>
          ))}
        </div>

        {/* Deliberately the only technical affordance offered here. */}
        <p className="mt-8 text-[12px] text-ink-dim">
          Technical details are in Settings › Diagnostics.
        </p>
      </div>
    </div>
  );
}
