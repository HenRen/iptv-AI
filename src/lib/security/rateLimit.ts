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

/**
 * Global scaling, so a deployment can loosen or tighten limits without
 * editing code — and so an end-to-end suite, which legitimately hammers these
 * endpoints far harder than a person does, can raise them rather than the
 * production defaults being weakened to make tests pass.
 *
 * `HENREN_RATE_LIMIT=off` disables limiting entirely (test environments only).
 */
const SCALE = (() => {
  const raw = process.env.HENREN_RATE_LIMIT;
  if (!raw) return 1;
  if (raw.toLowerCase() === 'off') return Infinity;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
})();

export function takeToken(key: string, { rate, burst }: LimitConfig): boolean {
  if (SCALE === Infinity) return true;
  rate *= SCALE;
  burst *= SCALE;
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
  /**
   * Catalog and EPG reads. Sized for the guide, which fires one batched
   * request per visible row-window: fast scrolling through a long channel
   * list legitimately produces a burst well above a handful of requests.
   */
  api: { rate: 25, burst: 80 } satisfies LimitConfig,
  /** Connecting or refreshing a playlist is expensive upstream, so it stays
   *  tight — but not so tight that a few corrections in a row lock you out. */
  connect: { rate: 1, burst: 10 } satisfies LimitConfig,
};

export function clientKey(req: Request, scope: string): string {
  const fwd = req.headers.get('x-forwarded-for');
  const ip = fwd ? fwd.split(',')[0].trim() : 'local';
  return `${scope}:${ip}`;
}
