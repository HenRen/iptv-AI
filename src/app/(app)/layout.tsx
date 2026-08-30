'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { MobileNav, Sidebar } from '@/components/navigation/Sidebar';
import { PlayerHost } from '@/components/player/PlayerHost';
import { usePlaylistStore } from '@/stores/playlistStore';
import { usePlayerStore } from '@/stores/playerStore';
import { useUserStore } from '@/stores/userStore';
import { useSpatialNavigation } from '@/hooks/useSpatialNavigation';
import { api } from '@/lib/api/client';

/**
 * Application shell.
 *
 * Owns the three things that must outlive any single screen: the playlist
 * connection, the video element, and the global remote-control key handling.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const load = usePlaylistStore((s) => s.load);
  const loaded = usePlaylistStore((s) => s.loaded);
  const playlists = usePlaylistStore((s) => s.playlists);

  const mode = usePlayerStore((s) => s.mode);
  const playing = usePlayerStore((s) => s.playing);
  const setMode = usePlayerStore((s) => s.setMode);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const zap = usePlayerStore((s) => s.zap);
  const nowPlaying = usePlayerStore((s) => s.nowPlaying);
  const playChannel = usePlayerStore((s) => s.playChannel);

  const previousChannelId = useUserStore((s) => s.previousChannelId);

  useEffect(() => {
    void load();
  }, [load]);

  // No playlist configured yet — the app has nothing to show.
  useEffect(() => {
    if (loaded && playlists.length === 0) router.replace('/welcome');
  }, [loaded, playlists.length, router]);

  useSpatialNavigation({
    onChannelUp: () => void zap(1),
    onChannelDown: () => void zap(-1),
    onPlayPause: () => setPlaying(!playing),
    onBack: () => {
      // Fullscreen collapses first; then BACK on Live TV means "last channel",
      // which is the behaviour every set-top box has trained people to expect.
      if (mode === 'fullscreen') {
        setMode('inline');
        return;
      }
      if (pathname === '/live' && nowPlaying?.kind === 'live') {
        const previous = previousChannelId();
        if (previous) {
          void api
            .channelsByIds([previous])
            .then((page) => page.items[0] && playChannel(page.items[0]));
          return;
        }
      }
      router.back();
    },
  });

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col pb-[58px] md:pb-0">{children}</div>
      <MobileNav />
      <PlayerHost />
    </div>
  );
}
