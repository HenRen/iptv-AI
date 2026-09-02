import { describe, expect, it } from 'vitest';
import { SearchIndex } from '@streamwise/core';
import { buildMockCatalog, buildMockEpg } from '@streamwise/core';
import { nowNext, indexPrograms } from '@streamwise/core';
import { MockAIProvider } from '@streamwise/core';

describe('SearchIndex', () => {
  const items = [
    'ESPN 1 NL Sports',
    'ESPN 2 NL Sports',
    'CNN International US News',
    'Discovery Channel Documentary',
    'Nickelodeon Kids',
  ].map((text) => ({ text }));
  const index = new SearchIndex(items);

  it('finds by prefix as the user types', () => {
    expect(index.search('esp', 10)).toHaveLength(2);
    expect(index.search('disc', 10)).toHaveLength(1);
  });

  it('ranks the closer match first', () => {
    const [first] = index.search('cnn international us news', 10);
    expect(items[first].text).toBe('CNN International US News');
  });

  it('requires every term to match', () => {
    expect(index.search('espn news', 10)).toHaveLength(0);
    expect(index.search('espn sports', 10)).toHaveLength(2);
  });

  it('returns nothing for an unknown term or an empty query', () => {
    expect(index.search('zzzz', 10)).toHaveLength(0);
    expect(index.search('', 10)).toHaveLength(0);
  });

  it('respects the limit', () => {
    expect(index.search('n', 1).length).toBeLessThanOrEqual(1);
  });

  it('stays fast on a large catalogue', () => {
    const many = Array.from({ length: 50_000 }, (_, i) => ({ text: `Channel ${i} Sports HD` }));
    const started = Date.now();
    const big = new SearchIndex(many);
    const built = Date.now() - started;

    const queryStart = Date.now();
    const hits = big.search('channel 4999', 20);
    const queried = Date.now() - queryStart;

    expect(hits.length).toBeGreaterThan(0);
    expect(built).toBeLessThan(15_000);
    // The point of the index: a keystroke must not cost a scan.
    expect(queried).toBeLessThan(500);
  });
});

describe('mock provider', () => {
  const catalog = buildMockCatalog('mock1');

  it('produces the documented shape', () => {
    expect(catalog.channels).toHaveLength(30);
    expect(catalog.movies).toHaveLength(20);
    expect(catalog.series).toHaveLength(10);
    expect(catalog.programs.length).toBeGreaterThan(0);
  });

  it('exercises the real normalization pipeline', () => {
    const espn = catalog.channels.find((c) => c.rawName === 'NL | ESPN 1 FHD');
    expect(espn?.name).toBe('ESPN 1');
    expect(espn?.quality).toBe('FHD');
    expect(espn?.genre).toBe('sports');
    expect(espn?.country).toBe('Netherlands');
  });

  it('groups the ESPN 1 quality variants into one family', () => {
    const espnFamily = catalog.channels.filter((c) => c.name === 'ESPN 1');
    expect(espnFamily.length).toBeGreaterThan(1);
    expect(new Set(espnFamily.map((c) => c.familyKey)).size).toBe(1);
  });

  it('is deterministic between builds', () => {
    const again = buildMockCatalog('mock1');
    expect(again.channels.map((c) => c.id)).toEqual(catalog.channels.map((c) => c.id));
    expect(again.movies.map((m) => m.name)).toEqual(catalog.movies.map((m) => m.name));
  });

  it('gives every series ordered seasons and episodes', () => {
    for (const series of catalog.series) {
      expect(series.seasons!.length).toBeGreaterThan(0);
      for (const season of series.seasons!) {
        const numbers = season.episodes.map((e) => e.episodeNumber);
        expect([...numbers].sort((a, b) => a - b)).toEqual(numbers);
      }
    }
  });

  it('generates a guide with something on right now for every channel', () => {
    const now = Date.now();
    const programs = buildMockEpg(catalog.channels, now);
    const byKey = indexPrograms(programs);
    for (const channel of catalog.channels) {
      const result = nowNext(byKey.get(channel.tvgId!.toLowerCase()), now);
      expect(result.now, `${channel.name} has nothing on`).not.toBeNull();
    }
  });

  it('produces a contiguous schedule with no overlaps', () => {
    const programs = buildMockEpg(catalog.channels);
    const byKey = indexPrograms(programs);
    for (const list of byKey.values()) {
      for (let i = 0; i < list.length - 1; i++) {
        expect(list[i].stop).toBeLessThanOrEqual(list[i + 1].start);
      }
    }
  });
});

describe('MockAIProvider', () => {
  const ai = new MockAIProvider();
  const context = { categories: ['Sports', 'News'], isPlaying: true };

  it.each([
    ['play ESPN', 'PLAY_CHANNEL'],
    ['next channel', 'NEXT_CHANNEL'],
    ['previous channel', 'PREVIOUS_CHANNEL'],
    ['open the guide', 'OPEN_GUIDE'],
    ['pause', 'PAUSE'],
    ['show me my favorites', 'OPEN_FAVORITES'],
    ['find a comedy', 'SEARCH'],
  ])('maps "%s" to %s', async (utterance, action) => {
    const intent = await ai.parseIntent(utterance, context);
    expect(intent?.action).toBe(action);
  });

  it('extracts the target of a play command as a query, not an id', () => {
    return ai.parseIntent('play ESPN 1', context).then((intent) => {
      expect(intent?.query).toBe('espn 1');
      expect(intent?.entityId).toBeUndefined();
    });
  });

  it('falls back to search rather than guessing', async () => {
    const intent = await ai.parseIntent('something about space', context);
    expect(intent?.action).toBe('SEARCH');
    expect(intent?.confidence).toBeLessThan(0.5);
  });

  it('only ranks ids it was given', async () => {
    const ranked = await ai.rankForUser(['a', 'b', 'c'], {
      channelPlays: { b: 10 },
      genrePlays: {},
      favoriteIds: ['c'],
      hourOfDay: 20,
      dayOfWeek: 5,
    });
    expect(ranked[0]).toBe('b');
    expect([...ranked].sort()).toEqual(['a', 'b', 'c']);
  });

  it('returns null rather than inventing a summary', async () => {
    expect(await ai.summarize({ plot: null })).toBeNull();
    expect(await ai.summarize({ plot: '' })).toBeNull();
  });

  it('proposes EPG matches unapproved, and only above the threshold', async () => {
    const proposals = await ai.proposeEpgMatches(
      [
        { id: 'c1', name: 'ESPN 1' },
        { id: 'c2', name: 'Totally Unrelated' },
      ],
      [{ id: 'espn1.nl', names: ['ESPN 1 Netherlands'] }],
    );
    expect(proposals.every((p) => p.approved === false)).toBe(true);
    expect(proposals.map((p) => p.channelId)).not.toContain('c2');
  });
});
