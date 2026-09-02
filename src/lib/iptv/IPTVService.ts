import 'server-only';
import type {
  CatalogStats,
  Category,
  Channel,
  DiagnosticsReport,
  EPGProgram,
  Movie,
  NowNext,
  PlaybackSource,
  Playlist,
  Series,
} from '@/types';
import { getStorage, KEYS } from '@/lib/storage';
import { assertSafeUrl } from '@/lib/security/urlGuard';
import {
  invalidate,
  loadCatalog,
  loadEpg,
  saveCatalog,
  saveEpg,
  type CatalogSnapshot,
  type EpgSnapshot,
} from './catalog';
import { adaptM3U } from './m3u/adapter';
import {
  adaptAccount,
  adaptCategories,
  adaptChannels,
  adaptMovies,
  adaptSeriesInfo,
  adaptSeriesList,
} from './xtream/adapter';
import { XtreamClient, XtreamError, redact, type XtreamCredentials } from './xtream/client';
import { parseXmltv, tightenSchedule } from './xmltv/parser';
import { matchChannels, nowNext, programsInWindow } from './xmltv/matcher';
import {
  allowedHostsFor,
  createPlaylist,
  getPlaylist,
  listPlaylists,
  readSecret,
  setStatus,
  updatePlaylist,
  type PlaylistSecret,
} from './playlists';
import { buildMockCatalog } from './mock/provider';
import { directSource, imageProxy, liveSource, vodSource } from './streamSource';

/**
 * The single service the rest of the application talks to.
 *
 * Route handlers call these functions; they never touch XtreamClient, the M3U
 * parser or the XMLTV parser directly. Swapping in a new provider means
 * writing an adapter and a branch here — nothing else changes.
 */

export interface ConnectResult {
  playlist: Playlist;
  stats: CatalogStats;
}

export interface ProgressReporter {
  (step: string): void;
}

const noop: ProgressReporter = () => {};

/* ------------------------------------------------------------------ *
 * Connect
 * ------------------------------------------------------------------ */

export async function connectXtream(
  input: { name: string; host: string; username: string; password: string },
  onProgress: ProgressReporter = noop,
): Promise<ConnectResult> {
  const secret: PlaylistSecret = {
    kind: 'xtream',
    host: input.host,
    username: input.username,
    password: input.password,
  };
  const { playlist } = await createPlaylist(input.name, secret);
  try {
    const stats = await buildXtreamCatalog(playlist.id, secret, onProgress);
    const updated = await updatePlaylist(playlist.id, { status: 'connected', stats, lastError: undefined });
    return { playlist: updated ?? playlist, stats };
  } catch (err) {
    await applyError(playlist.id, err);
    throw err;
  }
}

export async function connectM3UUrl(
  input: { name: string; url: string; epgUrl?: string },
  onProgress: ProgressReporter = noop,
): Promise<ConnectResult> {
  const secret: PlaylistSecret = { kind: 'm3u-url', url: input.url, epgUrl: input.epgUrl };
  const { playlist } = await createPlaylist(input.name, secret);
  try {
    onProgress('Downloading playlist…');
    const text = await fetchPlaylistText(playlist.id, input.url);
    const stats = await buildM3UCatalog(playlist.id, text, onProgress, input.epgUrl);
    const updated = await updatePlaylist(playlist.id, { status: 'connected', stats, lastError: undefined });
    return { playlist: updated ?? playlist, stats };
  } catch (err) {
    await applyError(playlist.id, err);
    throw err;
  }
}

export async function connectM3UFile(
  input: { name: string; text: string },
  onProgress: ProgressReporter = noop,
): Promise<ConnectResult> {
  const secret: PlaylistSecret = { kind: 'm3u-file' };
  const { playlist } = await createPlaylist(input.name, secret);
  try {
    const stats = await buildM3UCatalog(playlist.id, input.text, onProgress);
    const updated = await updatePlaylist(playlist.id, { status: 'connected', stats, lastError: undefined });
    return { playlist: updated ?? playlist, stats };
  } catch (err) {
    await applyError(playlist.id, err);
    throw err;
  }
}

