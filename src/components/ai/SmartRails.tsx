'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Channel, Movie, NowNext, Series } from '@/types';
import { aiApi, type ResolvedRail } from '@/lib/api/aiClient';
import { api } from '@/lib/api/client';
import { useAiStore } from '@/stores/aiStore';
import { usePlayerStore } from '@/stores/playerStore';
import { useUserStore } from '@/stores/userStore';
import { ChannelCard, ContentCard } from '@/components/vod/ContentCard';
import { Rail, Skeleton } from '@/components/common';

/**
 * AI 3 + AI 4 — Smart Groups and personalized rails on Home.
 *
 * The server returns rails whose ids have already been resolved against the
 * catalogue, so a rail cannot reference something the user does not have.
 * Any rail that came back empty was dropped before it got here.
 */
export function SmartRails({ nowNext }: { nowNext: Record<string, NowNext> }) {
  const router = useRouter();
  const [rails, setRails] = useState<ResolvedRail[]>([]);
  const [loading, setLoading] = useState(true);

  const prefs = useAiStore((s) => s.prefs);
  const favorites = useUserStore((s) => s.favorites);
  const recentChannelIds = useUserStore((s) => s.recentChannelIds);
  const history = useUserStore((s) => s.history);
  const progress = useUserStore((s) => s.progress);

  const playChannel = usePlayerStore((s) => s.playChannel);
  const pushRecentChannel = useUserStore((s) => s.pushRecentChannel);
  const recordWatch = useUserStore((s) => s.recordWatch);

  const signals = useMemo(() => {
    // Watch history only contributes when the user has allowed it.
    const usable = prefs.useWatchHistory ? history : [];
    const channelPlays: Record<string, number> = {};
    for (const entry of usable) {
      if (entry.kind !== 'live') continue;
      channelPlays[entry.id] = (channelPlays[entry.id] ?? 0) + 1;
    }
    return {
      channelPlays,
      genrePlays: {},
      favoriteIds: favorites.filter((f) => f.kind === 'channel').map((f) => f.id),
      recentChannelIds: prefs.useWatchHistory ? recentChannelIds : [],
      progress: Object.fromEntries(
        Object.entries(progress).map(([k, v]) => [k, v.positionSecs / Math.max(1, v.durationSecs)]),
      ),
    };
  }, [favorites, history, prefs.useWatchHistory, progress, recentChannelIds]);

  useEffect(() => {
    if (!prefs.enabled || !prefs.personalizedRecommendations) {
      setLoading(false);
      setRails([]);
      return;
    }
    let cancelled = false;
    aiApi
      .rails(signals)
      .then((res) => !cancelled && setRails(res.rails))
      .catch(() => !cancelled && setRails([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [prefs.enabled, prefs.personalizedRecommendations, signals]);

  const watch = (channel: Channel) => {
    pushRecentChannel(channel.id);
    recordWatch({ kind: 'live', id: channel.id, title: channel.name, image: channel.logo });
    void playChannel(channel, { mode: 'fullscreen' });
  };

  if (!prefs.enabled || !prefs.personalizedRecommendations) return null;

  if (loading) {
    return (
      <div className="px-8">
        <Skeleton className="mb-3 h-4 w-36" />
        <div className="flex gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[88px] w-[210px]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {rails.map((rail) => (
        <Rail key={rail.key} title={rail.title} subtitle={rail.reason}>
          {rail.kind === 'channel'
            ? (rail.items as Channel[]).map((channel) => (
                <ChannelCard
                  key={channel.id}
                  name={channel.name}
                  logo={channel.logo}
                  number={channel.number}
                  subtitle={nowNext[channel.id]?.now?.title ?? channel.categoryName}
                  progress={nowNext[channel.id]?.progress}
                  onSelect={() => watch(channel)}
                />
              ))
            : rail.kind === 'movie'
              ? (rail.items as Movie[]).map((movie) => (
                  <ContentCard
                    key={movie.id}
                    title={movie.name}
                    poster={movie.poster}
                    year={movie.year}
                    rating={movie.rating}
                    kind="movie"
                    onSelect={() => router.push(`/movies?id=${encodeURIComponent(movie.id)}`)}
                  />
                ))
              : (rail.items as Series[]).map((series) => (
                  <ContentCard
                    key={series.id}
                    title={series.name}
                    poster={series.poster}
                    year={series.year}
                    rating={series.rating}
                    kind="series"
                    onSelect={() => router.push(`/series?id=${encodeURIComponent(series.id)}`)}
                  />
                ))}
        </Rail>
      ))}
    </>
  );
}
