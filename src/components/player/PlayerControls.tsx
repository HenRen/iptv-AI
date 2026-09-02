'use client';

import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { cn } from '@/lib/utils/cn';
import { formatDuration } from '@/lib/utils/time';
import { Icon, LiveBadge } from '@/components/common';
import { TrackMenus } from './TrackMenu';

/**
 * Player chrome.
 *
 * Live and VOD get genuinely different controls rather than a seek bar that
 * pretends to work on a live stream: live shows now/next and channel
 * up/down, VOD shows a scrubber and time remaining.
 */
export function PlayerControls({
  visible,
  compact,
  onActivity,
}: {
  visible: boolean;
  compact?: boolean;
  onActivity?: () => void;
}) {
  const nowPlaying = usePlayerStore((s) => s.nowPlaying);
  const playing = usePlayerStore((s) => s.playing);
  const muted = usePlayerStore((s) => s.muted);
  const mode = usePlayerStore((s) => s.mode);
  const setMode = usePlayerStore((s) => s.setMode);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const toggleMute = usePlayerStore((s) => s.toggleMute);
  const zap = usePlayerStore((s) => s.zap);

  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [pipAvailable, setPipAvailable] = useState(false);
  const scrubbing = useRef(false);

  const isLive = nowPlaying?.kind === 'live';

  // Read time from the single video element rather than mirroring it into
  // the store — a 4 Hz store write would re-render half the app.
  useEffect(() => {
    if (isLive) return;
    const tick = () => {
      const video = document.querySelector('video');
      if (!video || scrubbing.current) return;
      setPosition(video.currentTime);
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    };
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [isLive]);

  useEffect(() => {
    setPipAvailable(typeof document !== 'undefined' && document.pictureInPictureEnabled);
  }, []);

  if (!nowPlaying) return null;

  const seek = (secs: number) => {
    const video = document.querySelector('video');
    if (video && Number.isFinite(video.duration)) video.currentTime = secs;
    setPosition(secs);
  };

  const togglePip = async () => {
    const video = document.querySelector('video');
    if (!video) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch {
      // Some browsers refuse PiP for MSE-backed elements; silently ignore.
    }
  };

  return (
    <div
      onMouseMove={onActivity}
      className={cn(
        'absolute inset-x-0 bottom-0 bg-gradient-to-t from-ground-deep via-ground-deep/85 to-transparent transition-opacity duration-300',
        compact ? 'pt-10' : 'pt-20',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      <div className={cn('px-4 pb-3', !compact && 'px-8 pb-6')}>
        {!isLive && duration > 0 ? (
          <div className="mb-3 flex items-center gap-3">
            <span className="w-12 shrink-0 text-right text-xs tabular-nums text-ink-soft">
              {formatClock(position)}
            </span>
            <input
              type="range"
              data-focusable=""
              aria-label="Seek"
              min={0}
              max={Math.max(1, duration)}
              step={1}
              value={position}
              onMouseDown={() => (scrubbing.current = true)}
              onMouseUp={() => (scrubbing.current = false)}
              onChange={(e) => seek(Number(e.target.value))}
              className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-surface-4 accent-accent focus:shadow-focus"
              style={{
                background: `linear-gradient(to right, #2f7dff ${(position / Math.max(1, duration)) * 100}%, #232d42 ${(position / Math.max(1, duration)) * 100}%)`,
              }}
            />
            <span className="w-12 shrink-0 text-xs tabular-nums text-ink-mute">
              −{formatClock(Math.max(0, duration - position))}
            </span>
          </div>
        ) : null}

        <div className="flex items-end justify-between gap-6">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              {isLive ? <LiveBadge /> : null}
              {nowPlaying.channelNumber ? (
                <span className="text-xs font-semibold tabular-nums text-ink-mute">
                  {nowPlaying.channelNumber}
                </span>
              ) : null}
              <span className="truncate text-sm font-semibold text-ink">{nowPlaying.title}</span>
            </div>
            {nowPlaying.subtitle ? (
              <p className="truncate text-xs text-ink-mute">{nowPlaying.subtitle}</p>
            ) : null}
            {!isLive && duration > 0 ? (
              <p className="text-xs text-ink-faint">{formatDuration(Math.round(duration))}</p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {isLive ? (
              <>
                <ControlButton label="Previous channel" onClick={() => void zap(-1)}>
                  <Icon name="iptv-ch-down" size={16} />
                </ControlButton>
                <ControlButton label="Next channel" onClick={() => void zap(1)}>
                  <Icon name="iptv-ch-up" size={16} />
                </ControlButton>
              </>
            ) : null}

            <ControlButton
              label={playing ? 'Pause' : 'Play'}
              onClick={() => setPlaying(!playing)}
              primary
            >
              {playing ? <Icon name="iptv-pause" size={20} /> : <Icon name="iptv-play" size={20} />}
            </ControlButton>

            <ControlButton label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute}>
              {muted ? <Icon name="iptv-mute" size={16} /> : <Icon name="iptv-volume" size={16} />}
            </ControlButton>

            <TrackMenus compact={compact} />

            {pipAvailable ? (
              <ControlButton label="Picture in picture" onClick={() => void togglePip()}>
                <Icon name="iptv-pip" size={16} />
              </ControlButton>
            ) : null}

            <ControlButton
              label={mode === 'fullscreen' ? 'Exit fullscreen' : 'Fullscreen'}
              onClick={() => setMode(mode === 'fullscreen' ? 'inline' : 'fullscreen')}
            >
              {mode === 'fullscreen' ? (
                <Icon name="iptv-exit-fs" size={16} />
              ) : (
                <Icon name="iptv-fullscreen" size={16} />
              )}
            </ControlButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function ControlButton({
  label,
  onClick,
  primary,
  children,
}: {
  label: string;
  onClick: () => void;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-focusable=""
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'tv-focus grid place-items-center rounded-full focus:shadow-focus',
        primary
          ? 'h-11 w-11 bg-white text-ground hover:bg-ink-soft'
          : 'h-9 w-9 text-ink-soft hover:bg-white/10 hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

function formatClock(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return '0:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}
