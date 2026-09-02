import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sealedSecureStore } from '@streamwise/core';
import {
  cryptoPortCases,
  httpPortCases,
  secureStorePortCases,
  storagePortCases,
  type HttpFixture,
} from '@streamwise/core/testing';
import { FileStorageAdapter } from '../src/storage/file';
import { createNodeCryptoPort } from '../src/security/nodeCrypto';
import { startHttpFixture } from './support/httpFixture';

/**
 * The port contracts, against the adapters the web app and the standalone
 * API actually run. Core ships the cases; this is the proof that one real
 * implementation satisfies them, and the reference a TV build compares
 * itself against.
 */

const roots: string[] = [];

async function freshFileStorage(): Promise<FileStorageAdapter> {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'streamwise-conformance-'));
  roots.push(root);
  return new FileStorageAdapter(root);
}

// A fixed key: the cases assert on behaviour, not on any particular secret,
// and this keeps the run independent of the environment.
const crypto = createNodeCryptoPort(() =>
  createHash('sha256').update('conformance-suite-key').digest(),
);

afterAll(async () => {
  await Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('StoragePort conformance — FileStorageAdapter', () => {
  for (const testCase of storagePortCases) {
    it(testCase.name, async () => {
      await expect(testCase.run(freshFileStorage)).resolves.toBeUndefined();
    });
  }
});

describe('CryptoPort conformance — node:crypto', () => {
  for (const testCase of cryptoPortCases) {
    it(testCase.name, async () => {
      await expect(testCase.run(() => crypto)).resolves.toBeUndefined();
    });
  }
});

describe('SecureStorePort conformance — sealed envelope on disk', () => {
  for (const testCase of secureStorePortCases) {
    it(testCase.name, async () => {
      await expect(
        testCase.run(async () => sealedSecureStore(await freshFileStorage(), crypto)),
      ).resolves.toBeUndefined();
    });
  }
});

describe('HttpPort conformance — fetch with an aborting timeout', () => {
  let fixture: HttpFixture & { close(): Promise<void> };

  beforeAll(async () => {
    fixture = await startHttpFixture();
  });
  afterAll(async () => {
    await fixture.close();
  });

  for (const testCase of httpPortCases) {
    it(testCase.name, async () => {
      await expect(testCase.run(() => fixture)).resolves.toBeUndefined();
    });
  }
});
