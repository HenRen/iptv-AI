import { describe, expect, it } from 'vitest';
import { IntentService } from '@/lib/ai/assistant/IntentService';
import { MockAIProvider } from '@/lib/ai/providers/MockAIProvider';
import { ClassificationService } from '@/lib/ai/classification/ClassificationService';
import {
  RecommendationService,
  buildSignals,
  resolveRail,
  type UserSignals,
} from '@/lib/ai/recommendations/RecommendationService';
import { findSportsEvents, detectSport, groupBySport } from '@/lib/ai/epg/SportsIntelligence';
import { EPGMatchingService } from '@/lib/ai/epg/EPGMatchingService';
import {
  PlaylistHealthService,
  buildFamilies,
  cleanView,
} from '@/lib/ai/diagnostics/PlaylistHealthService';
import { hybridSearch, parseQuery } from '@/lib/ai/search/SemanticSearchService';
import {
  evaluateRules,
  followSeriesRule,
  parseWatchRule,
} from '@/lib/ai/assistant/WatchlistService';
import { buildMockCatalog, buildMockEpg } from '@/lib/iptv/mock/provider';
import { indexPrograms } from '@/lib/iptv/xmltv/matcher';
import type { Channel, EPGProgram, Movie, Series } from '@/types';

const catalog = buildMockCatalog('t');
const ai = new MockAIProvider();

/* ------------------------------------------------------------------ */

