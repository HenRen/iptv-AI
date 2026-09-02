/**
 * Assertions for the conformance suite.
 *
 * Hand-rolled rather than imported because this ships inside core: a
 * Lightning or React Native build runs these cases against its own port
 * implementations, and it cannot be made to depend on Vitest, Jest or Node's
 * `assert` to do it. Failures throw a plain `Error`, which every test runner
 * already understands.
 */

export class ConformanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConformanceError';
  }
}

function show(value: unknown): string {
  if (value instanceof Uint8Array) return `Uint8Array(${value.length})[${[...value].join(',')}]`;
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

export function ok(condition: boolean, message: string): asserts condition {
  if (!condition) throw new ConformanceError(message);
}

export function equal<T>(actual: T, expected: T, message: string): void {
  if (!deepEqual(actual, expected)) {
    throw new ConformanceError(`${message}\n  expected: ${show(expected)}\n  actual:   ${show(actual)}`);
  }
}

export function notEqual<T>(actual: T, unexpected: T, message: string): void {
  if (deepEqual(actual, unexpected)) {
    throw new ConformanceError(`${message}\n  both were: ${show(actual)}`);
  }
}

export async function throws(run: () => unknown | Promise<unknown>, message: string): Promise<void> {
  try {
    await run();
  } catch {
    return;
  }
  throw new ConformanceError(`${message} — but it returned normally.`);
}

export async function doesNotThrow(
  run: () => unknown | Promise<unknown>,
  message: string,
): Promise<void> {
  try {
    await run();
  } catch (err) {
    throw new ConformanceError(`${message} — but it threw: ${String(err)}`);
  }
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;

  if (a instanceof Uint8Array || b instanceof Uint8Array) {
    if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as object).sort();
    const kb = Object.keys(b as object).sort();
    if (!deepEqual(ka, kb)) return false;
    return ka.every((k) =>
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
    );
  }

  return false;
}
