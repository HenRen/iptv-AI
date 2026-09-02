'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon, type IconName } from '@/components/icons';

/**
 * Provider artwork with a designed fallback.
 *
 * Logos and posters from IPTV providers are missing, broken or plain HTTP
 * often enough that the fallback is the common case, not the edge case — so
 * it is a deliberate piece of design rather than a grey box, and it always
 * occupies exactly the same space a loaded image would.
 *
 * The fallback gradient is derived from the title, so a wall of them looks
 * composed rather than random, and stays inside the cobalt/navy palette.
 */

interface ArtworkProps {
  src: string | null | undefined;
  alt: string;
  kind?: 'channel' | 'movie' | 'series' | 'sport';
  className?: string;
  imgClassName?: string;
}

const FALLBACK_ICON: Record<NonNullable<ArtworkProps['kind']>, IconName> = {
  channel: 'iptv-live',
  movie: 'iptv-movies',
  series: 'iptv-series',
  sport: 'iptv-sports',
};

function initials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Stable hue per title, biased to the blue half so it stays on-palette. */
function hueOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return 205 + (h % 55);
}

export function Artwork({ src, alt, kind = 'channel', className, imgClassName }: ArtworkProps) {
  const [failed, setFailed] = useState(false);
  const showFallback = !src || failed;

  if (showFallback) {
    const hue = hueOf(alt);
    return (
      <div
        className={cn('flex items-center justify-center overflow-hidden text-ink-soft', className)}
        style={{
          backgroundImage: `linear-gradient(155deg, hsl(${hue} 46% 17%), hsl(${hue + 14} 40% 10%))`,
        }}
        aria-label={alt}
      >
        {kind === 'channel' ? (
          <span className="flex flex-col items-center gap-1">
            <span className="text-[0.95em] font-bold tracking-wide">{initials(alt)}</span>
            <Icon name={FALLBACK_ICON[kind]} size={12} className="opacity-40" />
          </span>
        ) : (
          <Icon name={FALLBACK_ICON[kind]} size={28} className="opacity-30" />
        )}
      </div>
    );
  }

  return (
    // Provider artwork is arbitrary remote content proxied through /api/image;
    // next/image optimization buys nothing here and adds a failure mode.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn('h-full w-full object-cover', imgClassName)}
    />
  );
}
