import type {
  AccountInfo,
  Category,
  Channel,
  Episode,
  Movie,
  Season,
  Series,
} from '../../types/index';
import {
  classifyGenre,
  containerFromExt,
  familyKey,
  isAdult,
  parseChannelName,
  parseTitleYear,
} from '../normalize';
import type {
  XtreamAuthResponse,
  XtreamCategory,
  XtreamLiveStream,
  XtreamSeries,
  XtreamSeriesInfo,
  XtreamVodStream,
} from './client';

/**
 * Xtream -> normalized model.
 *
 * Note what is NOT produced here: `directUrl` is always null. Xtream stream
 * URLs embed the username and password in the path, so the client is handed a
 * proxied URL built by the server instead (see src/lib/iptv/streamSource.ts).
 */

export function adaptAccount(res: XtreamAuthResponse): AccountInfo {
  const info = res.user_info ?? {};
  const exp = info.exp_date ? Number(info.exp_date) : null;
  return {
    status: info.status,
    expiresAt: exp && Number.isFinite(exp) ? exp * 1000 : null,
    isTrial: info.is_trial === '1',
    activeConnections: numOrUndef(info.active_cons),
    maxConnections: numOrUndef(info.max_connections),
    timezone: res.server_info?.timezone,
  };
}

export function adaptCategories(raw: XtreamCategory[] | undefined, kind: Category['kind']): Category[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c) => ({
    id: String(c.category_id),
    name: (c.category_name ?? 'Unnamed').trim(),
    kind,
    count: 0,
    genre: classifyGenre(c.category_name),
    adult: isAdult(c.category_name),
  }));
}

export function adaptChannels(
  raw: XtreamLiveStream[] | undefined,
  categories: Category[],
  playlistId: string,
): Channel[] {
  if (!Array.isArray(raw)) return [];
  const catById = new Map(categories.map((c) => [c.id, c]));
  const out: Channel[] = [];
  let fallbackNumber = 1;

  for (const s of raw) {
    const rawName = (s.name ?? '').trim();
    if (!rawName) continue;
    const parsed = parseChannelName(rawName);
    const cat = s.category_id != null ? catById.get(String(s.category_id)) : undefined;
    const adult = isAdult(cat?.name, rawName);
    const genre = adult ? 'adult' : classifyGenre(cat?.name, parsed.name, rawName);
    const streamId = String(s.stream_id);

    if (cat) cat.count++;

    out.push({
      id: `${playlistId}:ch:${streamId}`,
      playlistId,
      streamId,
      number: typeof s.num === 'number' && s.num > 0 ? s.num : fallbackNumber,
      name: parsed.name,
      rawName,
      logo: s.stream_icon?.trim() || null,
      categoryId: cat?.id ?? null,
      categoryName: cat?.name ?? null,
      genre,
      quality: parsed.quality,
      country: parsed.country,
      language: parsed.language,
      tvgId: s.epg_channel_id?.trim() || null,
      tvgName: null,
      familyKey: familyKey(parsed.name, parsed.country),
      adult,
      // Xtream live is MPEG-TS by default; the server also offers an .m3u8
      // variant and the player falls back between them.
      container: 'mpegts',
      directUrl: null,
      catchup:
        s.tv_archive === 1
          ? { enabled: true, days: numOrUndef(s.tv_archive_duration) }
          : undefined,
    });
    fallbackNumber++;
  }

  // Renumber so the on-screen channel numbers are contiguous and stable.
  out.sort((a, b) => a.number - b.number || a.name.localeCompare(b.name));
  out.forEach((c, i) => {
    c.number = i + 1;
  });
  return out;
}

export function adaptMovies(
  raw: XtreamVodStream[] | undefined,
  categories: Category[],
  playlistId: string,
): Movie[] {
  if (!Array.isArray(raw)) return [];
  const catById = new Map(categories.map((c) => [c.id, c]));
  const out: Movie[] = [];

  for (const s of raw) {
    const rawName = (s.name ?? '').trim();
    if (!rawName) continue;
    const { title, year } = parseTitleYear(rawName);
    const cat = s.category_id != null ? catById.get(String(s.category_id)) : undefined;
    if (cat) cat.count++;
    const ext = s.container_extension?.replace(/^\./, '') || 'mp4';
    const streamId = String(s.stream_id);

    out.push({
      id: `${playlistId}:mv:${streamId}`,
      playlistId,
      streamId,
      name: title,
      rawName,
      poster: s.stream_icon?.trim() || s.cover?.trim() || null,
      backdrop: null,
      categoryId: cat?.id ?? null,
      categoryName: cat?.name ?? null,
      year,
      rating: ratingOf(s.rating_5based ?? s.rating),
      durationSecs: null,
      genre: cat?.name ?? null,
      plot: null,
      cast: null,
      director: null,
      container: containerFromExt(ext),
      containerExt: ext,
      directUrl: null,
      addedAt: s.added ? Number(s.added) * 1000 || null : null,
      adult: isAdult(cat?.name, rawName),
    });
  }
  return out;
}

