/**
 * Symmetric crypto boundary.
 *
 * Core never imports `node:crypto`. The web and standalone server supply
 * `nodeCryptoPort` from `@streamwise/server` (AES-256-GCM + HMAC-SHA256); a
 * TV build supplies the platform equivalent.
 *
 * Deliberately synchronous. Every call site here is a short, in-memory
 * operation on a credential envelope or a proxy token, and making it async
 * would turn a dozen pure functions into promise chains for no gain. A
 * WebCrypto-based implementation should wrap a synchronous AES/HMAC routine
 * rather than force `subtle` through this interface.
 */
export interface CryptoPort {
  /** Encrypt a string into a self-describing, authenticated envelope. */
  seal(plain: string): string;
  /** Reverse `seal`. Throws if the envelope is malformed or the tag fails. */
  open(sealed: string): string;
  /** URL-safe random identifier. */
  randomId(bytes?: number): string;
  /** Short-lived signature over `payload`, carrying its own expiry. */
  signToken(payload: string, ttlMs?: number): string;
  /** The payload if the signature and expiry both hold, else null. */
  verifyToken(token: string): string | null;
}
