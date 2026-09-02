import { HttpTimeoutError, type HttpPort, type HttpRequestOptions, type HttpResponse } from '@streamwise/core';

/**
 * `HttpPort` over global `fetch`.
 *
 * The only thing this adds to `fetch` is a hard timeout that actually aborts
 * the socket. A dead IPTV provider does not refuse a connection, it accepts
 * one and then says nothing, so without this a catalogue refresh hangs until
 * the platform's own (very long) socket timeout.
 *
 * This is the ~40 lines a Lightning or React Native build reimplements; it is
 * deliberately not in core, so core cannot reach the network on its own.
 */
export function createFetchHttpPort(fetchImpl: typeof fetch = fetch): HttpPort {
  return {
    async fetch(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
      const { timeoutMs, headers, method, body, noStore } = options;
      const controller = new AbortController();
      const timer =
        timeoutMs === undefined ? null : setTimeout(() => controller.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetchImpl(url, {
          method,
          headers,
          body,
          signal: controller.signal,
          cache: noStore ? 'no-store' : undefined,
        });
      } catch (err) {
        // An abort we caused is a timeout; an abort we did not is a caller
        // cancelling, and everything else is a transport failure.
        if (timer !== null && controller.signal.aborted) {
          throw new HttpTimeoutError(url, timeoutMs as number);
        }
        throw err;
      } finally {
        if (timer !== null) clearTimeout(timer);
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

export const nodeHttpPort: HttpPort = createFetchHttpPort();
