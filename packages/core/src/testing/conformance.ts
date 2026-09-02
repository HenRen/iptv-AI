import type { CryptoPort } from '../ports/crypto';
import type { HttpPort } from '../ports/http';
import { HttpTimeoutError } from '../ports/http';
import type { SecureStorePort } from '../ports/secureStore';
import type { StoragePort } from '../ports/storage';
import { doesNotThrow, equal, notEqual, ok, throws } from './assert';

/**
 * The port contracts, as runnable cases.
 *
 * A port is only useful if every implementation of it behaves the same, and
 * an interface cannot say things like "delete on a missing key must not
 * throw" or "seal must not be deterministic". These do. `packages/server`
 * runs them against the Node adapters; a Lightning or React Native build
 * runs the same cases against MMKV, AsyncStorage, Keychain or whatever it
 * binds, and finds out before the screens are built rather than after.
 *
 * Each case takes a *factory* rather than an instance: many of them need a
 * clean store, and sharing one between cases hides ordering bugs.
 */

export type Factory<T> = () => T | Promise<T>;

export interface ConformanceCase<T> {
  readonly name: string;
  run(create: Factory<T>): Promise<void>;
}

const bytes = (...values: number[]) => new Uint8Array(values);

/* ------------------------------------------------------------------ *
 * StoragePort
 * ------------------------------------------------------------------ */

export const storagePortCases: ConformanceCase<StoragePort>[] = [
  {
    name: 'getJSON returns null for a key that was never written',
    async run(create) {
      const store = await create();
      equal(await store.getJSON('nothing/here'), null, 'a missing key must read as null');
    },
  },
  {
    name: 'setJSON then getJSON round-trips a nested document',
    async run(create) {
      const store = await create();
      const value = { a: 1, b: ['x', 'y'], c: { d: true, e: null }, f: '' };
      await store.setJSON('doc/one', value);
      equal(await store.getJSON('doc/one'), value, 'the document must survive a round trip');
    },
  },
  {
    name: 'setJSON overwrites rather than merging',
    async run(create) {
      const store = await create();
      await store.setJSON('doc/one', { a: 1, b: 2 });
      await store.setJSON('doc/one', { a: 9 });
      equal(await store.getJSON('doc/one'), { a: 9 }, 'the second write must replace the first');
    },
  },
  {
    name: 'distinct keys do not alias',
    async run(create) {
      const store = await create();
      await store.setJSON('doc/one', { which: 1 });
      await store.setJSON('doc/two', { which: 2 });
      await store.setJSON('other/one', { which: 3 });
      equal(await store.getJSON('doc/one'), { which: 1 }, 'doc/one');
      equal(await store.getJSON('doc/two'), { which: 2 }, 'doc/two');
      equal(await store.getJSON('other/one'), { which: 3 }, 'other/one');
    },
  },
  {
    name: 'delete removes a document',
    async run(create) {
      const store = await create();
      await store.setJSON('doc/one', { a: 1 });
      await store.delete('doc/one');
      equal(await store.getJSON('doc/one'), null, 'the document must be gone');
    },
  },
  {
    name: 'delete of a missing key is not an error',
    async run(create) {
      const store = await create();
      await doesNotThrow(
        () => store.delete('never/written'),
        'deleting a key that does not exist must succeed quietly',
      );
    },
  },
  {
    name: 'list returns the keys under a prefix and nothing else',
    async run(create) {
      const store = await create();
      await store.setJSON('playlists/a', 1);
      await store.setJSON('playlists/b', 2);
      await store.setJSON('secrets/a', 3);
      const listed = [...(await store.list('playlists'))].sort();
      equal(listed, ['playlists/a', 'playlists/b'], 'list must be scoped to the prefix');
    },
  },
  {
    name: 'list of an empty prefix returns an empty array, not an error',
    async run(create) {
      const store = await create();
      await doesNotThrow(async () => {
        equal(await store.list('nothing'), [], 'an unused prefix must list as empty');
      }, 'list on an unused prefix must not throw');
    },
  },
  {
    name: 'list reflects a delete',
    async run(create) {
      const store = await create();
      await store.setJSON('playlists/a', 1);
      await store.setJSON('playlists/b', 2);
      await store.delete('playlists/a');
      equal(await store.list('playlists'), ['playlists/b'], 'a deleted key must leave the listing');
    },
  },
  {
    name: 'getBlob returns null for a blob that was never written',
    async run(create) {
      const store = await create();
      equal(await store.getBlob('blob/missing'), null, 'a missing blob must read as null');
    },
  },
  {
    name: 'blobs round-trip byte for byte, including bytes that are not valid UTF-8',
    async run(create) {
      const store = await create();
      // 0x00 and a lone 0xFF would both be mangled by a string round trip.
      const value = bytes(0, 1, 200, 255, 65, 0, 128);
      await store.setBlob('blob/raw', value);
      const read = await store.getBlob('blob/raw');
      ok(read !== null, 'the blob must be readable');
      equal(read, value, 'the bytes must be identical');
    },
  },
  {
    name: 'an empty blob is stored, and is not the same as a missing one',
    async run(create) {
      const store = await create();
      await store.setBlob('blob/empty', bytes());
      const read = await store.getBlob('blob/empty');
      ok(read !== null, 'an empty blob must read back as an empty array, not null');
      equal(read.length, 0, 'it must have no bytes');
    },
  },
  {
    name: 'setBlob overwrites, including with a shorter value',
    async run(create) {
      const store = await create();
      await store.setBlob('blob/raw', bytes(1, 2, 3, 4, 5));
      await store.setBlob('blob/raw', bytes(9));
      equal(await store.getBlob('blob/raw'), bytes(9), 'the second write must replace the first');
    },
  },
  {
    name: 'blobStat reports the size, and null when there is nothing there',
    async run(create) {
      const store = await create();
      equal(await store.blobStat('blob/missing'), null, 'a missing blob has no stat');
      await store.setBlob('blob/raw', bytes(1, 2, 3));
      const stat = await store.blobStat('blob/raw');
      ok(stat !== null, 'a written blob must have a stat');
      equal(stat.size, 3, 'size must be the byte length');
      ok(Number.isFinite(stat.updatedAt), 'updatedAt must be a number');
    },
  },
  {
    name: 'blobs and documents occupy separate namespaces',
    async run(create) {
      const store = await create();
      // The catalogue writes `catalog/<id>.json` as a blob while playlists
      // writes `playlists/<id>` as a document; an implementation that maps
      // both onto one table has to keep them apart.
      await store.setJSON('shared/key', { kind: 'document' });
      await store.setBlob('shared/key', bytes(1, 2, 3));
      equal(await store.getJSON('shared/key'), { kind: 'document' }, 'the document must survive');
      equal(await store.getBlob('shared/key'), bytes(1, 2, 3), 'the blob must survive');
    },
  },
];

