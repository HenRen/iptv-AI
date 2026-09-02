import type { HttpPort, HttpRequestOptions } from '../ports/http';
import type {
  Category,
  Channel,
  DiagnosticsReport,
  EPGProgram,
  Movie,
  NowNext,
  PlaybackSource,
  Playlist,
  Series,
} from '../types/index';
import type { Page, SearchResults } from '../iptv/IPTVService';

/**
 * The client half of StreamWise: how an app talks to `@streamwise/server`.
 *
 * There is deliberately no client-side IPTV code anywhere. A TV app cannot
 * reach a provider directly — that is what keeps credentials server-side and
 * sidesteps CORS and mixed content — so this is the entire network surface a
 * Lightning or React Native build has.
 *
 * It is built on `HttpPort` rather than `fetch` so it runs wherever core
 * runs, and it takes its port by argument rather than from `configureCore`
 * so that a client and a server can coexist in one process (which is exactly
 * what the integration tests do).
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * A catalogue page. `noPlaylist` is the one field the wire format adds over
 * the server-side `Page`: it distinguishes "this category is empty" from
 * "nothing is connected yet", which are different screens.
 */
export interface CatalogPage<T> extends Page<T> {
  noPlaylist?: boolean;
}

export interface ApiClientOptions {
  http: HttpPort;
  /**
   * Where the API lives, e.g. `http://tv-backend.lan:3211`. Empty for a
   * browser talking to its own origin, which is what the web app does.
   */
  baseUrl?: string;
  /** Applied to every request. Providers are slow; TV networks are slower. */
  timeoutMs?: number;
}

export interface EpgWindow {
  channelId: string;
  programs: EPGProgram[];
}

export interface CatalogQuery {
  categoryId?: string | null;
  offset?: number;
  limit?: number;
}

export class ApiClient {
  private readonly http: HttpPort;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: ApiClientOptions) {
    this.http = options.http;
    this.baseUrl = (options.baseUrl ?? '').replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  /** The absolute URL for a path the server handed back, e.g. a proxied stream. */
  resolve(path: string): string {
    return /^https?:\/\//i.test(path) ? path : `${this.baseUrl}${path}`;
  }

  private async request<T>(path: string, options: HttpRequestOptions = {}): Promise<T> {
    const res = await this.http.fetch(this.resolve(path), {
      timeoutMs: this.timeoutMs,
      noStore: true,
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    });

    const text = await res.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { error: text };
      }
    }

    if (!res.ok) {
      const message =
        body && typeof body === 'object' && 'error' in body
          ? String((body as { error: unknown }).error)
          : `Request failed (${res.status}).`;
      throw new ApiError(message, res.status);
    }
    return body as T;
  }

  private post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  private query(base: Record<string, string>, params: CatalogQuery): string {
    const q = new URLSearchParams(base);
    if (params.categoryId) q.set('categoryId', params.categoryId);
    if (params.offset != null) q.set('offset', String(params.offset));
    if (params.limit != null) q.set('limit', String(params.limit));
    return q.toString();
  }

  /* ---- playlists ---- */

  playlists(): Promise<{ playlists: Playlist[]; activePlaylistId: string | null }> {
    return this.request('/api/playlists');
  }

  connectXtream(input: {
    name: string;
    host: string;
    username: string;
    password: string;
  }): Promise<{ playlist: Playlist }> {
    return this.post('/api/playlists', { type: 'xtream', ...input });
  }

  connectM3UUrl(input: {
    name: string;
    url: string;
    epgUrl?: string;
  }): Promise<{ playlist: Playlist }> {
    return this.post('/api/playlists', { type: 'm3u-url', ...input });
  }

  connectM3UFile(input: { name: string; content: string }): Promise<{ playlist: Playlist }> {
    return this.post('/api/playlists', { type: 'm3u-file', ...input });
  }

  connectMock(name = 'Mock Provider'): Promise<{ playlist: Playlist }> {
    return this.post('/api/playlists', { type: 'mock', name });
  }

  refresh(id: string): Promise<{ playlist: Playlist }> {
    return this.post(`/api/playlists/${encodeURIComponent(id)}/refresh`);
  }

  deletePlaylist(id: string): Promise<{ ok: true }> {
    return this.request(`/api/playlists?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  setActivePlaylist(activePlaylistId: string): Promise<{ ok: true }> {
    return this.request('/api/playlists', {
      method: 'PATCH',
      body: JSON.stringify({ activePlaylistId }),
    });
  }

  /* ---- catalogue ---- */

  categories(kind: 'live' | 'movie' | 'series'): Promise<{ categories: Category[] }> {
    return this.request(`/api/catalog?kind=${kind}&categories=1`);
  }

  channels(params: CatalogQuery = {}): Promise<CatalogPage<Channel>> {
    return this.request(`/api/catalog?${this.query({ kind: 'live' }, params)}`);
  }

  channelsByIds(ids: string[]): Promise<CatalogPage<Channel>> {
    return this.request(`/api/catalog?kind=live&ids=${encodeURIComponent(ids.join(','))}`);
  }

  movies(params: CatalogQuery = {}): Promise<CatalogPage<Movie>> {
    return this.request(`/api/catalog?${this.query({ kind: 'movie' }, params)}`);
  }

  series(params: CatalogQuery = {}): Promise<CatalogPage<Series>> {
    return this.request(`/api/catalog?${this.query({ kind: 'series' }, params)}`);
  }

  seriesInfo(id: string): Promise<Series> {
    return this.request(`/api/series/${encodeURIComponent(id)}`);
  }

  /* ---- guide ---- */

  nowNext(channelIds: string[]): Promise<{ nowNext: Record<string, NowNext> }> {
    return this.request(`/api/epg?nownext=1&channels=${encodeURIComponent(channelIds.join(','))}`);
  }

  epg(channelIds: string[], from: number, to: number): Promise<{ schedules: EpgWindow[] }> {
    const channels = encodeURIComponent(channelIds.join(','));
    return this.request(`/api/epg?channels=${channels}&from=${from}&to=${to}`);
  }

  loadEpgUrl(url: string): Promise<{ programs: number; matched: number; unmatched: number }> {
    return this.post('/api/epg', { url });
  }

  loadEpgFile(content: string): Promise<{ programs: number; matched: number; unmatched: number }> {
    return this.post('/api/epg', { content });
  }

  /* ---- search, playback, diagnostics ---- */

  search(q: string): Promise<SearchResults> {
    return this.request(`/api/search?q=${encodeURIComponent(q)}`);
  }

  /**
   * A `PlaybackSource` whose `url` is a proxied, signed, expiring path — never
   * a provider URL and never a credential. Pass it through `resolve()` before
   * handing it to a player.
   */
  play(kind: 'live' | 'movie' | 'episode', id: string): Promise<PlaybackSource> {
    return this.request(`/api/play?kind=${kind}&id=${encodeURIComponent(id)}`);
  }

  diagnostics(): Promise<DiagnosticsReport> {
    return this.request('/api/diagnostics');
  }

  ask(body: Record<string, unknown>): Promise<unknown> {
    return this.post('/api/ai', body);
  }
}
