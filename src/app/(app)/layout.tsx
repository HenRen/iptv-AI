'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { MobileNav, Sidebar } from '@/components/navigation/Sidebar';
import { PlayerHost } from '@/components/player/PlayerHost';
import { AskTV } from '@/components/ai/AskTV';
import { QuickActions } from '@/components/overlays/QuickActions';
import { ErrorDialog } from '@/components/overlays/ErrorDialog';
import { usePlaylistStore } from '@/stores/playlistStore';
import { usePlayerStore } from '@/stores/playerStore';
import { useUserStore } from '@/stores/userStore';
import { useAiStore } from '@/stores/aiStore';
import { useUiStore } from '@/stores/uiStore';
import { useSpatialNavigation } from '@/hooks/useSpatialNavigation';
import { api } from '@/lib/api/client';
import { COLOR_KEY_ACTIONS, KEY_LETTER } from '@/lib/ui/colorKeys';

/**
 * Application shell.
 *
 * Owns the four things that must outlive any single screen: the playlist
 * connection, the video element, the overlays (Ask TV, Quick Actions, errors)
 * and all remote-control key handling.
 *
 * Long-press OK is handled here rather than per-screen: the 600ms hold is a
 * global gesture, and the screen only decides *what* the target is by putting
 * `data-qa-*` attributes on the focused element.
 */

const LONG_PRESS_MS = 600;

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
  const toggleAssistant = useAiStore((s) => s.toggleAssistant);
  const openAssistant = useAiStore((s) => s.openAssistant);

  const colorKeys = useUiStore((s) => s.colorKeys);
  const quickAction = useUiStore((s) => s.quickAction);
  const errorDialog = useUiStore((s) => s.errorDialog);
  const openQuickAction = useUiStore((s) => s.openQuickAction);
  const closeQuickAction = useUiStore((s) => s.closeQuickAction);
  const dismissError = useUiStore((s) => s.dismissError);

  /** In-app navigation depth — Back must never walk out of the application. */
  const depth = useRef(0);
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (pathname !== lastPath.current) {
      depth.current += 1;
      lastPath.current = pathname;
    }
  }, [pathname]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loaded && playlists.length === 0) router.replace('/welcome');
  }, [loaded, playlists.length, router]);

  /* ---------------- long-press OK → Quick Actions ---------------- */

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const readQuickTarget = useCallback(() => {
    const el = document.activeElement as HTMLElement | null;
    const host = el?.closest<HTMLElement>('[data-qa-kind]');
    if (!host) return null;
    const data = host.dataset;
    if (data.qaKind === 'channel') {
      return {
        kind: 'channel' as const,
        id: data.qaId ?? '',
        title: data.qaTitle ?? '',
        subtitle: data.qaSubtitle ?? null,
        logo: data.qaLogo ?? null,
        number: data.qaNumber ? Number(data.qaNumber) : undefined,
      };
    }
    if (data.qaKind === 'program') {
      return {
        kind: 'program' as const,
        id: data.qaId ?? '',
        title: data.qaTitle ?? '',
        subtitle: data.qaSubtitle ?? null,
        channelId: data.qaChannel ?? '',
        start: data.qaStart ? Number(data.qaStart) : undefined,
        stop: data.qaStop ? Number(data.qaStop) : undefined,
      };
    }
    return null;
  }, []);

  useEffect(() => {
    const isTyping = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      return (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el?.isContentEditable === true
      );
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;

      // OK held → Quick Actions.
      if (event.key === 'Enter' && !event.repeat) {
        didLongPress.current = false;
        if (holdTimer.current) clearTimeout(holdTimer.current);
        holdTimer.current = setTimeout(() => {
          const target = readQuickTarget();
          if (target) {
            didLongPress.current = true;
            openQuickAction(target);
          }
        }, LONG_PRESS_MS);
        return;
      }

      // Colour keys.
      const color = KEY_LETTER[event.key.toLowerCase()];
      if (color && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        const action = COLOR_KEY_ACTIONS[colorKeys[color]];
        if (action.href) router.push(action.href);
        else openAssistant();
        return;
      }

      // Ask TV.
      if (event.key === '/' || (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey))) {
        event.preventDefault();
        toggleAssistant();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== 'Enter') return;
      if (holdTimer.current) {
        clearTimeout(holdTimer.current);
        holdTimer.current = null;
      }
      // A completed long-press must not also fire the short-press click.
      if (didLongPress.current) {
        event.preventDefault();
        event.stopPropagation();
        didLongPress.current = false;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp, true);
      if (holdTimer.current) clearTimeout(holdTimer.current);
    };
  }, [colorKeys, openAssistant, openQuickAction, readQuickTarget, router, toggleAssistant]);

  /* ---------------- spatial navigation and Back ---------------- */

  useSpatialNavigation({
    onChannelUp: () => void zap(1),
    onChannelDown: () => void zap(-1),
    onPlayPause: () => setPlaying(!playing),
    onBack: () => {
      // Order per INTEGRATION.md §4: error → quick action → fullscreen →
      // last channel → history → home.
      if (errorDialog) {
        dismissError();
        return;
      }
      if (quickAction) {
        closeQuickAction();
        return;
      }
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
        // Nothing to undo, and Back must not interrupt playback.
        return;
      }
      if (depth.current > 0) {
        depth.current -= 1;
        router.back();
        return;
      }
      if (pathname !== '/home') router.push('/home');
    },
  });

  return (
    <div className="sw-ground flex h-dvh w-full overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col pb-[58px] md:pb-0">{children}</div>
      <MobileNav />
      <PlayerHost />
      <AskTV />
      <QuickActions />
      <ErrorDialog />
    </div>
  );
}
