import { describe, expect, it } from 'vitest';
import { sealedSecureStore } from '@streamwise/core';
import { secureStorePortCases, storagePortCases } from '@streamwise/core/testing';
import { fakeCrypto, memoryStorage } from './support/doubles';

/**
 * The conformance suite, run against the in-memory doubles.
 *
 * Two things are being checked at once. The obvious one is that
 * `memoryStorage()` is a real `StoragePort` and not a convenient lie — the
 * rest of core's tests are only meaningful if it behaves like the adapter
 * the app actually ships. The less obvious one is that the cases themselves
 * are runnable outside `packages/server`, which is the whole point of
 * shipping them from core: a Lightning or React Native build runs exactly
 * this file's contents against MMKV or AsyncStorage.
 *
 * `cryptoPortCases` and `httpPortCases` are deliberately NOT run here.
 * `fakeCrypto` is a test double, not an implementation: it is deterministic
 * and unauthenticated, and it would rightly fail the "seal must be
 * randomised" and "a tampered envelope must not decrypt" cases. Those two
 * suites are run against the real Node adapters in `packages/server`.
 */

describe('StoragePort conformance — in-memory', () => {
  for (const testCase of storagePortCases) {
    it(testCase.name, async () => {
      await expect(testCase.run(() => memoryStorage())).resolves.toBeUndefined();
    });
  }
});

describe('SecureStorePort conformance — sealed envelope over in-memory storage', () => {
  for (const testCase of secureStorePortCases) {
    it(testCase.name, async () => {
      await expect(
        testCase.run(() => sealedSecureStore(memoryStorage(), fakeCrypto())),
      ).resolves.toBeUndefined();
    });
  }
});
