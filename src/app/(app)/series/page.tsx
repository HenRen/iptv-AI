'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Heart, Play, X } from 'lucide-react';
import type { Category, Episode, Series } from '@/types';
import { api } from '@/lib/api/client';
import { usePlayerStore } from '@/stores/playerStore';
import { useUserStore } from '@/stores/userStore';
import { TopBar } from '@/components/navigation/TopBar';
import { ContentCard } from '@/components/vod/ContentCard';
import { Artwork, EmptyState, ProgressBar, Skeleton, Spinner } from '@/components/common';
import { WhyWatch } from '@/components/ai/WhyWatch';
import { formatDuration } from '@/lib/utils/time';
import { cn } from '@/lib/utils/cn';

export default function SeriesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SeriesInner />
    </Suspense>
  );
}

function SeriesInner() {
  const router = useRouter();
  const params = useSearchParams();
  const detailId = params.get('id');

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .categories('series')
      .then((res) => !cancelled && setCategories(res.categories))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .series({ categoryId, limit: 120 })
      .then((page) => !cancelled && setSeries(page.items))
      .catch(() => !cancelled && setSeries([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  return (
    <>
      <TopBar title="Series" />

      <div className="rail-scroll flex gap-1.5 overflow-x-auto border-b border-line/70 px-4 py-2.5">
        <Chip active={categoryId === null} onClick={() => setCategoryId(null)}>
          All
        </Chip>
        {categories.map((c) => (
          <Chip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(c.id)}>
            {c.name}
          </Chip>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {loading ? (
          <Grid />
        ) : series.length === 0 ? (
          <EmptyState
            title="No series in this playlist"
            description="Your provider did not return any series, or this category is empty."
          />
        ) : (
          <div className="flex flex-wrap gap-4">
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
          </div>
        )}
      </div>

      {detailId ? <SeriesDetail seriesId={detailId} onClose={() => router.push('/series')} /> : null}
    </>
  );
}

function SeriesDetail({ seriesId, onClose }: { seriesId: string; onClose: () => void }) {
  const [series, setSeries] = useState<Series | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState<number | null>(null);

  const playVod = usePlayerStore((s) => s.playVod);
  const isFavorite = useUserStore((s) => s.isFavorite);
  const toggleFavorite = useUserStore((s) => s.toggleFavorite);
  const progress = useUserStore((s) => s.progress);
  const recordWatch = useUserStore((s) => s.recordWatch);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .seriesInfo(seriesId)
      .then((s) => {
        if (cancelled) return;
        setSeries(s);
        setSeason(s.seasons?.[0]?.seasonNumber ?? null);
      })
      .catch((err: Error) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [seriesId]);

  const favorite = isFavorite('series', seriesId);
  const activeSeason = series?.seasons?.find((s) => s.seasonNumber === season) ?? null;

  const play = (episode: Episode) => {
    const saved = progress[`episode:${episode.id}`];
    recordWatch({
      kind: 'episode',
      id: episode.id,
      title: `${series?.name ?? ''} · S${episode.seasonNumber}E${episode.episodeNumber}`,
      image: episode.thumbnail ?? series?.poster ?? null,
    });
    void playVod(
      'episode',
      episode.id,
      {
        title: series?.name ?? episode.title,
        subtitle: `S${episode.seasonNumber} E${episode.episodeNumber} · ${episode.title}`,
        poster: series?.poster ?? null,
        seriesId,
      },
      saved && !saved.completed ? saved.positionSecs : 0,
    );
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={series?.name ?? 'Series'}
      onClick={onClose}
      className="fixed inset-0 z-50 overflow-y-auto bg-ground/90 backdrop-blur-sm animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative mx-auto my-8 w-full max-w-4xl overflow-hidden rounded-card border border-line bg-surface-1 shadow-lift animate-slide-up"
      >
        <button
          type="button"
          data-focusable=""
          onClick={onClose}
          aria-label="Close"
          className="tv-focus absolute right-4 top-4 z-10 rounded-full bg-black/50 p-2 text-ink-soft hover:text-ink focus:shadow-focus"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>

        {loading ? (
          <div className="grid h-64 place-items-center">
            <Spinner />
          </div>
        ) : error || !series ? (
          <div className="p-10">
            <EmptyState title="This series could not be loaded" description={error ?? undefined} />
          </div>
        ) : (
          <>
            <div className="relative h-48 overflow-hidden sm:h-56">
              <Artwork
                src={series.backdrop ?? series.poster}
                alt=""
                kind="series"
                className="h-full w-full opacity-40 blur-sm"
              />
              <div
                aria-hidden
                className="absolute inset-0"
                style={{ background: 'linear-gradient(to top, #0b0f1a 8%, rgba(11,15,26,0.4))' }}
              />
            </div>

            <div className="-mt-20 flex flex-col gap-6 px-6 pb-6 sm:flex-row">
              <div className="w-32 shrink-0 overflow-hidden rounded-card border border-line shadow-lift">
                <div className="aspect-[2/3]">
                  <Artwork src={series.poster} alt={series.name} kind="series" className="h-full w-full" />
                </div>
              </div>

              <div className="min-w-0 flex-1 pt-4 sm:pt-20">
                <h2 className="text-2xl font-semibold tracking-tight text-balance">{series.name}</h2>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 text-xs text-ink-mute">
                  {series.year ? <span className="tabular-nums">{series.year}</span> : null}
                  {series.genre ? <span>{series.genre}</span> : null}
                  {series.rating ? <span className="tabular-nums">★ {series.rating.toFixed(1)}</span> : null}
                  {series.seasons?.length ? (
                    <span>
                      {series.seasons.length} season{series.seasons.length === 1 ? '' : 's'}
                    </span>
                  ) : null}
                </p>

                <button
                  type="button"
                  data-focusable=""
                  onClick={() => toggleFavorite('series', seriesId)}
                  aria-pressed={favorite}
                  className={cn(
                    'tv-focus mt-4 inline-flex items-center gap-2 rounded-tile border px-4 py-2 text-sm focus:shadow-focus',
                    favorite ? 'border-live/50 text-live' : 'border-line text-ink-soft hover:text-ink',
                  )}
                >
                  <Heart className={cn('h-4 w-4', favorite && 'fill-current')} aria-hidden />
                  {favorite ? 'In favorites' : 'Add to favorites'}
                </button>

                {series.plot ? (
                  <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-soft">{series.plot}</p>
                ) : null}

                <WhyWatch contentId={series.id} kind="series" />
              </div>
            </div>

            {series.seasons && series.seasons.length > 0 ? (
              <div className="border-t border-line/70 px-6 py-5">
                <div className="rail-scroll mb-4 flex gap-1.5 overflow-x-auto">
                  {series.seasons.map((s) => (
                    <Chip
                      key={s.seasonNumber}
                      active={season === s.seasonNumber}
                      onClick={() => setSeason(s.seasonNumber)}
                    >
                      {s.name}
                    </Chip>
                  ))}
                </div>

                <ul className="space-y-1.5">
                  {activeSeason?.episodes.map((episode) => {
                    const saved = progress[`episode:${episode.id}`];
                    return (
                      <li key={episode.id}>
                        <button
                          type="button"
                          data-focusable=""
                          onClick={() => play(episode)}
                          className="tv-focus flex w-full items-center gap-4 rounded-tile border border-line/60 bg-surface-2/50 p-3 text-left hover:bg-surface-3 focus:shadow-focus"
                        >
                          <span className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums text-ink-faint">
                            {episode.episodeNumber}
                          </span>
                          <span className="hidden h-12 w-20 shrink-0 overflow-hidden rounded bg-surface-2 sm:block">
                            <Artwork
                              src={episode.thumbnail}
                              alt={episode.title}
                              kind="series"
                              className="h-full w-full"
                            />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink">
                              {episode.title}
                            </span>
                            {episode.plot ? (
                              <span className="mt-0.5 line-clamp-1 block text-xs text-ink-mute">
                                {episode.plot}
                              </span>
                            ) : null}
                            {saved && !saved.completed ? (
                              <ProgressBar
                                value={saved.positionSecs / Math.max(1, saved.durationSecs)}
                                className="mt-2 max-w-[220px]"
                              />
                            ) : null}
                          </span>
                          {episode.durationSecs ? (
                            <span className="shrink-0 text-xs tabular-nums text-ink-faint">
                              {formatDuration(episode.durationSecs)}
                            </span>
                          ) : null}
                          <Play className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <div className="border-t border-line/70 px-6 py-8">
                <p className="text-center text-sm text-ink-faint">
                  Your provider returned no episode list for this series.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-focusable=""
      onClick={onClick}
      className={cn(
        'tv-focus shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs focus:shadow-focus',
        active ? 'bg-accent text-white' : 'border border-line text-ink-mute hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

function Grid() {
  return (
    <div className="flex flex-wrap gap-4">
      {Array.from({ length: 18 }).map((_, i) => (
        <div key={i} className="w-[150px] sm:w-[168px]">
          <Skeleton className="aspect-[2/3] w-full rounded-card" />
          <Skeleton className="mt-2 h-3 w-3/4" />
        </div>
      ))}
    </div>
  );
}

function PageSkeleton() {
  return (
    <>
      <TopBar title="Series" />
      <div className="p-6">
        <Grid />
      </div>
    </>
  );
}