export async function connectMock(name = 'Mock Provider'): Promise<ConnectResult> {
  const { playlist } = await createPlaylist(name, { kind: 'mock' });
  const mock = buildMockCatalog(playlist.id);
  const epgMappings: Record<string, string> = {};
  for (const ch of mock.channels) if (ch.tvgId) epgMappings[ch.id] = ch.tvgId;

  const stats: CatalogStats = {
    channels: mock.channels.length,
    movies: mock.movies.length,
    series: mock.series.length,
    categories:
      mock.liveCategories.length + mock.movieCategories.length + mock.seriesCategories.length,
    epgPrograms: mock.programs.length,
  };

  await saveCatalog({
    playlistId: playlist.id,
    builtAt: Date.now(),
    channels: mock.channels,
    movies: mock.movies,
    series: mock.series,
    liveCategories: mock.liveCategories,
    movieCategories: mock.movieCategories,
    seriesCategories: mock.seriesCategories,
    stats,
    epgMappings,
  });
  await saveEpg({
    playlistId: playlist.id,
    builtAt: Date.now(),
    programs: mock.programs,
    source: 'mock',
  });

  const updated = await updatePlaylist(playlist.id, { status: 'connected', stats });
  return { playlist: updated ?? playlist, stats };
}

export async function refreshPlaylist(
  playlistId: string,
  onProgress: ProgressReporter = noop,
): Promise<ConnectResult> {
  const playlist = await getPlaylist(playlistId);
  if (!playlist) throw new Error('Playlist not found.');
  const secret = await readSecret(playlistId);
  if (!secret) throw new Error('Stored credentials for this playlist could not be read.');

  if (secret.kind === 'm3u-file') {
    // Nothing to re-fetch — an uploaded file has no origin to refresh from.
    return { playlist, stats: playlist.stats };
  }

  await setStatus(playlistId, 'connecting');
  invalidate(playlistId);
  try {
    let stats: CatalogStats;
    if (secret.kind === 'xtream') {
      stats = await buildXtreamCatalog(playlistId, secret, onProgress);
    } else if (secret.kind === 'm3u-url') {
      onProgress('Downloading playlist…');
      const text = await fetchPlaylistText(playlistId, secret.url!);
      stats = await buildM3UCatalog(playlistId, text, onProgress, secret.epgUrl);
    } else {
      const result = await connectMock(playlist.name);
      return result;
    }
    const updated = await updatePlaylist(playlistId, {
      status: 'connected',
      stats,
      lastError: undefined,
    });
    return { playlist: updated ?? playlist, stats };
  } catch (err) {
    await applyError(playlistId, err);
    throw err;
  }
}

/* ------------------------------------------------------------------ *
 * Catalog builders
 * ------------------------------------------------------------------ */

async function buildXtreamCatalog(
  playlistId: string,
  secret: PlaylistSecret,
  onProgress: ProgressReporter,
): Promise<CatalogStats> {
  const creds: XtreamCredentials = {
    host: secret.host!,
    username: secret.username!,
    password: secret.password!,
  };
  await assertProviderHostAllowed(playlistId, creds.host);
  const client = new XtreamClient(creds);

  onProgress('Authenticating with provider…');
  const auth = await client.authenticate();
  const account = adaptAccount(auth.data);

  onProgress('Loading channels…');
  const [liveCatsRes, liveRes] = await Promise.all([client.liveCategories(), client.liveStreams()]);
  const liveCategories = adaptCategories(liveCatsRes.data, 'live');
  const channels = adaptChannels(liveRes.data, liveCategories, playlistId);

  onProgress('Loading movies…');
  const movieCategories = adaptCategories(await optional(client.vodCategories()), 'movie');
  const movies = adaptMovies(await optional(client.vodStreams()), movieCategories, playlistId);

  onProgress('Loading series…');
  const seriesCategories = adaptCategories(await optional(client.seriesCategories()), 'series');
  const series = adaptSeriesList(await optional(client.seriesList()), seriesCategories, playlistId);

  onProgress('Preparing TV Guide…');
  let programs: EPGProgram[] = [];
  let epgMappings: Record<string, string> = {};
  try {
    const xml = await client.fetchXmltv();
    const parsed = parseXmltv(xml);
    programs = tightenSchedule(parsed.programs);
    const overrides = await readEpgOverrides(playlistId);
    const match = matchChannels(channels, parsed.channels, overrides);
    epgMappings = Object.fromEntries(match.mappings.map((m) => [m.channelId, m.epgChannelId]));
  } catch {
    // A provider without an XMLTV feed is normal; the guide degrades to
    // "No information" rather than the app failing to connect.
    programs = [];
  }

  const stats: CatalogStats = {
    channels: channels.length,
    movies: movies.length,
    series: series.length,
    categories: liveCategories.length + movieCategories.length + seriesCategories.length,
    epgPrograms: programs.length,
  };

  await saveCatalog({
    playlistId,
    builtAt: Date.now(),
    channels,
    movies,
    series,
    liveCategories,
    movieCategories,
    seriesCategories,
    stats,
    epgMappings,
  });
  if (programs.length > 0) {
    await saveEpg({ playlistId, builtAt: Date.now(), programs, source: 'provider' });
  }
  await updatePlaylist(playlistId, { account, host: client.displayHost });
  return stats;
}

