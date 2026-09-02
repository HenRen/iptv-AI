import type {
  CatalogStats,
  Category,
  Channel,
  ChannelFamily,
  EPGProgram,
  Movie,
  Quality,
  Series,
} from '../types/index';
import { KEYS, storage } from '../ports/index';
import { indexPrograms } from './xmltv/matcher';

/**
 * Server-side catalog. The full normalized playlist lives here, never in the
 * browser: a 50,000-entry playlist is ~30 MB of JSON, which no TV browser
 * should be asked to hold. The client asks for a page, a category or a search
 * result and gets back a few hundred rows.
 */

export interface CatalogSnapshot {
  playlistId: string;
  builtAt: number;
  channels: Channel[];
  movies: Movie[];
  series: Series[];
  liveCategories: Category[];
  movieCategories: Category[];
  seriesCategories: Category[];
  stats: CatalogStats;
  /** channelId -> epg channel id */
  epgMappings: Record<string, string>;
}

export interface EpgSnapshot {
  playlistId: string;
  builtAt: number;
  programs: EPGProgram[];
  source: string;
}

interface LoadedCatalog {
  snapshot: CatalogSnapshot;
  byChannelId: Map<string, Channel>;
  byMovieId: Map<string, Movie>;
  bySeriesId: Map<string, Series>;
  channelIndex: SearchIndex;
  movieIndex: SearchIndex;
  seriesIndex: SearchIndex;
  families: Map<string, ChannelFamily>;
  loadedAt: number;
}

interface LoadedEpg {
  snapshot: EpgSnapshot;
  byChannelKey: Map<string, EPGProgram[]>;
  loadedAt: number;
}

const catalogCache = new Map<string, LoadedCatalog>();
const epgCache = new Map<string, LoadedEpg>();
const MAX_CACHED = 3;

/* ------------------------------------------------------------------ *
 * Search index — inverted token map. Built once per catalog load and
 * reused for every keystroke, so a 50k-item search is a map lookup and
 * a small intersection rather than a scan.
 * ------------------------------------------------------------------ */

export class SearchIndex {
  private readonly tokens = new Map<string, number[]>();
  private readonly haystacks: string[] = [];

  constructor(items: Array<{ text: string }>) {
    for (let i = 0; i < items.length; i++) {
      const lower = items[i].text.toLowerCase();
      this.haystacks.push(lower);
      for (const token of tokenize(lower)) {
        // Index the token and its 3+ character prefixes for as-you-type search.
        for (let len = 3; len <= Math.min(token.length, 12); len++) {
          const key = token.slice(0, len);
          const list = this.tokens.get(key);
          if (list) {
            if (list[list.length - 1] !== i) list.push(i);
          } else {
            this.tokens.set(key, [i]);
          }
        }
        if (token.length < 3) {
          const list = this.tokens.get(token);
          if (list) {
            if (list[list.length - 1] !== i) list.push(i);
          } else this.tokens.set(token, [i]);
        }
      }
    }
  }

  search(query: string, limit: number): number[] {
    const terms = tokenize(query.toLowerCase());
    if (terms.length === 0) return [];

    let candidates: number[] | null = null;
    for (const term of terms) {
      const key = term.length > 12 ? term.slice(0, 12) : term;
      const hits = this.tokens.get(key);
      if (!hits) return [];
      candidates = candidates === null ? hits : intersectSorted(candidates, hits);
      if (candidates.length === 0) return [];
    }
    if (!candidates) return [];

    // Long terms were truncated for indexing — verify against the haystack.
    const needsVerify = terms.some((t) => t.length > 12);
    const phrase = query.toLowerCase().trim();
    const verified = needsVerify
      ? candidates.filter((i) => terms.every((t) => this.haystacks[i].includes(t)))
      : candidates;

    // Rank: exact prefix match on the whole string first, then shorter names.
    return verified
      .slice(0, Math.max(limit * 8, 400))
      .sort((a, b) => score(this.haystacks[b], phrase) - score(this.haystacks[a], phrase))
      .slice(0, limit);
  }
}

function score(hay: string, phrase: string): number {
  if (hay === phrase) return 1000;
  if (hay.startsWith(phrase)) return 500 - Math.min(hay.length, 100);
  if (hay.includes(phrase)) return 200 - Math.min(hay.length, 100);
  return 100 - Math.min(hay.length, 100);
}

function tokenize(input: string): string[] {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length > 0);
}

