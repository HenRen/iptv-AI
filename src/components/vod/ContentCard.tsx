'use client';

import { Star } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Artwork, Focusable, ProgressBar } from '@/components/common';

/**
 * Poster card for movies and series.
 *
 * Fixed aspect ratio regardless of what the provider returns, because a rail
 * where every poster is a slightly different height is the fastest way to
 * make a catalogue look broken.
 */
export function ContentCard({
  title,
  poster,
  year,
  rating,
  kind,
  progress,
  onSelect,
  className,
}: {
  title: string;
  poster: string | null;
  year?: number | null;
  rating?: number | null;
  kind: 'movie' | 'series';
  progress?: number;
  onSelect: () => void;
  className?: string;
}) {
  return (
    <Focusable
      onClick={onSelect}
      aria-label={title}
      className={cn(
        'group w-[150px] shrink-0 sm:w-[168px]',
        'data-[focused=true]:z-10 data-[focused=true]:scale-[1.04]',
        className,
      )}
      bare
    >
      <span className="block overflow-hidden rounded-card border border-line bg-surface-1 shadow-card transition-colors group-data-[focused=true]:border-accent">
        <span className="relative block aspect-[2/3] w-full">
          <Artwork src={poster} alt={title} kind={kind} className="h-full w-full" />
          {progress != null && progress > 0 ? (
            <span className="absolute inset-x-0 bottom-0 block bg-gradient-to-t from-black/80 to-transparent px-2 pb-2 pt-6">
              <ProgressBar value={progress} />
            </span>
          ) : null}
        </span>
      </span>

      <span className="mt-2 block px-0.5">
        <span className="line-clamp-2 block text-[13px] font-medium leading-snug text-ink-soft group-data-[focused=true]:text-ink">
          {title}
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-faint">
          {year ? <span className="tabular-nums">{year}</span> : null}
          {rating ? (
            <span className="inline-flex items-center gap-0.5 tabular-nums">
              <Star className="h-2.5 w-2.5 fill-current text-warn" aria-hidden />
              {rating.toFixed(1)}
            </span>
          ) : null}
        </span>
      </span>
    </Focusable>
  );
}

/** Channel tile used on Home rails, where a poster shape would be wrong. */
export function ChannelCard({
  name,
  logo,
  number,
  subtitle,
  progress,
  onSelect,
}: {
  name: string;
  logo: string | null;
  number?: number;
  subtitle?: string | null;
  progress?: number;
  onSelect: () => void;
}) {
  return (
    <Focusable
      onClick={onSelect}
      aria-label={`Watch ${name}`}
      className="group w-[210px] shrink-0 data-[focused=true]:scale-[1.03]"
      bare
    >
      <span className="tv-card block p-3 transition-colors group-data-[focused=true]:border-accent group-data-[focused=true]:bg-surface-2">
        <span className="flex items-center gap-3">
          <span className="grid h-11 w-14 shrink-0 place-items-center overflow-hidden rounded bg-surface-2">
            <Artwork
              src={logo}
              alt={name}
              kind="channel"
              className="h-full w-full text-xs"
              imgClassName="object-contain p-1"
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              {number ? (
                <span className="text-[11px] font-semibold tabular-nums text-ink-faint">
                  {number}
                </span>
              ) : null}
              <span className="truncate text-[13px] font-medium text-ink">{name}</span>
            </span>
            <span className="mt-0.5 block truncate text-[11px] text-ink-mute">
              {subtitle ?? 'No guide information'}
            </span>
          </span>
        </span>
        {progress != null ? <ProgressBar value={progress} className="mt-3" /> : null}
      </span>
    </Focusable>
  );
}
