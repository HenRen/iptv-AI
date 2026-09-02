import type { CryptoPort } from './crypto';
import type { StoragePort } from './storage';
import { KEYS } from './storage';

/**
 * Provider credentials at rest.
 *
 * Separate from `StoragePort` because the requirement is different: playlist
 * metadata only needs to survive a restart, whereas an IPTV username and
 * password must survive a restart *and* be unreadable to anything that gets
 * at the bytes. On a TV that distinction maps onto a real platform facility
 * — Keychain on tvOS, EncryptedSharedPreferences on Android TV — which is
 * why this is its own port rather than a convention on top of storage.
 */
export interface SecureStorePort {
  read<T>(id: string): Promise<T | null>;
  write<T>(id: string, value: T): Promise<void>;
  delete(id: string): Promise<void>;
}

/**
 * The web and server implementation: a sealed envelope in ordinary storage.
 *
 * Byte-for-byte the format the file-backed build has always written —
 * `{ sealed: "v1.<iv>.<tag>.<ciphertext>" }` under `secrets/<id>` — so an
 * existing `.data` directory keeps working across this extraction.
 */
export function sealedSecureStore(storage: StoragePort, crypto: CryptoPort): SecureStorePort {
  return {
    async read<T>(id: string): Promise<T | null> {
      const record = await storage.getJSON<{ sealed: string }>(KEYS.secret(id));
      if (!record?.sealed) return null;
      try {
        return JSON.parse(crypto.open(record.sealed)) as T;
      } catch {
        return null;
      }
    },
    async write<T>(id: string, value: T): Promise<void> {
      await storage.setJSON(KEYS.secret(id), { sealed: crypto.seal(JSON.stringify(value)) });
    },
    async delete(id: string): Promise<void> {
      await storage.delete(KEYS.secret(id));
    },
  };
}
