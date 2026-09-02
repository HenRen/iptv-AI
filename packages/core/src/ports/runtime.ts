import type { CryptoPort } from './crypto';
import type { HttpPort } from './http';
import type { SecureStorePort } from './secureStore';
import type { StoragePort } from './storage';
import type { UrlGuardPort } from './urlGuard';
import { sealedSecureStore } from './secureStore';
import { passthroughUrlGuard } from './urlGuard';

/**
 * The one place core reaches outside itself.
 *
 * Every platform binding arrives here once, at process start, and core's
 * modules read it through the accessors below. That is what makes the same
 * catalogue, EPG and AI code run unchanged in a Next.js route, a standalone
 * Node server, a Lightning app and a React Native TV app.
 *
 * There is no fallback implementation on purpose. A missing binding must
 * fail loudly at the first call, not silently persist to nowhere.
 */
export interface CoreConfig {
  /**
   * Absent means the built-in rules provider, which is fully functional.
   * Credentials are never sent to an AI provider regardless of this value.
   */
  openAiApiKey: string | null;
  openAiModel: string;
  /** Sent on every outbound provider request. */
  userAgent: string;
}

export interface CoreEnvironment {
  storage: StoragePort;
  crypto: CryptoPort;
  http: HttpPort;
  urlGuard: UrlGuardPort;
  secureStore: SecureStorePort;
  config: CoreConfig;
}

export const DEFAULT_CONFIG: CoreConfig = {
  openAiApiKey: null,
  openAiModel: 'gpt-4o-mini',
  userAgent: 'HENREN-IPTV/0.1',
};

export interface CoreBindings {
  storage: StoragePort;
  crypto: CryptoPort;
  http: HttpPort;
  urlGuard: UrlGuardPort;
  /** Defaults to a sealed envelope in `storage`, using `crypto`. */
  secureStore?: SecureStorePort;
  config?: Partial<CoreConfig>;
}

let current: CoreEnvironment | null = null;

/** Install the platform bindings. Call once, before anything else in core. */
export function configureCore(bindings: CoreBindings): CoreEnvironment {
  current = {
    storage: bindings.storage,
    crypto: bindings.crypto,
    http: bindings.http,
    urlGuard: bindings.urlGuard,
    secureStore: bindings.secureStore ?? sealedSecureStore(bindings.storage, bindings.crypto),
    config: { ...DEFAULT_CONFIG, ...bindings.config },
  };
  return current;
}

/**
 * Bindings for a client — a TV app, or anything else that talks to
 * `@streamwise/server` over HTTP rather than to a provider directly.
 *
 * Such an app needs almost none of this. It calls `ApiClient`, so the
 * catalogue, the credential envelope and the SSRF guard all run on the
 * server; the only ports it genuinely has are `http`, and `storage` if it
 * keeps anything locally (a last channel, a favourites list).
 *
 * Making it invent an AES-GCM implementation it will never call would be
 * ceremony, and worse than ceremony: the obvious way to satisfy the type is
 * to write a fake one, and a fake CryptoPort that nothing calls today is a
 * real vulnerability the day something does. So the server-side ports are
 * bound to stubs that refuse loudly and name themselves.
 */
export interface ClientBindings {
  http: HttpPort;
  /** Local preferences only. Defaults to a store that refuses. */
  storage?: StoragePort;
  config?: Partial<CoreConfig>;
}

function unavailable(port: string, reason: string): never {
  throw new Error(
    `${port} is not available in this build. ${reason} If you meant to use it, configure the ` +
      'core with configureCore({ ... }) and a real implementation instead of configureCoreClient().',
  );
}

// `async` matters: these return promises in the interface, so they must
// *reject* rather than throw synchronously. A caller writing
// `store.getJSON(k).catch(...)` would otherwise blow up before it had a
// promise to catch on.
const NO_STORAGE = 'This client did not bind local storage.';

const refusingStorage: StoragePort = {
  getJSON: async () => unavailable('StoragePort', NO_STORAGE),
  setJSON: async () => unavailable('StoragePort', NO_STORAGE),
  delete: async () => unavailable('StoragePort', NO_STORAGE),
  list: async () => unavailable('StoragePort', NO_STORAGE),
  getBlob: async () => unavailable('StoragePort', NO_STORAGE),
  setBlob: async () => unavailable('StoragePort', NO_STORAGE),
  blobStat: async () => unavailable('StoragePort', NO_STORAGE),
};

const SERVER_SIDE = 'Credentials and playback tokens are the server\'s business, not a client\'s.';

const refusingCrypto: CryptoPort = {
  seal: () => unavailable('CryptoPort', SERVER_SIDE),
  open: () => unavailable('CryptoPort', SERVER_SIDE),
  randomId: () => unavailable('CryptoPort', SERVER_SIDE),
  signToken: () => unavailable('CryptoPort', SERVER_SIDE),
  verifyToken: () => unavailable('CryptoPort', SERVER_SIDE),
};

const refusingSecureStore: SecureStorePort = {
  read: async () => unavailable('SecureStorePort', SERVER_SIDE),
  write: async () => unavailable('SecureStorePort', SERVER_SIDE),
  delete: async () => unavailable('SecureStorePort', SERVER_SIDE),
};

/**
 * Install client bindings. The server-side ports are present but refuse, so
 * calling one is an immediate, named error rather than a silent wrong answer.
 */
export function configureCoreClient(bindings: ClientBindings): CoreEnvironment {
  current = {
    storage: bindings.storage ?? refusingStorage,
    crypto: refusingCrypto,
    http: bindings.http,
    // A client proxies nothing, so it has no SSRF surface to guard. Claiming
    // otherwise with a real-looking guard would be theatre.
    urlGuard: passthroughUrlGuard,
    secureStore: refusingSecureStore,
    config: { ...DEFAULT_CONFIG, ...bindings.config },
  };
  return current;
}

/** Drop the bindings. Used between tests; never in production code. */
export function resetCore(): void {
  current = null;
}

export function isCoreConfigured(): boolean {
  return current !== null;
}

export function core(): CoreEnvironment {
  if (!current) {
    throw new Error(
      'StreamWise core is not configured. Call configureCore({ storage, crypto, http, urlGuard }) ' +
        'at process start — see packages/core/README.md.',
    );
  }
  return current;
}

export const storage = (): StoragePort => core().storage;
export const crypto = (): CryptoPort => core().crypto;
export const http = (): HttpPort => core().http;
export const urlGuard = (): UrlGuardPort => core().urlGuard;
export const secureStore = (): SecureStorePort => core().secureStore;
export const config = (): CoreConfig => core().config;
