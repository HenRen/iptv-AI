'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Channel, NowNext } from '@/types';
import { api } from '@/lib/api/client';
import { useVirtualList } from '@/hooks/useVirtualList';
import { useUserStore } from '@/stores/userStore';
import { CHANNEL_ROW_HEIGHT, ChannelRow } from './ChannelRow';
import { EmptyState, Skeleton } from '@/components/common';

/**
 * Virtualized channel list with lazily fetched now/next.
 *
 * Two things make this hold up at 20,000 channels: only the visible window is
 * rendered, and EPG is requested only for the rows actually on screen (in one
 * batched call per window, cached thereafter) rather than for the whole list.
 */
export function ChannelList({
  channels,
  loading,
  activeChannelId,
  onSelect,
}: {
  channels: Channel[];
  loading: boolean;
  activeChannelId: string | null;
  onSelect: (channel: Channel) => void;
}) {
  const [nowNext, setNowNext] = useState<Record<string, NowNext>>({});
  const requested = useRef<Set<string>>(new Set());

  const favorites = useUserStore((s) => s.favorites);
  const toggleFavorite = useUserStore((s) => s.toggleFavorite);
  const favoriteChannelIds = useMemo(
    () => new Set(favorites.filter((f) => f.kind === 'channel').map((f) => f.id)),
    [favorites],
  );

  const { scrollRef, startIndex, endIndex, totalHeight, offsetY, scrollToIndex } = useVirtualList({
    itemCount: channels.length,
    itemHeight: CHANNEL_ROW_HEIGHT,
  });

  // A new list is a new EPG cache.
  useEffect(() => {
    requested.current = new Set();
    setNowNext({});
  }, [channels]);

  // Fetch now/next for the visible window only.
  useEffect(() => {
    const window = channels.slice(startIndex, endIndex);
    const missing = window.map((c) => c.id).filter((id) => !requested.current.has(id));
    if (missing.length === 0) return;
    missing.forEach((id) => requested.current.add(id));

    let cancelled = false;
    api
      .nowNext(missing)
      .then((res) => {
        if (!cancelled) setNowNext((prev) => ({ ...prev, ...res.nowNext }));
      })
      .catch(() => {
        // Allow a retry on the next scroll rather than pinning a failure.
        missing.forEach((id) => requested.current.delete(id));
      });
    return () => {
      cancelled = true;
    };
  }, [channels, startIndex, endIndex]);

  // Keep the playing channel in view when it changes from outside the list
  // (a zap, or a jump from the guide).
  useEffect(() => {
    if (!activeChannelId) return;
    const index = channels.findIndex((c) => c.id === activeChannelId);
    if (index >= 0) scrollToIndex(index, 'nearest');
  }, [activeChannelId, channels, scrollToIndex]);

  if (loading) {
    return (
      <div className="space-y-px p-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (channels.length === 0) {
    return (
      <EmptyState
        title="No channels here"
        description="This category is empty, or every channel in it is hidden by your parental control settings."
      />
    );
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto" data-nav-trap="horizontal">
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {channels.slice(startIndex, endIndex).map((channel) => (
            <ChannelRow
              key={channel.id}
              channel={channel}
              nowNext={nowNext[channel.id]}
              active={channel.id === activeChannelId}
              favorite={favoriteChannelIds.has(channel.id)}
              onSelect={() => onSelect(channel)}
              onToggleFavorite={() => toggleFavorite('channel', channel.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
