'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Category, Channel, NowNext } from '@/types';
import { api } from '@/lib/api/client';
import { usePlayerStore } from '@/stores/playerStore';
import { useUserStore } from '@/stores/userStore';
import { TopBar } from '@/components/navigation/TopBar';
import { PlayerSlot } from '@/components/player/PlayerHost';
import {
  ALL_CATEGORY,
  CategoryRail,
  FAVORITES_CATEGORY,
  RECENT_CATEGORY,
} from '@/components/live/CategoryRail';
import { ChannelList } from '@/components/live/ChannelList';
import { EmptyState, ErrorNotice, LiveBadge, ProgressBar } from '@/components/common';
import { timeRange } from '@/lib/utils/time';

/**
 * Live TV.
 *
 * Three panes: categories, channels, player. Selecting a channel starts it
 * immediately in the pane on the right — no navigation, no intermediate
 * screen — which is the single behaviour that separates a TV app from a
 * website with videos on it.
 */
export default function LivePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [allChannels, setAllChannels] = useState<Channel[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>(ALL_CATEGORY);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nowNext, setNowNext] = useState<NowNext | null>(null);

  const nowPlaying = usePlayerStore((s) => s.nowPlaying);
  const playChannel = usePlayerStore((s) => s.playChannel);
  const setZapList = usePlayerStore((s) => s.setZapList);
  const setMode = usePlayerStore((s) => s.setMode);

  const favorites = useUserStore((s) => s.favorites);
  const recentChannelIds = useUserStore((s) => s.recentChannelIds);
  const pushRecentChannel = useUserStore((s) => s.pushRecentChannel);
  const recordWatch = useUserStore((s) => s.recordWatch);

  const favoriteChannelIds = useMemo(
    () => favorites.filter((f) => f.kind === 'channel').map((f) => f.id),
    [favorites],
  );

  const activeChannelId = nowPlaying?.kind === 'live' ? nowPlaying.id : null;

  // Categories once.
  useEffect(() => {
    let cancelled = false;
    api
      .categories('live')
      .then((res) => !cancelled && setCategories(res.categories))
      .catch((err: Error) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoadingCategories(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Channels for the selected category.
  useEffect(() => {
    let cancelled = false;
    setLoadingChannels(true);
    setError(null);

    const run = async () => {
      try {
        if (selectedCategory === FAVORITES_CATEGORY) {
          const page =
            favoriteChannelIds.length > 0 ? await api.channelsByIds(favoriteChannelIds) : null;
          if (!cancelled) setChannels(page?.items ?? []);
          return;
        }
        if (selectedCategory === RECENT_CATEGORY) {
          const page = recentChannelIds.length > 0 ? await api.channelsByIds(recentChannelIds) : null;
          if (!cancelled) setChannels(page?.items ?? []);
          return;
        }
        const page = await api.channels({
          categoryId: selectedCategory === ALL_CATEGORY ? null : selectedCategory,
          limit: 500,
        });
        if (cancelled) return;
        setChannels(page.items);
        if (selectedCategory === ALL_CATEGORY) setAllChannels(page.items);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Channels could not be loaded.');
      } finally {
        if (!cancelled) setLoadingChannels(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [selectedCategory, favoriteChannelIds, recentChannelIds]);

  // The visible list is what channel up/down walks through.
  useEffect(() => {
    if (channels.length > 0) setZapList(channels);
  }, [channels, setZapList]);

  // Now/next for whatever is playing, refreshed as programmes roll over.
  useEffect(() => {
    if (!activeChannelId) {
      setNowNext(null);
      return;
    }
    let cancelled = false;
    const fetchNowNext = () => {
      api
        .nowNext([activeChannelId])
        .then((res) => !cancelled && setNowNext(res.nowNext[activeChannelId] ?? null))
        .catch(() => undefined);
    };
    fetchNowNext();
    const timer = setInterval(fetchNowNext, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeChannelId]);

  const select = useCallback(
    (channel: Channel) => {
      pushRecentChannel(channel.id);
      recordWatch({ kind: 'live', id: channel.id, title: channel.name, image: channel.logo });
      void playChannel(channel, { mode: 'inline', zapList: channels });
    },
    [channels, playChannel, pushRecentChannel, recordWatch],
  );

  const activeChannel =
    channels.find((c) => c.id === activeChannelId) ??
    allChannels.find((c) => c.id === activeChannelId) ??
    null;

  return (
    <>
      <TopBar title="Live TV" />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="hidden w-[210px] shrink-0 border-r border-line/70 lg:block">
          <CategoryRail
            categories={categories}
            loading={loadingCategories}
            selected={selectedCategory}
            onSelect={setSelectedCategory}
            favoritesCount={favoriteChannelIds.length}
            recentCount={recentChannelIds.length}
            totalCount={allChannels.length}
          />
        </aside>

        <section className="flex min-h-0 w-full shrink-0 flex-col border-r border-line/70 lg:w-[420px]">
          <MobileCategoryStrip
            categories={categories}
            selected={selectedCategory}
            onSelect={setSelectedCategory}
          />
          {error ? (
            <div className="p-4">
              <ErrorNotice message={error} />
            </div>
          ) : null}
          <div className="min-h-0 flex-1">
            <ChannelList
              channels={channels}
              loading={loadingChannels}
              activeChannelId={activeChannelId}
              onSelect={select}
            />
          </div>
        </section>

        <section className="hidden min-w-0 flex-1 flex-col p-5 lg:flex">
          {activeChannel ? (
            <>
              <PlayerSlot className="aspect-video w-full" />
              <button
                type="button"
                data-focusable=""
                onClick={() => setMode('fullscreen')}
                className="tv-focus mt-4 rounded-card border border-line bg-surface-1 p-5 text-left focus:shadow-focus"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg font-semibold tabular-nums text-accent">
                    {activeChannel.number}
                  </span>
                  <h2 className="text-lg font-semibold tracking-tight">{activeChannel.name}</h2>
                  <LiveBadge />
                </div>

                {nowNext?.now ? (
                  <>
                    <p className="mt-3 text-sm font-medium text-ink">{nowNext.now.title}</p>
                    <p className="mt-0.5 text-xs tabular-nums text-ink-mute">
                      {timeRange(nowNext.now.start, nowNext.now.stop)}
                    </p>
                    <ProgressBar value={nowNext.progress} className="mt-3 max-w-md" />
                    {nowNext.now.description ? (
                      <p className="mt-3 line-clamp-3 max-w-2xl text-sm leading-relaxed text-ink-mute">
                        {nowNext.now.description}
                      </p>
                    ) : null}
                    {nowNext.next ? (
                      <p className="mt-4 text-xs text-ink-faint">
                        Next: <span className="text-ink-mute">{nowNext.next.title}</span>
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="mt-3 text-sm text-ink-faint">
                    No guide information for this channel.
                  </p>
                )}
              </button>
            </>
          ) : (
            <EmptyState
              title="Choose a channel"
              description="Pick a category on the left and select a channel — it starts playing here straight away."
            />
          )}
        </section>
      </div>
    </>
  );
}

/** Categories become a horizontal strip on narrow screens. */
function MobileCategoryStrip({
  categories,
  selected,
  onSelect,
}: {
  categories: Category[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="rail-scroll flex gap-2 overflow-x-auto border-b border-line/70 px-3 py-2 lg:hidden">
      {[{ id: ALL_CATEGORY, name: 'All' }, ...categories].map((c) => (
        <button
          key={c.id}
          type="button"
          data-focusable=""
          onClick={() => onSelect(c.id)}
          className={
            selected === c.id
              ? 'shrink-0 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-white'
              : 'shrink-0 rounded-full border border-line px-3 py-1.5 text-xs text-ink-mute'
          }
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}
