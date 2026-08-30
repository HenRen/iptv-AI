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
} from '@/types';

/**
 * Browser -> our own backend. The only network surface the client has.
 *
 * There is deliberately no client-side IPTV code: the browser cannot reach a
 * provider directly, which is what keeps credentials server-side and sidesteps
 * CORS and mixed-content entirely.
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
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

export interface Page<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  noPlaylist?: boolean;
}

export const api = {
  playlists: () =>
    request<{ playlists: Playlist[]; activePlaylistId: string | null }>('/api/playlists'),

  connectXtream: (input: { name: string; host: string; username: string; password: string }) =>
    request<{ playlist: Playlist }>('/api/playlists', {
      method: 'POST',
      body: JSON.stringify({ type: 'xtream', ...input }),
    }),

  connectM3UUrl: (input: { name: string; url: string; epgUrl?: string }) =>
    request<{ playlist: Playlist }>('/api/playlists', {
      method: 'POST',
      body: JSON.stringify({ type: 'm3u-url', ...input }),
    }),

  connectM3UFile: (input: { name: string; content: string }) =>
    request<{ playlist: Playlist }>('/api/playlists', {
      method: 'POST',
      body: JSON.stringify({ type: 'm3u-file', ...input }),
    }),

  connectMock: (name = 'Mock Provider') =>
    request<{ playlist: Playlist }>('/api/playlists', {
      method: 'POST',
      body: JSON.stringify({ type: 'mock', name }),
    }),

  refresh: (id: string) =>
    request<{ playlist: Playlist }>(`/api/playlists/${id}/refresh`, { method: 'POST' }),

  deletePlaylist: (id: string) =>
    request<{ ok: true }>(`/api/playlists?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),

  setActivePlaylist: (activePlaylistId: string) =>
    request<{ ok: true }>('/api/playlists', {
      method: 'PATCH',
      body: JSON.stringify({ activePlaylistId }),
    }),

  categories: (kind: 'live' | 'movie' | 'series') =>
    request<{ categories: Category[] }>(`/api/catalog?kind=${kind}&categories=1`),

  channels: (params: { categoryId?: string | null; offset?: number; limit?: number } = {}) => {
    const q = new URLSearchParams({ kind: 'live' });
    if (params.categoryId) q.set('categoryId', params.categoryId);
    if (params.offset != null) q.set('offset', String(params.offset));
    if (params.limit != null) q.set('limit', String(params.limit));
    return request<Page<Channel>>(`/api/catalog?${q}`);
  },

  channelsByIds: (ids: string[]) =>
    request<Page<Channel>>(`/api/catalog?kind=live&ids=${encodeURIComponent(ids.join(','))}`),

  movies: (params: { categoryId?: string | null; offset?: number; limit?: number } = {}) => {
    const q = new URLSearchParams({ kind: 'movie' });
    if (params.categoryId) q.set('categoryId', params.categoryId);
    if (params.offset != null) q.set('offset', String(params.offset));
    if (params.limit != null) q.set('limit', String(params.limit));
    return request<Page<Movie>>(`/api/catalog?${q}`);
  },

  series: (params: { categoryId?: string | null; offset?: number; limit?: number } = {}) => {
    const q = new URLSearchParams({ kind: 'series' });
    if (params.categoryId) q.set('categoryId', params.categoryId);
    if (params.offset != null) q.set('offset', String(params.offset));
    if (params.limit != null) q.set('limit', String(params.limit));
    return request<Page<Series>>(`/api/catalog?${q}`);
  },

  seriesInfo: (id: string) => request<Series>(`/api/series/${encodeURIComponent(id)}`),

  nowNext: (channelIds: string[]) =>
    request<{ nowNext: Record<string, NowNext> }>(
      `/api/epg?nownext=1&channels=${encodeURIComponent(channelIds.join(','))}`,
    ),

  epg: (channelIds: string[], from: number, to: number) =>
    request<{ schedules: Array<{ channelId: string; programs: EPGProgram[] }> }>(
      `/api/epg?channels=${encodeURIComponent(channelIds.join(','))}&from=${from}&to=${to}`,
    ),

  loadEpgUrl: (url: string) =>
    request<{ programs: number; matched: number; unmatched: number }>('/api/epg', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),

  loadEpgFile: (content: string) =>
    request<{ programs: number; matched: number; unmatched: number }>('/api/epg', {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  search: (q: string) =>
    request<{
      channels: Channel[];
      movies: Movie[];
      series: Series[];
      programs: Array<{ program: EPGProgram; channelId: string; channelName: string }>;
    }>(`/api/search?q=${encodeURIComponent(q)}`),

  play: (kind: 'live' | 'movie' | 'episode', id: string) =>
    request<PlaybackSource>(`/api/play?kind=${kind}&id=${encodeURIComponent(id)}`),

  diagnostics: () => request<DiagnosticsReport>('/api/diagnostics'),
};
