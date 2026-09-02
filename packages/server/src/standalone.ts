import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { bootServer } from './runtime';

import * as ai from './routes/ai';
import * as catalog from './routes/catalog';
import * as diagnostics from './routes/diagnostics';
import * as epg from './routes/epg';
import * as image from './routes/image';
import * as play from './routes/play';
import * as playlistRefresh from './routes/playlistRefresh';
import * as playlists from './routes/playlists';
import * as search from './routes/search';
import * as series from './routes/series';
import * as settings from './routes/settings';
import * as stream from './routes/stream';

/**
 * The API, served on its own.
 *
 * `apps/web` mounts these same handlers through Next.js; a Lightning or
 * React Native TV app has no Next.js, so it talks to this instead. The
 * handlers are ordinary `Request -> Response` functions, which is the whole
 * reason they could be lifted out of the route files: nothing in them knows
 * which of the two is hosting it.
 */

/**
 * A route module's handler. The `ctx.params` shape differs per route — Next
 * types each one to its own segment names — so the router keeps it opaque
 * and each handler destructures what it declared.
 */
type Handler = (req: Request, ctx: never) => Promise<Response>;

interface Route {
  /** Matched against the pathname; `:name` captures one segment. */
  pattern: string;
  handlers: Record<string, unknown>;
}

const ROUTES: Route[] = [
  { pattern: '/api/catalog', handlers: catalog },
  { pattern: '/api/ai', handlers: ai },
  { pattern: '/api/search', handlers: search },
  { pattern: '/api/image', handlers: image },
  { pattern: '/api/settings', handlers: settings },
  { pattern: '/api/play', handlers: play },
  { pattern: '/api/playlists', handlers: playlists },
  { pattern: '/api/playlists/:id/refresh', handlers: playlistRefresh },
  { pattern: '/api/epg', handlers: epg },
  { pattern: '/api/stream', handlers: stream },
  { pattern: '/api/diagnostics', handlers: diagnostics },
  { pattern: '/api/series/:id', handlers: series },
];

function match(pattern: string, pathname: string): Record<string, string> | null {
  const p = pattern.split('/');
  const a = pathname.split('/');
  if (p.length !== a.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) {
      if (!a[i]) return null;
      params[p[i].slice(1)] = decodeURIComponent(a[i]);
    } else if (p[i] !== a[i]) {
      return null;
    }
  }
  return params;
}

/** Node's IncomingMessage -> the standard Request the handlers expect. */
function toRequest(req: IncomingMessage, origin: string): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) headers.append(key, v);
  }
  const method = req.method ?? 'GET';
  const hasBody = method !== 'GET' && method !== 'HEAD';
  return new Request(new URL(req.url ?? '/', origin), {
    method,
    headers,
    // Node streams are async-iterable, which is all Request needs; `duplex`
    // is required by the spec whenever a body is a stream.
    body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
    ...(hasBody ? { duplex: 'half' } : {}),
  } as RequestInit);
}

async function send(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  if (!response.body) {
    res.end();
    return;
  }
  // Piped rather than buffered: a stream response is a video, and buffering
  // it would hold an entire programme in memory.
  Readable.fromWeb(response.body as never).pipe(res);
}

export function createApiServer() {
  bootServer();

  return createServer((req, res) => {
    void (async () => {
      const origin = `http://${req.headers.host ?? 'localhost'}`;
      const pathname = new URL(req.url ?? '/', origin).pathname.replace(/\/+$/, '') || '/';

      for (const route of ROUTES) {
        const params = match(route.pattern, pathname);
        if (!params) continue;
        const handler = route.handlers[req.method ?? 'GET'] as Handler | undefined;
        if (typeof handler !== 'function') {
          res.statusCode = 405;
          res.end();
          return;
        }
        try {
          const response = await handler(toRequest(req, origin), {
            params: Promise.resolve(params),
          } as never);
          await send(res, response);
        } catch (err) {
          // The handlers redact their own errors; anything reaching here is a
          // bug in the host, so say nothing useful to the caller.
          console.error('[streamwise] unhandled route error', err);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'An unexpected error occurred.' }));
        }
        return;
      }

      res.statusCode = 404;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'Not found.' }));
    })();
  });
}

const port = Number(process.env.PORT ?? 3211);
const host = process.env.HOST ?? '127.0.0.1';

createApiServer().listen(port, host, () => {
  console.log(`[streamwise] API listening on http://${host}:${port}`);
});
