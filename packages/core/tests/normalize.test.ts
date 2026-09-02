import { describe, expect, it } from 'vitest';
import {
  classifyGenre,
  containerFromUrl,
  epgKey,
  familyKey,
  isAdult,
  parseChannelName,
  parseEpisodeCode,
  parseTitleYear,
} from '@streamwise/core';

describe('parseChannelName', () => {
  it('strips a country prefix, quality token and provider noise', () => {
    const result = parseChannelName('NL | ESPN 1 FHD VIP');
    expect(result.name).toBe('ESPN 1');
    expect(result.quality).toBe('FHD');
    expect(result.country).toBe('Netherlands');
    expect(result.language).toBe('Dutch');
    expect(result.tags).toContain('VIP');
  });

  it('handles colon separators and bracketed tags', () => {
    const result = parseChannelName('US: CNN HD (Backup)');
    expect(result.name).toBe('CNN');
    expect(result.quality).toBe('HD');
    expect(result.country).toBe('United States');
    expect(result.tags).toContain('Backup');
  });

  it('handles a bare country code with no separator', () => {
    const result = parseChannelName('NL ESPN 1 HD');
    expect(result.name).toBe('ESPN 1');
    expect(result.country).toBe('Netherlands');
  });

  it('leaves an unprefixed name alone', () => {
    const result = parseChannelName('Discovery Channel');
    expect(result.name).toBe('Discovery Channel');
    expect(result.country).toBeNull();
    expect(result.quality).toBe('unknown');
  });

  it('does not strip a two-letter word that is not a country code', () => {
    const result = parseChannelName('OK Weather');
    expect(result.name).toBe('OK Weather');
    expect(result.country).toBeNull();
  });

  it('falls back to the raw name rather than producing an empty one', () => {
    const result = parseChannelName('HD');
    expect(result.name).toBe('HD');
    expect(result.ambiguous).toBe(true);
  });

  it('recognises 4K before HD', () => {
    expect(parseChannelName('NL | VIAPLAY SPORT 1 4K').quality).toBe('4K');
  });
});

describe('familyKey', () => {
  it('groups quality variants of the same service', () => {
    const a = parseChannelName('NL | ESPN 1 FHD');
    const b = parseChannelName('NL: ESPN 1 HD');
    const c = parseChannelName('NL ESPN 1 4K');
    const keys = [a, b, c].map((p) => familyKey(p.name, p.country));
    expect(new Set(keys).size).toBe(1);
  });

  it('keeps different services apart', () => {
    expect(familyKey('ESPN 1', 'Netherlands')).not.toBe(familyKey('ESPN 2', 'Netherlands'));
  });

  it('keeps the same service in different countries apart', () => {
    expect(familyKey('ESPN', 'Netherlands')).not.toBe(familyKey('ESPN', 'United States'));
  });
});

describe('epgKey', () => {
  it('matches a playlist name to an EPG display name', () => {
    expect(epgKey('ESPN 1 HD')).toBe(epgKey('ESPN 1'));
    expect(epgKey('BBC One HD')).toBe(epgKey('BBC  One'));
  });
});

describe('classifyGenre', () => {
  it.each([
    ['NL Sports', 'sports'],
    ['ESPN 1', 'sports'],
    ['CNN International', 'news'],
    ['Nickelodeon', 'kids'],
    ['Discovery Channel', 'documentary'],
    ['MTV Hits', 'music'],
    ['XXX Adult', 'adult'],
    ['NL Entertainment', 'entertainment'],
    ['NPO 1', 'entertainment'],
    ['International News', 'news'],
    ['Arabic Variety', 'international'],
    ['Zqx Feed', 'other'],
  ])('classifies %s as %s', (input, expected) => {
    expect(classifyGenre(input)).toBe(expected);
  });

  it('puts adult ahead of every other rule', () => {
    expect(classifyGenre('Adult Sports XXX')).toBe('adult');
    expect(isAdult('Adult Sports XXX')).toBe(true);
  });
});

describe('parseTitleYear', () => {
  it('extracts a trailing year', () => {
    expect(parseTitleYear('The Matrix (1999)')).toEqual({ title: 'The Matrix', year: 1999 });
    expect(parseTitleYear('Dune 2021')).toEqual({ title: 'Dune', year: 2021 });
  });

  it('strips release tags', () => {
    expect(parseTitleYear('Arrival 1080p WEB-DL x265 (2016)').title).toBe('Arrival');
  });

  it('returns a null year when there is none', () => {
    expect(parseTitleYear('Untitled Project')).toEqual({ title: 'Untitled Project', year: null });
  });
});

describe('parseEpisodeCode', () => {
  it('reads S02E07 and 2x07', () => {
    expect(parseEpisodeCode('Ted Lasso S02E07')).toEqual({ season: 2, episode: 7 });
    expect(parseEpisodeCode('Ted Lasso 2x07')).toEqual({ season: 2, episode: 7 });
  });

  it('returns null when absent', () => {
    expect(parseEpisodeCode('Ted Lasso')).toBeNull();
  });
});

describe('containerFromUrl', () => {
  it.each([
    ['http://x/live/u/p/1.m3u8', 'hls'],
    ['http://x/live/u/p/1.ts', 'mpegts'],
    ['http://x/movie/u/p/1.mp4', 'mp4'],
    ['http://x/movie/u/p/1.mkv', 'mkv'],
    ['http://x/stream', 'unknown'],
  ])('maps %s to %s', (url, expected) => {
    expect(containerFromUrl(url)).toBe(expected);
  });
});
