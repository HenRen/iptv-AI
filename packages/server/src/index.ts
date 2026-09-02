/**
 * @streamwise/server — the API and the Node bindings for @streamwise/core.
 *
 * Two hosts mount the same handlers: `apps/web` through Next.js route files,
 * and `standalone.ts` through `node:http` for clients that have no Next.js —
 * which is every TV build.
 *
 * The SSRF guard and the rate limiter live here rather than in core on
 * purpose: they protect a proxy, and a proxy is a server.
 */

export { createApiServer } from './app';
export { bootServer, ensureServerBooted } from './runtime';

export { FileStorageAdapter } from './storage/file';
export { createNodeCryptoPort, nodeCryptoPort, resolveSecret } from './security/nodeCrypto';
export { createFetchHttpPort, nodeHttpPort } from './http';
export {
  BlockedUrlError,
  assertSafeUrl,
  hostnameOf,
  isPrivateAddress,
  nodeUrlGuardPort,
  type GuardOptions,
} from './security/urlGuard';
export { LIMITS, clientKey, takeToken, type LimitConfig } from './security/rateLimit';

export { fail, fromError, limited, num, ok } from './respond';