export function adaptSeriesList(
  raw: XtreamSeries[] | undefined,
  categories: Category[],
  playlistId: string,
): Series[] {
  if (!Array.isArray(raw)) return [];
  const catById = new Map(categories.map((c) => [c.id, c]));
  const out: Series[] = [];

  for (const s of raw) {
    const rawName = (s.name ?? '').trim();
    if (!rawName) continue;
    const { title, year } = parseTitleYear(rawName);
    const cat = s.category_id != null ? catById.get(String(s.category_id)) : undefined;
    if (cat) cat.count++;
    const seriesId = String(s.series_id);

    out.push({
      id: `${playlistId}:sr:${seriesId}`,
      playlistId,
      seriesId,
      name: title,
      rawName,
      poster: s.cover?.trim() || null,
      backdrop: Array.isArray(s.backdrop_path) ? s.backdrop_path[0] ?? null : null,
      categoryId: cat?.id ?? null,
      categoryName: cat?.name ?? null,
      year: year ?? yearOf(s.releaseDate ?? s.release_date),
      rating: ratingOf(s.rating),
      genre: s.genre?.trim() || cat?.name || null,
      plot: s.plot?.trim() || null,
      cast: s.cast?.trim() || null,
      director: s.director?.trim() || null,
      addedAt: s.last_modified ? Number(s.last_modified) * 1000 || null : null,
      adult: isAdult(cat?.name, rawName),
    });
  }
  return out;
}

/** Merge get_series_info into an existing Series record. */
export function adaptSeriesInfo(info: XtreamSeriesInfo | undefined, base: Series): Series {
  if (!info) return base;
  const meta: Partial<XtreamSeries> = info.info ?? {};
  const seasons: Season[] = [];

  const episodesBySeason = info.episodes ?? {};
  for (const [seasonKey, list] of Object.entries(episodesBySeason)) {
    const seasonNumber = Number(seasonKey);
    if (!Number.isFinite(seasonNumber)) continue;
    const declared = info.seasons?.find((s) => s.season_number === seasonNumber);
    const episodes: Episode[] = (Array.isArray(list) ? list : []).map((e) => {
      const ext = e.container_extension?.replace(/^\./, '') || 'mp4';
      return {
        id: `${base.playlistId}:ep:${e.id}`,
        seriesId: base.seriesId,
        seasonNumber,
        episodeNumber: Number(e.episode_num) || 0,
        title: (e.title ?? `Episode ${e.episode_num}`).trim(),
        plot: e.info?.plot?.trim() || null,
        thumbnail: e.info?.movie_image?.trim() || null,
        durationSecs: e.info?.duration_secs ?? null,
        container: containerFromExt(ext),
        containerExt: ext,
        directUrl: null,
      };
    });
    episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
    seasons.push({
      seasonNumber,
      name: declared?.name?.trim() || `Season ${seasonNumber}`,
      overview: declared?.overview?.trim() || null,
      poster: declared?.cover?.trim() || null,
      episodes,
    });
  }
  seasons.sort((a, b) => a.seasonNumber - b.seasonNumber);

  return {
    ...base,
    poster: base.poster ?? meta.cover?.trim() ?? null,
    backdrop:
      base.backdrop ?? (Array.isArray(meta.backdrop_path) ? meta.backdrop_path[0] ?? null : null),
    plot: base.plot ?? meta.plot?.trim() ?? null,
    cast: base.cast ?? meta.cast?.trim() ?? null,
    director: base.director ?? meta.director?.trim() ?? null,
    genre: base.genre ?? meta.genre?.trim() ?? null,
    rating: base.rating ?? ratingOf(meta.rating),
    seasons,
  };
}

function numOrUndef(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function ratingOf(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Providers mix /5 and /10 scales. Normalize to /10.
  return n <= 5 ? Math.round(n * 2 * 10) / 10 : Math.round(n * 10) / 10;
}

function yearOf(v: string | undefined): number | null {
  if (!v) return null;
  const m = /(19|20)\d{2}/.exec(v);
  return m ? Number(m[0]) : null;
}
