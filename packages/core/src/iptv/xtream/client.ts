import { HttpTimeoutError, http, type HttpResponse } from '../../ports/index';

/**
 * Xtream Codes player_api client. NEVER RUN THIS IN A CLIENT.
 *
 * Credentials never leave this module's process. The browser — and a TV app —
 * talks to /api/catalog/* and /api/stream with a playlistId; this file is the
 * only place that knows the username and password, and it belongs wherever
 * the secure store lives, which is the server.
 */

export interface XtreamCredentials {
  host: string; // e.g. http://line.example.com  or  http://host:8080
  username: string;
  password: string;
}

export class XtreamError extends Error {
  constructor(
    message: string,
    readonly kind: 'auth-failed' | 'offline' | 'playlist-error' | 'unsupported-action',
    readonly action?: string,
  ) {
    super(message);
    this.name = 'XtreamError';
  }
}

/** Strip any credentials that might appear in a URL before it is logged. */
export function redact(text: string): string {
  return text
    .replace(/(username=)[^&\s]+/gi, '$1***')
    .replace(/(password=)[^&\s]+/gi, '$1***')
    .replace(/\/\/[^/@\s]+:[^/@\s]+@/g, '//***:***@');
}

const DEFAULT_TIMEOUT_MS = 20_000;
const USER_AGENT = 'HENREN-IPTV/0.1 (+https://localhost)';

export interface XtreamCallResult<T> {
  data: T;
  ms: number;
}

export class XtreamClient {
  private readonly base: string;

  constructor(private readonly creds: XtreamCredentials) {
    const host = creds.host.trim().replace(/\/+$/, '');
    this.base = /^https?:\/\//i.test(host) ? host : `http://${host}`;
  }

  /** Public host, safe to show in the UI. Never includes credentials. */
  get displayHost(): string {
    try {
      const u = new URL(this.base);
      return u.host;
    } catch {
      return this.base;
    }
  }

