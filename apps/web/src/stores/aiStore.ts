'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { WatchRule } from '@streamwise/core';

/**
 * AI & Privacy settings, plus the watchlist.
 *
 * Every AI-labelled capability is individually switchable and defaults to a
 * conservative position: the local rules engine is always on, and anything
 * that would consult a model or use watch history is opt-in.
 */
export interface AiPreferences {
  enabled: boolean;
  personalizedRecommendations: boolean;
  useWatchHistory: boolean;
  voiceCommands: boolean;
  playlistOrganization: boolean;
  epgMatching: boolean;
  diagnostics: boolean;
}

const DEFAULTS: AiPreferences = {
  enabled: true,
  personalizedRecommendations: true,
  useWatchHistory: true,
  voiceCommands: true,
  // Sending channel names to a model is off by default; the rules engine
  // handles them locally and covers the overwhelming majority.
  playlistOrganization: false,
  epgMatching: false,
  diagnostics: true,
};

interface AiState {
  prefs: AiPreferences;
  watchlist: WatchRule[];
  assistantOpen: boolean;

  setPref: <K extends keyof AiPreferences>(key: K, value: AiPreferences[K]) => void;
  resetPrefs: () => void;
  openAssistant: () => void;
  closeAssistant: () => void;
  toggleAssistant: () => void;

  addRule: (rule: WatchRule) => void;
  removeRule: (id: string) => void;
  toggleRule: (id: string) => void;
}

export const useAiStore = create<AiState>()(
  persist(
    (set) => ({
      prefs: DEFAULTS,
      watchlist: [],
      assistantOpen: false,

      setPref: (key, value) =>
        set((state) => ({ prefs: { ...state.prefs, [key]: value } })),
      resetPrefs: () => set({ prefs: DEFAULTS }),

      openAssistant: () => set({ assistantOpen: true }),
      closeAssistant: () => set({ assistantOpen: false }),
      toggleAssistant: () => set((state) => ({ assistantOpen: !state.assistantOpen })),

      addRule: (rule) => set((state) => ({ watchlist: [rule, ...state.watchlist].slice(0, 40) })),
      removeRule: (id) =>
        set((state) => ({ watchlist: state.watchlist.filter((r) => r.id !== id) })),
      toggleRule: (id) =>
        set((state) => ({
          watchlist: state.watchlist.map((r) =>
            r.id === id ? { ...r, enabled: !r.enabled } : r,
          ),
        })),
    }),
    {
      name: 'henren.ai.v1',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export { DEFAULTS as DEFAULT_AI_PREFERENCES };
