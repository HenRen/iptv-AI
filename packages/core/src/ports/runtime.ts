import type { CryptoPort } from './crypto';
import type { HttpPort } from './http';
import type { SecureStorePort } from './secureStore';
import type { StoragePort } from './storage';
import type { UrlGuardPort } from './urlGuard';
import { sealedSecureStore } from './secureStore';

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