async function buildM3UCatalog(
  playlistId: string,
  text: string,
  onProgress: ProgressReporter,
  customEpgUrl?: string,
): Promise<CatalogStats> {
  onProgress('Parsing playlist…');
  const catalog = adaptM3U(text, playlistId);

  onProgress('Preparing TV Guide…');
  let programs: EPGProgram[] = [];
  let epgMappings: Record<string, string> = {};
  const epgUrl = customEpgUrl || catalog.epgUrl;
  if (epgUrl) {
    try {
      const xml = await fetchPlaylistText(playlistId, epgUrl, 90_000);
      const parsed = parseXmltv(xml);
      programs = tightenSchedule(parsed.programs);
      const overrides = await readEpgOverrides(playlistId);
      const match = matchChannels(catalog.channels, parsed.channels, overrides);
      epgMappings = Object.fromEntries(match.mappings.map((m) => [m.channelId, m.epgChannelId]));
    } catch {
      programs = [];
    }
  }

  const stats: CatalogStats = {
    channels: catalog.channels.length,
    movies: catalog.movies.length,
    series: catalog.series.length,
    categories:
      catalog.liveCategories.length + catalog.movieCategories.length + catalog.seriesCategories.length,
    epgPrograms: programs.length,
  };

  await saveCatalog({
    playlistId,
    builtAt: Date.now(),
    channels: catalog.channels,
    movies: catalog.movies,
    series: catalog.series,
    liveCategories: catalog.liveCategories,
    movieCategories: catalog.movieCategories,
    seriesCategories: catalog.seriesCategories,
    stats,
    epgMappings,
  });
  if (programs.length > 0) {
    await saveEpg({ playlistId, builtAt: Date.now(), programs, source: epgUrl ?? 'playlist' });
  }
  return stats;
}

/* ------------------------------------------------------------------ *
 * Queries
 * ------------------------------------------------------------------ */

export interface ChannelQuery {
  playlistId: string;
  categoryId?: string | null;
  genre?: string | null;
  offset?: number;
  limit?: number;
  includeAdult?: boolean;
  ids?: string[];
}

export interface Page<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}

export async function getLiveCategories(playlistId: string): Promise<Category[]> {
  const loaded = await loadCatalog(playlistId);
  if (!loaded) return [];
  const hidden = await readHiddenCategories(playlistId);
  return loaded.snapshot.liveCategories
    .filter((c) => !hidden.includes(c.id))
    .map((c) => ({ ...c, hidden: false }));
}

export async function getMovieCategories(playlistId: string): Promise<Category[]> {
  const loaded = await loadCatalog(playlistId);
  if (!loaded) return [];
  const hidden = await readHiddenCategories(playlistId);
  return loaded.snapshot.movieCategories.filter((c) => !hidden.includes(c.id));
}

export async function getSeriesCategories(playlistId: string): Promise<Category[]> {
  const loaded = await loadCatalog(playlistId);
  if (!loaded) return [];
  const hidden = await readHiddenCategories(playlistId);
  return loaded.snapshot.seriesCategories.filter((c) => !hidden.includes(c.id));
}

