import {
  getLiveCategories,
  getLiveChannels,
  getMovies,
  getNowNext,
  getSeriesPage,
  search as catalogSearch,
  getEPG,
} from '@/lib/iptv/IPTVService';
import { getActivePlaylist } from '@/lib/iptv/playlists';
import { loadCatalog, loadEpg } from '@/lib/iptv/catalog';
import { getAIProvider } from '@/lib/ai/AIService';
import { IntentService } from '@/lib/ai/assistant/IntentService';
import { hybridSearch } from '@/lib/ai/search/SemanticSearchService';
import {
  RecommendationService,
  resolveRail,
  type UserSignals,
} from '@/lib/ai/recommendations/RecommendationService';
import { findSportsEvents, groupBySport } from '@/lib/ai/epg/SportsIntelligence';
import { PlaylistHealthService, cleanView } from '@/lib/ai/diagnostics/PlaylistHealthService';
import { evaluateRules, type WatchRule } from '@/lib/ai/assistant/WatchlistService';
import { fail, fromError, limited, ok } from '../_lib/respond';
import { HOUR } from '@/lib/utils/time';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The AI layer's server surface.
 *
 * Every branch resolves its output against the loaded catalogue before
 * returning. Nothing here can emit a channel, programme, movie or series that
 * is not in the user's own playlist — which is the whole contract of the AI
 * layer, enforced at the boundary rather than trusted to a prompt.
 */
export async function POST(req: Request) {
  const rateLimited = limited(req, 'ai', { rate: 6, burst: 20 });
  if (rateLimited) return rateLimited;

  let body: {
    op?: string;
    utterance?: string;
    query?: string;
    signals?: Partial<UserSignals>;
    rules?: WatchRule[];
    useAi?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return fail('Malformed request body.');
  }

  const playlistId = (await getActivePlaylist())?.id;
  if (!playlistId) return fail('Connect a playlist first.', 409);

  try {
    switch (body.op) {
      case 'intent':
        return ok(await handleIntent(playlistId, body.utterance ?? '', body.query));
      case 'search':
        return ok(await handleSearch(playlistId, body.query ?? ''));
      case 'rails':
        return ok(await handleRails(playlistId, body.signals ?? {}));
      case 'sports':
        return ok(await handleSports(playlistId));
      case 'health':
        return ok(await handleHealth(playlistId));
      case 'watchlist':
        return ok(await handleWatchlist(playlistId, body.rules ?? []));
      case 'explain':
        return ok(await handleExplain(playlistId, body.query ?? ''));
      default:
        return fail('Unknown AI operation.');
    }
  } catch (err) {
    return fromError(err);
  }
}

/* ------------------------------------------------------------------ */

async function handleIntent(playlistId: string, utterance: string, _query?: string) {
  const ai = getAIProvider();
  const intents = new IntentService();

  const categories = (await getLiveCategories(playlistId)).map((c) => c.name);
  const intent = await ai.parseIntent(utterance, { categories, isPlaying: false });
  const resolved = intents.resolve(intent);

  if (!resolved) {
    return { ok: false as const, message: 'That command is not something this app can do.' };
  }

  // A PLAY_CHANNEL intent carries a *name*. Resolve it against the real
  // catalogue here; if nothing matches, say so rather than guessing.
  if (resolved.command.type === 'play-channel') {
    const results = await catalogSearch(playlistId, resolved.command.query, 5);
    const channel = results.channels[0] ?? null;
    if (!channel) {
      return {
        ok: false as const,
        message: `No channel matching “${resolved.command.query}” is in your playlist.`,
        intent: resolved.intent,
      };
    }
    return {
      ok: true as const,
      spoken: `Playing ${channel.name}`,
      command: { type: 'play-channel-resolved' as const, channel },
      intent: resolved.intent,
    };
  }

  return { ok: true as const, spoken: resolved.spoken, command: resolved.command, intent: resolved.intent };
}

async function handleSearch(playlistId: string, query: string) {
  // Start from the deterministic index, then narrow with parsed filters.
  const base = await catalogSearch(playlistId, stripFilterWords(query), 60);
  const result = hybridSearch({
    query,
    channels: base.channels,
    movies: base.movies,
    series: base.series,
    programs: base.programs,
    limit: 20,
  });

  // If structured filters eliminated everything, fall back to the literal
  // results rather than showing an empty screen for a valid query.
  const empty =
    result.channels.length === 0 &&
    result.movies.length === 0 &&
    result.series.length === 0 &&
    result.programs.length === 0;

  return empty
    ? { ...base, parsed: result.parsed, explanation: [], relaxed: true }
    : { ...result, relaxed: false };
}

