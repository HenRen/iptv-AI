import type { AttachedEngine } from './engine';

/**
 * A module-scoped reference to the currently attached engine.
 *
 * Deliberately not in the Zustand store: an hls.js or mpegts.js instance is a
 * large mutable object with its own event loop, and putting it in reactive
 * state causes needless re-renders and makes React DevTools unusable. The
 * player controls only need it to enumerate and switch tracks, which is an
 * imperative operation on a live object.
 */
let current: AttachedEngine | null = null;
const listeners = new Set<() => void>();

export function setActiveEngine(engine: AttachedEngine | null): void {
  current = engine;
  for (const listener of listeners) listener();
}

export function getActiveEngine(): AttachedEngine | null {
  return current;
}

/** Notified whenever the attached engine changes, so menus can refresh. */
export function subscribeToEngine(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
