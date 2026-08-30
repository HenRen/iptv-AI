/**
 * Persistence boundary.
 *
 * v1 ships `FileStorageAdapter` (JSON under .data/). Introducing PostgreSQL
 * later means implementing this interface once — no call site changes.
 * Nothing above this layer knows how bytes are stored.
 */
export interface StorageAdapter {
  /** Small JSON documents: playlists, settings, mappings, favorites. */
  getJSON<T>(key: string): Promise<T | null>;
  setJSON<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;

  /** Large blobs: catalog snapshots, EPG snapshots. Streamed, not parsed. */
  getBlob(key: string): Promise<Buffer | null>;
  setBlob(key: string, value: Buffer): Promise<void>;
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
