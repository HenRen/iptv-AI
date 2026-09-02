import type { StoragePort } from '@streamwise/core';

/**
 * `StoragePort` over an AsyncStorage-shaped key-value store.
 *
 * MMKV and AsyncStorage present the same surface — async, string values,
 * `getAllKeys` — so one adapter covers both, and which one a build uses is a
 * one-line decision at the call site rather than a rewrite here.
 *
 * The shape is closer to what core wants than Lightning's `localStorage`
 * is: it is already asynchronous, and `getAllKeys` means `list()` does not
 * have to walk an index. Blobs still have to be base64'd, because the store
 * holds strings.
 *
 * A TV client keeps very little locally — a last channel, favourites, resume
 * positions. The catalogue and EPG stay on the server, which is what stops a
 * 50,000-entry playlist having to fit in the app's memory budget.
 */

/** The subset of AsyncStorage/MMKV this needs. Keeps the adapter testable. */
export interface AsyncKeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
  multiRemove?(keys: readonly string[]): Promise<void>;
}

const DOC = 'd:';
const BLOB = 'b:';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * base64 without `Buffer`.
 *
 * Hermes has no `Buffer`, and `btoa` is not in React Native's standard
 * globals either — every project ends up polyfilling one or the other. This
 * is smaller than the polyfill and has no intermediate binary string.
 */
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

export class AsyncStorageAdapter implements StoragePort {
  constructor(
    private readonly store: AsyncKeyValueStore,
    /** Namespace, so the app cannot collide with anything else on the device. */
    private readonly namespace = 'streamwise:',
  ) {}

  private docKey(key: string): string {
    return `${this.namespace}${DOC}${key}`;
  }

  private blobKey(key: string): string {
    // Documents and blobs are addressed separately: the catalogue writes
    // `catalog/<id>.json` as a blob while playlists writes `playlists/<id>`
    // as a document. One flat namespace has to keep them apart or one
    // silently overwrites the other.
    return `${this.namespace}${BLOB}${key}`;
  }

  async getJSON<T>(key: string): Promise<T | null> {
    const raw = await this.store.getItem(this.docKey(key));
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // A corrupt record reads as absent, so the caller can write it again.
      return null;
    }
  }

  async setJSON<T>(key: string, value: T): Promise<void> {
    await this.store.setItem(this.docKey(key), JSON.stringify(value));
  }

  async delete(key: string): Promise<void> {
    const keys = [this.docKey(key), this.blobKey(key), `${this.blobKey(key)}:at`];
    if (this.store.multiRemove) {
      await this.store.multiRemove(keys);
      return;
    }
    for (const k of keys) await this.store.removeItem(k);
  }

  async list(prefix: string): Promise<string[]> {
    const full = `${this.namespace}${DOC}${prefix}/`;
    const keys = await this.store.getAllKeys();
    return keys
      .filter((key) => key.startsWith(full))
      .map((key) => key.slice(this.namespace.length + DOC.length));
  }

  async getBlob(key: string): Promise<Uint8Array | null> {
    const raw = await this.store.getItem(this.blobKey(key));
    return raw === null ? null : fromBase64(raw);
  }

  async setBlob(key: string, value: Uint8Array): Promise<void> {
    await this.store.setItem(this.blobKey(key), toBase64(value));
    await this.store.setItem(`${this.blobKey(key)}:at`, String(Date.now()));
  }

  async blobStat(key: string): Promise<{ size: number; updatedAt: number } | null> {
    const raw = await this.store.getItem(this.blobKey(key));
    if (raw === null) return null;
    const stamp = await this.store.getItem(`${this.blobKey(key)}:at`);
    return {
      // From the encoded length rather than by decoding: blobStat exists so a
      // caller can check a snapshot without paying to materialise it.
      size: base64ByteLength(raw),
      updatedAt: stamp === null ? 0 : Number(stamp),
    };
  }
}
