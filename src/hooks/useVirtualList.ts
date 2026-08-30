'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Fixed-height list windowing.
 *
 * A real playlist has tens of thousands of channels; rendering them all is
 * the difference between a channel list that opens instantly and one that
 * locks the browser for eight seconds. Kept deliberately small and
 * dependency-free — fixed row heights are all a channel list needs.
 */
export interface VirtualListOptions {
  itemCount: number;
  itemHeight: number;
  /** Rows rendered beyond the viewport, so scrolling never shows blanks. */
  overscan?: number;
}

export interface VirtualListResult {
  scrollRef: (node: HTMLElement | null) => void;
  startIndex: number;
  endIndex: number;
  totalHeight: number;
  offsetY: number;
  scrollToIndex: (index: number, align?: 'start' | 'center' | 'nearest') => void;
}

export function useVirtualList({
  itemCount,
  itemHeight,
  overscan = 8,
}: VirtualListOptions): VirtualListResult {
  const nodeRef = useRef<HTMLElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const scrollRef = useCallback((node: HTMLElement | null) => {
    nodeRef.current = node;
    if (node) setViewportHeight(node.clientHeight);
  }, []);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;

    let frame = 0;
    const onScroll = () => {
      // Coalesce to one update per frame; scroll events fire far faster.
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setScrollTop(node.scrollTop);
      });
    };

    const observer = new ResizeObserver(() => setViewportHeight(node.clientHeight));
    observer.observe(node);
    node.addEventListener('scroll', onScroll, { passive: true });
    setViewportHeight(node.clientHeight);

    return () => {
      node.removeEventListener('scroll', onScroll);
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scrollRef]);

  const visible = Math.ceil((viewportHeight || 600) / itemHeight);
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(itemCount, startIndex + visible + overscan * 2);

  const scrollToIndex = useCallback(
    (index: number, align: 'start' | 'center' | 'nearest' = 'nearest') => {
      const node = nodeRef.current;
      if (!node) return;
      const top = index * itemHeight;
      const bottom = top + itemHeight;
      if (align === 'start') {
        node.scrollTo({ top, behavior: 'smooth' });
        return;
      }
      if (align === 'center') {
        node.scrollTo({ top: top - node.clientHeight / 2 + itemHeight / 2, behavior: 'smooth' });
        return;
      }
      if (top < node.scrollTop) node.scrollTo({ top, behavior: 'smooth' });
      else if (bottom > node.scrollTop + node.clientHeight) {
        node.scrollTo({ top: bottom - node.clientHeight, behavior: 'smooth' });
      }
    },
    [itemHeight],
  );

  return {
    scrollRef,
    startIndex,
    endIndex,
    totalHeight: itemCount * itemHeight,
    offsetY: startIndex * itemHeight,
    scrollToIndex,
  };
}
