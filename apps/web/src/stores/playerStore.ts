'use client';

import { create } from 'zustand';
import type { Channel, PlaybackSource } from '@streamwise/core';
import { api } from '@/lib/api/client';

/**
 * Playback state, held above the router so audio and video survive navigation.
 *
 * This is what makes "browse the guide while the channel keeps playing" work:
 * the <video> element lives in a single persistent host in the app shell, and
 * screens only change how it is presented (mini / inline / fullscreen).
 */

export type PlayerMode = 'hidden' | 'mini' | 'inline' | 'fullscreen';

export interface NowPlaying {
  kind: 'live' | 'movie' | 'episode';
  id: string;
  title: string;
  subtitle: string | null;
  logo: string | null;
  /** Live only. */
  channelNumber?: number;
  seriesId?: string;
}

interface PlayerState {
  source: PlaybackSource | null;
  nowPlaying: NowPlaying | null;
  mode: PlayerMode;
  playing: boolean;
  muted: boolean;
  volume: number;
  /** Non-null while a stream is being resolved or buffered. */
  loading: boolean;
  error: string | null;
  /** Channel list the player uses for up/down zapping. */
  zapList: Channel[];
  /** Transient channel banner shown for ~3s after a zap. */
  banner: { channel: Channel; at: number } | null;
  /** Position for VOD resume; seconds. */
  resumeAt: number | null;

  playChannel: (channel: Channel, opts?: { mode?: PlayerMode; zapList?: Channel[] }) => Promise<void>;
  playVod: (
    kind: 'movie' | 'episode',
    id: string,
    meta: { title: string; subtitle?: string | null; poster?: string | null; seriesId?: string },
    resumeAt?: number,
  ) => Promise<void>;
  setZapList: (channels: Channel[]) => void;
  zap: (direction: 1 | -1) => Promise<void>;
  setMode: (mode: PlayerMode) => void;
  setPlaying: (playing: boolean) => void;
  toggleMute: () => void;
  setVolume: (volume: number) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearBanner: () => void;
  stop: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  source: null,
  nowPlaying: null,
  mode: 'hidden',
  playing: false,
  muted: false,
  volume: 1,
  loading: false,
  error: null,
  zapList: [],
  banner: null,
  resumeAt: null,

  playChannel: async (channel, opts) => {
    const { zapList } = get();
    set({
      loading: true,
      error: null,
      resumeAt: null,
      nowPlaying: {
        kind: 'live',
        id: channel.id,
        title: channel.name,
        subtitle: channel.categoryName,
        logo: channel.logo,
        channelNumber: channel.number,
      },
      mode: opts?.mode ?? (get().mode === 'hidden' ? 'inline' : get().mode),
      zapList: opts?.zapList ?? zapList,
      banner: { channel, at: Date.now() },
    });
    try {
      const source = await api.play('live', channel.id);
      set({ source, playing: true });
    } catch (err) {
      set({
        source: null,
        loading: false,
        error: err instanceof Error ? err.message : 'This channel could not be started.',
      });
    }
  },

  playVod: async (kind, id, meta, resumeAt) => {
    set({
      loading: true,
      error: null,
      resumeAt: resumeAt ?? null,
      nowPlaying: {
        kind,
        id,
        title: meta.title,
        subtitle: meta.subtitle ?? null,
        logo: meta.poster ?? null,
        seriesId: meta.seriesId,
      },
      mode: 'fullscreen',
      banner: null,
    });
    try {
      const source = await api.play(kind, id);
      set({ source, playing: true });
    } catch (err) {
      set({
        source: null,
        loading: false,
        error: err instanceof Error ? err.message : 'This title could not be started.',
      });
    }
  },

  setZapList: (channels) => set({ zapList: channels }),

  zap: async (direction) => {
    const { zapList, nowPlaying, playChannel } = get();
    if (zapList.length === 0 || nowPlaying?.kind !== 'live') return;
    const index = zapList.findIndex((c) => c.id === nowPlaying.id);
    const nextIndex = index === -1 ? 0 : (index + direction + zapList.length) % zapList.length;
    await playChannel(zapList[nextIndex]);
  },

  setMode: (mode) => set({ mode }),
  setPlaying: (playing) => set({ playing }),
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)), muted: volume === 0 }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
  clearBanner: () => set({ banner: null }),
  stop: () =>
    set({
      source: null,
      nowPlaying: null,
      mode: 'hidden',
      playing: false,
      loading: false,
      error: null,
      banner: null,
      resumeAt: null,
    }),
}));
