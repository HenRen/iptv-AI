import crypto from 'node:crypto';
import type { CryptoPort } from '@streamwise/core';

/**
 * Credential envelope encryption — the Node implementation of `CryptoPort`.
 *
 * IPTV usernames and passwords are treated as secrets: encrypted at rest with
 * AES-256-GCM, decrypted only inside a server route that is about to talk to
 * the provider, and never serialized into anything the browser can read.
 *
 * The envelope format (`v1.<iv>.<tag>.<ciphertext>`, base64url) is unchanged
 * from before the core extraction, so an existing `.data` directory keeps
 * working.
 */

const ALGO = 'aes-256-gcm';

/**
 * Resolve the master secret.
 *
 * A missing secret is fatal in production and a fixed key in development —
 * the same rule as before, kept here rather than in core because "what counts
 * as production" is a deployment concern.
 */
export function resolveSecret(
  secret = process.env.HENREN_SECRET,
  isProduction = process.env.NODE_ENV === 'production',
): Buffer {
  if (!secret || secret.length < 16) {
    if (isProduction) {
      throw new Error(
        'HENREN_SECRET is not set. Generate one with `openssl rand -hex 32` and put it in .env.local.',
      );
    }
    // Development convenience only — a fixed dev key, never used in prod.
    return crypto.createHash('sha256').update('henren-dev-key').digest();
  }
  return crypto.createHash('sha256').update(secret).digest();
}

export function createNodeCryptoPort(keyFor: () => Buffer = () => resolveSecret()): CryptoPort {
  // Resolved per call, not memoized, so a secret rotated in the environment
  // takes effect without a restart — and so a dev server that starts before
  // .env.local is read does not cache the fallback key.
  const key = keyFor;

  const seal = (plain: string): string => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGO, key(), iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
  };

  const open = (sealed: string): string => {
    const [version, ivB64, tagB64, dataB64] = sealed.split('.');
    if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) {
      throw new Error('Malformed credential envelope.');
    }
    const decipher = crypto.createDecipheriv(ALGO, key(), Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  };

  const randomId = (bytes = 9): string => crypto.randomBytes(bytes).toString('base64url');

  /**
   * Short-lived signature for proxy URLs. Stops the stream proxy from being
   * usable as a general-purpose open proxy even by a page on the same origin.
   */
  const signToken = (payload: string, ttlMs = 12 * 60 * 60 * 1000): string => {
    const exp = Date.now() + ttlMs;
    const body = `${payload}|${exp}`;
    const mac = crypto.createHmac('sha256', key()).update(body).digest('base64url');
    return `${Buffer.from(body).toString('base64url')}.${mac}`;
  };

  const verifyToken = (token: string): string | null => {
    const [bodyB64, mac] = token.split('.');
    if (!bodyB64 || !mac) return null;
    const body = Buffer.from(bodyB64, 'base64url').toString('utf8');
    const expected = crypto.createHmac('sha256', key()).update(body).digest('base64url');
    const a = Buffer.from(mac);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const sep = body.lastIndexOf('|');
    const exp = Number(body.slice(sep + 1));
    if (!Number.isFinite(exp) || exp < Date.now()) return null;
    return body.slice(0, sep);
  };

  return { seal, open, randomId, signToken, verifyToken };
}

/** The port the web app and the standalone server both install. */
export const nodeCryptoPort: CryptoPort = createNodeCryptoPort();
