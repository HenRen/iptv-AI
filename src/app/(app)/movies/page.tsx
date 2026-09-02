'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Heart, Play, X } from 'lucide-react';
import type { Category, Movie } from '@/types';
import { api } from '@/lib/api/client';
import { usePlayerStore } from '@/stores/playerStore';
import { useUserStore } from '@/stores/userStore';
import { TopBar } from '@/components/navigation/TopBar';
import { ContentCard } from '@/components/vod/ContentCard';
import { Artwork, EmptyState, ProgressBar, Skeleton } from '@/components/common';
import { WhyWatch } from '@/components/ai/WhyWatch';
import { formatDuration } from '@/lib/utils/time';
import { cn } from '@/lib/utils/cn';

export default function MoviesPage() {
  return (
    <Suspense fallback={<GridSkeleton />}>
      <MoviesInner />
    </Suspense>
  );
}

function MoviesInner() {
  const router = useRouter();
  const params = useSearchParams();
  const detailId = params.get('id');

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);

  const progress = useUserStore((s) => s.progress);

  useEffect(() => {
    let cancelled = false;
    api
      .categories('movie')
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
      .movies({ categoryId, limit: 120 })
      .then((page) => !cancelled && setMovies(page.items))
      .catch(() => !cancelled && setMovies([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  const detail = useMemo(() => movies.find((m) => m.id === detailId) ?? null, [movies, detailId]);

  return (
    <>
      <TopBar title="Movies" />

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
          <GridInner />
        ) : movies.length === 0 ? (
          <EmptyState
            title="No movies in this playlist"
            description="Your provider did not return any video-on-demand content, or this category is empty."
          />
        ) : (
          <div className="flex flex-wrap gap-4">
            {movies.map((m) => {
              const p = progress[`movie:${m.id}`];
              return (
                <ContentCard
                  key={m.id}
                  title={m.name}
                  poster={m.poster}
                  year={m.year}
                  rating={m.rating}
                  kind="movie"
                  progress={p && !p.completed ? p.positionSecs / Math.max(1, p.durationSecs) : undefined}
                  onSelect={() => router.push(`/movies?id=${encodeURIComponent(m.id)}`)}
                />
              );
            })}
          </div>
        )}
      </div>

      {detail ? <MovieDetail movie={detail} onClose={() => router.push('/movies')} /> : null}
    </>
  );
}

function MovieDetail({ movie, onClose }: { movie: Movie; onClose: () => void }) {
  const playVod = usePlayerStore((s) => s.playVod);
  const isFavorite = useUserStore((s) => s.isFavorite);
  const toggleFavorite = useUserStore((s) => s.toggleFavorite);
  const getProgress = useUserStore((s) => s.getProgress);
  const recordWatch = useUserStore((s) => s.recordWatch);

  const favorite = isFavorite('movie', movie.id);
  const saved = getProgress('movie', movie.id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const play = (fromStart: boolean) => {
    recordWatch({ kind: 'movie', id: movie.id, title: movie.name, image: movie.poster });
    void playVod(
      'movie',
      movie.id,
      { title: movie.name, subtitle: movie.genre, poster: movie.poster },
      fromStart ? 0 : (saved?.positionSecs ?? 0),
    );
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={movie.name}
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

        <div className="relative h-52 overflow-hidden sm:h-64">
          <Artwork
            src={movie.backdrop ?? movie.poster}
            alt=""
            kind="movie"
            className="h-full w-full opacity-40 blur-sm"
          />
          <div
            aria-hidden
            className="absolute inset-0"
            style={{ background: 'linear-gradient(to top, #0b0f1a 8%, rgba(11,15,26,0.4))' }}
          />
        </div>

        <div className="-mt-24 flex flex-col gap-6 p-6 sm:flex-row">
          <div className="w-36 shrink-0 overflow-hidden rounded-card border border-line shadow-lift">
            <div className="aspect-[2/3]">
              <Artwork src={movie.poster} alt={movie.name} kind="movie" className="h-full w-full" />
            </div>
          </div>

          <div className="min-w-0 flex-1 pt-6 sm:pt-24">
            <h2 className="text-2xl font-semibold tracking-tight text-balance">{movie.name}</h2>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-mute">
              {movie.year ? <span className="tabular-nums">{movie.year}</span> : null}
              {movie.durationSecs ? <span>{formatDuration(movie.durationSecs)}</span> : null}
              {movie.genre ? <span>{movie.genre}</span> : null}
              {movie.rating ? <span className="tabular-nums">★ {movie.rating.toFixed(1)}</span> : null}
            </p>

            {saved && !saved.completed ? (
              <div className="mt-4 max-w-sm">
                <ProgressBar value={saved.positionSecs / Math.max(1, saved.durationSecs)} />
                <p className="mt-1.5 text-[11px] text-ink-faint">
                  {formatDuration(saved.durationSecs - saved.positionSecs)} left
                </p>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                data-focusable=""
                onClick={() => play(false)}
                className="tv-focus inline-flex items-center gap-2 rounded-tile bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-bright focus:shadow-focus"
              >
                <Play className="h-4 w-4 fill-current" aria-hidden />
                {saved && !saved.completed ? 'Resume' : 'Play'}
              </button>
              {saved && !saved.completed ? (
                <button
                  type="button"
                  data-focusable=""
                  onClick={() => play(true)}
                  className="tv-focus rounded-tile border border-line px-4 py-2.5 text-sm text-ink-soft hover:text-ink focus:shadow-focus"
                >
                  Start over
                </button>
              ) : null}
              <button
                type="button"
                data-focusable=""
                onClick={() => toggleFavorite('movie', movie.id)}
                aria-pressed={favorite}
                className={cn(
                  'tv-focus inline-flex items-center gap-2 rounded-tile border px-4 py-2.5 text-sm focus:shadow-focus',
                  favorite ? 'border-live/50 text-live' : 'border-line text-ink-soft hover:text-ink',
                )}
              >
                <Heart className={cn('h-4 w-4', favorite && 'fill-current')} aria-hidden />
                {favorite ? 'In favorites' : 'Add to favorites'}
              </button>
            </div>

            {movie.plot ? (
              <p className="mt-5 max-w-2xl text-sm leading-relaxed text-ink-soft">{movie.plot}</p>
            ) : (
              <p className="mt-5 text-sm text-ink-faint">
                Your provider supplied no description for this title.
              </p>
            )}

            <WhyWatch contentId={movie.id} kind="movie" />

            {movie.cast || movie.director ? (
              <dl className="mt-5 space-y-1 text-xs">
                {movie.director ? (
                  <div className="flex gap-2">
                    <dt className="w-16 shrink-0 text-ink-faint">Director</dt>
                    <dd className="text-ink-mute">{movie.director}</dd>
                  </div>
                ) : null}
                {movie.cast ? (
                  <div className="flex gap-2">
                    <dt className="w-16 shrink-0 text-ink-faint">Cast</dt>
                    <dd className="text-ink-mute">{movie.cast}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
          </div>
        </div>
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

function GridInner() {
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

function GridSkeleton() {
  return (
    <>
      <TopBar title="Movies" />
      <div className="p-6">
        <GridInner />
      </div>
    </>
  );
}
