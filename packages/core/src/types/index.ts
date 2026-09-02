/**
 * Normalized internal domain model.
 *
 * NOTHING in the UI is allowed to depend on a raw Xtream / M3U / XMLTV
 * response shape. Provider payloads enter through an adapter in
 * `src/lib/iptv/<provider>/adapter.ts` and leave as the entities below.
 */

export type PlaylistKind = 'xtream' | 'm3u-url' | 'm3u-file' | 'mock';

export type ConnectionStatus =
  | 'connected'
  | 'connecting'
  | 'offline'
  | 'auth-failed'
  | 'playlist-error'
  | 'stream-error';

export type StreamKind = 'live' | 'movie' | 'episode';

/** Video container hint used to choose a playback engine. */
export type StreamContainer = 'hls' | 'mpegts' | 'mp4' | 'mkv' | 'unknown';

export interface Playlist {
  id: string;
  name: string;
  kind: PlaylistKind;
  /** Host shown in the UI. Never contains credentials. */
  host: string | null;
  status: ConnectionStatus;
  createdAt: number;
  updatedAt: number;
  /** Populated after a successful catalog fetch. */
  stats: CatalogStats;
  /** Provider account info, when the provider exposes it. */
  account?: AccountInfo;
  /** Optional custom XMLTV source configured by the user. */
  epgSource?: { kind: 'provider' | 'url' | 'file'; label: string };
  lastError?: string;
}

export interface AccountInfo {
  status?: string;
  expiresAt?: number | null;
  isTrial?: boolean;
  activeConnections?: number;
  maxConnections?: number;
  timezone?: string;
}

export interface CatalogStats {
  channels: number;
  movies: number;
  series: number;
  categories: number;
  epgPrograms: number;
}

export interface Category {
  id: string;
  name: string;
  kind: 'live' | 'movie' | 'series';
  count: number;
  /** Heuristic classification used for smart groups and parental control. */
  genre?: ContentGenre;
  adult?: boolean;
  hidden?: boolean;
}

export type ContentGenre =
  | 'sports'
  | 'news'
  | 'entertainment'
  | 'movies'
  | 'kids'
  | 'documentary'
  | 'music'
  | 'international'
  | 'religion'
  | 'adult'
  | 'other';

export type Quality = 'SD' | 'HD' | 'FHD' | '4K' | 'unknown';

export interface Channel {
  id: string;
  playlistId: string;
  /** Provider stream id (Xtream) or a stable hash (M3U). */
  streamId: string;
  /** Channel number as presented in the UI. */
  number: number;
  /** Cleaned display name: "ESPN 1", not "NL | ESPN 1 FHD VIP". */
  name: string;
  /** Original, untouched provider name. Kept for diagnostics + overrides. */
  rawName: string;
  logo: string | null;
  categoryId: string | null;
  categoryName: string | null;
  genre: ContentGenre;
  quality: Quality;
  country: string | null;
  language: string | null;
  tvgId: string | null;
  tvgName: string | null;
  /** Channels that are the same service at a different quality / backup. */
  familyKey: string;
  adult: boolean;
  container: StreamContainer;
  /** Direct URL only for M3U playlists that carry no credentials worth hiding.
   *  For Xtream this is always null — the client receives a proxied URL. */
  directUrl: string | null;
  catchup?: { enabled: boolean; days?: number; source?: string };
}

/** A group of Channels that resolve to the same real service. */
export interface ChannelFamily {
  key: string;
  name: string;
  logo: string | null;
  genre: ContentGenre;
  variants: Array<{ channelId: string; quality: Quality; label: string }>;
}

export interface Movie {
  id: string;
  playlistId: string;
  streamId: string;
  name: string;
  rawName: string;
  poster: string | null;
  backdrop: string | null;
  categoryId: string | null;
  categoryName: string | null;
  year: number | null;
  rating: number | null;
  durationSecs: number | null;
  genre: string | null;
  plot: string | null;
  cast: string | null;
  director: string | null;
  container: StreamContainer;
  containerExt: string | null;
  directUrl: string | null;
  addedAt: number | null;
  adult: boolean;
}

export interface Series {
  id: string;
  playlistId: string;
  seriesId: string;
  name: string;
  rawName: string;
  poster: string | null;
  backdrop: string | null;
  categoryId: string | null;
  categoryName: string | null;
  year: number | null;
  rating: number | null;
  genre: string | null;
  plot: string | null;
  cast: string | null;
  director: string | null;
  addedAt: number | null;
  adult: boolean;
  seasons?: Season[];
}

export interface Season {
  seasonNumber: number;
  name: string;
  overview: string | null;
  poster: string | null;
  episodes: Episode[];
}

export interface Episode {
  id: string;
  seriesId: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  plot: string | null;
  thumbnail: string | null;
  durationSecs: number | null;
  container: StreamContainer;
  containerExt: string | null;
  directUrl: string | null;
}

export interface EPGProgram {
  id: string;
  /** The EPG channel key (tvg-id or a normalized name). */
  channelKey: string;
  title: string;
  description: string | null;
  start: number; // epoch ms
  stop: number; // epoch ms
  category: string | null;
  episode: string | null;
  icon: string | null;
  rating: string | null;
}

/** Resolved "what is on this channel right now / next". */
export interface NowNext {
  now: EPGProgram | null;
  next: EPGProgram | null;
  /** 0..1 progress through the current programme. */
  progress: number;
}

export type FavoriteKind = 'channel' | 'movie' | 'series';

export interface Favorite {
  kind: FavoriteKind;
  id: string;
  addedAt: number;
}

export interface WatchHistoryEntry {
  kind: StreamKind;
  id: string;
  /** Denormalized so history survives a playlist refresh. */
  title: string;
  image: string | null;
  watchedAt: number;
}

export interface PlaybackProgress {
  /** `movie:<id>` or `episode:<id>` */
  key: string;
  contentId: string;
  seriesId?: string;
  episodeId?: string;
  positionSecs: number;
  durationSecs: number;
  updatedAt: number;
  completed: boolean;
}

/** What the client is handed in order to play something.
 *  For Xtream this always points at our own backend. */
export interface PlaybackSource {
  url: string;
  container: StreamContainer;
  /** True when `url` is one of our proxy routes. */
  proxied: boolean;
  kind: StreamKind;
  title: string;
  /** Alternative URL to try if the primary engine fails. */
  fallbackUrl?: string;
  fallbackContainer?: StreamContainer;
}

export interface DiagnosticsReport {
  generatedAt: number;
  playlistId: string;
  providerKind: PlaylistKind;
  status: ConnectionStatus;
  counts: CatalogStats;
  health: {
    channelsWithLogo: number;
    channelsWithEpg: number;
    uncategorized: number;
    duplicateFamilies: number;
    adultChannels: number;
    unsupportedContainers: number;
  };
  lastApi: { action: string; ok: boolean; ms: number; at: number } | null;
  lastRefreshAt: number | null;
  notes: string[];
}
