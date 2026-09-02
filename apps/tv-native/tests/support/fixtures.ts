import type { AsyncKeyValueStore } from '../../src/platform/storage';

/**
 * A faithful stand-in for AsyncStorage / MMKV.
 *
 * Same surface: asynchronous, string values, `getAllKeys`. Faithful matters
 * here — a synchronous fake would hide an interleaving bug, and one that
 * stored values without coercing would hide a missing `JSON.stringify`.
 */
export class MemoryAsyncStore implements AsyncKeyValueStore {
  private readonly map = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  async setItem(key: string, value: string): Promise<void> {
    this.map.set(key, String(value));
  }
  async removeItem(key: string): Promise<void> {
    this.map.delete(key);
  }
  async getAllKeys(): Promise<readonly string[]> {
    return [...this.map.keys()];
  }
  keys(): string[] {
    return [...this.map.keys()];
  }
}

/** The same store without `multiRemove`, which is optional on the interface. */
export class MemoryAsyncStoreNoMulti extends MemoryAsyncStore {}

/** With `multiRemove`, which AsyncStorage and MMKV both provide. */
export class MemoryAsyncStoreWithMulti extends MemoryAsyncStore {
  async multiRemove(keys: readonly string[]): Promise<void> {
    for (const key of keys) await this.removeItem(key);
  }
}
