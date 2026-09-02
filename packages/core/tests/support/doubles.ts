import type { CryptoPort, HttpPort, StoragePort, UrlGuardPort } from '../../src/index';
import { configureCore, passthroughUrlGuard } from '../../src/index';

/**
 * Test bindings.
 *
 * Core has no default implementations by design, so a unit test that touches
 * a port has to say which one it means. These are deliberately trivial: they
 * exist so a test of the *catalogue* is not also a test of AES-GCM. The real
 * Node adapters are exercised in `packages/server/tests`.
 */

export function memoryStorage(): StoragePort {
  const json = new Map<string, unknown>();
  const blobs = new Map<string, { bytes: Uint8Array; updatedAt: number }>();
  return {
    async getJSON<T>(key: string) {
      return (json.has(key) ? (json.get(key) as T) : null);
    },
    async setJSON<T>(key: string, value: T) {
      json.set(key, value);
    },
    async delete(key: string) {
      json.delete(key);
      blobs.delete(key);
    },
    async list(prefix: string) {
      return [...json.keys()].filter((k) => k.startsWith(`${prefix}/`));
    },
    async getBlob(key: string) {
      return blobs.get(key)?.bytes ?? null;
    },
    async setBlob(key: string, value: Uint8Array) {
      blobs.set(key, { bytes: value, updatedAt: Date.now() });
    },
    async blobStat(key: string) {
      const entry = blobs.get(key);
      return entry ? { size: entry.bytes.byteLength, updatedAt: entry.updatedAt } : null;
    },
  };
}

/**
 * Reversible, unauthenticated, and obviously not secret — which is the point.
 * A test asserting that a payload survives a round trip should fail when the
 * *payload handling* breaks, not when the cipher changes.
 *
 * It does keep one property of the real thing: the payload is opaque in the
 * output. Tokens end up in URLs the browser can read, and "the provider host
 * never appears in a rewritten manifest" is a claim worth testing without
 * bringing AES into a core unit test.
 */
const encode = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
const decode = (s: string) => Buffer.from(s, 'base64url').toString('utf8');

export function fakeCrypto(): CryptoPort {
  let counter = 0;
  return {
    seal: (plain) => `fake.${encode(plain)}`,
    open: (sealed) => {
      if (!sealed.startsWith('fake.')) throw new Error('Malformed credential envelope.');
      return decode(sealed.slice('fake.'.length));
    },
    randomId: () => `id${++counter}`,
    signToken: (payload, ttlMs = 60_000) => `${encode(payload)}.${Date.now() + ttlMs}`,
    verifyToken: (token) => {
      const sep = token.lastIndexOf('.');
      if (sep < 0) return null;
      const exp = Number(token.slice(sep + 1));
      if (!Number.isFinite(exp) || exp < Date.now()) return null;
      return decode(token.slice(0, sep));
    },
  };
}

export function rejectingHttp(): HttpPort {
  return {
    async fetch(url) {
      throw new Error(`Unexpected network call to ${url} in a unit test.`);
    },
  };
}

export interface TestBindings {
  crypto?: CryptoPort;
  http?: HttpPort;
  storage?: StoragePort;
  urlGuard?: UrlGuardPort;
  openAiApiKey?: string | null;
}

export function configureForTest(overrides: TestBindings = {}) {
  return configureCore({
    storage: overrides.storage ?? memoryStorage(),
    crypto: overrides.crypto ?? fakeCrypto(),
    http: overrides.http ?? rejectingHttp(),
    urlGuard: overrides.urlGuard ?? passthroughUrlGuard,
    config: { openAiApiKey: overrides.openAiApiKey ?? null },
  });
}
