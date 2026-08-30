'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Channel, EPGProgram } from '@/types';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils/cn';
import { clockTime, floorToHalfHour, HOUR, MINUTE, timeRange } from '@/lib/utils/time';
import { Artwork, Skeleton } from '@/components/common';

/**
 * Electronic programme guide.
 *
 * The layout is the classic satellite grid because it is genuinely the best
 * answer to "what is on across everything right now": a fixed channel column,
 * a fixed timeline, and programme blocks whose width is proportional to their
 * duration, so a two-hour film is visibly a two-hour film.
 *
 * Both axes are virtualized. Rows are windowed by scroll position and EPG is
 * fetched per visible window and per time page, so a 20,000-channel guide
 * costs the same as a 20-channel one.
 */

const ROW_HEIGHT = 64;
const CHANNEL_COL_WIDTH = 232;
const PIXELS_PER_MINUTE = 6; // 30 min = 180px
const SLOT_MS = 30 * MINUTE;
const PAGE_MS = 4 * HOUR;

export function GuideGrid({
  channels,
  loading,
  onPlay,
  onSelectProgram,
}: {
  channels: Channel[];
  loading: boolean;
  onPlay: (channel: Channel) => void;
  onSelectProgram: (program: EPGProgram, channel: Channel) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());
  const [origin, setOrigin] = useState(() => floorToHalfHour(Date.now()) - HOUR);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const [schedules, setSchedules] = useState<Record<string, EPGProgram[]>>({});
  const fetched = useRef<Set<string>>(new Set());

  const windowEnd = origin + PAGE_MS;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetched.current = new Set();
    setSchedules({});
  }, [channels, origin]);

  // Track vertical scroll for row windowing.
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setScrollTop(node.scrollTop);
      });
    };
    const observer = new ResizeObserver(() => setViewportHeight(node.clientHeight));
    observer.observe(node);
    node.addEventListener('scroll', onScroll, { passive: true });
    setViewportHeight(node.clientHeight);
    return () => {
      node.removeEventListener('scroll', onScroll);
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [channels.length]);

  const overscan = 4;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - overscan);
  const endIndex = Math.min(
    channels.length,
    startIndex + Math.ceil(viewportHeight / ROW_HEIGHT) + overscan * 2,
  );

  // Fetch schedules for the visible rows in the current time page.
  useEffect(() => {
    const visible = channels.slice(startIndex, endIndex);
    const missing = visible
      .map((c) => c.id)
      .filter((id) => !fetched.current.has(`${id}@${origin}`));
    if (missing.length === 0) return;
    missing.forEach((id) => fetched.current.add(`${id}@${origin}`));

    let cancelled = false;
    api
      .epg(missing, origin, windowEnd)
      .then((res) => {
        if (cancelled) return;
        setSchedules((prev) => {
          const next = { ...prev };
          for (const s of res.schedules) next[s.channelId] = s.programs;
          return next;
        });
      })
      .catch(() => {
        missing.forEach((id) => fetched.current.delete(`${id}@${origin}`));
      });
    return () => {
      cancelled = true;
    };
  }, [channels, startIndex, endIndex, origin, windowEnd]);

  const slots = useMemo(() => {
    const out: number[] = [];
    for (let t = origin; t < windowEnd; t += SLOT_MS) out.push(t);
    return out;
  }, [origin, windowEnd]);

  const totalWidth = (PAGE_MS / MINUTE) * PIXELS_PER_MINUTE;
  const nowOffset = ((now - origin) / MINUTE) * PIXELS_PER_MINUTE;
  const nowVisible = now >= origin && now <= windowEnd;

  const jumpToNow = useCallback(() => {
    setOrigin(floorToHalfHour(Date.now()) - HOUR);
    requestAnimationFrame(() => {
      scroller.current?.scrollTo({ left: (60 / 1) * PIXELS_PER_MINUTE - 40, behavior: 'smooth' });
    });
  }, []);

  const shift = (hours: number) => setOrigin((o) => o + hours * HOUR);

  if (loading) {
    return (
      <div className="space-y-1 p-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <GuideToolbar
        origin={origin}
        onShift={shift}
        onNow={jumpToNow}
        canGoBack={origin > Date.now() - 12 * HOUR}
      />

      <div ref={scroller} className="relative min-h-0 flex-1 overflow-auto" data-nav-trap="none">
        {/* Timeline header — sticky on both axes so it never scrolls away. */}
        <div
          className="sticky top-0 z-20 flex bg-ground/95 backdrop-blur"
          style={{ width: CHANNEL_COL_WIDTH + totalWidth }}
        >
          <div
            className="sticky left-0 z-10 shrink-0 border-b border-r border-line bg-ground/95 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint"
            style={{ width: CHANNEL_COL_WIDTH }}
          >
            Channel
          </div>
          <div className="relative border-b border-line" style={{ width: totalWidth }}>
            <div className="flex">
              {slots.map((slot) => (
                <div
                  key={slot}
                  className="shrink-0 border-l border-line/60 px-2 py-2 text-xs tabular-nums text-ink-mute"
                  style={{ width: (SLOT_MS / MINUTE) * PIXELS_PER_MINUTE }}
                >
                  {clockTime(slot)}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Rows */}
        <div
          style={{ height: channels.length * ROW_HEIGHT, width: CHANNEL_COL_WIDTH + totalWidth }}
          className="relative"
        >
          {nowVisible ? (
            <div
              aria-hidden
              className="pointer-events-none absolute top-0 z-20 w-px bg-live"
              style={{ left: CHANNEL_COL_WIDTH + nowOffset, height: channels.length * ROW_HEIGHT }}
            >
              <span className="absolute -left-[3px] -top-[3px] h-[7px] w-[7px] rounded-full bg-live" />
            </div>
          ) : null}

          <div style={{ transform: `translateY(${startIndex * ROW_HEIGHT}px)` }}>
            {channels.slice(startIndex, endIndex).map((channel) => (
              <GuideRow
                key={channel.id}
                channel={channel}
                programs={schedules[channel.id]}
                origin={origin}
                windowEnd={windowEnd}
                now={now}
                totalWidth={totalWidth}
                onPlay={() => onPlay(channel)}
                onSelectProgram={(program) => onSelectProgram(program, channel)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function GuideToolbar({
  origin,
  onShift,
  onNow,
  canGoBack,
}: {
  origin: number;
  onShift: (hours: number) => void;
  onNow: () => void;
  canGoBack: boolean;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-line/70 px-4 py-2.5">
      <span className="mr-2 text-xs text-ink-mute">
        {new Date(origin).toLocaleDateString(undefined, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
      </span>
      <ToolbarButton onClick={() => onShift(-2)} disabled={!canGoBack}>
        −2h
      </ToolbarButton>
      <ToolbarButton onClick={onNow} primary>
        Now
      </ToolbarButton>
      <ToolbarButton onClick={() => onShift(2)}>+2h</ToolbarButton>
      <ToolbarButton onClick={() => onShift(24)}>+1 day</ToolbarButton>
    </div>
  );
}

function ToolbarButton({
  children,
  onClick,
  primary,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      data-focusable=""
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'tv-focus rounded-tile px-3 py-1.5 text-xs font-medium focus:shadow-focus disabled:opacity-35',
        primary
          ? 'bg-accent text-white hover:bg-accent-bright'
          : 'border border-line text-ink-mute hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

function GuideRow({
  channel,
  programs,
  origin,
  windowEnd,
  now,
  totalWidth,
  onPlay,
  onSelectProgram,
}: {
  channel: Channel;
  programs: EPGProgram[] | undefined;
  origin: number;
  windowEnd: number;
  now: number;
  totalWidth: number;
  onPlay: () => void;
  onSelectProgram: (program: EPGProgram) => void;
}) {
  return (
    <div className="flex border-b border-line/40" style={{ height: ROW_HEIGHT }}>
      <button
        type="button"
        data-focusable=""
        onClick={onPlay}
        aria-label={`Watch ${channel.name}`}
        className="sticky left-0 z-10 flex shrink-0 items-center gap-2.5 border-r border-line bg-ground px-3 text-left focus:shadow-focus hover:bg-surface-2"
        style={{ width: CHANNEL_COL_WIDTH }}
      >
        <span className="w-7 shrink-0 text-right text-xs font-semibold tabular-nums text-ink-faint">
          {channel.number}
        </span>
        <span className="grid h-8 w-11 shrink-0 place-items-center overflow-hidden rounded bg-surface-2">
          <Artwork
            src={channel.logo}
            alt={channel.name}
            kind="channel"
            className="h-full w-full text-[10px]"
            imgClassName="object-contain p-0.5"
          />
        </span>
        <span className="truncate text-[13px] text-ink-soft">{channel.name}</span>
      </button>

      <div className="relative" style={{ width: totalWidth }}>
        {programs === undefined ? (
          <div className="absolute inset-1 skeleton rounded" />
        ) : programs.length === 0 ? (
          <div className="absolute inset-y-1 left-1 right-1 rounded border border-line/40 bg-surface-1/40 px-3 py-2 text-xs text-ink-faint">
            No guide information
          </div>
        ) : (
          programs.map((program) => {
            const start = Math.max(program.start, origin);
            const stop = Math.min(program.stop, windowEnd);
            const left = ((start - origin) / MINUTE) * PIXELS_PER_MINUTE;
            const width = Math.max(2, ((stop - start) / MINUTE) * PIXELS_PER_MINUTE);
            const isNow = program.start <= now && program.stop > now;

            return (
              <button
                key={program.id}
                type="button"
                data-focusable=""
                onClick={() => (isNow ? onPlay() : onSelectProgram(program))}
                title={`${program.title}\n${timeRange(program.start, program.stop)}`}
                className={cn(
                  'absolute inset-y-1 overflow-hidden rounded border px-2.5 py-1.5 text-left transition-colors focus:shadow-focus',
                  isNow
                    ? 'border-accent/60 bg-accent/15 hover:bg-accent/25'
                    : 'border-line/60 bg-surface-1 hover:bg-surface-3',
                )}
                style={{ left, width: width - 3 }}
              >
                <span
                  className={cn(
                    'block truncate text-xs font-medium',
                    isNow ? 'text-ink' : 'text-ink-soft',
                  )}
                >
                  {program.title}
                </span>
                {width > 90 ? (
                  <span className="mt-0.5 block truncate text-[11px] tabular-nums text-ink-faint">
                    {clockTime(program.start)}
                  </span>
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
