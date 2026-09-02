'use client';

import { Icon } from '@/components/icons';
import { usePlayerStore } from '@/stores/playerStore';

/**
 * Mini-player chrome.
 *
 * The requirement it serves: browsing the guide or the channel list must not
 * stop what is playing. When a screen has no inline slot, the player shrinks
 * into the corner and keeps going.
 */
export function MiniPlayerChrome({ onExpand }: { onExpand: () => void }) {
  const nowPlaying = usePlayerStore((s) => s.nowPlaying);
  const playing = usePlayerStore((s) => s.playing);
  const muted = usePlayerStore((s) => s.muted);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const toggleMute = usePlayerStore((s) => s.toggleMute);
  const zap = usePlayerStore((s) => s.zap);
  const stop = usePlayerStore((s) => s.stop);

  if (!nowPlaying) return null;
  const isLive = nowPlaying.kind === 'live';

  return (
    <div className="absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-ground-deep/90 via-transparent to-ground-deep/60 opacity-0 transition-opacity focus-within:opacity-100 hover:opacity-100">
      <div className="flex items-start justify-between p-2">
        <div className="min-w-0 px-1">
          <p className="truncate text-xs font-semibold text-ink">{nowPlaying.title}</p>
          {nowPlaying.subtitle ? (
            <p className="truncate text-[10px] text-ink-mute">{nowPlaying.subtitle}</p>
          ) : null}
        </div>
        <MiniButton label="Close player" onClick={stop}>
          <Icon name="iptv-close" size={14} />
        </MiniButton>
      </div>

      <div className="flex items-center justify-center gap-1 p-2">
        {isLive ? (
          <MiniButton label="Previous channel" onClick={() => void zap(-1)}>
            <Icon name="iptv-ch-down" size={14} />
          </MiniButton>
        ) : null}
        <MiniButton label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying(!playing)}>
          {playing ? <Icon name="iptv-pause" size={16} /> : <Icon name="iptv-play" size={16} />}
        </MiniButton>
        {isLive ? (
          <MiniButton label="Next channel" onClick={() => void zap(1)}>
            <Icon name="iptv-ch-up" size={14} />
          </MiniButton>
        ) : null}
        <MiniButton label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute}>
          {muted ? <Icon name="iptv-mute" size={14} /> : <Icon name="iptv-volume" size={14} />}
        </MiniButton>
        <MiniButton label="Fullscreen" onClick={onExpand}>
          <Icon name="iptv-fullscreen" size={14} />
        </MiniButton>
      </div>
    </div>
  );
}

function MiniButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-focusable=""
      aria-label={label}
      title={label}
      onClick={onClick}
      className="tv-focus grid h-7 w-7 place-items-center rounded-full bg-black/50 text-ink-soft hover:bg-black/70 hover:text-ink focus:shadow-focus"
    >
      {children}
    </button>
  );
}
