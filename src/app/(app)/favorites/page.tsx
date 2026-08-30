'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Heart } from 'lucide-react';
import type { Channel, Movie, Series } from '@/types';
import { api } from '@/lib/api/client';
import { usePlayerStore } from '@/stores/playerStore';
import { useUserStore } from '@/stores/userStore';
import { TopBar } from '@/components/navigation/TopBar';
import { ChannelCard, ContentCard } from '@/components/vod/ContentCard';
import { EmptyState, Rail, Skeleton } from '@/components/common';

export default function FavoritesPage() {
  const router = useRouter();

  const favorites = useUserStore((s) => s.favorites);
  const pushRecentChannel = useUserStore((s) => s.pushRecentChannel);
  const recordWatch = useUserStore((s) => s.recordWatch);
  const playChannel = usePlayerStore((s) => s.playChannel);

  const [channels, setChannels] = useState<Channel[]>([]);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);

  const ids = useMemo(
    () => ({
      channels: favorites.filter((f) => f.kind === 'channel').map((f) => f.id),
      movies: new Set(favorites.filter((f) => f.kind === 'movie').map((f) => f.id)),
      series: new Set(favorites.filter((f) => f.kind === 'series').map((f) => f.id)),
    }),
    [favorites],
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const [channelPage, moviePage, seriesPage] = await Promise.all([
          ids.channels.length ? api.channelsByIds(ids.channels) : null,
          ids.movies.size ? api.movies({ limit: 300 }) : null,
          ids.series.size ? api.series({ limit: 300 }) : null,
        ]);
        if (cancelled) return;
        setChannels(channelPage?.items ?? []);
        setMovies((moviePage?.items ?? []).filter((m) => ids.movies.has(m.id)));
        setSeries((seriesPage?.items ?? []).filter((s) => ids.series.has(s.id)));
      } catch {
        if (!cancelled) {
          setChannels([]);
          setMovies([]);
          setSeries([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [ids]);

  const watch = (channel: Channel) => {
    pushRecentChannel(channel.id);
    recordWatch({ kind: 'live', id: channel.id, title: channel.name, image: channel.logo });
    void playChannel(channel, { mode: 'fullscreen', zapList: channels });
  };

  const empty = favorites.length === 0;

  return (
    <>
      <TopBar title="Favorites" />
      <div className="min-h-0 flex-1 overflow-y-auto py-6">
        {loading && !empty ? (
          <div className="px-8">
            <Skeleton className="mb-3 h-4 w-32" />
            <div className="flex gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-[88px] w-[210px]" />
              ))}
            </div>
          </div>
        ) : empty ? (
          <EmptyState
            icon={<Heart className="h-8 w-8" aria-hidden />}
            title="No favorites yet"
            description="Press the heart on any channel, movie or series and it will appear here, on Home, and as a category in Live TV."
          />
        ) : (
          <div className="space-y-8">
            {channels.length > 0 ? (
              <Rail title="Channels">
                {channels.map((c) => (
                  <ChannelCard
                    key={c.id}
                    name={c.name}
                    logo={c.logo}
                    number={c.number}
                    subtitle={c.categoryName}
                    onSelect={() => watch(c)}
                  />
                ))}
              </Rail>
            ) : null}

            {movies.length > 0 ? (
              <Rail title="Movies">
                {movies.map((m) => (
                  <ContentCard
                    key={m.id}
                    title={m.name}
                    poster={m.poster}
                    year={m.year}
                    rating={m.rating}
                    kind="movie"
                    onSelect={() => router.push(`/movies?id=${encodeURIComponent(m.id)}`)}
                  />
                ))}
              </Rail>
            ) : null}

            {series.length > 0 ? (
              <Rail title="Series">
                {series.map((s) => (
                  <ContentCard
                    key={s.id}
                    title={s.name}
                    poster={s.poster}
                    year={s.year}
                    rating={s.rating}
                    kind="series"
                    onSelect={() => router.push(`/series?id=${encodeURIComponent(s.id)}`)}
                  />
                ))}
              </Rail>
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}
