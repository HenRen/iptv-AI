import { beforeAll, describe, expect, it } from 'vitest';
import {
  assertNoSecrets,
  crypto,
  decodeToken,
  hostnameOf,
  redact,
  rewriteManifest,
  validateIntent,
} from '@streamwise/core';
import { configureForTest } from './support/doubles';

/**
 * The platform-neutral half of the security surface.
 *
 * The Node implementations — AES-GCM envelopes, HMAC tokens and the SSRF
 * guard's DNS work — are tested against the real thing in
 * `packages/server/tests/security.test.ts`. What is left here is the logic a
 * TV build runs too, and it is tested with a deliberately fake CryptoPort so
 * a failure points at the logic rather than at the cipher.
 */
beforeAll(() => {
  configureForTest();
});

describe('hostnameOf', () => {
  it('extracts a host with or without a scheme', () => {
    expect(hostnameOf('http://line.example.tv:8080/x')).toBe('line.example.tv');
    expect(hostnameOf('line.example.tv')).toBe('line.example.tv');
  });
});

describe('redact', () => {
  it('removes credentials from a message before it is logged or shown', () => {
    const message = 'failed: http://x/player_api.php?username=abc123&password=secret999';
    const clean = redact(message);
    expect(clean).not.toContain('abc123');
    expect(clean).not.toContain('secret999');
    expect(clean).toContain('username=***');
  });

  it('removes inline userinfo credentials', () => {
    expect(redact('http://user:pass@host/x')).toBe('http://***:***@host/x');
  });
});

describe('playback tokens', () => {
  it('decodes both token shapes and refuses anything else', () => {
    expect(decodeToken('e|pl1|live|101|ts')?.target).toEqual({
      type: 'entity',
      kind: 'live',
      streamId: '101',
      ext: 'ts',
    });
    expect(decodeToken('u|pl1|http://x/a.ts')?.target).toEqual({
      type: 'url',
      url: 'http://x/a.ts',
    });
    expect(decodeToken('e|pl1|badkind|1|ts')).toBeNull();
    expect(decodeToken('garbage')).toBeNull();
  });
});

describe('rewriteManifest', () => {
  const base = 'http://provider.tv/live/u/p/101.m3u8';

  it('routes segment URLs back through the proxy', () => {
    const out = rewriteManifest('#EXTM3U\n#EXTINF:4,\nseg1.ts\n', base, 'pl1');
    const line = out.split('\n').find((l) => l.startsWith('/api/stream'));
    expect(line).toBeDefined();
    const token = new URL(`http://x${line}`).searchParams.get('t')!;
    expect(crypto().verifyToken(token)).toBe('u|pl1|http://provider.tv/live/u/p/seg1.ts');
  });

  it('rewrites URI attributes on tags too', () => {
    const out = rewriteManifest('#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n', base, 'pl1');
    expect(out).toContain('URI="/api/stream?t=');
    expect(out).not.toContain('URI="key.bin"');
  });

  it('leaves other tags and blank lines untouched', () => {
    const out = rewriteManifest('#EXTM3U\n\n#EXT-X-VERSION:3\n', base, 'pl1');
    expect(out).toContain('#EXT-X-VERSION:3');
  });

  it('never leaves a provider host in the output', () => {
    const out = rewriteManifest(
      '#EXTM3U\nhttp://provider.tv/live/u/p/seg1.ts\nseg2.ts\n',
      base,
      'pl1',
    );
    expect(out).not.toContain('provider.tv');
  });
});

describe('AI guard rails', () => {
  it('refuses to send credential-shaped text to a model', () => {
    expect(() => assertNoSecrets('http://x/player_api.php?username=a&password=b')).toThrow();
    expect(() => assertNoSecrets('http://x/live/user/pass/101.ts')).toThrow();
    expect(() => assertNoSecrets('play espn')).not.toThrow();
  });

  it('drops an action outside the allowlist', () => {
    expect(validateIntent({ action: 'DELETE_EVERYTHING' })).toBeNull();
    expect(validateIntent({ action: 'PLAY_CHANNEL' })?.action).toBe('PLAY_CHANNEL');
  });

  it('drops an entityId the caller did not offer as a candidate', () => {
    expect(validateIntent({ action: 'OPEN_CONTENT', entityId: 'made-up' })).toBeNull();
    expect(
      validateIntent({ action: 'OPEN_CONTENT', entityId: 'real' }, new Set(['real']))?.entityId,
    ).toBe('real');
  });

  it('clamps confidence and truncates free text', () => {
    const intent = validateIntent({ action: 'SEARCH', confidence: 99, query: 'x'.repeat(500) });
    expect(intent?.confidence).toBe(1);
    expect(intent?.query?.length).toBe(200);
  });
});
