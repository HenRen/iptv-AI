import type { Channel, EPGProgram, Movie, Series } from '@/types';
import { classifyGenre } from '@/lib/iptv/normalize';

/**
 * AI 9 — Universal hybrid search.
 *
 * "Hybrid" here means the query is decomposed into structured filters plus a
 * literal term, and both are applied against the real catalogue. A natural
 * query like "90s action movie" becomes {decade: 1990, genre: action} and is
 * answered by filtering — not by asking a model what films exist, which is
 * exactly how a search engine starts returning titles the user cannot play.
 *
 * Everything returned is an item from the connected playlist.
 */

export interface ParsedQuery {
  /** What is left after structured hints are removed. */
  text: string;
  genre: string | null;
  decade: number | null;
  yearFrom: number | null;
  yearTo: number | null;
  maxRuntimeMins: number | null;
  minRating: number | null;
  language: string | null;
  country: string | null;
  liveOnly: boolean;
  kind: 'channel' | 'movie' | 'series' | null;
}

const DECADE = /\b((?:19|20)\d0)s\b/i;
const NINETIES_SHORTHAND = /\b(\d0)s\b/;
const MAX_RUNTIME = /\bunder\s+(\d{2,3})\s*(?:min|minutes|mins)\b/i;
const MIN_RATING = /\b(?:rated|rating)\s+(?:above|over|at least)?\s*(\d(?:\.\d)?)\b/i;

const GENRE_WORDS: Record<string, string> = {
  action: 'action',
  comedy: 'comedy',
  comedies: 'comedy',
  funny: 'comedy',
  drama: 'drama',
  thriller: 'thriller',
  horror: 'horror',
  scary: 'horror',
  documentary: 'documentary',
  documentaries: 'documentary',
  docu: 'documentary',
  family: 'family',
  kids: 'family',
  romance: 'romance',
  romantic: 'romance',
  scifi: 'science fiction',
  'science fiction': 'science fiction',
  animation: 'animation',
  animated: 'animation',
  crime: 'crime',
  western: 'western',
  war: 'war',
  sport: 'sport',
  sports: 'sport',
};

const COUNTRY_WORDS: Record<string, string> = {
  dutch: 'Netherlands',
  nederlands: 'Netherlands',
  british: 'United Kingdom',
  uk: 'United Kingdom',
  american: 'United States',
  us: 'United States',
  german: 'Germany',
  french: 'France',
  spanish: 'Spain',
  italian: 'Italy',
  turkish: 'Turkey',
  arabic: 'Arabic',
  polish: 'Poland',
};

const KIND_WORDS: Array<[RegExp, ParsedQuery['kind']]> = [
  [/\b(channel|channels|live\s?tv)\b/i, 'channel'],
  [/\b(movie|movies|film|films)\b/i, 'movie'],
  [/\b(series|show|shows|episode|episodes)\b/i, 'series'],
];

/**
 * Decompose a natural-language query into filters plus a residual term.
 * Deliberately rule-based: it is fast, offline, and cannot hallucinate.
 */
export function parseQuery(raw: string): ParsedQuery {
  let text = ` ${raw.trim()} `;
  const strip = (pattern: RegExp) => {
    text = text.replace(pattern, ' ');
  };

  const result: ParsedQuery = {
    text: '',
    genre: null,
    decade: null,
    yearFrom: null,
    yearTo: null,
    maxRuntimeMins: null,
    minRating: null,
    language: null,
    country: null,
    liveOnly: /\blive\b/i.test(text),
    kind: null,
  };

  for (const [pattern, kind] of KIND_WORDS) {
    if (pattern.test(text)) {
      result.kind = kind;
      strip(new RegExp(pattern.source, 'gi'));
      break;
    }
  }

  const decade = DECADE.exec(text);
  if (decade) {
    result.decade = Number(decade[1]);
    strip(new RegExp(decade[0], 'gi'));
  } else {
    const short = NINETIES_SHORTHAND.exec(text);
    if (short) {
      const value = Number(short[1]);
      // "90s" -> 1990, "20s" -> 2020
      result.decade = value >= 30 ? 1900 + value : 2000 + value;
      strip(new RegExp(short[0], 'gi'));
    }
  }
  if (result.decade) {
    result.yearFrom = result.decade;
    result.yearTo = result.decade + 9;
  }

  const runtime = MAX_RUNTIME.exec(text);
  if (runtime) {
    result.maxRuntimeMins = Number(runtime[1]);
    strip(new RegExp(runtime[0], 'gi'));
  }

  const rating = MIN_RATING.exec(text);
  if (rating) {
    result.minRating = Number(rating[1]);
    strip(new RegExp(rating[0], 'gi'));
  }

  const lower = text.toLowerCase();
  for (const [word, genre] of Object.entries(GENRE_WORDS)) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(lower)) {
      result.genre = genre;
      strip(new RegExp(`\\b${word}\\b`, 'gi'));
      break;
    }
  }
  for (const [word, country] of Object.entries(COUNTRY_WORDS)) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(lower)) {
      result.country = country;
      strip(new RegExp(`\\b${word}\\b`, 'gi'));
      break;
    }
  }

  // Filler words that carry no filter and only hurt literal matching.
  strip(/\b(show me|find|search for|something|about|for|a|an|the|me|with|of|please)\b/gi);
  result.text = text.replace(/\s{2,}/g, ' ').trim();
  return result;
}

