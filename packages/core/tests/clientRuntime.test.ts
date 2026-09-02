import { afterEach, describe, expect, it } from 'vitest';
import {
  ApiClient,
  configureCoreClient,
  crypto,
  resetCore,
  secureStore,
  storage,
  urlGuard,
} from '@streamwise/core';
import { memoryStorage } from './support/doubles';
import type { HttpPort } from '@streamwise/core';

/**
 * What a TV app is actually allowed to be.
 *
 * A client talks to `@streamwise/server` over HTTP: the catalogue, the
 * credential envelope and the SSRF guard all run there. Forcing it to supply
 * a CryptoPort it never calls would not be harmless ceremony — the obvious
 * way to satisfy the type is to write a fake one, and a fake cipher that
 * nothing calls today is a real vulnerability the day something does.
 *
 * So the server-side ports are bound to stubs that refuse and say why.
 */

const noHttp: HttpPort = {
  fetch: async () => {
    throw new Error('not called');
  },
};

afterEach(() => resetCore());

describe('configureCoreClient', () => {
  it('binds http, which is the port a client genuinely has', () => {
    const env = configureCoreClient({ http: noHttp });
    expect(env.http).toBe(noHttp);
  });

  it('lets a client keep local preferences when it binds storage', async () => {
    configureCoreClient({ http: noHttp, storage: memoryStorage() });
    await storage().setJSON('user/favorites', ['ch:1']);
    expect(await storage().getJSON('user/favorites')).toEqual(['ch:1']);
  });

  it('refuses local storage when the client did not bind any', async () => {
    configureCoreClient({ http: noHttp });
    await expect(storage().getJSON('user/favorites')).rejects.toThrow(/StoragePort/);
  });

  it('refuses every credential operation, by name', () => {
    configureCoreClient({ http: noHttp });
    for (const call of [
      () => crypto().seal('x'),
      () => crypto().open('x'),
      () => crypto().randomId(),
      () => crypto().signToken('x'),
      () => crypto().verifyToken('x'),
    ]) {
      expect(call).toThrow(/CryptoPort is not available/);
    }
  });

  it('names the alternative in the error, so the message is actionable', () => {
    configureCoreClient({ http: noHttp });
    expect(() => crypto().seal('x')).toThrow(/configureCore\(/);
  });

  it('refuses the secure store', async () => {
    configureCoreClient({ http: noHttp });
    await expect(secureStore().read('pl1')).rejects.toThrow(/SecureStorePort/);
  });

  it('installs a passthrough URL guard rather than pretending to guard', async () => {
    // A client proxies nothing, so it has no SSRF surface. A real-looking
    // guard here would suggest a protection that does not exist.
    configureCoreClient({ http: noHttp });
    expect(await urlGuard().assertSafe('http://anything.invalid/x')).toBe(
      'http://anything.invalid/x',
    );
  });

  it('is enough to construct and use an ApiClient', async () => {
    const calls: string[] = [];
    const http: HttpPort = {
      fetch: async (url) => {
        calls.push(url);
        return {
          ok: true,
          status: 200,
          header: () => null,
          text: async () => JSON.stringify({ playlists: [], activePlaylistId: null }),
          json: async () => ({}) as never,
          arrayBuffer: async () => new ArrayBuffer(0),
        };
      },
    };
    configureCoreClient({ http });
    const client = new ApiClient({ http, baseUrl: 'http://tv-backend.lan:3211' });

    expect(await client.playlists()).toEqual({ playlists: [], activePlaylistId: null });
    expect(calls).toEqual(['http://tv-backend.lan:3211/api/playlists']);
  });
});
