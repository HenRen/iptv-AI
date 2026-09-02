'use client';

import type { Channel, NowNext } from '@/types';
import { cn } from '@/lib/utils/cn';
import { clockTime } from '@/lib/utils/time';
import { Icon, Artwork, Chip, Focusable, ProgressBar } from '@/components/common';
import { useUiStore } from '@/stores/uiStore';

export const CHANNEL_ROW_HEIGHT = 76;

/**
 * One channel in the list.
 *
 * Carries everything needed to decide whether to watch it — number, identity,
 * what is on, how far through it is — at a density that still reads from
 * across a room.
 *
 * The `data-qa-*` attributes are what let the shell's global long-press find
 * this row's subject without the row knowing anything about the overlay.
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
  const openQuickAction = useUiStore((s) => s.openQuickAction);
  const now = nowNext?.now ?? null;

  return (
    <div
      className={cn(
        'group relative flex items-center border-b border-line pr-2 transition-colors',
        active ? 'bg-accent/10' : 'hover:bg-white/[0.03]',
      )}
      style={{ height: CHANNEL_ROW_HEIGHT }}
      data-qa-kind="channel"
      data-qa-id={channel.id}
      data-qa-title={channel.name}
      data-qa-subtitle={channel.categoryName ?? ''}
      data-qa-logo={channel.logo ?? ''}
      data-qa-number={channel.number}
    >
      {/* Active marker — the same rail treatment the sidebar uses. */}
      {active ? (
        <span className="absolute left-0 top-1/2 h-8 w-[3px] -translate-y-1/2 rounded-r-pill bg-accent" />
      ) : null}

      <Focusable
        onClick={onSelect}
        aria-label={`Watch ${channel.name}`}
        bare
        className="flex h-full flex-1 items-center gap-3.5 px-4 data-[focused=true]:bg-white/[0.06]"
      >
        <span
          className={cn(
            'w-8 shrink-0 text-right text-[15px] font-bold tabular-nums',
            active ? 'text-accent' : 'text-ink-dim',
          )}
        >
          {channel.number}
        </span>

        <span className="grid h-11 w-16 shrink-0 place-items-center overflow-hidden rounded-tile bg-surface-2">
          <Artwork
            src={channel.logo}
            alt={channel.name}
            kind="channel"
            className="h-full w-full text-[13px]"
            imgClassName="object-contain p-1.5"
          />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span
              className={cn(
                'truncate text-[15px] font-medium',
                active ? 'text-ink' : 'text-ink-soft',
              )}
            >
              {channel.name}
            </span>
            {channel.quality !== 'unknown' ? <Chip>{channel.quality}</Chip> : null}
          </span>

          {now ? (
            <>
              <span className="mt-1 flex items-center gap-2">
                <span className="truncate text-[13px] text-ink-mute">{now.title}</span>
                <span className="shrink-0 text-[12px] tabular-nums text-ink-dim">
                  {clockTime(now.start)}–{clockTime(now.stop)}
                </span>
              </span>
              <ProgressBar value={nowNext?.progress ?? 0} className="mt-2 max-w-[280px]" height={2} />
            </>
          ) : (
            <span className="mt-1 block truncate text-[13px] text-ink-dim">
              {channel.categoryName ?? 'No guide information'}
            </span>
          )}
        </span>
      </Focusable>

      <Focusable
        onClick={onToggleFavorite}
        aria-label={
          favorite ? `Remove ${channel.name} from favorites` : `Add ${channel.name} to favorites`
        }
        aria-pressed={favorite}
        className={cn(
          'grid h-9 w-9 shrink-0 place-items-center rounded-full transition-opacity',
          favorite ? 'text-live opacity-100' : 'text-ink-dim opacity-0 group-hover:opacity-100',
          'focus:opacity-100',
        )}
      >
        <Icon name="iptv-favorite" size={18} />
      </Focusable>

      {/* The ⋯ affordance — the mouse equivalent of holding OK. */}
      <Focusable
        onClick={() =>
          openQuickAction({
            kind: 'channel',
            id: channel.id,
            title: channel.name,
            subtitle: channel.categoryName,
            logo: channel.logo,
            number: channel.number,
          })
        }
        aria-label={`More actions for ${channel.name}`}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-dim opacity-0 transition-opacity hover:text-ink group-hover:opacity-100 focus:opacity-100"
      >
        <span className="text-[18px] leading-none">⋯</span>
      </Focusable>
    </div>
  );
}
