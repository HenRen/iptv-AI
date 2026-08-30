'use client';

import { useEffect } from 'react';

/**
 * Geometric spatial navigation for remote controls and keyboards.
 *
 * Rather than relying on DOM order (which is wrong the moment a layout has a
 * sidebar next to a grid), arrow keys pick the nearest focusable element in
 * the pressed direction, weighting alignment over raw distance — the same
 * model TV platforms use, so muscle memory transfers.
 *
 * Any element with `data-focusable` participates. Containers can opt out of
 * an axis with `data-nav-trap="horizontal" | "vertical"` (used by the guide
 * grid and channel list, which handle that axis themselves).
 */

type Direction = 'up' | 'down' | 'left' | 'right';

const KEY_TO_DIRECTION: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

function isVisible(el: HTMLElement): boolean {
  if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  return (
    rect.bottom > -1 &&
    rect.right > -1 &&
    rect.top < window.innerHeight + 1 &&
    rect.left < window.innerWidth + 1
  );
}

function center(rect: DOMRect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** Lower is better. Returns null when the candidate is not in `direction`. */
function cost(from: DOMRect, to: DOMRect, direction: Direction): number | null {
  const a = center(from);
  const b = center(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  // Must make real progress along the axis, with a small tolerance so
  // near-aligned rows do not fight each other.
  const TOL = 4;
  switch (direction) {
    case 'up':
      if (to.bottom > from.top - TOL) return null;
      return -dy + Math.abs(dx) * 2;
    case 'down':
      if (to.top < from.bottom + TOL) return null;
      return dy + Math.abs(dx) * 2;
    case 'left':
      if (to.right > from.left - TOL) return null;
      return -dx + Math.abs(dy) * 2;
    case 'right':
      if (to.left < from.right + TOL) return null;
      return dx + Math.abs(dy) * 2;
  }
}

export function focusablesIn(root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-focusable]')).filter(isVisible);
}

export function moveFocus(direction: Direction): boolean {
  const current = document.activeElement as HTMLElement | null;
  const candidates = focusablesIn();
  if (candidates.length === 0) return false;

  if (!current || !current.hasAttribute('data-focusable')) {
    candidates[0].focus();
    return true;
  }

  const trap = current.closest<HTMLElement>('[data-nav-trap]')?.dataset.navTrap;
  if (
    (trap === 'horizontal' && (direction === 'left' || direction === 'right')) ||
    (trap === 'vertical' && (direction === 'up' || direction === 'down'))
  ) {
    return false;
  }

  const from = current.getBoundingClientRect();
  let best: HTMLElement | null = null;
  let bestCost = Infinity;

  for (const candidate of candidates) {
    if (candidate === current) continue;
    const c = cost(from, candidate.getBoundingClientRect(), direction);
    if (c === null || c >= bestCost) continue;
    bestCost = c;
    best = candidate;
  }

  if (!best) return false;
  best.focus();
  best.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  return true;
}

export interface SpatialNavOptions {
  /** Called for Escape / Backspace / browser Back key. */
  onBack?: () => void;
  onChannelUp?: () => void;
  onChannelDown?: () => void;
  onPlayPause?: () => void;
  enabled?: boolean;
}

export function useSpatialNavigation({
  onBack,
  onChannelUp,
  onChannelDown,
  onPlayPause,
  enabled = true,
}: SpatialNavOptions = {}) {
  useEffect(() => {
    if (!enabled) return;

    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true;

      // Media keys present on most TV remotes.
      if (event.key === 'MediaPlayPause' || (event.key === ' ' && !typing)) {
        if (onPlayPause) {
          event.preventDefault();
          onPlayPause();
        }
        return;
      }
      if (event.key === 'ChannelUp' || event.key === 'PageUp') {
        if (onChannelUp) {
          event.preventDefault();
          onChannelUp();
        }
        return;
      }
      if (event.key === 'ChannelDown' || event.key === 'PageDown') {
        if (onChannelDown) {
          event.preventDefault();
          onChannelDown();
        }
        return;
      }
      if (event.key === 'Escape' || event.key === 'Backspace' || event.key === 'BrowserBack') {
        if (typing && event.key === 'Backspace') return;
        if (onBack) {
          event.preventDefault();
          onBack();
        }
        return;
      }

      const direction = KEY_TO_DIRECTION[event.key];
      if (!direction) return;
      // Let text fields own left/right for caret movement.
      if (typing && (direction === 'left' || direction === 'right')) return;

      if (moveFocus(direction)) event.preventDefault();
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, onBack, onChannelDown, onChannelUp, onPlayPause]);
}

/** Focus the first focusable inside a container — used when a screen mounts. */
export function focusFirst(root: ParentNode | null) {
  if (!root) return;
  const first = focusablesIn(root)[0];
  first?.focus();
}
