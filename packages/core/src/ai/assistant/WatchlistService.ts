import type { Channel, EPGProgram, Movie, Series } from '../../types/index';
import { detectSport } from '../epg/SportsIntelligence';

/**
 * AI 10 — Smart Watchlist.
 *
 * "Keep track of Formula One" becomes a structured rule, and the matching
 * engine runs that rule against real EPG and catalogue data. The rule is
 * stored; the *matches* are always recomputed from live data, so a watchlist
 * can never show a fixture that is not in the guide.
 */

export type WatchRuleType = 'EPG_MATCH' | 'CATALOG_MATCH' | 'SERIES_FOLLOW';

export interface WatchRule {
  id: string;
  type: WatchRuleType;
  label: string;
  keywords: string[];
  category?: string | null;
  /** SERIES_FOLLOW only. */
  seriesId?: string;
  createdAt: number;
  enabled: boolean;
}

export interface WatchMatch {
  ruleId: string;
  kind: 'program' | 'movie' | 'series';
  title: string;
  subtitle: string | null;
  start?: number;
  stop?: number;
  channelId?: string;
  contentId?: string;
  live: boolean;
}

const FOLLOW = /^(?:follow|track|keep track of|tell me when|notify me about|alert me for)\s+(.+?)\s*(?:is on|airs|plays)?$/i;
const NEW_CONTENT = /^(?:show me|find)\s+new\s+(.+)$/i;

/** Turn a natural-language request into a structured, inspectable rule. */
export function parseWatchRule(utterance: string, id = cryptoId()): WatchRule | null {
  const text = utterance.trim();
  if (text.length < 3) return null;

  const follow = FOLLOW.exec(text);
  if (follow) {
    const subject = follow[1].trim();
    return {
      id,
      type: 'EPG_MATCH',
      label: `Track ${subject}`,
      keywords: keywordsOf(subject),
      category: detectSport(subject) ? 'sports' : null,
      createdAt: Date.now(),
      enabled: true,
    };
  }

  const fresh = NEW_CONTENT.exec(text);
  if (fresh) {
    const subject = fresh[1].trim();
    return {
      id,
      type: 'CATALOG_MATCH',
      label: `New ${subject}`,
      keywords: keywordsOf(subject),
      category: null,
      createdAt: Date.now(),
      enabled: true,
    };
  }

  // Anything else is treated as a plain keyword watch on the guide.
  return {
    id,
    type: 'EPG_MATCH',
    label: text,
    keywords: keywordsOf(text),
    category: detectSport(text) ? 'sports' : null,
    createdAt: Date.now(),
    enabled: true,
  };
}

export function followSeriesRule(series: Pick<Series, 'id' | 'name'>, id = cryptoId()): WatchRule {
  return {
    id,
    type: 'SERIES_FOLLOW',
    label: `New episodes of ${series.name}`,
    keywords: keywordsOf(series.name),
    seriesId: series.id,
    createdAt: Date.now(),
    enabled: true,
  };
}

export interface MatchInput {
  rules: WatchRule[];
  channels: Channel[];
  /** channelId -> programmes within the window being checked. */
  schedules: Record<string, EPGProgram[]>;
  movies: Movie[];
  series: Series[];
  limitPerRule?: number;
}

/**
 * Evaluate every enabled rule against actual data.
 * Everything returned resolves to a real programme or catalogue item.
 */
export function evaluateRules({
  rules,
  channels,
  schedules,
  movies,
  series,
  limitPerRule = 10,
}: MatchInput): WatchMatch[] {
  const now = Date.now();
  const byChannelId = new Map(channels.map((c) => [c.id, c]));
  const matches: WatchMatch[] = [];

  for (const rule of rules) {
    if (!rule.enabled || rule.keywords.length === 0) continue;
    let found = 0;

    if (rule.type === 'EPG_MATCH') {
      for (const [channelId, programs] of Object.entries(schedules)) {
        const channel = byChannelId.get(channelId);
        if (!channel) continue;
        if (rule.category === 'sports' && channel.genre !== 'sports' && !programs.some((p) => detectSport(p.title))) {
          continue;
        }
        for (const program of programs) {
          if (found >= limitPerRule) break;
          const haystack = `${program.title} ${program.description ?? ''}`.toLowerCase();
          if (!rule.keywords.every((k) => haystack.includes(k))) continue;
          matches.push({
            ruleId: rule.id,
            kind: 'program',
            title: program.title,
            subtitle: channel.name,
            start: program.start,
            stop: program.stop,
            channelId,
            live: program.start <= now && program.stop > now,
          });
          found++;
        }
      }
      continue;
    }

    if (rule.type === 'SERIES_FOLLOW') {
      const target = series.find((s) => s.id === rule.seriesId);
      if (target) {
        matches.push({
          ruleId: rule.id,
          kind: 'series',
          title: target.name,
          subtitle: target.genre,
          contentId: target.id,
          live: false,
        });
      }
      continue;
    }

    // CATALOG_MATCH
    for (const movie of movies) {
      if (found >= limitPerRule) break;
      const haystack = `${movie.name} ${movie.genre ?? ''}`.toLowerCase();
      if (!rule.keywords.every((k) => haystack.includes(k))) continue;
      matches.push({
        ruleId: rule.id,
        kind: 'movie',
        title: movie.name,
        subtitle: movie.genre,
        contentId: movie.id,
        live: false,
      });
      found++;
    }
    for (const show of series) {
      if (found >= limitPerRule) break;
      const haystack = `${show.name} ${show.genre ?? ''}`.toLowerCase();
      if (!rule.keywords.every((k) => haystack.includes(k))) continue;
      matches.push({
        ruleId: rule.id,
        kind: 'series',
        title: show.name,
        subtitle: show.genre,
        contentId: show.id,
        live: false,
      });
      found++;
    }
  }

  return matches.sort((a, b) => Number(b.live) - Number(a.live) || (a.start ?? 0) - (b.start ?? 0));
}

const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'and', 'is', 'on', 'in', 'for', 'new']);

function keywordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));
}

function cryptoId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export { keywordsOf };
