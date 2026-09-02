import type { StoragePort } from '@streamwise/core';

/**
 * `StoragePort` over a string-only key-value store.
 *
 * That is what every Lightning target actually offers: `localStorage` in the
 * Tizen, webOS, VIDAA and Titan web runtimes. There is no filesystem and no
 * `Buffer`, so two things need real work rather than delegation:
 *
 *   - blobs are bytes and the store holds strings, so they are base64'd;
 *   - `list(prefix)` has to be derived, because a key-value store has no
 *     directories — every key is kept under one namespace and enumerated.
 *
 * A TV client stores very little: a last channel, a favourites list, a
 * resume position. The catalogue and the EPG live on the server, which is
 * the whole reason a 50,000-entry playlist does not have to fit in a set's
 * memory budget.
 */

/** The subset of `localStorage` this needs. Keeps the adapter testable. */
export interface StringKeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

const DOC = 'd:';
const BLOB = 'b:';

/**
 * base64 without `Buffer` or `btoa`.
 *
 * `btoa` exists in the TV web runtimes, but it takes a binary *string*, so
 * using it means building a 30 MB string one charCode at a time before
 * encoding. Doing the encode directly is less code than the workaround and
 * has no intermediate.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += ALPHABET[(triple >> 18) & 63];
    out += ALPHABET[(triple >> 12) & 63];
    out += i + 1 < bytes.length ? ALPHABET[(triple >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? ALPHABET[triple & 63] : '=';
  }
  return out;
}

export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '');
  const length = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(length);
  let byte = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const chunk =
      (ALPHABET.indexOf(clean[i]) << 18) |
      (ALPHABET.indexOf(clean[i + 1]) << 12) |
      ((i + 2 < clean.length ? ALPHABET.indexOf(clean[i + 2]) : 0) << 6) |
      (i + 3 < clean.length ? ALPHABET.indexOf(clean[i + 3]) : 0);
    if (byte < length) out[byte++] = (chunk >> 16) & 255;
    if (byte < length) out[byte++] = (chunk >> 8) & 255;
    if (byte < length) out[byte++] = chunk & 255;
  }
  return out;
}

/** Exact decoded length of a base64 string, without decoding it. */
export function base64ByteLength(text: string): number {
  const clean = text.replace(/[^A-Za-z0-9+/=]/g, '');
  if (clean.length === 0) return 0;
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return (clean.length / 4) * 3 - padding;
}

export class KeyValueStorageAdapter implements StoragePort {
  constructor(
    private readonly store: StringKeyValueStore,
    /** Namespace, so the app cannot collide with anything else on the origin. */
    private readonly namespace = 'streamwise:',
  ) {}

  private docKey(key: string): string {
    return `${this.namespace}${DOC}${key}`;
  }

  private blobKey(key: string): string {
    // Documents and blobs are separately addressed: the catalogue writes
    // `catalog/<id>.json` as a blob while playlists writes `playlists/<id>`
    // as a document, and a store with one flat namespace has to keep them
    // apart or one silently overwrites the other.
    return `${this.namespace}${BLOB}${key}`;
  }

  async getJSON<T>(key: string): Promise<T | null> {
    const raw = this.store.getItem(this.docKey(key));
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // A corrupt record reads as absent. The caller's recovery is to write
      // it again, and it can only take that path if this does not throw.
      return null;
    }
  }

  async setJSON<T>(key: string, value: T): Promise<void> {
    this.store.setItem(this.docKey(key), JSON.stringify(value));
  }

  async delete(key: string): Promise<void> {
    this.store.removeItem(this.docKey(key));
    this.store.removeItem(this.blobKey(key));
    this.store.removeItem(`${this.blobKey(key)}:at`);
  }

  async list(prefix: string): Promise<string[]> {
    const full = `${this.namespace}${DOC}${prefix}/`;
    const out: string[] = [];
    for (let i = 0; i < this.store.length; i++) {
      const key = this.store.key(i);
      if (key !== null && key.startsWith(full)) {
        out.push(key.slice(this.namespace.length + DOC.length));
      }
    }
    return out;
  }

  async getBlob(key: string): Promise<Uint8Array | null> {
    const raw = this.store.getItem(this.blobKey(key));
    return raw === null ? null : fromBase64(raw);
  }

  async setBlob(key: string, value: Uint8Array): Promise<void> {
    this.store.setItem(this.blobKey(key), toBase64(value));
    this.store.setItem(`${this.blobKey(key)}:at`, String(Date.now()));
  }

  async blobStat(key: string): Promise<{ size: number; updatedAt: number } | null> {
    const raw = this.store.getItem(this.blobKey(key));
    if (raw === null) return null;
    const stamp = this.store.getItem(`${this.blobKey(key)}:at`);
    return {
      // Derived from the encoded length rather than by decoding: a snapshot
      // is tens of megabytes and `blobStat` exists precisely so a caller can
      // check it *without* paying for that.
      size: base64ByteLength(raw),
      updatedAt: stamp === null ? 0 : Number(stamp),
    };
  }
}
