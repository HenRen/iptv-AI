import type { Category, Channel, ContentGenre, Movie, Series } from '@/types';
import {
  classifyGenre,
  containerFromUrl,
  familyKey,
  isAdult,
  parseChannelName,
  parseEpisodeCode,
  parseTitleYear,
} from '../normalize';
import { epgUrlFromHeader, parseM3U, type RawM3UEntry } from './parser';

export interface M3UCatalog {
  channels: Channel[];
  movies: Movie[];
  series: Series[];
  liveCategories: Category[];
  movieCategories: Category[];
  seriesCategories: Category[];
  epgUrl: string | null;
  malformed: number;
}

/** M3U has no type field, so entry kind is inferred from the URL shape. */
function entryKind(entry: RawM3UEntry): 'live' | 'movie' | 'series' {
  const url = entry.url;
  if (/\/series\//i.test(url)) return 'series';
  if (/\/movie\//i.test(url)) return 'movie';
  if (/\/live\//i.test(url)) return 'live';
  const group = (entry.group ?? '').toLowerCase();
  if (/\b(series|serie|tv\s?show|seizoen|season)\b/.test(group)) return 'series';
  if (/\b(movie|movies|film|vod|cinema)\b/.test(group)) return 'movie';
  // A URL ending in a VOD-ish container with no /live/ marker is VOD.
  if (/\.(mp4|mkv|avi|m4v|mov)(\?|$)/i.test(url)) {
    return parseEpisodeCode(entry.title) ? 'series' : 'movie';
  }
  return 'live';
}

/** Deterministic 32-bit hash — gives M3U entries stable ids across refreshes. */
function hashId(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function categoryOf(
  map: Map<string, Category>,
  kind: Category['kind'],
  name: string | null,
): { id: string | null; name: string | null } {
  if (!name) return { id: null, name: null };
  const id = `${kind}-${hashId(name)}`;
  const existing = map.get(id);
  if (existing) {
    existing.count++;
  } else {
    map.set(id, {
      id,
      name,
      kind,
      count: 1,
      genre: classifyGenre(name),
      adult: isAdult(name),
    });
  }
  return { id, name };
}

export function adaptM3U(text: string, playlistId: string): M3UCatalog {
  const { entries, header, malformed } = parseM3U(text);

  const channels: Channel[] = [];
  const movies: Movie[] = [];
  const seriesByKey = new Map<string, Series>();
  const liveCats = new Map<string, Category>();
  const movieCats = new Map<string, Category>();
  const seriesCats = new Map<string, Category>();

  let channelNumber = 1;

  for (const entry of entries) {
    if (!entry.url) continue;
    const rawName = entry.title || entry.attrs['tvg-name'] || 'Unnamed';
    const groupTitle = entry.group;
    const kind = entryKind(entry);

    if (kind === 'live') {
      const parsed = parseChannelName(rawName);
      const cat = categoryOf(liveCats, 'live', groupTitle);
      const genre: ContentGenre = classifyGenre(groupTitle, parsed.name, rawName);
      const adult = isAdult(groupTitle, rawName);
      channels.push({
        id: `${playlistId}:ch:${hashId(entry.url)}`,
        playlistId,
        streamId: hashId(entry.url),
        number: channelNumber++,
        name: parsed.name,
        rawName,
        logo: entry.attrs['tvg-logo'] || null,
        categoryId: cat.id,
        categoryName: cat.name,
        genre: adult ? 'adult' : genre,
        quality: parsed.quality,
        country: parsed.country,
        language: parsed.language ?? entry.attrs['tvg-language'] ?? null,
        tvgId: entry.attrs['tvg-id'] || null,
        tvgName: entry.attrs['tvg-name'] || null,
        familyKey: familyKey(parsed.name, parsed.country),
        adult,
        container: containerFromUrl(entry.url),
        directUrl: entry.url,
        catchup: entry.attrs['catchup']
          ? {
              enabled: true,
              days: Number(entry.attrs['catchup-days']) || undefined,
              source: entry.attrs['catchup-source'] || undefined,
            }
          : undefined,
      });
      continue;
    }

    if (kind === 'movie') {
      const { title, year } = parseTitleYear(rawName);
      const cat = categoryOf(movieCats, 'movie', groupTitle);
      movies.push({
        id: `${playlistId}:mv:${hashId(entry.url)}`,
        playlistId,
        streamId: hashId(entry.url),
        name: title,
        rawName,
        poster: entry.attrs['tvg-logo'] || null,
        backdrop: null,
        categoryId: cat.id,
        categoryName: cat.name,
        year,
        rating: null,
        durationSecs: entry.durationSecs || null,
        genre: groupTitle,
        plot: null,
        cast: null,
        director: null,
        container: containerFromUrl(entry.url),
        containerExt: extOf(entry.url),
        directUrl: entry.url,
        addedAt: null,
        adult: isAdult(groupTitle, rawName),
      });
      continue;
    }

    // series
    const code = parseEpisodeCode(rawName);
    const seriesTitleRaw = code
      ? rawName.replace(/\s*[-–]?\s*S\d{1,2}\s?E\d{1,3}.*$/i, '').replace(/\s*\d{1,2}x\d{1,3}.*$/i, '')
      : rawName;
    const { title: seriesTitle, year } = parseTitleYear(seriesTitleRaw);
    const key = hashId(`${seriesTitle.toLowerCase()}|${groupTitle ?? ''}`);
    const cat = categoryOf(seriesCats, 'series', groupTitle);

    let series = seriesByKey.get(key);
    if (!series) {
      series = {
        id: `${playlistId}:sr:${key}`,
        playlistId,
        seriesId: key,
        name: seriesTitle,
        rawName: seriesTitleRaw,
        poster: entry.attrs['tvg-logo'] || null,
        backdrop: null,
        categoryId: cat.id,
        categoryName: cat.name,
        year,
        rating: null,
        genre: groupTitle,
        plot: null,
        cast: null,
        director: null,
        addedAt: null,
        adult: isAdult(groupTitle, rawName),
        seasons: [],
      };
      seriesByKey.set(key, series);
    }

    const seasonNumber = code?.season ?? 1;
    const episodeNumber = code?.episode ?? (series.seasons?.flatMap((s) => s.episodes).length ?? 0) + 1;
    let season = series.seasons!.find((s) => s.seasonNumber === seasonNumber);
    if (!season) {
      season = {
        seasonNumber,
        name: `Season ${seasonNumber}`,
        overview: null,
        poster: null,
        episodes: [],
      };
      series.seasons!.push(season);
    }
    season.episodes.push({
      id: `${playlistId}:ep:${hashId(entry.url)}`,
      seriesId: series.seriesId,
      seasonNumber,
      episodeNumber,
      title: code ? rawName.slice(rawName.search(/S\d{1,2}\s?E\d{1,3}/i)) : rawName,
      plot: null,
      thumbnail: entry.attrs['tvg-logo'] || null,
      durationSecs: entry.durationSecs || null,
      container: containerFromUrl(entry.url),
      containerExt: extOf(entry.url),
      directUrl: entry.url,
    });
  }

  for (const series of seriesByKey.values()) {
    series.seasons!.sort((a, b) => a.seasonNumber - b.seasonNumber);
    for (const season of series.seasons!) {
      season.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
    }
  }

  return {
    channels,
    movies,
    series: [...seriesByKey.values()],
    liveCategories: [...liveCats.values()].sort((a, b) => a.name.localeCompare(b.name)),
    movieCategories: [...movieCats.values()].sort((a, b) => a.name.localeCompare(b.name)),
    seriesCategories: [...seriesCats.values()].sort((a, b) => a.name.localeCompare(b.name)),
    epgUrl: epgUrlFromHeader(header),
    malformed,
  };
}

function extOf(url: string): string | null {
  try {
    const p = new URL(url, 'http://x').pathname;
    const i = p.lastIndexOf('.');
    return i === -1 ? null : p.slice(i + 1).toLowerCase();
  } catch {
    return null;
  }
}
