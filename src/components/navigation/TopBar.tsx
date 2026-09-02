'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ConnectionStatus } from '@/types';
import { usePlaylistStore } from '@/stores/playlistStore';
import { useUiStore } from '@/stores/uiStore';
import { useAiStore } from '@/stores/aiStore';
import { cn } from '@/lib/utils/cn';
import { clockTime } from '@/lib/utils/time';
import { Icon } from '@/components/icons';
import {
  COLOR_KEY_ACTIONS,
  COLOR_KEY_HEX,
  COLOR_KEY_ORDER,
} from '@/lib/ui/colorKeys';

/**
 * Minimal top bar, 72px.
 *
 * The colour-key legend is the notable piece: it is not decoration, it is the
 * on-screen map of the four physical buttons on the remote, and each swatch
 * is clickable so the same affordance works with a mouse. It reflects the
 * user's own mapping from Settings → Remote & Controls.
 */

const STATUS_LABEL: Record<ConnectionStatus | 'no-playlist', string> = {
  connected: 'IPTV Connected',
  connecting: 'Connecting',
  offline: 'Offline',
  'auth-failed': 'Needs attention',
  'playlist-error': 'Playlist error',
  'stream-error': 'Stream issue',
  'no-playlist': 'No provider',
};

const STATUS_TONE: Record<ConnectionStatus | 'no-playlist', string> = {
  connected: 'bg-ok',
  connecting: 'bg-warn animate-signal',
  offline: 'bg-live',
  'auth-failed': 'bg-live',
  'playlist-error': 'bg-live',
  'stream-error': 'bg-warn',
  'no-playlist': 'bg-ink-dim',
};

export function TopBar({ title }: { title?: string }) {
  const router = useRouter();
  const [now, setNow] = useState('');

  const active = usePlaylistStore((s) => s.active());
  const loading = usePlaylistStore((s) => s.loading);
  const refresh = usePlaylistStore((s) => s.refreshActive);

  const colorKeys = useUiStore((s) => s.colorKeys);
  const openAssistant = useAiStore((s) => s.openAssistant);

  useEffect(() => {
    const tick = () => setNow(clockTime(Date.now()));
    tick();
    // Align to the minute rather than drifting on a 15s poll.
    const timer = setInterval(tick, 15_000);
    return () => clearInterval(timer);
  }, []);

  const status: ConnectionStatus | 'no-playlist' = active?.status ?? 'no-playlist';

  const trigger = (action: (typeof colorKeys)[keyof typeof colorKeys]) => {
    const target = COLOR_KEY_ACTIONS[action];
    if (target.href) router.push(target.href);
    else openAssistant();
  };

  return (
    <header className="flex h-[72px] shrink-0 items-center justify-between gap-6 px-14">
      <h1 className="truncate sw-label text-ink">{title}</h1>

      <div className="flex items-center gap-7">
        {/* Colour-key legend — the remote's four buttons, on screen. */}
        <div className="hidden items-center gap-2 xl:flex" aria-label="Remote colour keys">
          {COLOR_KEY_ORDER.map((key) => {
            const action = colorKeys[key];
            return (
              <button
                key={key}
                type="button"
                data-focusable=""
                onClick={() => trigger(action)}
                aria-label={`${key} key: ${COLOR_KEY_ACTIONS[action].label}`}
                className="tv-focus flex items-center gap-2 rounded-pill border border-line px-2.5 py-1 text-[11px] font-semibold uppercase tracking-label text-ink-mute hover:border-line-strong hover:text-ink focus:shadow-focus"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: COLOR_KEY_HEX[key] }}
                  aria-hidden
                />
                {COLOR_KEY_ACTIONS[action].label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          data-focusable=""
          onClick={() => void refresh()}
          disabled={loading || !active}
          title={active?.lastError ?? undefined}
          className="tv-focus flex items-center gap-2.5 rounded-pill px-2 py-1 text-[13px] text-ink-mute hover:text-ink focus:shadow-focus disabled:opacity-60"
        >
          <span className={cn('h-2 w-2 rounded-full', STATUS_TONE[status])} aria-hidden />
          <span className="hidden sm:inline">{STATUS_LABEL[status]}</span>
          {loading ? <Icon name="iptv-recent" size={14} className="animate-spin-x" /> : null}
        </button>

        <span className="text-[15px] font-medium tabular-nums text-ink-soft">{now}</span>

        <span
          className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface-2 text-ink-mute"
          aria-hidden
        >
          <Icon name="iptv-profile" size={18} />
        </span>
      </div>
    </header>
  );
}
