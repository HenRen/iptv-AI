'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Channel, EPGProgram, Movie, Series } from '@/types';
import { aiApi } from '@/lib/api/aiClient';
import { api } from '@/lib/api/client';
import { usePlayerStore } from '@/stores/playerStore';
import { useUserStore } from '@/stores/userStore';
import { TopBar } from '@/components/navigation/TopBar';
import { ContentCard } from '@/components/vod/ContentCard';
import {
  AiTag,
  Artwork,
  Chip,
  EmptyState,
  Focusable,
  Icon,
  LiveBadge,
  Skeleton,
} from '@/components/common';
import { clockTime, dayLabel } from '@/lib/utils/time';

/**
 * AI results (PROTOTYPE.md §9).
 *
 * Deliberately a visual answer page, not a chat transcript: a TOP PICK card
 * and grouped lists, every entry playable. The design's own rule is the one
 * that matters here — the answer may only contain things that exist in the
 * connected playlist, which the server enforces before this page ever sees a
 * result.
 */
export default function AiResultsPage() {
  return (
    <Suspense fallback={<ResultsSkeleton />}>
      <AiResultsInner />
    </Suspense>
  );
}

function AiResultsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const query = params.get('q') ?? '';

  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<{
    channels: Channel[];
    movies: Movie[];
    series: Series[];
    programs: Array<{ program: EPGProgram; channelId: string; channelName: string }>;
    explanation: string[];
    relaxed: boolean;
  } | null>(null);

  const playChannel = usePlayerStore((s) => s.playChannel);
  const pushRecentChannel = useUserStore((s) => s.pushRecentChannel);
  const recordWatch = useUserStore((s) => s.recordWatch);

  useEffect(() => {
    if (!query.trim()) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    aiApi
      .search(query)
      .then((res) => !cancelled && setResults(res))
      .catch(() => !cancelled && setResults(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [query]);

  const watchChannel = async (channelId: string) => {
    const page = await api.channelsByIds([channelId]);
    const channel = page.items[0];
    if (!channel) return;
    pushRecentChannel(channel.id);
    recordWatch({ kind: 'live', id: channel.id, title: channel.name, image: channel.logo });
    void playChannel(channel, { mode: 'fullscreen' });
  };

  if (loading) return <ResultsSkeleton />;

  const total =
    (results?.channels.length ?? 0) +
    (results?.movies.length ?? 0) +
    (results?.series.length ?? 0) +
    (results?.programs.length ?? 0);

  if (!results || total === 0) {
    return (
      <>
        <TopBar title="Ask TV" />
        <EmptyState
          icon="iptv-ai-search"
          title={query ? `Nothing in your playlist matches “${query}”` : 'Ask your TV something'}
          description="The answer can only contain channels, programmes and titles your provider actually carries. Nothing here is invented."
          action={
            <Focusable
              onClick={() => router.push('/home')}
              className="mt-2 rounded-pill border border-line-strong px-6 py-3 text-[13px] font-semibold uppercase tracking-label text-ink-soft hover:border-white hover:text-ink"
            >
              Back to home
            </Focusable>
          }
        />
      </>
    );
  }

  // The top pick is whatever is on air now, else the first live channel.
  const livePick = results.programs.find(
    (p) => p.program.start <= Date.now() && p.program.stop > Date.now(),
  );
  const topChannel = results.channels[0];

  return (
    <>
      <TopBar title="Ask TV" />

      <div className="min-h-0 flex-1 overflow-y-auto pb-14">
        <header className="px-14 pt-2">
          <AiTag>AI answer</AiTag>
          <h1 className="mt-3 max-w-3xl text-[34px] font-bold leading-tight tracking-tight text-ink text-balance">
            {query}
          </h1>
          {results.explanation.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {results.explanation.map((filter) => (
                <Chip key={filter} tone="accent">
                  {filter}
                </Chip>
              ))}
            </div>
          ) : null}
          {results.relaxed ? (
            <p className="mt-4 text-[13px] text-ink-dim">
              No exact match for every filter, so these are the closest results in your playlist.
            </p>
          ) : null}
        </header>

        {livePick || topChannel ? (
          <section className="mt-9 px-14">
            <h2 className="mb-4 sw-label text-ink">Top pick</h2>
            <Focusable
              onClick={() => void watchChannel(livePick?.channelId ?? topChannel.id)}
              bare
              lift="sm"
              className="flex w-full items-center gap-7 rounded-hero border border-line bg-gradient-to-r from-surface-2 to-surface-1 p-8 data-[focused=true]:border-accent"
            >
              <span className="grid h-24 w-32 shrink-0 place-items-center overflow-hidden rounded-card bg-surface-1">
                <Artwork
                  src={topChannel?.logo ?? null}
                  alt={livePick?.channelName ?? topChannel?.name ?? ''}
                  kind="channel"
                  className="h-full w-full text-lg"
                  imgClassName="object-contain p-3"
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="mb-2.5 flex items-center gap-3">
                  {livePick ? <LiveBadge /> : null}
                  <span className="text-[12px] font-semibold uppercase tracking-label text-ink-mute">
                    {livePick?.channelName ?? topChannel?.categoryName ?? 'Live TV'}
                  </span>
                </span>
                <span className="block text-[28px] font-bold leading-tight tracking-tight text-ink">
                  {livePick?.program.title ?? topChannel?.name}
                </span>
                {livePick ? (
                  <span className="mt-2 block text-[14px] text-ink-mute">
                    {clockTime(livePick.program.start)} – {clockTime(livePick.program.stop)}
                  </span>
                ) : null}
              </span>
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white text-ground">
                <Icon name="iptv-play" size={24} />
              </span>
            </Focusable>
          </section>
        ) : null}

        {results.programs.length > 0 ? (
          <section className="mt-11 px-14">
            <h2 className="mb-4 sw-label text-ink">Also on</h2>
            <ul className="space-y-2">
              {results.programs.map(({ program, channelId, channelName }) => {
                const live = program.start <= Date.now() && program.stop > Date.now();
                return (
                  <li key={program.id}>
                    <Focusable
                      onClick={() => void watchChannel(channelId)}
                      className="flex w-full items-center gap-5 rounded-card border border-line bg-surface-1 p-4 hover:bg-surface-2"
                    >
                      <span className="w-28 shrink-0 text-[13px] font-semibold tabular-nums text-ink-mute">
                        {dayLabel(program.start)} {clockTime(program.start)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2.5">
                          <span className="truncate text-[16px] font-medium text-ink">
                            {program.title}
                          </span>
                          {live ? <LiveBadge size="sm" /> : null}
                        </span>
                        <span className="mt-0.5 block truncate text-[12px] text-ink-faint">
                          {channelName}
                        </span>
                      </span>
                      <Icon name="iptv-play" size={18} className="shrink-0 text-ink-dim" />
                    </Focusable>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {results.channels.length > 0 ? (
          <section className="mt-11 px-14">
            <h2 className="mb-4 sw-label text-ink">Channels</h2>
            <div className="rail-scroll flex gap-4 overflow-x-auto pb-2">
              {results.channels.map((channel) => (
                <Focusable
                  key={channel.id}
                  onClick={() => void watchChannel(channel.id)}
                  bare
                  lift="sm"
                  className="w-[220px] shrink-0 rounded-card border border-line bg-surface-1 p-4 data-[focused=true]:border-accent"
                >
                  <span className="flex items-center gap-3.5">
                    <span className="grid h-12 w-16 shrink-0 place-items-center overflow-hidden rounded-tile bg-surface-2">
                      <Artwork
                        src={channel.logo}
                        alt={channel.name}
                        kind="channel"
                        className="h-full w-full text-xs"
                        imgClassName="object-contain p-1.5"
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium text-ink">
                        {channel.name}
                      </span>
                      <span className="block truncate text-[12px] text-ink-faint">
                        {channel.number} · {channel.categoryName ?? 'Live'}
                      </span>
                    </span>
                  </span>
                </Focusable>
              ))}
            </div>
          </section>
        ) : null}

        {results.movies.length > 0 || results.series.length > 0 ? (
          <section className="mt-11 px-14">
            <h2 className="mb-4 sw-label text-ink">Movies &amp; series</h2>
            <div className="rail-scroll flex gap-4 overflow-x-auto pb-2">
              {results.movies.map((movie) => (
                <ContentCard
                  key={movie.id}
                  title={movie.name}
                  poster={movie.poster}
                  year={movie.year}
                  rating={movie.rating}
                  kind="movie"
                  onSelect={() => router.push(`/movies?id=${encodeURIComponent(movie.id)}`)}
                />
              ))}
              {results.series.map((series) => (
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
            </div>
          </section>
        ) : null}

        <p className="mt-12 px-14 text-[12px] leading-relaxed text-ink-dim">
          Every result above resolves to something in your connected playlist. The assistant ranks
          and groups what exists — it does not invent channels, programmes or titles.
        </p>
      </div>
    </>
  );
}

function ResultsSkeleton() {
  return (
    <>
      <TopBar title="Ask TV" />
      <div className="min-h-0 flex-1 overflow-hidden px-14 pt-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-4 h-9 w-96" />
        <Skeleton className="mt-9 h-[140px] w-full rounded-hero" />
        <div className="mt-10 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    </>
  );
}