describe('IntentService', () => {
  const service = new IntentService();

  it('maps every allowlisted action to a command', async () => {
    for (const action of service.allowedActions) {
      const intent = {
        action,
        confidence: 1,
        query: 'espn',
        entityId: action === 'OPEN_CONTENT' ? 'known' : undefined,
      };
      const resolved = service.resolve(intent, new Set(['known']));
      expect(resolved, `${action} produced no command`).not.toBeNull();
    }
  });

  it('refuses an action outside the allowlist', () => {
    // @ts-expect-error deliberately invalid
    expect(service.resolve({ action: 'RM_RF', confidence: 1 })).toBeNull();
  });

  it('refuses an entityId the caller never supplied', () => {
    expect(
      service.resolve({ action: 'OPEN_CONTENT', entityId: 'invented', confidence: 1 }),
    ).toBeNull();
    expect(
      service.resolve({ action: 'OPEN_CONTENT', entityId: 'real', confidence: 1 }, new Set(['real'])),
    ).not.toBeNull();
  });

  it('turns "play X" into a query, never a direct id', () => {
    const resolved = service.resolve({ action: 'PLAY_CHANNEL', query: 'espn', confidence: 1 });
    expect(resolved?.command).toEqual({ type: 'play-channel', query: 'espn' });
  });

  it('drops PLAY_CHANNEL with no operand rather than guessing', () => {
    expect(service.resolve({ action: 'PLAY_CHANNEL', confidence: 1 })).toBeNull();
  });

  it('always explains what it is about to do', () => {
    const resolved = service.resolve({ action: 'OPEN_GUIDE', confidence: 1 });
    expect(resolved?.spoken).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */

describe('ClassificationService', () => {
  const service = new ClassificationService(ai);

  it('classifies everything with rules and consults no model by default', async () => {
    const result = await service.organize(
      catalog.channels.map((c) => ({ id: c.id, rawName: c.rawName })),
    );
    expect(result.classifications.size).toBe(catalog.channels.length);
    expect(result.aiConsulted).toBe(0);
    expect([...result.classifications.values()].every((c) => c.source === 'rules')).toBe(true);
  });

  it('normalizes a messy provider name', async () => {
    const result = await service.organize([{ id: 'x', rawName: 'NL | ESPN 1 FHD VIP' }]);
    const hit = result.classifications.get('x')!;
    expect(hit.displayName).toBe('ESPN 1');
    expect(hit.quality).toBe('FHD');
    expect(hit.country).toBe('Netherlands');
    expect(hit.genre).toBe('sports');
  });

  it('lets a user override win over both rules and AI', async () => {
    const base = await service.organize([{ id: 'x', rawName: 'NL | ESPN 1 FHD' }]);
    const overridden = service.applyOverrides(base.classifications, [
      { channelId: 'x', displayName: 'My Sports', genre: 'news' },
    ]);
    expect(overridden.get('x')!.displayName).toBe('My Sports');
    expect(overridden.get('x')!.source).toBe('user');
    expect(overridden.get('x')!.confidence).toBe(1);
  });
});

/* ------------------------------------------------------------------ */

describe('RecommendationService', () => {
  const service = new RecommendationService();
  const signals: UserSignals = {
    channelPlays: { [catalog.channels[6].id]: 9 },
    genrePlays: { sports: 9 },
    favoriteIds: [catalog.channels[0].id],
    recentChannelIds: [catalog.channels[6].id],
    progress: {},
    hourOfDay: 20,
    dayOfWeek: 3,
  };
  const view = { channels: catalog.channels, movies: catalog.movies, series: catalog.series, nowNext: {} };

  it('only ever emits ids that exist in the catalogue', () => {
    const known = new Set(catalog.channels.map((c) => c.id));
    const rails = [...service.smartGroups(view, signals), ...service.personalRails(view, signals)];
    for (const rail of rails.filter((r) => r.kind === 'channel')) {
      for (const id of rail.itemIds) expect(known.has(id)).toBe(true);
    }
  });

  it('gives every rail a reason', () => {
    for (const rail of service.smartGroups(view, signals)) {
      expect(rail.reason.length).toBeGreaterThan(0);
    }
  });

  it('produces a "because you watch" rail from real behaviour', () => {
    const rails = service.personalRails(view, signals);
    const because = rails.find((r) => r.key === 'because-you-watch');
    expect(because?.title).toContain(catalog.channels[6].name);
  });

  it('drops rails whose ids do not resolve', () => {
    const rail = { key: 'k', title: 'T', kind: 'channel' as const, itemIds: ['nope'], reason: 'r' };
    expect(resolveRail(rail, catalog.channels)).toHaveLength(0);
  });

  it('ranks by behaviour and never invents entries', () => {
    const ranked = service.rankChannels(catalog.channels, signals);
    expect(ranked.length).toBeLessThanOrEqual(catalog.channels.length);
    expect(ranked[0].id).toBe(catalog.channels[6].id);
  });

  it('finds similar titles within the same catalogue only', () => {
    const target = catalog.movies[0];
    const similar = service.similarTo(target, catalog.movies);
    expect(similar.every((m) => m.id !== target.id)).toBe(true);
    expect(similar.every((m) => catalog.movies.some((c) => c.id === m.id))).toBe(true);
  });

  it('builds signals from history without inventing genres', () => {
    const built = buildSignals({
      channels: catalog.channels,
      history: [{ kind: 'live', id: catalog.channels[6].id }],
      favoriteIds: [],
      recentChannelIds: [],
      progress: {},
    });
    expect(built.channelPlays[catalog.channels[6].id]).toBe(1);
    expect(built.genrePlays.sports).toBe(1);
  });
});

/* ------------------------------------------------------------------ */

describe('SportsIntelligence', () => {
  it('detects sports from titles', () => {
    expect(detectSport('Live: Champions League')).toBe('football');
    expect(detectSport('Formula 1: Qualifying')).toBe('motorsport');
    expect(detectSport('UFC 300')).toBe('combat');
    expect(detectSport('Cooking Show')).toBeNull();
  });

  it('extracts teams only when the title really names two sides', () => {
    const channels: Channel[] = [{ ...catalog.channels[6] }];
    const events = findSportsEvents({
      channels,
      schedules: {
        [channels[0].id]: [
          program('p1', 'Ajax vs PSV', Date.now(), Date.now() + 7_200_000),
          program('p2', 'Live Football', Date.now(), Date.now() + 3_600_000),
        ],
      },
    });
    expect(events.find((e) => e.programId === 'p1')?.teams).toEqual(['Ajax', 'PSV']);
    expect(events.find((e) => e.programId === 'p2')?.teams).toBeNull();
  });

  it('returns nothing when there is no guide data — it does not invent fixtures', () => {
    expect(findSportsEvents({ channels: catalog.channels, schedules: {} })).toHaveLength(0);
  });

  it('ignores non-sport programmes even on a sports channel', () => {
    const channel = catalog.channels[6];
    const events = findSportsEvents({
      channels: [channel],
      schedules: { [channel.id]: [program('p', 'Cookery Hour', Date.now(), Date.now() + 3_600_000)] },
    });
    expect(events).toHaveLength(0);
  });

  it('puts live events first', () => {
    const channel = catalog.channels[6];
    const now = Date.now();
    const events = findSportsEvents({
      channels: [channel],
      schedules: {
        [channel.id]: [
          program('later', 'NBA Finals', now + 7_200_000, now + 10_800_000),
          program('now', 'Premier League', now - 600_000, now + 3_000_000),
        ],
      },
    });
    expect(events[0].programId).toBe('now');
    expect(events[0].live).toBe(true);
  });

  it('groups by sport', () => {
    const channel = catalog.channels[6];
    const events = findSportsEvents({
      channels: [channel],
      schedules: {
        [channel.id]: [
          program('a', 'Premier League', Date.now(), Date.now() + 3_600_000),
          program('b', 'NBA Finals', Date.now(), Date.now() + 3_600_000),
        ],
      },
    });
    expect(groupBySport(events).length).toBe(2);
  });
});

/* ------------------------------------------------------------------ */

describe('EPGMatchingService', () => {
  const service = new EPGMatchingService(ai);
  const channels = catalog.channels.slice(0, 3);
  const epgChannels = channels.map((c) => ({
    id: c.tvgId!,
    displayNames: [c.name],
    icon: null,
  }));

  it('matches deterministically and consults no model when it does not need to', async () => {
    const report = await service.analyze(channels, epgChannels);
    expect(report.mappings).toHaveLength(3);
    expect(report.proposals).toHaveLength(0);
    expect(report.coverage).toBe(1);
  });

  it('never returns an approved proposal', async () => {
    const orphan = [{ id: 'orphan.tv', displayNames: ['Something Else'], icon: null }];
    const unmatched: Channel[] = [{ ...channels[0], id: 'z', tvgId: null, name: 'Something Else' }];
    const report = await service.analyze(unmatched, orphan, {}, { useAi: true });
    expect(report.proposals.every((p) => p.approved === false)).toBe(true);
  });

  it('only applies proposals that were explicitly approved', () => {
    const proposals = [
      { channelId: 'a', epgChannelId: 'x', confidence: 0.9, reason: 'r', approved: false as const },
      { channelId: 'b', epgChannelId: 'y', confidence: 0.9, reason: 'r', approved: false as const },
    ];
    const overrides = service.approve(proposals, ['a']);
    expect(overrides).toEqual({ a: 'x' });
  });
});

/* ------------------------------------------------------------------ */

describe('PlaylistHealthService and clean view', () => {
  const service = new PlaylistHealthService();

  it('reports health without modifying anything', () => {
    const before = JSON.stringify(catalog.channels);
    const health = service.analyze({
      channels: catalog.channels,
      movies: catalog.movies,
      series: catalog.series,
      epgMappings: Object.fromEntries(catalog.channels.map((c) => [c.id, c.tvgId!])),
    });
    expect(JSON.stringify(catalog.channels)).toBe(before);
    expect(health.totals.channels).toBe(catalog.channels.length);
    expect(health.metrics.missingEpg).toBe(0);
  });

  it('explains the consequence of every destructive suggestion', () => {
    const health = service.analyze({
      channels: catalog.channels,
      movies: [],
      series: [],
      epgMappings: {},
    });
    for (const issue of health.issues.filter((i) => i.action)) {
      expect(issue.consequence, `${issue.id} has no consequence`).toBeTruthy();
    }
  });

  it('collapses quality variants into one family', () => {
    const families = buildFamilies(catalog.channels);
    const espn = [...families.values()].find((f) => f.name === 'ESPN 1');
    expect(espn!.variants.length).toBeGreaterThan(1);
    // Best quality first.
    expect(espn!.variants[0].quality).toBe('FHD');
  });

  it('produces a smaller clean view while keeping every stream reachable', () => {
    const clean = cleanView(catalog.channels);
    expect(clean.channels.length).toBeLessThan(catalog.channels.length);
    expect(clean.collapsed).toBeGreaterThan(0);
    const reachable = [...clean.families.values()].flatMap((f) => f.variants.map((v) => v.channelId));
    expect(new Set(reachable).size).toBe(catalog.channels.length);
  });
});

/* ------------------------------------------------------------------ */

describe('SemanticSearchService', () => {
  it('parses structured hints out of a natural query', () => {
    const parsed = parseQuery('90s action movie under 100 minutes');
    expect(parsed.decade).toBe(1990);
    expect(parsed.yearFrom).toBe(1990);
    expect(parsed.yearTo).toBe(1999);
    expect(parsed.genre).toBe('action');
    expect(parsed.maxRuntimeMins).toBe(100);
    expect(parsed.kind).toBe('movie');
  });

  it('recognises country and live hints', () => {
    const parsed = parseQuery('live dutch football');
    expect(parsed.country).toBe('Netherlands');
    expect(parsed.liveOnly).toBe(true);
  });

  it('narrows a candidate set and never adds to it', () => {
    const result = hybridSearch({
      query: 'science fiction movie',
      channels: catalog.channels,
      movies: catalog.movies,
      series: catalog.series,
      programs: [],
    });
    const known = new Set(catalog.movies.map((m) => m.id));
    expect(result.movies.every((m) => known.has(m.id))).toBe(true);
    expect(result.movies.length).toBeGreaterThan(0);
    // A movie-kind query suppresses channels entirely.
    expect(result.channels).toHaveLength(0);
  });

  it('filters by decade against real years', () => {
    const result = hybridSearch({
      query: '2010s movie',
      channels: [],
      movies: catalog.movies,
      series: [],
    });
    expect(result.movies.every((m) => m.year! >= 2010 && m.year! <= 2019)).toBe(true);
  });

  it('explains which filters it applied', () => {
    const result = hybridSearch({
      query: '90s movie under 100 minutes',
      channels: [],
      movies: catalog.movies,
      series: [],
    });
    expect(result.explanation.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */

describe('WatchlistService', () => {
  it('turns natural language into an inspectable rule', () => {
    const rule = parseWatchRule('Keep track of Formula One')!;
    expect(rule.type).toBe('EPG_MATCH');
    expect(rule.keywords).toContain('formula');
    expect(rule.category).toBe('sports');
  });

  it('builds a series-follow rule', () => {
    const rule = followSeriesRule({ id: 's1', name: 'Ted Lasso' });
    expect(rule.type).toBe('SERIES_FOLLOW');
    expect(rule.seriesId).toBe('s1');
  });

  it('matches only against real guide data', () => {
    const channel = catalog.channels[6];
    const programs = buildMockEpg([channel]);
    const byKey = indexPrograms(programs);
    const schedule = byKey.get(channel.tvgId!.toLowerCase()) ?? [];

    const rule = parseWatchRule('Keep track of Champions')!;
    const matches = evaluateRules({
      rules: [rule],
      channels: [channel],
      schedules: { [channel.id]: schedule },
      movies: [],
      series: [],
    });
    for (const match of matches) {
      expect(schedule.some((p) => p.title === match.title)).toBe(true);
    }
  });

  it('returns nothing for a rule with no real matches', () => {
    const rule = parseWatchRule('Keep track of Quidditch')!;
    const matches = evaluateRules({
      rules: [rule],
      channels: catalog.channels,
      schedules: {},
      movies: catalog.movies,
      series: catalog.series,
    });
    expect(matches).toHaveLength(0);
  });

  it('skips disabled rules', () => {
    const rule = { ...parseWatchRule('interstellar')!, enabled: false };
    const matches = evaluateRules({
      rules: [rule],
      channels: [],
      schedules: {},
      movies: catalog.movies,
      series: [],
    });
    expect(matches).toHaveLength(0);
  });

  it('matches catalogue titles that genuinely exist', () => {
    const rule = parseWatchRule('show me new interstellar')!;
    const matches = evaluateRules({
      rules: [rule],
      channels: [],
      schedules: {},
      movies: catalog.movies,
      series: [],
    });
    expect(matches.some((m) => m.title === 'Interstellar')).toBe(true);
  });
});

/* ------------------------------------------------------------------ */

function program(id: string, title: string, start: number, stop: number): EPGProgram {
  return {
    id,
    channelKey: 'k',
    title,
    description: null,
    start,
    stop,
    category: null,
    episode: null,
    icon: null,
    rating: null,
  };
}

export type { Movie, Series };
