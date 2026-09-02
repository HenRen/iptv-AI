import type { Channel, EPGProgram, Movie, NowNext, Series } from '../../types/index';
import type { RecommendationRail, RecommendationSignal } from '../types';

/**
 * AI 3 + AI 4 — Smart Groups and Personalized Home.
 *
 * Everything here is generated from content that actually exists in the
 * connected playlist. A rail whose items do not resolve is dropped rather
 * than rendered empty, and no rail may reference an id the catalogue did not
 * supply — which is what stops a recommendation engine from inventing a
 * channel that is not in the user's subscription.
 *
 * Computation lives here, not in the UI: screens render rails, they do not
 * decide what belongs in them.
 */

export interface CatalogView {
  channels: Channel[];
  movies: Movie[];
  series: Series[];
  nowNext: Record<string, NowNext>;
}

export interface UserSignals extends RecommendationSignal {
  recentChannelIds: string[];
  /** contentId -> fraction watched */
  progress: Record<string, number>;
}

const EVENING_START = 18;
const MORNING_END = 11;

export class RecommendationService {
  /**
   * Virtual categories built from real content (AI 3 — Smart Groups).
   * Each group is a filter over the catalogue, never a generated list.
   */
  smartGroups(view: CatalogView, signals: UserSignals, at = new Date()): RecommendationRail[] {
    const rails: RecommendationRail[] = [];
    const hour = at.getHours();
    const isWeekend = at.getDay() === 0 || at.getDay() === 6;

    const push = (
      key: string,
      title: string,
      kind: RecommendationRail['kind'],
      itemIds: string[],
      reason: string,
      min = 1,
    ) => {
      if (itemIds.length >= min) rails.push({ key, title, kind, itemIds, reason, });
    };

    // For You — ranked by the user's own behaviour.
    const forYou = this.rankChannels(view.channels, signals).slice(0, 20);
    push('for-you', 'For You', 'channel', forYou.map((c) => c.id), 'Based on what you watch', 3);

    // Most watched.
    const mostWatched = Object.entries(signals.channelPlays)
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id)
      .filter((id) => view.channels.some((c) => c.id === id))
      .slice(0, 20);
    push('most-watched', 'Most Watched', 'channel', mostWatched, 'Your most opened channels', 2);

    // Recently watched.
    push(
      'recent',
      'Recently Watched',
      'channel',
      signals.recentChannelIds.filter((id) => view.channels.some((c) => c.id === id)).slice(0, 20),
      'Where you left off',
      1,
    );

    // Genre groups, time-aware.
    const byGenre = (genre: Channel['genre']) =>
      view.channels.filter((c) => c.genre === genre).map((c) => c.id);

    if (hour >= EVENING_START || isWeekend) {
      push(
        isWeekend ? 'weekend-sports' : 'sports-tonight',
        isWeekend ? 'Weekend Sports' : 'Sports Tonight',
        'channel',
        byGenre('sports').slice(0, 20),
        'Live sport on now',
        2,
      );
    }
    if (hour < MORNING_END || hour >= EVENING_START) {
      push('news-now', 'News Now', 'channel', byGenre('news').slice(0, 20), 'Live news', 2);
    }
    push('kids', 'Kids', 'channel', byGenre('kids').slice(0, 20), 'Family viewing', 2);
    push(
      'documentaries',
      'Documentaries',
      'channel',
      byGenre('documentary').slice(0, 20),
      'Factual channels',
      2,
    );

    // Quality and language groups, only when the playlist has enough of them.
    push(
      '4k',
      '4K Channels',
      'channel',
      view.channels.filter((c) => c.quality === '4K').map((c) => c.id).slice(0, 20),
      'Ultra HD in your playlist',
      3,
    );

    const byCountry = new Map<string, string[]>();
    for (const channel of view.channels) {
      if (!channel.country) continue;
      const list = byCountry.get(channel.country) ?? [];
      list.push(channel.id);
      byCountry.set(channel.country, list);
    }
    for (const [country, ids] of [...byCountry.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 2)) {
      push(
        `country-${country.toLowerCase().replace(/\s+/g, '-')}`,
        `${country} Channels`,
        'channel',
        ids.slice(0, 20),
        `Channels from ${country}`,
        3,
      );
    }

    if (hour >= EVENING_START && view.movies.length > 0) {
      push(
        'movies-tonight',
        'Movies Tonight',
        'movie',
        view.movies.slice(0, 20).map((m) => m.id),
        'Feature films to start now',
        3,
      );
    }

