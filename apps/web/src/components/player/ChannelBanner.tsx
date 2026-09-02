'use client';

import { useEffect, useState } from 'react';
import { timeRange } from '@streamwise/core';
import type { NowNext } from '@streamwise/core';
import { usePlayerStore } from '@/stores/playerStore';
import { api } from '@/lib/api/client';
import { Artwork, LiveBadge } from '@/components/common';
import { cn } from '@/lib/utils/cn';

/**
 * The zap banner: number, channel, what is on, LIVE — shown for ~3 seconds
 * after a channel change, exactly as a set-top box does. It is the fastest
 * way to answer "what did I just land on" without opening anything.
 */
const BANNER_MS = 3200;

export function ChannelBanner({ visible = true }: { visible?: boolean }) {
  const banner = usePlayerStore((s) => s.banner);
  const clearBanner = usePlayerStore((s) => s.clearBanner);
  const [nowNext, setNowNext] = useState<NowNext | null>(null);

  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(clearBanner, BANNER_MS);
    return () => clearTimeout(timer);
  }, [banner, clearBanner]);

  useEffect(() => {
    if (!banner) {
      setNowNext(null);
      return;
    }
    let cancelled = false;
    api
      .nowNext([banner.channel.id])
      .then((res) => {
        if (!cancelled) setNowNext(res.nowNext[banner.channel.id] ?? null);
      })
      .catch(() => {
        // A banner without EPG still shows the channel — no error surface.
      });
    return () => {
      cancelled = true;
    };
  }, [banner]);

  if (!banner || !visible) return null;

  const { channel } = banner;

  return (
    <div
      className={cn(
        'pointer-events-none absolute left-6 top-6 z-10 flex items-center gap-4 rounded-card',
        'border border-line bg-ground-deep/85 px-5 py-4 shadow-lift backdrop-blur-md',
        'animate-zap-in',
      )}
      role="status"
      aria-live="polite"
    >
      <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-tile bg-surface-2">
        <Artwork src={channel.logo} alt={channel.name} kind="channel" className="h-full w-full text-sm" />
      </div>

      <div className="min-w-0">
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-semibold tabular-nums leading-none text-accent">
            {channel.number}
          </span>
          <span className="truncate text-base font-semibold leading-none">{channel.name}</span>
          <LiveBadge />
        </div>
        <p className="mt-2 truncate text-sm text-ink-soft">
          {nowNext?.now?.title ?? 'No guide information'}
        </p>
        {nowNext?.now ? (
          <p className="mt-0.5 text-xs tabular-nums text-ink-mute">
            {timeRange(nowNext.now.start, nowNext.now.stop)}
            {nowNext.next ? <span className="ml-3">Next: {nowNext.next.title}</span> : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}
