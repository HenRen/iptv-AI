'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * §18 — Parental control.
 *
 * Design notes worth stating plainly:
 *
 *  - The PIN is stored as a salted SHA-256 hash, not in the clear. This is a
 *    local-convenience lock, not a security boundary — anyone with devtools
 *    access to this browser can bypass it, and the UI says so rather than
 *    implying otherwise.
 *  - Adult content is filtered out server-side by default, before it reaches
 *    the client at all. This store governs *unlocking* it and hiding
 *    additional categories, not whether the filter exists.
 *  - Provider category names are never surfaced on Home until they have been
 *    classified, so an unclassified adult category cannot leak a title.
 */

interface ParentalState {
  /** null until the user sets one. */
  pinHash: string | null;
  /** Category ids the user chose to hide, per playlist. */
  hiddenCategories: Record<string, string[]>;
  /** Show adult-classified content once unlocked. */
  allowAdult: boolean;
  /** Session-only: cleared on reload, never persisted. */
  unlocked: boolean;

  setPin: (pin: string) => Promise<void>;
  clearPin: (pin: string) => Promise<boolean>;
  verify: (pin: string) => Promise<boolean>;
  lock: () => void;
  setAllowAdult: (allow: boolean) => void;
  toggleCategory: (playlistId: string, categoryId: string) => void;
  isHidden: (playlistId: string, categoryId: string) => boolean;
  hiddenFor: (playlistId: string) => string[];
}

const SALT = 'henren-parental-v1';

/**
 * Mirror the choice to the server. Filtering there means adult and hidden
 * content is never serialized into a response at all — "not sent", not merely
 * "not rendered". Failure is non-fatal: the client-side state still holds.
 */
async function sync(payload: { hiddenCategories?: string[]; allowAdult?: boolean }) {
  try {
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // Offline or no playlist yet; the next change re-syncs.
  }
}

async function hash(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`${SALT}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export const useParentalStore = create<ParentalState>()(
  persist(
    (set, get) => ({
      pinHash: null,
      hiddenCategories: {},
      allowAdult: false,
      unlocked: false,

      setPin: async (pin) => {
        set({ pinHash: await hash(pin), unlocked: true });
      },

      clearPin: async (pin) => {
        const current = get().pinHash;
        if (current && (await hash(pin)) !== current) return false;
        set({ pinHash: null, unlocked: false, allowAdult: false });
        void sync({ allowAdult: false });
        return true;
      },

      verify: async (pin) => {
        const current = get().pinHash;
        if (!current) return false;
        const ok = (await hash(pin)) === current;
        if (ok) set({ unlocked: true });
        return ok;
      },

      lock: () => {
        set({ unlocked: false, allowAdult: false });
        void sync({ allowAdult: false });
      },

      setAllowAdult: (allow) => {
        // Turning the filter off requires an unlocked session when a PIN
        // exists; turning it back on is always permitted.
        if (allow && get().pinHash && !get().unlocked) return;
        set({ allowAdult: allow });
        void sync({ allowAdult: allow });
      },

      toggleCategory: (playlistId, categoryId) =>
        set((state) => {
          const current = state.hiddenCategories[playlistId] ?? [];
          const next = current.includes(categoryId)
            ? current.filter((id) => id !== categoryId)
            : [...current, categoryId];
          void sync({ hiddenCategories: next });
          return { hiddenCategories: { ...state.hiddenCategories, [playlistId]: next } };
        }),

      isHidden: (playlistId, categoryId) =>
        (get().hiddenCategories[playlistId] ?? []).includes(categoryId),

      hiddenFor: (playlistId) => get().hiddenCategories[playlistId] ?? [],
    }),
    {
      name: 'henren.parental.v1',
      storage: createJSONStorage(() => localStorage),
      // `unlocked` is deliberately absent: a reload always re-locks.
      partialize: (state) => ({
        pinHash: state.pinHash,
        hiddenCategories: state.hiddenCategories,
        allowAdult: state.allowAdult,
      }),
    },
  ),
);
