import { HttpTimeoutError, type HttpPort, type HttpRequestOptions, type HttpResponse } from '@streamwise/core';

/**
 * `HttpPort` for the TV web runtimes.
 *
 * Lightning renders WebGL, but it still runs inside a browser engine, so
 * `fetch` and `AbortController` are both there. This is very nearly the same
 * forty lines as `@streamwise/server/http.ts` — deliberately, because the
 * point of the port is that the difference between platforms is this small.
 *
 * The timeout is not optional decoration. An IPTV backend on a home LAN
 * behind a set-top box does not refuse a connection when it is unwell, it
 * accepts one and goes quiet; without an abort the guide simply never loads
 * and the user sees a spinner forever.
 */

/** The subset of `fetch` this needs, so the adapter is testable off-device. */
export interface FetchLike {
  (
    url: string,
    init: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      signal?: unknown;
      cache?: string;
    },
  ): Promise<{
    ok: boolean;
    status: number;
    headers: { get(name: string): string | null };
    text(): Promise<string>;
    json(): Promise<unknown>;
    arrayBuffer(): Promise<ArrayBuffer>;
  }>;
}

export interface AbortControllerLike {
  readonly signal: unknown;
  abort(): void;
}

export interface TvHttpDeps {
  fetch: FetchLike;
  AbortController: new () => AbortControllerLike;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

export function createTvHttpPort(deps: TvHttpDeps): HttpPort {
  return {
    async fetch(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
      const { timeoutMs, headers, method, body, noStore } = options;
      const controller = new deps.AbortController();
      let timedOut = false;
      const timer =
        timeoutMs === undefined
          ? null
          : deps.setTimeout(() => {
              timedOut = true;
              controller.abort();
            }, timeoutMs);

      let res: Awaited<ReturnType<FetchLike>>;
      try {
        res = await deps.fetch(url, {
          method,
          headers,
          body,
          signal: controller.signal,
          cache: noStore ? 'no-store' : undefined,
        });
      } catch (err) {
        // A flag rather than reading `signal.aborted`: the signal is opaque
        // here (it is whatever the platform's AbortController produced), and
        // only this adapter knows whether it was the one that aborted.
        if (timedOut) throw new HttpTimeoutError(url, timeoutMs as number);
        throw err;
      } finally {
        if (timer !== null) deps.clearTimeout(timer);
      }

      return {
        ok: res.ok,
        status: res.status,
        header: (name: string) => res.headers.get(name),
        text: () => res.text(),
        json: <T>() => res.json() as Promise<T>,
        arrayBuffer: () => res.arrayBuffer(),
      };
    },
  };
}

/**
 * Bound to the runtime's own globals.
 *
 * This is the only line in the app that assumes a browser engine, which is
 * what keeps everything above it testable in Node.
 */
export function tvHttpPort(g: Record<string, unknown> = globalThis as never): HttpPort {
  return createTvHttpPort({
    fetch: g.fetch as FetchLike,
    AbortController: g.AbortController as new () => AbortControllerLike,
    setTimeout: g.setTimeout as (fn: () => void, ms: number) => unknown,
    clearTimeout: g.clearTimeout as (handle: unknown) => void,
  });
}