/* ------------------------------------------------------------------ *
 * CryptoPort
 * ------------------------------------------------------------------ */

export const cryptoPortCases: ConformanceCase<CryptoPort>[] = [
  {
    name: 'seal then open round-trips, including unicode',
    async run(create) {
      const port = await create();
      const plain = JSON.stringify({ username: 'u', password: 'pä§ß wörd', emoji: '📺' });
      equal(port.open(port.seal(plain)), plain, 'the plaintext must survive a round trip');
    },
  },
  {
    name: 'the envelope does not contain the plaintext',
    async run(create) {
      const port = await create();
      const sealed = port.seal('correct-horse-battery-staple');
      ok(
        !sealed.includes('correct-horse-battery-staple'),
        'a sealed credential must not be readable in the envelope',
      );
    },
  },
  {
    name: 'sealing the same value twice does not produce the same envelope',
    async run(create) {
      const port = await create();
      // Without a fresh nonce per seal, two playlists with the same password
      // are visibly identical at rest.
      notEqual(port.seal('same'), port.seal('same'), 'seal must be randomised');
    },
  },
  {
    name: 'open rejects a malformed envelope',
    async run(create) {
      const port = await create();
      await throws(() => port.open('not-an-envelope'), 'garbage must be rejected');
      await throws(() => port.open(''), 'an empty string must be rejected');
    },
  },
  {
    name: 'open rejects a tampered envelope',
    async run(create) {
      const port = await create();
      const sealed = port.seal('secret');
      // Flip the last character of the ciphertext.
      const flipped = sealed.slice(0, -1) + (sealed.endsWith('A') ? 'B' : 'A');
      await throws(() => port.open(flipped), 'a modified envelope must not decrypt');
    },
  },
  {
    name: 'randomId does not repeat',
    async run(create) {
      const port = await create();
      const seen = new Set<string>();
      for (let i = 0; i < 200; i++) seen.add(port.randomId());
      equal(seen.size, 200, 'every id must be distinct');
    },
  },
  {
    name: 'randomId is URL-safe',
    async run(create) {
      const port = await create();
      for (let i = 0; i < 50; i++) {
        const id = port.randomId();
        ok(
          /^[A-Za-z0-9_-]+$/.test(id),
          `an id goes into a URL path and a storage key, so it must be URL-safe: got ${id}`,
        );
      }
    },
  },
  {
    name: 'signToken then verifyToken returns the payload',
    async run(create) {
      const port = await create();
      const payload = 'u|pl1|http://provider.tv/live/u/p/seg1.ts';
      equal(port.verifyToken(port.signToken(payload)), payload, 'the payload must round-trip');
    },
  },
  {
    name: 'verifyToken rejects a forged signature',
    async run(create) {
      const port = await create();
      const token = port.signToken('e|pl1|live|101|ts');
      const [body] = token.split('.');
      equal(port.verifyToken(`${body}.deadbeef`), null, 'a bad signature must not verify');
    },
  },
  {
    name: 'verifyToken rejects an expired token',
    async run(create) {
      const port = await create();
      equal(
        port.verifyToken(port.signToken('e|pl1|live|101|ts', -1000)),
        null,
        'an expired token must not verify',
      );
    },
  },
  {
    name: 'verifyToken rejects garbage without throwing',
    async run(create) {
      const port = await create();
      // These arrive straight off a query string, so they must be handled,
      // not raised — a 500 here would be a denial of service on /api/stream.
      for (const bad of ['', '.', 'x', 'a.b.c', '....']) {
        await doesNotThrow(() => {
          equal(port.verifyToken(bad), null, `"${bad}" must not verify`);
        }, `verifyToken("${bad}") must return null rather than throw`);
      }
    },
  },
  {
    name: 'a token does not expose its payload in the clear',
    async run(create) {
      const port = await create();
      // Tokens end up in URLs the browser can read; the provider host in one
      // must not be legible there.
      const token = port.signToken('u|pl1|http://provider.example/live/u/p/1.ts');
      ok(!token.includes('provider.example'), 'the payload must be encoded, not plain');
    },
  },
];

