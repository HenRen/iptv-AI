'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Favorite, FavoriteKind, PlaybackProgress, WatchHistoryEntry } from '@/types';

/**
 * Per-user state: favorites, channel history, playback progress.
 *
 * Persisted to localStorage for v1 and namespaced under a single key, so
 * moving it behind a `/api/user` endpoint backed by PostgreSQL later is a
 * change to `storage` here plus a hydrate call — the component API is
 * already account-shaped (everything is keyed, nothing is positional).
 */

const RECENT_CHANNEL_LIMIT = 20;
const HISTORY_LIMIT = 60;
const COMPLETE_THRESHOLD = 0.9;

interface UserState {
  favorites: Favorite[];
  recentChannelIds: string[];
  history: WatchHistoryEntry[];
  progress: Record<string, PlaybackProgress>;

  isFavorite: (kind: FavoriteKind, id: string) => boolean;
  toggleFavorite: (kind: FavoriteKind, id: string) => void;
  favoriteIds: (kind: FavoriteKind) => string[];

  pushRecentChannel: (channelId: string) => void;
  previousChannelId: () => string | null;

  recordWatch: (entry: Omit<WatchHistoryEntry, 'watchedAt'>) => void;

  saveProgress: (input: {
    kind: 'movie' | 'episode';
    contentId: string;
    seriesId?: string;
    positionSecs: number;
    durationSecs: number;
  }) => void;
  getProgress: (kind: 'movie' | 'episode', contentId: string) => PlaybackProgress | null;
  continueWatching: () => PlaybackProgress[];
  clearProgress: (kind: 'movie' | 'episode', contentId: string) => void;
}

const progressKey = (kind: string, id: string) => `${kind}:${id}`;

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      favorites: [],
      recentChannelIds: [],
      history: [],
      progress: {},

      isFavorite: (kind, id) => get().favorites.some((f) => f.kind === kind && f.id === id),

      toggleFavorite: (kind, id) =>
        set((state) => {
          const exists = state.favorites.some((f) => f.kind === kind && f.id === id);
          return {
            favorites: exists
              ? state.favorites.filter((f) => !(f.kind === kind && f.id === id))
              : [{ kind, id, addedAt: Date.now() }, ...state.favorites],
          };
        }),

      favoriteIds: (kind) =>
        get()
          .favorites.filter((f) => f.kind === kind)
          .sort((a, b) => b.addedAt - a.addedAt)
          .map((f) => f.id),

      pushRecentChannel: (channelId) =>
        set((state) => {
          if (state.recentChannelIds[0] === channelId) return state;
          const next = [channelId, ...state.recentChannelIds.filter((id) => id !== channelId)];
          return { recentChannelIds: next.slice(0, RECENT_CHANNEL_LIMIT) };
        }),

      /** The channel to jump back to on BACK — index 1, since 0 is current. */
      previousChannelId: () => get().recentChannelIds[1] ?? null,

      recordWatch: (entry) =>
        set((state) => {
          const next = [
            { ...entry, watchedAt: Date.now() },
            ...state.history.filter((h) => !(h.kind === entry.kind && h.id === entry.id)),
          ];
          return { history: next.slice(0, HISTORY_LIMIT) };
        }),

      saveProgress: ({ kind, contentId, seriesId, positionSecs, durationSecs }) =>
        set((state) => {
          if (!Number.isFinite(durationSecs) || durationSecs <= 0) return state;
          const key = progressKey(kind, contentId);
          const completed = positionSecs / durationSecs >= COMPLETE_THRESHOLD;
          return {
            progress: {
              ...state.progress,
              [key]: {
                key,
                contentId,
                seriesId,
                episodeId: kind === 'episode' ? contentId : undefined,
                positionSecs,
                durationSecs,
                updatedAt: Date.now(),
                completed,
              },
            },
          };
        }),

      getProgress: (kind, contentId) => get().progress[progressKey(kind, contentId)] ?? null,

      continueWatching: () =>
        Object.values(get().progress)
          .filter((p) => !p.completed && p.positionSecs > 30)
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, 20),

      clearProgress: (kind, contentId) =>
        set((state) => {
          const next = { ...state.progress };
          delete next[progressKey(kind, contentId)];
          return { progress: next };
        }),
    }),
    {
      name: 'henren.user.v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        favorites: state.favorites,
        recentChannelIds: state.recentChannelIds,
        history: state.history,
        progress: state.progress,
      }),
    },
  ),
);
