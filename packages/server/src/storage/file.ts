import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { StoragePort } from '@streamwise/core';

/**
 * Development / self-host persistence: plain files under `.data/`.
 *
 * Writes are atomic (write to a temp file, then rename) so an interrupted
 * catalog refresh can never leave a half-written snapshot behind.
 */
export class FileStorageAdapter implements StoragePort {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    // Keys are internal, but treat them as untrusted anyway.
    const safe = key
      .split('/')
      .filter((seg) => seg && seg !== '.' && seg !== '..')
      .join('/');
    return path.join(this.root, safe);
  }

  private async writeAtomic(file: string, data: Uint8Array | string) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, data, { mode: 0o600 });
    await fs.rename(tmp, file);
  }

  async getJSON<T>(key: string): Promise<T | null> {
    try {
      const raw = await fs.readFile(`${this.resolve(key)}.json`, 'utf8');
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async setJSON<T>(key: string, value: T): Promise<void> {
    await this.writeAtomic(`${this.resolve(key)}.json`, JSON.stringify(value));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(`${this.resolve(key)}.json`, { force: true });
    await fs.rm(this.resolve(key), { force: true });
  }

  async list(prefix: string): Promise<string[]> {
    try {
      const dir = this.resolve(prefix);
      const names = await fs.readdir(dir);
      return names.filter((n) => n.endsWith('.json')).map((n) => `${prefix}/${n.slice(0, -5)}`);
    } catch {
      return [];
    }
  }

  async getBlob(key: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(this.resolve(key));
    } catch {
      return null;
    }
  }

  async setBlob(key: string, value: Uint8Array): Promise<void> {
    await this.writeAtomic(this.resolve(key), value);
  }

  async blobStat(key: string) {
    try {
      const s = await fs.stat(this.resolve(key));
      return { size: s.size, updatedAt: s.mtimeMs };
    } catch {
      return null;
    }
  }
}
