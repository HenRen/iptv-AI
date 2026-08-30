import 'server-only';
import path from 'node:path';
import type { StorageAdapter } from './adapter';
import { FileStorageAdapter } from './file';

export * from './adapter';

let instance: StorageAdapter | null = null;

/**
 * Swap this factory for a PostgresStorageAdapter when moving off local files.
 * Everything else in the application is already written against the interface.
 */
export function getStorage(): StorageAdapter {
  if (!instance) {
    const root = process.env.HENREN_DATA_DIR
      ? path.resolve(process.env.HENREN_DATA_DIR)
      : path.join(process.cwd(), '.data');
    instance = new FileStorageAdapter(root);
  }
  return instance;
}