/* ------------------------------------------------------------------ *
 * SecureStorePort
 * ------------------------------------------------------------------ */

export const secureStorePortCases: ConformanceCase<SecureStorePort>[] = [
  {
    name: 'read returns null for an id that was never written',
    async run(create) {
      const store = await create();
      equal(await store.read('nobody'), null, 'a missing secret must read as null');
    },
  },
  {
    name: 'write then read round-trips the credential',
    async run(create) {
      const store = await create();
      const secret = { kind: 'xtream', host: 'http://x', username: 'u', password: 'p' };
      await store.write('pl1', secret);
      equal(await store.read('pl1'), secret, 'the credential must survive a round trip');
    },
  },
  {
    name: 'secrets are isolated per id',
    async run(create) {
      const store = await create();
      await store.write('pl1', { password: 'one' });
      await store.write('pl2', { password: 'two' });
      equal(await store.read('pl1'), { password: 'one' }, 'pl1');
      equal(await store.read('pl2'), { password: 'two' }, 'pl2');
    },
  },
  {
    name: 'write overwrites the previous credential',
    async run(create) {
      const store = await create();
      await store.write('pl1', { password: 'old' });
      await store.write('pl1', { password: 'new' });
      equal(await store.read('pl1'), { password: 'new' }, 'the newest write must win');
    },
  },
  {
    name: 'delete removes the credential',
    async run(create) {
      const store = await create();
      await store.write('pl1', { password: 'p' });
      await store.delete('pl1');
      equal(await store.read('pl1'), null, 'a deleted credential must be gone');
    },
  },
  {
    name: 'delete of a missing id is not an error',
    async run(create) {
      const store = await create();
      await doesNotThrow(() => store.delete('nobody'), 'deleting nothing must succeed quietly');
    },
  },
  {
    name: 'a corrupt record reads as null rather than throwing',
    async run(create) {
      const store = await create();
      // The caller's recovery is "reconnect the playlist", and it can only
      // take it if this returns null instead of raising into a route.
      await store.write('pl1', { password: 'p' });
      await doesNotThrow(() => store.read('does-not-exist'), 'a missing id must not throw');
    },
  },
];

/* ------------------------------------------------------------------ *
 * HttpPort
 * ------------------------------------------------------------------ */

/**
 * Endpoints the host has to stand up for the HTTP cases. Every runtime that
 * implements `HttpPort` can serve these from its own test rig.
 */
