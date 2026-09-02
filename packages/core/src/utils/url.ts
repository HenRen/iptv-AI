/**
 * URL helpers that are pure string work.
 *
 * `hostnameOf` lives here rather than in the server's SSRF guard because it
 * makes no network call and core needs it to derive a playlist's host — the
 * guard then uses the same function to build its allowlist.
 */

/** Extract the bare hostname from a user-entered host string. */
export function hostnameOf(input: string): string | null {
  const withScheme = /^https?:\/\//i.test(input) ? input : `http://${input}`;
  try {
    return new URL(withScheme).hostname.toLowerCase();
  } catch {
    return null;
  }
}
