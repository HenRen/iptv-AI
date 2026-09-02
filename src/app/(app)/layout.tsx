'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { MobileNav, Sidebar } from '@/components/navigation/Sidebar';
import { PlayerHost } from '@/components/player/PlayerHost';
import { AskTV } from '@/components/ai/AskTV';
import { usePlaylistStore } from '@/stores/playlistStore';
import { usePlayerStore } from '@/stores/playerStore';
import { useUserStore } from '@/stores/userStore';
import { useAiStore } from '@/stores/aiStore';
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

  /**
   * How many in-app navigations deep we are. Escape/Back must never walk the
   * user out of the application into whatever page preceded it, which is what
   * a bare router.back() does when the app was opened directly on a route.
   */
  const depth = useRef(0);
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (pathname !== lastPath.current) {
      depth.current += 1;
      lastPath.current = pathname;
    }
  }, [pathname]);
  const toggleAssistant = useAiStore((s) => s.toggleAssistant);

  useEffect(() => {
    void load();
  }, [load]);

  // Ask TV opens on a single key, the way a voice button on a remote would.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true;
      if (typing) return;
      if (event.key === '/' || (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey))) {
        event.preventDefault();
        toggleAssistant();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleAssistant]);

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
        // Watching Live TV with no previous channel: Back has nothing to undo
        // here, and must not interrupt playback or leave the app.
        return;
      }

      if (depth.current > 0) {
        depth.current -= 1;
        router.back();
        return;
      }
      // Nowhere to go back to inside the app — Home is the floor.
      if (pathname !== '/home') router.push('/home');
    },
  });

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col pb-[58px] md:pb-0">{children}</div>
      <MobileNav />
      <PlayerHost />
      <AskTV />
    </div>
  );
}