    return rails;
  }

  /**
   * AI 4 — personalized rails with an explicit reason each ("Because you
   * watch ESPN"), so a recommendation is never unexplained.
   */
  personalRails(view: CatalogView, signals: UserSignals): RecommendationRail[] {
    const rails: RecommendationRail[] = [];

    // "Because you watch X" — nearest neighbours by genre and country.
    const topChannelId = Object.entries(signals.channelPlays).sort((a, b) => b[1] - a[1])[0]?.[0];
    const seed = view.channels.find((c) => c.id === topChannelId);
    if (seed) {
      const similar = view.channels
        .filter(
          (c) =>
            c.id !== seed.id &&
            (c.genre === seed.genre || (seed.country && c.country === seed.country)),
        )
        .slice(0, 20)
        .map((c) => c.id);
      if (similar.length >= 3) {
        rails.push({
          key: 'because-you-watch',
          title: `Because you watch ${seed.name}`,
          kind: 'channel',
          itemIds: similar,
          reason: `Similar to ${seed.name}`,
        });
      }
    }

    // Favorites that are live right now — the highest-intent rail there is.
    const favoritesLive = signals.favoriteIds.filter((id) => view.nowNext[id]?.now);
    if (favoritesLive.length > 0) {
      rails.push({
        key: 'favorites-live',
        title: 'Favorite Channels Live Now',
        kind: 'channel',
        itemIds: favoritesLive.slice(0, 20),
        reason: 'On air in your favorites',
      });
    }

    // Genres the user actually plays, ranked.
    const topGenre = Object.entries(signals.genrePlays).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (topGenre) {
      const ids = view.channels
        .filter((c) => c.genre === topGenre)
        .map((c) => c.id)
        .slice(0, 20);
      if (ids.length >= 3) {
        rails.push({
          key: `top-genre-${topGenre}`,
          title: `More ${topGenre}`,
          kind: 'channel',
          itemIds: ids,
          reason: `You watch a lot of ${topGenre}`,
        });
      }
    }

    return rails;
  }

  /** Ranking is a reorder of supplied candidates. It never adds. */
  rankChannels(channels: Channel[], signals: UserSignals): Channel[] {
    const score = (channel: Channel) => {
      let value = 0;
      value += (signals.channelPlays[channel.id] ?? 0) * 5;
      value += (signals.genrePlays[channel.genre] ?? 0) * 2;
      if (signals.favoriteIds.includes(channel.id)) value += 12;
      const recentIndex = signals.recentChannelIds.indexOf(channel.id);
      if (recentIndex >= 0) value += Math.max(0, 8 - recentIndex);
      return value;
    };
    return [...channels].filter((c) => score(c) > 0).sort((a, b) => score(b) - score(a));
  }

  /**
   * "Similar content" for a movie or series — same genre, near year,
   * excluding the item itself. Pure catalogue filtering.
   */
  similarTo<T extends Movie | Series>(item: T, pool: T[], limit = 12): T[] {
    const genre = (item.genre ?? '').toLowerCase();
    return pool
      .filter((candidate) => candidate.id !== item.id)
      .map((candidate) => {
        let score = 0;
        if (genre && (candidate.genre ?? '').toLowerCase() === genre) score += 10;
        if (candidate.categoryId && candidate.categoryId === item.categoryId) score += 6;
        if (item.year && candidate.year) score += Math.max(0, 5 - Math.abs(item.year - candidate.year));
        if (candidate.rating) score += candidate.rating / 4;
        return { candidate, score };
      })
      .filter((entry) => entry.score > 4)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((entry) => entry.candidate);
  }
}

/** Build the signal bundle the service needs from raw client state. */
export function buildSignals(input: {
  channels: Channel[];
  history: Array<{ kind: string; id: string }>;
  favoriteIds: string[];
  recentChannelIds: string[];
  progress: Record<string, { positionSecs: number; durationSecs: number }>;
  at?: Date;
}): UserSignals {
  const at = input.at ?? new Date();
  const channelPlays: Record<string, number> = {};
  const genrePlays: Record<string, number> = {};
  const byId = new Map(input.channels.map((c) => [c.id, c]));

  for (const entry of input.history) {
    if (entry.kind !== 'live') continue;
    channelPlays[entry.id] = (channelPlays[entry.id] ?? 0) + 1;
    const genre = byId.get(entry.id)?.genre;
    if (genre) genrePlays[genre] = (genrePlays[genre] ?? 0) + 1;
  }

  const progress: Record<string, number> = {};
  for (const [key, value] of Object.entries(input.progress)) {
    if (value.durationSecs > 0) progress[key] = value.positionSecs / value.durationSecs;
  }

  return {
    channelPlays,
    genrePlays,
    favoriteIds: input.favoriteIds,
    recentChannelIds: input.recentChannelIds,
    progress,
    hourOfDay: at.getHours(),
    dayOfWeek: at.getDay(),
  };
}

/** Resolve a rail's ids back to real catalogue items, dropping any that miss. */
export function resolveRail<T extends { id: string }>(
  rail: RecommendationRail,
  pool: T[],
): T[] {
  const byId = new Map(pool.map((item) => [item.id, item]));
  return rail.itemIds.map((id) => byId.get(id)).filter((item): item is T => Boolean(item));
}

export type { EPGProgram };
