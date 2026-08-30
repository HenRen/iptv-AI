import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/security/crypto';
import { assertSafeUrl } from '@/lib/security/urlGuard';
import { LIMITS } from '@/lib/security/rateLimit';
import { allowedHosts } from '@/lib/iptv/playlists';
import { decodeToken } from '@/lib/iptv/streamSource';
import { limited } from '../_lib/respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Artwork proxy. Provider logos and posters are almost always plain HTTP and
 * frequently dead or very slow; going through the server keeps the page free
 * of mixed-content warnings and lets a broken image fail fast and quietly so
 * the UI can fall back rather than hang.
 */

const ALLOWED_TYPES = /^image\/(png|jpeg|jpg|gif|webp|avif|svg\+xml)$/i;
const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 8_000;

export async function GET(req: Request) {
  const rateLimited = limited(req, 'image', LIMITS.image);
  if (rateLimited) return rateLimited;

  const token = new URL(req.url).searchParams.get('t');
  if (!token) return new NextResponse(null, { status: 400 });

  const payload = verifyToken(token);
  if (!payload) return new NextResponse(null, { status: 403 });
  const decoded = decodeToken(payload);
  if (!decoded || decoded.target.type !== 'url') return new NextResponse(null, { status: 400 });

  let safe: URL;
  try {
    safe = await assertSafeUrl(decoded.target.url, { allowedHosts: await allowedHosts() });
  } catch {
    return new NextResponse(null, { status: 403 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const upstream = await fetch(safe, {
      signal: controller.signal,
      headers: { 'User-Agent': 'HENREN-IPTV/0.1', Accept: 'image/*' },
      redirect: 'follow',
    });
    if (!upstream.ok) return new NextResponse(null, { status: 404 });

    const type = upstream.headers.get('content-type') ?? '';
    if (!ALLOWED_TYPES.test(type.split(';')[0].trim())) {
      return new NextResponse(null, { status: 415 });
    }
    const length = Number(upstream.headers.get('content-length') ?? 0);
    if (length > MAX_BYTES) return new NextResponse(null, { status: 413 });

    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.byteLength > MAX_BYTES) return new NextResponse(null, { status: 413 });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'content-type': type,
        'cache-control': 'public, max-age=86400, immutable',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch {
    return new NextResponse(null, { status: 504 });
  } finally {
    clearTimeout(timer);
  }
}