export async function getLiveChannels(query: ChannelQuery): Promise<Page<Channel>> {
  const loaded = await loadCatalog(query.playlistId);
  if (!loaded) return { items: [], total: 0, offset: 0, limit: 0 };

  const hidden = await readHiddenCategories(query.playlistId);
  let list = loaded.snapshot.channels;

  if (query.ids && query.ids.length > 0) {
    const wanted = new Set(query.ids);
    const items = query.ids
      .map((id) => loaded.byChannelId.get(id))
      .filter((c): c is Channel => !!c && wanted.has(c.id));
    return { items: items.map(withProxiedArt), total: items.length, offset: 0, limit: items.length };
  }

  if (!query.includeAdult) list = list.filter((c) => !c.adult);
  if (hidden.length > 0) list = list.filter((c) => !c.categoryId || !hidden.includes(c.categoryId));
  if (query.categoryId) list = list.filter((c) => c.categoryId === query.categoryId);
  if (query.genre) list = list.filter((c) => c.genre === query.genre);

  const offset = Math.max(0, query.offset ?? 0);
  const limit = Math.min(500, Math.max(1, query.limit ?? 200));
  return {
    items: list.slice(offset, offset + limit).map(withProxiedArt),
    total: list.length,
    offset,
    limit,
  };
}

export async function getMovies(query: ChannelQuery): Promise<Page<Movie>> {
  const loaded = await loadCatalog(query.playlistId);
  if (!loaded) return { items: [], total: 0, offset: 0, limit: 0 };
  const hidden = await readHiddenCategories(query.playlistId);
  let list = loaded.snapshot.movies;
  if (!query.includeAdult) list = list.filter((m) => !m.adult);
  if (hidden.length > 0) list = list.filter((m) => !m.categoryId || !hidden.includes(m.categoryId));
  if (query.categoryId) list = list.filter((m) => m.categoryId === query.categoryId);

  const offset = Math.max(0, query.offset ?? 0);
  const limit = Math.min(300, Math.max(1, query.limit ?? 60));
  return {
    items: list.slice(offset, offset + limit).map((m) => ({
      ...m,
      poster: imageProxy(query.playlistId, m.poster) ?? m.poster,
    })),
    total: list.length,
    offset,
    limit,
  };
}

export async function getSeriesPage(query: ChannelQuery): Promise<Page<Series>> {
  const loaded = await loadCatalog(query.playlistId);
  if (!loaded) return { items: [], total: 0, offset: 0, limit: 0 };
  const hidden = await readHiddenCategories(query.playlistId);
  let list = loaded.snapshot.series;
  if (!query.includeAdult) list = list.filter((s) => !s.adult);
  if (hidden.length > 0) list = list.filter((s) => !s.categoryId || !hidden.includes(s.categoryId));
  if (query.categoryId) list = list.filter((s) => s.categoryId === query.categoryId);

  const offset = Math.max(0, query.offset ?? 0);
  const limit = Math.min(300, Math.max(1, query.limit ?? 60));
  return {
    items: list.slice(offset, offset + limit).map((s) => ({
      ...s,
      poster: imageProxy(query.playlistId, s.poster) ?? s.poster,
      seasons: undefined,
    })),
    total: list.length,
    offset,
    limit,
  };
}

export async function getSeriesInfo(playlistId: string, seriesId: string): Promise<Series | null> {
  const loaded = await loadCatalog(playlistId);
  if (!loaded) return null;
  const base = loaded.bySeriesId.get(seriesId) ?? null;
  if (!base) return null;
  if (base.seasons && base.seasons.length > 0) return base;

  const secret = await readSecret(playlistId);
  if (secret?.kind !== 'xtream') return base;

  const client = new XtreamClient({
    host: secret.host!,
    username: secret.username!,
    password: secret.password!,
  });
  try {
    const info = await client.seriesInfo(base.seriesId);
    const merged = adaptSeriesInfo(info.data, base);
    // Cache the fetched detail back into the snapshot for next time.
    base.seasons = merged.seasons;
    base.plot = merged.plot;
    base.backdrop = merged.backdrop;
    await saveCatalog(loaded.snapshot);
    return merged;
  } catch {
    return base;
  }
}

