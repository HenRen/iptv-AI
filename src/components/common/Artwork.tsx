'use client';

import { useState } from 'react';
import { Clapperboard, Radio, Tv } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * Provider artwork with a designed fallback.
 *
 * Logos and posters from IPTV providers are missing, broken or plain HTTP
 * often enough that the fallback is the common case, not the edge case — so
 * it is a deliberate piece of design rather than a grey box, and it always
 * occupies exactly the same space as a loaded image would.
 */

interface ArtworkProps {
  src: string | null | undefined;
  alt: string;
  kind?: 'channel' | 'movie' | 'series';
  className?: string;
  imgClassName?: string;
}

function initials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Stable hue per title so a wall of fallbacks still looks composed. */
function hueOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  // Bias toward the blue half of the wheel to stay inside the palette.
  return 190 + (h % 80);
}

export function Artwork({ src, alt, kind = 'channel', className, imgClassName }: ArtworkProps) {
  const [failed, setFailed] = useState(false);
  const showFallback = !src || failed;

  if (showFallback) {
    const hue = hueOf(alt);
    const Icon = kind === 'channel' ? Tv : kind === 'series' ? Radio : Clapperboard;
    return (
      <div
        className={cn(
          'flex items-center justify-center overflow-hidden bg-surface-2 text-ink-soft',
          className,
        )}
        style={{
          backgroundImage: `linear-gradient(150deg, hsl(${hue} 42% 18%), hsl(${hue + 18} 38% 11%))`,
        }}
        aria-label={alt}
      >
        {kind === 'channel' ? (
          <span className="flex flex-col items-center gap-1">
            <span className="text-[0.95em] font-semibold tracking-wide">{initials(alt)}</span>
            <Icon className="h-3 w-3 opacity-45" aria-hidden />
          </span>
        ) : (
          <Icon className="h-1/4 w-1/4 opacity-35" aria-hidden />
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
