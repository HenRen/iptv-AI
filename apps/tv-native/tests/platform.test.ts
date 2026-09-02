import { describe, expect, it } from 'vitest';
import { storagePortCases } from '@streamwise/core/testing';
import { AsyncStorageAdapter, base64ByteLength, fromBase64, toBase64 } from '../src/platform/storage';
import { MemoryAsyncStoreNoMulti, MemoryAsyncStoreWithMulti } from './support/fixtures';

/**
 * The React Native bindings, against the contracts core ships.
 *
 * Same cases `packages/server` runs against the Node adapters and
 * `apps/tv-lightning` runs against localStorage. Three implementations that
 * share no code, held to one contract — which is the only way "the ports
 * work" means anything.
 *
 * The suite runs twice, once with `multiRemove` and once without, because it
 * is optional on the interface and `delete()` takes a different path for
 * each. A store that only ever saw one of them would leave the other
 * untested, and the one without is the fallback nobody exercises by hand.
 */

describe.each([
  ['with multiRemove', () => new MemoryAsyncStoreWithMulti()],
  ['without multiRemove', () => new MemoryAsyncStoreNoMulti()],
])('StoragePort conformance — AsyncStorage %s', (_label, makeStore) => {
  for (const testCase of storagePortCases) {
    it(testCase.name, async () => {
      await expect(
        testCase.run(() => new AsyncStorageAdapter(makeStore())),
      ).resolves.toBeUndefined();
    });
  }
});

describe('base64, hand-rolled because Hermes has no Buffer', () => {
  it('round-trips every byte value', () => {
    const all = new Uint8Array(256);
    for (let i = 0; i < 256; i++) all[i] = i;
    expect(fromBase64(toBase64(all))).toEqual(all);
  });

  it.each([0, 1, 2, 3, 4, 5, 6, 7])('round-trips a length of %i, padding and all', (length) => {
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) bytes[i] = (i * 37 + 11) & 255;
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });

  it('agrees with the platform encoder', () => {
    const bytes = new Uint8Array([0, 1, 200, 255, 65, 0, 128, 7]);
    expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });

  it('measures a blob without decoding it', () => {
    for (const length of [0, 1, 2, 3, 100, 4096]) {
      expect(base64ByteLength(toBase64(new Uint8Array(length)))).toBe(length);
    }
  });
});

describe('AsyncStorageAdapter specifics', () => {
  it('namespaces its keys so it cannot collide on the device', async () => {
    const store = new MemoryAsyncStoreWithMulti();
    await new AsyncStorageAdapter(store, 'sw:').setJSON('playlists/index', ['a']);
    expect(store.keys().every((k) => k.startsWith('sw:'))).toBe(true);
  });

  it('two namespaces on one store do not see each other', async () => {
    const store = new MemoryAsyncStoreWithMulti();
    const a = new AsyncStorageAdapter(store, 'a:');
    const b = new AsyncStorageAdapter(store, 'b:');
    await a.setJSON('doc/one', { from: 'a' });
    await b.setJSON('doc/one', { from: 'b' });
    expect(await a.getJSON('doc/one')).toEqual({ from: 'a' });
    expect(await b.getJSON('doc/one')).toEqual({ from: 'b' });
  });

  it('reads a corrupt document as absent rather than throwing', async () => {
    const store = new MemoryAsyncStoreWithMulti();
    await store.setItem('streamwise:d:playlists/index', '{ not json');
    expect(await new AsyncStorageAdapter(store).getJSON('playlists/index')).toBeNull();
  });

  it('leaves nothing behind when a blob is deleted, on either delete path', async () => {
    for (const store of [new MemoryAsyncStoreWithMulti(), new MemoryAsyncStoreNoMulti()]) {
      const adapter = new AsyncStorageAdapter(store);
      await adapter.setBlob('catalog/x.json', new Uint8Array([1, 2, 3]));
      await adapter.delete('catalog/x.json');
      expect(store.keys()).toEqual([]);
    }
  });
});
