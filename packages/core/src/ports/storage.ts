/**
 * Persistence boundary.
 *
 * The web build supplies `FileStorageAdapter` (JSON under `.data/`) from
 * `@streamwise/server`. A TV build supplies MMKV, AsyncStorage or the
 * platform's own key-value store. Introducing PostgreSQL later means
 * implementing this interface once — no call site changes.
 *
 * Nothing above this layer knows how bytes are stored.
 */
export interface StoragePort {
  /** Small JSON documents: playlists, settings, mappings, favorites. */
  getJSON<T>(key: string): Promise<T | null>;
  setJSON<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;

  /**
   * Large blobs: catalog snapshots, EPG snapshots. Streamed, not parsed.
   *
   * `Uint8Array` rather than Node's `Buffer` — `Buffer` is a subclass of it,
   * so the Node adapter satisfies this unchanged, but a TV runtime with no
   * Buffer global can implement it too.
   */
  getBlob(key: string): Promise<Uint8Array | null>;
  setBlob(key: string, value: Uint8Array): Promise<void>;
  blobStat(key: string): Promise<{ size: number; updatedAt: number } | null>;
}

export const KEYS = {
  playlists: 'playlists/index',
  playlist: (id: string) => `playlists/${id}`,
  /** Encrypted credential envelope. Never returned to the client. */
  secret: (id: string) => `secrets/${id}`,
  catalog: (id: string) => `catalog/${id}.json`,
  epg: (id: string) => `epg/${id}.json`,
  epgOverrides: (id: string) => `epg-overrides/${id}`,
  settings: 'settings/app',
  favorites: 'user/favorites',
  history: 'user/history',
  progress: 'user/progress',
  classifications: (id: string) => `classifications/${id}`,
} as const;
