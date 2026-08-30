import { describe, expect, it } from 'vitest';
import { isPrivateAddress, hostnameOf } from '@/lib/security/urlGuard';
import { assertNoSecrets, validateIntent } from '@/lib/ai/providers/OpenAIProvider';
import { redact } from '@/lib/iptv/xtream/client';
import { rewriteManifest } from '@/lib/iptv/hls';
import { seal, open, signToken, verifyToken } from '@/lib/security/crypto';
import { decodeToken } from '@/lib/iptv/streamSource';

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
  const base = new URL('http://provider.tv/live/u/p/101.m3u8');

  it('routes segment URLs back through the proxy', () => {
    const out = rewriteManifest('#EXTM3U\n#EXTINF:4,\nseg1.ts\n', base, 'pl1');
    const line = out.split('\n').find((l) => l.startsWith('/api/stream'));
    expect(line).toBeDefined();
    const token = new URL(`http://x${line}`).searchParams.get('t')!;
    expect(verifyToken(token)).toBe('u|pl1|http://provider.tv/live/u/p/seg1.ts');
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
