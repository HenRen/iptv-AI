import 'server-only';
import type { ConnectionStatus, Playlist } from '@/types';
import { getStorage, KEYS } from '@/lib/storage';
import { open, randomId, seal } from '@/lib/security/crypto';
import { hostnameOf } from '@/lib/security/urlGuard';

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
  const storage = getStorage();
  const index = (await storage.getJSON<string[]>(KEYS.playlists)) ?? [];
  const out: Playlist[] = [];
  for (const id of index) {
    const p = await storage.getJSON<Playlist>(KEYS.playlist(id));
    if (p) out.push(p);
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getPlaylist(id: string): Promise<Playlist | null> {
  return getStorage().getJSON<Playlist>(KEYS.playlist(id));
}

export async function getActivePlaylist(): Promise<Playlist | null> {
  const settings = await getStorage().getJSON<{ activePlaylistId?: string }>(KEYS.settings);
  if (settings?.activePlaylistId) {
    const p = await getPlaylist(settings.activePlaylistId);
    if (p) return p;
  }
  const all = await listPlaylists();
  return all[0] ?? null;
}

export async function setActivePlaylist(id: string): Promise<void> {
  const storage = getStorage();
  const settings = (await storage.getJSON<Record<string, unknown>>(KEYS.settings)) ?? {};
  await storage.setJSON(KEYS.settings, { ...settings, activePlaylistId: id });
}

export async function createPlaylist(
  name: string,
  secret: PlaylistSecret,
): Promise<{ playlist: Playlist; id: string }> {
  const storage = getStorage();
  const id = randomId();
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

  await storage.setJSON(KEYS.playlist(id), playlist);
  await storage.setJSON(KEYS.secret(id), { sealed: seal(JSON.stringify(secret)) });

  const index = (await storage.getJSON<string[]>(KEYS.playlists)) ?? [];
  if (!index.includes(id)) index.push(id);
  await storage.setJSON(KEYS.playlists, index);
  await setActivePlaylist(id);

  return { playlist, id };
}

export async function readSecret(id: string): Promise<PlaylistSecret | null> {
  const record = await getStorage().getJSON<{ sealed: string }>(KEYS.secret(id));
  if (!record?.sealed) return null;
  try {
    return JSON.parse(open(record.sealed)) as PlaylistSecret;
  } catch {
    return null;
  }
}

export async function updatePlaylist(
  id: string,
  patch: Partial<Omit<Playlist, 'id' | 'createdAt'>>,
): Promise<Playlist | null> {
  const storage = getStorage();
  const current = await getPlaylist(id);
  if (!current) return null;
  const next: Playlist = { ...current, ...patch, id: current.id, updatedAt: Date.now() };
  await storage.setJSON(KEYS.playlist(id), next);
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
  const storage = getStorage();
  await storage.delete(KEYS.playlist(id));
  await storage.delete(KEYS.secret(id));
  await storage.delete(KEYS.catalog(id).replace(/\.json$/, ''));
  await storage.delete(KEYS.epgOverrides(id));
  const index = (await storage.getJSON<string[]>(KEYS.playlists)) ?? [];
  await storage.setJSON(
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
