import { NextResponse } from 'next/server';
import { XtreamError, redact } from '@/lib/iptv/xtream/client';
import { BlockedUrlError } from '@/lib/security/urlGuard';
import { clientKey, takeToken, type LimitConfig } from '@/lib/security/rateLimit';

/**
 * Shared route helpers.
 *
 * Every error that reaches a client passes through `fail()`, which redacts
 * anything that looks like a credential. No route is permitted to return a
 * raw exception message.
 */

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, { status: 200, ...init });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: redact(message) }, { status });
}

export function fromError(err: unknown) {
  if (err instanceof XtreamError) {
    const status = err.kind === 'auth-failed' ? 401 : err.kind === 'offline' ? 504 : 502;
    return fail(err.message, status);
  }
  if (err instanceof BlockedUrlError) return fail(err.message, 400);
  if (err instanceof Error) return fail(redact(err.message), 500);
  return fail('An unexpected error occurred.', 500);
}

export function limited(req: Request, scope: string, config: LimitConfig) {
  if (takeToken(clientKey(req, scope), config)) return null;
  return NextResponse.json({ error: 'Too many requests. Slow down and try again.' }, { status: 429 });
}

/**
 * Read a numeric query parameter.
 *
 * Note the explicit null/empty check: `Number(null)` is 0, not NaN, so a
 * naive `Number.isFinite` test silently turns every *absent* parameter into
 * zero — which reads as "limit: 0" and returns nothing at all.
 */
export function num(value: string | null | undefined, fallback: number): number {
  if (value == null || value.trim() === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