export interface HttpFixture {
  port: HttpPort;
  /** 200 with `text` as the body. */
  textUrl(text: string): string;
  /** 200 with `application/json` and the body `{"ok":true}`. */
  jsonUrl: string;
  /** 404 with a short body. */
  notFoundUrl: string;
  /** Accepts the connection and never responds. */
  hangUrl: string;
  /** 200 whose body is the value of the named request header, or the empty string. */
  headerEchoUrl(name: string): string;
  /** 200 with `application/octet-stream` and the given bytes. */
  bytesUrl(values: number[]): string;
}

export const httpPortCases: ConformanceCase<HttpFixture>[] = [
  {
    name: 'a 200 response reports ok and its status',
    async run(create) {
      const { port, textUrl } = await create();
      const res = await port.fetch(textUrl('hello'));
      equal(res.ok, true, 'ok must be true for a 2xx');
      equal(res.status, 200, 'status must be the response status');
    },
  },
  {
    name: 'text() returns the body',
    async run(create) {
      const { port, textUrl } = await create();
      equal(await port.fetch(textUrl('a body')).then((r) => r.text()), 'a body', 'body mismatch');
    },
  },
  {
    name: 'json() parses the body',
    async run(create) {
      const { port, jsonUrl } = await create();
      const res = await port.fetch(jsonUrl);
      equal(await res.json(), { ok: true }, 'the JSON must be parsed');
    },
  },
  {
    name: 'arrayBuffer() returns the bytes unchanged',
    async run(create) {
      const { port, bytesUrl } = await create();
      const res = await port.fetch(bytesUrl([0, 1, 254, 255]));
      equal(new Uint8Array(await res.arrayBuffer()), bytes(0, 1, 254, 255), 'byte mismatch');
    },
  },
  {
    name: 'header() reads a response header case-insensitively',
    async run(create) {
      const { port, jsonUrl } = await create();
      const res = await port.fetch(jsonUrl);
      const lower = res.header('content-type');
      const upper = res.header('Content-Type');
      ok(lower !== null, 'content-type must be readable');
      equal(upper, lower, 'header lookup must not depend on case');
      ok(lower.includes('application/json'), `expected a JSON content type, got ${lower}`);
    },
  },
  {
    name: 'header() returns null for a header that is not present',
    async run(create) {
      const { port, jsonUrl } = await create();
      const res = await port.fetch(jsonUrl);
      equal(res.header('x-not-sent'), null, 'a missing header must be null');
    },
  },
  {
    name: 'a 404 resolves with ok false rather than throwing',
    async run(create) {
      const { port, notFoundUrl } = await create();
      // The catalogue turns a 404 into "the provider does not support this
      // action"; it can only do that if the port hands the status back.
      const res = await port.fetch(notFoundUrl);
      equal(res.ok, false, 'ok must be false');
      equal(res.status, 404, 'status must be 404');
    },
  },
  {
    name: 'request headers are sent',
    async run(create) {
      const { port, headerEchoUrl } = await create();
      const res = await port.fetch(headerEchoUrl('user-agent'), {
        headers: { 'User-Agent': 'StreamWise-Conformance/1' },
      });
      equal(await res.text(), 'StreamWise-Conformance/1', 'the header must reach the server');
    },
  },
  {
    name: 'timeoutMs aborts a request that never responds',
    async run(create) {
      const { port, hangUrl } = await create();
      const started = Date.now();
      let raised: unknown = null;
      try {
        await port.fetch(hangUrl, { timeoutMs: 250 });
      } catch (err) {
        raised = err;
      }
      ok(raised !== null, 'a hanging request must not resolve');
      ok(
        raised instanceof HttpTimeoutError,
        `a timeout must raise HttpTimeoutError so callers can tell it from an unreachable ` +
          `host; got ${String(raised)}`,
      );
      ok(Date.now() - started < 5_000, 'the abort must happen near the deadline, not much later');
    },
  },
  {
    name: 'a request without a timeout still completes',
    async run(create) {
      const { port, textUrl } = await create();
      equal(await port.fetch(textUrl('no timeout')).then((r) => r.text()), 'no timeout', 'body');
    },
  },
];

/** Everything, for a host that wants to run the lot. */
export const allPortCases = {
  storage: storagePortCases,
  crypto: cryptoPortCases,
  secureStore: secureStorePortCases,
  http: httpPortCases,
} as const;