  private apiUrl(action?: string, params?: Record<string, string | number>): string {
    const url = new URL(`${this.base}/player_api.php`);
    url.searchParams.set('username', this.creds.username);
    url.searchParams.set('password', this.creds.password);
    if (action) url.searchParams.set('action', action);
    for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, String(v));
    return url.toString();
  }

  /** Credential-bearing stream URL. Only ever used server-side by the proxy. */
  streamUrl(kind: 'live' | 'movie' | 'series', streamId: string, ext: string): string {
    const segment = kind === 'live' ? 'live' : kind === 'movie' ? 'movie' : 'series';
    const u = encodeURIComponent(this.creds.username);
    const p = encodeURIComponent(this.creds.password);
    return `${this.base}/${segment}/${u}/${p}/${streamId}.${ext}`;
  }

  /** The provider's XMLTV feed. Server-side only. */
  epgUrl(): string {
    const url = new URL(`${this.base}/xmltv.php`);
    url.searchParams.set('username', this.creds.username);
    url.searchParams.set('password', this.creds.password);
    return url.toString();
  }

  m3uUrl(): string {
    const url = new URL(`${this.base}/get.php`);
    url.searchParams.set('username', this.creds.username);
    url.searchParams.set('password', this.creds.password);
    url.searchParams.set('type', 'm3u_plus');
    url.searchParams.set('output', 'ts');
    return url.toString();
  }

  private async call<T>(
    action: string | undefined,
    params?: Record<string, string | number>,
    { optional = false, timeoutMs = DEFAULT_TIMEOUT_MS }: { optional?: boolean; timeoutMs?: number } = {},
  ): Promise<XtreamCallResult<T>> {
    const started = Date.now();
    let res: HttpResponse;
    try {
      res = await http().fetch(this.apiUrl(action, params), {
        timeoutMs,
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json,text/plain,*/*' },
        noStore: true,
      });
    } catch (err) {
      const reason = err instanceof HttpTimeoutError ? 'timed out' : 'was unreachable';
      throw new XtreamError(
        `The IPTV provider ${reason}. Check the server URL and that the provider is online.`,
        'offline',
        action,
      );
    }

    if (res.status === 401 || res.status === 403) {
      throw new XtreamError(
        'Unable to authenticate with the IPTV provider. Check the server URL, username and password.',
        'auth-failed',
        action,
      );
    }
    if (!res.ok) {
      if (optional) throw new XtreamError(`Provider does not support "${action}".`, 'unsupported-action', action);
      throw new XtreamError(
        `The IPTV provider returned an error (HTTP ${res.status}).`,
        'playlist-error',
        action,
      );
    }

    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      // Some panels answer with an HTML error page or an empty body.
      if (optional) throw new XtreamError(`Provider returned a non-JSON reply for "${action}".`, 'unsupported-action', action);
      throw new XtreamError(
        'The IPTV provider returned an unexpected reply. It may not be an Xtream Codes server.',
        'playlist-error',
        action,
      );
    }

    // Xtream signals bad credentials in-band with 200 OK.
    if (
      data &&
      typeof data === 'object' &&
      'user_info' in data &&
      (data as { user_info?: { auth?: number; status?: string } }).user_info?.auth === 0
    ) {
      throw new XtreamError(
        'Unable to authenticate with the IPTV provider. Check the server URL, username and password.',
        'auth-failed',
        action,
      );
    }

    return { data: data as T, ms: Date.now() - started };
  }

  /** No action = account + server info. Used as the auth probe. */
  authenticate() {
    return this.call<XtreamAuthResponse>(undefined);
  }

  liveCategories() {
    return this.call<XtreamCategory[]>('get_live_categories');
  }
  liveStreams() {
    return this.call<XtreamLiveStream[]>('get_live_streams');
  }
  vodCategories() {
    return this.call<XtreamCategory[]>('get_vod_categories', undefined, { optional: true });
  }
  vodStreams() {
    return this.call<XtreamVodStream[]>('get_vod_streams', undefined, { optional: true });
  }
  vodInfo(vodId: string) {
    return this.call<XtreamVodInfo>('get_vod_info', { vod_id: vodId }, { optional: true });
  }
  seriesCategories() {
    return this.call<XtreamCategory[]>('get_series_categories', undefined, { optional: true });
  }
  seriesList() {
    return this.call<XtreamSeries[]>('get_series', undefined, { optional: true });
  }
  seriesInfo(seriesId: string) {
    return this.call<XtreamSeriesInfo>('get_series_info', { series_id: seriesId }, { optional: true });
  }
  shortEpg(streamId: string, limit = 12) {
    return this.call<{ epg_listings: XtreamEpgListing[] }>(
      'get_short_epg',
      { stream_id: streamId, limit },
      { optional: true },
    );
  }

  /** Fetch the provider XMLTV feed as text. Can be very large. */
  async fetchXmltv(timeoutMs = 60_000): Promise<string> {
    try {
      const res = await http().fetch(this.epgUrl(), {
        timeoutMs,
        headers: { 'User-Agent': USER_AGENT },
        noStore: true,
      });
      if (!res.ok) throw new XtreamError(`EPG feed returned HTTP ${res.status}.`, 'unsupported-action', 'xmltv');
      return await res.text();
    } catch (err) {
      if (err instanceof XtreamError) throw err;
      throw new XtreamError('The provider EPG feed could not be downloaded.', 'unsupported-action', 'xmltv');
    }
  }
}

/* ---------------------------------------------------------------------------
 * Raw provider response shapes. These types exist ONLY inside the adapter
 * boundary — no UI component may import them.
 * ------------------------------------------------------------------------ */

export interface XtreamAuthResponse {
  user_info?: {
    auth?: number;
    status?: string;
    exp_date?: string | null;
    is_trial?: string;
    active_cons?: string | number;
    max_connections?: string | number;
  };
  server_info?: {
    url?: string;
    port?: string;
    https_port?: string;
    server_protocol?: string;
    timezone?: string;
  };
}

export interface XtreamCategory {
  category_id: string;
  category_name: string;
  parent_id?: number;
}

export interface XtreamLiveStream {
  num?: number;
  name: string;
  stream_id: number | string;
  stream_icon?: string;
  epg_channel_id?: string | null;
  category_id?: string | null;
  tv_archive?: number;
  tv_archive_duration?: number | string;
  added?: string;
}

export interface XtreamVodStream {
  num?: number;
  name: string;
  stream_id: number | string;
  stream_icon?: string;
  cover?: string;
  rating?: string | number;
  rating_5based?: number;
  category_id?: string | null;
  container_extension?: string;
  added?: string;
}

export interface XtreamVodInfo {
  info?: {
    movie_image?: string;
    backdrop_path?: string[];
    plot?: string;
    cast?: string;
    director?: string;
    genre?: string;
    releasedate?: string;
    release_date?: string;
    duration_secs?: number;
    rating?: string | number;
  };
  movie_data?: { stream_id?: number | string; name?: string; container_extension?: string };
}

export interface XtreamSeries {
  series_id: number | string;
  name: string;
  cover?: string;
  plot?: string;
  cast?: string;
  director?: string;
  genre?: string;
  releaseDate?: string;
  release_date?: string;
  rating?: string | number;
  category_id?: string | null;
  backdrop_path?: string[];
  last_modified?: string;
}

export interface XtreamSeriesInfo {
  info?: XtreamSeries;
  seasons?: Array<{ season_number?: number; name?: string; overview?: string; cover?: string }>;
  episodes?: Record<
    string,
    Array<{
      id: string | number;
      episode_num: number | string;
      title: string;
      container_extension?: string;
      season?: number;
      info?: { plot?: string; movie_image?: string; duration_secs?: number };
    }>
  >;
}

export interface XtreamEpgListing {
  id?: string;
  title?: string; // base64
  description?: string; // base64
  start?: string;
  end?: string;
  stop?: string;
  start_timestamp?: string | number;
  stop_timestamp?: string | number;
}
