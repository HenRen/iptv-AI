'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search as SearchIcon, Sparkles } from 'lucide-react';
import type { Channel, EPGProgram, Movie, Series } from '@/types';
import { api } from '@/lib/api/client';
import { useDebounce } from '@/hooks/useDebounce';
import { usePlayerStore } from '@/stores/playerStore';
import { useUserStore } from '@/stores/userStore';
import { TopBar } from '@/components/navigation/TopBar';
import { ChannelCard, ContentCard } from '@/components/vod/ContentCard';
import { EmptyState, Rail, Skeleton } from '@/components/common';
import { clockTime, dayLabel } from '@/lib/utils/time';
import { Focusable } from '@/components/common';

interface Results {
  channels: Channel[];
  movies: Movie[];
  series: Series[];
  programs: Array<{ program: EPGProgram; channelId: string; channelName: string }>;
}

const EMPTY: Results = { channels: [], movies: [], series: [], programs: [] };

/**
 * Universal search across channels, movies, series and the next 24 hours of
 * guide data — grouped, debounced, and served by a prebuilt inverted index so
 * it stays instant on a 50,000-item catalogue.
 */
export default function SearchPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Results>(EMPTY);
  const [loading, setLoading] = useState(false);
  const debounced = useDebounce(query, 220);

  const playChannel = usePlayerStore((s) => s.playChannel);
  const pushRecentChannel = useUserStore((s) => s.pushRecentChannel);
  const recordWatch = useUserStore((s) => s.recordWatch);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const trimmed = debounced.trim();
    if (trimmed.length < 2) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .search(trimmed)
      .then((res) => !cancelled && setResults(res))
      .catch(() => !cancelled && setResults(EMPTY))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const watch = (channel: Channel) => {
    pushRecentChannel(channel.id);
    recordWatch({ kind: 'live', id: channel.id, title: channel.name, image: channel.logo });
    void playChannel(channel, { mode: 'fullscreen' });
  };

  const total =
    results.channels.length + results.movies.length + results.series.length + results.programs.length;
  const searched = debounced.trim().length >= 2;

  return (
    <>
      <TopBar title="Search" />

      <div className="border-b border-line/70 px-6 py-5">
        <label className="relative mx-auto block max-w-2xl">
          <SearchIcon
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
            aria-hidden
          />
          <input
            ref={inputRef}
            data-focusable=""
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search channels, movies, series and what's on…"
            aria-label="Search"
            className="w-full rounded-card border border-line bg-surface-1 py-3 pl-11 pr-4 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:shadow-focus"
          />
        </label>
        <p className="mx-auto mt-2 max-w-2xl text-[11px] text-ink-faint">
          <Sparkles className="mr-1 inline h-3 w-3" aria-hidden />
          Ask TV natural-language search arrives with the AI layer — it resolves every result back
          to something that actually exists in your playlist.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-6">
        {!searched ? (
          <EmptyState
            title="Search your playlist"
            description="Type at least two characters. Results are grouped by channels, movies, series and programmes airing in the next 24 hours."
            icon={<SearchIcon className="h-8 w-8" aria-hidden />}
          />
        ) : loading ? (
          <div className="space-y-8">
            {[0, 1].map((row) => (
              <div key={row} className="px-8">
                <Skeleton className="mb-3 h-4 w-32" />
                <div className="flex gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-[88px] w-[210px]" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : total === 0 ? (
          <EmptyState
            title={`Nothing found for "${debounced.trim()}"`}
            description="Try a shorter query, or check that the playlist actually carries that content."
          />
        ) : (
          <div className="space-y-8">
            {results.channels.length > 0 ? (
              <Rail title="Channels" subtitle={`${results.channels.length} found`}>
                {results.channels.map((c) => (
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

            {results.programs.length > 0 ? (
              <section>
                <h2 className="mb-3 px-8 text-[15px] font-semibold tracking-tight">On soon</h2>
                <ul className="space-y-1.5 px-8">
                  {results.programs.map(({ program, channelId, channelName }) => (
                    <li key={program.id}>
                      <Focusable
                        onClick={() => {
                          void api
                            .channelsByIds([channelId])
                            .then((page) => page.items[0] && watch(page.items[0]));
                        }}
                        className="flex w-full items-center gap-4 rounded-tile border border-line/60 bg-surface-1 p-3 hover:bg-surface-3"
                      >
                        <span className="w-24 shrink-0 text-xs tabular-nums text-ink-mute">
                          {dayLabel(program.start)} {clockTime(program.start)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">
                            {program.title}
                          </span>
                          <span className="block truncate text-xs text-ink-faint">{channelName}</span>
                        </span>
                      </Focusable>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {results.movies.length > 0 ? (
              <Rail title="Movies" subtitle={`${results.movies.length} found`}>
                {results.movies.map((m) => (
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

            {results.series.length > 0 ? (
              <Rail title="Series" subtitle={`${results.series.length} found`}>
                {results.series.map((s) => (
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
