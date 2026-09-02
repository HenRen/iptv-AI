import path from 'node:path';
import { configureCore, isCoreConfigured, type CoreEnvironment } from '@streamwise/core';
import { nodeHttpPort } from './http';
import { nodeCryptoPort } from './security/nodeCrypto';
import { nodeUrlGuardPort } from './security/urlGuard';
import { FileStorageAdapter } from './storage/file';

/**
 * The one place the server binds core to a platform.
 *
 * Both entry points call this: the Next.js route handlers in `apps/web` (on
 * first request) and `standalone.ts` (at boot). It is idempotent, because
 * Next may evaluate a route module more than once per process.
 *
 * Swap `FileStorageAdapter` for a Postgres one here when moving off local
 * files — everything above this line is already written against the port.
 */
export function bootServer(): CoreEnvironment {
  const root = process.env.HENREN_DATA_DIR
    ? path.resolve(process.env.HENREN_DATA_DIR)
    : path.join(process.cwd(), '.data');

  return configureCore({
    storage: new FileStorageAdapter(root),
    crypto: nodeCryptoPort,
    http: nodeHttpPort,
    urlGuard: nodeUrlGuardPort,
    config: {
      // Not HENREN_STREAM_USER_AGENT: that one exists to impersonate a player
      // on *stream* requests, and applying it to catalogue fetches too would
      // change what providers return.
      openAiApiKey: process.env.OPENAI_API_KEY ?? null,
      userAgent: 'HENREN-IPTV/0.1',
    },
  });
}

/** Boot once per process. Safe to call from every route module. */
export function ensureServerBooted(): void {
  if (!isCoreConfigured()) bootServer();
}
