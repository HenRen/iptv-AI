'use client';

import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import type { Channel } from '@/types';
import { aiApi } from '@/lib/api/aiClient';
import { api } from '@/lib/api/client';
import { SPORT_LABEL, type SportsEvent } from '@/lib/ai/epg/SportsIntelligence';
import { usePlayerStore } from '@/stores/playerStore';
import { useUserStore } from '@/stores/userStore';
import { useAiStore } from '@/stores/aiStore';
import { Focusable, LiveBadge, Skeleton } from '@/components/common';
import { clockTime, dayLabel } from '@/lib/utils/time';

/**
 * AI 5 — Sports Tonight.
 *
 * Every row is one programme from the provider's own EPG on one real channel.
 * With no guide data this renders nothing at all rather than a plausible
 * fixture list, which is the entire point: a sports panel that invents kick-off
 * times is worse than no sports panel.
 */
export function SportsTonight({ limit = 12 }: { limit?: number }) {
  const [events, setEvents] = useState<SportsEvent[]>([]);
  const [hasEpg, setHasEpg] = useState(true);
  const [loading, setLoading] = useState(true);

  const enabled = useAiStore((s) => s.prefs.enabled);
  const playChannel = usePlayerStore((s) => s.playChannel);
  const pushRecentChannel = useUserStore((s) => s.pushRecentChannel);
  const recordWatch = useUserStore((s) => s.recordWatch);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    aiApi
      .sports()
      .then((res) => {
        if (cancelled) return;
        setEvents(res.events.slice(0, limit));
        setHasEpg(res.hasEpg);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [enabled, limit]);

  const watch = async (event: SportsEvent) => {
    // Resolve the channel from the catalogue before playing anything.
    const page = await api.channelsByIds([event.channelId]);
    const channel: Channel | undefined = page.items[0];
    if (!channel) return;
    pushRecentChannel(channel.id);
    recordWatch({ kind: 'live', id: channel.id, title: channel.name, image: channel.logo });
    void playChannel(channel, { mode: 'fullscreen' });
  };

  if (!enabled) return null;

  if (loading) {
    return (
      <section className="px-8">
        <Skeleton className="mb-3 h-4 w-32" />
        <div className="space-y-1.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </section>
    );
  }

  // No EPG, or no sport in it — say nothing rather than fabricate.
  if (events.length === 0) {
    if (!hasEpg) return null;
    return null;
  }

  return (
    <section>
      <header className="mb-3 flex items-center gap-2 px-8">
        <Trophy className="h-4 w-4 text-accent" aria-hidden />
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">Sports Tonight</h2>
        <span className="text-xs text-ink-faint">from your TV guide</span>
      </header>

      <ul className="space-y-1.5 px-8">
        {events.map((event) => (
          <li key={event.programId}>
            <Focusable
              onClick={() => void watch(event)}
              aria-label={`Watch ${event.title} on ${event.channelName}`}
              className="flex w-full items-center gap-4 rounded-tile border border-line/60 bg-surface-1 p-3 hover:bg-surface-3"
            >
              <span className="w-24 shrink-0 text-xs tabular-nums text-ink-mute">
                {dayLabel(event.start)} {clockTime(event.start)}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-ink">
                    {event.teams ? `${event.teams[0]} v ${event.teams[1]}` : event.title}
                  </span>
                  {event.live ? <LiveBadge /> : null}
                </span>
                <span className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-faint">
                  <span>{SPORT_LABEL[event.sport]}</span>
                  {event.competition ? <span>· {event.competition}</span> : null}
                </span>
              </span>

              <span className="shrink-0 text-right">
                <span className="block text-xs text-ink-soft">{event.channelName}</span>
                <span className="block text-[11px] tabular-nums text-ink-faint">
                  {event.channelNumber}
                </span>
              </span>
            </Focusable>
          </li>
        ))}
      </ul>
    </section>
  );
}
