'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { timeRange } from '@streamwise/core';
import type { Channel, Movie, NowNext, Series } from '@streamwise/core';
import { api } from '@/lib/api/client';
import { usePlayerStore } from '@/stores/playerStore';
import { useUserStore } from '@/stores/userStore';
import { usePlaylistStore } from '@/stores/playlistStore';
import { TopBar } from '@/components/navigation/TopBar';
import { ChannelCard, ContentCard } from '@/components/vod/ContentCard';
import { Icon, Artwork, EmptyState, LiveBadge, Rail, Skeleton } from '@/components/common';
import { SmartRails } from '@/components/ai/SmartRails';
import { SportsTonight } from '@/components/ai/SportsTonight';
import { AskTVButton } from '@/components/ai/AskTV';

/**
 * Home.
 *
 * Every rail is conditional on data actually existing — an IPTV provider that
 * serves live channels only should not be shown four empty movie shelves.
 * The hero is whatever the user is most likely to resume or return to.
 */
export default function HomePage() {
  const router = useRouter();

  const [channels, setChannels] = useState<Channel[]>([]);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [favoriteChannels, setFavoriteChannels] = useState<Channel[]>([]);
  const [recentChannels, setRecentChannels] = useState<Channel[]>([]);
  const [nowNext, setNowNext] = useState<Record<string, NowNext>>({});
  const [loading, setLoading] = useState(true);

  const playChannel = usePlayerStore((s) => s.playChannel);
  const playVod = usePlayerStore((s) => s.playVod);
  const active = usePlaylistStore((s) => s.active());

  const favorites = useUserStore((s) => s.favorites);
  const recentChannelIds = useUserStore((s) => s.recentChannelIds);
  const progress = useUserStore((s) => s.progress);
  const pushRecentChannel = useUserStore((s) => s.pushRecentChannel);
  const recordWatch = useUserStore((s) => s.recordWatch);

  const favoriteChannelIds = useMemo(
    () => favorites.filter((f) => f.kind === 'channel').map((f) => f.id),
    [favorites],
  );

  const continueWatching = useMemo(
    () =>
      Object.values(progress)
        .filter((p) => !p.completed && p.positionSecs > 30)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 12),
    [progress],
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const [channelPage, moviePage, seriesPage] = await Promise.all([
          api.channels({ limit: 40 }),
          api.movies({ limit: 24 }).catch(() => ({ items: [] as Movie[] })),
          api.series({ limit: 24 }).catch(() => ({ items: [] as Series[] })),
        ]);
        if (cancelled) return;
        setChannels(channelPage.items);
        setMovies(moviePage.items);
        setSeries(seriesPage.items);

        const [favPage, recentPage] = await Promise.all([
          favoriteChannelIds.length ? api.channelsByIds(favoriteChannelIds.slice(0, 20)) : null,
          recentChannelIds.length ? api.channelsByIds(recentChannelIds.slice(0, 20)) : null,
        ]);
        if (cancelled) return;
        setFavoriteChannels(favPage?.items ?? []);
        setRecentChannels(recentPage?.items ?? []);

        const ids = [
          ...new Set([
            ...channelPage.items.slice(0, 20).map((c) => c.id),
            ...(favPage?.items ?? []).map((c) => c.id),
            ...(recentPage?.items ?? []).map((c) => c.id),
          ]),
        ];
        if (ids.length > 0) {
          const res = await api.nowNext(ids);
          if (!cancelled) setNowNext(res.nowNext);
        }
      } catch {
        // Home degrades to whatever loaded; the status pill in the top bar
        // is where a connection problem is reported.
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [favoriteChannelIds, recentChannelIds]);

  const watch = (channel: Channel) => {
    pushRecentChannel(channel.id);
    recordWatch({ kind: 'live', id: channel.id, title: channel.name, image: channel.logo });
    void playChannel(channel, { mode: 'fullscreen', zapList: channels });
  };

  const hero = favoriteChannels[0] ?? recentChannels[0] ?? channels[0] ?? null;
  const heroNowNext = hero ? nowNext[hero.id] : undefined;

  const moviesById = useMemo(() => new Map(movies.map((m) => [m.id, m])), [movies]);

  if (loading) return <HomeSkeleton />;

  if (channels.length === 0 && movies.length === 0 && series.length === 0) {
    return (
      <>
        <TopBar title="Home" />
        <EmptyState
          title="Nothing to show yet"
          description={
            active?.status === 'connected'
              ? 'The playlist connected but returned no content. Try refreshing it from Settings → Playlists.'
              : 'Connect a playlist to fill this screen with live channels, movies and series.'
          }
        />
      </>
    );
  }

  return (
    <>
      <TopBar title="Home" />

      <div className="min-h-0 flex-1 overflow-y-auto pb-10">
        {hero ? (
          <section className="relative mb-8 h-[300px] overflow-hidden sm:h-[360px]">
            <div className="absolute inset-0">
              <Artwork src={hero.logo} alt="" kind="channel" className="h-full w-full blur-3xl opacity-25" />
            </div>
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(to top, #05070d 4%, rgba(5,7,13,0.72) 46%, rgba(5,7,13,0.25) 100%)',
              }}
            />
            <div className="relative flex h-full flex-col justify-end px-8 pb-8">
              <div className="mb-3 flex items-center gap-3">
                <LiveBadge />
                <span className="text-xs uppercase tracking-wider text-ink-mute">
                  {hero.categoryName ?? 'Live TV'}
                </span>
              </div>
              <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                {heroNowNext?.now?.title ?? hero.name}
              </h2>
              <p className="mt-2 text-sm text-ink-soft">
                {hero.number} · {hero.name}
                {heroNowNext?.now
                  ? ` · ${timeRange(heroNowNext.now.start, heroNowNext.now.stop)}`
                  : ''}
              </p>
              {heroNowNext?.now?.description ? (
                <p className="mt-3 line-clamp-2 max-w-xl text-sm leading-relaxed text-ink-mute">
                  {heroNowNext.now.description}
                </p>
              ) : null}
              <div className="mt-5 flex items-center gap-3">
                <button
                  type="button"
                  data-focusable=""
                  onClick={() => watch(hero)}
                  className="tv-focus inline-flex items-center gap-2 rounded-tile bg-white px-6 py-2.5 text-sm font-semibold text-ground hover:bg-ink-soft focus:shadow-focus"
                >
                  <Icon name="iptv-play" size={16} className="fill-current" />
                  Watch now
                </button>
                <AskTVButton className="border-white/25 bg-black/30 px-4 py-2.5 text-ink-soft" />
              </div>
            </div>
          </section>
        ) : null}

        <div className="space-y-8">
          <SmartRails nowNext={nowNext} />

          <SportsTonight />

          {continueWatching.length > 0 ? (
            <Rail title="Continue Watching">
              {continueWatching.map((p) => {
                const movie = moviesById.get(p.contentId);
                return (
                  <ContentCard
                    key={p.key}
                    title={movie?.name ?? 'Resume'}
                    poster={movie?.poster ?? null}
                    year={movie?.year}
                    kind="movie"
                    progress={p.positionSecs / Math.max(1, p.durationSecs)}
                    onSelect={() =>
                      void playVod(
                        p.episodeId ? 'episode' : 'movie',
                        p.contentId,
                        { title: movie?.name ?? 'Resume', poster: movie?.poster ?? null },
                        p.positionSecs,
                      )
                    }
                  />
                );
              })}
            </Rail>
          ) : null}

          {favoriteChannels.length > 0 ? (
            <Rail title="Favorite Channels">
              {favoriteChannels.map((c) => (
                <ChannelCard
                  key={c.id}
                  name={c.name}
                  logo={c.logo}
                  number={c.number}
                  subtitle={nowNext[c.id]?.now?.title}
                  progress={nowNext[c.id]?.progress}
                  onSelect={() => watch(c)}
                />
              ))}
            </Rail>
          ) : null}

          {recentChannels.length > 0 ? (
            <Rail title="Recently Watched">
              {recentChannels.map((c) => (
                <ChannelCard
                  key={c.id}
                  name={c.name}
                  logo={c.logo}
                  number={c.number}
                  subtitle={nowNext[c.id]?.now?.title}
                  progress={nowNext[c.id]?.progress}
                  onSelect={() => watch(c)}
                />
              ))}
            </Rail>
          ) : null}

          {channels.length > 0 ? (
            <Rail title="Live Now" subtitle="On air across your playlist">
              {channels.slice(0, 20).map((c) => (
                <ChannelCard
                  key={c.id}
                  name={c.name}
                  logo={c.logo}
                  number={c.number}
                  subtitle={nowNext[c.id]?.now?.title}
                  progress={nowNext[c.id]?.progress}
                  onSelect={() => watch(c)}
                />
              ))}
            </Rail>
          ) : null}

          <GenreRail title="Sports" channels={channels} genre="sports" nowNext={nowNext} onWatch={watch} />
          <GenreRail title="News" channels={channels} genre="news" nowNext={nowNext} onWatch={watch} />
          <GenreRail title="Kids" channels={channels} genre="kids" nowNext={nowNext} onWatch={watch} />

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
            <Rail title="TV Series">
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
      </div>
    </>
  );
}

function GenreRail({
  title,
  channels,
  genre,
  nowNext,
  onWatch,
}: {
  title: string;
  channels: Channel[];
  genre: Channel['genre'];
  nowNext: Record<string, NowNext>;
  onWatch: (c: Channel) => void;
}) {
  const items = channels.filter((c) => c.genre === genre).slice(0, 16);
  if (items.length === 0) return null;
  return (
    <Rail title={title}>
      {items.map((c) => (
        <ChannelCard
          key={c.id}
          name={c.name}
          logo={c.logo}
          number={c.number}
          subtitle={nowNext[c.id]?.now?.title}
          progress={nowNext[c.id]?.progress}
          onSelect={() => onWatch(c)}
        />
      ))}
    </Rail>
  );
}

function HomeSkeleton() {
  return (
    <>
      <TopBar title="Home" />
      <div className="min-h-0 flex-1 overflow-hidden">
        <Skeleton className="mb-8 h-[300px] w-full rounded-none sm:h-[360px]" />
        {[0, 1].map((row) => (
          <div key={row} className="mb-8 px-8">
            <Skeleton className="mb-3 h-4 w-40" />
            <div className="flex gap-3">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-[88px] w-[210px]" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
