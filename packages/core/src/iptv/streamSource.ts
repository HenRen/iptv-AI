import type { PlaybackSource, StreamKind } from '../types/index';
import { crypto } from '../ports/index';

/**
 * Builds the URL the browser is given in order to play something.
 *
 * Two shapes of token, both HMAC-signed and short-lived:
 *   entity: `e|<playlistId>|<kind>|<streamId>|<ext>` — server resolves it
 *           against the sealed credentials at request time.
 *   url:    `u|<playlistId>|<absoluteUrl>`           — used for M3U direct
 *           URLs and for HLS segments rewritten out of a manifest.
 *
 * A credential-bearing URL is therefore never constructed in, sent to, or
 * reconstructible by the browser.
 */

export function entityToken(
  playlistId: string,
  kind: StreamKind,
  streamId: string,
  ext: string,
): string {
  return crypto().signToken(`e|${playlistId}|${kind}|${streamId}|${ext}`);
}

export function urlToken(playlistId: string, absoluteUrl: string, ttlMs?: number): string {
  return crypto().signToken(`u|${playlistId}|${absoluteUrl}`, ttlMs);
}

export interface DecodedToken {
  playlistId: string;
  target:
    | { type: 'entity'; kind: StreamKind; streamId: string; ext: string }
    | { type: 'url'; url: string };
}

export function decodeToken(payload: string): DecodedToken | null {
  const parts = payload.split('|');
  if (parts[0] === 'e' && parts.length === 5) {
    const [, playlistId, kind, streamId, ext] = parts;
    if (kind !== 'live' && kind !== 'movie' && kind !== 'episode') return null;
    return { playlistId, target: { type: 'entity', kind, streamId, ext } };
  }
  if (parts[0] === 'u' && parts.length >= 3) {
    const playlistId = parts[1];
    const url = parts.slice(2).join('|');
    return { playlistId, target: { type: 'url', url } };
  }
  return null;
}

export function proxiedUrl(token: string): string {
  return `/api/stream?t=${encodeURIComponent(token)}`;
}

/** Xtream live: prefer HLS (works natively on Safari / tvOS and via hls.js),
 *  fall back to the MPEG-TS URL which mpegts.js transmuxes in the browser. */
export function liveSource(playlistId: string, streamId: string, title: string): PlaybackSource {
  return {
    url: proxiedUrl(entityToken(playlistId, 'live', streamId, 'm3u8')),
    container: 'hls',
    proxied: true,
    kind: 'live',
    title,
    fallbackUrl: proxiedUrl(entityToken(playlistId, 'live', streamId, 'ts')),
    fallbackContainer: 'mpegts',
  };
}

export function vodSource(
  playlistId: string,
  kind: 'movie' | 'episode',
  streamId: string,
  ext: string,
  title: string,
): PlaybackSource {
  const container = ext === 'mkv' ? 'mkv' : ext === 'ts' ? 'mpegts' : 'mp4';
  return {
    url: proxiedUrl(entityToken(playlistId, kind, streamId, ext)),
    container,
    proxied: true,
    kind,
    title,
  };
}

/** M3U entries already carry a full URL; proxy it so HTTP works under HTTPS. */
export function directSource(
  playlistId: string,
  absoluteUrl: string,
  kind: StreamKind,
  title: string,
  container: PlaybackSource['container'],
): PlaybackSource {
  return {
    url: proxiedUrl(urlToken(playlistId, absoluteUrl)),
    container,
    proxied: true,
    kind,
    title,
  };
}

/** Proxy for provider artwork — usually plain HTTP, often slow or dead. */
export function imageProxy(playlistId: string, absoluteUrl: string | null): string | null {
  if (!absoluteUrl) return null;
  if (!/^https?:\/\//i.test(absoluteUrl)) return null;
  return `/api/image?t=${encodeURIComponent(urlToken(playlistId, absoluteUrl, 7 * 24 * 60 * 60 * 1000))}`;
}
