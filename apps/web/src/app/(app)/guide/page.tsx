'use client';

import { useEffect, useMemo, useState } from 'react';
import { dayLabel, timeRange } from '@streamwise/core';
import type { Category, Channel, EPGProgram } from '@streamwise/core';
import { api } from '@/lib/api/client';
import { useDebounce } from '@/hooks/useDebounce';
import { usePlayerStore } from '@/stores/playerStore';
import { useUserStore } from '@/stores/userStore';
import { TopBar } from '@/components/navigation/TopBar';
import { GuideGrid } from '@/components/guide/GuideGrid';
import { Icon, EmptyState, ErrorNotice, LiveBadge } from '@/components/common';
import { cn } from '@/lib/utils/cn';

/**
 * TV Guide.
 *
 * Selecting a programme that is on now starts the channel; selecting a future
 * one opens its details. Playback continues in the mini player throughout, so
 * browsing the guide never costs you what you were watching.
 */
export default function GuidePage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ program: EPGProgram; channel: Channel } | null>(null);

  const debouncedQuery = useDebounce(query, 200);

  const playChannel = usePlayerStore((s) => s.playChannel);
  const setMode = usePlayerStore((s) => s.setMode);
  const pushRecentChannel = useUserStore((s) => s.pushRecentChannel);
  const recordWatch = useUserStore((s) => s.recordWatch);

  useEffect(() => {
    let cancelled = false;
    api
      .categories('live')
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
      .channels({ categoryId, limit: 500 })
      .then((page) => !cancelled && setChannels(page.items))
      .catch((err: Error) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  const filtered = useMemo(() => {
    const needle = debouncedQuery.trim().toLowerCase();
    if (!needle) return channels;
    return channels.filter((c) => c.name.toLowerCase().includes(needle));
  }, [channels, debouncedQuery]);

  const watch = (channel: Channel) => {
    pushRecentChannel(channel.id);
    recordWatch({ kind: 'live', id: channel.id, title: channel.name, image: channel.logo });
    void playChannel(channel, { mode: 'mini', zapList: channels });
  };

  return (
    <>
      <TopBar title="TV Guide" />

      <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <label className="relative flex-1 max-w-xs">
          <Icon name="iptv-search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            data-focusable=""
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter channels"
            aria-label="Filter channels in the guide"
            className="w-full rounded-tile border border-line bg-surface-1 py-1.5 pl-9 pr-3 text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:shadow-focus"
          />
        </label>

        <div className="rail-scroll flex gap-1.5 overflow-x-auto">
          <FilterChip active={categoryId === null} onClick={() => setCategoryId(null)}>
            All
          </FilterChip>
          {categories.slice(0, 14).map((c) => (
            <FilterChip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(c.id)}>
              {c.name}
            </FilterChip>
          ))}
        </div>
      </div>

      {error ? (
        <div className="p-4">
          <ErrorNotice message={error} />
        </div>
      ) : null}

      {!loading && filtered.length === 0 ? (
        <EmptyState
          title="No channels match"
          description="Try a different filter, or clear the search box."
        />
      ) : (
        <GuideGrid
          channels={filtered}
          loading={loading}
          onPlay={watch}
          onSelectProgram={(program, channel) => setDetail({ program, channel })}
        />
      )}

      {detail ? (
        <ProgramDetail
          program={detail.program}
          channel={detail.channel}
          onClose={() => setDetail(null)}
          onWatch={() => {
            watch(detail.channel);
            setMode('fullscreen');
            setDetail(null);
          }}
        />
      ) : null}
    </>
  );
}

function FilterChip({
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

function ProgramDetail({
  program,
  channel,
  onClose,
  onWatch,
}: {
  program: EPGProgram;
  channel: Channel;
  onClose: () => void;
  onWatch: () => void;
}) {
  const live = program.start <= Date.now() && program.stop > Date.now();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={program.title}
      className="fixed inset-0 z-50 grid place-items-center bg-ground/85 p-6 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-card border border-line bg-surface-1 p-6 shadow-lift animate-zap-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-ink-faint">{channel.name}</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-balance">
              {program.title}
            </h2>
            <p className="mt-1 text-sm tabular-nums text-ink-mute">
              {dayLabel(program.start)} · {timeRange(program.start, program.stop)}
            </p>
          </div>
          <button
            type="button"
            data-focusable=""
            onClick={onClose}
            aria-label="Close"
            className="tv-focus rounded-full p-1.5 text-ink-mute hover:text-ink focus:shadow-focus"
          >
            <Icon name="iptv-close" size={16} />
          </button>
        </div>

        {program.category || program.episode || live ? (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {live ? <LiveBadge /> : null}
            {program.episode ? (
              <span className="rounded border border-line px-2 py-0.5 text-[11px] text-ink-mute">
                {program.episode}
              </span>
            ) : null}
            {program.category ? (
              <span className="rounded border border-line px-2 py-0.5 text-[11px] capitalize text-ink-mute">
                {program.category}
              </span>
            ) : null}
          </div>
        ) : null}

        <p className="text-sm leading-relaxed text-ink-soft">
          {program.description ?? 'No description was provided for this programme.'}
        </p>

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            data-focusable=""
            onClick={onWatch}
            className="tv-focus flex-1 rounded-tile bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 focus:shadow-focus"
          >
            {live ? 'Watch now' : `Go to ${channel.name}`}
          </button>
        </div>

        {!live ? (
          <p className="mt-3 text-xs text-ink-faint">
            This programme has not started yet. Opening the channel plays whatever is on now.
          </p>
        ) : null}
      </div>
    </div>
  );
}