export async function getChannel(playlistId: string, channelId: string): Promise<Channel | null> {
  const loaded = await loadCatalog(playlistId);
  const ch = loaded?.byChannelId.get(channelId);
  return ch ? withProxiedArt(ch) : null;
}

export async function getMovie(playlistId: string, movieId: string): Promise<Movie | null> {
  const loaded = await loadCatalog(playlistId);
  const m = loaded?.byMovieId.get(movieId);
  if (!m) return null;
  return { ...m, poster: imageProxy(playlistId, m.poster) ?? m.poster };
}

/* ------------------------------------------------------------------ *
 * EPG
 * ------------------------------------------------------------------ */

export interface ChannelSchedule {
  channelId: string;
  programs: EPGProgram[];
}

export async function getEPG(
  playlistId: string,
  channelIds: string[],
  from: number,
  to: number,
): Promise<ChannelSchedule[]> {
  const [catalog, epg] = await Promise.all([loadCatalog(playlistId), loadEpg(playlistId)]);
  if (!catalog || !epg) return channelIds.map((id) => ({ channelId: id, programs: [] }));

  return channelIds.map((channelId) => {
    const key = catalog.snapshot.epgMappings[channelId];
    const programs = key ? epg.byChannelKey.get(key.toLowerCase()) : undefined;
    return { channelId, programs: programsInWindow(programs, from, to) };
  });
}

export async function getNowNext(
  playlistId: string,
  channelIds: string[],
  at = Date.now(),
): Promise<Record<string, NowNext>> {
  const [catalog, epg] = await Promise.all([loadCatalog(playlistId), loadEpg(playlistId)]);
  const out: Record<string, NowNext> = {};
  if (!catalog || !epg) {
    for (const id of channelIds) out[id] = { now: null, next: null, progress: 0 };
    return out;
  }
  for (const id of channelIds) {
    const key = catalog.snapshot.epgMappings[id];
    out[id] = nowNext(key ? epg.byChannelKey.get(key.toLowerCase()) : undefined, at);
  }
  return out;
}

/** Replace the EPG for a playlist from a user-supplied XMLTV source. */
export async function setCustomEpg(
  playlistId: string,
  xml: string,
  source: string,
): Promise<{ programs: number; matched: number; unmatched: number }> {
  const catalog = await loadCatalog(playlistId);
  if (!catalog) throw new Error('Connect a playlist before loading a TV guide.');

  const parsed = parseXmltv(xml);
  const programs = tightenSchedule(parsed.programs);
  const overrides = await readEpgOverrides(playlistId);
  const match = matchChannels(catalog.snapshot.channels, parsed.channels, overrides);

  const snapshot: CatalogSnapshot = {
    ...catalog.snapshot,
    epgMappings: Object.fromEntries(match.mappings.map((m) => [m.channelId, m.epgChannelId])),
    stats: { ...catalog.snapshot.stats, epgPrograms: programs.length },
  };
  await saveCatalog(snapshot);
  const epgSnapshot: EpgSnapshot = { playlistId, builtAt: Date.now(), programs, source };
  await saveEpg(epgSnapshot);
  await updatePlaylist(playlistId, {
    stats: snapshot.stats,
    epgSource: { kind: source.startsWith('http') ? 'url' : 'file', label: source },
  });

  return {
    programs: programs.length,
    matched: match.mappings.length,
    unmatched: match.unmatched.length,
  };
}

/* ------------------------------------------------------------------ *
 * Search
 * ------------------------------------------------------------------ */

export interface SearchResults {
  channels: Channel[];
  movies: Movie[];
  series: Series[];
  programs: Array<{ program: EPGProgram; channelId: string; channelName: string }>;
}

