'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Settings, UserRound } from 'lucide-react';
import type { ConnectionStatus } from '@/types';
import { usePlaylistStore } from '@/stores/playlistStore';
import { cn } from '@/lib/utils/cn';
import { clockTime } from '@/lib/utils/time';

const STATUS_LABEL: Record<ConnectionStatus | 'no-playlist', string> = {
  connected: 'Connected',
  connecting: 'Connecting',
  offline: 'Offline',
  'auth-failed': 'Authentication failed',
  'playlist-error': 'Playlist error',
  'stream-error': 'Stream error',
  'no-playlist': 'No playlist',
};

const STATUS_TONE: Record<ConnectionStatus | 'no-playlist', string> = {
  connected: 'bg-ok',
  connecting: 'bg-warn animate-pulse',
  offline: 'bg-live',
  'auth-failed': 'bg-live',
  'playlist-error': 'bg-live',
  'stream-error': 'bg-warn',
  'no-playlist': 'bg-ink-faint',
};

export function TopBar({ title }: { title?: string }) {
  const [now, setNow] = useState<string>('');
  const active = usePlaylistStore((s) => s.active());
  const loading = usePlaylistStore((s) => s.loading);
  const refresh = usePlaylistStore((s) => s.refreshActive);

  useEffect(() => {
    const tick = () => setNow(clockTime(Date.now()));
    tick();
    const timer = setInterval(tick, 15_000);
    return () => clearInterval(timer);
  }, []);

  const status: ConnectionStatus | 'no-playlist' = active?.status ?? 'no-playlist';

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line/70 px-6">
      <h1 className="truncate text-sm font-semibold tracking-tight text-ink">{title}</h1>

      <div className="flex items-center gap-4">
        <div
          className="flex items-center gap-2 text-xs text-ink-mute"
          title={active?.lastError ?? undefined}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_TONE[status])} aria-hidden />
          <span className="hidden sm:inline">{STATUS_LABEL[status]}</span>
        </div>

        {active ? (
          <button
            type="button"
            data-focusable=""
            onClick={() => void refresh()}
            disabled={loading}
            aria-label="Refresh playlist"
            className="tv-focus rounded-tile p-1.5 text-ink-mute hover:text-ink focus:shadow-focus disabled:opacity-40"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden />
          </button>
        ) : null}

        <span className="text-sm tabular-nums text-ink-soft">{now}</span>

        <Link
          href="/settings"
          data-focusable=""
          aria-label="Settings"
          className="tv-focus rounded-tile p-1.5 text-ink-mute hover:text-ink focus:shadow-focus"
        >
          <Settings className="h-4 w-4" aria-hidden />
        </Link>
        <span
          className="grid h-7 w-7 place-items-center rounded-full bg-surface-3 text-ink-mute"
          aria-hidden
        >
          <UserRound className="h-4 w-4" />
        </span>
      </div>
    </header>
  );
}
