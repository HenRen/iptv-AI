import { describe, expect, it } from 'vitest';
import { storagePortCases, httpPortCases, type HttpFixture } from '@streamwise/core/testing';
import { KeyValueStorageAdapter, base64ByteLength, fromBase64, toBase64 } from '../src/platform/storage';
import { createTvHttpPort, type AbortControllerLike } from '../src/platform/http';
import { MemoryKeyValueStore, startFetchFixture } from './support/fixtures';

/**
 * The Lightning platform bindings, against the contracts core ships.
 *
 * These are the same cases `packages/server` runs against the Node adapters.
 * Running them here is the point of having them: the two implementations
 * share no code, and "behaves like the one the web app uses" is a claim that
 * has to be checked rather than assumed.
 *
 * The stores are stand-ins for `localStorage` and `fetch` — the real ones
 * need a TV — but the logic under test is this adapter's, not the platform's:
 * base64 for blobs, the document/blob namespace split, prefix enumeration,
 * and the abort that turns a silent provider into a timeout.
 */

describe('StoragePort conformance — key-value store', () => {
  for (const testCase of storagePortCases) {
    it(testCase.name, async () => {
      await expect(
        testCase.run(() => new KeyValueStorageAdapter(new MemoryKeyValueStore())),
      ).resolves.toBeUndefined();
    });
  }
});

describe('HttpPort conformance — fetch with an aborting timeout', () => {
  it.each(httpPortCases.map((c) => [c.name, c] as const))('%s', async (_name, testCase) => {
    const fixture = await startFetchFixture();
    try {
      await expect(testCase.run(() => fixture as HttpFixture)).resolves.toBeUndefined();
    } finally {
      await fixture.close();
    }
  });
});

describe('base64, hand-rolled because the runtime has no Buffer', () => {
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

  it('produces the same encoding as the platform would', () => {
    const bytes = new Uint8Array([0, 1, 200, 255, 65, 0, 128, 7]);
    expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });

  it('measures a blob without decoding it', () => {
    for (const length of [0, 1, 2, 3, 100, 4096]) {
      const bytes = new Uint8Array(length);
      expect(base64ByteLength(toBase64(bytes))).toBe(length);
    }
  });
});

describe('KeyValueStorageAdapter specifics', () => {
  it('namespaces its keys so it cannot collide with the origin', async () => {
    const store = new MemoryKeyValueStore();
    await new KeyValueStorageAdapter(store, 'sw:').setJSON('playlists/index', ['a']);
    expect(store.keys().every((k) => k.startsWith('sw:'))).toBe(true);
  });

  it('two namespaces on one store do not see each other', async () => {
    const store = new MemoryKeyValueStore();
    const a = new KeyValueStorageAdapter(store, 'a:');
    const b = new KeyValueStorageAdapter(store, 'b:');
    await a.setJSON('doc/one', { from: 'a' });
    await b.setJSON('doc/one', { from: 'b' });
    expect(await a.getJSON('doc/one')).toEqual({ from: 'a' });
    expect(await b.getJSON('doc/one')).toEqual({ from: 'b' });
  });

  it('reads a corrupt document as absent rather than throwing', async () => {
    const store = new MemoryKeyValueStore();
    store.setItem('streamwise:d:playlists/index', '{ this is not json');
    expect(await new KeyValueStorageAdapter(store).getJSON('playlists/index')).toBeNull();
  });

  it('deleting a blob also drops its timestamp, leaving nothing behind', async () => {
    const store = new MemoryKeyValueStore();
    const adapter = new KeyValueStorageAdapter(store);
    await adapter.setBlob('catalog/x.json', new Uint8Array([1, 2, 3]));
    await adapter.delete('catalog/x.json');
    expect(store.keys()).toEqual([]);
  });
});

describe('createTvHttpPort', () => {
  it('reports a timeout as HttpTimeoutError and clears its timer', async () => {
    // Proven with a fake clock rather than a real wait: what matters is that
    // the adapter aborts and classifies, not that the platform can count.
    let fired: (() => void) | null = null;
    let cleared = false;
    const port = createTvHttpPort({
      fetch: () =>
        new Promise((_resolve, reject) => {
          fired?.();
          reject(new Error('aborted'));
        }),
      AbortController: class implements AbortControllerLike {
        readonly signal = {};
        abort() {}
      },
      setTimeout: (fn) => {
        fired = fn;
        return 1;
      },
      clearTimeout: () => {
        cleared = true;
      },
    });

    await expect(port.fetch('http://provider.invalid/x', { timeoutMs: 10 })).rejects.toThrow(
      /timed out/,
    );
    expect(cleared).toBe(true);
  });

  it('passes a transport failure through unchanged when there was no timeout', async () => {
    const port = createTvHttpPort({
      fetch: () => Promise.reject(new Error('DNS is on fire')),
      AbortController: class implements AbortControllerLike {
        readonly signal = {};
        abort() {}
      },
      setTimeout: () => 1,
      clearTimeout: () => {},
    });
    // "Unreachable" and "timed out" send the viewer to different fixes, so
    // the adapter must not flatten one into the other.
    await expect(port.fetch('http://provider.invalid/x', { timeoutMs: 50 })).rejects.toThrow(
      /DNS is on fire/,
    );
  });
});