/** The literal index does better without the words that became filters. */
function stripFilterWords(query: string): string {
  return query
    .replace(/\b(under \d+ ?(min|minutes|mins)|rated (above|over|at least)? ?\d(\.\d)?)\b/gi, ' ')
    .replace(/\b((?:19|20)\d0s|\d0s)\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function handleRails(playlistId: string, partial: Partial<UserSignals>) {
  const loaded = await loadCatalog(playlistId);
  if (!loaded) return { rails: [] };

  const [channelPage, moviePage, seriesPage] = await Promise.all([
    getLiveChannels({ playlistId, limit: 400 }),
    getMovies({ playlistId, limit: 120 }),
    getSeriesPage({ playlistId, limit: 120 }),
  ]);

  const signals: UserSignals = {
    channelPlays: partial.channelPlays ?? {},
    genrePlays: partial.genrePlays ?? {},
    favoriteIds: partial.favoriteIds ?? [],
    recentChannelIds: partial.recentChannelIds ?? [],
    progress: partial.progress ?? {},
    hourOfDay: new Date().getHours(),
    dayOfWeek: new Date().getDay(),
  };

  const ids = [...new Set([...signals.favoriteIds, ...signals.recentChannelIds])].slice(0, 100);
  const nowNext = ids.length > 0 ? await getNowNext(playlistId, ids) : {};

  const service = new RecommendationService();
  const view = {
    channels: channelPage.items,
    movies: moviePage.items,
    series: seriesPage.items,
    nowNext,
  };

  const rails = [...service.personalRails(view, signals), ...service.smartGroups(view, signals)];

  // Resolve every rail against real items and drop any that came back empty.
  const resolved = rails
    .map((rail) => {
      const items =
        rail.kind === 'movie'
          ? resolveRail(rail, view.movies)
          : rail.kind === 'series'
            ? resolveRail(rail, view.series)
            : resolveRail(rail, view.channels);
      return { ...rail, items };
    })
    .filter((rail) => rail.items.length > 0);

  return { rails: resolved };
}

async function handleSports(playlistId: string) {
  const [channelPage, epg] = await Promise.all([
    getLiveChannels({ playlistId, limit: 400 }),
    loadEpg(playlistId),
  ]);

  // No guide means no events. We do not synthesise fixtures.
  if (!epg) return { events: [], groups: [], hasEpg: false };

  const sportsChannels = channelPage.items.filter(
    (c) => c.genre === 'sports' || /sport|espn|sky|dazn|bein|viaplay|ziggo/i.test(c.name),
  );
  const ids = sportsChannels.map((c) => c.id).slice(0, 200);
  if (ids.length === 0) return { events: [], groups: [], hasEpg: true };

  const from = Date.now();
  const to = from + 18 * HOUR;
  const schedules = await getEPG(playlistId, ids, from, to);

  const events = findSportsEvents({
    channels: sportsChannels,
    schedules: Object.fromEntries(schedules.map((s) => [s.channelId, s.programs])),
    from,
    to,
  });

  return {
    events,
    groups: groupBySport(events).map(([sport, list]) => ({ sport, count: list.length })),
    hasEpg: true,
  };
}

async function handleHealth(playlistId: string) {
  const loaded = await loadCatalog(playlistId);
  if (!loaded) return null;

  const service = new PlaylistHealthService();
  const health = service.analyze({
    channels: loaded.snapshot.channels,
    movies: loaded.snapshot.movies,
    series: loaded.snapshot.series,
    epgMappings: loaded.snapshot.epgMappings,
  });

  const clean = cleanView(loaded.snapshot.channels);
  return {
    ...health,
    cleanView: {
      before: loaded.snapshot.channels.length,
      after: clean.channels.length,
      collapsed: clean.collapsed,
    },
  };
}

async function handleWatchlist(playlistId: string, rules: WatchRule[]) {
  if (rules.length === 0) return { matches: [] };

  const [channelPage, moviePage, seriesPage] = await Promise.all([
    getLiveChannels({ playlistId, limit: 400 }),
    getMovies({ playlistId, limit: 200 }),
    getSeriesPage({ playlistId, limit: 200 }),
  ]);

  const ids = channelPage.items.map((c) => c.id).slice(0, 200);
  const from = Date.now();
  const schedules = ids.length > 0 ? await getEPG(playlistId, ids, from, from + 48 * HOUR) : [];

  const matches = evaluateRules({
    rules,
    channels: channelPage.items,
    schedules: Object.fromEntries(schedules.map((s) => [s.channelId, s.programs])),
    movies: moviePage.items,
    series: seriesPage.items,
  });

  return { matches };
}

async function handleExplain(playlistId: string, contentId: string) {
  const loaded = await loadCatalog(playlistId);
  if (!loaded) return { summary: null };

  const movie = loaded.byMovieId.get(contentId);
  const series = loaded.bySeriesId.get(contentId);
  const item = movie ?? series;
  // Nothing to summarize from means no summary — never an invented one.
  if (!item) return { summary: null, reason: 'not-in-catalog' };

  const ai = getAIProvider();
  const summary = await ai.summarize({
    title: item.name,
    year: item.year,
    genre: item.genre,
    rating: item.rating,
    plot: item.plot,
  });

  const service = new RecommendationService();
  const similar = movie
    ? service.similarTo(movie, loaded.snapshot.movies, 8).map((m) => ({ id: m.id, name: m.name, poster: m.poster }))
    : series
      ? service.similarTo(series, loaded.snapshot.series, 8).map((s) => ({ id: s.id, name: s.name, poster: s.poster }))
      : [];

  return {
    summary,
    reason: summary ? null : 'insufficient-metadata',
    similar,
  };
}