export async function search(
  playlistId: string,
  query: string,
  limitPerGroup = 20,
): Promise<SearchResults> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { channels: [], movies: [], series: [], programs: [] };

  const [catalog, epg] = await Promise.all([loadCatalog(playlistId), loadEpg(playlistId)]);
  if (!catalog) return { channels: [], movies: [], series: [], programs: [] };

  const [hidden, allowAdult] = await Promise.all([
    readHiddenCategories(playlistId),
    adultAllowed(),
  ]);
  const visible = <T extends { categoryId: string | null; adult: boolean }>(x: T) =>
    (allowAdult || !x.adult) && (!x.categoryId || !hidden.includes(x.categoryId));

  const channels = catalog.channelIndex
    .search(trimmed, limitPerGroup * 2)
    .map((i) => catalog.snapshot.channels[i])
    .filter(visible)
    .slice(0, limitPerGroup)
    .map(withProxiedArt);

  const movies = catalog.movieIndex
    .search(trimmed, limitPerGroup * 2)
    .map((i) => catalog.snapshot.movies[i])
    .filter(visible)
    .slice(0, limitPerGroup)
    .map((m) => ({ ...m, poster: imageProxy(playlistId, m.poster) ?? m.poster }));

  const series = catalog.seriesIndex
    .search(trimmed, limitPerGroup * 2)
    .map((i) => catalog.snapshot.series[i])
    .filter(visible)
    .slice(0, limitPerGroup)
    .map((s) => ({ ...s, poster: imageProxy(playlistId, s.poster) ?? s.poster, seasons: undefined }));

  // Programme search is limited to the next 24h — a full EPG scan is not worth
  // it and users searching the guide mean "on soon".
  const programs: SearchResults['programs'] = [];
  if (epg) {
    const needle = trimmed.toLowerCase();
    const from = Date.now();
    const to = from + 24 * 60 * 60 * 1000;
    const channelByKey = new Map<string, Channel>();
    for (const ch of catalog.snapshot.channels) {
      const key = catalog.snapshot.epgMappings[ch.id];
      if (key && !channelByKey.has(key.toLowerCase())) channelByKey.set(key.toLowerCase(), ch);
    }
    for (const p of epg.snapshot.programs) {
      if (p.stop < from || p.start > to) continue;
      if (!p.title.toLowerCase().includes(needle)) continue;
      const ch = channelByKey.get(p.channelKey.toLowerCase());
      if (!ch || ch.adult) continue;
      programs.push({ program: p, channelId: ch.id, channelName: ch.name });
      if (programs.length >= limitPerGroup) break;
    }
  }

  return { channels, movies, series, programs };
}

/* ------------------------------------------------------------------ *
 * Playback
 * ------------------------------------------------------------------ */

