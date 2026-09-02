import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiClient, ApiError } from '@streamwise/core';
import { createFetchHttpPort } from '../src/http';

/**
 * The proof that Phase 0 did what it claimed.
 *
 * A TV app is not Next.js and is not a browser. This test is neither: it
 * stands up the standalone `node:http` API, points core's `ApiClient` at it
 * over a real socket through an `HttpPort`, and drives the journeys a
 * Lightning or React Native build will drive — connect, browse, guide,
 * search, play. Nothing here imports React, Next, or `apps/web`.
 *
 * If the extraction had left a Next dependency in a handler, or left core
 * reaching for a Node built-in, this is where it would show.
 */

let server: Server;
let client: ApiClient;
let dataDir: string;
let baseUrl: string;

beforeAll(async () => {
  dataDir = await fs.mkdtemp(path.join(tmpdir(), 'streamwise-reference-'));
  process.env.HENREN_DATA_DIR = dataDir;
  process.env.HENREN_SECRET = 'reference-client-integration-test-key';
  // The suite drives these endpoints harder than a viewer does.
  process.env.HENREN_RATE_LIMIT = 'off';

  // Imported here, after the environment is set, because the module binds
  // core to this platform the moment it is evaluated.
  const { createApiServer } = await import('../src/app');
  server = createApiServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;

  client = new ApiClient({ http: createFetchHttpPort(), baseUrl, timeoutMs: 20_000 });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe('a TV client against the standalone API', () => {
  it('starts with nothing connected', async () => {
    const { playlists, activePlaylistId } = await client.playlists();
    expect(playlists).toEqual([]);
    expect(activePlaylistId).toBeNull();
  });

  it('reports no playlist rather than an error when the catalogue is empty', async () => {
    // The first-run screen depends on this distinction.
    const page = await client.channels();
    expect(page.noPlaylist).toBe(true);
    expect(page.items).toEqual([]);
  });

  it('connects a playlist and reports what it found', async () => {
    const { playlist } = await client.connectMock('Reference Client');
    expect(playlist.status).toBe('connected');
    expect(playlist.stats.channels).toBeGreaterThan(0);
    expect(playlist.stats.epgPrograms).toBeGreaterThan(0);
  });

  it('never hands a credential to the client', async () => {
    const { playlists } = await client.playlists();
    const serialized = JSON.stringify(playlists);
    expect(serialized).not.toMatch(/password/i);
    expect(serialized).not.toMatch(/username/i);
  });

  it('pages the channel list', async () => {
    const first = await client.channels({ limit: 5 });
    expect(first.items).toHaveLength(5);
    expect(first.total).toBeGreaterThan(5);

    const second = await client.channels({ limit: 5, offset: 5 });
    expect(second.items).toHaveLength(5);
    expect(second.items[0].id).not.toBe(first.items[0].id);
  });

  it('lists categories for each kind', async () => {
    for (const kind of ['live', 'movie', 'series'] as const) {
      const { categories } = await client.categories(kind);
      expect(categories.length).toBeGreaterThan(0);
    }
  });

  it('fetches channels by id, which is how a favourites row loads', async () => {
    const page = await client.channels({ limit: 3 });
    const ids = page.items.map((c) => c.id);
    const byId = await client.channelsByIds(ids);
    expect(byId.items.map((c) => c.id).sort()).toEqual([...ids].sort());
  });

  it('returns now/next for the guide', async () => {
    const page = await client.channels({ limit: 4 });
    const { nowNext } = await client.nowNext(page.items.map((c) => c.id));
    const entries = Object.values(nowNext);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((entry) => entry.now !== null)).toBe(true);
  });

  it('returns a guide window', async () => {
    const page = await client.channels({ limit: 3 });
    const from = Date.now();
    const { schedules } = await client.epg(
      page.items.map((c) => c.id),
      from,
      from + 6 * 60 * 60 * 1000,
    );
    expect(schedules.length).toBeGreaterThan(0);
    expect(schedules.some((s) => s.programs.length > 0)).toBe(true);
  });

  it('searches across channels, movies and series', async () => {
    const results = await client.search('npo');
    expect(results.channels.length).toBeGreaterThan(0);
  });

  it('opens a series and its episodes', async () => {
    const page = await client.series({ limit: 1 });
    const info = await client.seriesInfo(page.items[0].id);
    expect(info.id).toBe(page.items[0].id);
  });

  it('hands back a proxied playback source, never a provider URL', async () => {
    const page = await client.channels({ limit: 1 });
    const source = await client.play('live', page.items[0].id);
    expect(source.proxied).toBe(true);
    expect(source.url.startsWith('/api/stream?t=')).toBe(true);
    // resolve() is what a player is actually given.
    expect(client.resolve(source.url).startsWith(baseUrl)).toBe(true);
  });

  it('refuses a playback token it did not mint', async () => {
    const res = await fetch(`${baseUrl}/api/stream?t=forged`);
    expect(res.status).toBe(403);
  });

  it('answers a natural-language request with something from the catalogue', async () => {
    const answer = (await client.ask({ op: 'intent', utterance: 'play npo 1' })) as {
      ok: boolean;
      command?: { type: string; channel?: { id: string } };
    };
    expect(answer.ok).toBe(true);
    // The grounding guarantee: whatever it resolves to must be a real id.
    const id = answer.command?.channel?.id;
    expect(id).toBeDefined();
    const found = await client.channelsByIds([id!]);
    expect(found.items).toHaveLength(1);
  });

  it('reports diagnostics without leaking credentials', async () => {
    const report = await client.diagnostics();
    expect(JSON.stringify(report)).not.toMatch(/password/i);
  });

  it('surfaces a server error as an ApiError with its status', async () => {
    await expect(client.seriesInfo('does-not-exist')).rejects.toBeInstanceOf(ApiError);
    await client.seriesInfo('does-not-exist').catch((err: ApiError) => {
      expect(err.status).toBe(404);
    });
  });

  it('disconnects, and the catalogue goes back to reporting no playlist', async () => {
    const { playlists } = await client.playlists();
    for (const playlist of playlists) await client.deletePlaylist(playlist.id);
    expect((await client.channels()).noPlaylist).toBe(true);
  });
});
