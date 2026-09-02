'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Channel } from '@/types';
import { aiApi } from '@/lib/api/aiClient';
import { api } from '@/lib/api/client';
import { SPORT_LABEL, type SportKind, type SportsEvent } from '@/lib/ai/epg/SportsIntelligence';
import { usePlayerStore } from '@/stores/playerStore';
import { useUserStore } from '@/stores/userStore';
import { useUiStore } from '@/stores/uiStore';
import { useAiStore } from '@/stores/aiStore';
import { TopBar } from '@/components/navigation/TopBar';
import {
  AiTag,
  Chip,
  EmptyState,
  Focusable,
  Icon,
  LiveBadge,
  ProgressBar,
  Skeleton,
} from '@/components/common';
import { clockTime, dayLabel } from '@/lib/utils/time';
import { cn } from '@/lib/utils/cn';

/**
 * Sports hub (PROTOTYPE.md §8).
 *
 * Every event on this screen is one programme from the provider's own guide,
 * on one real channel. With no EPG the page says so plainly rather than
 * filling itself with plausible fixtures — a sports page that invents kick-off
 * times is worse than no sports page.
 */
export default function SportsPage() {
  const router = useRouter();
  const [events, setEvents] = useState<SportsEvent[]>([]);
  const [hasEpg, setHasEpg] = useState(true);
  const [loading, setLoading] = useState(true);
  const [sport, setSport] = useState<SportKind | 'all'>('all');

  const aiEnabled = useAiStore((s) => s.prefs.enabled);
  const playChannel = usePlayerStore((s) => s.playChannel);
  const pushRecentChannel = useUserStore((s) => s.pushRecentChannel);
  const recordWatch = useUserStore((s) => s.recordWatch);
  const openQuickAction = useUiStore((s) => s.openQuickAction);

  useEffect(() => {
    let cancelled = false;
    aiApi
      .sports()
      .then((res) => {
        if (cancelled) return;
        setEvents(res.events);
        setHasEpg(res.hasEpg);
      })
      .catch(() => !cancelled && setEvents([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const watch = async (event: SportsEvent) => {
    const page = await api.channelsByIds([event.channelId]);
    const channel: Channel | undefined = page.items[0];
    if (!channel) return;
    pushRecentChannel(channel.id);
    recordWatch({ kind: 'live', id: channel.id, title: channel.name, image: channel.logo });
    void playChannel(channel, { mode: 'fullscreen' });
  };

  const sports = useMemo(() => {
    const set = new Map<SportKind, number>();
    for (const event of events) set.set(event.sport, (set.get(event.sport) ?? 0) + 1);
    return [...set.entries()].sort((a, b) => b[1] - a[1]);
  }, [events]);

  const filtered = sport === 'all' ? events : events.filter((e) => e.sport === sport);
  const live = filtered.filter((e) => e.live);
  const upcoming = filtered.filter((e) => !e.live);
  const hero = live[0] ?? upcoming[0] ?? null;

  if (loading) {
    return (
      <>
        <TopBar title="Sports" />
        <div className="min-h-0 flex-1 overflow-hidden px-14 pt-2">
          <Skeleton className="h-[320px] w-full rounded-hero" />
          <Skeleton className="mt-8 h-4 w-40" />
          <div className="mt-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </div>
      </>
    );
  }

  if (!aiEnabled) {
    return (
      <>
        <TopBar title="Sports" />
        <EmptyState
          icon="iptv-ai-sports"
          title="Sports detection is switched off"
          description="Turn AI features back on in Settings › AI & Privacy to have the guide scanned for live events."
          action={
            <Focusable
              onClick={() => router.push('/settings/ai')}
              className="mt-2 rounded-pill bg-accent px-6 py-3 text-[14px] font-bold uppercase tracking-label text-ground"
            >
              Open AI settings
            </Focusable>
          }
        />
      </>
    );
  }

  if (!hasEpg) {
    return (
      <>
        <TopBar title="Sports" />
        <EmptyState
          icon="iptv-ai-sports"
          title="No TV guide data"
          description="Sports events are read from your provider's programme guide. Add an XMLTV source in Settings and this page fills itself in."
          action={
            <Focusable
              onClick={() => router.push('/settings')}
              className="mt-2 rounded-pill bg-accent px-6 py-3 text-[14px] font-bold uppercase tracking-label text-ground"
            >
              Add a guide source
            </Focusable>
          }
        />
      </>
    );
  }

  if (events.length === 0) {
    return (
      <>
        <TopBar title="Sports" />
        <EmptyState
          icon="iptv-sports"
          title="No sport found in the next 18 hours"
          description="Your guide has no recognisable sporting events scheduled. This page only shows what the guide actually contains."
        />
      </>
    );
  }

  return (
    <>
      <TopBar title="Sports" />

      <div className="min-h-0 flex-1 overflow-y-auto pb-12">
        {hero ? (
          <section className="relative mx-14 mt-2 h-[320px] overflow-hidden rounded-hero border border-line">
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(105deg, #0A1F1A 0%, #12372C 45%, #071510 100%)',
              }}
            />
            <div
              aria-hidden
              className="absolute inset-0"
              style={{ background: 'linear-gradient(to top, rgba(10,15,30,0.92), transparent 70%)' }}
            />
            <div className="relative flex h-full flex-col justify-end p-10">
              <div className="mb-4 flex items-center gap-3">
                {hero.live ? <LiveBadge /> : null}
                <AiTag>Top event</AiTag>
                <span className="text-[12px] font-semibold uppercase tracking-label text-ink-mute">
                  {SPORT_LABEL[hero.sport]}
                </span>
              </div>

              <h2 className="max-w-3xl text-[40px] font-bold leading-[1.05] tracking-tight text-ink text-balance">
                {hero.teams ? `${hero.teams[0]} v ${hero.teams[1]}` : hero.title}
              </h2>

              <p className="mt-3 text-[15px] text-ink-soft">
                {hero.competition ? `${hero.competition} · ` : ''}
                {hero.channelName} · {dayLabel(hero.start)} {clockTime(hero.start)}
              </p>

              {hero.live ? (
                <ProgressBar
                  value={(Date.now() - hero.start) / Math.max(1, hero.stop - hero.start)}
                  tone="live"
                  className="mt-5 max-w-md"
                />
              ) : null}

              <div className="mt-7">
                <Focusable
                  onClick={() => void watch(hero)}
                  className="inline-flex items-center gap-2.5 rounded-pill bg-white px-8 py-3.5 text-[15px] font-bold uppercase tracking-label text-ground hover:bg-ink-soft"
                  focusClassName="shadow-focus-strong"
                >
                  <Icon name="iptv-play" size={18} />
                  {hero.live ? 'Watch live' : 'Go to channel'}
                </Focusable>
              </div>
            </div>
          </section>
        ) : null}

        {/* Sport filter — built from what the guide actually contains. */}
        <div className="rail-scroll mt-8 flex gap-2 overflow-x-auto px-14">
          <FilterPill active={sport === 'all'} onClick={() => setSport('all')}>
            All · {events.length}
          </FilterPill>
          {sports.map(([kind, count]) => (
            <FilterPill key={kind} active={sport === kind} onClick={() => setSport(kind)}>
              {SPORT_LABEL[kind]} · {count}
            </FilterPill>
          ))}
        </div>

        {live.length > 0 ? (
          <EventGroup
            title="Live now"
            events={live}
            onWatch={watch}
            onQuickAction={openQuickAction}
          />
        ) : null}

        {upcoming.length > 0 ? (
          <EventGroup
            title="Starting soon"
            events={upcoming}
            onWatch={watch}
            onQuickAction={openQuickAction}
          />
        ) : null}
      </div>
    </>
  );
}

function FilterPill({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Focusable
      onClick={onClick}
      className={cn(
        'shrink-0 whitespace-nowrap rounded-pill px-4 py-2 text-[12px] font-semibold uppercase tracking-label',
        active
          ? 'bg-accent text-ground'
          : 'border border-line text-ink-mute hover:border-line-strong hover:text-ink',
      )}
    >
      {children}
    </Focusable>
  );
}

function EventGroup({
  title,
  events,
  onWatch,
  onQuickAction,
}: {
  title: string;
  events: SportsEvent[];
  onWatch: (event: SportsEvent) => void;
  onQuickAction: (target: Parameters<ReturnType<typeof useUiStore.getState>['openQuickAction']>[0]) => void;
}) {
  return (
    <section className="mt-10">
      <h2 className="mb-4 px-14 sw-label text-ink">{title}</h2>
      <ul className="space-y-2 px-14">
        {events.map((event) => (
          <li key={event.programId}>
            <div
              className="group flex items-center gap-5 rounded-card border border-line bg-surface-1 pr-3 transition-colors hover:bg-surface-2"
              data-qa-kind="program"
              data-qa-id={event.programId}
              data-qa-title={event.title}
              data-qa-channel={event.channelId}
              data-qa-start={event.start}
              data-qa-stop={event.stop}
            >
              <Focusable
                onClick={() => onWatch(event)}
                aria-label={`Watch ${event.title} on ${event.channelName}`}
                bare
                className="flex flex-1 items-center gap-5 rounded-card p-4"
              >
                <span className="w-28 shrink-0 text-[13px] font-semibold tabular-nums text-ink-mute">
                  {event.live ? (
                    <span className="text-live">Live now</span>
                  ) : (
                    <>
                      {dayLabel(event.start)} {clockTime(event.start)}
                    </>
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2.5">
                    <span className="truncate text-[16px] font-semibold text-ink">
                      {event.teams ? `${event.teams[0]} v ${event.teams[1]}` : event.title}
                    </span>
                    {event.live ? <LiveBadge size="sm" /> : null}
                  </span>
                  <span className="mt-1 flex items-center gap-2 text-[12px] text-ink-faint">
                    <Chip>{SPORT_LABEL[event.sport]}</Chip>
                    {event.competition ? <span>{event.competition}</span> : null}
                  </span>
                </span>

                <span className="shrink-0 text-right">
                  <span className="block text-[13px] text-ink-soft">{event.channelName}</span>
                  <span className="block text-[12px] tabular-nums text-ink-dim">
                    {event.channelNumber}
                  </span>
                </span>
              </Focusable>

              <Focusable
                onClick={() =>
                  onQuickAction({
                    kind: 'program',
                    id: event.programId,
                    title: event.title,
                    subtitle: event.channelName,
                    channelId: event.channelId,
                    start: event.start,
                    stop: event.stop,
                  })
                }
                aria-label={`More actions for ${event.title}`}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-dim opacity-0 group-hover:opacity-100 focus:opacity-100"
              >
                <span className="text-[18px] leading-none">⋯</span>
              </Focusable>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
