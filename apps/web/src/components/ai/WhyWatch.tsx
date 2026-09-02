'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { aiApi } from '@/lib/api/aiClient';
import { useAiStore } from '@/stores/aiStore';
import { Icon, Artwork, Focusable, Skeleton } from '@/components/common';

/**
 * AI 7 — programme and title explanations, plus similar content.
 *
 * Grounded strictly in metadata the provider supplied. When there is none,
 * it says so — it does not write a plausible synopsis, because a confident
 * invented plot is worse than an honest blank.
 */
export function WhyWatch({
  contentId,
  kind,
}: {
  contentId: string;
  kind: 'movie' | 'series';
}) {
  const enabled = useAiStore((s) => s.prefs.enabled);
  const router = useRouter();

  const [summary, setSummary] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [similar, setSimilar] = useState<Array<{ id: string; name: string; poster: string | null }>>(
    [],
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    aiApi
      .explain(contentId)
      .then((res) => {
        if (cancelled) return;
        setSummary(res.summary);
        setReason(res.reason);
        setSimilar(res.similar);
      })
      .catch(() => {
        if (!cancelled) {
          setSummary(null);
          setSimilar([]);
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [contentId, enabled]);

  if (!enabled) return null;

  if (loading) {
    return (
      <div className="mt-6 space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  const nothing = !summary && similar.length === 0;
  if (nothing) return null;

  return (
    <div className="mt-6 space-y-5">
      {summary ? (
        <div className="rounded-card border border-line bg-surface-2/40 p-4">
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-ink-faint">
            <Icon name="iptv-ai" size={12} className="text-accent" />
            Why watch
          </p>
          <p className="text-sm leading-relaxed text-ink-soft">{summary}</p>
        </div>
      ) : reason === 'insufficient-metadata' ? (
        <p className="text-xs text-ink-faint">
          Your provider supplied too little information about this title to summarize.
        </p>
      ) : null}

      {similar.length > 0 ? (
        <div>
          <p className="mb-2 text-[11px] uppercase tracking-wider text-ink-faint">
            Similar in your playlist
          </p>
          <div className="rail-scroll flex gap-2.5 overflow-x-auto pb-1">
            {similar.map((item) => (
              <Focusable
                key={item.id}
                onClick={() =>
                  router.push(
                    `${kind === 'movie' ? '/movies' : '/series'}?id=${encodeURIComponent(item.id)}`,
                  )
                }
                aria-label={item.name}
                className="w-[92px] shrink-0"
                bare
              >
                <span className="block overflow-hidden rounded-tile border border-line bg-surface-1">
                  <span className="block aspect-[2/3]">
                    <Artwork src={item.poster} alt={item.name} kind={kind} className="h-full w-full" />
                  </span>
                </span>
                <span className="mt-1 line-clamp-2 block text-[11px] leading-tight text-ink-mute">
                  {item.name}
                </span>
              </Focusable>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
