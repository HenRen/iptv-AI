import 'server-only';
import dns from 'node:dns/promises';
import net from 'node:net';

/**
 * SSRF protection for every outbound fetch the proxy makes.
 *
 * The proxy exists so a browser on HTTPS can reach a plain-HTTP IPTV provider
 * without mixed-content errors. That makes it, by construction, a request
 * forwarder — so it is locked down three ways:
 *
 *   1. scheme allowlist (http/https only — no file:, gopher:, data:)
 *   2. host allowlist   (only hosts belonging to a configured playlist)
 *   3. DNS resolution + private-range rejection, re-checked per request, so a
 *      provider hostname cannot be re-pointed at 169.254.169.254 or 127.0.0.1
 */

export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlockedUrlError';
  }
}

const PRIVATE_V4 = [
  { net: '0.0.0.0', bits: 8 },
  { net: '10.0.0.0', bits: 8 },
  { net: '100.64.0.0', bits: 10 },
  { net: '127.0.0.0', bits: 8 },
  { net: '169.254.0.0', bits: 16 },
  { net: '172.16.0.0', bits: 12 },
  { net: '192.0.0.0', bits: 24 },
  { net: '192.168.0.0', bits: 16 },
  { net: '198.18.0.0', bits: 15 },
  { net: '224.0.0.0', bits: 4 },
  { net: '240.0.0.0', bits: 4 },
];

function v4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const value = v4ToInt(ip);
    return PRIVATE_V4.some(({ net: base, bits }) => {
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      return (value & mask) === (v4ToInt(base) & mask);
    });
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    if (lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
    // IPv4-mapped: ::ffff:127.0.0.1
    const mapped = /::ffff:(\d+\.\d+\.\d+\.\d+)/.exec(lower);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  return true; // unparseable — refuse
}

export interface GuardOptions {
  /** Hostnames (lowercase, no port) this request is permitted to reach. */
  allowedHosts: Set<string>;
  /** Set true only for a local development provider on localhost. */
  allowPrivate?: boolean;
}

/**
 * Validate a URL and return it normalized. Throws BlockedUrlError otherwise.
 */
export async function assertSafeUrl(raw: string, opts: GuardOptions): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedUrlError('Not a valid URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BlockedUrlError('Only http and https URLs can be proxied.');
  }
  if (url.username || url.password) {
    throw new BlockedUrlError('URLs with inline credentials cannot be proxied.');
  }

  const host = url.hostname.toLowerCase();
  if (!opts.allowedHosts.has(host)) {
    throw new BlockedUrlError('This host does not belong to a configured IPTV provider.');
  }

  const allowPrivate = opts.allowPrivate ?? process.env.HENREN_ALLOW_PRIVATE_HOSTS === 'true';
  if (allowPrivate) return url;

  // Literal IP in the URL
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new BlockedUrlError('Private network addresses cannot be proxied.');
    return url;
  }

  let addresses: string[];
  try {
    const records = await dns.lookup(host, { all: true, verbatim: true });
    addresses = records.map((r) => r.address);
  } catch {
    throw new BlockedUrlError('The provider hostname could not be resolved.');
  }
  if (addresses.length === 0) throw new BlockedUrlError('The provider hostname could not be resolved.');
  if (addresses.some(isPrivateAddress)) {
    throw new BlockedUrlError('The provider hostname resolves to a private network address.');
  }
  return url;
}

/** Extract the bare hostname from a user-entered host string. */
export function hostnameOf(input: string): string | null {
  const withScheme = /^https?:\/\//i.test(input) ? input : `http://${input}`;
  try {
    return new URL(withScheme).hostname.toLowerCase();
  } catch {
    return null;
  }
}
