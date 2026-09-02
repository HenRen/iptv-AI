import { beforeAll, describe, expect, it } from 'vitest';
import { configureCore, passthroughUrlGuard, rewriteManifest } from '@streamwise/core';
import { isPrivateAddress } from '../src/security/urlGuard';
import { nodeCryptoPort } from '../src/security/nodeCrypto';
import { nodeHttpPort } from '../src/http';
import { FileStorageAdapter } from '../src/storage/file';

/**
 * The Node half of the security surface: the real cipher, the real HMAC and
 * the real private-range table. `packages/core` covers the parts a TV build
 * runs; this file covers the parts only a server does.
 */
const { seal, open, signToken, verifyToken } = nodeCryptoPort;

beforeAll(() => {
  configureCore({
    storage: new FileStorageAdapter('/tmp/streamwise-tests-unused'),
    crypto: nodeCryptoPort,
    http: nodeHttpPort,
    urlGuard: passthroughUrlGuard,
  });
});

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254', // cloud metadata
    '0.0.0.0',
    '100.64.0.1',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ])('rejects %s', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700::1111'])('allows %s', (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });

  it('refuses anything unparseable', () => {
    expect(isPrivateAddress('not-an-ip')).toBe(true);
  });
});

describe('credential envelope', () => {
  it('round-trips and does not store plaintext', () => {
    const sealed = seal(JSON.stringify({ username: 'u', password: 'p' }));
    expect(sealed).not.toContain('password');
    expect(sealed.startsWith('v1.')).toBe(true);
    expect(JSON.parse(open(sealed))).toEqual({ username: 'u', password: 'p' });
  });

  it('rejects a tampered envelope', () => {
    const sealed = seal('secret');
    const parts = sealed.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => open(parts.join('.'))).toThrow();
  });
});

describe('signed playback tokens', () => {
  it('round-trips a payload', () => {
    const token = signToken('e|pl1|live|101|m3u8');
    expect(verifyToken(token)).toBe('e|pl1|live|101|m3u8');
  });

  it('rejects a forged signature', () => {
    const token = signToken('e|pl1|live|101|m3u8');
    const [body] = token.split('.');
    expect(verifyToken(`${body}.deadbeef`)).toBeNull();
  });

  it('rejects an expired token', () => {
    expect(verifyToken(signToken('e|pl1|live|101|ts', -1000))).toBeNull();
  });
});

describe('manifest rewriting, end to end', () => {
  it('mints segment tokens this server can verify', () => {
    // Core builds the token through the configured CryptoPort; this asserts
    // the two halves of the extraction still agree on the wire format.
    const out = rewriteManifest(
      '#EXTM3U\n#EXTINF:4,\nseg1.ts\n',
      'http://provider.tv/live/u/p/101.m3u8',
      'pl1',
    );
    const line = out.split('\n').find((l) => l.startsWith('/api/stream'))!;
    const token = new URL(`http://x${line}`).searchParams.get('t')!;
    expect(verifyToken(token)).toBe('u|pl1|http://provider.tv/live/u/p/seg1.ts');
  });
});
