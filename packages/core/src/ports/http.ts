/**
 * Outbound HTTP boundary.
 *
 * Core describes the response shape it needs rather than referencing the DOM
 * `Response` type, so `packages/core` compiles with `"lib": ["ES2022"]` and
 * no DOM lib. Every implementation so far is a thin wrapper over global
 * `fetch` plus an `AbortController` timeout — the timeout is part of the
 * contract because a dead IPTV provider otherwise hangs a request forever.
 */
export interface HttpResponse {
  readonly ok: boolean;
  readonly status: number;
  /** Case-insensitive, as in the Fetch standard. */
  header(name: string): string | null;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  /**
   * A string body only. Core never uploads a stream, and keeping it to a
   * string means an implementation needs nothing but its platform's fetch.
   */
  body?: string;
  /** Hard ceiling on the whole request. Implementations must abort, not just reject. */
  timeoutMs?: number;
  /** Bypass any intermediate cache. */
  noStore?: boolean;
}

export interface HttpPort {
  fetch(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
}

/**
 * Thrown by an implementation when `timeoutMs` elapses.
 *
 * Distinguishing a timeout from an unreachable host matters to the user —
 * "the provider timed out" and "the provider was unreachable" send them to
 * different fixes — and `AbortError` is not something core can name without
 * the DOM lib, so the port raises this instead.
 */
export class HttpTimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(`Request to ${url} timed out after ${timeoutMs}ms.`);
    this.name = 'HttpTimeoutError';
  }
}
