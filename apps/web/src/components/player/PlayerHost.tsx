'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { cn } from '@/lib/utils/cn';
import { usePlayerStore } from '@/stores/playerStore';
import { VideoSurface } from './VideoSurface';
import { PlayerControls } from './PlayerControls';
import { ChannelBanner } from './ChannelBanner';
import { MiniPlayerChrome } from './MiniPlayer';

/**
 * Keeps one video element alive across the whole app while letting any screen
 * decide where it appears.
 *
 * A screen renders <PlayerSlot />; the host measures that slot and positions
 * itself over it. The video is never re-parented, so switching from the Live
 * TV page to the Guide does not interrupt playback by so much as a frame.
 */

interface SlotState {
  rect: DOMRect | null;
  setRect: (rect: DOMRect | null) => void;
}

const useSlotStore = create<SlotState>((set) => ({
  rect: null,
  setRect: (rect) => set({ rect }),
}));

/** Placed by a screen to say "the inline player belongs here". */
export function PlayerSlot({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const setRect = useSlotStore((s) => s.setRect);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => setRect(el.getBoundingClientRect());
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      setRect(null);
    };
  }, [setRect]);

  return <div ref={ref} className={cn('rounded-card bg-ground-deep', className)} aria-hidden />;
}

export function PlayerHost() {
  const mode = usePlayerStore((s) => s.mode);
  const source = usePlayerStore((s) => s.source);
  const error = usePlayerStore((s) => s.error);
  const nowPlaying = usePlayerStore((s) => s.nowPlaying);
  const setMode = usePlayerStore((s) => s.setMode);
  const slotRect = useSlotStore((s) => s.rect);

  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wake = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), 3500);
  }, []);

  useEffect(() => {
    if (mode !== 'fullscreen') {
      setControlsVisible(true);
      return;
    }
    wake();
    const onActivity = () => wake();
    window.addEventListener('mousemove', onActivity);
    window.addEventListener('keydown', onActivity);
    return () => {
      window.removeEventListener('mousemove', onActivity);
      window.removeEventListener('keydown', onActivity);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [mode, wake]);

  // An inline player with no slot on screen degrades to the mini player
  // rather than vanishing — otherwise navigating away silently kills audio.
  const effectiveMode = mode === 'inline' && !slotRect ? 'mini' : mode;

  if (!nowPlaying || effectiveMode === 'hidden') return null;

  const style =
    effectiveMode === 'inline' && slotRect
      ? {
          top: slotRect.top,
          left: slotRect.left,
          width: slotRect.width,
          height: slotRect.height,
        }
      : undefined;

  return (
    <div
      className={cn(
        'fixed z-40 overflow-hidden bg-ground-deep',
        effectiveMode === 'fullscreen' && 'inset-0 z-50',
        effectiveMode === 'mini' &&
          'bottom-4 right-4 h-[158px] w-[280px] rounded-card border border-line shadow-lift md:bottom-6 md:right-6',
        effectiveMode === 'inline' && 'rounded-card border border-line',
      )}
      style={style}
      onMouseMove={effectiveMode === 'fullscreen' ? wake : undefined}
    >
      <VideoSurface className="h-full w-full bg-ground-deep object-contain" />

      {error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ground-deep/90 px-6 text-center">
          <p className="text-sm text-ink">{error}</p>
          <p className="text-xs text-ink-mute">
            Try another channel, or a different quality if this one has variants.
          </p>
        </div>
      ) : null}

      <ChannelBanner visible={effectiveMode !== 'mini'} />

      {effectiveMode === 'mini' ? (
        <MiniPlayerChrome onExpand={() => setMode('fullscreen')} />
      ) : (
        <PlayerControls
          visible={controlsVisible || effectiveMode === 'inline'}
          compact={effectiveMode === 'inline'}
          onActivity={wake}
        />
      )}

      {source == null && !error ? (
        <div className="absolute inset-0 grid place-items-center bg-ground-deep/70">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : null}
    </div>
  );
}
