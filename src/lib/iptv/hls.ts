import 'server-only';
import { urlToken } from './streamSource';

/**
 * Rewrite every URI in an HLS manifest to point back at our stream proxy.
 *
 * Without this the browser fetches segments straight from the provider, which
 * reintroduces exactly what the proxy exists to prevent: a mixed-content block
 * on HTTPS, a CORS failure, and a credential-bearing URL in the network tab.
 *
 * Lives here rather than in the route file because a Next.js route module may
 * only export handlers — and because it is the piece most worth unit-testing.
 */
export function rewriteManifest(manifest: string, base: URL, playlistId: string): string {
  const proxy = (raw: string): string => {
    let absolute: string;
    try {
      absolute = new URL(raw, base).toString();
    } catch {
      return raw;
    }
    return `/api/stream?t=${encodeURIComponent(urlToken(playlistId, absolute, 6 * 60 * 60 * 1000))}`;
  };

  return manifest
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.length === 0) return line;

      if (trimmed.startsWith('#')) {
        // URI="..." appears on #EXT-X-KEY, #EXT-X-MEDIA, #EXT-X-MAP and others.
        return line.replace(/URI="([^"]+)"/g, (_m, uri: string) => `URI="${proxy(uri)}"`);
      }
      return proxy(trimmed);
    })
    .join('\n');
}
