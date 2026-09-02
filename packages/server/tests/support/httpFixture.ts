import { createServer, type Server } from 'node:http';
import type { HttpFixture } from '@streamwise/core/testing';
import { nodeHttpPort } from '../../src/http';

/**
 * A throwaway origin for the `HttpPort` conformance cases.
 *
 * Everything the suite needs — a body, a JSON document, a 404, a header
 * echo, raw bytes, and one endpoint that accepts the connection and then
 * says nothing — served locally so the cases never touch the network.
 */
export async function startHttpFixture(): Promise<HttpFixture & { close(): Promise<void> }> {
  const open = new Set<import('node:net').Socket>();

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
      // Headers withheld too: this has to look like a provider that accepted
      // the socket and then stopped, which is the case a timeout is for.
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('nope');
  });

  // A request left hanging keeps its socket open; without this the process
  // will not exit at the end of the run.
  server.on('connection', (socket) => {
    open.add(socket);
    socket.on('close', () => open.delete(socket));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('fixture has no port');
  const base = `http://127.0.0.1:${address.port}`;

  return {
    port: nodeHttpPort,
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