export async function getStreamSource(
  playlistId: string,
  kind: 'live' | 'movie' | 'episode',
  entityId: string,
): Promise<PlaybackSource | null> {
  const loaded = await loadCatalog(playlistId);
  if (!loaded) return null;

  if (kind === 'live') {
    const ch = loaded.byChannelId.get(entityId);
    if (!ch) return null;
    if (ch.directUrl) return directSource(playlistId, ch.directUrl, 'live', ch.name, ch.container);
    return liveSource(playlistId, ch.streamId, ch.name);
  }

  if (kind === 'movie') {
    const m = loaded.byMovieId.get(entityId);
    if (!m) return null;
    if (m.directUrl) return directSource(playlistId, m.directUrl, 'movie', m.name, m.container);
    return vodSource(playlistId, 'movie', m.streamId, m.containerExt ?? 'mp4', m.name);
  }

  for (const s of loaded.snapshot.series) {
    for (const season of s.seasons ?? []) {
      const ep = season.episodes.find((e) => e.id === entityId);
      if (!ep) continue;
      const title = `${s.name} · S${ep.seasonNumber}E${ep.episodeNumber}`;
      if (ep.directUrl) return directSource(playlistId, ep.directUrl, 'episode', title, ep.container);
      const rawId = entityId.split(':ep:')[1] ?? ep.id;
      return vodSource(playlistId, 'episode', rawId, ep.containerExt ?? 'mp4', title);
    }
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Diagnostics
 * ------------------------------------------------------------------ */

export async function diagnostics(playlistId: string): Promise<DiagnosticsReport | null> {
  const playlist = await getPlaylist(playlistId);
  if (!playlist) return null;
  const [catalog, epg] = await Promise.all([loadCatalog(playlistId), loadEpg(playlistId)]);

  const channels = catalog?.snapshot.channels ?? [];
  const mappings = catalog?.snapshot.epgMappings ?? {};
  const notes: string[] = [];

  const duplicateFamilies = catalog
    ? [...catalog.families.values()].filter((f) => f.variants.length > 1).length
    : 0;
  const withLogo = channels.filter((c) => c.logo).length;
  const withEpg = channels.filter((c) => mappings[c.id]).length;
  const uncategorized = channels.filter((c) => !c.categoryId).length;
  const unsupported = channels.filter((c) => c.container === 'unknown').length;

  if (!epg) notes.push('No EPG data is loaded. Add an XMLTV source in Settings to populate the guide.');
  if (channels.length > 0 && withEpg / channels.length < 0.5)
    notes.push('Fewer than half of the channels are matched to EPG data.');
  if (duplicateFamilies > 0)
    notes.push(`${duplicateFamilies} channel groups have multiple quality or backup variants.`);
  if (unsupported > 0)
    notes.push(`${unsupported} channels use a container the browser cannot play directly.`);

  return {
    generatedAt: Date.now(),
    playlistId,
    providerKind: playlist.kind,
    status: playlist.status,
    counts: playlist.stats,
    health: {
      channelsWithLogo: withLogo,
      channelsWithEpg: withEpg,
      uncategorized,
      duplicateFamilies,
      adultChannels: channels.filter((c) => c.adult).length,
      unsupportedContainers: unsupported,
    },
    lastApi: null,
    lastRefreshAt: catalog?.snapshot.builtAt ?? null,
    notes,
  };
}

export async function getPlaylists(): Promise<Playlist[]> {
  return listPlaylists();
}

/* ------------------------------------------------------------------ *
 * Internals
 * ------------------------------------------------------------------ */

function withProxiedArt(ch: Channel): Channel {
  return { ...ch, logo: imageProxy(ch.playlistId, ch.logo) ?? ch.logo, directUrl: null };
}

async function optional<T>(p: Promise<{ data: T }>): Promise<T | undefined> {
  try {
    return (await p).data;
  } catch (err) {
    if (err instanceof XtreamError && err.kind === 'unsupported-action') return undefined;
    if (err instanceof XtreamError && err.kind === 'auth-failed') throw err;
    return undefined;
  }
}

async function fetchPlaylistText(
  playlistId: string,
  url: string,
  timeoutMs = 60_000,
): Promise<string> {
  const hosts = await allowedHostsFor(playlistId);
  const safe = await assertSafeUrl(url, { allowedHosts: hosts });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(safe, {
      signal: controller.signal,
      headers: { 'User-Agent': 'HENREN-IPTV/0.1', Accept: '*/*' },
      cache: 'no-store',
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error('The playlist URL was rejected by the provider. Check the credentials in the URL.');
    }
    if (!res.ok) throw new Error(`The playlist could not be downloaded (HTTP ${res.status}).`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function assertProviderHostAllowed(playlistId: string, host: string) {
  const hosts = await allowedHostsFor(playlistId);
  const probe = /^https?:\/\//i.test(host) ? host : `http://${host}`;
  await assertSafeUrl(probe, { allowedHosts: hosts });
}

async function applyError(playlistId: string, err: unknown) {
  const message =
    err instanceof XtreamError
      ? err.message
      : err instanceof Error
        ? redact(err.message)
        : 'An unknown error occurred while connecting.';
  const status =
    err instanceof XtreamError && err.kind === 'auth-failed'
      ? 'auth-failed'
      : err instanceof XtreamError && err.kind === 'offline'
        ? 'offline'
        : 'playlist-error';
  await setStatus(playlistId, status, message);
}

async function readEpgOverrides(playlistId: string): Promise<Record<string, string>> {
  return (
    (await getStorage().getJSON<Record<string, string>>(KEYS.epgOverrides(playlistId))) ?? {}
  );
}

async function readHiddenCategories(playlistId: string): Promise<string[]> {
  const settings = await getStorage().getJSON<{ hiddenCategories?: Record<string, string[]> }>(
    KEYS.settings,
  );
  return settings?.hiddenCategories?.[playlistId] ?? [];
}

/**
 * Whether adult content may be returned at all. Defaults to false, so the
 * filter is applied even before a client has expressed a preference —
 * unclassified installs are safe, not permissive.
 */
export async function adultAllowed(): Promise<boolean> {
  const settings = await getStorage().getJSON<{ allowAdult?: boolean }>(KEYS.settings);
  return Boolean(settings?.allowAdult);
}
