'use client';

import { create } from 'zustand';
import type { ConnectionStatus, Playlist } from '@streamwise/core';
import { api } from '@/lib/api/client';

interface PlaylistState {
  playlists: Playlist[];
  activePlaylistId: string | null;
  loaded: boolean;
  loading: boolean;
  error: string | null;

  active: () => Playlist | null;
  status: () => ConnectionStatus | 'no-playlist';
  load: () => Promise<void>;
  refreshActive: () => Promise<void>;
  setActive: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const usePlaylistStore = create<PlaylistState>((set, get) => ({
  playlists: [],
  activePlaylistId: null,
  loaded: false,
  loading: false,
  error: null,

  active: () => {
    const { playlists, activePlaylistId } = get();
    return playlists.find((p) => p.id === activePlaylistId) ?? playlists[0] ?? null;
  },

  status: () => get().active()?.status ?? 'no-playlist',

  load: async () => {
    set({ loading: true, error: null });
    try {
      const { playlists, activePlaylistId } = await api.playlists();
      set({ playlists, activePlaylistId, loaded: true, loading: false });
    } catch (err) {
      set({
        loading: false,
        loaded: true,
        error: err instanceof Error ? err.message : 'Playlists could not be loaded.',
      });
    }
  },

  refreshActive: async () => {
    const active = get().active();
    if (!active) return;
    set({ loading: true, error: null });
    try {
      await api.refresh(active.id);
      await get().load();
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'The playlist could not be refreshed.',
      });
    }
  },

  setActive: async (id) => {
    await api.setActivePlaylist(id);
    set({ activePlaylistId: id });
  },

  remove: async (id) => {
    await api.deletePlaylist(id);
    await get().load();
  },
}));
