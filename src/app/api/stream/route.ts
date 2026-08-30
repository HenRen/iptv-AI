import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/security/crypto';
import { assertSafeUrl, BlockedUrlError } from '@/lib/security/urlGuard';
import { LIMITS } from '@/lib/security/rateLimit';
import { allowedHostsFor, readSecret } from '@/lib/iptv/playlists';
import { XtreamClient } from '@/lib/iptv/xtream/client';
import { decodeToken } from '@/lib/iptv/streamSource';
import { rewriteManifest } from '@/lib/iptv/hls';
import { limited } from '../_lib/respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Credential-hiding, SSRF-guarded stream proxy.
 *
 *   browser  ->  /api/stream?t=<signed token>  ->  provider
 *
 * Why it exists:
 *   - the app may be served over HTTPS while the provider is plain HTTP
 *     (mixed content would otherwise block playback outright);
 *   - Xtream stream URLs contain the username and password in the path, and
 *     those must never reach the browser;
 *   - many providers reject cross-origin browser requests (no CORS headers).
 *
 * Why it is not an open proxy:
 *   - the target is derived from an HMAC-signed, expiring token this server
 *     minted; an arbitrary URL cannot be supplied by the caller;
 *   - the resolved host must belong to the referenced playlist;
 *   - DNS is re-resolved per request and private ranges are refused;
 *   - requests are rate limited per client.
 *
 * It deliberately does NOT decrypt, strip or work around any access control.
 * It forwards bytes for a stream the user's own provider has authorized.
 */

const PASS_THROUGH_HEADERS = [
  'content-type',
  'content-length',
  'accept-ranges',
  'content-range',
  'last-modified',
  'etag',
];

const HLS_TYPES = /(application\/(vnd\.apple\.)?mpegurl|audio\/mpegurl|application\/x-mpegurl)/i;

export async function GET(req: Request) {
  const rateLimited = limited(req, 'stream', LIMITS.stream);
  if (rateLimited) return rateLimited;

  const token = new URL(req.url).searchParams.get('t');
  if (!token) return new NextResponse('Missing token.', { status: 400 });

  const payload = verifyToken(token);
  if (!payload) return new NextResponse('This playback link has expired. Reopen the channel.', { status: 403 });

  const decoded = decodeToken(payload);
  if (!decoded) return new NextResponse('Malformed playback token.', { status: 400 });

  const { playlistId, target } = decoded;

  let upstreamUrl: string;
  if (target.type === 'url') {
    upstreamUrl = target.url;
  } else {
    const secret = await readSecret(playlistId);
    if (!secret) return new NextResponse('Playlist credentials are unavailable.', { status: 404 });
    if (secret.kind !== 'xtream') {
      return new NextResponse('This playlist does not use provider-built stream URLs.', { status: 400 });
    }
    const client = new XtreamClient({
      host: secret.host!,
      username: secret.username!,
      password: secret.password!,
    });
    const kind = target.kind === 'episode' ? 'series' : target.kind;
    upstreamUrl = client.streamUrl(kind, target.streamId, target.ext);
  }

  let safe: URL;
  try {
    const hosts = await allowedHostsFor(playlistId);
    safe = await assertSafeUrl(upstreamUrl, { allowedHosts: hosts });
  } catch (err) {
    const message = err instanceof BlockedUrlError ? err.message : 'This stream URL was refused.';
    return new NextResponse(message, { status: 403 });
  }

  const range = req.headers.get('range');
  const controller = new AbortController();
  // Abort the upstream fetch as soon as the client goes away, so a channel
  // zap does not leave a connection open against the provider's limit.
  req.signal.addEventListener('abort', () => controller.abort());

  let upstream: Response;
  try {
    upstream = await fetch(safe, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': process.env.HENREN_STREAM_USER_AGENT ?? 'VLC/3.0.20 LibVLC/3.0.20',
        Accept: '*/*',
        ...(range ? { Range: range } : {}),
      },
      cache: 'no-store',
    });
  } catch (err) {
    if (controller.signal.aborted) return new NextResponse(null, { status: 499 });
    return new NextResponse('The stream could not be reached.', { status: 504 });
  }

  if (upstream.status === 401 || upstream.status === 403) {
    return new NextResponse('The provider refused this stream. Your subscription may not include it.', {
      status: 403,
    });
  }
  if (!upstream.ok && upstream.status !== 206) {
    return new NextResponse(`The provider returned HTTP ${upstream.status} for this stream.`, {
      status: 502,
    });
  }

  const contentType = upstream.headers.get('content-type') ?? '';
  const looksHls = HLS_TYPES.test(contentType) || safe.pathname.endsWith('.m3u8');

  // An HLS manifest lists segment URLs that point straight at the provider.
  // Those must be rewritten through this same proxy, or the browser goes
  // direct — reintroducing both the mixed-content block and the credential
  // leak the proxy exists to prevent.
  if (looksHls) {
    const text = await upstream.text();
    const rewritten = rewriteManifest(text, safe, playlistId);
    return new NextResponse(rewritten, {
      status: 200,
      headers: {
        'content-type': 'application/vnd.apple.mpegurl',
        'cache-control': 'no-store',
      },
    });
  }

  const headers = new Headers();
  for (const name of PASS_THROUGH_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has('content-type')) headers.set('content-type', 'video/mp2t');
  headers.set('cache-control', 'no-store');

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
