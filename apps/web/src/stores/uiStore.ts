'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  DEFAULT_COLOR_KEYS,
  type ColorKey,
  type ColorKeyAction,
} from '@/lib/ui/colorKeys';

/**
 * Shell-level UI state: the quick-action overlay, the error dialog, and the
 * remote's colour-key assignments.
 *
 * Quick actions and errors live here rather than in a screen because both are
 * raised from anywhere — a long-press on Live TV, a playback failure while
 * the user is browsing the guide — and must render above whatever is on.
 */

export type QuickActionTarget =
  | { kind: 'channel'; id: string; title: string; subtitle?: string | null; logo?: string | null; number?: number }
  | { kind: 'program'; id: string; title: string; subtitle?: string | null; channelId: string; start?: number; stop?: number };

export type ErrorKind = 'stream' | 'conn' | 'auth';

interface UiState {
  quickAction: QuickActionTarget | null;
  errorDialog: ErrorKind | null;
  colorKeys: Record<ColorKey, ColorKeyAction>;

  openQuickAction: (target: QuickActionTarget) => void;
  closeQuickAction: () => void;
  showError: (kind: ErrorKind) => void;
  dismissError: () => void;
  setColorKey: (key: ColorKey, action: ColorKeyAction) => void;
  resetColorKeys: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      quickAction: null,
      errorDialog: null,
      colorKeys: DEFAULT_COLOR_KEYS,

      openQuickAction: (target) => set({ quickAction: target }),
      closeQuickAction: () => set({ quickAction: null }),
      showError: (kind) => set({ errorDialog: kind }),
      dismissError: () => set({ errorDialog: null }),
      setColorKey: (key, action) =>
        set((state) => ({ colorKeys: { ...state.colorKeys, [key]: action } })),
      resetColorKeys: () => set({ colorKeys: DEFAULT_COLOR_KEYS }),
    }),
    {
      name: 'henren.ui.v1',
      storage: createJSONStorage(() => localStorage),
      // Overlays are transient; only the key mapping is worth persisting.
      partialize: (state) => ({ colorKeys: state.colorKeys }),
    },
  ),
);
