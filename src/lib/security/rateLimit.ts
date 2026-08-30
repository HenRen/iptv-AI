import 'server-only';

/**
 * In-process token bucket. Enough for a self-hosted single-user deployment;
 * swap for Redis if this is ever fronted by more than one node.
 */
const buckets = new Map<string, { tokens: number; updatedAt: number }>();

export interface LimitConfig {
  /** Sustained requests per second. */
  rate: number;
  /** Burst size. */
  burst: number;
}

export function takeToken(key: string, { rate, burst }: LimitConfig): boolean {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: burst, updatedAt: now };
  const elapsed = (now - bucket.updatedAt) / 1000;
  bucket.tokens = Math.min(burst, bucket.tokens + elapsed * rate);
  bucket.updatedAt = now;

  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    return false;
  }
  bucket.tokens -= 1;
  buckets.set(key, bucket);

  // Opportunistic cleanup so the map cannot grow without bound.
  if (buckets.size > 5_000) {
    for (const [k, b] of buckets) {
      if (now - b.updatedAt > 60_000) buckets.delete(k);
    }
  }
  return true;
}

export const LIMITS = {
  /** Segment requests are frequent by nature — HLS pulls one every few seconds. */
  stream: { rate: 30, burst: 90 } satisfies LimitConfig,
  image: { rate: 40, burst: 200 } satisfies LimitConfig,
  api: { rate: 8, burst: 24 } satisfies LimitConfig,
  connect: { rate: 0.5, burst: 5 } satisfies LimitConfig,
};

export function clientKey(req: Request, scope: string): string {
  const fwd = req.headers.get('x-forwarded-for');
  const ip = fwd ? fwd.split(',')[0].trim() : 'local';
  return `${scope}:${ip}`;
}