export interface HybridInput {
  query: string;
  channels: Channel[];
  movies: Movie[];
  series: Series[];
  programs?: Array<{ program: EPGProgram; channelId: string; channelName: string }>;
  limit?: number;
}

export interface HybridResults {
  parsed: ParsedQuery;
  channels: Channel[];
  movies: Movie[];
  series: Series[];
  programs: Array<{ program: EPGProgram; channelId: string; channelName: string }>;
  /** Human-readable description of the filters applied. */
  explanation: string[];
}

/**
 * Apply the parsed filters to results the catalogue already produced.
 * Note this *narrows* a candidate set — it never fetches or invents one.
 */
export function hybridSearch({
  query,
  channels,
  movies,
  series,
  programs = [],
  limit = 20,
}: HybridInput): HybridResults {
  const parsed = parseQuery(query);
  const term = parsed.text.toLowerCase();
  const explanation: string[] = [];

  const matchesText = (...fields: Array<string | null | undefined>) =>
    term.length === 0 || fields.filter(Boolean).some((f) => f!.toLowerCase().includes(term));

  let outChannels = channels.filter((c) => matchesText(c.name, c.categoryName));
  if (parsed.country) {
    outChannels = outChannels.filter((c) => c.country === parsed.country);
    explanation.push(`country: ${parsed.country}`);
  }
  if (parsed.genre) {
    const asChannelGenre = classifyGenre(parsed.genre);
    outChannels = outChannels.filter(
      (c) => c.genre === asChannelGenre || (c.categoryName ?? '').toLowerCase().includes(parsed.genre!),
    );
    explanation.push(`genre: ${parsed.genre}`);
  }

  let outMovies = movies.filter((m) => matchesText(m.name, m.genre, m.plot));
  let outSeries = series.filter((s) => matchesText(s.name, s.genre, s.plot));

  if (parsed.yearFrom && parsed.yearTo) {
    outMovies = outMovies.filter((m) => m.year && m.year >= parsed.yearFrom! && m.year <= parsed.yearTo!);
    outSeries = outSeries.filter((s) => s.year && s.year >= parsed.yearFrom! && s.year <= parsed.yearTo!);
    explanation.push(`released ${parsed.yearFrom}–${parsed.yearTo}`);
  }
  if (parsed.genre) {
    const needle = parsed.genre.toLowerCase();
    outMovies = outMovies.filter(
      (m) => (m.genre ?? '').toLowerCase().includes(needle) || (m.categoryName ?? '').toLowerCase().includes(needle),
    );
    outSeries = outSeries.filter(
      (s) => (s.genre ?? '').toLowerCase().includes(needle) || (s.categoryName ?? '').toLowerCase().includes(needle),
    );
  }
  if (parsed.maxRuntimeMins) {
    outMovies = outMovies.filter(
      (m) => m.durationSecs != null && m.durationSecs <= parsed.maxRuntimeMins! * 60,
    );
    explanation.push(`under ${parsed.maxRuntimeMins} minutes`);
  }
  if (parsed.minRating) {
    outMovies = outMovies.filter((m) => (m.rating ?? 0) >= parsed.minRating!);
    outSeries = outSeries.filter((s) => (s.rating ?? 0) >= parsed.minRating!);
    explanation.push(`rated ${parsed.minRating}+`);
  }

  let outPrograms = programs.filter((p) => matchesText(p.program.title, p.program.description));
  if (parsed.liveOnly) {
    const now = Date.now();
    outPrograms = outPrograms.filter((p) => p.program.start <= now && p.program.stop > now);
    explanation.push('on now');
  }

  // A kind hint suppresses the other groups rather than reordering them.
  if (parsed.kind === 'channel') {
    outMovies = [];
    outSeries = [];
  } else if (parsed.kind === 'movie') {
    outChannels = [];
    outSeries = [];
    outPrograms = [];
  } else if (parsed.kind === 'series') {
    outChannels = [];
    outMovies = [];
    outPrograms = [];
  }

  return {
    parsed,
    channels: outChannels.slice(0, limit),
    movies: outMovies.slice(0, limit),
    series: outSeries.slice(0, limit),
    programs: outPrograms.slice(0, limit),
    explanation,
  };
}
