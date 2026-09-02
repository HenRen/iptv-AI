import type { ConnectionStatus, Playlist } from '../types/index';
import { KEYS, crypto, secureStore, storage } from '../ports/index';
import { hostnameOf } from '../utils/url';

/**
 * Playlist registry.
 *
 * Two records per playlist, deliberately separated:
 *   - `playlists/<id>`  public metadata, safe to send to the browser
 *   - `secrets/<id>`    sealed credential envelope, never leaves the server
 */

export interface PlaylistSecret {
  kind: 'xtream' | 'm3u-url' | 'm3u-file' | 'mock';
  /** Xtream */
  host?: string;
  username?: string;
  password?: string;
  /** M3U URL */
  url?: string;
  /** Custom XMLTV URL, if the user configured one. */
  epgUrl?: string;
}

const EMPTY_STATS = { channels: 0, movies: 0, series: 0, categories: 0, epgPrograms: 0 };

export async function listPlaylists(): Promise<Playlist[]> {
  const store = storage();
  const index = (await store.getJSON<string[]>(KEYS.playlists)) ?? [];
  const out: Playlist[] = [];
  for (const id of index) {
    const p = await store.getJSON<Playlist>(KEYS.playlist(id));
    if (p) out.push(p);
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getPlaylist(id: string): Promise<Playlist | null> {
  return storage().getJSON<Playlist>(KEYS.playlist(id));
}

export async function getActivePlaylist(): Promise<Playlist | null> {
  const settings = await storage().getJSON<{ activePlaylistId?: string }>(KEYS.settings);
  if (settings?.activePlaylistId) {
    const p = await getPlaylist(settings.activePlaylistId);
    if (p) return p;
  }
  const all = await listPlaylists();
  return all[0] ?? null;
}

export async function setActivePlaylist(id: string): Promise<void> {
  const store = storage();
  const settings = (await store.getJSON<Record<string, unknown>>(KEYS.settings)) ?? {};
  await store.setJSON(KEYS.settings, { ...settings, activePlaylistId: id });
}

export async function createPlaylist(
  name: string,
  secret: PlaylistSecret,
): Promise<{ playlist: Playlist; id: string }> {
  const store = storage();
  const id = crypto().randomId();
  const host =
    secret.kind === 'xtream'
      ? hostnameOf(secret.host ?? '')
      : secret.kind === 'm3u-url'
        ? hostnameOf(secret.url ?? '')
        : null;

  const playlist: Playlist = {
    id,
    name: name.trim() || 'My Playlist',
    kind: secret.kind,
    host,
    status: 'connecting',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    stats: { ...EMPTY_STATS },
  };

  await store.setJSON(KEYS.playlist(id), playlist);
  await secureStore().write(id, secret);

  const index = (await store.getJSON<string[]>(KEYS.playlists)) ?? [];
  if (!index.includes(id)) index.push(id);
  await store.setJSON(KEYS.playlists, index);
  await setActivePlaylist(id);

  return { playlist, id };
}

export async function readSecret(id: string): Promise<PlaylistSecret | null> {
  return secureStore().read<PlaylistSecret>(id);
}

export async function updatePlaylist(
  id: string,
  patch: Partial<Omit<Playlist, 'id' | 'createdAt'>>,
): Promise<Playlist | null> {
  const store = storage();
  const current = await getPlaylist(id);
  if (!current) return null;
  const next: Playlist = { ...current, ...patch, id: current.id, updatedAt: Date.now() };
  await store.setJSON(KEYS.playlist(id), next);
  return next;
}

export async function setStatus(
  id: string,
  status: ConnectionStatus,
  lastError?: string,
): Promise<void> {
  await updatePlaylist(id, { status, lastError });
}

export async function deletePlaylist(id: string): Promise<void> {
  const store = storage();
  await store.delete(KEYS.playlist(id));
  await secureStore().delete(id);
  await store.delete(KEYS.catalog(id).replace(/\.json$/, ''));
  await store.delete(KEYS.epgOverrides(id));
  const index = (await store.getJSON<string[]>(KEYS.playlists)) ?? [];
  await store.setJSON(
    KEYS.playlists,
    index.filter((x) => x !== id),
  );
}

/** Every host the proxy is allowed to talk to, across all playlists. */
export async function allowedHosts(): Promise<Set<string>> {
  const hosts = new Set<string>();
  for (const p of await listPlaylists()) {
    if (p.host) hosts.add(p.host);
    const secret = await readSecret(p.id);
    if (!secret) continue;
    for (const candidate of [secret.host, secret.url, secret.epgUrl]) {
      const h = candidate ? hostnameOf(candidate) : null;
      if (h) hosts.add(h);
    }
  }
  return hosts;
}

/** Hosts belonging to one playlist — the tightest allowlist a request can use. */
export async function allowedHostsFor(id: string): Promise<Set<string>> {
  const hosts = new Set<string>();
  const p = await getPlaylist(id);
  if (p?.host) hosts.add(p.host);
  const secret = await readSecret(id);
  if (secret) {
    for (const candidate of [secret.host, secret.url, secret.epgUrl]) {
      const h = candidate ? hostnameOf(candidate) : null;
      if (h) hosts.add(h);
    }
  }
  return hosts;
}
