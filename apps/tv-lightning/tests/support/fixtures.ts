import { createServer, type Server } from 'node:http';
import type { Socket } from 'node:net';
import type { HttpFixture } from '@streamwise/core/testing';
import type { StringKeyValueStore } from '../../src/platform/storage';
import { createTvHttpPort, type FetchLike } from '../../src/platform/http';

/**
 * Stand-ins for the two platform APIs a TV supplies.
 *
 * Neither pretends to be the real thing. `MemoryKeyValueStore` is a faithful
 * `localStorage` — same string-only, index-enumerable shape — so the adapter
 * logic above it is genuinely exercised. The fetch fixture is a real socket
 * served by Node, because a timeout that is never actually attempted is not
 * a tested timeout.
 */

export class MemoryKeyValueStore implements StringKeyValueStore {
  private readonly map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    // localStorage coerces; a store that did not would hide a bug where the
    // adapter forgets to stringify.
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  get length(): number {
    return this.map.size;
  }
  keys(): string[] {
    return [...this.map.keys()];
  }
}

export async function startFetchFixture(): Promise<HttpFixture & { close(): Promise<void> }> {
  const open = new Set<Socket>();

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://fixture');
    const path = url.pathname;

    if (path === '/text') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(url.searchParams.get('body') ?? '');
      return;
    }
    if (path === '/json') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (path === '/bytes') {
      const values = (url.searchParams.get('values') ?? '').split(',').filter(Boolean).map(Number);
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(Buffer.from(values));
      return;
    }
    if (path === '/header') {
      const name = (url.searchParams.get('name') ?? '').toLowerCase();
      const value = req.headers[name];
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(Array.isArray(value) ? value.join(', ') : (value ?? ''));
      return;
    }
    if (path === '/hang') {
      // No headers either: a provider that accepted the socket and stopped.
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('nope');
  });

  server.on('connection', (socket) => {
    open.add(socket);
    socket.on('close', () => open.delete(socket));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('fixture has no port');
  const base = `http://127.0.0.1:${address.port}`;

  const port = createTvHttpPort({
    fetch: globalThis.fetch as unknown as FetchLike,
    AbortController: globalThis.AbortController,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  });

  return {
    port,
    textUrl: (text) => `${base}/text?body=${encodeURIComponent(text)}`,
    jsonUrl: `${base}/json`,
    notFoundUrl: `${base}/missing`,
    hangUrl: `${base}/hang`,
    headerEchoUrl: (name) => `${base}/header?name=${encodeURIComponent(name)}`,
    bytesUrl: (values) => `${base}/bytes?values=${values.join(',')}`,
    async close() {
      for (const socket of open) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
