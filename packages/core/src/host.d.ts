/**
 * The host contract.
 *
 * `packages/core` compiles with `"lib": ["ES2022"]` and no `@types/node`, so
 * none of the WHATWG globals are in scope by default. Rather than pull in
 * the whole DOM lib — which would let `document` and `window` slip into core
 * unnoticed — this file states exactly which host APIs core assumes, and
 * nothing else compiles.
 *
 * Every runtime core targets provides these: browsers, Node 18+, Lightning 3
 * and react-native-tvos (URL via `react-native-url-polyfill`, TextEncoder
 * via `text-encoding` or Hermes' built-in). Adding to this list is a real
 * decision about what a TV platform must supply, so keep it short.
 *
 * Deliberately absent: `fetch`, `Response`, `AbortController`, `setTimeout`.
 * Outbound HTTP goes through `HttpPort`, so core cannot reach the network
 * behind the platform's back.
 */

declare class URLSearchParams {
  constructor(init?: string | Record<string, string> | [string, string][]);
  get(name: string): string | null;
  set(name: string, value: string): void;
  append(name: string, value: string): void;
  has(name: string): boolean;
  delete(name: string): void;
  toString(): string;
  forEach(cb: (value: string, key: string) => void): void;
  [Symbol.iterator](): IterableIterator<[string, string]>;
}

declare class URL {
  constructor(url: string, base?: string | URL);
  hash: string;
  host: string;
  hostname: string;
  href: string;
  readonly origin: string;
  password: string;
  pathname: string;
  port: string;
  protocol: string;
  search: string;
  readonly searchParams: URLSearchParams;
  username: string;
  toString(): string;
  toJSON(): string;
}

declare class TextEncoder {
  encode(input?: string): Uint8Array;
}

declare class TextDecoder {
  constructor(label?: string);
  decode(input?: Uint8Array | ArrayBuffer): string;
}