function intersectSorted(a: number[], b: number[]): number[] {
  const out: number[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push(a[i]);
      i++;
      j++;
    } else if (a[i] < b[j]) i++;
    else j++;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Load / save
 * ------------------------------------------------------------------ */

/**
 * Snapshots are stored as blobs rather than JSON documents because they are
 * tens of megabytes and the storage port is free to stream them. `Buffer` is
 * not available on a TV runtime, so the encoding is done here with the
 * WHATWG encoders rather than by the adapter.
 */
const encodeJson = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));
const decodeJson = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

export async function saveCatalog(snapshot: CatalogSnapshot): Promise<void> {
  const store = storage();
  await store.setBlob(KEYS.catalog(snapshot.playlistId), encodeJson(snapshot));
  catalogCache.delete(snapshot.playlistId);
}

export async function saveEpg(snapshot: EpgSnapshot): Promise<void> {
  const store = storage();
  await store.setBlob(KEYS.epg(snapshot.playlistId), encodeJson(snapshot));
  epgCache.delete(snapshot.playlistId);
}

export async function loadCatalog(playlistId: string): Promise<LoadedCatalog | null> {
  const cached = catalogCache.get(playlistId);
  if (cached) return cached;

  const blob = await storage().getBlob(KEYS.catalog(playlistId));
  if (!blob) return null;

  let snapshot: CatalogSnapshot;
  try {
    snapshot = JSON.parse(decodeJson(blob)) as CatalogSnapshot;
  } catch {
    return null;
  }

  const loaded = buildLoaded(snapshot);
  evict(catalogCache);
  catalogCache.set(playlistId, loaded);
  return loaded;
}

export async function loadEpg(playlistId: string): Promise<LoadedEpg | null> {
  const cached = epgCache.get(playlistId);
  if (cached) return cached;

  const blob = await storage().getBlob(KEYS.epg(playlistId));
  if (!blob) return null;
  let snapshot: EpgSnapshot;
  try {
    snapshot = JSON.parse(decodeJson(blob)) as EpgSnapshot;
  } catch {
    return null;
  }
  const loaded: LoadedEpg = {
    snapshot,
    byChannelKey: indexPrograms(snapshot.programs),
    loadedAt: Date.now(),
  };
  evict(epgCache);
  epgCache.set(playlistId, loaded);
  return loaded;
}

export function invalidate(playlistId: string) {
  catalogCache.delete(playlistId);
  epgCache.delete(playlistId);
}

function evict<T extends { loadedAt: number }>(cache: Map<string, T>) {
  while (cache.size >= MAX_CACHED) {
    let oldestKey: string | null = null;
    let oldest = Infinity;
    for (const [k, v] of cache) {
      if (v.loadedAt < oldest) {
        oldest = v.loadedAt;
        oldestKey = k;
      }
    }
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

function buildLoaded(snapshot: CatalogSnapshot): LoadedCatalog {
  const families = new Map<string, ChannelFamily>();
  for (const ch of snapshot.channels) {
    let fam = families.get(ch.familyKey);
    if (!fam) {
      fam = {
        key: ch.familyKey,
        name: ch.name,
        logo: ch.logo,
        genre: ch.genre,
        variants: [],
      };
      families.set(ch.familyKey, fam);
    }
    if (!fam.logo && ch.logo) fam.logo = ch.logo;
    fam.variants.push({
      channelId: ch.id,
      quality: ch.quality,
      label: qualityLabel(ch.quality, fam.variants.length),
    });
  }
  for (const fam of families.values()) {
    fam.variants.sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality));
  }

  return {
    snapshot,
    byChannelId: new Map(snapshot.channels.map((c) => [c.id, c])),
    byMovieId: new Map(snapshot.movies.map((m) => [m.id, m])),
    bySeriesId: new Map(snapshot.series.map((s) => [s.id, s])),
    channelIndex: new SearchIndex(
      snapshot.channels.map((c) => ({ text: `${c.name} ${c.categoryName ?? ''}` })),
    ),
    movieIndex: new SearchIndex(
      snapshot.movies.map((m) => ({ text: `${m.name} ${m.genre ?? ''} ${m.year ?? ''}` })),
    ),
    seriesIndex: new SearchIndex(
      snapshot.series.map((s) => ({ text: `${s.name} ${s.genre ?? ''} ${s.year ?? ''}` })),
    ),
    families,
    loadedAt: Date.now(),
  };
}

const QUALITY_ORDER: Record<Quality, number> = { '4K': 4, FHD: 3, HD: 2, SD: 1, unknown: 0 };
function qualityRank(q: Quality) {
  return QUALITY_ORDER[q] ?? 0;
}
function qualityLabel(q: Quality, index: number): string {
  if (q !== 'unknown') return q;
  return index === 0 ? 'Stream 1' : `Stream ${index + 1}`;
}

export type { LoadedCatalog, LoadedEpg };
