'use client';

import { Icon } from '@/components/icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EMPTY_TRACKS,
  readTracks,
  selectAudioTrack,
  selectQualityLevel,
  selectSubtitleTrack,
  type TrackOption,
  type TrackState,
} from '@/lib/player/tracks';
import { getActiveEngine, subscribeToEngine } from '@/lib/player/activeEngine';
import { cn } from '@/lib/utils/cn';

/**
 * Audio / subtitle / quality selection (§12).
 *
 * Each menu renders only if the current stream actually offers that choice —
 * a mono-audio MPEG-TS channel gets no audio menu rather than a menu with one
 * disabled entry. Subtitles always include an explicit "Off".
 */
export function TrackMenus({ compact }: { compact?: boolean }) {
  const [tracks, setTracks] = useState<TrackState>(EMPTY_TRACKS);
  const [openMenu, setOpenMenu] = useState<'audio' | 'subtitles' | 'quality' | null>(null);

  const refresh = useCallback(() => {
    const engine = getActiveEngine();
    const video = document.querySelector('video');
    setTracks(engine ? readTracks(video, engine.kind, engine.handle) : EMPTY_TRACKS);
  }, []);

  useEffect(() => {
    refresh();
    const unsubscribe = subscribeToEngine(refresh);
    // Tracks appear asynchronously as the manifest and media parse, so poll
    // briefly after attach rather than assuming they are ready immediately.
    const timer = setInterval(refresh, 2000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [refresh]);

  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [openMenu]);

  const apply = (
    menu: 'audio' | 'subtitles' | 'quality',
    id: string | null,
  ) => {
    const engine = getActiveEngine();
    const video = document.querySelector('video');
    if (!engine) return;
    if (menu === 'audio' && id) selectAudioTrack(video, engine.kind, engine.handle, id);
    if (menu === 'subtitles') selectSubtitleTrack(video, engine.kind, engine.handle, id);
    if (menu === 'quality' && id) selectQualityLevel(engine.kind, engine.handle, id);
    setOpenMenu(null);
    setTimeout(refresh, 150);
  };

  const hasAudio = tracks.audio.length > 1;
  const hasSubtitles = tracks.subtitles.length > 0;
  const hasQuality = tracks.quality.length > 1;
  if (!hasAudio && !hasSubtitles && !hasQuality) return null;

  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {hasAudio ? (
        <MenuButton
          label="Audio track"
          icon={<Icon name="iptv-audio" size={16} />}
          open={openMenu === 'audio'}
          onToggle={() => setOpenMenu(openMenu === 'audio' ? null : 'audio')}
          options={tracks.audio}
          onSelect={(id) => apply('audio', id)}
          compact={compact}
        />
      ) : null}

      {hasSubtitles ? (
        <MenuButton
          label="Subtitles"
          icon={<Icon name="iptv-subtitles" size={16} />}
          open={openMenu === 'subtitles'}
          onToggle={() => setOpenMenu(openMenu === 'subtitles' ? null : 'subtitles')}
          options={[
            { id: '__off__', label: 'Off', active: !tracks.subtitles.some((t) => t.active) },
            ...tracks.subtitles,
          ]}
          onSelect={(id) => apply('subtitles', id === '__off__' ? null : id)}
          compact={compact}
          active={tracks.subtitles.some((t) => t.active)}
        />
      ) : null}

      {hasQuality ? (
        <MenuButton
          label="Quality"
          icon={<Icon name="iptv-quality" size={16} />}
          open={openMenu === 'quality'}
          onToggle={() => setOpenMenu(openMenu === 'quality' ? null : 'quality')}
          options={tracks.quality}
          onSelect={(id) => apply('quality', id)}
          compact={compact}
        />
      ) : null}
    </div>
  );
}

function MenuButton({
  label,
  icon,
  open,
  onToggle,
  options,
  onSelect,
  compact,
  active,
}: {
  label: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  options: TrackOption[];
  onSelect: (id: string) => void;
  compact?: boolean;
  active?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        data-focusable=""
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={onToggle}
        className={cn(
          'tv-focus grid place-items-center rounded-full focus:shadow-focus',
          compact ? 'h-8 w-8' : 'h-9 w-9',
          active ? 'text-accent' : 'text-ink-soft hover:bg-white/10 hover:text-ink',
        )}
      >
        {icon}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={label}
          className="absolute bottom-full right-0 z-20 mb-2 max-h-64 w-52 overflow-y-auto rounded-card border border-line bg-surface-2/95 py-1 shadow-lift backdrop-blur"
        >
          <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-ink-faint">{label}</p>
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitemradio"
              aria-checked={option.active}
              data-focusable=""
              onClick={() => onSelect(option.id)}
              className={cn(
                'tv-focus flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs focus:shadow-focus',
                option.active ? 'text-accent' : 'text-ink-soft hover:bg-surface-3 hover:text-ink',
              )}
            >
              <span className="truncate">{option.label}</span>
              {option.active ? <Icon name="iptv-check" size={14} className="shrink-0" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
