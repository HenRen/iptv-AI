/**
 * SSRF boundary.
 *
 * The real guard — scheme allowlist, host allowlist, DNS resolution and
 * private-range rejection — stays in `@streamwise/server`, because it needs
 * `node:dns` and because it protects a *proxy*, which is a server concern.
 * Core only states that a URL must be cleared before it is fetched, and by
 * whom.
 *
 * A TV app that talks to `packages/server` over HTTP never installs a real
 * implementation: it does not proxy anything, so `passthroughUrlGuard` is
 * the honest choice there.
 */
export interface UrlGuardOptions {
  /** Hostnames this particular request is allowed to reach. */
  allowedHosts?: Iterable<string>;
  /** Permit private/loopback targets. Only for a genuinely LAN-hosted provider. */
  allowPrivate?: boolean;
}

export interface UrlGuardPort {
  /**
   * Resolve `raw` and return the URL that may be fetched, or reject.
   *
   * Returns a string rather than a `URL` so core stays free of the DOM lib's
   * `URL` shape in port signatures.
   */
  assertSafe(raw: string, options?: UrlGuardOptions): Promise<string>;
}

/** No-op guard, for clients that do not proxy anything themselves. */
export const passthroughUrlGuard: UrlGuardPort = {
  assertSafe: async (raw) => raw,
};
