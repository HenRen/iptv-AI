'use client';

import { Heart } from 'lucide-react';
import type { Channel, NowNext } from '@/types';
import { cn } from '@/lib/utils/cn';
import { clockTime } from '@/lib/utils/time';
import { Artwork, Chip, Focusable, ProgressBar } from '@/components/common';

export const CHANNEL_ROW_HEIGHT = 72;

/**
 * One channel in the list.
 *
 * Carries everything needed to decide whether to watch it — number, identity,
 * what is on, how far through it is, and what is next — at a density that
 * still reads from across a room.
 */
export function ChannelRow({
  channel,
  nowNext,
  active,
  favorite,
  onSelect,
  onToggleFavorite,
}: {
  channel: Channel;
  nowNext?: NowNext;
  active: boolean;
  favorite: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
}) {
  const now = nowNext?.now ?? null;

  return (
    <div
      className={cn(
        'group relative flex items-center gap-3 border-b border-line/50 pr-2',
        active && 'bg-accent/10',
      )}
      style={{ height: CHANNEL_ROW_HEIGHT }}
    >
      <Focusable
        onClick={onSelect}
        aria-label={`Watch ${channel.name}`}
        className={cn(
          'flex h-full flex-1 items-center gap-3 px-3',
          'data-[focused=true]:bg-surface-3',
        )}
        bare
      >
        <span
          className={cn(
            'w-8 shrink-0 text-right text-sm font-semibold tabular-nums',
            active ? 'text-accent' : 'text-ink-faint',
          )}
        >
          {channel.number}
        </span>

        <span className="grid h-10 w-14 shrink-0 place-items-center overflow-hidden rounded bg-surface-2">
          <Artwork
            src={channel.logo}
            alt={channel.name}
            kind="channel"
            className="h-full w-full text-xs"
            imgClassName="object-contain p-1"
          />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span
              className={cn(
                'truncate text-sm font-medium',
                active ? 'text-ink' : 'text-ink-soft',
              )}
            >
              {channel.name}
            </span>
            {channel.quality !== 'unknown' ? (
              <Chip className="shrink-0">{channel.quality}</Chip>
            ) : null}
          </span>

          {now ? (
            <>
              <span className="mt-1 flex items-center gap-2">
                <span className="truncate text-xs text-ink-mute">{now.title}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-ink-faint">
                  {clockTime(now.start)}–{clockTime(now.stop)}
                </span>
              </span>
              <ProgressBar value={nowNext?.progress ?? 0} className="mt-1.5 max-w-[260px]" />
            </>
          ) : (
            <span className="mt-1 block truncate text-xs text-ink-faint">
              {channel.categoryName ?? 'No guide information'}
            </span>
          )}
        </span>
      </Focusable>

      <Focusable
        onClick={onToggleFavorite}
        aria-label={favorite ? `Remove ${channel.name} from favorites` : `Add ${channel.name} to favorites`}
        aria-pressed={favorite}
        className={cn(
          'grid h-9 w-9 shrink-0 place-items-center rounded-full transition-opacity',
          favorite ? 'text-live opacity-100' : 'text-ink-faint opacity-0 group-hover:opacity-100',
          'focus:opacity-100',
        )}
      >
        <Heart className={cn('h-4 w-4', favorite && 'fill-current')} aria-hidden />
      </Focusable>
    </div>
  );
}
